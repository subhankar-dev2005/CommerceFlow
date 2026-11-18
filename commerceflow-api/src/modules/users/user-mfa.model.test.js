import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import User from "./user.model.js";
import { encryptMfaSecret } from "../../utils/mfa-crypto.js";

const VALID_KEY_HEX =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("User Model MFA Schema Extensions", () => {
  describe("Schema Definitions and Field Defaults", () => {
    it("preserves existing baseline defaults for isActive, role, and tokenVersion", () => {
      const user = new User({
        name: "Test User",
        email: "test@example.com",
        password: "securePassword123"
      });

      expect(user.isActive).toBe(true);
      expect(user.role).toBe("customer");
      expect(user.tokenVersion).toBe(0);
    });

    it("establishes safe legacy defaults for all new MFA fields", () => {
      const user = new User({
        name: "Test Admin",
        email: "admin@example.com",
        password: "securePassword123",
        role: "admin"
      });

      expect(user.twoFactorEnabled).toBe(false);
      expect(user.twoFactorSecret).toBeNull();
      expect(user.twoFactorPendingSecret).toBeNull();
      expect(user.twoFactorPendingExpiresAt).toBeNull();
      expect(user.lastTotpStep).toBe(0);
      expect(user.twoFactorRecoveryCodes).toEqual([]);
      expect(user.twoFactorEnrolledAt).toBeNull();
    });

    it("marks sensitive MFA fields as select: false in the schema to prevent unintentional data leakage", () => {
      const schema = User.schema;

      expect(schema.path("twoFactorSecret").options.select).toBe(false);
      expect(schema.path("twoFactorPendingSecret").options.select).toBe(false);
      expect(schema.path("twoFactorPendingExpiresAt").options.select).toBe(false);
      expect(schema.path("lastTotpStep").options.select).toBe(false);
      expect(schema.path("twoFactorRecoveryCodes").options.select).toBe(false);

      // Verify twoFactorEnabled is NOT hidden so client and middleware can verify 2FA status
      expect(schema.path("twoFactorEnabled").options.select).toBeUndefined();
    });
  });

  describe("Recovery Codes Subdocument Validation", () => {
    it("accepts valid recovery code objects with codeHash and default timestamps", () => {
      const user = new User({
        name: "Test Admin",
        email: "admin@example.com",
        password: "securePassword123",
        role: "admin",
        twoFactorRecoveryCodes: [
          {
            codeHash:
              "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
          }
        ]
      });

      expect(user.twoFactorRecoveryCodes.length).toBe(1);
      const codeEntry = user.twoFactorRecoveryCodes[0];
      expect(codeEntry.codeHash).toBe(
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
      );
      expect(codeEntry.redeemedAt).toBeNull();
      expect(codeEntry.createdAt).toBeInstanceOf(Date);
    });

    it("requires codeHash for recovery code subdocuments", async () => {
      const user = new User({
        name: "Test Admin",
        email: "admin@example.com",
        password: "securePassword123",
        role: "admin",
        twoFactorRecoveryCodes: [{}]
      });

      let validationError;
      try {
        await user.validate();
      } catch (err) {
        validationError = err;
      }

      expect(validationError).toBeDefined();
      expect(
        validationError.errors["twoFactorRecoveryCodes.0.codeHash"]
      ).toBeDefined();
    });

    it("allows updating redemption state on individual recovery codes atomically", () => {
      const user = new User({
        name: "Test Admin",
        email: "admin@example.com",
        password: "securePassword123",
        role: "admin",
        twoFactorRecoveryCodes: [
          {
            codeHash: "hash-code-1",
            redeemedAt: null
          },
          {
            codeHash: "hash-code-2",
            redeemedAt: null
          }
        ]
      });

      const now = new Date();
      user.twoFactorRecoveryCodes[0].redeemedAt = now;

      expect(user.twoFactorRecoveryCodes[0].redeemedAt).toBe(now);
      expect(user.twoFactorRecoveryCodes[1].redeemedAt).toBeNull();
    });
  });

  describe("Encrypted Secret Persistence Compatibility and Envelope Defense-in-Depth", () => {
    it("accepts versioned AES-256-GCM ciphertext envelopes for active and pending secrets", async () => {
      const envelope =
        "v1:0123456789abcdef01234567:0123456789abcdef0123456789abcdef:fedcba9876543210";
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      const user = new User({
        name: "Test Admin",
        email: "admin@example.com",
        password: "securePassword123",
        role: "admin",
        twoFactorEnabled: true,
        twoFactorSecret: envelope,
        twoFactorPendingSecret: envelope,
        twoFactorPendingExpiresAt: expiresAt,
        lastTotpStep: 58000000,
        twoFactorEnrolledAt: new Date()
      });

      await expect(user.validate()).resolves.toBeUndefined();
      expect(user.twoFactorEnabled).toBe(true);
      expect(user.twoFactorSecret).toBe(envelope);
      expect(user.twoFactorPendingSecret).toBe(envelope);
      expect(user.twoFactorPendingExpiresAt).toBe(expiresAt);
      expect(user.lastTotpStep).toBe(58000000);
      expect(user.twoFactorEnrolledAt).toBeInstanceOf(Date);
    });

    it("accepts real envelopes produced by encryptMfaSecret utility", async () => {
      const rawSecret = "JBSWY3DPEHPK3PXP";
      const realEnvelope = encryptMfaSecret(rawSecret, VALID_KEY_HEX);

      const user = new User({
        name: "Test Admin",
        email: "admin@example.com",
        password: "securePassword123",
        role: "admin",
        twoFactorSecret: realEnvelope,
        twoFactorPendingSecret: realEnvelope
      });

      await expect(user.validate()).resolves.toBeUndefined();
    });

    it("preserves null and undefined as valid values for twoFactorSecret and twoFactorPendingSecret", async () => {
      const user = new User({
        name: "Test Admin",
        email: "admin@example.com",
        password: "securePassword123",
        role: "admin",
        twoFactorSecret: null,
        twoFactorPendingSecret: null
      });

      await expect(user.validate()).resolves.toBeUndefined();
    });

    it("rejects plaintext Base32 TOTP secrets without leaking the secret value in errors", async () => {
      const plaintextSecret = "JBSWY3DPEHPK3PXP";
      const user = new User({
        name: "Test Admin",
        email: "admin@example.com",
        password: "securePassword123",
        role: "admin",
        twoFactorSecret: plaintextSecret,
        twoFactorPendingSecret: plaintextSecret
      });

      let validationError;
      try {
        await user.validate();
      } catch (err) {
        validationError = err;
      }

      expect(validationError).toBeDefined();
      expect(validationError.errors.twoFactorSecret.message).toBe(
        "Invalid MFA secret envelope format"
      );
      expect(validationError.errors.twoFactorPendingSecret.message).toBe(
        "Invalid MFA pending secret envelope format"
      );

      // Verify no secret value disclosure in validation error messages
      expect(validationError.message).not.toContain(plaintextSecret);
      expect(validationError.errors.twoFactorSecret.message).not.toContain(
        plaintextSecret
      );
      expect(
        validationError.errors.twoFactorPendingSecret.message
      ).not.toContain(plaintextSecret);
    });

    it("rejects unsupported envelope versions (e.g. v2)", async () => {
      const v2Envelope =
        "v2:0123456789abcdef01234567:0123456789abcdef0123456789abcdef:fedcba9876543210";
      const user = new User({
        name: "Test Admin",
        email: "admin@example.com",
        password: "securePassword123",
        role: "admin",
        twoFactorSecret: v2Envelope
      });

      await expect(user.validate()).rejects.toThrow(
        "Invalid MFA secret envelope format"
      );
    });

    it("rejects invalid IV length or invalid IV hex characters", async () => {
      // 22 hex chars (11 bytes) instead of 24
      const shortIv =
        "v1:0123456789abcdef012345:0123456789abcdef0123456789abcdef:fedcba9876543210";
      const user1 = new User({
        name: "Test Admin",
        email: "admin@example.com",
        password: "securePassword123",
        role: "admin",
        twoFactorSecret: shortIv
      });
      await expect(user1.validate()).rejects.toThrow(
        "Invalid MFA secret envelope format"
      );

      // Non-hex character 'Z' in IV
      const nonHexIv =
        "v1:0123456789abcdef0123456Z:0123456789abcdef0123456789abcdef:fedcba9876543210";
      const user2 = new User({
        name: "Test Admin",
        email: "admin@example.com",
        password: "securePassword123",
        role: "admin",
        twoFactorSecret: nonHexIv
      });
      await expect(user2.validate()).rejects.toThrow(
        "Invalid MFA secret envelope format"
      );
    });

    it("rejects invalid auth tag length or invalid tag hex characters", async () => {
      // 30 hex chars (15 bytes) instead of 32
      const shortTag =
        "v1:0123456789abcdef01234567:0123456789abcdef0123456789ab:fedcba9876543210";
      const user = new User({
        name: "Test Admin",
        email: "admin@example.com",
        password: "securePassword123",
        role: "admin",
        twoFactorSecret: shortTag
      });
      await expect(user.validate()).rejects.toThrow(
        "Invalid MFA secret envelope format"
      );
    });

    it("rejects empty or non-hex ciphertext payload", async () => {
      // Empty ciphertext
      const emptyCt =
        "v1:0123456789abcdef01234567:0123456789abcdef0123456789abcdef:";
      const user1 = new User({
        name: "Test Admin",
        email: "admin@example.com",
        password: "securePassword123",
        role: "admin",
        twoFactorSecret: emptyCt
      });
      await expect(user1.validate()).rejects.toThrow(
        "Invalid MFA secret envelope format"
      );

      // Non-hex ciphertext
      const nonHexCt =
        "v1:0123456789abcdef01234567:0123456789abcdef0123456789abcdef:not-hex-ciphertext!";
      const user2 = new User({
        name: "Test Admin",
        email: "admin@example.com",
        password: "securePassword123",
        role: "admin",
        twoFactorSecret: nonHexCt
      });
      await expect(user2.validate()).rejects.toThrow(
        "Invalid MFA secret envelope format"
      );
    });
  });

  describe("lastTotpStep Schema Constraints", () => {
    it("accepts zero and positive integers for lastTotpStep", async () => {
      const userZero = new User({
        name: "Test Admin",
        email: "admin1@example.com",
        password: "securePassword123",
        role: "admin",
        lastTotpStep: 0
      });
      await expect(userZero.validate()).resolves.toBeUndefined();

      const userPositive = new User({
        name: "Test Admin",
        email: "admin2@example.com",
        password: "securePassword123",
        role: "admin",
        lastTotpStep: 58123456
      });
      await expect(userPositive.validate()).resolves.toBeUndefined();
    });

    it("rejects negative values for lastTotpStep", async () => {
      const userNegative = new User({
        name: "Test Admin",
        email: "admin@example.com",
        password: "securePassword123",
        role: "admin",
        lastTotpStep: -1
      });

      let validationError;
      try {
        await userNegative.validate();
      } catch (err) {
        validationError = err;
      }

      expect(validationError).toBeDefined();
      expect(validationError.errors.lastTotpStep.message).toBe(
        "lastTotpStep must be non-negative"
      );
    });
  });
});

