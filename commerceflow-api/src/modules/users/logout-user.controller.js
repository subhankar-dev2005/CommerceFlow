import { clearAuthCookie, clearRefreshCookie } from "../../config/cookie.js";
import { extractRefreshToken } from "./refresh-token.controller.js";
import { revokeRefreshToken } from "./refresh-token.service.js";

/**
 * POST /api/v1/users/logout
 *
 * Clears HttpOnly authentication and refresh cookies from the browser,
 * and revokes the active refresh token record in MongoDB if present.
 * Does not require authentication — clearing non-existent or invalid cookies
 * is harmless and preferable to blocking logout.
 */
async function logoutUser(req, res, next) {
  try {
    const rawRefreshToken = extractRefreshToken(req);
    if (rawRefreshToken) {
      await revokeRefreshToken(rawRefreshToken);
    }

    clearAuthCookie(res);
    clearRefreshCookie(res);

    return res.status(200).json({
      success: true,
      message: "Logged out successfully",
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

export default logoutUser;
