import bcrypt from "bcryptjs";

import User from "./user.model.js";
import AppError from "../../common/errors/app-error.js";
import generateToken from "../../utils/generate-token.js";
import { setAuthCookie } from "../../config/cookie.js";

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

    const token =
      generateToken({
        userId: user._id.toString(),
        email: user.email,
        role: user.role
      });

    // Set the JWT exclusively as an HttpOnly cookie.
    // The token is NEVER returned in the JSON response body — browser JavaScript
    // cannot read it. Non-browser API clients must use the Authorization: Bearer
    // header flow directly with their own token management.
    setAuthCookie(res, token);

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