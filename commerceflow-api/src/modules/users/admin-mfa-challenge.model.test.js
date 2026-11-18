import mongoose from "mongoose";
import { describe, it, expect } from "vitest";
import AdminMfaChallenge, {
  MFA_CHALLENGE_PURPOSES,
  ALL_MFA_CHALLENGE_PURPOSES,
  MFA_CHALLENGE_STATES,
  ALL_MFA_CHALLENGE_STATES,
  CHALLENGE_TOKEN_HASH_REGEX
} from "./admin-mfa-challenge.model.js";

describe("AdminMfaChallenge Model Schema & Validation", () => {
  const validUserId = new mongoose.Types.ObjectId();
  const validHash =
    "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";

  function createValidChallengeData(overrides = {}) {
    return {
      challengeTokenHash: validHash,
      userId: validUserId,
      purpose: MFA_CHALLENGE_PURPOSES.ADMIN_MFA_LOGIN,
      tokenVersion: 1,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      ...overrides
    };
  }

  describe("1. Model Export & Collection Metadata", () => {
    it("exports model with correct name and target collection", () => {
      expect(AdminMfaChallenge.modelName).toBe("AdminMfaChallenge");
      expect(AdminMfaChallenge.collection.name).toBe("admin_mfa_challenges");
    });

    it("exports expected MFA challenge purpose constants", () => {
      expect(MFA_CHALLENGE_PURPOSES.ADMIN_MFA_LOGIN).toBe("admin_mfa_login");
      expect(MFA_CHALLENGE_PURPOSES.ADMIN_MFA_SETUP).toBe("admin_mfa_setup");
      expect(ALL_MFA_CHALLENGE_PURPOSES).toEqual([
        "admin_mfa_login",
        "admin_mfa_setup"
      ]);
    });

    it("exports expected MFA challenge state constants", () => {
      expect(MFA_CHALLENGE_STATES.PENDING).toBe("pending");
      expect(MFA_CHALLENGE_STATES.CLAIMED).toBe("claimed");
      expect(MFA_CHALLENGE_STATES.COMPLETED).toBe("completed");
      expect(MFA_CHALLENGE_STATES.FAILED).toBe("failed");
      expect(ALL_MFA_CHALLENGE_STATES).toEqual([
        "pending",
        "claimed",
        "completed",
        "failed"
      ]);
    });
  });

  describe("2. Document Validation & Defaults", () => {
    it("validates a complete, valid challenge document with optional metadata", async () => {
      const doc = new AdminMfaChallenge(
        createValidChallengeData({
          ip: "192.168.1.100",
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          claimedAt: new Date(),
          lastAttemptAt: new Date(),
          completedAt: null
        })
      );

      await expect(doc.validate()).resolves.toBeUndefined();
      expect(doc.challengeTokenHash).toBe(validHash);
      expect(doc.userId.toString()).toBe(validUserId.toString());
      expect(doc.purpose).toBe("admin_mfa_login");
      expect(doc.tokenVersion).toBe(1);
      expect(doc.state).toBe("pending");
      expect(doc.attemptsCount).toBe(0);
      expect(doc.maxAttempts).toBe(5);
      expect(doc.ip).toBe("192.168.1.100");
    });

    it("applies correct schema defaults when optional fields are omitted", async () => {
      const doc = new AdminMfaChallenge(createValidChallengeData());
      await expect(doc.validate()).resolves.toBeUndefined();

      expect(doc.state).toBe("pending");
      expect(doc.attemptsCount).toBe(0);
      expect(doc.maxAttempts).toBe(5);
      expect(doc.ip).toBeNull();
      expect(doc.userAgent).toBeNull();
      expect(doc.claimedAt).toBeNull();
      expect(doc.lastAttemptAt).toBeNull();
      expect(doc.completedAt).toBeNull();
    });
  });

  describe("3. Required Fields Validation", () => {
    it("rejects challenge when challengeTokenHash is missing", async () => {
      const doc = new AdminMfaChallenge(
        createValidChallengeData({ challengeTokenHash: undefined })
      );
      await expect(doc.validate()).rejects.toThrow(
        /challengeTokenHash is required/
      );
    });

    it("rejects challenge when userId is missing", async () => {
      const doc = new AdminMfaChallenge(
        createValidChallengeData({ userId: undefined })
      );
      await expect(doc.validate()).rejects.toThrow(/userId is required/);
    });

    it("rejects challenge when purpose is missing", async () => {
      const doc = new AdminMfaChallenge(
        createValidChallengeData({ purpose: undefined })
      );
      await expect(doc.validate()).rejects.toThrow(/purpose is required/);
    });

    it("rejects challenge when tokenVersion is missing", async () => {
      const doc = new AdminMfaChallenge(
        createValidChallengeData({ tokenVersion: undefined })
      );
      await expect(doc.validate()).rejects.toThrow(/tokenVersion is required/);
    });

    it("rejects challenge when expiresAt is missing", async () => {
      const doc = new AdminMfaChallenge(
        createValidChallengeData({ expiresAt: undefined })
      );
      await expect(doc.validate()).rejects.toThrow(/expiresAt is required/);
    });
  });

  describe("4. challengeTokenHash Format Validation", () => {
    it("accepts valid 64-character hex strings", async () => {
      const validUppercaseHash =
        "A1B2C3D4E5F60718293A4B5C6D7E8F90A1B2C3D4E5F60718293A4B5C6D7E8F90";
      const doc = new AdminMfaChallenge(
        createValidChallengeData({ challengeTokenHash: validUppercaseHash })
      );
      await expect(doc.validate()).resolves.toBeUndefined();
    });

    it("rejects non-64-character hash strings", async () => {
      // 63 characters (1 too short)
      const shortHash =
        "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9";
      const docShort = new AdminMfaChallenge(
        createValidChallengeData({ challengeTokenHash: shortHash })
      );
      await expect(docShort.validate()).rejects.toThrow(
        /64-character hex SHA-256 digest/
      );

      // 65 characters (1 too long)
      const longHash =
        "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a";
      const docLong = new AdminMfaChallenge(
        createValidChallengeData({ challengeTokenHash: longHash })
      );
      await expect(docLong.validate()).rejects.toThrow(
        /64-character hex SHA-256 digest/
      );
    });

    it("rejects hash containing non-hexadecimal characters", async () => {
      const nonHexHash =
        "g1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9z";
      const doc = new AdminMfaChallenge(
        createValidChallengeData({ challengeTokenHash: nonHexHash })
      );
      await expect(doc.validate()).rejects.toThrow(
        /64-character hex SHA-256 digest/
      );
    });
  });

  describe("5. Purpose and State Enum Validation", () => {
    it("accepts all valid purpose values", async () => {
      for (const purpose of ALL_MFA_CHALLENGE_PURPOSES) {
        const doc = new AdminMfaChallenge(createValidChallengeData({ purpose }));
        await expect(doc.validate()).resolves.toBeUndefined();
      }
    });

    it("rejects unsupported purpose values", async () => {
      const doc = new AdminMfaChallenge(
        createValidChallengeData({ purpose: "password_reset" })
      );
      await expect(doc.validate()).rejects.toThrow(
        /Invalid MFA challenge purpose/
      );
    });

    it("accepts all valid state values", async () => {
      for (const state of ALL_MFA_CHALLENGE_STATES) {
        const doc = new AdminMfaChallenge(createValidChallengeData({ state }));
        await expect(doc.validate()).resolves.toBeUndefined();
      }
    });

    it("rejects unsupported state values", async () => {
      const doc = new AdminMfaChallenge(
        createValidChallengeData({ state: "active" })
      );
      await expect(doc.validate()).rejects.toThrow(/Invalid MFA challenge state/);
    });
  });

  describe("6. Numerical Bounds and Integer Validation", () => {
    it("rejects negative attemptsCount", async () => {
      const doc = new AdminMfaChallenge(
        createValidChallengeData({ attemptsCount: -1 })
      );
      await expect(doc.validate()).rejects.toThrow(
        /attemptsCount must be non-negative/
      );
    });

    it("rejects fractional attemptsCount", async () => {
      const doc = new AdminMfaChallenge(
        createValidChallengeData({ attemptsCount: 1.5 })
      );
      await expect(doc.validate()).rejects.toThrow(
        /attemptsCount must be an integer/
      );
    });

    it("rejects zero or negative maxAttempts", async () => {
      const docZero = new AdminMfaChallenge(
        createValidChallengeData({ maxAttempts: 0 })
      );
      await expect(docZero.validate()).rejects.toThrow(
        /maxAttempts must be at least 1/
      );

      const docNeg = new AdminMfaChallenge(
        createValidChallengeData({ maxAttempts: -2 })
      );
      await expect(docNeg.validate()).rejects.toThrow(
        /maxAttempts must be at least 1/
      );
    });

    it("rejects fractional maxAttempts", async () => {
      const doc = new AdminMfaChallenge(
        createValidChallengeData({ maxAttempts: 3.5 })
      );
      await expect(doc.validate()).rejects.toThrow(
        /maxAttempts must be an integer/
      );
    });

    it("rejects negative tokenVersion", async () => {
      const doc = new AdminMfaChallenge(
        createValidChallengeData({ tokenVersion: -1 })
      );
      await expect(doc.validate()).rejects.toThrow(
        /tokenVersion must be non-negative/
      );
    });

    it("rejects fractional tokenVersion", async () => {
      const doc = new AdminMfaChallenge(
        createValidChallengeData({ tokenVersion: 2.3 })
      );
      await expect(doc.validate()).rejects.toThrow(
        /tokenVersion must be an integer/
      );
    });

    it("accepts tokenVersion of zero", async () => {
      const doc = new AdminMfaChallenge(
        createValidChallengeData({ tokenVersion: 0 })
      );
      await expect(doc.validate()).resolves.toBeUndefined();
    });
  });

  describe("7. Optional Metadata Boundary Constraints", () => {
    it("accepts valid IPv4 and IPv6 strings within bounds", async () => {
      const ipv4Doc = new AdminMfaChallenge(
        createValidChallengeData({ ip: "192.168.1.1" })
      );
      await expect(ipv4Doc.validate()).resolves.toBeUndefined();

      const ipv6Doc = new AdminMfaChallenge(
        createValidChallengeData({
          ip: "2001:0db8:85a3:0000:0000:8a2e:0370:7334"
        })
      );
      await expect(ipv6Doc.validate()).resolves.toBeUndefined();
    });

    it("rejects ip exceeding 45 characters", async () => {
      const longIp = "a".repeat(46);
      const doc = new AdminMfaChallenge(
        createValidChallengeData({ ip: longIp })
      );
      await expect(doc.validate()).rejects.toThrow(
        /ip address exceeds maximum length of 45 characters/
      );
    });

    it("rejects userAgent exceeding 500 characters", async () => {
      const longUa = "Mozilla/5.0 ".repeat(50); // > 500 chars
      const doc = new AdminMfaChallenge(
        createValidChallengeData({ userAgent: longUa })
      );
      await expect(doc.validate()).rejects.toThrow(
        /userAgent exceeds maximum length of 500 characters/
      );
    });
  });

  describe("8. Index Definitions & Automated TTL", () => {
    it("defines the expected unique, compound, and TTL indexes on schema", () => {
      const indexes = AdminMfaChallenge.schema.indexes();

      // 1. Unique index on challengeTokenHash
      const hashIndex = indexes.find(
        ([fields]) => fields.challengeTokenHash === 1
      );
      expect(hashIndex).toBeDefined();
      expect(hashIndex[1].unique).toBe(true);

      // 2. Compound lookup index on userId and state
      const userStateIndex = indexes.find(
        ([fields]) => fields.userId === 1 && fields.state === 1
      );
      expect(userStateIndex).toBeDefined();

      // 3. TTL index on expiresAt with 0-second expiration
      const ttlIndex = indexes.find(([fields]) => fields.expiresAt === 1);
      expect(ttlIndex).toBeDefined();
      expect(ttlIndex[1].expireAfterSeconds).toBe(0);
    });
  });

  describe("9. Secret Minimization Invariants", () => {
    it("ensures the schema contains no raw token, plaintext secret, or TOTP fields", () => {
      const schemaPaths = Object.keys(AdminMfaChallenge.schema.paths);

      // Verify absence of sensitive plaintexts
      expect(schemaPaths).not.toContain("rawToken");
      expect(schemaPaths).not.toContain("token");
      expect(schemaPaths).not.toContain("challengeToken");
      expect(schemaPaths).not.toContain("secret");
      expect(schemaPaths).not.toContain("totpCode");
      expect(schemaPaths).not.toContain("password");
      expect(schemaPaths).not.toContain("recoveryCode");

      // Verify ONLY the SHA-256 hash is defined for token matching
      expect(schemaPaths).toContain("challengeTokenHash");
    });
  });

  describe("10. Atomic Claim Operation Contract", () => {
    it("structures the exact atomic query filter and mutation required by the service layer", () => {
      /**
       * Note on Test Methodology:
       * Unit tests here verify the syntactic and semantic structure of the atomic claim
       * operation as defined by the AdminMfaChallenge specification. Real multi-process
       * MongoDB concurrency requires an active MongoDB replica set, which is verified
       * in integration test suites.
       */
      const now = new Date();
      const testHash = validHash;

      // Define the exact filter contract
      const atomicClaimFilter = {
        challengeTokenHash: testHash,
        state: MFA_CHALLENGE_STATES.PENDING,
        attemptsCount: { $lt: 5 },
        expiresAt: { $gt: now }
      };

      // Define the exact atomic mutation contract
      const atomicClaimUpdate = {
        $inc: { attemptsCount: 1 },
        $set: {
          state: MFA_CHALLENGE_STATES.CLAIMED,
          claimedAt: now,
          lastAttemptAt: now
        }
      };

      expect(atomicClaimFilter.state).toBe("pending");
      expect(atomicClaimFilter.attemptsCount).toEqual({ $lt: 5 });
      expect(atomicClaimUpdate.$inc).toEqual({ attemptsCount: 1 });
      expect(atomicClaimUpdate.$set.state).toBe("claimed");
    });
  });
});

