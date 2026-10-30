import mongoose from "mongoose";

export const BANNER_PLACEMENTS = Object.freeze([
  "hero_carousel",
  "category_top",
  "promotional_strip",
  "storefront_footer"
]);

export const BANNER_STATUSES = Object.freeze([
  "draft",
  "scheduled",
  "published",
  "active",
  "archived"
]);

export const BANNER_DESTINATION_TYPES = Object.freeze([
  "category",
  "product",
  "sale",
  "custom_internal",
  "external"
]);

/**
 * Validates that an image reference is either a valid HTTP/HTTPS URL or safe relative storage path.
 *
 * @param {string} val
 * @returns {boolean}
 */
export function isValidBannerImageUrl(val) {
  if (typeof val !== "string") return false;
  const trimmed = val.trim();
  if (!trimmed || trimmed.length > 1000) return false;

  // Safe internal relative path (e.g. /api/v1/banners/images/...)
  if (trimmed.startsWith("/")) {
    if (trimmed.startsWith("//")) return false;
    if (/(?:javascript|data|file|blob|vbscript):/i.test(trimmed)) return false;
    return true;
  }

  // Absolute URL
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Validates that a destination route or URL is safe:
 * 1. Safe relative internal path: starts with '/', not '//', no backslashes, no scheme-like prefixes
 * 2. Absolute HTTP/HTTPS URL: protocol strictly http: or https:, no embedded credentials (username/password), valid hostname
 * 3. Rejects control characters, backslashes, angle brackets, quotes, and unexpected schemes.
 *
 * @param {string} val
 * @returns {boolean}
 */
export function isValidBannerTargetUrl(val) {
  if (typeof val !== "string") return false;
  const trimmed = val.trim();
  if (!trimmed || trimmed.length > 500) return false;

  // Reject control characters, whitespace, backslashes, angle brackets, quotes, backticks
  if (/[\s\0-\x1F\x7F\\<>|"'`]/.test(trimmed)) {
    return false;
  }

  // Handle relative internal paths:
  if (trimmed.startsWith("/")) {
    if (trimmed.startsWith("//")) {
      return false;
    }
    if (/(?:javascript|data|file|blob|vbscript|ftp):/i.test(trimmed)) {
      return false;
    }
    return true;
  }

  // Handle absolute URLs:
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    if (parsed.username || parsed.password) {
      return false;
    }
    if (!parsed.hostname || parsed.hostname.length === 0) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

const bannerSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Banner title is required"],
      trim: true,
      minlength: [2, "Banner title must be at least 2 characters"],
      maxlength: [120, "Banner title cannot exceed 120 characters"]
    },

    heading: {
      type: String,
      trim: true,
      maxlength: [160, "Banner headline cannot exceed 160 characters"],
      default: ""
    },

    subtitle: {
      type: String,
      trim: true,
      maxlength: [255, "Banner subtitle cannot exceed 255 characters"],
      default: ""
    },

    buttonLabel: {
      type: String,
      trim: true,
      maxlength: [60, "Button label cannot exceed 60 characters"],
      default: ""
    },

    placement: {
      type: String,
      required: [true, "Banner placement is required"],
      enum: {
        values: BANNER_PLACEMENTS,
        message: "Invalid banner placement"
      },
      default: "hero_carousel"
    },

    imageUrl: {
      type: String,
      required: [true, "Desktop banner image URL is required"],
      trim: true,
      validate: {
        validator: isValidBannerImageUrl,
        message: "imageUrl must be a valid HTTP/HTTPS URL or safe relative storage path"
      }
    },

    desktopImage: {
      type: String,
      trim: true,
      default: ""
    },

    desktopImageStorageKey: {
      type: String,
      trim: true,
      default: null
    },

    mobileImageUrl: {
      type: String,
      trim: true,
      default: "",
      validate: {
        validator: function (v) {
          if (!v) return true;
          return isValidBannerImageUrl(v);
        },
        message: "mobileImageUrl must be a valid HTTP/HTTPS URL, safe storage path, or empty"
      }
    },

    mobileImage: {
      type: String,
      trim: true,
      default: ""
    },

    mobileImageStorageKey: {
      type: String,
      trim: true,
      default: null
    },

    altText: {
      type: String,
      required: [true, "Accessibility alt text is required"],
      trim: true,
      minlength: [3, "Alt text must be at least 3 characters"],
      maxlength: [250, "Alt text cannot exceed 250 characters"]
    },

    destinationType: {
      type: String,
      enum: {
        values: BANNER_DESTINATION_TYPES,
        message: "Invalid destination type"
      },
      default: "custom_internal"
    },

    targetUrl: {
      type: String,
      required: [true, "Destination route or URL is required"],
      trim: true,
      maxlength: [500, "Destination URL cannot exceed 500 characters"],
      validate: {
        validator: isValidBannerTargetUrl,
        message: "targetUrl must be a safe internal relative path (e.g. /shop) or valid HTTP/HTTPS URL without credentials"
      }
    },

    destination: {
      type: String,
      trim: true,
      default: ""
    },

    displayOrder: {
      type: Number,
      default: 1,
      validate: {
        validator: Number.isInteger,
        message: "displayOrder must be an integer"
      }
    },

    position: {
      type: Number,
      default: 1,
      validate: {
        validator: Number.isInteger,
        message: "position must be an integer"
      }
    },

    status: {
      type: String,
      enum: {
        values: BANNER_STATUSES,
        message: "Invalid banner status"
      },
      default: "published"
    },

    startsAt: {
      type: Date,
      default: null
    },

    expiresAt: {
      type: Date,
      default: null
    },

    endsAt: {
      type: Date,
      default: null
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Synchronize dual field names (desktopImage <-> imageUrl, position <-> displayOrder, endsAt <-> expiresAt)
bannerSchema.pre("validate", function () {
  if (this.desktopImage && !this.imageUrl) {
    this.imageUrl = this.desktopImage;
  } else if (this.imageUrl && !this.desktopImage) {
    this.desktopImage = this.imageUrl;
  }

  if (this.mobileImage && !this.mobileImageUrl) {
    this.mobileImageUrl = this.mobileImage;
  } else if (this.mobileImageUrl && !this.mobileImage) {
    this.mobileImage = this.mobileImageUrl;
  }

  if (this.destination && !this.targetUrl) {
    this.targetUrl = this.destination;
  } else if (this.targetUrl && !this.destination) {
    this.destination = this.targetUrl;
  }

  if (this.position !== undefined && this.displayOrder === undefined) {
    this.displayOrder = this.position;
  } else if (this.displayOrder !== undefined && this.position === undefined) {
    this.position = this.displayOrder;
  }

  if (this.endsAt && !this.expiresAt) {
    this.expiresAt = this.endsAt;
  } else if (this.expiresAt && !this.endsAt) {
    this.endsAt = this.expiresAt;
  }

  // Ensure schedule ordering integrity
  const effectiveEnd = this.endsAt || this.expiresAt;
  if (this.startsAt && effectiveEnd && new Date(effectiveEnd) <= new Date(this.startsAt)) {
    this.invalidate("endsAt", "endsAt must be after startsAt");
  }
});

// Indexes for query performance and deterministic sorting
bannerSchema.index({ placement: 1, status: 1, displayOrder: 1, position: 1 });
bannerSchema.index({ status: 1, startsAt: 1, expiresAt: 1, endsAt: 1 });

/**
 * Returns whether the banner is active at the specified timestamp.
 */
bannerSchema.methods.isCurrentlyActive = function (now = new Date()) {
  const isPublished = this.status === "published" || this.status === "active";
  if (!isPublished) return false;
  const current = new Date(now).getTime();
  if (this.startsAt && new Date(this.startsAt).getTime() > current) return false;
  const effectiveEnd = this.endsAt || this.expiresAt;
  if (effectiveEnd && new Date(effectiveEnd).getTime() < current) return false;
  return Boolean(this.imageUrl || this.desktopImage);
};

const Banner = mongoose.model("Banner", bannerSchema);

export default Banner;
