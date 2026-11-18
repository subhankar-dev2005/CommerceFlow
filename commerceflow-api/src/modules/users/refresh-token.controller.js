import User from "./user.model.js";
import AppError from "../../common/errors/app-error.js";
import generateToken from "../../utils/generate-token.js";
import {
  REFRESH_COOKIE_NAME,
  setAuthCookie,
  setRefreshCookie,
  clearAuthCookie,
  clearRefreshCookie
} from "../../config/cookie.js";
import { parseCookies } from "../../utils/parse-cookies.js";
import { rotateRefreshToken, revokeFamily } from "./refresh-token.service.js";
import { ADMINISTRATIVE_ROLES, ROLES } from "../../config/roles.js";

/**
 * Extracts raw refresh token from either HttpOnly cookie or request body.
 *
 * @param {import("express").Request} req
 * @returns {string|null}
 */
export function extractRefreshToken(req) {
  if (req.cookies && req.cookies[REFRESH_COOKIE_NAME]) {
    return req.cookies[REFRESH_COOKIE_NAME];
  }

  if (req.headers?.cookie) {
    const parsed = parseCookies(req.headers.cookie);
    if (parsed[REFRESH_COOKIE_NAME]) {
      return parsed[REFRESH_COOKIE_NAME];
    }
  }

  if (req.body && typeof req.body.refreshToken === "string" && req.body.refreshToken.trim()) {
    return req.body.refreshToken.trim();
  }

  return null;
}

/**
 * POST /api/v1/users/refresh
 *
 * Rotates an active session refresh token and issues a new access token.
 * Strict Invariants:
 * 1. Single-use rotation with zero grace period.
 * 2. Re-loads live user state from MongoDB — never trusts role from token claims.
 * 3. Enforces customer vs admin audience isolation.
 * 4. Checks active account status.
 * 5. Sets both rotated auth_token and refresh_token HttpOnly cookies.
 */
export async function refreshToken(req, res, next) {
  try {
    const rawToken = extractRefreshToken(req);

    if (!rawToken) {
      throw new AppError(
        "Refresh token is required",
        401,
        [],
        "REFRESH_TOKEN_REQUIRED"
      );
    }

    // Atomically rotate refresh token
    const rotated = await rotateRefreshToken(rawToken);

    // Re-verify live user record from database
    const user = await User.findById(rotated.previousDoc.userId);

    if (!user) {
      // User was deleted while token existed: revoke family and clear cookies
      await revokeFamily(rotated.previousDoc.family);
      clearAuthCookie(res);
      clearRefreshCookie(res);
      throw new AppError("User no longer exists", 401, [], "USER_NOT_FOUND");
    }

    if (user.isActive === false) {
      // Account deactivated: revoke family and clear cookies
      await revokeFamily(rotated.previousDoc.family);
      clearAuthCookie(res);
      clearRefreshCookie(res);
      throw new AppError("User account is deactivated", 401, [], "ACCOUNT_DEACTIVATED");
    }

    // Check account-wide tokenVersion revocation (e.g. password change, logout-all)
    const sessionVersion = rotated.previousDoc.tokenVersion ?? 0;
    const userVersion = user.tokenVersion ?? 0;
    if (sessionVersion !== userVersion) {
      await revokeFamily(rotated.previousDoc.family);
      clearAuthCookie(res);
      clearRefreshCookie(res);
      throw new AppError(
        "Authentication token has been revoked",
        401,
        [],
        "AUTH_TOKEN_REVOKED"
      );
    }

    // Strict audience and role isolation:
    // 1. Administrative session requires active admin or super_admin role. Demoted account must fail closed.
    const isAdministrativeAudience =
      rotated.previousDoc.audience === "admin" ||
      rotated.previousDoc.audience === ROLES.SUPER_ADMIN;

    if (isAdministrativeAudience && !ADMINISTRATIVE_ROLES.includes(user.role)) {
      await revokeFamily(rotated.previousDoc.family);
      clearAuthCookie(res);
      clearRefreshCookie(res);
      throw new AppError(
        "Administrator privileges have been revoked",
        403,
        [],
        "FORBIDDEN"
      );
    }

    // 2. Customer session requires active customer role.
    // A customer promoted to admin must re-authenticate via the admin portal to establish an admin session.
    // Under no circumstances can a customer-audience session mint an administrative-role access token.
    if (rotated.previousDoc.audience === "customer" && user.role !== ROLES.CUSTOMER) {
      await revokeFamily(rotated.previousDoc.family);
      clearAuthCookie(res);
      clearRefreshCookie(res);
      throw new AppError(
        "Account privileges have changed. Please log in again.",
        403,
        [],
        "FORBIDDEN"
      );
    }

    // 3. Strictly bind token role to audience: customer session can NEVER mint "admin" or "super_admin"
    let tokenRole;
    if (isAdministrativeAudience) {
      tokenRole = user.role === ROLES.SUPER_ADMIN ? ROLES.SUPER_ADMIN : ROLES.ADMIN;
    } else {
      tokenRole = ROLES.CUSTOMER;
    }

    // Issue new access token using server-authoritative current role and tokenVersion
    const newAccessToken = generateToken({
      userId: user._id.toString(),
      email: user.email,
      role: tokenRole,
      tokenVersion: user.tokenVersion ?? 0
    });

    // Set rotated cookies
    setAuthCookie(res, newAccessToken);
    setRefreshCookie(res, rotated.newPlaintextToken);

    return res.status(200).json({
      success: true,
      message: "Session refreshed successfully",
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: tokenRole
        }
      },
      requestId: req.requestId
    });
  } catch (error) {
    // On reuse detection, expiration, revocation, or invalid token, wipe stale cookies from client.
    // CRITICAL: For CONCURRENT_REFRESH, do NOT clear cookies so the winning concurrent request's
    // newly minted cookies are preserved in the browser.
    if (
      error.code === "TOKEN_REUSE_DETECTED" ||
      error.code === "REFRESH_TOKEN_EXPIRED" ||
      error.code === "INVALID_REFRESH_TOKEN" ||
      error.code === "AUTH_TOKEN_REVOKED"
    ) {
      clearAuthCookie(res);
      clearRefreshCookie(res);
    }
    next(error);
  }
}

export default refreshToken;
