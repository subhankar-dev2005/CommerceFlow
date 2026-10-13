import { env } from "./env.js";

export const AUTH_COOKIE_NAME = "auth_token";

/**
 * Calculates max-age in milliseconds based on JWT expiration setting.
 * Defaults to 20 minutes (1,200,000 ms).
 */
export function getCookieMaxAge() {
  const expiresIn = env.JWT_EXPIRES_IN || "20m";
  if (expiresIn.endsWith("m")) {
    const mins = parseInt(expiresIn, 10);
    return (isNaN(mins) ? 20 : mins) * 60 * 1000;
  }
  if (expiresIn.endsWith("h")) {
    const hours = parseInt(expiresIn, 10);
    return (isNaN(hours) ? 1 : hours) * 60 * 60 * 1000;
  }
  if (expiresIn.endsWith("d")) {
    const days = parseInt(expiresIn, 10);
    return (isNaN(days) ? 1 : days) * 24 * 60 * 60 * 1000;
  }
  if (expiresIn.endsWith("s")) {
    const secs = parseInt(expiresIn, 10);
    return (isNaN(secs) ? 1200 : secs) * 1000;
  }
  return 20 * 60 * 1000;
}

/**
 * Generates centralized, environment-aware cookie options.
 *
 * In production:
 * - httpOnly: true (prevents client-side script read/write)
 * - secure: true (restricted to HTTPS transmissions)
 * - sameSite: "lax" (mitigates CSRF for state-changing cross-origin requests)
 * - path: "/" (scoped to entire API application)
 * - maxAge: derived from JWT expiration (bounded lifetime)
 *
 * In development/test:
 * - secure: false (permits local HTTP testing without TLS certificates)
 */
export function getAuthCookieOptions(overrides = {}) {
  const isProduction = env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: getCookieMaxAge(),
    ...overrides
  };
}

/**
 * Sets the authentication cookie on the HTTP response.
 */
export function setAuthCookie(res, token, overrides = {}) {
  const options = getAuthCookieOptions(overrides);
  res.cookie(AUTH_COOKIE_NAME, token, options);
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
