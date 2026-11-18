import { clearAuthCookie, clearRefreshCookie } from "../../config/cookie.js";
import { revokeAllUserTokens } from "./refresh-token.service.js";

/**
 * POST /api/v1/users/logout-all
 *
 * Terminates all active sessions across all devices for the authenticated user:
 * 1. Increments user.tokenVersion, instantly invalidating all active access tokens.
 * 2. Marks all RefreshToken records for the user as revoked in MongoDB.
 * 3. Clears both auth_token and refresh_token cookies on the current client.
 */
async function logoutAllUser(req, res, next) {
  try {
    const user = req.user;

    // Increment tokenVersion to immediately revoke any active access tokens across all devices
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await user.save();

    // Revoke all refresh tokens for this user in MongoDB
    await revokeAllUserTokens(user._id);

    // Clear cookies on the current device
    clearAuthCookie(res);
    clearRefreshCookie(res);

    return res.status(200).json({
      success: true,
      message: "Logged out from all devices successfully",
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

export default logoutAllUser;
