import mongoose from "mongoose";
import { normalizeCouponCode } from "./coupon.validator.js";

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, "Coupon code is required"],
      trim: true,
      minlength: [3, "Coupon code must contain at least 3 characters"],
      maxlength: [20, "Coupon code cannot exceed 20 characters"]
    },

    normalizedCode: {
      type: String,
      required: [true, "Normalized coupon code is required"],
      trim: true,
      uppercase: true
    },

    type: {
      type: String,
      required: [true, "Coupon type is required"],
      enum: {
        values: ["percentage", "fixed"],
        message: "Type must be either 'percentage' or 'fixed'"
      }
    },

    value: {
      type: Number,
      required: [true, "Discount value is required"],
      validate: {
        validator: function (v) {
          if (!Number.isFinite(v) || v <= 0) return false;
          if (this.type === "percentage" && v > 100) return false;
          return true;
        },
        message: function (props) {
          if (props.value <= 0) {
            return "Value must be greater than 0";
          }
          return "Percentage discount cannot exceed 100%";
        }
      }
    },

    minimumSubtotal: {
      type: Number,
      required: true,
      default: 0,
      min: [0, "Minimum subtotal cannot be negative"],
      validate: {
        validator: (v) => Number.isFinite(v),
        message: "Minimum subtotal must be a finite number"
      }
    },

    maximumDiscount: {
      type: Number,
      default: null,
      validate: {
        validator: function (v) {
          if (v === null || v === undefined) return true;
          return Number.isFinite(v) && v > 0;
        },
        message: "Maximum discount must be greater than 0"
      }
    },

    startsAt: {
      type: Date,
      default: null
    },

    expiresAt: {
      type: Date,
      default: null
    },

    usageLimit: {
      type: Number,
      default: null,
      validate: {
        validator: function (v) {
          if (v === null || v === undefined) return true;
          return Number.isInteger(v) && v >= 1;
        },
        message: "Usage limit must be a positive integer"
      }
    },

    usedCount: {
      type: Number,
      required: true,
      default: 0,
      min: [0, "usedCount cannot be negative"],
      validate: {
        validator: (v) => Number.isInteger(v) && v >= 0,
        message: "usedCount must be a non-negative integer"
      }
    },

    reservations: {
      type: [String],
      default: []
    },

    perUserLimit: {
      type: Number,
      default: 1,
      validate: {
        validator: function (v) {
          if (v === null || v === undefined) return true;
          return Number.isInteger(v) && v >= 1;
        },
        message: "perUserLimit must be a positive integer"
      }
    },

    applicableProducts: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product"
        }
      ],
      default: [],
      validate: {
        validator: function (arr) {
          if (!arr || arr.length === 0) return true;
          const strIds = arr.map((id) => (id ? id.toString() : ""));
          return new Set(strIds).size === strIds.length;
        },
        message: "applicableProducts cannot contain duplicate product IDs"
      }
    },

    applicableCategories: {
      type: [
        {
          type: String,
          trim: true
        }
      ],
      default: [],
      validate: {
        validator: function (arr) {
          if (!arr || arr.length === 0) return true;
          const normalized = arr.map((c) => (c ? c.trim().toLowerCase() : ""));
          return new Set(normalized).size === normalized.length;
        },
        message: "applicableCategories cannot contain duplicate categories"
      }
    },

    isActive: {
      type: Boolean,
      required: true,
      default: true
    }
  },
  {
    timestamps: true
  }
);

// Pre-validate hook to populate normalizedCode and validate date coherence
couponSchema.pre("validate", function () {
  if (this.code) {
    this.normalizedCode = normalizeCouponCode(this.code);
  }

  if (this.startsAt && this.expiresAt) {
    const start = new Date(this.startsAt).getTime();
    const expiry = new Date(this.expiresAt).getTime();
    if (Number.isFinite(start) && Number.isFinite(expiry) && expiry < start) {
      this.invalidate("expiresAt", "expiresAt must be at or after startsAt");
    }
  }
});

// Primary unique index on normalizedCode
couponSchema.index({ normalizedCode: 1 }, { unique: true });

// Compound index for active coupon lookups and expiration filtering
couponSchema.index({ isActive: 1, expiresAt: 1 });

const Coupon = mongoose.model("Coupon", couponSchema);

export default Coupon;
