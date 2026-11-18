import { describe, it, expect } from "vitest";
import {
  challengeTokenSchema,
  totpCodeSchema,
  recoveryCodeSchema,
  verifyAdminMfaTotpSchema,
  verifyAdminMfaRecoverySchema,
  verifyAdminMfaSchema,
  setupAdminMfaSchema,
  activateAdminMfaSchema,
  disableAdminMfaSchema
} from "./admin-mfa.validator.js";

describe("Admin MFA Request Validators", () => {
  const validChallengeToken =
    "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";
  const validTotpCode = "123456";
  const validFormattedRecoveryCode = "2345-6789-ABCD-EFGH"; // 16 Crockford Base32 chars formatted
  const validRawRecoveryCode = "23456789ABCDEFGH"; // 16 Crockford Base32 chars raw

  describe("1. Base Component Schemas", () => {
    describe("challengeTokenSchema", () => {
      it("accepts valid 64-character hex strings", () => {
        const result = challengeTokenSchema.safeParse(validChallengeToken);
        expect(result.success).toBe(true);
        expect(result.data).toBe(validChallengeToken);
      });

      it("trims whitespace from valid challenge tokens", () => {
        const result = challengeTokenSchema.safeParse(
          `  ${validChallengeToken}  `
        );
        expect(result.success).toBe(true);
        expect(result.data).toBe(validChallengeToken);
      });

      it("rejects tokens with invalid length or non-hex characters", () => {
        // 63 characters
        expect(challengeTokenSchema.safeParse("a".repeat(63)).success).toBe(
          false
        );
        // 65 characters
        expect(challengeTokenSchema.safeParse("a".repeat(65)).success).toBe(
          false
        );
        // non-hex character 'Z'
        expect(
          challengeTokenSchema.safeParse(`Z${"a".repeat(63)}`).success
        ).toBe(false);
        // empty string
        expect(challengeTokenSchema.safeParse("").success).toBe(false);
        // non-string
        expect(challengeTokenSchema.safeParse(12345).success).toBe(false);
      });
    });

    describe("totpCodeSchema", () => {
      it("accepts exactly 6 decimal digits", () => {
        expect(totpCodeSchema.safeParse("000000").success).toBe(true);
        expect(totpCodeSchema.safeParse("123456").success).toBe(true);
        expect(totpCodeSchema.safeParse("999999").success).toBe(true);
      });

      it("trims whitespace around 6-digit codes", () => {
        const result = totpCodeSchema.safeParse("  654321  ");
        expect(result.success).toBe(true);
        expect(result.data).toBe("654321");
      });

      it("rejects codes with invalid length or non-digit characters", () => {
        // 5 digits
        expect(totpCodeSchema.safeParse("12345").success).toBe(false);
        // 7 digits
        expect(totpCodeSchema.safeParse("1234567").success).toBe(false);
        // Letters or symbols
        expect(totpCodeSchema.safeParse("12345A").success).toBe(false);
        expect(totpCodeSchema.safeParse("12-345").success).toBe(false);
        // Empty string
        expect(totpCodeSchema.safeParse("").success).toBe(false);
      });
    });

    describe("recoveryCodeSchema", () => {
      it("accepts valid Crockford Base32 recovery codes with hyphens", () => {
        const result = recoveryCodeSchema.safeParse(validFormattedRecoveryCode);
        expect(result.success).toBe(true);
      });

      it("accepts valid unhyphenated Crockford Base32 recovery codes", () => {
        const result = recoveryCodeSchema.safeParse(validRawRecoveryCode);
        expect(result.success).toBe(true);
      });

      it("rejects recovery codes containing ambiguous characters (0, O, 1, I)", () => {
        // Contains '0' and 'O'
        expect(
          recoveryCodeSchema.safeParse("2345-6789-ABCD-0FGH").success
        ).toBe(false);
        expect(
          recoveryCodeSchema.safeParse("2345-6789-ABCD-EFGO").success
        ).toBe(false);
        // Contains '1' and 'I'
        expect(
          recoveryCodeSchema.safeParse("2345-6789-ABCD-1FGH").success
        ).toBe(false);
        expect(
          recoveryCodeSchema.safeParse("2345-6789-ABCD-IFGH").success
        ).toBe(false);
      });

      it("rejects codes that are too short or too long", () => {
        // 15 characters (below 16 minimum)
        expect(recoveryCodeSchema.safeParse("23456789ABCDEF").success).toBe(
          false
        );
        // > 32 characters
        expect(recoveryCodeSchema.safeParse("A".repeat(33)).success).toBe(
          false
        );
      });
    });
  });

  describe("2. Challenge Verification Schemas", () => {
    describe("verifyAdminMfaTotpSchema", () => {
      it("validates a well-formed TOTP challenge verification payload", () => {
        const result = verifyAdminMfaTotpSchema.safeParse({
          body: {
            challengeToken: validChallengeToken,
            totpCode: validTotpCode
          }
        });
        expect(result.success).toBe(true);
      });

      it("rejects unknown or client-injected properties in body", () => {
        const result = verifyAdminMfaTotpSchema.safeParse({
          body: {
            challengeToken: validChallengeToken,
            totpCode: validTotpCode,
            role: "super_admin",
            userId: "60c72b2f9b1d8b2bad000001"
          }
        });
        expect(result.success).toBe(false);
      });
    });

    describe("verifyAdminMfaRecoverySchema", () => {
      it("validates a well-formed recovery code payload", () => {
        const result = verifyAdminMfaRecoverySchema.safeParse({
          body: {
            challengeToken: validChallengeToken,
            recoveryCode: validFormattedRecoveryCode
          }
        });
        expect(result.success).toBe(true);
      });

      it("rejects unknown properties in recovery payload", () => {
        const result = verifyAdminMfaRecoverySchema.safeParse({
          body: {
            challengeToken: validChallengeToken,
            recoveryCode: validFormattedRecoveryCode,
            tokenVersion: 2
          }
        });
        expect(result.success).toBe(false);
      });
    });

    describe("verifyAdminMfaSchema (Composite / Mutually Exclusive)", () => {
      it("accepts valid TOTP payload without recovery code", () => {
        const result = verifyAdminMfaSchema.safeParse({
          body: {
            challengeToken: validChallengeToken,
            totpCode: validTotpCode
          }
        });
        expect(result.success).toBe(true);
      });

      it("accepts valid recovery code payload without TOTP code", () => {
        const result = verifyAdminMfaSchema.safeParse({
          body: {
            challengeToken: validChallengeToken,
            recoveryCode: validFormattedRecoveryCode
          }
        });
        expect(result.success).toBe(true);
      });

      it("rejects payload when BOTH totpCode and recoveryCode are provided", () => {
        const result = verifyAdminMfaSchema.safeParse({
          body: {
            challengeToken: validChallengeToken,
            totpCode: validTotpCode,
            recoveryCode: validFormattedRecoveryCode
          }
        });
        expect(result.success).toBe(false);
        const issue = result.error.issues.find(
          (i) => i.message === "Must provide either totpCode or recoveryCode, but not both"
        );
        expect(issue).toBeDefined();
      });

      it("rejects payload when NEITHER totpCode nor recoveryCode is provided", () => {
        const result = verifyAdminMfaSchema.safeParse({
          body: {
            challengeToken: validChallengeToken
          }
        });
        expect(result.success).toBe(false);
        const issue = result.error.issues.find(
          (i) => i.message === "Must provide either totpCode or recoveryCode, but not both"
        );
        expect(issue).toBeDefined();
      });

      it("rejects client-supplied security injection fields (e.g. tokenVersion, role)", () => {
        const result = verifyAdminMfaSchema.safeParse({
          body: {
            challengeToken: validChallengeToken,
            totpCode: validTotpCode,
            tokenVersion: 5
          }
        });
        expect(result.success).toBe(false);
      });
    });
  });

  describe("3. Enrollment Confirmation Schema (activateAdminMfaSchema)", () => {
    it("accepts valid activation payload with challengeToken and totpCode", () => {
      const result = activateAdminMfaSchema.safeParse({
        body: {
          challengeToken: validChallengeToken,
          totpCode: validTotpCode
        }
      });
      expect(result.success).toBe(true);
    });

    it("accepts valid session-based activation payload with totpCode only", () => {
      const result = activateAdminMfaSchema.safeParse({
        body: {
          totpCode: validTotpCode
        }
      });
      expect(result.success).toBe(true);
    });

    it("strictly rejects client-supplied user ID, role, or encrypted secret", () => {
      const result = activateAdminMfaSchema.safeParse({
        body: {
          challengeToken: validChallengeToken,
          totpCode: validTotpCode,
          twoFactorSecret: "v1:0123:4567:89ab",
          twoFactorEnabled: true,
          userId: "507f1f77bcf86cd799439011"
        }
      });
      expect(result.success).toBe(false);
    });
  });

  describe("4. Setup Initiation Schema (setupAdminMfaSchema)", () => {
    it("accepts valid setup initiation payload containing challengeToken", () => {
      const result = setupAdminMfaSchema.safeParse({
        body: {
          challengeToken: validChallengeToken
        }
      });
      expect(result.success).toBe(true);
    });

    it("accepts valid session-based setup initiation payload with empty body", () => {
      const result = setupAdminMfaSchema.safeParse({
        body: {}
      });
      expect(result.success).toBe(true);
    });

    it("rejects setup initiation with unexpected payload properties", () => {
      const result = setupAdminMfaSchema.safeParse({
        body: {
          challengeToken: validChallengeToken,
          extraField: "malicious"
        }
      });
      expect(result.success).toBe(false);
    });
  });

  describe("5. MFA Disable Schema (disableAdminMfaSchema)", () => {
    it("accepts valid disable payload with password and totpCode", () => {
      const result = disableAdminMfaSchema.safeParse({
        body: {
          password: "AdminCurrentPassword!1",
          totpCode: validTotpCode
        }
      });
      expect(result.success).toBe(true);
    });

    it("accepts valid disable payload with password and recoveryCode", () => {
      const result = disableAdminMfaSchema.safeParse({
        body: {
          password: "AdminCurrentPassword!1",
          recoveryCode: validFormattedRecoveryCode
        }
      });
      expect(result.success).toBe(true);
    });

    it("rejects payload when password is missing or empty", () => {
      const missingPassword = disableAdminMfaSchema.safeParse({
        body: {
          totpCode: validTotpCode
        }
      });
      expect(missingPassword.success).toBe(false);

      const emptyPassword = disableAdminMfaSchema.safeParse({
        body: {
          password: "",
          totpCode: validTotpCode
        }
      });
      expect(emptyPassword.success).toBe(false);
    });

    it("rejects payload when BOTH totpCode and recoveryCode are provided", () => {
      const result = disableAdminMfaSchema.safeParse({
        body: {
          password: "AdminCurrentPassword!1",
          totpCode: validTotpCode,
          recoveryCode: validFormattedRecoveryCode
        }
      });
      expect(result.success).toBe(false);
      const issue = result.error.issues.find(
        (i) => i.message === "Must provide either totpCode or recoveryCode, but not both"
      );
      expect(issue).toBeDefined();
    });

    it("rejects payload when NEITHER totpCode nor recoveryCode is provided", () => {
      const result = disableAdminMfaSchema.safeParse({
        body: {
          password: "AdminCurrentPassword!1"
        }
      });
      expect(result.success).toBe(false);
      const issue = result.error.issues.find(
        (i) => i.message === "Must provide either totpCode or recoveryCode, but not both"
      );
      expect(issue).toBeDefined();
    });

    it("strictly rejects client-supplied identity, role, or tokenVersion injection", () => {
      const result = disableAdminMfaSchema.safeParse({
        body: {
          password: "AdminCurrentPassword!1",
          totpCode: validTotpCode,
          userId: "507f1f77bcf86cd799439011",
          role: "super_admin",
          tokenVersion: 99
        }
      });
      expect(result.success).toBe(false);
    });
  });
});
