import RecentlyViewed from "./recently-viewed.model.js";
import Product from "../products/product.model.js";
import AppError from "../../common/errors/app-error.js";
import {
  DEFAULT_RECENTLY_VIEWED_LIMIT,
  MAX_RECENTLY_VIEWED_LIMIT,
  MAX_STORED_RECENTLY_VIEWED
} from "./recently-viewed.constants.js";

/**
 * Record a product view for an authenticated user.
 *
 * Invariants:
 * - Product must exist and be active (isActive: true).
 * - Out-of-stock active products may be viewed.
 * - Inactive or non-existent products reject with 404 PRODUCT_NOT_FOUND.
 * - Atomic upsert on { user, product } compound unique index.
 * - Duplicate views update viewedAt to the current timestamp.
 * - Duplicate key races (E11000) are caught and gracefully retried.
 * - Bounded cleanup: prunes user's stored records beyond MAX_STORED_RECENTLY_VIEWED when count > 15.
 *
 * @param {string|import("mongoose").Types.ObjectId} userId
 * @param {string|import("mongoose").Types.ObjectId} productId
 * @returns {Promise<{ productId: string, viewedAt: Date }>}
 */
export async function recordProductView(userId, productId) {
  const product = await Product.findOne({
    _id: productId,
    isActive: true
  }).select("_id isActive");

  if (!product) {
    throw new AppError("Product not found", 404, [], "PRODUCT_NOT_FOUND");
  }

  const now = new Date();
  let doc;

  try {
    doc = await RecentlyViewed.findOneAndUpdate(
      { user: userId, product: productId },
      { $set: { viewedAt: now } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (err) {
    if (err.code === 11000) {
      // Handle concurrent insert race condition gracefully
      doc = await RecentlyViewed.findOneAndUpdate(
        { user: userId, product: productId },
        { $set: { viewedAt: now } },
        { new: true }
      );
    } else {
      throw err;
    }
  }

  // Lightweight pruning guard to bound stored history per customer
  const count = await RecentlyViewed.countDocuments({ user: userId });
  if (count > MAX_STORED_RECENTLY_VIEWED + 3) {
    const surplus = await RecentlyViewed.find({ user: userId })
      .sort({ viewedAt: -1 })
      .skip(MAX_STORED_RECENTLY_VIEWED)
      .select("_id")
      .lean();

    if (surplus.length > 0) {
      const surplusIds = surplus.map((item) => item._id);
      await RecentlyViewed.deleteMany({ _id: { $in: surplusIds } });
    }
  }

  return {
    productId: productId.toString(),
    viewedAt: doc.viewedAt
  };
}

/**
 * Retrieve recently viewed products for an authenticated user.
 *
 * Invariants:
 * - Scoped strictly to the authenticated user.
 * - Ordered newest first (viewedAt: -1).
 * - Limit is bounded between 1 and MAX_RECENTLY_VIEWED_LIMIT.
 * - Populates current authoritative product data (no stored snapshots).
 * - Side-effect-free read: Inactive or deleted products are filtered out in memory.
 *
 * @param {string|import("mongoose").Types.ObjectId} userId
 * @param {number} [limit=10]
 * @returns {Promise<{ items: Array<{ viewedAt: Date, product: object }>, totalItems: number }>}
 */
export async function getRecentlyViewed(userId, limit = DEFAULT_RECENTLY_VIEWED_LIMIT) {
  const boundedLimit = Math.min(
    Math.max(parseInt(limit, 10) || DEFAULT_RECENTLY_VIEWED_LIMIT, 1),
    MAX_RECENTLY_VIEWED_LIMIT
  );

  // Fetch up to boundedLimit + buffer in case some referenced products were deleted or disabled
  const fetchLimit = Math.min(boundedLimit + 5, MAX_RECENTLY_VIEWED_LIMIT + 5);

  const rawRecords = await RecentlyViewed.find({ user: userId })
    .sort({ viewedAt: -1 })
    .limit(fetchLimit)
    .populate({
      path: "product",
      select: "_id name price stock category image images isActive ratingAverage ratingCount"
    })
    .lean();

  const validItems = rawRecords
    .filter(
      (record) =>
        record.product !== null &&
        record.product !== undefined &&
        record.product.isActive === true
    )
    .slice(0, boundedLimit)
    .map((record) => ({
      viewedAt: record.viewedAt,
      product: record.product
    }));

  return {
    items: validItems,
    totalItems: validItems.length
  };
}

/**
 * Clear all recently viewed history for an authenticated user.
 *
 * Invariants:
 * - Scoped strictly to the authenticated user's records.
 * - Never touches another user's history.
 * - Idempotent operation.
 *
 * @param {string|import("mongoose").Types.ObjectId} userId
 * @returns {Promise<{ success: boolean }>}
 */
export async function clearRecentlyViewed(userId) {
  await RecentlyViewed.deleteMany({ user: userId });
  return { success: true };
}

/**
 * Merge guest recently viewed history into an authenticated user's account upon login.
 *
 * Invariants:
 * - Accepts array of candidate product IDs.
 * - Verifies each product exists and is active.
 * - Preserves order of guest views by assigning decreasing timestamps.
 * - Caps stored records per user to MAX_STORED_RECENTLY_VIEWED.
 *
 * @param {string|import("mongoose").Types.ObjectId} userId
 * @param {string[]} productIds
 * @returns {Promise<{ mergedCount: number }>}
 */
export async function mergeRecentlyViewed(userId, productIds) {
  if (!Array.isArray(productIds) || productIds.length === 0) {
    return { mergedCount: 0 };
  }

  // Deduplicate incoming IDs preserving sequence
  const uniqueProductIds = [...new Set(productIds)];

  // Find active products
  const activeProducts = await Product.find({
    _id: { $in: uniqueProductIds },
    isActive: true
  })
    .select("_id")
    .lean();

  const activeIdSet = new Set(activeProducts.map((p) => p._id.toString()));
  const validProductIds = uniqueProductIds.filter((id) =>
    activeIdSet.has(id.toString())
  );

  if (validProductIds.length === 0) {
    return { mergedCount: 0 };
  }

  const now = Date.now();
  const bulkOps = validProductIds.map((pId, idx) => ({
    updateOne: {
      filter: { user: userId, product: pId },
      update: { $set: { viewedAt: new Date(now - idx * 1000) } },
      upsert: true
    }
  }));

  await RecentlyViewed.bulkWrite(bulkOps, { ordered: false });

  // Prune surplus records beyond MAX_STORED_RECENTLY_VIEWED
  const surplus = await RecentlyViewed.find({ user: userId })
    .sort({ viewedAt: -1 })
    .skip(MAX_STORED_RECENTLY_VIEWED)
    .select("_id")
    .lean();

  if (surplus.length > 0) {
    const surplusIds = surplus.map((item) => item._id);
    await RecentlyViewed.deleteMany({ _id: { $in: surplusIds } });
  }

  return { mergedCount: validProductIds.length };
}

export default {
  recordProductView,
  getRecentlyViewed,
  clearRecentlyViewed,
  mergeRecentlyViewed
};
