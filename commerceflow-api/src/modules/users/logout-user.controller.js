import { clearAuthCookie } from "../../config/cookie.js";

/**
 * POST /api/v1/users/logout
 *
 * Clears the HttpOnly authentication cookie from the browser.
 * Does not require authentication — clearing a non-existent or already-invalid
 * cookie is harmless and preferable to forcing authenticated state before logout.
 */
async function logoutUser(req, res, next) {
  try {
    clearAuthCookie(res);

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
