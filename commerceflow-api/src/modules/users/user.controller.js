import bcrypt from "bcryptjs";

import User from "./user.model.js";
import AppError from "../../common/errors/app-error.js";
import generateToken from "../../utils/generate-token.js";

async function registerUser(
  req,
  res,
  next
) {
  try {
    const {
      name,
      email,
      password
    } = req.body;

    const existingUser =
      await User.findOne({
        email
      });

    if (existingUser) {
      throw new AppError(
        "Email is already registered",
        409,
        [],
        "EMAIL_ALREADY_EXISTS"
      );
    }

    const hashedPassword =
      await bcrypt.hash(
        password,
        12
      );

    const user =
      await User.create({
        name,
        email,
        password: hashedPassword
      });

    return res
      .status(201)
      .json({
        success: true,

        message:
          "User registered successfully",

        data: {
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            createdAt: user.createdAt
          }
        },

        requestId:
          req.requestId
      });
  } catch (error) {
    next(error);
  }
}

export default registerUser;