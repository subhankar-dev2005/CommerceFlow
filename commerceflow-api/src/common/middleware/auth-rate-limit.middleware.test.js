import { describe, it, expect, vi } from "vitest";
import {
  normalizeClientIp,
  generateRateLimitKey,
  authRateLimitMiddleware,
  refreshRateLimitMiddleware
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
});
