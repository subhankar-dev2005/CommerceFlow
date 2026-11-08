import { describe, it, expect, vi, beforeEach } from "vitest";
import Review from "./review.model.js";
import * as reviewService from "./review.service.js";
import { logger } from "../../config/logger.js";
import {
  getAdminReviews,
  updateAdminReviewStatus,
  deleteAdminReview
} from "./admin-review.controller.js";

describe("Admin Review Controller Unit Tests", () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    vi.restoreAllMocks();

    req = {
      params: {},
      query: {},
      body: {},
      user: { _id: "507f1f77bcf86cd799439011", role: "admin" },
      requestId: "req-admin-rev-test-123"
    };

    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };

    next = vi.fn();
  });

  describe("getAdminReviews", () => {
    it("returns paginated reviews with product and user populated safely", async () => {
      const mockReviews = [
        {
          _id: "rev1",
          rating: 5,
          title: "Great Product",
          body: "Really loved it",
          status: "published",
          product: { _id: "prod1", name: "Alpine Tent", image: "https://example.com/tent.jpg" },
          user: { _id: "user1", name: "Aarav Sharma", email: "aarav@example.com" },
          createdAt: new Date().toISOString()
        }
      ];

      const leanMock = vi.fn().mockResolvedValue(mockReviews);
      const selectMock = vi.fn().mockReturnValue({ lean: leanMock });
      const popUserMock = vi.fn().mockReturnValue({ select: selectMock });
      const popProdMock = vi.fn().mockReturnValue({ populate: popUserMock });
      const limitMock = vi.fn().mockReturnValue({ populate: popProdMock });
      const skipMock = vi.fn().mockReturnValue({ limit: limitMock });
      const sortMock = vi.fn().mockReturnValue({ skip: skipMock });

      const findSpy = vi.spyOn(Review, "find").mockReturnValue({ sort: sortMock });
      vi.spyOn(Review, "countDocuments").mockResolvedValue(1);

      req.query = { page: 1, limit: 10, status: "all" };
      await getAdminReviews(req, res, next);

      expect(findSpy).toHaveBeenCalledWith({});
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            reviews: mockReviews,
            pagination: expect.objectContaining({
              page: 1,
              limit: 10,
              totalReviews: 1,
              totalPages: 1
            })
          })
        })
      );
    });

    it("applies status and rating filters correctly", async () => {
      const leanMock = vi.fn().mockResolvedValue([]);
      const selectMock = vi.fn().mockReturnValue({ lean: leanMock });
      const popUserMock = vi.fn().mockReturnValue({ select: selectMock });
      const popProdMock = vi.fn().mockReturnValue({ populate: popUserMock });
      const limitMock = vi.fn().mockReturnValue({ populate: popProdMock });
      const skipMock = vi.fn().mockReturnValue({ limit: limitMock });
      const sortMock = vi.fn().mockReturnValue({ skip: skipMock });

      const findSpy = vi.spyOn(Review, "find").mockReturnValue({ sort: sortMock });
      vi.spyOn(Review, "countDocuments").mockResolvedValue(0);

      req.query = { status: "flagged", rating: 2 };
      await getAdminReviews(req, res, next);

      expect(findSpy).toHaveBeenCalledWith({
        status: "flagged",
        rating: 2
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe("updateAdminReviewStatus", () => {
    it("updates review status and recalculates associated product rating", async () => {
      const mockReviewDoc = {
        _id: "rev1",
        product: "507f1f77bcf86cd799439022",
        status: "published",
        save: vi.fn().mockResolvedValue(true)
      };

      const populatedChain = {
        populate: vi.fn().mockReturnValue({
          populate: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              lean: vi.fn().mockResolvedValue({
                _id: "rev1",
                status: "hidden",
                product: { _id: "507f1f77bcf86cd799439022", name: "Tent" }
              })
            })
          })
        })
      };

      vi.spyOn(Review, "findById")
        .mockResolvedValueOnce(mockReviewDoc)
        .mockReturnValueOnce(populatedChain);

      const recalcSpy = vi.spyOn(reviewService, "recalculateProductRating").mockResolvedValue(true);

      req.params = { id: "rev1" };
      req.body = { status: "hidden" };
      await updateAdminReviewStatus(req, res, next);

      expect(mockReviewDoc.status).toBe("hidden");
      expect(mockReviewDoc.save).toHaveBeenCalled();
      expect(recalcSpy).toHaveBeenCalledWith("507f1f77bcf86cd799439022");
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("calls next with 404 if review does not exist", async () => {
      vi.spyOn(Review, "findById").mockResolvedValue(null);

      req.params = { id: "nonexistent" };
      req.body = { status: "hidden" };
      await updateAdminReviewStatus(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404,
          code: "REVIEW_NOT_FOUND"
        })
      );
    });

    it("rolls back review status and calls next with 500 when recalculateProductRating fails", async () => {
      const mockReviewDoc = {
        _id: "rev1",
        product: "507f1f77bcf86cd799439022",
        status: "published",
        save: vi.fn().mockResolvedValue(true)
      };

      vi.spyOn(Review, "findById").mockResolvedValue(mockReviewDoc);
      vi.spyOn(reviewService, "recalculateProductRating").mockRejectedValue(
        new Error("Database connection timeout during recalculation")
      );

      req.params = { id: "rev1" };
      req.body = { status: "hidden" };
      await updateAdminReviewStatus(req, res, next);

      // Verify status was rolled back to previousStatus ("published")
      expect(mockReviewDoc.status).toBe("published");
      expect(mockReviewDoc.save).toHaveBeenCalledTimes(2); // First save to 'hidden', second save rolling back to 'published'
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 500,
          code: "RATING_RECALCULATION_FAILED"
        })
      );
    });
  });

  describe("deleteAdminReview", () => {
    it("deletes review and recalculates associated product rating", async () => {
      const mockReviewDoc = {
        _id: "rev1",
        product: "507f1f77bcf86cd799439022",
        status: "published",
        save: vi.fn().mockResolvedValue(true)
      };

      vi.spyOn(Review, "findById").mockResolvedValue(mockReviewDoc);
      vi.spyOn(Review, "findByIdAndDelete").mockResolvedValue(mockReviewDoc);
      const recalcSpy = vi.spyOn(reviewService, "recalculateProductRating").mockResolvedValue(true);

      req.params = { id: "rev1" };
      await deleteAdminReview(req, res, next);

      expect(Review.findByIdAndDelete).toHaveBeenCalledWith("rev1");
      expect(recalcSpy).toHaveBeenCalledWith("507f1f77bcf86cd799439022");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: { reviewId: "rev1" }
        })
      );
    });

    it("aborts deletion and restores status when recalculateProductRating fails on published review", async () => {
      const mockReviewDoc = {
        _id: "rev1",
        product: "507f1f77bcf86cd799439022",
        status: "published",
        save: vi.fn().mockResolvedValue(true)
      };

      vi.spyOn(Review, "findById").mockResolvedValue(mockReviewDoc);
      const deleteSpy = vi.spyOn(Review, "findByIdAndDelete");
      vi.spyOn(reviewService, "recalculateProductRating").mockRejectedValue(
        new Error("MongoDB socket closed")
      );

      req.params = { id: "rev1" };
      await deleteAdminReview(req, res, next);

      // Review was NOT deleted
      expect(deleteSpy).not.toHaveBeenCalled();
      // Review status was restored to 'published'
      expect(mockReviewDoc.status).toBe("published");
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 500,
          code: "REVIEW_DELETION_FAILED"
        })
      );
    });

    it("logs error and forwards 500 without attempting deletion when both recalculation and rollback fail", async () => {
      const mockReviewDoc = {
        _id: "rev1",
        product: "507f1f77bcf86cd799439022",
        status: "published",
        save: vi
          .fn()
          .mockResolvedValueOnce(true) // Phase 1: successfully hides review
          .mockRejectedValueOnce(new Error("Rollback DB connection dead")) // Rollback save fails
      };

      vi.spyOn(Review, "findById").mockResolvedValue(mockReviewDoc);
      const deleteSpy = vi.spyOn(Review, "findByIdAndDelete");
      vi.spyOn(reviewService, "recalculateProductRating").mockRejectedValue(
        new Error("Recalculation DB timeout")
      );
      const loggerErrorSpy = vi.spyOn(logger, "error");

      req.params = { id: "rev1" };
      await deleteAdminReview(req, res, next);

      // 1. Verify deletion was NOT attempted
      expect(deleteSpy).not.toHaveBeenCalled();

      // 2. Verify errors are logged appropriately
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: "Rating recalculation failed during review deletion; aborting deletion",
          reviewId: "rev1",
          productId: "507f1f77bcf86cd799439022",
          error: "Recalculation DB timeout"
        })
      );
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: "Failed to rollback review status during deletion abort",
          reviewId: "rev1",
          error: "Rollback DB connection dead"
        })
      );

      // 3. Verify API returns a controlled error response
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 500,
          code: "REVIEW_DELETION_FAILED"
        })
      );

      // 4. Do not claim the review was restored: save rejected, so persistent state remains hidden
      expect(mockReviewDoc.save).toHaveBeenCalledTimes(2);
      expect(res.status).not.toHaveBeenCalled();
    });

    it("handles failure when rating recalculation succeeds but permanent deletion fails", async () => {
      const mockReviewDoc = {
        _id: "rev1",
        product: "507f1f77bcf86cd799439022",
        status: "published",
        save: vi.fn().mockResolvedValue(true)
      };

      vi.spyOn(Review, "findById").mockResolvedValue(mockReviewDoc);
      vi.spyOn(reviewService, "recalculateProductRating").mockResolvedValue({
        ratingAverage: 4.5,
        ratingCount: 2
      });
      vi.spyOn(Review, "findByIdAndDelete").mockRejectedValue(
        new Error("Write conflict on permanent deletion")
      );

      req.params = { id: "rev1" };
      await deleteAdminReview(req, res, next);

      // 1. Verify API does not report deletion success
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();

      // 2. Verify failure is forwarded consistently with project error conventions
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Write conflict on permanent deletion"
        })
      );

      // 3. Document resulting state:
      // - Review remains persisted in MongoDB with status: "hidden"
      // - Product rating average and count are consistent with published reviews (excluding this review)
      expect(mockReviewDoc.status).toBe("hidden");
      expect(mockReviewDoc.save).toHaveBeenCalledTimes(1);
    });

    it("verifies recovery behavior and limitations when review is hidden but recalculation fails", async () => {
      const mockReviewDoc = {
        _id: "rev1",
        product: "507f1f77bcf86cd799439022",
        status: "published",
        save: vi.fn().mockResolvedValue(true)
      };

      vi.spyOn(Review, "findById").mockResolvedValue(mockReviewDoc);
      const deleteSpy = vi.spyOn(Review, "findByIdAndDelete");
      vi.spyOn(reviewService, "recalculateProductRating").mockRejectedValue(
        new Error("Recalculation execution failed")
      );

      req.params = { id: "rev1" };
      await deleteAdminReview(req, res, next);

      // Phase 1: Review was initially marked hidden and saved to isolate ratings
      expect(mockReviewDoc.save).toHaveBeenNthCalledWith(1);

      // Current recovery behavior:
      // The catch block executes in-memory compensating rollback to restore "published" status
      expect(mockReviewDoc.status).toBe("published");
      expect(mockReviewDoc.save).toHaveBeenNthCalledWith(2);
      expect(deleteSpy).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 500,
          code: "REVIEW_DELETION_FAILED"
        })
      );

      // Limitations:
      // 1. If process terminates abruptly after Phase 1 save(hidden), no in-memory rollback runs,
      //    leaving the review hidden while product ratings remain stale with no auto-recovery.
      // 2. Relies entirely on the current process remaining alive and operational.
    });

    it("calls next with 404 if review to delete does not exist", async () => {
      vi.spyOn(Review, "findById").mockResolvedValue(null);

      req.params = { id: "nonexistent" };
      await deleteAdminReview(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404,
          code: "REVIEW_NOT_FOUND"
        })
      );
    });
  });

  describe("repairProductRatingHandler", () => {
    it("repairs stale product ratings and returns report", async () => {
      const { repairProductRatingHandler } = await import("./admin-review.controller.js");
      vi.spyOn(reviewService, "repairProductRating").mockResolvedValue({
        repaired: true,
        previous: { ratingAverage: 4.5, ratingCount: 2 },
        current: { ratingAverage: 5.0, ratingCount: 3 }
      });

      req.params = { productId: "507f1f77bcf86cd799439022" };
      await repairProductRatingHandler(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            repaired: true,
            current: { ratingAverage: 5.0, ratingCount: 3 }
          })
        })
      );
    });
  });
});
