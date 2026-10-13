
import User from "./user.model.js";
import AppError from "../../common/errors/app-error.js";

async function getMe(req, res, next) {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      throw new AppError(
        "User not found",
        404,
        [],
        "USER_NOT_FOUND"
      );
    }

    return res.status(200).json({
      success: true,
      message: "User profile retrieved successfully",
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

export default getMe;

