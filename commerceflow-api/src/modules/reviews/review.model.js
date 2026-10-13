import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: [true, "Product reference is required"]
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

    rating: {
      type: Number,
      required: [true, "Rating is required"],
      min: [1, "Rating must be at least 1"],
      max: [5, "Rating cannot exceed 5"],
      validate: {
        validator: function (value) {
          return Number.isInteger(value);
        },
        message: "Rating must be an integer between 1 and 5"
      }
    },

    title: {
      type: String,
      trim: true,
      maxlength: [100, "Review title cannot exceed 100 characters"],
      default: ""
    },

    body: {
      type: String,
      required: [true, "Review body is required"],
      trim: true,
      minlength: [5, "Review body must be at least 5 characters"],
      maxlength: [2000, "Review body cannot exceed 2000 characters"]
    },

    isVerifiedBuyer: {
      type: Boolean,
      default: true,
      immutable: true
    },

    status: {
      type: String,
      enum: {
        values: ["published", "hidden", "flagged"],
        message: "Invalid review status"
      },
      default: "published"
    }
  },
  {
    timestamps: true
  }
);

// Compound Unique Index: Exactly one review per user per product (Authoritative duplicate invariant)
reviewSchema.index(
  { user: 1, product: 1 },
  { unique: true }
);

// Query Index: Optimized retrieval of public reviews by product and creation date
reviewSchema.index(
  { product: 1, status: 1, createdAt: -1 }
);

const Review = mongoose.model("Review", reviewSchema);

export default Review;
