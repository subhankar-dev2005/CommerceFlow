import bcrypt from "bcryptjs";

import User from "./user.model.js";
import AppError from "../../common/errors/app-error.js";
import generateToken from "../../utils/generate-token.js";
import { setAuthCookie, setRefreshCookie } from "../../config/cookie.js";
import { issueRefreshToken } from "./refresh-token.service.js";
import { ADMINISTRATIVE_ROLES } from "../../config/roles.js";

async function loginUser(
  req,
  res,
  next
) {
  try {
    const {
      email,
      password
    } = req.body;

    const user =
      await User.findOne({
        email
      }).select("+password");

    if (!user) {
      throw new AppError(
        "Invalid email or password",
        401,
        [],
        "INVALID_CREDENTIALS"
      );
    }

    const isPasswordValid =
      await bcrypt.compare(
        password,
        user.password
      );

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

    // Issue and set the cryptographically random refresh token cookie (Path: /api/v1/users)
    const sessionAudience = ADMINISTRATIVE_ROLES.includes(user.role) ? "admin" : "customer";
    const { plaintextToken } = await issueRefreshToken({
      userId: user._id,
      audience: sessionAudience,
      tokenVersion: user.tokenVersion ?? 0
    });
    setRefreshCookie(res, plaintextToken);

    return res
      .status(200)
      .json({
        success: true,

        message:
          "User logged in successfully",

        data: {
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role
          }
        },

        requestId:
          req.requestId
      });
  } catch (error) {
    next(error);
  }
}

export default loginUser;