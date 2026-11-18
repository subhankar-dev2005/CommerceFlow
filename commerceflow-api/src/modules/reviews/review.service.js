import mongoose from "mongoose";
import Order from "../orders/order.model.js";
import Product from "../products/product.model.js";
import Review from "./review.model.js";
import AppError from "../../common/errors/app-error.js";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

function isValidObjectId(id) {
  if (!id) return false;
  const strId = String(id);
  return objectIdRegex.test(strId) && mongoose.Types.ObjectId.isValid(strId);
}

/**
 * Discovers if an authenticated user has an eligible qualifying purchase for a given product.
 *
 * Server-authoritative invariant:
 * - Order must belong to userId (ownership)
 * - Order status must be "delivered"
 * - Order payment status must be "paid"
 * - Order items snapshot must contain productId
 * - If multiple qualifying orders exist, deterministically selects the most recent one (createdAt: -1)
 *
 * @param {string|mongoose.Types.ObjectId} userId - Authenticated user ObjectId
 * @param {string|mongoose.Types.ObjectId} productId - Target product ObjectId
 * @returns {Promise<{ eligible: boolean, order: object|null }>}
 */
export async function findQualifyingOrder(userId, productId) {
  if (!isValidObjectId(userId) || !isValidObjectId(productId)) {
    return {
      eligible: false,
      order: null
    };
  }

  const userObjectId = new mongoose.Types.ObjectId(userId);
  const productObjectId = new mongoose.Types.ObjectId(productId);

  const qualifyingOrder = await Order.findOne({
    user: userObjectId,
    status: "delivered",
    "payment.status": "paid",
    "items.product": productObjectId
  })
    .sort({ createdAt: -1 })
    .lean();

  if (!qualifyingOrder) {
    return {
      eligible: false,
      order: null
    };
  }

  return {
    eligible: true,
    order: qualifyingOrder
  };
}

/**
 * Aggregates all published reviews for a product and atomically updates Product.ratingAverage
 * and Product.ratingCount using an idempotent MongoDB $set operation.
 *
 * Invariant rules:
 * - Only reviews with status === "published" contribute to rating metrics.
 * - Hidden and flagged reviews are strictly excluded.
 * - If no published reviews exist, resets ratingCount to 0 and ratingAverage to 0.
 * - Rating average is deterministically rounded to 2 decimal places.
 * - Fails with 404 PRODUCT_NOT_FOUND if the product does not exist in the database.
 */

// Concurrency control: per-product in-flight recalculation tracker
const inFlightRecalculations = new Map();

export function clearActiveRecalculations() {
  inFlightRecalculations.clear();
}

/**
 * Executes a single atomic aggregation and update pass for a product.
 *
 * @param {string|mongoose.Types.ObjectId} productId
 * @param {mongoose.ClientSession|null} [session=null]
 * @returns {Promise<{ ratingAverage: number, ratingCount: number, product: object }>}
 */
async function executeRatingAggregation(productId, session = null) {
  const productObjectId = new mongoose.Types.ObjectId(productId);

  const productExists = await Product.exists({ _id: productObjectId });
  if (!productExists) {
    throw new AppError("Product not found", 404, [], "PRODUCT_NOT_FOUND");
  }

  const pipeline = [
    {
      $match: {
        product: productObjectId,
        status: "published"
      }
    },
    {
      $group: {
        _id: "$product",
        ratingCount: { $sum: 1 },
        ratingAverage: { $avg: "$rating" }
      }
    }
  ];

  let agg = Review.aggregate(pipeline);
  if (session && typeof agg?.session === "function") {
    agg = agg.session(session);
  }
  const stats = await agg;

  const hasPublishedReviews = Array.isArray(stats) && stats.length > 0 && stats[0].ratingCount > 0;
  const ratingCount = hasPublishedReviews ? stats[0].ratingCount : 0;
  const ratingAverage = hasPublishedReviews
    ? Math.round(stats[0].ratingAverage * 100) / 100
    : 0;

  const updateOptions = { new: true };
  if (session) {
    updateOptions.session = session;
  }

  const updatedProduct = await Product.findByIdAndUpdate(
    productObjectId,
    {
      $set: {
        ratingAverage,
        ratingCount,
        changeToken: new mongoose.Types.ObjectId().toHexString()
      }
    },
    updateOptions
  );

  return {
    ratingAverage,
    ratingCount,
    product: updatedProduct
  };
}

/**
 * Aggregates all published reviews for a product and atomically updates Product.ratingAverage
 * and Product.ratingCount using an idempotent MongoDB $set operation.
 *
 * Concurrency & Invariant rules:
 * - Coalesces concurrent recalculation requests for the same product to prevent stale write overwrites.
 * - If a recalculation is already executing when a new request arrives, a rerun pass is automatically
 *   scheduled so that all intermediate review mutations are captured.
 * - Only reviews with status === "published" contribute to rating metrics.
 * - Hidden and flagged reviews are strictly excluded.
 * - If no published reviews exist, resets ratingCount to 0 and ratingAverage to 0.
 * - Rating average is deterministically rounded to 2 decimal places.
 * - Fails with 404 PRODUCT_NOT_FOUND if the product does not exist in the database.
 *
 * @param {string|mongoose.Types.ObjectId} productId - Target product ObjectId
 * @param {Object} [options={}]
 * @param {mongoose.ClientSession} [options.session]
 * @returns {Promise<{ ratingAverage: number, ratingCount: number, product: object }>}
 */
export async function recalculateProductRating(productId, options = {}) {
  if (!isValidObjectId(productId)) {
    throw new AppError("Invalid product ID", 400, [], "INVALID_ID");
  }

  const session = options?.session || null;
  const key = String(productId);

  // If running within an explicit MongoDB session, execute directly with that session
  if (session) {
    return executeRatingAggregation(productId, session);
  }

  // If a recalculation for this product is already in flight, mark that another pass is needed
  // and share the resolving promise to ensure latest state is captured.
  if (inFlightRecalculations.has(key)) {
    const entry = inFlightRecalculations.get(key);
    entry.rerunNeeded = true;
    return entry.promise;
  }

  const entry = {
    rerunNeeded: false,
    promise: null
  };

  entry.promise = (async () => {
    try {
      let result;
      // Loop until all pending rerun requests that arrived during execution have been processed
      do {
        entry.rerunNeeded = false;
        result = await executeRatingAggregation(productId, null);
      } while (entry.rerunNeeded);
      return result;
    } finally {
      inFlightRecalculations.delete(key);
    }
  })();

  inFlightRecalculations.set(key, entry);
  return entry.promise;
}

/**
 * Inspects whether a product's stored ratingAverage and ratingCount match the actual published reviews.
 *
 * @param {string|mongoose.Types.ObjectId} productId
 * @returns {Promise<{ isConsistent: boolean, stored: { ratingAverage: number, ratingCount: number }, actual: { ratingAverage: number, ratingCount: number } }>}
 */
export async function checkProductRatingConsistency(productId) {
  if (!isValidObjectId(productId)) {
    throw new AppError("Invalid product ID", 400, [], "INVALID_ID");
  }

  const productObjectId = new mongoose.Types.ObjectId(productId);
  const product = await Product.findById(productObjectId).select("ratingAverage ratingCount").lean();
  if (!product) {
    throw new AppError("Product not found", 404, [], "PRODUCT_NOT_FOUND");
  }

  const stats = await Review.aggregate([
    {
      $match: {
        product: productObjectId,
        status: "published"
      }
    },
    {
      $group: {
        _id: "$product",
        ratingCount: { $sum: 1 },
        ratingAverage: { $avg: "$rating" }
      }
    }
  ]);

  const hasPublishedReviews = Array.isArray(stats) && stats.length > 0 && stats[0].ratingCount > 0;
  const actualCount = hasPublishedReviews ? stats[0].ratingCount : 0;
  const actualAverage = hasPublishedReviews ? Math.round(stats[0].ratingAverage * 100) / 100 : 0;

  const storedAverage = Number(product.ratingAverage) || 0;
  const storedCount = Number(product.ratingCount) || 0;

  const isConsistent = storedAverage === actualAverage && storedCount === actualCount;

  return {
    isConsistent,
    stored: { ratingAverage: storedAverage, ratingCount: storedCount },
    actual: { ratingAverage: actualAverage, ratingCount: actualCount }
  };
}

/**
 * Repairs a product's rating metrics by reconciling stored fields against published reviews.
 * Returns before and after states and whether a repair was needed.
 *
 * @param {string|mongoose.Types.ObjectId} productId
 * @returns {Promise<{ repaired: boolean, previous: { ratingAverage: number, ratingCount: number }, current: { ratingAverage: number, ratingCount: number } }>}
 */
export async function repairProductRating(productId) {
  const consistency = await checkProductRatingConsistency(productId);

  if (consistency.isConsistent) {
    return {
      repaired: false,
      previous: consistency.stored,
      current: consistency.stored
    };
  }

  const updated = await recalculateProductRating(productId);

  return {
    repaired: true,
    previous: consistency.stored,
    current: {
      ratingAverage: updated.ratingAverage,
      ratingCount: updated.ratingCount
    }
  };
}
