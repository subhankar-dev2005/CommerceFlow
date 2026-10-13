import mongoose from "mongoose";

const wishlistItemSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true
    },

    addedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: false
  }
);

/*
 * Compound unique index.
 *
 * Primary query pattern: find({ user }) - covered by the prefix of this index.
 * Uniqueness: prevents duplicate user+product combinations at the database layer
 * without relying on application-level checks.
 *
 * Compatible with standalone MongoDB (no replica set required).
 */
wishlistItemSchema.index(
  { user: 1, product: 1 },
  { unique: true }
);

/*
 * Secondary index for future product-level analytics
 * (e.g., "how many users wishlisted product X").
 */
wishlistItemSchema.index({ product: 1 });

const WishlistItem = mongoose.model(
  "WishlistItem",
  wishlistItemSchema
);

export default WishlistItem;
