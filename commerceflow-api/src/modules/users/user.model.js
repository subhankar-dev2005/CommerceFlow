import mongoose from "mongoose";
import { ALL_ROLES, ROLES } from "../../config/roles.js";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },

    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false
    },

    role: {
      type: String,
      enum: ALL_ROLES,
      default: ROLES.CUSTOMER
    },

    isActive: {
      type: Boolean,
      default: true
    },

    tokenVersion: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

userSchema.index({
  role: 1,
  createdAt: -1
});

userSchema.index({
  role: 1,
  isActive: 1,
  createdAt: -1
});

const User = mongoose.model(
  "User",
  userSchema
);

export default User;