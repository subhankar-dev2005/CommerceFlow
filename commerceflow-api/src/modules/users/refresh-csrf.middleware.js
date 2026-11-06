import AppError from "../../common/errors/app-error.js";
import { env } from "../../config/env.js";

/**
 * Validates Origin / Referer and mandates custom client headers
 * to defend cookie-authenticated endpoints (/users/refresh) against CSRF.
 *
 * Defense-in-depth layers:
 * 1. Origin header validation against configured CORS origins and host
 * 2. Mandated non-simple client header (X-CommerceFlow-Client or X-Requested-With)
 *    which forces browsers to execute a preflight CORS OPTIONS check
 */
export function refreshCsrfMiddleware(req, res, next) {
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  const host = req.get("host");

  // Determine allowed origins from environment configuration
  const configuredOrigin = env.CORS_ORIGIN;
  const allowedOrigins = Array.isArray(configuredOrigin)
    ? configuredOrigin
    : typeof configuredOrigin === "string"
      ? configuredOrigin.split(",").map((s) => s.trim())
      : [];

  // 1. Origin Header Validation (when present)
  if (origin) {
    const isSameOrigin = host && (origin === `http://${host}` || origin === `https://${host}`);
    const isAllowedOrigin = allowedOrigins.length > 0 && allowedOrigins.includes(origin);

    // If allowed origins are configured and the origin matches neither configured origins nor host
    if (allowedOrigins.length > 0 && !isSameOrigin && !isAllowedOrigin) {
      return next(
        new AppError(
          "Cross-origin request rejected by security policy",
          403,
          [],
          "CSRF_ORIGIN_INVALID"
        )
      );
    }
  } else if (referer) {
    // If Origin is omitted by browser but Referer is present, parse origin from Referer
    try {
      const refererUrl = new URL(referer);
      const refererOrigin = refererUrl.origin;
      const isSameOrigin = host && (refererOrigin === `http://${host}` || refererOrigin === `https://${host}`);
      const isAllowedOrigin = allowedOrigins.length > 0 && allowedOrigins.includes(refererOrigin);

      if (allowedOrigins.length > 0 && !isSameOrigin && !isAllowedOrigin) {
        return next(
          new AppError(
            "Cross-origin referer rejected by security policy",
            403,
            [],
            "CSRF_ORIGIN_INVALID"
          )
        );
      }
    } catch {
      // Malformed referer header
      return next(
        new AppError(
          "Invalid referer header",
          403,
          [],
          "CSRF_REFERER_INVALID"
        )
      );
    }
  }

  // 2. Custom Client Header Enforcement
  // Standard HTML forms/images cannot set custom headers, forcing CORS preflight
  const clientHeader = req.headers["x-commerceflow-client"] || req.headers["x-requested-with"];
  if (!clientHeader) {
    return next(
      new AppError(
        "Missing required client header (X-CommerceFlow-Client or X-Requested-With)",
        403,
        [],
        "CSRF_HEADER_MISSING"
      )
    );
  }

  next();
}

export default refreshCsrfMiddleware;
