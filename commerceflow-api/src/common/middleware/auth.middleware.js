import AppError from "../errors/app-error.js";
import verifyToken from "../../utils/verify-token.js";
import User from "../../modules/users/user.model.js";
import { AUTH_COOKIE_NAME } from "../../config/cookie.js";
import { parseCookies } from "../../utils/parse-cookies.js";

/**
 * Extracts authentication token from either:
 * 1. Primary: HttpOnly cookie (`auth_token`) for browser sessions
 * 2. Secondary: `Authorization: Bearer <token>` header for non-browser/CLI clients
 */
export function extractToken(req) {
  if (req.cookies && req.cookies[AUTH_COOKIE_NAME]) {
    return req.cookies[AUTH_COOKIE_NAME];
  }

  if (req.headers?.cookie) {
    const parsed = parseCookies(req.headers.cookie);
    if (parsed[AUTH_COOKIE_NAME]) {
      return parsed[AUTH_COOKIE_NAME];
    }
  }

  const authorizationHeader = req.headers?.authorization;
  if (
    authorizationHeader &&
    authorizationHeader.startsWith("Bearer ")
  ) {
    return authorizationHeader.split(" ")[1];
  }

  return null;
}

async function authMiddleware(
  req,
  res,
  next
) {
  try {
    const token = extractToken(req);

    if (!token) {
      throw new AppError(
        "Authentication token is required",
        401,
        [],
        "AUTH_TOKEN_REQUIRED"
      );
    }


    const decoded =
      verifyToken(token);

    const user =
      await User.findById(
        decoded.userId
      );

    if (!user) {
      throw new AppError(
        "User no longer exists",
        401,
        [],
        "USER_NOT_FOUND"
      );
    }

    if (user.isActive === false) {
      throw new AppError(
        "User account is deactivated",
        401,
        [],
        "ACCOUNT_DEACTIVATED"
      );
    }

    req.user = user;

    next();
  } catch (error) {
    if (
      error.name ===
      "JsonWebTokenError"
    ) {
      return next(
        new AppError(
          "Invalid authentication token",
          401,
          [],
          "INVALID_AUTH_TOKEN"
        )
      );
    }

    if (
      error.name ===
      "TokenExpiredError"
    ) {
      return next(
        new AppError(
          "Authentication token has expired",
          401,
          [],
          "AUTH_TOKEN_EXPIRED"
        )
      );
    }

    next(error);
  }
}

export default authMiddleware;