import mongoose from "mongoose";

export const CAMPAIGN_STATUSES = Object.freeze(["active", "upcoming", "ended"]);

export const CAMPAIGN_BANNER_PLACEMENTS = Object.freeze([
  "hero_carousel",
  "category_top",
  "promotional_strip",
  "storefront_footer"
]);

const campaignSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Campaign name is required"],
      trim: true,
      minlength: [2, "Campaign name must contain at least 2 characters"],
      maxlength: [150, "Campaign name cannot exceed 150 characters"]
    },

    objective: {
      type: String,
      trim: true,
      maxlength: [1000, "Campaign objective cannot exceed 1000 characters"],
      default: ""
    },

    couponCode: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: [50, "Coupon code reference cannot exceed 50 characters"],
      default: null
    },

    startDate: {
      type: Date,
      required: [true, "Start date is required"]
    },

    endDate: {
      type: Date,
      required: [true, "End date is required"]
    },

    status: {
      type: String,
      required: [true, "Campaign status is required"],
      enum: {
        values: CAMPAIGN_STATUSES,
        message: "Status must be 'active', 'upcoming', or 'ended'"
      },
      default: "active"
    },

    bannerPlacement: {
      type: String,
      required: [true, "Banner placement is required"],
      enum: {
        values: CAMPAIGN_BANNER_PLACEMENTS,
        message:
          "Banner placement must be 'hero_carousel', 'category_top', 'promotional_strip', or 'storefront_footer'"
      },
      default: "hero_carousel"
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Pre-validate hook to enforce chronological date consistency: endDate >= startDate
campaignSchema.pre("validate", function () {
  if (this.startDate && this.endDate) {
    const start = new Date(this.startDate).getTime();
    const end = new Date(this.endDate).getTime();
    if (Number.isFinite(start) && Number.isFinite(end) && end < start) {
      this.invalidate("endDate", "End date must be at or after start date");
    }
  }
});

// Indexes for administrative listing, status filtering, and chronological sorting
campaignSchema.index({ status: 1, startDate: 1, endDate: 1 });
campaignSchema.index({ createdAt: -1 });

const Campaign = mongoose.model("Campaign", campaignSchema);

export default Campaign;
