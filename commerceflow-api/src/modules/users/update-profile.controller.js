
import User from "./user.model.js";
import AppError from "../../common/errors/app-error.js";

async function updateProfile(req, res, next) {
  try {
    const { name, email } = req.body;

    const user = await User.findById(req.user._id);

    if (!user) {
      throw new AppError(
        "User not found",
        404,
        [],
        "USER_NOT_FOUND"
      );
    }

    if (email && email !== user.email) {
      const existingUser = await User.findOne({
        email,
        _id: { $ne: user._id }
      });

      if (existingUser) {
        throw new AppError(
          "Email is already registered",
          409,
          [],
          "EMAIL_ALREADY_EXISTS"
        );
      }
    }

    if (name !== undefined) {
      user.name = name;
    }

    if (email !== undefined) {
      user.email = email;
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: "User profile updated successfully",
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
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

export default updateProfile;
