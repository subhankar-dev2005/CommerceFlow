import mongoose from "mongoose";

const couponUsageSchema = new mongoose.Schema(
  {
    coupon: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Coupon",
      required: [true, "Coupon reference is required"]
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User reference is required"]
    },

    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: [true, "Order reference is required"]
    },

    couponCode: {
      type: String,
      required: [true, "Coupon code is required"],
      trim: true
    },

    discountAmount: {
      type: Number,
      required: [true, "Discount amount is required"],
      min: [0, "Discount amount cannot be negative"]
    },

    status: {
      type: String,
      enum: {
        values: ["redeemed"],
        message: "Status must be 'redeemed'"
      },
      default: "redeemed",
      required: true
    },

    redeemedAt: {
      type: Date,
      default: Date.now,
      required: true
    }
  },
  {
    timestamps: true
  }
);

// Prevent duplicate coupon redemptions for the same order
couponUsageSchema.index({ coupon: 1, order: 1 }, { unique: true });

// Optimize lookup for per-user coupon redemption limit queries
couponUsageSchema.index({ coupon: 1, user: 1 });

const CouponUsage = mongoose.model("CouponUsage", couponUsageSchema);

export default CouponUsage;
