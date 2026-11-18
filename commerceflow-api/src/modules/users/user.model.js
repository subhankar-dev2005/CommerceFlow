import mongoose from "mongoose";
import { ALL_ROLES, ROLES } from "../../config/roles.js";

const MFA_ENVELOPE_REGEX =
  /^v1:[0-9a-fA-F]{24}:[0-9a-fA-F]{32}:[0-9a-fA-F]+$/;

function validateMfaEnvelope(val) {
  if (val === null || val === undefined) {
    return true;
  }
  return typeof val === "string" && MFA_ENVELOPE_REGEX.test(val);
}

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
    },

    twoFactorEnabled: {
      type: Boolean,
      default: false,
      index: true
    },

    twoFactorSecret: {
      type: String,
      select: false,
      default: null,
      validate: {
        validator: validateMfaEnvelope,
        message: "Invalid MFA secret envelope format"
      }
    },

    twoFactorPendingSecret: {
      type: String,
      select: false,
      default: null,
      validate: {
        validator: validateMfaEnvelope,
        message: "Invalid MFA pending secret envelope format"
      }
    },

    twoFactorPendingExpiresAt: {
      type: Date,
      select: false,
      default: null
    },

    lastTotpStep: {
      type: Number,
      select: false,
      default: 0,
      min: [0, "lastTotpStep must be non-negative"]
    },

    twoFactorRecoveryCodes: {
      type: [
        {
          codeHash: {
            type: String,
            required: true
          },
          redeemedAt: {
            type: Date,
            default: null
          },
          createdAt: {
            type: Date,
            default: Date.now
          }
        }
      ],
      select: false,
      default: []
    },

    twoFactorEnrolledAt: {
      type: Date,
      default: null
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