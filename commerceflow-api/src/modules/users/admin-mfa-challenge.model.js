import mongoose from "mongoose";

/**
 * ============================================================================
 * Administrator Multi-Factor Authentication (MFA) Challenge Model
 * ============================================================================
 *
 * Implements ephemeral, durable, single-use MFA challenge records for administrative
 * step-up authentication and initial enrollment.
 *
 * Security Model & Invariants:
 * 1. Secret Minimization: Only the SHA-256 digest of the opaque challenge token
 *    is persisted (`challengeTokenHash`). Plaintext tokens, TOTP secrets, recovery
 *    codes, and session cookies are NEVER stored in this model.
 * 2. Atomic-Claim Contract:
 *    The service layer claims a challenge using a single conditional database mutation:
 *      Filter: {
 *        challengeTokenHash: <hash>,
 *        state: "pending",
 *        attemptsCount: { $lt: maxAttempts },
 *        expiresAt: { $gt: new Date() }
 *      }
 *      Update: {
 *        $inc: { attemptsCount: 1 },
 *        $set: { state: "claimed", claimedAt: new Date(), lastAttemptAt: new Date() }
 *      }
 *    MongoDB document write locks guarantee that exactly ONE concurrent request
 *    transitions state from "pending" to "claimed". Rivals receive null.
 * 3. Fail-Closed Stale Claim Handling:
 *    If an in-flight verification process crashes or drops connection while in
 *    "claimed" state, the challenge remains locked and cannot issue a session.
 *    The administrator must restart authentication via email and password.
 * 4. Hard Lockout:
 *    When `attemptsCount` reaches `maxAttempts` (default 5), the challenge transitions
 *    permanently to "failed" and cannot be verified further.
 * 5. Lifecycle Expiration:
 *    `expiresAt` is indexed with `expireAfterSeconds: 0` for background MongoDB TTL cleanup.
 *    Application logic strictly validates `expiresAt > now` on every lookup.
 */

/**
 * Supported administrative MFA challenge purposes:
 * - admin_mfa_login: Step-up authentication verification for enrolled administrators.
 * - admin_mfa_setup: Mandatory MFA enrollment challenge for unenrolled administrators.
 */
export const MFA_CHALLENGE_PURPOSES = Object.freeze({
  ADMIN_MFA_LOGIN: "admin_mfa_login",
  ADMIN_MFA_SETUP: "admin_mfa_setup"
});

export const ALL_MFA_CHALLENGE_PURPOSES = Object.values(
  MFA_CHALLENGE_PURPOSES
);

/**
 * MFA challenge lifecycle states:
 * - pending: Issued and awaiting client verification attempt.
 * - claimed: A verification attempt is in-flight (mutex lock).
 * - completed: Successfully verified and final session cookies issued (terminal).
 * - failed: Exhausted max attempts (terminal).
 */
export const MFA_CHALLENGE_STATES = Object.freeze({
  PENDING: "pending",
  CLAIMED: "claimed",
  COMPLETED: "completed",
  FAILED: "failed"
});

export const ALL_MFA_CHALLENGE_STATES = Object.values(MFA_CHALLENGE_STATES);

export const CHALLENGE_TOKEN_HASH_REGEX = /^[0-9a-fA-F]{64}$/;

const adminMfaChallengeSchema = new mongoose.Schema(
  {
    challengeTokenHash: {
      type: String,
      required: [true, "challengeTokenHash is required"],
      trim: true,
      validate: {
        validator: function (val) {
          return CHALLENGE_TOKEN_HASH_REGEX.test(val);
        },
        message: "challengeTokenHash must be a 64-character hex SHA-256 digest"
      }
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "userId is required"]
    },

    purpose: {
      type: String,
      required: [true, "purpose is required"],
      enum: {
        values: ALL_MFA_CHALLENGE_PURPOSES,
        message: "Invalid MFA challenge purpose"
      }
    },

    tokenVersion: {
      type: Number,
      required: [true, "tokenVersion is required"],
      min: [0, "tokenVersion must be non-negative"],
      validate: {
        validator: Number.isInteger,
        message: "tokenVersion must be an integer"
      }
    },

    state: {
      type: String,
      required: [true, "state is required"],
      enum: {
        values: ALL_MFA_CHALLENGE_STATES,
        message: "Invalid MFA challenge state"
      },
      default: MFA_CHALLENGE_STATES.PENDING
    },

    attemptsCount: {
      type: Number,
      required: [true, "attemptsCount is required"],
      default: 0,
      min: [0, "attemptsCount must be non-negative"],
      validate: {
        validator: Number.isInteger,
        message: "attemptsCount must be an integer"
      }
    },

    maxAttempts: {
      type: Number,
      required: [true, "maxAttempts is required"],
      default: 5,
      min: [1, "maxAttempts must be at least 1"],
      validate: {
        validator: Number.isInteger,
        message: "maxAttempts must be an integer"
      }
    },

    expiresAt: {
      type: Date,
      required: [true, "expiresAt is required"]
    },

    ip: {
      type: String,
      trim: true,
      maxlength: [45, "ip address exceeds maximum length of 45 characters"],
      default: null
    },

    userAgent: {
      type: String,
      trim: true,
      maxlength: [500, "userAgent exceeds maximum length of 500 characters"],
      default: null
    },

    claimedAt: {
      type: Date,
      default: null
    },

    lastAttemptAt: {
      type: Date,
      default: null
    },

    completedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Unique index on challengeTokenHash
adminMfaChallengeSchema.index({ challengeTokenHash: 1 }, { unique: true });

// Compound index for user challenges lookup and state filtering
adminMfaChallengeSchema.index({ userId: 1, state: 1 });

// TTL index for automated MongoDB cleanup of expired challenge documents
adminMfaChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const AdminMfaChallenge = mongoose.model(
  "AdminMfaChallenge",
  adminMfaChallengeSchema,
  "admin_mfa_challenges"
);

export default AdminMfaChallenge;

