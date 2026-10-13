import mongoose from "mongoose";
import { RECENTLY_VIEWED_TTL_SECONDS } from "./recently-viewed.constants.js";

const recentlyViewedSchema = new mongoose.Schema(
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

    viewedAt: {
      type: Date,
      default: Date.now,
      required: true
    }
  },
  {
    timestamps: false,
    versionKey: false
  }
);

/*
 * 1. Compound Unique Index:
 * Prevents duplicate user+product combinations at the database layer.
 * Enables atomic upsert via findOneAndUpdate({ user, product }, { $set: { viewedAt } }, { upsert: true }).
 */
recentlyViewedSchema.index(
  { user: 1, product: 1 },
  { unique: true }
);

/*
 * 2. Compound Sorting Index:
 * Covers primary retrieval pattern: find({ user }).sort({ viewedAt: -1 }).limit(n)
 * Fully satisfies Equality-Sort-Range (ESR) rule directly from the B-tree index.
 */
recentlyViewedSchema.index(
  { user: 1, viewedAt: -1 }
);

/*
 * 3. TTL Expiration Index:
 * Automatically expires dormant viewing history after 30 days via MongoDB's background TTL thread.
 */
recentlyViewedSchema.index(
  { viewedAt: 1 },
  { expireAfterSeconds: RECENTLY_VIEWED_TTL_SECONDS }
);

const RecentlyViewed = mongoose.model(
  "RecentlyViewed",
  recentlyViewedSchema
);

export { RecentlyViewed };
export default RecentlyViewed;
