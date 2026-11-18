import crypto from "crypto";
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
  adminLoginRateLimitMiddleware.resetKey(key);
  adminMfaVerifyRateLimitMiddleware.resetKey(key);
  adminMfaRecoveryRateLimitMiddleware.resetKey(key);
  adminMfaSetupRateLimitMiddleware.resetKey(key);
  adminMfaActivateRateLimitMiddleware.resetKey(key);
  adminMfaRegenerateRateLimitMiddleware.resetKey(key);
  adminMfaDisableRateLimitMiddleware.resetKey(key);
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


export function hashLoginIdentifier(email) {
  if (typeof email !== "string") return null;
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return null;
  return crypto.createHash("sha256").update(trimmed).digest("hex");
}

function isIpAddress(str) {
  if (typeof str !== "string") return false;
  const trimmed = str.trim();
  return (
    trimmed === "localhost" ||
    trimmed === "::1" ||
    /^::ffff:\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(trimmed) ||
    /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(trimmed) ||
    /^[0-9a-fA-F:]{3,}$/.test(trimmed)
  );
}

/**
 * Generates an account-level rate limit key for customer login.
 * Prefixes with "cust_acct_" to ensure strict namespace isolation from IP keys
 * and from administrator account keys.
 *
 * @param {import("express").Request} req
 * @returns {string}
 */
export function generateAdminAccountKey(req) {
  const hash = hashLoginIdentifier(req?.body?.email);
  if (hash) {
    return `admin_acct_${hash}`;
  }
  const ip = normalizeClientIp(req?.ip);
  return `admin_acct_ip_${ipKeyGenerator(ip)}`;
}

/**
 * Generates an IP-level rate limit key for administrator login.
 * Prefixed with "admin_ip_" for namespace isolation.
 *
 * @param {import("express").Request} req
 * @returns {string}
 */
export function generateAdminIpKey(req) {
  const ip = normalizeClientIp(req?.ip);
  return `admin_ip_${ipKeyGenerator(ip)}`;
}

/**
 * Customer Login IP Rate Limiter (Defense in Depth: Layer 1).
 * Enforces 10 attempts per 15-minute window per IP address.
 */
export const adminLoginIpRateLimitMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: generateAdminIpKey,
  validate: { keyGeneratorIpFallback: false },
  message: {
    success: false,
    error: {
      code: "AUTH_RATE_LIMIT_EXCEEDED",
      message: "Too many admin login attempts from this IP address. Please try again later.",
      details: []
    }
  }
});

const originalAdminLoginIpReset = adminLoginIpRateLimitMiddleware.resetKey;
adminLoginIpRateLimitMiddleware.resetKey = (key) => {
  originalAdminLoginIpReset(key);
  if (key && typeof key === "string" && !key.startsWith("admin_ip_")) {
    const normalized = normalizeClientIp(key);
    originalAdminLoginIpReset(`admin_ip_${key}`);
    originalAdminLoginIpReset(`admin_ip_${ipKeyGenerator(key)}`);
    if (normalized !== key) {
      originalAdminLoginIpReset(`admin_ip_${normalized}`);
      originalAdminLoginIpReset(`admin_ip_${ipKeyGenerator(normalized)}`);
    }
  }
};

/**
 * Administrator Login Account Rate Limiter (Anti-Bruteforce: Layer 2).
 * Enforces 10 attempts per 15-minute window per normalized admin account identifier.
 * Uses skipSuccessfulRequests so legitimate logins do not count against failed login allowance.
 */
export const adminLoginAccountRateLimitMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: generateAdminAccountKey,
  validate: { keyGeneratorIpFallback: false },
  message: {
    success: false,
    error: {
      code: "AUTH_RATE_LIMIT_EXCEEDED",
      message: "Too many admin login attempts for this account. Please try again later.",
      details: []
    }
  }
});

const originalAdminLoginAccountReset =
  adminLoginAccountRateLimitMiddleware.resetKey;
adminLoginAccountRateLimitMiddleware.resetKey = (key) => {
  originalAdminLoginAccountReset(key);
  if (key && typeof key === "string") {
    if (!key.startsWith("admin_acct_")) {
      const hash = hashLoginIdentifier(key);
      if (hash) {
        originalAdminLoginAccountReset(`admin_acct_${hash}`);
      }
      if (isIpAddress(key)) {
        const normalized = normalizeClientIp(key);
        originalAdminLoginAccountReset(`admin_acct_ip_${key}`);
        originalAdminLoginAccountReset(`admin_acct_ip_${ipKeyGenerator(key)}`);
        if (normalized !== key) {
          originalAdminLoginAccountReset(`admin_acct_ip_${normalized}`);
          originalAdminLoginAccountReset(`admin_acct_ip_${ipKeyGenerator(normalized)}`);
        }
      }
    }
  }
};

/**
 * Composite Administrator Login Rate Limiting Middleware.
 * Sequentially applies the IP-level limiter (Layer 1) and Account-level limiter (Layer 2).
 * Strictly isolated from customer login to prevent cross-endpoint denial of service.
 * The account limiter uses skipSuccessfulRequests: true so that successful admin logins only exclude
 * their own attempt from the failure quota (net zero change) without wiping prior failed attempts
 * or erasing concurrent requests' failure accounting.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
export function adminLoginRateLimitMiddleware(req, res, next) {
  adminLoginIpRateLimitMiddleware(req, res, (err) => {
    if (err) return next(err);
    adminLoginAccountRateLimitMiddleware(req, res, next);
  });
}

adminLoginRateLimitMiddleware.resetKey = (key) => {
  adminLoginIpRateLimitMiddleware.resetKey(key);
  adminLoginAccountRateLimitMiddleware.resetKey(key);
};

/**
 * Dedicated rate limiter for session refresh (/users/refresh).
 * Decoupled from login endpoints to prevent shared NAT/office networks or
 * multi-tab refresh operations from prematurely exhausting the strict login limit.
 * Allows 60 requests per 15 minutes (~4/min) per IP.
 */
export function hashChallengeTokenForRateLimit(token) {
  if (typeof token !== "string") return null;
  const trimmed = token.trim();
  if (!trimmed || trimmed.length > 256) return null;
  return crypto.createHash("sha256").update(trimmed).digest("hex");
}

/**
 * Key generator for Admin MFA Verification IP rate limiting.
 */
export function generateAdminMfaVerifyIpKey(req) {
  const ip = normalizeClientIp(req?.ip);
  return `admin_mfa_v_ip_${ipKeyGenerator(ip)}`;
}

/**
 * Key generator for Admin MFA Verification Account/Challenge rate limiting.
 * Prefers authenticated userId if available; otherwise uses SHA-256 hash of challengeToken.
 * Falls back to IP if both are absent/malformed.
 */
export function generateAdminMfaVerifyAccountKey(req) {
  const userId = req?.user?._id?.toString() || req?.user?.id?.toString();
  if (userId && typeof userId === "string") {
    return `admin_mfa_v_acct_${userId}`;
  }
  const tokenHash = hashChallengeTokenForRateLimit(req?.body?.challengeToken);
  if (tokenHash) {
    return `admin_mfa_v_ch_${tokenHash}`;
  }
  const ip = normalizeClientIp(req?.ip);
  return `admin_mfa_v_ch_ip_${ipKeyGenerator(ip)}`;
}

/**
 * Key generator for Admin MFA Recovery IP rate limiting.
 */
export function generateAdminMfaRecoveryIpKey(req) {
  const ip = normalizeClientIp(req?.ip);
  return `admin_mfa_rec_ip_${ipKeyGenerator(ip)}`;
}

/**
 * Key generator for Admin MFA Recovery Account/Challenge rate limiting.
 */
export function generateAdminMfaRecoveryAccountKey(req) {
  const userId = req?.user?._id?.toString() || req?.user?.id?.toString();
  if (userId && typeof userId === "string") {
    return `admin_mfa_rec_acct_${userId}`;
  }
  const tokenHash = hashChallengeTokenForRateLimit(req?.body?.challengeToken);
  if (tokenHash) {
    return `admin_mfa_rec_ch_${tokenHash}`;
  }
  const ip = normalizeClientIp(req?.ip);
  return `admin_mfa_rec_ch_ip_${ipKeyGenerator(ip)}`;
}

/**
 * Key generator for Admin MFA Setup IP rate limiting.
 */
export function generateAdminMfaSetupIpKey(req) {
  const ip = normalizeClientIp(req?.ip);
  return `admin_mfa_set_ip_${ipKeyGenerator(ip)}`;
}

/**
 * Key generator for Admin MFA Setup Account/Challenge rate limiting.
 */
export function generateAdminMfaSetupAccountKey(req) {
  const userId = req?.user?._id?.toString() || req?.user?.id?.toString();
  if (userId && typeof userId === "string") {
    return `admin_mfa_set_acct_${userId}`;
  }
  const tokenHash = hashChallengeTokenForRateLimit(req?.body?.challengeToken);
  if (tokenHash) {
    return `admin_mfa_set_ch_${tokenHash}`;
  }
  const ip = normalizeClientIp(req?.ip);
  return `admin_mfa_set_ch_ip_${ipKeyGenerator(ip)}`;
}

/**
 * Key generator for Admin MFA Activate IP rate limiting.
 */
export function generateAdminMfaActivateIpKey(req) {
  const ip = normalizeClientIp(req?.ip);
  return `admin_mfa_act_ip_${ipKeyGenerator(ip)}`;
}

/**
 * Key generator for Admin MFA Activate Account/Challenge rate limiting.
 */
export function generateAdminMfaActivateAccountKey(req) {
  const userId = req?.user?._id?.toString() || req?.user?.id?.toString();
  if (userId && typeof userId === "string") {
    return `admin_mfa_act_acct_${userId}`;
  }
  const tokenHash = hashChallengeTokenForRateLimit(req?.body?.challengeToken);
  if (tokenHash) {
    return `admin_mfa_act_ch_${tokenHash}`;
  }
  const ip = normalizeClientIp(req?.ip);
  return `admin_mfa_act_ch_ip_${ipKeyGenerator(ip)}`;
}

/**
 * Key generator for Admin MFA Recovery-Code Regeneration IP rate limiting.
 */
export function generateAdminMfaRegenerateIpKey(req) {
  const ip = normalizeClientIp(req?.ip);
  return `admin_mfa_regen_ip_${ipKeyGenerator(ip)}`;
}

/**
 * Key generator for Admin MFA Recovery-Code Regeneration Account rate limiting.
 * Keyed strictly on the authenticated administrator user ID (req.user._id).
 */
export function generateAdminMfaRegenerateAccountKey(req) {
  const userId = req?.user?._id?.toString() || req?.user?.id?.toString();
  if (userId && typeof userId === "string") {
    return `admin_mfa_regen_acct_${userId}`;
  }
  const ip = normalizeClientIp(req?.ip);
  return `admin_mfa_regen_acct_ip_${ipKeyGenerator(ip)}`;
}

/**
 * Key generator for Admin MFA Disable IP rate limiting.
 */
export function generateAdminMfaDisableIpKey(req) {
  const ip = normalizeClientIp(req?.ip);
  return `admin_mfa_dis_ip_${ipKeyGenerator(ip)}`;
}

/**
 * Key generator for Admin MFA Disable Account rate limiting.
 * Keyed strictly on the authenticated administrator user ID (req.user._id).
 */
export function generateAdminMfaDisableAccountKey(req) {
  const userId = req?.user?._id?.toString() || req?.user?.id?.toString();
  if (userId && typeof userId === "string") {
    return `admin_mfa_dis_acct_${userId}`;
  }
  const ip = normalizeClientIp(req?.ip);
  return `admin_mfa_dis_acct_ip_${ipKeyGenerator(ip)}`;
}

// ----------------------------------------------------------------------------
// 1. MFA Challenge Verification (TOTP) Rate Limiters
// ----------------------------------------------------------------------------
export const adminMfaVerifyIpRateLimitMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: generateAdminMfaVerifyIpKey,
  validate: { keyGeneratorIpFallback: false },
  message: {
    success: false,
    error: {
      code: "AUTH_RATE_LIMIT_EXCEEDED",
      message:
        "Too many MFA verification attempts from this IP address. Please try again later.",
      details: []
    }
  }
});

export const adminMfaVerifyAccountRateLimitMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: generateAdminMfaVerifyAccountKey,
  validate: { keyGeneratorIpFallback: false },
  message: {
    success: false,
    error: {
      code: "AUTH_RATE_LIMIT_EXCEEDED",
      message:
        "Too many MFA verification attempts for this challenge. Please try again later.",
      details: []
    }
  }
});

export function adminMfaVerifyRateLimitMiddleware(req, res, next) {
  adminMfaVerifyIpRateLimitMiddleware(req, res, (err) => {
    if (err) return next(err);
    adminMfaVerifyAccountRateLimitMiddleware(req, res, next);
  });
}

adminMfaVerifyRateLimitMiddleware.resetKey = (key) => {
  adminMfaVerifyIpRateLimitMiddleware.resetKey(key);
  adminMfaVerifyAccountRateLimitMiddleware.resetKey(key);
};

// ----------------------------------------------------------------------------
// 2. MFA Recovery Code Rate Limiters
// ----------------------------------------------------------------------------
export const adminMfaRecoveryIpRateLimitMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: generateAdminMfaRecoveryIpKey,
  validate: { keyGeneratorIpFallback: false },
  message: {
    success: false,
    error: {
      code: "AUTH_RATE_LIMIT_EXCEEDED",
      message:
        "Too many MFA recovery attempts from this IP address. Please try again later.",
      details: []
    }
  }
});

export const adminMfaRecoveryAccountRateLimitMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: generateAdminMfaRecoveryAccountKey,
  validate: { keyGeneratorIpFallback: false },
  message: {
    success: false,
    error: {
      code: "AUTH_RATE_LIMIT_EXCEEDED",
      message:
        "Too many recovery code attempts for this challenge. Please try again later.",
      details: []
    }
  }
});

export function adminMfaRecoveryRateLimitMiddleware(req, res, next) {
  adminMfaRecoveryIpRateLimitMiddleware(req, res, (err) => {
    if (err) return next(err);
    adminMfaRecoveryAccountRateLimitMiddleware(req, res, next);
  });
}

adminMfaRecoveryRateLimitMiddleware.resetKey = (key) => {
  adminMfaRecoveryIpRateLimitMiddleware.resetKey(key);
  adminMfaRecoveryAccountRateLimitMiddleware.resetKey(key);
};

// ----------------------------------------------------------------------------
// 3. MFA Setup Initiation Rate Limiters
// ----------------------------------------------------------------------------
export const adminMfaSetupIpRateLimitMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: generateAdminMfaSetupIpKey,
  validate: { keyGeneratorIpFallback: false },
  message: {
    success: false,
    error: {
      code: "AUTH_RATE_LIMIT_EXCEEDED",
      message:
        "Too many MFA setup attempts from this IP address. Please try again later.",
      details: []
    }
  }
});

export const adminMfaSetupAccountRateLimitMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: generateAdminMfaSetupAccountKey,
  validate: { keyGeneratorIpFallback: false },
  message: {
    success: false,
    error: {
      code: "AUTH_RATE_LIMIT_EXCEEDED",
      message:
        "Too many MFA setup attempts for this challenge. Please try again later.",
      details: []
    }
  }
});

export function adminMfaSetupRateLimitMiddleware(req, res, next) {
  adminMfaSetupIpRateLimitMiddleware(req, res, (err) => {
    if (err) return next(err);
    adminMfaSetupAccountRateLimitMiddleware(req, res, next);
  });
}

adminMfaSetupRateLimitMiddleware.resetKey = (key) => {
  adminMfaSetupIpRateLimitMiddleware.resetKey(key);
  adminMfaSetupAccountRateLimitMiddleware.resetKey(key);
};

// ----------------------------------------------------------------------------
// 4. MFA Enrollment Confirmation / Activation Rate Limiters
// ----------------------------------------------------------------------------
export const adminMfaActivateIpRateLimitMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: generateAdminMfaActivateIpKey,
  validate: { keyGeneratorIpFallback: false },
  message: {
    success: false,
    error: {
      code: "AUTH_RATE_LIMIT_EXCEEDED",
      message:
        "Too many MFA activation attempts from this IP address. Please try again later.",
      details: []
    }
  }
});

export const adminMfaActivateAccountRateLimitMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: generateAdminMfaActivateAccountKey,
  validate: { keyGeneratorIpFallback: false },
  message: {
    success: false,
    error: {
      code: "AUTH_RATE_LIMIT_EXCEEDED",
      message:
        "Too many MFA activation attempts for this challenge. Please try again later.",
      details: []
    }
  }
});

export function adminMfaActivateRateLimitMiddleware(req, res, next) {
  adminMfaActivateIpRateLimitMiddleware(req, res, (err) => {
    if (err) return next(err);
    adminMfaActivateAccountRateLimitMiddleware(req, res, next);
  });
}

adminMfaActivateRateLimitMiddleware.resetKey = (key) => {
  adminMfaActivateIpRateLimitMiddleware.resetKey(key);
  adminMfaActivateAccountRateLimitMiddleware.resetKey(key);
};

// ----------------------------------------------------------------------------
// 5. MFA Recovery-Code Regeneration Rate Limiters
// ----------------------------------------------------------------------------
export const adminMfaRegenerateIpRateLimitMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: generateAdminMfaRegenerateIpKey,
  validate: { keyGeneratorIpFallback: false },
  message: {
    success: false,
    error: {
      code: "AUTH_RATE_LIMIT_EXCEEDED",
      message:
        "Too many MFA recovery-code regeneration attempts from this IP address. Please try again later.",
      details: []
    }
  }
});

const originalAdminMfaRegenerateIpResetKey =
  adminMfaRegenerateIpRateLimitMiddleware.resetKey;
adminMfaRegenerateIpRateLimitMiddleware.resetKey = (key) => {
  originalAdminMfaRegenerateIpResetKey(key);
  const normalized = normalizeClientIp(key);
  if (normalized !== key) {
    originalAdminMfaRegenerateIpResetKey(normalized);
  }
  if (key && typeof key === "string" && !key.startsWith("admin_mfa_regen_ip_")) {
    originalAdminMfaRegenerateIpResetKey(`admin_mfa_regen_ip_${ipKeyGenerator(key)}`);
    originalAdminMfaRegenerateIpResetKey(`admin_mfa_regen_ip_${ipKeyGenerator(normalized)}`);
  }
};

export const adminMfaRegenerateAccountRateLimitMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: generateAdminMfaRegenerateAccountKey,
  validate: { keyGeneratorIpFallback: false },
  message: {
    success: false,
    error: {
      code: "AUTH_RATE_LIMIT_EXCEEDED",
      message:
        "Too many MFA recovery-code regeneration attempts for this account. Please try again later.",
      details: []
    }
  }
});

const originalAdminMfaRegenerateAccountResetKey =
  adminMfaRegenerateAccountRateLimitMiddleware.resetKey;
adminMfaRegenerateAccountRateLimitMiddleware.resetKey = (key) => {
  originalAdminMfaRegenerateAccountResetKey(key);
  if (key && typeof key === "string" && !key.startsWith("admin_mfa_regen_acct_")) {
    originalAdminMfaRegenerateAccountResetKey(`admin_mfa_regen_acct_${key}`);
  }
};

export function adminMfaRegenerateRateLimitMiddleware(req, res, next) {
  adminMfaRegenerateIpRateLimitMiddleware(req, res, (err) => {
    if (err) return next(err);
    adminMfaRegenerateAccountRateLimitMiddleware(req, res, next);
  });
}

adminMfaRegenerateRateLimitMiddleware.resetKey = (key) => {
  adminMfaRegenerateIpRateLimitMiddleware.resetKey(key);
  adminMfaRegenerateAccountRateLimitMiddleware.resetKey(key);
};

// ----------------------------------------------------------------------------
// 6. MFA Disable Rate Limiters
// ----------------------------------------------------------------------------
export const adminMfaDisableIpRateLimitMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: generateAdminMfaDisableIpKey,
  validate: { keyGeneratorIpFallback: false },
  message: {
    success: false,
    error: {
      code: "AUTH_RATE_LIMIT_EXCEEDED",
      message:
        "Too many MFA disable attempts from this IP address. Please try again later.",
      details: []
    }
  }
});

const originalAdminMfaDisableIpResetKey =
  adminMfaDisableIpRateLimitMiddleware.resetKey;
adminMfaDisableIpRateLimitMiddleware.resetKey = (key) => {
  originalAdminMfaDisableIpResetKey(key);
  const normalized = normalizeClientIp(key);
  if (normalized !== key) {
    originalAdminMfaDisableIpResetKey(normalized);
  }
  if (key && typeof key === "string" && !key.startsWith("admin_mfa_dis_ip_")) {
    originalAdminMfaDisableIpResetKey(`admin_mfa_dis_ip_${ipKeyGenerator(key)}`);
    originalAdminMfaDisableIpResetKey(`admin_mfa_dis_ip_${ipKeyGenerator(normalized)}`);
  }
};

export const adminMfaDisableAccountRateLimitMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: generateAdminMfaDisableAccountKey,
  validate: { keyGeneratorIpFallback: false },
  message: {
    success: false,
    error: {
      code: "AUTH_RATE_LIMIT_EXCEEDED",
      message:
        "Too many MFA disable attempts for this account. Please try again later.",
      details: []
    }
  }
});

const originalAdminMfaDisableAccountResetKey =
  adminMfaDisableAccountRateLimitMiddleware.resetKey;
adminMfaDisableAccountRateLimitMiddleware.resetKey = (key) => {
  originalAdminMfaDisableAccountResetKey(key);
  if (key && typeof key === "string" && !key.startsWith("admin_mfa_dis_acct_")) {
    originalAdminMfaDisableAccountResetKey(`admin_mfa_dis_acct_${key}`);
  }
};

export function adminMfaDisableRateLimitMiddleware(req, res, next) {
  adminMfaDisableIpRateLimitMiddleware(req, res, (err) => {
    if (err) return next(err);
    adminMfaDisableAccountRateLimitMiddleware(req, res, next);
  });
}

adminMfaDisableRateLimitMiddleware.resetKey = (key) => {
  adminMfaDisableIpRateLimitMiddleware.resetKey(key);
  adminMfaDisableAccountRateLimitMiddleware.resetKey(key);
};


export default authRateLimitMiddleware;
