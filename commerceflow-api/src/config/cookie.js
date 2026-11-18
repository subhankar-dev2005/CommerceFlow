import { env } from "./env.js";

export const AUTH_COOKIE_NAME = "auth_token";
export const REFRESH_COOKIE_NAME = "refresh_token";
export const REFRESH_COOKIE_PATH = "/api/v1/users";

/**
 * Determines whether cookies must be marked Secure.
 * Returns true if explicitly configured via COOKIE_SECURE="true",
 * or if running in an HTTPS deployment environment (production or staging).
 */
export function isSecureCookieEnvironment() {
  if (typeof env.COOKIE_SECURE === "string") {
    return env.COOKIE_SECURE.toLowerCase() === "true";
  }
  return env.NODE_ENV === "production" || env.NODE_ENV === "staging";
}

/**
 * Calculates max-age in milliseconds based on JWT expiration setting.
 * Defaults to 20 minutes (1,200,000 ms).
 */
export function getCookieMaxAge() {
  const expiresIn = env.JWT_EXPIRES_IN || "20m";
  return parseDurationToMs(expiresIn, 20 * 60 * 1000);
}

/**
 * Calculates refresh cookie max-age in milliseconds based on JWT_REFRESH_EXPIRES_IN.
 * Defaults to 7 days (604,800,000 ms).
 */
export function getRefreshCookieMaxAge() {
  const expiresIn = env.JWT_REFRESH_EXPIRES_IN || "7d";
  return parseDurationToMs(expiresIn, 7 * 24 * 60 * 60 * 1000);
}

/**
 * Helper to parse human-readable durations (e.g. "20m", "1h", "7d", "120s") to milliseconds.
 */
function parseDurationToMs(durationStr, defaultMs) {
  if (typeof durationStr !== "string") return defaultMs;
  if (durationStr.endsWith("m")) {
    const mins = parseInt(durationStr, 10);
    return (isNaN(mins) ? 20 : mins) * 60 * 1000;
  }
  if (durationStr.endsWith("h")) {
    const hours = parseInt(durationStr, 10);
    return (isNaN(hours) ? 1 : hours) * 60 * 60 * 1000;
  }
  if (durationStr.endsWith("d")) {
    const days = parseInt(durationStr, 10);
    return (isNaN(days) ? 7 : days) * 24 * 60 * 60 * 1000;
  }
  if (durationStr.endsWith("s")) {
    const secs = parseInt(durationStr, 10);
    return (isNaN(secs) ? 60 : secs) * 1000;
  }
  const parsed = parseInt(durationStr, 10);
  return isNaN(parsed) ? defaultMs : parsed;
}

/**
 * Generates centralized, environment-aware access cookie options.
 *
 * In production / staging:
 * - httpOnly: true (prevents client-side script read/write)
 * - secure: true (restricted to HTTPS transmissions)
 * - sameSite: "lax" (mitigates CSRF for state-changing cross-origin requests)
 * - path: "/" (scoped to entire API application)
 * - maxAge: derived from JWT expiration (bounded lifetime)
 *
 * In development / test:
 * - secure: false (permits local HTTP testing without TLS certificates)
 */
export function getAuthCookieOptions(overrides = {}) {
  return {
    httpOnly: true,
    secure: isSecureCookieEnvironment(),
    sameSite: "lax",
    path: "/",
    maxAge: getCookieMaxAge(),
    ...overrides
  };
}

/**
 * Generates centralized, environment-aware refresh cookie options.
 * Scoped strictly to the refresh path (/api/v1/users/refresh) to prevent
 * transmission on standard API requests.
 */
export function getRefreshCookieOptions(overrides = {}) {
  return {
    httpOnly: true,
    secure: isSecureCookieEnvironment(),
    sameSite: "lax",
    path: REFRESH_COOKIE_PATH,
    maxAge: getRefreshCookieMaxAge(),
    ...overrides
  };
}

/**
 * Sets the access authentication cookie on the HTTP response.
 */
export function setAuthCookie(res, token, overrides = {}) {
  const options = getAuthCookieOptions(overrides);
  res.cookie(AUTH_COOKIE_NAME, token, options);
}

/**
 * Sets the refresh token cookie on the HTTP response.
 */
export function setRefreshCookie(res, token, overrides = {}) {
  const options = getRefreshCookieOptions(overrides);
  res.cookie(REFRESH_COOKIE_NAME, token, options);
}

/**
 * Clears the authentication cookie on the HTTP response upon logout.
 */
export function clearAuthCookie(res, overrides = {}) {
  const options = getAuthCookieOptions(overrides);
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: options.httpOnly,
    secure: options.secure,
    sameSite: options.sameSite,
    path: options.path,
    domain: options.domain
  });
}

/**
 * Clears the refresh token cookie on the HTTP response upon logout.
 * Attributes (specifically path: REFRESH_COOKIE_PATH) match setRefreshCookie
 * so browser successfully removes the cookie.
 */
export function clearRefreshCookie(res, overrides = {}) {
  const options = getRefreshCookieOptions(overrides);
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: options.httpOnly,
    secure: options.secure,
    sameSite: options.sameSite,
    path: options.path,
    domain: options.domain
  });
}
