import { EventEmitter } from "events";
import { describe, it, expect, vi } from "vitest";
import {
  normalizeClientIp,
  generateRateLimitKey,
  authRateLimitMiddleware,
  refreshRateLimitMiddleware,
  hashLoginIdentifier,
  generateAdminAccountKey,
  generateAdminIpKey,
  adminLoginRateLimitMiddleware,
  hashChallengeTokenForRateLimit,
  generateAdminMfaVerifyIpKey,
  generateAdminMfaVerifyAccountKey,
  generateAdminMfaRecoveryIpKey,
  generateAdminMfaRecoveryAccountKey,
  generateAdminMfaSetupIpKey,
  generateAdminMfaSetupAccountKey,
  generateAdminMfaActivateIpKey,
  generateAdminMfaActivateAccountKey,
  adminMfaVerifyIpRateLimitMiddleware,
  adminMfaVerifyAccountRateLimitMiddleware,
  adminMfaVerifyRateLimitMiddleware,
  adminMfaRecoveryIpRateLimitMiddleware,
  adminMfaRecoveryAccountRateLimitMiddleware,
  adminMfaRecoveryRateLimitMiddleware,
  adminMfaSetupIpRateLimitMiddleware,
  adminMfaSetupAccountRateLimitMiddleware,
  adminMfaSetupRateLimitMiddleware,
  adminMfaActivateIpRateLimitMiddleware,
  adminMfaActivateAccountRateLimitMiddleware,
  adminMfaActivateRateLimitMiddleware
} from "./auth-rate-limit.middleware.js";

describe("Rate Limiter IP Normalization and Key Generation", () => {
  describe("normalizeClientIp", () => {
    it("normalizes IPv6 loopback (::1) to 127.0.0.1", () => {
      expect(normalizeClientIp("::1")).toBe("127.0.0.1");
    });

    it("normalizes IPv4-mapped IPv6 loopback (::ffff:127.0.0.1) to 127.0.0.1", () => {
      expect(normalizeClientIp("::ffff:127.0.0.1")).toBe("127.0.0.1");
    });

    it("normalizes standard IPv4 loopback (127.0.0.1) to 127.0.0.1", () => {
      expect(normalizeClientIp("127.0.0.1")).toBe("127.0.0.1");
    });

    it("normalizes 'localhost' string to 127.0.0.1", () => {
      expect(normalizeClientIp("localhost")).toBe("127.0.0.1");
    });

    it("defaults undefined or empty IP to 127.0.0.1", () => {
      expect(normalizeClientIp(undefined)).toBe("127.0.0.1");
      expect(normalizeClientIp("")).toBe("127.0.0.1");
    });

    it("preserves external public IPv4 addresses", () => {
      expect(normalizeClientIp("203.0.113.195")).toBe("203.0.113.195");
    });

    it("preserves external public IPv6 addresses", () => {
      expect(normalizeClientIp("2001:db8::1")).toBe("2001:db8::1");
    });
  });

  describe("generateRateLimitKey", () => {
    it("produces identical rate-limit keys for IPv6 and IPv4 loopback addresses", () => {
      const reqIpv6 = { ip: "::1" };
      const reqIpv4 = { ip: "127.0.0.1" };
      const reqMapped = { ip: "::ffff:127.0.0.1" };

      const keyIpv6 = generateRateLimitKey(reqIpv6);
      const keyIpv4 = generateRateLimitKey(reqIpv4);
      const keyMapped = generateRateLimitKey(reqMapped);

      expect(keyIpv6).toBe("127.0.0.1");
      expect(keyIpv4).toBe("127.0.0.1");
      expect(keyMapped).toBe("127.0.0.1");
      expect(keyIpv6).toBe(keyIpv4);
    });

    it("differentiates different public client IPs", () => {
      const keyA = generateRateLimitKey({ ip: "203.0.113.10" });
      const keyB = generateRateLimitKey({ ip: "203.0.113.20" });

      expect(keyA).toBe("203.0.113.10");
      expect(keyB).toBe("203.0.113.20");
      expect(keyA).not.toBe(keyB);
    });
  });

  describe("authRateLimitMiddleware.resetKey", () => {
    it("resets loopback rate limit hits even when called with ::1", async () => {
      const req = {
        ip: "::1",
        headers: {},
        app: { get: vi.fn().mockReturnValue(false) }
      };
      const res = { setHeader: vi.fn(), getHeader: vi.fn() };
      const next = vi.fn();

      await authRateLimitMiddleware(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);

      // Verify that calling resetKey("::1") successfully clears the 127.0.0.1 store key
      authRateLimitMiddleware.resetKey("::1");
      const keyData = await authRateLimitMiddleware.getKey("127.0.0.1");
      expect(keyData).toBeUndefined();
    });
  });

  describe("refreshRateLimitMiddleware.resetKey", () => {
    it("resets loopback rate limit hits for refresh limiter even when called with ::1", async () => {
      const req = {
        ip: "::1",
        headers: {},
        app: { get: vi.fn().mockReturnValue(false) }
      };
      const res = { setHeader: vi.fn(), getHeader: vi.fn() };
      const next = vi.fn();

      await refreshRateLimitMiddleware(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);

      refreshRateLimitMiddleware.resetKey("::1");
      const keyData = await refreshRateLimitMiddleware.getKey("127.0.0.1");
      expect(keyData).toBeUndefined();
    });
  });

  describe("hashLoginIdentifier", () => {
    it("normalizes case and whitespace producing identical SHA-256 hashes", () => {
      const hash1 = hashLoginIdentifier("  Customer@CommerceFlow.COM  ");
      const hash2 = hashLoginIdentifier("customer@commerceflow.com");
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });

    it("returns null for non-string, empty, or whitespace-only inputs", () => {
      expect(hashLoginIdentifier(null)).toBeNull();
      expect(hashLoginIdentifier(undefined)).toBeNull();
      expect(hashLoginIdentifier("")).toBeNull();
      expect(hashLoginIdentifier("   ")).toBeNull();
      expect(hashLoginIdentifier(12345)).toBeNull();
    });

    it("handles long inputs safely producing fixed-length 64-char hex strings", () => {
      const longInput = "a".repeat(10000) + "@example.com";
      const hash = hashLoginIdentifier(longInput);
      expect(hash).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
    });
  });

  describe("Admin Login Rate Limiter resetKey", () => {
    it("adminLoginRateLimitMiddleware.resetKey resets IP and account stores without error", () => {
      expect(() => {
        adminLoginRateLimitMiddleware.resetKey("127.0.0.1");
        adminLoginRateLimitMiddleware.resetKey("::1");
        adminLoginRateLimitMiddleware.resetKey("admin@example.com");
      }).not.toThrow();
    });
  });


  describe("Admin MFA Rate Limiter Key Generation and Token Privacy", () => {
    describe("hashChallengeTokenForRateLimit", () => {
      it("generates a fixed 64-character SHA-256 hex digest for valid tokens", () => {
        const token =
          "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";
        const hash = hashChallengeTokenForRateLimit(token);
        expect(hash).toHaveLength(64);
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
      });

      it("trims whitespace before hashing", () => {
        const token =
          "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";
        const hash1 = hashChallengeTokenForRateLimit(token);
        const hash2 = hashChallengeTokenForRateLimit(`  ${token}  `);
        expect(hash1).toBe(hash2);
      });

      it("returns null for non-string, empty, or oversized input", () => {
        expect(hashChallengeTokenForRateLimit(null)).toBeNull();
        expect(hashChallengeTokenForRateLimit(undefined)).toBeNull();
        expect(hashChallengeTokenForRateLimit("")).toBeNull();
        expect(hashChallengeTokenForRateLimit("   ")).toBeNull();
        expect(hashChallengeTokenForRateLimit(12345)).toBeNull();
        expect(hashChallengeTokenForRateLimit("a".repeat(257))).toBeNull();
      });
    });

    describe("MFA Key Generators Namespace Separation", () => {
      const token =
        "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";
      const reqWithToken = {
        ip: "203.0.113.10",
        body: { challengeToken: token }
      };
      const reqWithUser = {
        ip: "203.0.113.10",
        user: { _id: "60c72b2f9b1d8b2bad000001" },
        body: {}
      };
      const reqEmpty = { ip: "203.0.113.10", body: {} };

      it("generates distinct IP keys for verify, recovery, setup, and activate", () => {
        const verifyIp = generateAdminMfaVerifyIpKey(reqWithToken);
        const recoveryIp = generateAdminMfaRecoveryIpKey(reqWithToken);
        const setupIp = generateAdminMfaSetupIpKey(reqWithToken);
        const activateIp = generateAdminMfaActivateIpKey(reqWithToken);

        expect(verifyIp).toBe("admin_mfa_v_ip_203.0.113.10");
        expect(recoveryIp).toBe("admin_mfa_rec_ip_203.0.113.10");
        expect(setupIp).toBe("admin_mfa_set_ip_203.0.113.10");
        expect(activateIp).toBe("admin_mfa_act_ip_203.0.113.10");

        const keys = new Set([verifyIp, recoveryIp, setupIp, activateIp]);
        expect(keys.size).toBe(4);
      });

      it("uses challenge token hash when body has challengeToken", () => {
        const key = generateAdminMfaVerifyAccountKey(reqWithToken);
        const expectedHash = hashChallengeTokenForRateLimit(token);
        expect(key).toBe(`admin_mfa_v_ch_${expectedHash}`);
        expect(key).not.toContain(token); // Privacy check: raw token is not exposed
      });

      it("prefers authenticated user ID when req.user is populated", () => {
        const key = generateAdminMfaVerifyAccountKey(reqWithUser);
        expect(key).toBe("admin_mfa_v_acct_60c72b2f9b1d8b2bad000001");
      });

      it("falls back to IP-based key when challengeToken and req.user are absent", () => {
        const key = generateAdminMfaVerifyAccountKey(reqEmpty);
        expect(key).toBe("admin_mfa_v_ch_ip_203.0.113.10");
      });
    });
  });

  describe("Admin MFA Rate Limiter Instances & ResetKey", () => {
    it("exports all individual and composite MFA rate limiters with expected quotas", () => {
      // Verification
      expect(adminMfaVerifyIpRateLimitMiddleware).toBeDefined();
      expect(adminMfaVerifyAccountRateLimitMiddleware).toBeDefined();
      expect(typeof adminMfaVerifyRateLimitMiddleware).toBe("function");

      // Recovery
      expect(adminMfaRecoveryIpRateLimitMiddleware).toBeDefined();
      expect(adminMfaRecoveryAccountRateLimitMiddleware).toBeDefined();
      expect(typeof adminMfaRecoveryRateLimitMiddleware).toBe("function");

      // Setup
      expect(adminMfaSetupIpRateLimitMiddleware).toBeDefined();
      expect(adminMfaSetupAccountRateLimitMiddleware).toBeDefined();
      expect(typeof adminMfaSetupRateLimitMiddleware).toBe("function");

      // Activate
      expect(adminMfaActivateIpRateLimitMiddleware).toBeDefined();
      expect(adminMfaActivateAccountRateLimitMiddleware).toBeDefined();
      expect(typeof adminMfaActivateRateLimitMiddleware).toBe("function");
    });

    it("resets keys without error on all MFA rate limiters", () => {
      expect(() => {
        adminMfaVerifyRateLimitMiddleware.resetKey("127.0.0.1");
        adminMfaRecoveryRateLimitMiddleware.resetKey("127.0.0.1");
        adminMfaSetupRateLimitMiddleware.resetKey("127.0.0.1");
        adminMfaActivateRateLimitMiddleware.resetKey("127.0.0.1");
        authRateLimitMiddleware.resetKey("127.0.0.1");
      }).not.toThrow();
    });

    it("enforces rate limits and returns AUTH_RATE_LIMIT_EXCEEDED when quota is exhausted", async () => {
      const testIp = "198.51.100.99";
      const testToken =
        "b1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";

      // Reset test keys first
      adminMfaRecoveryRateLimitMiddleware.resetKey(testIp);

      function createMockReqRes() {
        const emitter = new EventEmitter();
        const headers = {};
        let responseStatus = 200;
        let responseBody = null;
        let resolvePromise;
        const promise = new Promise((resolve) => {
          resolvePromise = resolve;
        });

        const req = {
          ip: testIp,
          body: { challengeToken: testToken },
          headers: {}
        };

        const res = Object.assign(emitter, {
          setHeader: vi.fn((k, v) => {
            headers[k] = v;
          }),
          getHeader: vi.fn((k) => headers[k]),
          status: vi.fn((code) => {
            responseStatus = code;
            return res;
          }),
          send: vi.fn((body) => {
            responseBody = body;
            res.emit("finish");
            resolvePromise({ type: "response", status: responseStatus, body });
            return res;
          }),
          json: vi.fn((body) => {
            responseBody = body;
            res.emit("finish");
            resolvePromise({ type: "response", status: responseStatus, body });
            return res;
          }),
          get statusCode() {
            return responseStatus;
          },
          set statusCode(val) {
            responseStatus = val;
          }
        });

        return {
          req,
          res,
          promise,
          resolveNext: () => resolvePromise({ type: "next" })
        };
      }

      // Recovery account limiter has limit 3
      // Requests 1, 2, 3 fail authentication (HTTP 401) and consume the attempt budget
      for (let i = 0; i < 3; i++) {
        const { req, res, promise, resolveNext } = createMockReqRes();
        adminMfaRecoveryRateLimitMiddleware(req, res, () => {
          resolveNext();
        });
        const result = await promise;
        expect(result.type).toBe("next");
        res.statusCode = 401;
        res.emit("finish");
      }

      // Request 4 should be blocked with 429 AUTH_RATE_LIMIT_EXCEEDED
      const { req, res, promise, resolveNext } = createMockReqRes();
      adminMfaRecoveryRateLimitMiddleware(req, res, () => {
        resolveNext();
      });
      const blockedResult = await promise;
      expect(blockedResult.type).toBe("response");
      expect(blockedResult.status).toBe(429);
      expect(blockedResult.body.error.code).toBe("AUTH_RATE_LIMIT_EXCEEDED");
    });

    it("does not consume failed attempt quota on successful requests (skipSuccessfulRequests)", async () => {
      const testIp = "198.51.100.100";
      const testToken =
        "c1c2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";

      adminMfaRecoveryRateLimitMiddleware.resetKey(testIp);

      function createMockReqRes() {
        const emitter = new EventEmitter();
        const headers = {};
        let responseStatus = 200;
        let responseBody = null;
        let resolvePromise;
        const promise = new Promise((resolve) => {
          resolvePromise = resolve;
        });

        const req = {
          ip: testIp,
          body: { challengeToken: testToken },
          headers: {}
        };

        const res = Object.assign(emitter, {
          setHeader: vi.fn((k, v) => {
            headers[k] = v;
          }),
          getHeader: vi.fn((k) => headers[k]),
          status: vi.fn((code) => {
            responseStatus = code;
            return res;
          }),
          send: vi.fn((body) => {
            responseBody = body;
            res.emit("finish");
            resolvePromise({ type: "response", status: responseStatus, body });
            return res;
          }),
          json: vi.fn((body) => {
            responseBody = body;
            res.emit("finish");
            resolvePromise({ type: "response", status: responseStatus, body });
            return res;
          }),
          get statusCode() {
            return responseStatus;
          },
          set statusCode(val) {
            responseStatus = val;
          }
        });

        return {
          req,
          res,
          promise,
          resolveNext: () => resolvePromise({ type: "next" })
        };
      }

      // Execute 5 successful requests (HTTP 200)
      for (let i = 0; i < 5; i++) {
        const { req, res, promise, resolveNext } = createMockReqRes();
        adminMfaRecoveryRateLimitMiddleware(req, res, () => {
          resolveNext();
        });
        const result = await promise;
        expect(result.type).toBe("next");
        res.statusCode = 200;
        res.emit("finish");
      }

      // Since all 5 were successful, quota is not exhausted; next request still proceeds
      const { req, res, promise, resolveNext } = createMockReqRes();
      adminMfaRecoveryRateLimitMiddleware(req, res, () => {
        resolveNext();
      });
      const result = await promise;
      expect(result.type).toBe("next");
    });
  });
});
