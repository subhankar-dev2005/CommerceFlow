import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";
import RefreshToken from "./refresh-token.model.js";
import User from "./user.model.js";
import {
  hashToken,
  generateOpaqueToken,
  calculateRefreshExpiryDate,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeFamily,
  revokeAllUserTokens
} from "./refresh-token.service.js";

describe("RefreshToken Service Unit Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Token Generation and Hashing", () => {
    it("generateOpaqueToken produces 128-hex-character string (512 bits)", () => {
      const token1 = generateOpaqueToken();
      const token2 = generateOpaqueToken();

      expect(typeof token1).toBe("string");
      expect(token1.length).toBe(128);
      expect(token1).not.toBe(token2);
    });

    it("hashToken produces deterministic SHA-256 hex digest", () => {
      const input = "test-token-value-12345";
      const expectedHash = crypto.createHash("sha256").update(input).digest("hex");

      const hash1 = hashToken(input);
      const hash2 = hashToken(input);

      expect(hash1).toBe(expectedHash);
      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64);
    });

    it("hashToken rejects empty or non-string inputs", () => {
      expect(() => hashToken("")).toThrowError(/required/);
      expect(() => hashToken(null)).toThrowError(/required/);
      expect(() => hashToken(12345)).toThrowError(/required/);
    });

    it("calculateRefreshExpiryDate calculates a future date based on 7 days", () => {
      const before = Date.now();
      const expiry = calculateRefreshExpiryDate();
      const after = Date.now();

      // Default is 7 days: 7 * 24 * 60 * 60 * 1000 = 604,800,000 ms
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      expect(expiry.getTime()).toBeGreaterThanOrEqual(before + sevenDaysMs - 1000);
      expect(expiry.getTime()).toBeLessThanOrEqual(after + sevenDaysMs + 1000);
    });
  });

  describe("issueRefreshToken", () => {
    it("creates a new refresh token record with SHA-256 hash and unique family", async () => {
      const mockUserId = "507f1f77bcf86cd799439011";
      const mockCreated = {
        _id: "token-doc-1",
        userId: mockUserId,
        family: "family-uuid-1",
        audience: "customer",
        expiresAt: new Date(Date.now() + 100000),
        isRevoked: false
      };

      const createSpy = vi.spyOn(RefreshToken, "create").mockResolvedValue(mockCreated);

      const result = await issueRefreshToken({ userId: mockUserId, audience: "customer" });

      expect(result.plaintextToken).toBeDefined();
      expect(result.plaintextToken.length).toBe(128);
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUserId,
          audience: "customer",
          isRevoked: false
        })
      );
      // Verify tokenHash stored in DB is the SHA-256 of plaintextToken
      const passedHash = createSpy.mock.calls[0][0].tokenHash;
      expect(passedHash).toBe(hashToken(result.plaintextToken));
    });

    it("uses provided family when refreshing or chaining", async () => {
      const mockUserId = "507f1f77bcf86cd799439011";
      const customFamily = "existing-family-uuid-999";

      const createSpy = vi.spyOn(RefreshToken, "create").mockResolvedValue({});

      await issueRefreshToken({ userId: mockUserId, audience: "admin", family: customFamily });

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          family: customFamily,
          audience: "admin"
        })
      );
    });
  });

  describe("rotateRefreshToken", () => {
    it("successfully rotates an active, unexpired token atomically", async () => {
      const rawToken = generateOpaqueToken();
      const tokenHash = hashToken(rawToken);
      const mockExisting = {
        _id: "token-1",
        tokenHash,
        userId: "507f1f77bcf86cd799439011",
        family: "family-123",
        audience: "customer",
        isRevoked: false,
        expiresAt: new Date(Date.now() + 100000)
      };

      vi.spyOn(RefreshToken, "findOne").mockResolvedValue(mockExisting);
      const findOneAndUpdateSpy = vi.spyOn(RefreshToken, "findOneAndUpdate").mockResolvedValue(mockExisting);
      const createSpy = vi.spyOn(RefreshToken, "create").mockResolvedValue({
        _id: "token-2",
        family: "family-123"
      });

      const rotated = await rotateRefreshToken(rawToken);

      expect(rotated.newPlaintextToken).toBeDefined();
      expect(rotated.newPlaintextToken).not.toBe(rawToken);
      expect(findOneAndUpdateSpy).toHaveBeenCalledWith(
        { _id: "token-1", isRevoked: false },
        expect.objectContaining({
          $set: expect.objectContaining({
            isRevoked: true,
            replacedByTokenHash: hashToken(rotated.newPlaintextToken)
          })
        }),
        { new: false }
      );
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          family: "family-123",
          userId: "507f1f77bcf86cd799439011",
          isRevoked: false
        })
      );
    });

    it("REUSE DETECTION: revokes entire family and increments user tokenVersion if token is already revoked", async () => {
      const rawToken = generateOpaqueToken();
      const tokenHash = hashToken(rawToken);
      const mockRevoked = {
        _id: "token-already-used",
        tokenHash,
        userId: "507f1f77bcf86cd799439011",
        family: "compromised-family",
        isRevoked: true,
        expiresAt: new Date(Date.now() + 100000)
      };

      vi.spyOn(RefreshToken, "findOne").mockResolvedValue(mockRevoked);
      const updateManySpy = vi.spyOn(RefreshToken, "updateMany").mockResolvedValue({ modifiedCount: 3 });
      const userUpdateSpy = vi.spyOn(User, "findByIdAndUpdate").mockResolvedValue({});

      await expect(rotateRefreshToken(rawToken)).rejects.toMatchObject({
        statusCode: 401,
        code: "TOKEN_REUSE_DETECTED"
      });

      expect(updateManySpy).toHaveBeenCalledWith(
        { family: "compromised-family" },
        { $set: { isRevoked: true } }
      );
      expect(userUpdateSpy).toHaveBeenCalledWith(
        "507f1f77bcf86cd799439011",
        { $inc: { tokenVersion: 1 } }
      );
    });

    it("rejects expired refresh token based on application-level expiresAt check", async () => {
      const rawToken = generateOpaqueToken();
      const tokenHash = hashToken(rawToken);
      const mockExpired = {
        _id: "token-expired",
        tokenHash,
        userId: "507f1f77bcf86cd799439011",
        family: "family-expired",
        isRevoked: false,
        expiresAt: new Date(Date.now() - 5000), // 5 seconds in the past
        save: vi.fn().mockResolvedValue({})
      };

      vi.spyOn(RefreshToken, "findOne").mockResolvedValue(mockExpired);

      await expect(rotateRefreshToken(rawToken)).rejects.toMatchObject({
        statusCode: 401,
        code: "REFRESH_TOKEN_EXPIRED"
      });

      expect(mockExpired.isRevoked).toBe(true);
      expect(mockExpired.save).toHaveBeenCalled();
    });

    it("CONCURRENT REFRESH: losing claim race rejects with 409 CONCURRENT_REFRESH without revoking family or incrementing tokenVersion", async () => {
      const rawToken = generateOpaqueToken();
      const tokenHash = hashToken(rawToken);
      const mockExisting = {
        _id: "token-concurrent-loser",
        tokenHash,
        userId: "507f1f77bcf86cd799439011",
        family: "family-active-123",
        audience: "customer",
        isRevoked: false,
        expiresAt: new Date(Date.now() + 100000)
      };

      vi.spyOn(RefreshToken, "findOne").mockResolvedValue(mockExisting);
      // Concurrent race: another request won the claim, so findOneAndUpdate returns null
      vi.spyOn(RefreshToken, "findOneAndUpdate").mockResolvedValue(null);
      const updateManySpy = vi.spyOn(RefreshToken, "updateMany");
      const userUpdateSpy = vi.spyOn(User, "findByIdAndUpdate");

      await expect(rotateRefreshToken(rawToken)).rejects.toMatchObject({
        statusCode: 409,
        code: "CONCURRENT_REFRESH"
      });

      // Must NOT destroy the session family or increment tokenVersion
      expect(updateManySpy).not.toHaveBeenCalled();
      expect(userUpdateSpy).not.toHaveBeenCalled();
    });

    it("safely rolls back old token revocation if database write of replacement token fails", async () => {
      const rawToken = generateOpaqueToken();
      const tokenHash = hashToken(rawToken);
      const mockExisting = {
        _id: "token-rollback",
        tokenHash,
        userId: "507f1f77bcf86cd799439011",
        family: "family-rollback",
        isRevoked: false,
        expiresAt: new Date(Date.now() + 100000)
      };

      vi.spyOn(RefreshToken, "findOne").mockResolvedValue(mockExisting);
      vi.spyOn(RefreshToken, "findOneAndUpdate").mockResolvedValue(mockExisting);
      // Simulate MongoDB failure on inserting the new token
      vi.spyOn(RefreshToken, "create").mockRejectedValue(new Error("MongoDB socket timeout"));
      const rollbackSpy = vi.spyOn(RefreshToken, "updateOne").mockResolvedValue({});

      await expect(rotateRefreshToken(rawToken)).rejects.toMatchObject({
        statusCode: 500,
        code: "REFRESH_DATABASE_ERROR"
      });

      // Verify rollback was triggered with replacement hash guard
      expect(rollbackSpy).toHaveBeenCalledWith(
        expect.objectContaining({ _id: "token-rollback", replacedByTokenHash: expect.any(String) }),
        expect.objectContaining({
          $set: { isRevoked: false, replacedByTokenHash: null }
        })
      );
    });
  });

  describe("Revocation Helpers", () => {
    it("revokeRefreshToken revokes by token hash", async () => {
      const rawToken = generateOpaqueToken();
      const hash = hashToken(rawToken);
      const updateSpy = vi.spyOn(RefreshToken, "updateOne").mockResolvedValue({ modifiedCount: 1 });

      const success = await revokeRefreshToken(rawToken);

      expect(success).toBe(true);
      expect(updateSpy).toHaveBeenCalledWith(
        { tokenHash: hash },
        { $set: { isRevoked: true } }
      );
    });

    it("revokeAllUserTokens revokes all active tokens for a user", async () => {
      const userId = "507f1f77bcf86cd799439011";
      const updateManySpy = vi.spyOn(RefreshToken, "updateMany").mockResolvedValue({ modifiedCount: 4 });

      const count = await revokeAllUserTokens(userId);

      expect(count).toBe(4);
      expect(updateManySpy).toHaveBeenCalledWith(
        { userId, isRevoked: false },
        { $set: { isRevoked: true } }
      );
    });
  });
});
