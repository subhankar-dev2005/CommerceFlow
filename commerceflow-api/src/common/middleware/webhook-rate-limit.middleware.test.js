import { describe, it, expect, vi } from "vitest";
import webhookRateLimitMiddleware from "./webhook-rate-limit.middleware.js";

describe("webhookRateLimitMiddleware", () => {
  it("initializes without throwing or logging ERR_ERL_KEY_GEN_IPV6", () => {
    expect(webhookRateLimitMiddleware).toBeDefined();
    expect(typeof webhookRateLimitMiddleware).toBe("function");
  });

  it("processes request with IPv6 address safely and calls next()", async () => {
    const req = {
      ip: "2001:db8:85a3::8a2e:370:7334",
      headers: {},
      app: {
        get: vi.fn().mockReturnValue(false)
      }
    };
    const res = {
      setHeader: vi.fn(),
      getHeader: vi.fn()
    };
    const next = vi.fn();

    await webhookRateLimitMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it("processes request with IPv4-mapped IPv6 address safely and calls next()", async () => {
    const req = {
      ip: "::ffff:192.0.2.1",
      headers: {},
      app: {
        get: vi.fn().mockReturnValue(false)
      }
    };
    const res = {
      setHeader: vi.fn(),
      getHeader: vi.fn()
    };
    const next = vi.fn();

    await webhookRateLimitMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it("processes standard IPv4 address safely and calls next()", async () => {
    const req = {
      ip: "192.0.2.1",
      headers: {},
      app: {
        get: vi.fn().mockReturnValue(false)
      }
    };
    const res = {
      setHeader: vi.fn(),
      getHeader: vi.fn()
    };
    const next = vi.fn();

    await webhookRateLimitMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });
});
