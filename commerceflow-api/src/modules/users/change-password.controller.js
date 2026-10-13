
import bcrypt from "bcryptjs";

import User from "./user.model.js";
import AppError from "../../common/errors/app-error.js";

async function changePassword(req, res, next) {
  try {
    const {
      currentPassword,
      newPassword
    } = req.body;

    const user = await User.findById(req.user._id)
      .select("+password");

    if (!user) {
      throw new AppError(
        "User not found",
        404,
        [],
        "USER_NOT_FOUND"
      );
    }

    const isCurrentPasswordValid =
      await bcrypt.compare(
        currentPassword,
        user.password
      );

    if (!isCurrentPasswordValid) {
      throw new AppError(
        "Current password is incorrect",
        400,
        [],
        "INVALID_CURRENT_PASSWORD"
      );
    }

    const hashedPassword =
      await bcrypt.hash(newPassword, 12);

    user.password = hashedPassword;

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Password changed successfully",
      data: {},
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

export default changePassword;

