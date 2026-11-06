import bcrypt from "bcryptjs";

import User from "./user.model.js";
import AppError from "../../common/errors/app-error.js";
import generateToken from "../../utils/generate-token.js";
import { setAuthCookie, setRefreshCookie } from "../../config/cookie.js";
import { issueRefreshToken } from "./refresh-token.service.js";
import { ADMINISTRATIVE_ROLES } from "../../config/roles.js";

/**
 * POST /api/v1/users/admin/login
 *
 * Authenticates an administrator or super administrator account.
 * Strict invariants:
 * 1. Must verify user.role in ADMINISTRATIVE_ROLES from database BEFORE issuing session.
 * 2. If credentials match a customer, authentication is rejected with a generic
 *    error (no role disclosure) and NO session cookie is established.
 * 3. Does NOT return the JWT in the JSON body — sets HttpOnly cookie exclusively.
 * 4. Rejects inactive accounts.
 */
async function adminLoginUser(req, res, next) {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select("+password");

    if (!user) {
      throw new AppError(
        "Invalid email or password",
        401,
        [],
        "INVALID_CREDENTIALS"
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new AppError(
        "Invalid email or password",
        401,
        [],
        "INVALID_CREDENTIALS"
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

    // Explicit database role verification — reject non-administrative users
    if (!ADMINISTRATIVE_ROLES.includes(user.role)) {
      throw new AppError(
        "Invalid email or password",
        401,
        [],
        "INVALID_CREDENTIALS"
      );
    }

    const tokenPayload = {
      userId: user._id.toString(),
      email: user.email,
      role: user.role
    };
    if (user.tokenVersion) {
      tokenPayload.tokenVersion = user.tokenVersion;
    }

    const token = generateToken(tokenPayload);

    // Set the access JWT exclusively as an HttpOnly cookie
    setAuthCookie(res, token);

    // Issue and set the cryptographically random refresh token cookie for admin audience
    const { plaintextToken } = await issueRefreshToken({
      userId: user._id,
      audience: "admin",
      tokenVersion: user.tokenVersion ?? 0
    });
    setRefreshCookie(res, plaintextToken);

    return res.status(200).json({
      success: true,
      message: "Admin logged in successfully",
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        }
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

export default adminLoginUser;
