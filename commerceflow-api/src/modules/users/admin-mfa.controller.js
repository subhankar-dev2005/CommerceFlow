import crypto from "crypto";
import bcrypt from "bcryptjs";

import User from "./user.model.js";
import AdminMfaChallenge, {
  MFA_CHALLENGE_PURPOSES,
  MFA_CHALLENGE_STATES
} from "./admin-mfa-challenge.model.js";
import AppError from "../../common/errors/app-error.js";
import { ADMINISTRATIVE_ROLES } from "../../config/roles.js";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import generateToken from "../../utils/generate-token.js";
import { setAuthCookie, setRefreshCookie } from "../../config/cookie.js";
import { issueRefreshToken } from "./refresh-token.service.js";
import {
  generateTotpSecret,
  generateTotpUri,
  encryptMfaSecret,
  decryptMfaSecret,
  verifyTotpCode,
  generateRecoveryCodes,
  hashRecoveryCode
} from "../../utils/mfa-crypto.js";
import {
  recordAdminAuditEvent,
  AUDIT_EVENT_TYPES
} from "../audit/admin-audit.service.js";

/**
 * ============================================================================
 * Administrator Multi-Factor Authentication (MFA) Controller
 * ============================================================================
 *
 * Implements secure verification and enrollment endpoints for administrator MFA:
 * 1. POST /api/v1/users/admin/mfa/verify   - Verify TOTP code or recovery code
 * 2. POST /api/v1/users/admin/mfa/recovery - Dedicated recovery code redemption
 * 3. POST /api/v1/users/admin/mfa/setup    - Initiate MFA enrollment
 * 4. POST /api/v1/users/admin/mfa/activate - Confirm enrollment and activate MFA
 *
 * Core Security Invariants:
 * - Opaque challenge tokens: validated, SHA-256 hashed, and queried by challengeTokenHash.
 * - Atomic conditional claims: exactly one concurrent request transitions challenge from
 *   "pending" to "claimed". Rivals receive null.
 * - Fail-closed: database operations fail closed. No simulated challenges or bypassed writes.
 * - TOTP replay protection: atomically advances lastTotpStep only if strictly greater than
 *   the previous step. Replayed codes are rejected.
 * - Single-use recovery codes: atomically redeemed with redeemedAt timestamp.
 * - Guarded setup & activation: enrollment operations are strictly bound to account state.
 * - Session issuance: access/refresh cookies are ONLY minted upon successful completion of
 *   the MFA challenge.
 */

/**
 * Atomically claims an ephemeral challenge token from "pending" to "claimed".
 *
 * @param {string} challengeToken - Raw 64-hex opaque token
 * @param {string} expectedPurpose - "admin_mfa_login" or "admin_mfa_setup"
 * @returns {Promise<Object>} Claimed challenge document
 */
async function claimMfaChallenge(challengeToken, expectedPurpose) {
  if (typeof challengeToken !== "string" || !challengeToken.trim()) {
    throw new AppError(
      "Challenge token is required",
      401,
      [],
      "MFA_CHALLENGE_INVALID"
    );
  }

  const challengeTokenHash = crypto
    .createHash("sha256")
    .update(challengeToken.trim())
    .digest("hex");

  const now = new Date();

  const challenge = await AdminMfaChallenge.findOneAndUpdate(
    {
      challengeTokenHash,
      purpose: expectedPurpose,
      state: MFA_CHALLENGE_STATES.PENDING,
      attemptsCount: { $lt: 5 },
      expiresAt: { $gt: now }
    },
    {
      $inc: { attemptsCount: 1 },
      $set: {
        state: MFA_CHALLENGE_STATES.CLAIMED,
        claimedAt: now,
        lastAttemptAt: now
      }
    },
    { new: true }
  );

  if (!challenge) {
    throw new AppError(
      "Invalid or expired MFA challenge",
      401,
      [],
      "MFA_CHALLENGE_INVALID"
    );
  }

  return challenge;
}

/**
 * Transitions an in-flight claimed or pending challenge to terminal "failed" state when
 * administrator account validation fails (e.g. inactive, missing, revoked tokenVersion).
 * Avoids overwriting concurrently completed or already terminated challenges.
 *
 * @param {Object} challenge - Challenge record
 */
async function terminateChallengeOnValidationFailure(challenge) {
  if (!challenge || !challenge._id) return;
  try {
    await AdminMfaChallenge.findOneAndUpdate(
      {
        _id: challenge._id,
        state: {
          $in: [MFA_CHALLENGE_STATES.CLAIMED, MFA_CHALLENGE_STATES.PENDING]
        }
      },
      {
        $set: { state: MFA_CHALLENGE_STATES.FAILED }
      }
    );
  } catch (cleanupErr) {
    logger.error(
      {
        err: cleanupErr,
        challengeId: challenge._id,
        userId: challenge.userId
      },
      "Failed to transition challenge to failed state during validation cleanup"
    );
  }
}

/**
 * Handles failed verification attempts by locking exhausted challenges or releasing back to "pending".
 * Guards against overwriting concurrently completed or already transitioned challenges.
 *
 * @param {Object} challenge - In-flight challenge document
 */
async function recordFailedAttempt(challenge) {
  if (!challenge || !challenge._id) return;

  const nextState =
    challenge.attemptsCount >= challenge.maxAttempts
      ? MFA_CHALLENGE_STATES.FAILED
      : MFA_CHALLENGE_STATES.PENDING;

  try {
    await AdminMfaChallenge.findOneAndUpdate(
      {
        _id: challenge._id,
        state: MFA_CHALLENGE_STATES.CLAIMED
      },
      {
        $set: { state: nextState }
      }
    );
  } catch (err) {
    logger.error(
      { err, challengeId: challenge._id },
      "Failed to record failed MFA attempt in database"
    );
  }
}

/**
 * Atomically marks a challenge as completed upon successful credential verification.
 * Only transitions challenges in "claimed" state; throws if challenge cannot be completed.
 *
 * @param {string|import("mongoose").Types.ObjectId} challengeId
 */
async function completeMfaChallenge(challengeId) {
  const completed = await AdminMfaChallenge.findOneAndUpdate(
    {
      _id: challengeId,
      state: MFA_CHALLENGE_STATES.CLAIMED
    },
    {
      $set: {
        state: MFA_CHALLENGE_STATES.COMPLETED,
        completedAt: new Date()
      }
    },
    { new: true }
  );

  if (!completed) {
    throw new AppError(
      "MFA challenge cannot be completed",
      401,
      [],
      "MFA_CHALLENGE_INVALID"
    );
  }
}

/**
 * Safely records an administrator MFA login failure audit event without
 * interrupting error handling or exposing sensitive credentials.
 *
 * @param {Object} params
 * @param {import("express").Request} params.req
 * @param {Object} params.user
 * @param {string} [params.method] - "totp" or "recovery_code"
 * @param {string} params.reason - Standardized failure reason
 */
async function recordMfaLoginFailureAudit({ req, user, method, reason }) {
  if (!user || !user._id) return;
  try {
    await recordAdminAuditEvent({
      eventType: AUDIT_EVENT_TYPES.ADMIN_MFA_LOGIN_FAILED,
      req,
      actor: {
        _id: user._id,
        email: user.email,
        role: user.role
      },
      target: {
        _id: user._id,
        email: user.email,
        role: user.role
      },
      resourceType: "admin_user",
      resourceId: user._id.toString(),
      metadata: {
        ...(method ? { method } : {}),
        reason
      }
    });
  } catch (auditErr) {
    logger.error(
      { err: auditErr, userId: user._id, reason },
      "Failed to record audit event for MFA login failure"
    );
  }
}

/**
 * Validates the bound administrator's account state and token version.
 *
 * @param {Object} user - User document from database
 * @param {Object} challenge - Claimed challenge record
 */
function validateAdminUser(user, challenge) {
  if (!user) {
    throw new AppError("User no longer exists", 401, [], "USER_NOT_FOUND");
  }

  if (user.isActive === false) {
    throw new AppError(
      "User account is deactivated",
      401,
      [],
      "ACCOUNT_DEACTIVATED"
    );
  }

  if (!ADMINISTRATIVE_ROLES.includes(user.role)) {
    throw new AppError(
      "Invalid email or password",
      401,
      [],
      "INVALID_CREDENTIALS"
    );
  }

  const userVersion = user.tokenVersion ?? 0;
  const challengeVersion = challenge.tokenVersion ?? 0;
  if (userVersion !== challengeVersion) {
    throw new AppError(
      "Authentication credentials have been revoked",
      401,
      [],
      "AUTH_TOKEN_REVOKED"
    );
  }
}

/**
 * Issues access JWT and refresh token cookies for authenticated administrator session.
 *
 * @param {import("express").Response} res
 * @param {Object} user
 */
async function issueAdminSession(res, user) {
  const tokenPayload = {
    userId: user._id.toString(),
    email: user.email,
    role: user.role
  };
  if (user.tokenVersion) {
    tokenPayload.tokenVersion = user.tokenVersion;
  }

  const token = generateToken(tokenPayload);
  setAuthCookie(res, token);

  const { plaintextToken } = await issueRefreshToken({
    userId: user._id,
    audience: "admin",
    tokenVersion: user.tokenVersion ?? 0
  });
  setRefreshCookie(res, plaintextToken);
}

/**
 * POST /api/v1/users/admin/mfa/verify
 *
 * Verifies an MFA login challenge using either a 6-digit TOTP code or a Crockford Base32 recovery code.
 */
export async function verifyAdminMfa(req, res, next) {
  let challenge = null;
  try {
    const { challengeToken, totpCode, recoveryCode } = req.body;

    // 1. Atomically claim the login challenge
    challenge = await claimMfaChallenge(
      challengeToken,
      MFA_CHALLENGE_PURPOSES.ADMIN_MFA_LOGIN
    );

    // 2. Load administrator with private MFA secret fields
    const user = await User.findById(challenge.userId).select(
      "+twoFactorSecret +lastTotpStep +twoFactorRecoveryCodes"
    );
    try {
      validateAdminUser(user, challenge);
    } catch (valErr) {
      await terminateChallengeOnValidationFailure(challenge);
      await recordMfaLoginFailureAudit({
        req,
        user,
        reason: valErr.code || "VALIDATION_FAILED"
      });
      throw valErr;
    }

    if (user.twoFactorEnabled !== true) {
      await terminateChallengeOnValidationFailure(challenge);
      await recordMfaLoginFailureAudit({
        req,
        user,
        reason: "MFA_NOT_ENABLED"
      });
      throw new AppError(
        "MFA is not enabled for this account",
        401,
        [],
        "MFA_NOT_ENABLED"
      );
    }

    let updatedUser = null;

    // 3A. Verify via TOTP Code
    if (totpCode) {
      if (!user.twoFactorSecret) {
        await recordFailedAttempt(challenge);
        await recordMfaLoginFailureAudit({
          req,
          user,
          method: "totp",
          reason: "MFA_SECRET_MISSING"
        });
        throw new AppError(
          "MFA secret is missing",
          401,
          [],
          "MFA_SECRET_MISSING"
        );
      }

      let secret;
      try {
        secret = decryptMfaSecret(user.twoFactorSecret, env.MFA_ENCRYPTION_KEY);
      } catch {
        await recordFailedAttempt(challenge);
        await recordMfaLoginFailureAudit({
          req,
          user,
          method: "totp",
          reason: "MFA_DECRYPTION_FAILED"
        });
        throw new AppError(
          "MFA secret decryption failed",
          401,
          [],
          "INVALID_MFA_CODE"
        );
      }

      const { isValid, matchedStep } = verifyTotpCode(totpCode, secret, {
        stepSeconds: 30,
        window: 1
      });

      if (!isValid || matchedStep === null) {
        await recordFailedAttempt(challenge);
        const isLocked = challenge.attemptsCount >= challenge.maxAttempts;
        await recordMfaLoginFailureAudit({
          req,
          user,
          method: "totp",
          reason: isLocked ? "MFA_CHALLENGE_LOCKED" : "INVALID_TOTP_CODE"
        });
        if (isLocked) {
          throw new AppError(
            "Maximum verification attempts exceeded. Please restart login.",
            401,
            [],
            "MFA_CHALLENGE_LOCKED"
          );
        }
        throw new AppError(
          "Invalid verification code",
          401,
          [],
          "INVALID_MFA_CODE"
        );
      }

      // Replay prevention: atomically advance lastTotpStep strictly forward
      updatedUser = await User.findOneAndUpdate(
        {
          _id: user._id,
          isActive: true,
          role: { $in: ADMINISTRATIVE_ROLES },
          tokenVersion: challenge.tokenVersion ?? 0,
          $or: [
            { lastTotpStep: { $lt: matchedStep } },
            { lastTotpStep: { $exists: false } },
            { lastTotpStep: null }
          ]
        },
        {
          $set: { lastTotpStep: matchedStep }
        },
        { new: true }
      );

      if (!updatedUser) {
        await recordFailedAttempt(challenge);
        await recordMfaLoginFailureAudit({
          req,
          user,
          method: "totp",
          reason: "REPLAYED_TOTP_CODE"
        });
        throw new AppError(
          "Invalid or replayed verification code",
          401,
          [],
          "INVALID_MFA_CODE"
        );
      }
    }
    // 3B. Verify via Recovery Code
    else if (recoveryCode) {
      let codeHash;
      try {
        codeHash = hashRecoveryCode(recoveryCode);
      } catch {
        await recordFailedAttempt(challenge);
        await recordMfaLoginFailureAudit({
          req,
          user,
          method: "recovery_code",
          reason: "INVALID_RECOVERY_CODE_FORMAT"
        });
        throw new AppError(
          "Invalid recovery code format",
          401,
          [],
          "INVALID_MFA_CODE"
        );
      }

      updatedUser = await User.findOneAndUpdate(
        {
          _id: user._id,
          isActive: true,
          role: { $in: ADMINISTRATIVE_ROLES },
          tokenVersion: challenge.tokenVersion ?? 0,
          twoFactorRecoveryCodes: {
            $elemMatch: {
              codeHash,
              redeemedAt: null
            }
          }
        },
        {
          $set: {
            "twoFactorRecoveryCodes.$.redeemedAt": new Date()
          }
        },
        { new: true }
      );

      if (!updatedUser) {
        await recordFailedAttempt(challenge);
        const isLocked = challenge.attemptsCount >= challenge.maxAttempts;
        await recordMfaLoginFailureAudit({
          req,
          user,
          method: "recovery_code",
          reason: isLocked ? "MFA_CHALLENGE_LOCKED" : "INVALID_OR_REDEEMED_RECOVERY_CODE"
        });
        if (isLocked) {
          throw new AppError(
            "Maximum verification attempts exceeded. Please restart login.",
            401,
            [],
            "MFA_CHALLENGE_LOCKED"
          );
        }
        throw new AppError(
          "Invalid or already redeemed recovery code",
          401,
          [],
          "INVALID_MFA_CODE"
        );
      }
    } else {
      await recordFailedAttempt(challenge);
      await recordMfaLoginFailureAudit({
        req,
        user,
        reason: "MFA_CODE_REQUIRED"
      });
      throw new AppError(
        "Verification code or recovery code is required",
        400,
        [],
        "MFA_CODE_REQUIRED"
      );
    }

    // 4. Mark challenge completed — throws if challenge cannot be transitioned from claimed
    await completeMfaChallenge(challenge._id);

    // 5. Issue authenticated session
    await issueAdminSession(res, updatedUser);

    // 6. Record audit event
    await recordAdminAuditEvent({
      eventType: AUDIT_EVENT_TYPES.ADMIN_MFA_LOGIN_SUCCESS,
      req,
      actor: {
        _id: updatedUser._id,
        email: updatedUser.email,
        role: updatedUser.role
      },
      target: {
        _id: updatedUser._id,
        email: updatedUser.email,
        role: updatedUser.role
      },
      resourceType: "admin_user",
      resourceId: updatedUser._id.toString(),
      metadata: {
        method: totpCode ? "totp" : "recovery_code"
      }
    }).catch((auditErr) => {
      logger.error(
        { err: auditErr, userId: updatedUser._id },
        "Failed to record audit event for MFA login success"
      );
    });

    return res.status(200).json({
      success: true,
      message: totpCode
        ? "Admin authenticated successfully"
        : "Admin authenticated successfully via recovery code",
      data: {
        user: {
          id: updatedUser._id,
          name: updatedUser.name,
          email: updatedUser.email,
          role: updatedUser.role,
          createdAt: updatedUser.createdAt,
          updatedAt: updatedUser.updatedAt
        }
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/users/admin/mfa/recovery
 *
 * Dedicated endpoint for recovery code redemption.
 */
export async function verifyAdminMfaRecovery(req, res, next) {
  try {
    const { challengeToken, recoveryCode } = req.body;
    req.body.totpCode = undefined;
    req.body.recoveryCode = recoveryCode;
    return verifyAdminMfa(req, res, next);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/users/admin/mfa/setup
 *
 * Initiates MFA enrollment for an unenrolled administrator.
 * Generates and encrypts a TOTP secret and stores it strictly in pending fields
 * via a guarded atomic update bound to current account state.
 */
export async function setupAdminMfa(req, res, next) {
  try {
    const challengeToken = req.body?.challengeToken;
    let user = null;
    let tokenVersion = 0;
    let challenge = null;

    if (challengeToken) {
      const challengeTokenHash = crypto
        .createHash("sha256")
        .update(challengeToken.trim())
        .digest("hex");

      const now = new Date();

      challenge = await AdminMfaChallenge.findOne({
        challengeTokenHash,
        purpose: MFA_CHALLENGE_PURPOSES.ADMIN_MFA_SETUP,
        state: MFA_CHALLENGE_STATES.PENDING,
        expiresAt: { $gt: now }
      });

      if (!challenge) {
        throw new AppError(
          "Invalid or expired MFA setup challenge",
          401,
          [],
          "MFA_CHALLENGE_INVALID"
        );
      }

      user = await User.findById(challenge.userId);
      try {
        validateAdminUser(user, challenge);
      } catch (valErr) {
        await terminateChallengeOnValidationFailure(challenge);
        throw valErr;
      }
      tokenVersion = challenge.tokenVersion ?? 0;
    } else if (req.user) {
      user = await User.findById(req.user._id);
      if (!user) {
        throw new AppError("User not found", 404, [], "USER_NOT_FOUND");
      }
      if (user.isActive === false) {
        throw new AppError("User account is deactivated", 401, [], "ACCOUNT_DEACTIVATED");
      }
      if (!ADMINISTRATIVE_ROLES.includes(user.role)) {
        throw new AppError("Forbidden", 403, [], "FORBIDDEN");
      }
      const expectedTokenVersion = req.user.tokenVersion ?? 0;
      if ((user.tokenVersion ?? 0) !== expectedTokenVersion) {
        throw new AppError("Authentication token has been revoked", 401, [], "AUTH_TOKEN_REVOKED");
      }
      tokenVersion = expectedTokenVersion;
    } else {
      throw new AppError(
        "Challenge token or authenticated session is required",
        401,
        [],
        "MFA_CHALLENGE_INVALID"
      );
    }

    if (user.twoFactorEnabled === true) {
      if (challenge) {
        await terminateChallengeOnValidationFailure(challenge);
      }
      throw new AppError(
        "MFA is already enabled for this account",
        400,
        [],
        "MFA_ALREADY_ENABLED"
      );
    }

    // Generate cryptographic TOTP secret
    const plaintextSecret = generateTotpSecret();
    const otpauthUri = generateTotpUri({
      secret: plaintextSecret,
      accountName: user.email,
      issuer: "CommerceFlow"
    });

    const encryptedSecret = encryptMfaSecret(
      plaintextSecret,
      env.MFA_ENCRYPTION_KEY
    );
    const pendingExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Guarded atomic update bound to account state
    const updatedUser = await User.findOneAndUpdate(
      {
        _id: user._id,
        isActive: true,
        role: { $in: ADMINISTRATIVE_ROLES },
        tokenVersion,
        twoFactorEnabled: false
      },
      {
        $set: {
          twoFactorPendingSecret: encryptedSecret,
          twoFactorPendingExpiresAt: pendingExpiresAt
        }
      },
      { new: true }
    );

    if (!updatedUser) {
      throw new AppError(
        "MFA setup conflict or account state invalid",
        400,
        [],
        "MFA_SETUP_CONFLICT"
      );
    }

    return res.status(200).json({
      success: true,
      message: "MFA setup initiated successfully",
      data: {
        secret: plaintextSecret,
        otpauthUri,
        expiresInSeconds: 600
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/users/admin/mfa/activate
 *
 * Verifies initial TOTP code against pending secret, promotes to active secret,
 * generates backup recovery codes, completes challenge, and issues session.
 */
export async function activateAdminMfa(req, res, next) {
  let challenge = null;
  try {
    const { challengeToken, totpCode } = req.body;
    let user = null;
    let tokenVersion = 0;

    if (challengeToken) {
      // 1. Atomically claim setup challenge
      challenge = await claimMfaChallenge(
        challengeToken,
        MFA_CHALLENGE_PURPOSES.ADMIN_MFA_SETUP
      );

      // 2. Load user with pending secrets
      user = await User.findById(challenge.userId).select(
        "+twoFactorPendingSecret +twoFactorPendingExpiresAt +twoFactorSecret +lastTotpStep +twoFactorRecoveryCodes"
      );
      try {
        validateAdminUser(user, challenge);
      } catch (valErr) {
        await terminateChallengeOnValidationFailure(challenge);
        throw valErr;
      }
      tokenVersion = challenge.tokenVersion ?? 0;
    } else if (req.user) {
      user = await User.findById(req.user._id).select(
        "+twoFactorPendingSecret +twoFactorPendingExpiresAt +twoFactorSecret +lastTotpStep +twoFactorRecoveryCodes"
      );
      if (!user) {
        throw new AppError("User not found", 404, [], "USER_NOT_FOUND");
      }
      if (user.isActive === false) {
        throw new AppError("User account is deactivated", 401, [], "ACCOUNT_DEACTIVATED");
      }
      if (!ADMINISTRATIVE_ROLES.includes(user.role)) {
        throw new AppError("Forbidden", 403, [], "FORBIDDEN");
      }
      const expectedTokenVersion = req.user.tokenVersion ?? 0;
      if ((user.tokenVersion ?? 0) !== expectedTokenVersion) {
        throw new AppError("Authentication token has been revoked", 401, [], "AUTH_TOKEN_REVOKED");
      }
      tokenVersion = expectedTokenVersion;
    } else {
      throw new AppError(
        "Challenge token or authenticated session is required",
        401,
        [],
        "MFA_CHALLENGE_INVALID"
      );
    }

    if (user.twoFactorEnabled === true) {
      if (challenge) {
        await terminateChallengeOnValidationFailure(challenge);
      }
      throw new AppError(
        "MFA is already enabled for this account",
        400,
        [],
        "MFA_ALREADY_ENABLED"
      );
    }

    if (!user.twoFactorPendingSecret || !user.twoFactorPendingExpiresAt) {
      if (challenge) {
        await recordFailedAttempt(challenge);
      }
      throw new AppError(
        "MFA setup has not been initiated or has expired",
        400,
        [],
        "MFA_SETUP_REQUIRED"
      );
    }

    if (new Date(user.twoFactorPendingExpiresAt).getTime() <= Date.now()) {
      if (challenge) {
        await recordFailedAttempt(challenge);
      }
      throw new AppError(
        "MFA setup session has expired. Please initiate setup again.",
        400,
        [],
        "MFA_SETUP_EXPIRED"
      );
    }

    // 3. Decrypt pending secret
    let pendingSecret;
    try {
      pendingSecret = decryptMfaSecret(
        user.twoFactorPendingSecret,
        env.MFA_ENCRYPTION_KEY
      );
    } catch {
      if (challenge) {
        await recordFailedAttempt(challenge);
      }
      throw new AppError(
        "MFA activation failed",
        400,
        [],
        "MFA_ACTIVATION_FAILED"
      );
    }

    // 4. Verify TOTP code against pending secret
    const { isValid, matchedStep } = verifyTotpCode(totpCode, pendingSecret, {
      stepSeconds: 30,
      window: 1
    });

    if (!isValid || matchedStep === null) {
      if (challenge) {
        await recordFailedAttempt(challenge);
        if (challenge.attemptsCount >= challenge.maxAttempts) {
          throw new AppError(
            "Maximum verification attempts exceeded. Please restart login.",
            401,
            [],
            "MFA_CHALLENGE_LOCKED"
          );
        }
      }
      throw new AppError(
        "Invalid verification code",
        401,
        [],
        "INVALID_MFA_CODE"
      );
    }

    // 5. Generate 8 high-entropy backup recovery codes
    const rawRecoveryCodes = generateRecoveryCodes(8, 16);
    const twoFactorRecoveryCodes = rawRecoveryCodes.map((code) => ({
      codeHash: hashRecoveryCode(code),
      redeemedAt: null,
      createdAt: new Date()
    }));

    // 6. Atomically promote pending secret to active secret
    const updatedUser = await User.findOneAndUpdate(
      {
        _id: user._id,
        isActive: true,
        role: { $in: ADMINISTRATIVE_ROLES },
        tokenVersion,
        twoFactorEnabled: false,
        twoFactorPendingSecret: { $ne: null },
        twoFactorPendingExpiresAt: { $gt: new Date() }
      },
      {
        $set: {
          twoFactorEnabled: true,
          twoFactorSecret: user.twoFactorPendingSecret,
          twoFactorEnrolledAt: new Date(),
          lastTotpStep: matchedStep,
          twoFactorRecoveryCodes,
          twoFactorPendingSecret: null,
          twoFactorPendingExpiresAt: null
        }
      },
      { new: true }
    );

    if (!updatedUser) {
      if (challenge) {
        await recordFailedAttempt(challenge);
      }
      throw new AppError(
        "MFA activation conflict or revoked session",
        400,
        [],
        "MFA_ACTIVATION_CONFLICT"
      );
    }

    // 7. Mark challenge completed — throws if challenge cannot be transitioned from claimed
    if (challenge) {
      await completeMfaChallenge(challenge._id);
    }

    // 8. Issue authenticated session
    await issueAdminSession(res, updatedUser);

    // 9. Record audit event
    await recordAdminAuditEvent({
      eventType: AUDIT_EVENT_TYPES.ADMIN_MFA_ENROLLED,
      req,
      actor: {
        _id: updatedUser._id,
        email: updatedUser.email,
        role: updatedUser.role
      },
      target: {
        _id: updatedUser._id,
        email: updatedUser.email,
        role: updatedUser.role
      },
      resourceType: "admin_user",
      resourceId: updatedUser._id.toString(),
      metadata: {
        method: "totp",
        recoveryCodesCount: 8
      }
    }).catch((auditErr) => {
      logger.error(
        { err: auditErr, userId: updatedUser._id },
        "Failed to record audit event for MFA enrollment"
      );
    });

    return res.status(200).json({
      success: true,
      message: "Administrator MFA activated successfully",
      data: {
        user: {
          id: updatedUser._id,
          name: updatedUser.name,
          email: updatedUser.email,
          role: updatedUser.role,
          twoFactorEnabled: true,
          createdAt: updatedUser.createdAt,
          updatedAt: updatedUser.updatedAt
        },
        recoveryCodes: rawRecoveryCodes
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/users/admin/mfa/recovery/regenerate
 *
 * Regenerates administrator MFA backup recovery codes.
 * Requires:
 * 1. Authenticated administrator session (authMiddleware + authorize(ROLES.ADMIN)).
 * 2. Re-authentication via current password (bcrypt.compare).
 * 3. Step-up factor: valid 6-digit TOTP code (RFC 6238, strictly forward monotonic step advance)
 *    OR an unredeemed existing recovery code.
 * 4. Atomic compare-and-set replacement of twoFactorRecoveryCodes with 8 newly generated SHA-256 hashes.
 * 5. Returns plaintext recovery codes exactly once in response body.
 * 6. Audit logging with secret redaction.
 */
export async function regenerateAdminMfaRecoveryCodes(req, res, next) {
  try {
    const { password, totpCode, recoveryCode } = req.body;

    // 1. Fetch user with sensitive security fields
    const user = await User.findById(req.user._id).select(
      "+password +twoFactorSecret +lastTotpStep +twoFactorRecoveryCodes"
    );

    if (!user) {
      throw new AppError("User not found", 404, [], "USER_NOT_FOUND");
    }

    if (user.isActive === false) {
      throw new AppError("User account is deactivated", 401, [], "ACCOUNT_DEACTIVATED");
    }

    if (!ADMINISTRATIVE_ROLES.includes(user.role)) {
      throw new AppError("Forbidden", 403, [], "FORBIDDEN");
    }

    const expectedTokenVersion = req.user.tokenVersion ?? 0;
    if ((user.tokenVersion ?? 0) !== expectedTokenVersion) {
      throw new AppError("Authentication token has been revoked", 401, [], "AUTH_TOKEN_REVOKED");
    }

    if (user.twoFactorEnabled !== true || !user.twoFactorSecret) {
      throw new AppError("MFA is not enabled for this account", 400, [], "MFA_NOT_ENABLED");
    }

    // 2. Verify current password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      await recordAdminAuditEvent({
        eventType: AUDIT_EVENT_TYPES.ADMIN_MFA_RECOVERY_CODES_REGENERATION_FAILED,
        req,
        metadata: { reason: "INVALID_CURRENT_PASSWORD" }
      }).catch(() => {});
      throw new AppError("Current password is incorrect", 401, [], "INVALID_CURRENT_PASSWORD");
    }

    let matchedStep = null;
    let updateFilter = null;
    let updateDoc = null;

    // 3A. Step-Up Verification via TOTP Code
    if (totpCode) {
      let secret;
      try {
        secret = decryptMfaSecret(user.twoFactorSecret, env.MFA_ENCRYPTION_KEY);
      } catch {
        await recordAdminAuditEvent({
          eventType: AUDIT_EVENT_TYPES.ADMIN_MFA_RECOVERY_CODES_REGENERATION_FAILED,
          req,
          metadata: { reason: "MFA_DECRYPTION_FAILED" }
        }).catch(() => {});
        throw new AppError("MFA secret decryption failed", 401, [], "INVALID_MFA_CODE");
      }

      const { isValid, matchedStep: step } = verifyTotpCode(totpCode, secret, {
        stepSeconds: 30,
        window: 1
      });

      if (!isValid || step === null) {
        await recordAdminAuditEvent({
          eventType: AUDIT_EVENT_TYPES.ADMIN_MFA_RECOVERY_CODES_REGENERATION_FAILED,
          req,
          metadata: { reason: "INVALID_TOTP_CODE" }
        }).catch(() => {});
        throw new AppError("Invalid verification code", 401, [], "INVALID_MFA_CODE");
      }

      if (user.lastTotpStep !== undefined && user.lastTotpStep !== null && step <= user.lastTotpStep) {
        await recordAdminAuditEvent({
          eventType: AUDIT_EVENT_TYPES.ADMIN_MFA_RECOVERY_CODES_REGENERATION_FAILED,
          req,
          metadata: { reason: "REPLAYED_TOTP_CODE" }
        }).catch(() => {});
        throw new AppError("Invalid or replayed verification code", 401, [], "INVALID_MFA_CODE");
      }

      matchedStep = step;

      updateFilter = {
        _id: user._id,
        isActive: true,
        role: { $in: ADMINISTRATIVE_ROLES },
        tokenVersion: expectedTokenVersion,
        twoFactorEnabled: true,
        $or: [
          { lastTotpStep: { $lt: matchedStep } },
          { lastTotpStep: { $exists: false } },
          { lastTotpStep: null }
        ]
      };
    }
    // 3B. Step-Up Verification via Existing Recovery Code
    else if (recoveryCode) {
      let codeHash;
      try {
        codeHash = hashRecoveryCode(recoveryCode);
      } catch {
        await recordAdminAuditEvent({
          eventType: AUDIT_EVENT_TYPES.ADMIN_MFA_RECOVERY_CODES_REGENERATION_FAILED,
          req,
          metadata: { reason: "INVALID_RECOVERY_CODE_FORMAT" }
        }).catch(() => {});
        throw new AppError("Invalid recovery code format", 401, [], "INVALID_MFA_CODE");
      }

      const existingValid = user.twoFactorRecoveryCodes?.some(
        (c) => c.codeHash === codeHash && c.redeemedAt === null
      );

      if (!existingValid) {
        await recordAdminAuditEvent({
          eventType: AUDIT_EVENT_TYPES.ADMIN_MFA_RECOVERY_CODES_REGENERATION_FAILED,
          req,
          metadata: { reason: "INVALID_OR_REDEEMED_RECOVERY_CODE" }
        }).catch(() => {});
        throw new AppError("Invalid or already redeemed recovery code", 401, [], "INVALID_MFA_CODE");
      }

      updateFilter = {
        _id: user._id,
        isActive: true,
        role: { $in: ADMINISTRATIVE_ROLES },
        tokenVersion: expectedTokenVersion,
        twoFactorEnabled: true,
        twoFactorRecoveryCodes: {
          $elemMatch: {
            codeHash,
            redeemedAt: null
          }
        }
      };
    } else {
      throw new AppError("Must provide either totpCode or recoveryCode", 400, [], "MFA_CODE_REQUIRED");
    }

    // 4. Generate 8 high-entropy replacement codes
    const rawRecoveryCodes = generateRecoveryCodes(8, 16);
    const newTwoFactorRecoveryCodes = rawRecoveryCodes.map((code) => ({
      codeHash: hashRecoveryCode(code),
      redeemedAt: null,
      createdAt: new Date()
    }));

    updateDoc = {
      $set: {
        twoFactorRecoveryCodes: newTwoFactorRecoveryCodes,
        ...(matchedStep !== null ? { lastTotpStep: matchedStep } : {})
      }
    };

    // 5. Execute atomic conditional replacement
    const updatedUser = await User.findOneAndUpdate(updateFilter, updateDoc, { new: true });

    if (!updatedUser) {
      await recordAdminAuditEvent({
        eventType: AUDIT_EVENT_TYPES.ADMIN_MFA_RECOVERY_CODES_REGENERATION_FAILED,
        req,
        metadata: { reason: "ROTATION_CONFLICT_OR_CONCURRENT_UPDATE" }
      }).catch(() => {});
      throw new AppError(
        "MFA recovery-code regeneration conflict or state changed. Please retry.",
        409,
        [],
        "MFA_ROTATION_CONFLICT"
      );
    }

    // 6. Record audit event
    await recordAdminAuditEvent({
      eventType: AUDIT_EVENT_TYPES.ADMIN_MFA_RECOVERY_CODES_REGENERATED,
      req,
      target: {
        _id: updatedUser._id,
        email: updatedUser.email,
        role: updatedUser.role
      },
      resourceType: "admin_user",
      resourceId: updatedUser._id.toString(),
      metadata: {
        method: totpCode ? "totp" : "recovery_code",
        codesCount: 8
      }
    }).catch((auditErr) => {
      logger.error({ err: auditErr, userId: updatedUser._id }, "Failed to record audit event for recovery code regeneration");
    });

    // 7. Return plaintext codes exactly once
    return res.status(200).json({
      success: true,
      message: "MFA recovery codes regenerated successfully. Please save these codes immediately.",
      data: {
        recoveryCodes: rawRecoveryCodes
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/users/admin/mfa/disable
 *
 * Disables administrator MFA.
 * Requires:
 * 1. Authenticated administrator session (authMiddleware + authorize(ADMINISTRATIVE_ROLES)).
 * 2. CSRF protection (csrfMiddleware).
 * 3. Re-authentication via current password (bcrypt.compare).
 * 4. Step-up factor: valid 6-digit TOTP code (RFC 6238, strictly forward monotonic step advance)
 *    OR an unredeemed existing recovery code.
 * 5. Atomic conditional update resetting twoFactorEnabled: false, clearing secrets & recovery codes.
 * 6. Revocation of existing sessions by incrementing tokenVersion ($inc: { tokenVersion: 1 }),
 *    and re-issuing session cookies for current administrator session.
 * 7. Centralized administrative audit logging with secret redaction.
 */
export async function disableAdminMfa(req, res, next) {
  try {
    const { password, totpCode, recoveryCode } = req.body;

    // 1. Fetch user with sensitive security fields
    const user = await User.findById(req.user._id).select(
      "+password +twoFactorSecret +lastTotpStep +twoFactorRecoveryCodes"
    );

    if (!user) {
      throw new AppError("User not found", 404, [], "USER_NOT_FOUND");
    }

    if (user.isActive === false) {
      throw new AppError("User account is deactivated", 401, [], "ACCOUNT_DEACTIVATED");
    }

    if (!ADMINISTRATIVE_ROLES.includes(user.role)) {
      throw new AppError("Forbidden", 403, [], "FORBIDDEN");
    }

    const expectedTokenVersion = req.user.tokenVersion ?? 0;
    if ((user.tokenVersion ?? 0) !== expectedTokenVersion) {
      throw new AppError("Authentication token has been revoked", 401, [], "AUTH_TOKEN_REVOKED");
    }

    if (user.twoFactorEnabled !== true || !user.twoFactorSecret) {
      throw new AppError("MFA is not enabled for this account", 400, [], "MFA_NOT_ENABLED");
    }

    // 2. Verify current password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      await recordAdminAuditEvent({
        eventType: AUDIT_EVENT_TYPES.ADMIN_MFA_DISABLE_FAILED,
        req,
        target: {
          _id: user._id,
          email: user.email,
          role: user.role
        },
        resourceType: "admin_user",
        resourceId: user._id.toString(),
        metadata: { reason: "INVALID_CURRENT_PASSWORD" }
      }).catch(() => {});
      throw new AppError("Current password is incorrect", 401, [], "INVALID_CURRENT_PASSWORD");
    }

    let matchedStep = null;
    let codeHash = null;
    let updateFilter = null;

    // 3A. Step-Up Verification via TOTP Code
    if (totpCode) {
      let secret;
      try {
        secret = decryptMfaSecret(user.twoFactorSecret, env.MFA_ENCRYPTION_KEY);
      } catch {
        await recordAdminAuditEvent({
          eventType: AUDIT_EVENT_TYPES.ADMIN_MFA_DISABLE_FAILED,
          req,
          target: {
            _id: user._id,
            email: user.email,
            role: user.role
          },
          resourceType: "admin_user",
          resourceId: user._id.toString(),
          metadata: { reason: "MFA_DECRYPTION_FAILED" }
        }).catch(() => {});
        throw new AppError("MFA secret decryption failed", 401, [], "INVALID_MFA_CODE");
      }

      const { isValid, matchedStep: step } = verifyTotpCode(totpCode, secret, {
        stepSeconds: 30,
        window: 1
      });

      if (!isValid || step === null) {
        await recordAdminAuditEvent({
          eventType: AUDIT_EVENT_TYPES.ADMIN_MFA_DISABLE_FAILED,
          req,
          target: {
            _id: user._id,
            email: user.email,
            role: user.role
          },
          resourceType: "admin_user",
          resourceId: user._id.toString(),
          metadata: { reason: "INVALID_TOTP_CODE" }
        }).catch(() => {});
        throw new AppError("Invalid verification code", 401, [], "INVALID_MFA_CODE");
      }

      if (user.lastTotpStep !== undefined && user.lastTotpStep !== null && step <= user.lastTotpStep) {
        await recordAdminAuditEvent({
          eventType: AUDIT_EVENT_TYPES.ADMIN_MFA_DISABLE_FAILED,
          req,
          target: {
            _id: user._id,
            email: user.email,
            role: user.role
          },
          resourceType: "admin_user",
          resourceId: user._id.toString(),
          metadata: { reason: "REPLAYED_TOTP_CODE" }
        }).catch(() => {});
        throw new AppError("Invalid or replayed verification code", 401, [], "INVALID_MFA_CODE");
      }

      matchedStep = step;

      updateFilter = {
        _id: user._id,
        isActive: true,
        role: { $in: ADMINISTRATIVE_ROLES },
        tokenVersion: expectedTokenVersion,
        twoFactorEnabled: true,
        $or: [
          { lastTotpStep: { $lt: matchedStep } },
          { lastTotpStep: { $exists: false } },
          { lastTotpStep: null }
        ]
      };
    }
    // 3B. Step-Up Verification via Existing Recovery Code
    else if (recoveryCode) {
      try {
        codeHash = hashRecoveryCode(recoveryCode);
      } catch {
        await recordAdminAuditEvent({
          eventType: AUDIT_EVENT_TYPES.ADMIN_MFA_DISABLE_FAILED,
          req,
          target: {
            _id: user._id,
            email: user.email,
            role: user.role
          },
          resourceType: "admin_user",
          resourceId: user._id.toString(),
          metadata: { reason: "INVALID_RECOVERY_CODE_FORMAT" }
        }).catch(() => {});
        throw new AppError("Invalid recovery code format", 401, [], "INVALID_MFA_CODE");
      }

      const existingValid = user.twoFactorRecoveryCodes?.some(
        (c) => c.codeHash === codeHash && c.redeemedAt === null
      );

      if (!existingValid) {
        await recordAdminAuditEvent({
          eventType: AUDIT_EVENT_TYPES.ADMIN_MFA_DISABLE_FAILED,
          req,
          target: {
            _id: user._id,
            email: user.email,
            role: user.role
          },
          resourceType: "admin_user",
          resourceId: user._id.toString(),
          metadata: { reason: "INVALID_OR_REDEEMED_RECOVERY_CODE" }
        }).catch(() => {});
        throw new AppError("Invalid or already redeemed recovery code", 401, [], "INVALID_MFA_CODE");
      }

      updateFilter = {
        _id: user._id,
        isActive: true,
        role: { $in: ADMINISTRATIVE_ROLES },
        tokenVersion: expectedTokenVersion,
        twoFactorEnabled: true,
        twoFactorRecoveryCodes: {
          $elemMatch: {
            codeHash,
            redeemedAt: null
          }
        }
      };
    } else {
      throw new AppError("Must provide either totpCode or recoveryCode", 400, [], "MFA_CODE_REQUIRED");
    }

    // 4. Atomically disable MFA, clear secret & recovery codes, increment tokenVersion
    const updateDoc = {
      $set: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorRecoveryCodes: [],
        twoFactorPendingSecret: null,
        twoFactorPendingExpiresAt: null,
        lastTotpStep: null,
        twoFactorEnrolledAt: null
      },
      $inc: { tokenVersion: 1 }
    };

    const updatedUser = await User.findOneAndUpdate(updateFilter, updateDoc, { new: true });

    if (!updatedUser) {
      await recordAdminAuditEvent({
        eventType: AUDIT_EVENT_TYPES.ADMIN_MFA_DISABLE_FAILED,
        req,
        target: {
          _id: user._id,
          email: user.email,
          role: user.role
        },
        resourceType: "admin_user",
        resourceId: user._id.toString(),
        metadata: { reason: "CONCURRENT_UPDATE_CONFLICT" }
      }).catch(() => {});
      throw new AppError(
        "MFA disable conflict or state changed. Please retry.",
        409,
        [],
        "MFA_DISABLE_CONFLICT"
      );
    }

    // 5. Invalidate existing sessions on other devices and issue fresh session cookies for current admin
    await issueAdminSession(res, updatedUser);

    // 6. Record audit event
    await recordAdminAuditEvent({
      eventType: AUDIT_EVENT_TYPES.ADMIN_MFA_DISABLED,
      req,
      actor: {
        _id: updatedUser._id,
        email: updatedUser.email,
        role: updatedUser.role
      },
      target: {
        _id: updatedUser._id,
        email: updatedUser.email,
        role: updatedUser.role
      },
      resourceType: "admin_user",
      resourceId: updatedUser._id.toString(),
      metadata: {
        method: totpCode ? "totp" : "recovery_code"
      }
    }).catch((auditErr) => {
      logger.error({ err: auditErr, userId: updatedUser._id }, "Failed to record audit event for MFA disable");
    });

    // 7. Return success response
    return res.status(200).json({
      success: true,
      message: "Two-step verification has been successfully disabled.",
      data: {
        user: {
          id: updatedUser._id,
          name: updatedUser.name,
          email: updatedUser.email,
          role: updatedUser.role,
          twoFactorEnabled: false,
          createdAt: updatedUser.createdAt,
          updatedAt: updatedUser.updatedAt
        }
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

