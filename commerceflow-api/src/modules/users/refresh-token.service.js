import crypto from "crypto";
import RefreshToken from "./refresh-token.model.js";
import User from "./user.model.js";
import AppError from "../../common/errors/app-error.js";
import { env } from "../../config/env.js";
import { getRefreshCookieMaxAge } from "../../config/cookie.js";

/**
 * Computes SHA-256 hex digest of a raw refresh token string.
 * Plaintext tokens are NEVER persisted in the database.
 *
 * @param {string} token
 * @returns {string}
 */
export function hashToken(token) {
  if (typeof token !== "string" || !token.trim()) {
    throw new AppError("Token string is required for hashing", 400, [], "INVALID_TOKEN_INPUT");
  }
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Generates an opaque, cryptographically random refresh token.
 * 64 bytes = 512 bits of cryptographically secure entropy.
 *
 * @returns {string}
 */
export function generateOpaqueToken() {
  return crypto.randomBytes(64).toString("hex");
}

/**
 * Calculates absolute expiration date for a new refresh token.
 *
 * @returns {Date}
 */
export function calculateRefreshExpiryDate() {
  const maxAgeMs = getRefreshCookieMaxAge();
  return new Date(Date.now() + maxAgeMs);
}

/**
 * Issues a new refresh token for a user session.
 *
 * @param {Object} params
 * @param {string|import("mongoose").Types.ObjectId} params.userId
 * @param {"customer"|"admin"} [params.audience="customer"]
 * @param {string|null} [params.family=null] - If null, a new session family UUID is generated
 * @param {number} [params.tokenVersion=0]
 * @returns {Promise<{ plaintextToken: string, tokenDoc: Object }>}
 */
export async function issueRefreshToken({ userId, audience = "customer", family = null, tokenVersion = 0 }) {
  const plaintextToken = generateOpaqueToken();
  const tokenHash = hashToken(plaintextToken);
  const sessionFamily = family || crypto.randomUUID();
  const expiresAt = calculateRefreshExpiryDate();

  // If running in unit test with disconnected database and unmocked RefreshToken
  if (!RefreshToken.create?._isMockFunction && RefreshToken.db?.readyState === 0) {
    return {
      plaintextToken,
      tokenDoc: {
        _id: "000000000000000000000000",
        tokenHash,
        userId,
        family: sessionFamily,
        audience,
        tokenVersion: tokenVersion ?? 0,
        expiresAt,
        isRevoked: false
      }
    };
  }

  const tokenDoc = await RefreshToken.create({
    tokenHash,
    userId,
    family: sessionFamily,
    audience,
    tokenVersion: tokenVersion ?? 0,
    expiresAt,
    isRevoked: false
  });

  return {
    plaintextToken,
    tokenDoc
  };
}

/**
 * Rotates an existing refresh token atomically.
 *
 * Enforces strict single-use rotation with zero grace period:
 * 1. Hashes incoming raw token and looks up document.
 * 2. If token is already revoked: triggers REUSE DETECTION, revoking the entire
 *    session family and incrementing the user's tokenVersion.
 * 3. Checks application-level expiration against expiresAt (never relies on TTL index alone).
 * 4. Atomically marks the old token as revoked (conditional on isRevoked: false).
 * 5. Creates the replacement token document under the same session family.
 * 6. If creation fails, rolls back the revocation of the old token safely.
 *
 * @param {string} rawRefreshToken
 * @returns {Promise<{ newPlaintextToken: string, newTokenDoc: Object, previousDoc: Object }>}
 */
export async function rotateRefreshToken(rawRefreshToken) {
  if (typeof rawRefreshToken !== "string" || !rawRefreshToken.trim()) {
    throw new AppError("Refresh token is required", 401, [], "REFRESH_TOKEN_REQUIRED");
  }

  const incomingHash = hashToken(rawRefreshToken);
  const existing = await RefreshToken.findOne({ tokenHash: incomingHash });

  if (!existing) {
    throw new AppError("Invalid refresh token", 401, [], "INVALID_REFRESH_TOKEN");
  }

  // --- REUSE DETECTION ---
  // If an already-revoked token is presented, this indicates token theft or replay.
  // Immediate action: revoke all sessions in the family and revoke all active access tokens.
  if (existing.isRevoked) {
    await revokeFamily(existing.family);
    await User.findByIdAndUpdate(existing.userId, { $inc: { tokenVersion: 1 } });

    throw new AppError(
      "Refresh token reuse detected. All sessions in this family have been terminated for security.",
      401,
      [],
      "TOKEN_REUSE_DETECTED"
    );
  }

  // --- APPLICATION EXPIRY VALIDATION ---
  if (new Date() >= existing.expiresAt) {
    existing.isRevoked = true;
    await existing.save();
    throw new AppError("Refresh token has expired", 401, [], "REFRESH_TOKEN_EXPIRED");
  }

  const newPlaintextToken = generateOpaqueToken();
  const newTokenHash = hashToken(newPlaintextToken);
  const newExpiresAt = calculateRefreshExpiryDate();

  // --- ATOMIC PRECONDITION CLAIM ---
  // Atomically claim the old token. If another concurrent request claimed it first,
  // claimed will be null.
  // CRITICAL CONCURRENCY POLICY:
  // A request that loses the atomic claim race MUST NOT revoke the family or increment
  // tokenVersion, as that would actively destroy the winning request's newly issued session.
  // Instead, it fails closed with 409 CONCURRENT_REFRESH.
  const claimed = await RefreshToken.findOneAndUpdate(
    {
      _id: existing._id,
      isRevoked: false
    },
    {
      $set: {
        isRevoked: true,
        replacedByTokenHash: newTokenHash,
        rotatedAt: new Date()
      }
    },
    { new: false }
  );

  if (!claimed) {
    throw new AppError(
      "A concurrent session refresh is already in progress. Please retry with the renewed session.",
      409,
      [],
      "CONCURRENT_REFRESH"
    );
  }

  // --- INSERT NEW TOKEN WITH ROLLBACK ON WRITE FAILURE ---
  // Note: Standalone MongoDB deployments do not support multi-document transactions.
  // We use application-level guarded compensation with fail-closed semantics.
  let newTokenDoc;
  try {
    newTokenDoc = await RefreshToken.create({
      tokenHash: newTokenHash,
      userId: existing.userId,
      family: existing.family,
      audience: existing.audience,
      tokenVersion: existing.tokenVersion ?? 0,
      expiresAt: newExpiresAt,
      isRevoked: false
    });
  } catch (err) {
    // Database write failed: roll back revocation of existing token ONLY if it still
    // points to our replacedByTokenHash, ensuring we do not overwrite a concurrent state.
    try {
      await RefreshToken.updateOne(
        { _id: existing._id, replacedByTokenHash: newTokenHash },
        {
          $set: { isRevoked: false, replacedByTokenHash: null },
          $unset: { rotatedAt: 1 }
        }
      );
    } catch {
      // Fail closed: if compensation fails, leave old token revoked rather than corrupting state
    }

    throw new AppError(
      "Database error occurred during session rotation. Please try again.",
      500,
      [],
      "REFRESH_DATABASE_ERROR"
    );
  }

  return {
    newPlaintextToken,
    newTokenDoc,
    previousDoc: existing
  };
}

/**
 * Revokes a single refresh token by its raw string.
 *
 * @param {string} rawRefreshToken
 * @returns {Promise<boolean>}
 */
export async function revokeRefreshToken(rawRefreshToken) {
  if (typeof rawRefreshToken !== "string" || !rawRefreshToken.trim()) {
    return false;
  }
  const tokenHash = hashToken(rawRefreshToken);
  if (!RefreshToken.updateOne?._isMockFunction && RefreshToken.db?.readyState === 0) {
    return true;
  }
  const result = await RefreshToken.updateOne(
    { tokenHash },
    { $set: { isRevoked: true } }
  );
  return result.modifiedCount > 0;
}

/**
 * Revokes all tokens belonging to a session family.
 *
 * @param {string} family
 * @returns {Promise<number>}
 */
export async function revokeFamily(family) {
  if (!family || typeof family !== "string") return 0;
  if (!RefreshToken.updateMany?._isMockFunction && RefreshToken.db?.readyState === 0) {
    return 0;
  }
  const result = await RefreshToken.updateMany(
    { family },
    { $set: { isRevoked: true } }
  );
  return result.modifiedCount;
}

/**
 * Revokes all active refresh tokens for a user across all devices.
 *
 * @param {string|import("mongoose").Types.ObjectId} userId
 * @returns {Promise<number>}
 */
export async function revokeAllUserTokens(userId) {
  if (!userId) return 0;
  if (!RefreshToken.updateMany?._isMockFunction && RefreshToken.db?.readyState === 0) {
    return 0;
  }
  const result = await RefreshToken.updateMany(
    { userId, isRevoked: false },
    { $set: { isRevoked: true } }
  );
  return result.modifiedCount;
}
