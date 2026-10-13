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
 *
 * @param {string|mongoose.Types.ObjectId} productId - Target product ObjectId
 * @returns {Promise<{ ratingAverage: number, ratingCount: number, product: object }>}
 */
export async function recalculateProductRating(productId) {
  if (!isValidObjectId(productId)) {
    throw new AppError("Invalid product ID", 400, [], "INVALID_ID");
  }

  const productObjectId = new mongoose.Types.ObjectId(productId);

  const productExists = await Product.exists({ _id: productObjectId });
  if (!productExists) {
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
  const ratingCount = hasPublishedReviews ? stats[0].ratingCount : 0;
  const ratingAverage = hasPublishedReviews
    ? Math.round(stats[0].ratingAverage * 100) / 100
    : 0;

  const updatedProduct = await Product.findByIdAndUpdate(
    productObjectId,
    {
      $set: {
        ratingAverage,
        ratingCount
      }
    },
    {
      new: true
    }
  );

  return {
    ratingAverage,
    ratingCount,
    product: updatedProduct
  };
}
