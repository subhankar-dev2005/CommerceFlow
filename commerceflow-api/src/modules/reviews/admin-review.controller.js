import Review from "./review.model.js";
import AppError from "../../common/errors/app-error.js";
import { recalculateProductRating, repairProductRating } from "./review.service.js";
import { logger } from "../../config/logger.js";

function escapeRegex(text) {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

/**
 * GET /api/v1/admin/reviews
 * Retrieves paginated reviews across the entire store with filtering by status and rating.
 */
export async function getAdminReviews(req, res, next) {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const { status = "all", rating, search, sortBy = "createdAt", sortOrder = "desc" } = req.query;

    const filter = {};

    if (status !== "all") {
      filter.status = status;
    }

    if (rating !== undefined && rating !== null) {
      filter.rating = Number(rating);
    }

    if (search && search.trim()) {
      const sanitized = escapeRegex(search.trim());
      filter.$or = [
        { title: { $regex: sanitized, $options: "i" } },
        { body: { $regex: sanitized, $options: "i" } }
      ];
    }

    const sortDirection = sortOrder === "asc" ? 1 : -1;
    const sortOptions = { [sortBy]: sortDirection, _id: sortDirection };
    const skip = (page - 1) * limit;

    const [reviews, totalReviews] = await Promise.all([
      Review.find(filter)
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .populate("product", "name image category")
        .populate("user", "name email")
        .select("-order")
        .lean(),
      Review.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(totalReviews / limit) || 1;

    return res.status(200).json({
      success: true,
      message: "Admin reviews retrieved successfully",
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
 * PATCH /api/v1/admin/reviews/:id/status
 * Updates review moderation status (published, hidden, flagged) and recalculates product rating.
 * If rating recalculation fails, rolls back review status to maintain data consistency.
 */
export async function updateAdminReviewStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const review = await Review.findById(id);
    if (!review) {
      throw new AppError("Review not found", 404, [], "REVIEW_NOT_FOUND");
    }

    const previousStatus = review.status;
    if (previousStatus === status) {
      const populated = await Review.findById(review._id)
        .populate("product", "name image category")
        .populate("user", "name email")
        .select("-order")
        .lean();

      return res.status(200).json({
        success: true,
        message: `Review status is already ${status}`,
        data: {
          review: populated
        },
        requestId: req.requestId
      });
    }

    review.status = status;
    await review.save();

    // Recalculate rating metrics for the associated product
    if (review.product) {
      try {
        await recalculateProductRating(review.product);
      } catch (recalcError) {
        // Recovery: Roll back review status to preserve consistency between reviews and product metrics
        logger.error({
          msg: "Rating recalculation failed during review moderation; rolling back review status",
          reviewId: review._id,
          productId: review.product,
          targetStatus: status,
          previousStatus,
          error: recalcError.message
        });

        try {
          review.status = previousStatus;
          await review.save();
        } catch (rollbackError) {
          logger.error({
            msg: "Failed to rollback review status after recalculation failure",
            reviewId: review._id,
            error: rollbackError.message
          });
        }

        throw new AppError(
          "Failed to update product rating metrics. Review status change was rolled back to maintain consistency.",
          500,
          [],
          "RATING_RECALCULATION_FAILED"
        );
      }
    }

    logger.info({
      msg: "Admin moderated review status",
      reviewId: review._id,
      productId: review.product,
      newStatus: status,
      adminId: req.user?._id
    });

    const populated = await Review.findById(review._id)
      .populate("product", "name image category")
      .populate("user", "name email")
      .select("-order")
      .lean();

    return res.status(200).json({
      success: true,
      message: `Review status updated to ${status}`,
      data: {
        review: populated
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/v1/admin/reviews/:id
 * Deletes a review and recalculates the product's rating.
 * Uses a safe 2-phase deletion approach: if published, recalculates before permanent deletion,
 * aborting and restoring if recalculation fails to prevent orphan/inconsistent ratings.
 */
export async function deleteAdminReview(req, res, next) {
  try {
    const { id } = req.params;

    const review = await Review.findById(id);
    if (!review) {
      throw new AppError("Review not found", 404, [], "REVIEW_NOT_FOUND");
    }

    const productId = review.product;
    const previousStatus = review.status;

    // Safe 2-phase deletion for non-transactional topologies:
    // Phase 1: If review was published, temporarily hide and recalculate
    if (previousStatus === "published" && productId) {
      review.status = "hidden";
      await review.save();

      try {
        await recalculateProductRating(productId);
      } catch (recalcError) {
        // Recovery: Revert review to original status so review and rating remain consistent
        logger.error({
          msg: "Rating recalculation failed during review deletion; aborting deletion",
          reviewId: id,
          productId,
          error: recalcError.message
        });

        try {
          review.status = previousStatus;
          await review.save();
        } catch (rollbackError) {
          logger.error({
            msg: "Failed to rollback review status during deletion abort",
            reviewId: id,
            error: rollbackError.message
          });
        }

        throw new AppError(
          "Failed to update product rating metrics. Review deletion was aborted to maintain data consistency.",
          500,
          [],
          "REVIEW_DELETION_FAILED"
        );
      }
    }

    // Phase 2: Permanently delete the review
    await Review.findByIdAndDelete(id);

    // If review was not published (e.g. was hidden or flagged), recalculate as a safety precaution
    if (previousStatus !== "published" && productId) {
      try {
        await recalculateProductRating(productId);
      } catch (recalcError) {
        logger.warn({
          msg: "Recalculation warning after deleting non-published review",
          reviewId: id,
          productId,
          error: recalcError.message
        });
      }
    }

    logger.info({
      msg: "Admin deleted review",
      reviewId: id,
      productId,
      adminId: req.user?._id
    });

    return res.status(200).json({
      success: true,
      message: "Review deleted successfully",
      data: {
        reviewId: id
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/admin/reviews/products/:productId/repair-rating
 * Identifies and repairs stale rating metrics for a given product.
 */
export async function repairProductRatingHandler(req, res, next) {
  try {
    const { productId } = req.params;
    const report = await repairProductRating(productId);

    logger.info({
      msg: "Admin repaired product rating metrics",
      productId,
      repaired: report.repaired,
      adminId: req.user?._id
    });

    return res.status(200).json({
      success: true,
      message: report.repaired
        ? "Product rating metrics repaired successfully"
        : "Product rating metrics were already consistent",
      data: report,
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}
