import Review from "./review.model.js";
import Product from "../products/product.model.js";
import { findQualifyingOrder, recalculateProductRating } from "./review.service.js";
import AppError from "../../common/errors/app-error.js";

/**
 * Creates a new customer review for a product with server-side verified buyer enforcement.
 */
export async function createReview(req, res, next) {
  try {
    const { productId } = req.params;
    const { rating, title = "", body } = req.body;
    const userId = req.user._id;

    // Verify product exists
    const product = await Product.findById(productId);
    if (!product) {
      throw new AppError("Product not found", 404, [], "PRODUCT_NOT_FOUND");
    }

    // Verify qualifying purchase (delivered & paid order containing product)
    const eligibility = await findQualifyingOrder(userId, productId);
    if (!eligibility.eligible || !eligibility.order) {
      throw new AppError(
        "Only verified buyers who have received this product can leave a review",
        403,
        [],
        "REVIEW_PURCHASE_REQUIRED"
      );
    }

    // Pre-check for duplicate review by same user on this product
    const existingReview = await Review.findOne({
      user: userId,
      product: productId
    });
    if (existingReview) {
      throw new AppError(
        "You have already submitted a review for this product",
        409,
        [],
        "REVIEW_ALREADY_EXISTS"
      );
    }

    // Create review with explicit server-computed verified-buyer status
    let review;
    try {
      review = await Review.create({
        product: productId,
        user: userId,
        order: eligibility.order._id,
        rating,
        title,
        body,
        isVerifiedBuyer: true,
        status: "published"
      });
    } catch (err) {
      if (err.code === 11000) {
        throw new AppError(
          "You have already submitted a review for this product",
          409,
          [],
          "REVIEW_ALREADY_EXISTS"
        );
      }
      throw err;
    }

    // Recalculate and update Product rating metrics
    await recalculateProductRating(productId);

    return res.status(201).json({
      success: true,
      message: "Review created successfully",
      data: {
        review: {
          _id: review._id,
          product: review.product,
          user: review.user,
          rating: review.rating,
          title: review.title,
          body: review.body,
          isVerifiedBuyer: review.isVerifiedBuyer,
          status: review.status,
          createdAt: review.createdAt,
          updatedAt: review.updatedAt
        }
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Retrieves public, published reviews for a product with pagination, filtering, and sorting.
 */
export async function getReviews(req, res, next) {
  try {
    const { productId } = req.params;

    // Verify product exists
    const productExists = await Product.exists({ _id: productId });
    if (!productExists) {
      throw new AppError("Product not found", 404, [], "PRODUCT_NOT_FOUND");
    }

    // Filter strictly to published reviews for the target product
    const filter = {
      product: productId,
      status: "published"
    };

    if (req.query.rating !== undefined) {
      filter.rating = Number(req.query.rating);
    }

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const sortBy = req.query.sortBy || "createdAt";
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;
    const sort = { [sortBy]: sortOrder };

    const totalReviews = await Review.countDocuments(filter);
    const reviews = await Review.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate("user", "name")
      .select("-order")
      .lean();

    const totalPages = Math.max(Math.ceil(totalReviews / limit), 1);

    return res.status(200).json({
      success: true,
      message: "Reviews retrieved successfully",
      data: {
        reviews,
        pagination: {
          page,
          limit,
          totalReviews,
          totalPages
        }
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Updates a customer's own existing review.
 */
export async function updateReview(req, res, next) {
  try {
    const { productId, reviewId } = req.params;
    const userId = req.user._id;

    // Verify review exists within the specified product scope
    const existingReview = await Review.findOne({
      _id: reviewId,
      product: productId
    });

    if (!existingReview) {
      throw new AppError("Review not found", 404, [], "REVIEW_NOT_FOUND");
    }

    // Verify review ownership
    if (existingReview.user.toString() !== userId.toString()) {
      throw new AppError(
        "You are not authorized to update this review",
        403,
        [],
        "REVIEW_ACCESS_DENIED"
      );
    }

    // Explicitly restrict modifications to allowed content fields
    const updateFields = {};
    if (req.body.rating !== undefined) updateFields.rating = req.body.rating;
    if (req.body.title !== undefined) updateFields.title = req.body.title;
    if (req.body.body !== undefined) updateFields.body = req.body.body;

    const updatedReview = await Review.findOneAndUpdate(
      {
        _id: reviewId,
        product: productId,
        user: userId
      },
      {
        $set: updateFields
      },
      {
        new: true,
        runValidators: true
      }
    )
      .populate("user", "name")
      .select("-order");

    // Recalculate Product rating metrics in case rating changed
    await recalculateProductRating(productId);

    return res.status(200).json({
      success: true,
      message: "Review updated successfully",
      data: {
        review: updatedReview
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Deletes a customer's own review.
 */
export async function deleteReview(req, res, next) {
  try {
    const { productId, reviewId } = req.params;
    const userId = req.user._id;

    // Verify review exists within the specified product scope
    const existingReview = await Review.findOne({
      _id: reviewId,
      product: productId
    });

    if (!existingReview) {
      throw new AppError("Review not found", 404, [], "REVIEW_NOT_FOUND");
    }

    // Verify review ownership
    if (existingReview.user.toString() !== userId.toString()) {
      throw new AppError(
        "You are not authorized to delete this review",
        403,
        [],
        "REVIEW_ACCESS_DENIED"
      );
    }

    await Review.findOneAndDelete({
      _id: reviewId,
      product: productId,
      user: userId
    });

    // Recalculate Product rating metrics after review removal
    await recalculateProductRating(productId);

    return res.status(200).json({
      success: true,
      message: "Review deleted successfully",
      data: {
        reviewId
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}
