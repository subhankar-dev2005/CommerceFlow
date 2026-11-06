import rateLimit, { ipKeyGenerator } from "express-rate-limit";

/**
 * Normalizes loopback IP representations (IPv4, IPv6, IPv4-mapped IPv6)
 * to a canonical "127.0.0.1" address so local development and test requests
 * map to a deterministic rate limit key and can be reset reliably.
 * Public IP addresses are preserved and safely handled by ipKeyGenerator.
 *
 * @param {string|undefined} ip
 * @returns {string}
 */
export function normalizeClientIp(ip) {
  if (!ip || typeof ip !== "string") return "127.0.0.1";
  const trimmed = ip.trim();
  if (
    trimmed === "::1" ||
    trimmed === "127.0.0.1" ||
    trimmed === "::ffff:127.0.0.1" ||
    trimmed === "localhost"
  ) {
    return "127.0.0.1";
  }
  return trimmed;
}

/**
 * Generates standard rate limit key based on normalized client IP.
 * Uses ipKeyGenerator to apply standard IPv4 / IPv6 subnet partitioning
 * for public addresses while maintaining deterministic loopback keys.
 *
 * @param {import("express").Request} req
 * @returns {string}
 */
export function generateRateLimitKey(req) {
  const ip = normalizeClientIp(req?.ip);
  return ipKeyGenerator(ip);
}

export const authRateLimitMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: generateRateLimitKey,
  message: {
    success: false,
    error: {
      code: "AUTH_RATE_LIMIT_EXCEEDED",
      message: "Too many authentication attempts. Please try again later.",
      details: []
    }
  }
});

const originalAuthResetKey = authRateLimitMiddleware.resetKey;
authRateLimitMiddleware.resetKey = (key) => {
  originalAuthResetKey(key);
  const normalized = normalizeClientIp(key);
  if (normalized !== key) {
    originalAuthResetKey(normalized);
  }
};

/**
 * Dedicated rate limiter for session refresh (/users/refresh).
 * Decoupled from login endpoints to prevent shared NAT/office networks or
 * multi-tab refresh operations from prematurely exhausting the strict login limit.
 * Allows 60 requests per 15 minutes (~4/min) per IP.
 */
export const refreshRateLimitMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: generateRateLimitKey,
  message: {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many session refresh attempts. Please try again later.",
      details: []
    }
  }
});

const originalRefreshResetKey = refreshRateLimitMiddleware.resetKey;
refreshRateLimitMiddleware.resetKey = (key) => {
  originalRefreshResetKey(key);
  const normalized = normalizeClientIp(key);
  if (normalized !== key) {
    originalRefreshResetKey(normalized);
  }
};

export const registerRateLimitMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: false,
  legacyHeaders: false,
  keyGenerator: generateRateLimitKey,
  message: {
    success: false,
    error: {
      code: "AUTH_RATE_LIMIT_EXCEEDED",
      message: "Too many registration attempts. Please try again later.",
      details: []
    }
  }
});

const originalRegisterResetKey = registerRateLimitMiddleware.resetKey;
registerRateLimitMiddleware.resetKey = (key) => {
  originalRegisterResetKey(key);
  const normalized = normalizeClientIp(key);
  if (normalized !== key) {
    originalRegisterResetKey(normalized);
  }
};

export const couponRateLimitMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: generateRateLimitKey,
  message: {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many coupon validation attempts. Please try again later.",
      details: []
    }
  }
});

export const verifyPaymentRateLimitMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: generateRateLimitKey,
  message: {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many payment verification attempts. Please try again later.",
      details: []
    }
  }
});

/**
 * Dedicated rate limiter for public catalog browsing (products, categories).
 * Decoupled from sensitive account operations to ensure normal browsing
 * remains responsive while firmly mitigating excessive scraping or DoS.
 */
export const catalogRateLimitMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: generateRateLimitKey,
  message: {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many catalog requests, please try again later.",
      details: []
    }
  }
});

const originalCatalogResetKey = catalogRateLimitMiddleware.resetKey;
catalogRateLimitMiddleware.resetKey = (key) => {
  originalCatalogResetKey(key);
  const normalized = normalizeClientIp(key);
  if (normalized !== key) {
    originalCatalogResetKey(normalized);
  }
};

export default authRateLimitMiddleware;
