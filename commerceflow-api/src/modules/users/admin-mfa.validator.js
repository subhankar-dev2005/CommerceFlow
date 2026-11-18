import { z } from "zod";

/**
 * ============================================================================
 * Administrator Multi-Factor Authentication (MFA) Request Validators
 * ============================================================================
 *
 * Implements strict Zod request-validation schemas for administrative MFA endpoints:
 * 1. Challenge verification (TOTP step-up and recovery-code redemption)
 * 2. Setup initiation
 * 3. Enrollment confirmation / activation
 *
 * Security Invariants:
 * - Mutually exclusive verification: accepts either totpCode OR recoveryCode, never both.
 * - Strict object boundaries: `.strict()` rejects unexpected or client-injected
 *   fields (e.g. userId, role, tokenVersion, encryptedSecret, recoveryCodeHashes).
 * - Opaque token boundary: challengeToken must be a 64-character hex string.
 * - TOTP boundary: totpCode must be exactly 6 decimal digits.
 * - Recovery code boundary: Crockford Base32 alphabet (min 16 chars), optional hyphens.
 * - Generic error messages: Never leak credential existence, user role, or secret data.
 */

/**
 * Crockford Base32 alphabet for human-readable recovery codes.
 * Excludes ambiguous characters (0, O, 1, I, L) to avoid transcription errors.
 * Matches mfa-crypto.js CROCKFORD_ALPHABET.
 */
const CROCKFORD_BASE32_REGEX = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{16,}$/i;

/**
 * Exactly 64-character hexadecimal string for opaque challenge tokens.
 */
const CHALLENGE_TOKEN_REGEX = /^[0-9a-fA-F]{64}$/;

/**
 * Exactly 6 decimal digits for RFC 6238 TOTP codes.
 */
const TOTP_CODE_REGEX = /^\d{6}$/;

/**
 * Base challenge token schema.
 * Rejects empty strings, non-string types, and tokens of invalid length.
 */
export const challengeTokenSchema = z
  .string({
    required_error: "Challenge token is required",
    invalid_type_error: "Challenge token must be a string"
  })
  .trim()
  .regex(CHALLENGE_TOKEN_REGEX, "Invalid challenge token format");

/**
 * Base 6-digit TOTP code schema.
 */
export const totpCodeSchema = z
  .string({
    required_error: "TOTP code is required",
    invalid_type_error: "TOTP code must be a string"
  })
  .trim()
  .regex(TOTP_CODE_REGEX, "TOTP code must be exactly 6 digits");

/**
 * Base recovery code schema.
 * Normalizes input by trimming, validates against Crockford Base32 alphabet and minimum length (16 chars).
 * Strips formatting hyphens/spaces during validation refinement without mutating invalid codes into valid ones.
 */
export const recoveryCodeSchema = z
  .string({
    required_error: "Recovery code is required",
    invalid_type_error: "Recovery code must be a string"
  })
  .trim()
  .min(16, "Recovery code must be at least 16 characters")
  .max(32, "Recovery code cannot exceed 32 characters")
  .refine(
    (val) => {
      const stripped = val.replace(/[\s-]+/g, "");
      return CROCKFORD_BASE32_REGEX.test(stripped);
    },
    { message: "Invalid recovery code format" }
  );

/**
 * Schema for verifying TOTP step-up authentication.
 * Mutually exclusive: accepts challengeToken and totpCode.
 * Rejects unknown fields and client-supplied identity/security fields.
 */
export const verifyAdminMfaTotpSchema = z.object({
  body: z
    .object({
      challengeToken: challengeTokenSchema,
      totpCode: totpCodeSchema
    })
    .strict(),
  query: z.object({}).optional(),
  params: z.object({}).optional()
});

/**
 * Schema for redeeming a backup recovery code.
 * Mutually exclusive: accepts challengeToken and recoveryCode.
 * Rejects unknown fields.
 */
export const verifyAdminMfaRecoverySchema = z.object({
  body: z
    .object({
      challengeToken: challengeTokenSchema,
      recoveryCode: recoveryCodeSchema
    })
    .strict(),
  query: z.object({}).optional(),
  params: z.object({}).optional()
});

/**
 * Composite verification schema supporting mutually exclusive TOTP or Recovery Code.
 * Enforces that either totpCode OR recoveryCode is provided, but never both and never neither.
 * Strictly rejects unexpected properties (userId, role, tokenVersion, etc.).
 */
export const verifyAdminMfaSchema = z.object({
  body: z
    .object({
      challengeToken: challengeTokenSchema,
      totpCode: totpCodeSchema.optional(),
      recoveryCode: recoveryCodeSchema.optional()
    })
    .strict()
    .refine(
      (data) => {
        const hasTotp = Boolean(data.totpCode);
        const hasRecovery = Boolean(data.recoveryCode);
        return (hasTotp || hasRecovery) && !(hasTotp && hasRecovery);
      },
      {
        message: "Must provide either totpCode or recoveryCode, but not both",
        path: ["totpCode"]
      }
    ),
  query: z.object({}).optional(),
  params: z.object({}).optional()
});

/**
 * Schema for initiating MFA setup.
 * Accepts only challengeToken.
 * Rejects any client-supplied secret, user ID, role, or recovery code hashes.
 */
export const setupAdminMfaSchema = z.object({
  body: z
    .object({
      challengeToken: challengeTokenSchema.optional()
    })
    .strict(),
  query: z.object({}).optional(),
  params: z.object({}).optional()
});

/**
 * Schema for confirming/activating MFA enrollment.
 * Accepts optional challengeToken (or uses active authenticated session) and the initial 6-digit TOTP code.
 * Strictly rejects any client-supplied user ID, role, token version, encrypted secret, or recovery codes.
 */
export const activateAdminMfaSchema = z.object({
  body: z
    .object({
      challengeToken: challengeTokenSchema.optional(),
      totpCode: totpCodeSchema
    })
    .strict(),
  query: z.object({}).optional(),
  params: z.object({}).optional()
});

/**
 * Base password schema for re-authentication.
 */
export const passwordSchema = z
  .string({
    required_error: "Password is required",
    invalid_type_error: "Password must be a string"
  })
  .min(1, "Password is required");

/**
 * Schema for disabling administrator MFA.
 * Requires administrator's current password AND exactly one second factor (totpCode OR recoveryCode).
 * Strictly rejects unexpected fields, client-injected identity/role fields, or providing both/neither second factors.
 */
export const disableAdminMfaSchema = z.object({
  body: z
    .object({
      password: passwordSchema,
      totpCode: totpCodeSchema.optional(),
      recoveryCode: recoveryCodeSchema.optional()
    })
    .strict()
    .refine(
      (data) => {
        const hasTotp = Boolean(data.totpCode);
        const hasRecovery = Boolean(data.recoveryCode);
        return (hasTotp || hasRecovery) && !(hasTotp && hasRecovery);
      },
      {
        message: "Must provide either totpCode or recoveryCode, but not both",
        path: ["totpCode"]
      }
    ),
  query: z.object({}).optional(),
  params: z.object({}).optional()
});

/**
 * Schema for regenerating administrator MFA backup recovery codes.
 * Requires administrator's fresh password AND exactly one second factor (totpCode OR recoveryCode).
 * Strictly rejects unexpected fields, client-injected identity/role fields, or providing both/neither second factors.
 */
export const regenerateAdminMfaRecoverySchema = z.object({
  body: z
    .object({
      password: passwordSchema,
      totpCode: totpCodeSchema.optional(),
      recoveryCode: recoveryCodeSchema.optional()
    })
    .strict()
    .refine(
      (data) => {
        const hasTotp = Boolean(data.totpCode);
        const hasRecovery = Boolean(data.recoveryCode);
        return (hasTotp || hasRecovery) && !(hasTotp && hasRecovery);
      },
      {
        message: "Must provide either totpCode or recoveryCode, but not both",
        path: ["totpCode"]
      }
    ),
  query: z.object({}).optional(),
  params: z.object({}).optional()
});


