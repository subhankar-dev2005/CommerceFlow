import mongoose from "mongoose";

const refreshTokenSchema = new mongoose.Schema(
  {
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    family: {
      type: String,
      required: true,
      index: true
    },

    audience: {
      type: String,
      enum: ["customer", "admin", "super_admin"],
      default: "customer",
      required: true
    },

    tokenVersion: {
      type: Number,
      default: 0
    },

    isRevoked: {
      type: Boolean,
      default: false,
      index: true
    },

    replacedByTokenHash: {
      type: String,
      default: null
    },

    rotatedAt: {
      type: Date,
      default: null
    },

    expiresAt: {
      type: Date,
      required: true
    }
  },
  {
    timestamps: true
  }
);

// Unique index on tokenHash
refreshTokenSchema.index({ tokenHash: 1 }, { unique: true });

// Compound index for active user tokens lookup
refreshTokenSchema.index({ userId: 1, isRevoked: 1 });

// Index for family-wide revocation during reuse detection
refreshTokenSchema.index({ family: 1 });

// TTL index for automated MongoDB cleanup of expired session records.
// Application logic still strictly validates expiresAt on every request.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const RefreshToken = mongoose.model("RefreshToken", refreshTokenSchema);

export default RefreshToken;
