import { describe, it, expect, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import Review from "./review.model.js";
import Product from "../products/product.model.js";
import * as reviewService from "./review.service.js";
import {
  createReview,
  getReviews,
  updateReview,
  deleteReview
} from "./review.controller.js";

describe("Review Controller Unit Tests", () => {
  const userId = "507f1f77bcf86cd799439011";
  const otherUserId = "507f1f77bcf86cd799439012";
  const productId = "607f1f77bcf86cd799439021";
  const otherProductId = "607f1f77bcf86cd799439022";
  const orderId = "707f1f77bcf86cd799439031";
  const reviewId = "807f1f77bcf86cd799439041";

  const createReq = (overrides = {}) => ({
    params: { productId },
    body: {},
    query: {},
    user: { _id: new mongoose.Types.ObjectId(userId) },
    requestId: "req-test-123",
    ...overrides
  });

  const createRes = () => {
    const res = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  };

  const createNext = () => vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("createReview Controller", () => {
    const validBody = {
      rating: 5,
      title: "Superb tent",
      body: "Tested in high winds and heavy downpour. Kept us safe and dry."
    };

    it("5, 6, 16-20. creates a review successfully when user has a qualifying purchase and recalculates rating", async () => {
      const mockProduct = { _id: productId, name: "Alpine Tent" };
      vi.spyOn(Product, "findById").mockResolvedValue(mockProduct);

      const qualifyingOrder = { _id: orderId, user: userId };
      vi.spyOn(reviewService, "findQualifyingOrder").mockResolvedValue({
        eligible: true,
        order: qualifyingOrder
      });

      vi.spyOn(Review, "findOne").mockResolvedValue(null);

      const createdDoc = {
        _id: reviewId,
        product: productId,
        user: userId,
        order: orderId,
        rating: 5,
        title: "Superb tent",
        body: "Tested in high winds and heavy downpour. Kept us safe and dry.",
        isVerifiedBuyer: true,
        status: "published",
        createdAt: new Date(),
        updatedAt: new Date()
      };
      vi.spyOn(Review, "create").mockResolvedValue(createdDoc);
      const recalcSpy = vi.spyOn(reviewService, "recalculateProductRating").mockResolvedValue({
        ratingAverage: 5,
        ratingCount: 1
      });

      const req = createReq({ body: validBody });
      const res = createRes();
      const next = createNext();

      await createReview(req, res, next);

      expect(Product.findById).toHaveBeenCalledWith(productId);
      expect(reviewService.findQualifyingOrder).toHaveBeenCalledWith(
        req.user._id,
        productId
      );
      expect(Review.create).toHaveBeenCalledWith({
        product: productId,
        user: req.user._id,
        order: qualifyingOrder._id,
        rating: 5,
        title: "Superb tent",
        body: validBody.body,
        isVerifiedBuyer: true,
        status: "published"
      });
      expect(recalcSpy).toHaveBeenCalledWith(productId);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: "Review created successfully",
          data: {
            review: expect.objectContaining({
              _id: reviewId,
              isVerifiedBuyer: true,
              status: "published",
              rating: 5
            })
          },
          requestId: "req-test-123"
        })
      );
      // Ensure order reference is not leaked in public data.review response
      expect(res.json.mock.calls[0][0].data.review.order).toBeUndefined();
    });

    it("throws 404 PRODUCT_NOT_FOUND if product does not exist", async () => {
      vi.spyOn(Product, "findById").mockResolvedValue(null);

      const req = createReq({ body: validBody });
      const res = createRes();
      const next = createNext();

      await createReview(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404,
          code: "PRODUCT_NOT_FOUND"
        })
      );
    });

    it("11-14. rejects review creation with 403 REVIEW_PURCHASE_REQUIRED when user is ineligible", async () => {
      vi.spyOn(Product, "findById").mockResolvedValue({ _id: productId });
      vi.spyOn(reviewService, "findQualifyingOrder").mockResolvedValue({
        eligible: false,
        order: null
      });
      const createSpy = vi.spyOn(Review, "create");

      const req = createReq({ body: validBody });
      const res = createRes();
      const next = createNext();

      await createReview(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 403,
          code: "REVIEW_PURCHASE_REQUIRED"
        })
      );
      expect(createSpy).not.toHaveBeenCalled();
    });

    it("15. returns 409 REVIEW_ALREADY_EXISTS when user has already reviewed product (pre-check)", async () => {
      vi.spyOn(Product, "findById").mockResolvedValue({ _id: productId });
      vi.spyOn(reviewService, "findQualifyingOrder").mockResolvedValue({
        eligible: true,
        order: { _id: orderId }
      });
      vi.spyOn(Review, "findOne").mockResolvedValue({ _id: reviewId });
      const createSpy = vi.spyOn(Review, "create");

      const req = createReq({ body: validBody });
      const res = createRes();
      const next = createNext();

      await createReview(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 409,
          code: "REVIEW_ALREADY_EXISTS"
        })
      );
      expect(createSpy).not.toHaveBeenCalled();
    });

    it("15b. maps duplicate key error code 11000 to 409 REVIEW_ALREADY_EXISTS during concurrent creation", async () => {
      vi.spyOn(Product, "findById").mockResolvedValue({ _id: productId });
      vi.spyOn(reviewService, "findQualifyingOrder").mockResolvedValue({
        eligible: true,
        order: { _id: orderId }
      });
      vi.spyOn(Review, "findOne").mockResolvedValue(null);

      const duplicateError = new Error("E11000 duplicate key error");
      duplicateError.code = 11000;
      vi.spyOn(Review, "create").mockRejectedValue(duplicateError);

      const req = createReq({ body: validBody });
      const res = createRes();
      const next = createNext();

      await createReview(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 409,
          code: "REVIEW_ALREADY_EXISTS"
        })
      );
    });
  });

  describe("getReviews Controller", () => {
    it("23-25, 29, 30. returns only published reviews for the product with pagination metadata and safe user projection", async () => {
      vi.spyOn(Product, "exists").mockResolvedValue({ _id: productId });
      vi.spyOn(Review, "countDocuments").mockResolvedValue(1);

      const mockFindQuery = {
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([
          {
            _id: reviewId,
            product: productId,
            user: { _id: userId, name: "Trail Blazer" },
            rating: 5,
            title: "Great tent",
            body: "Loved it.",
            isVerifiedBuyer: true,
            status: "published",
            createdAt: new Date()
          }
        ])
      };
      vi.spyOn(Review, "find").mockReturnValue(mockFindQuery);

      const req = createReq({
        query: { page: "1", limit: "10" }
      });
      const res = createRes();
      const next = createNext();

      await getReviews(req, res, next);

      expect(Review.find).toHaveBeenCalledWith({
        product: productId,
        status: "published"
      });
      expect(mockFindQuery.sort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(mockFindQuery.skip).toHaveBeenCalledWith(0);
      expect(mockFindQuery.limit).toHaveBeenCalledWith(10);
      expect(mockFindQuery.populate).toHaveBeenCalledWith("user", "name");
      expect(mockFindQuery.select).toHaveBeenCalledWith("-order");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: {
            reviews: expect.any(Array),
            pagination: {
              page: 1,
              limit: 10,
              totalReviews: 1,
              totalPages: 1
            }
          }
        })
      );
    });

    it("26. filters by rating when query parameter is provided", async () => {
      vi.spyOn(Product, "exists").mockResolvedValue({ _id: productId });
      vi.spyOn(Review, "countDocuments").mockResolvedValue(0);

      const mockFindQuery = {
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([])
      };
      vi.spyOn(Review, "find").mockReturnValue(mockFindQuery);

      const req = createReq({
        query: { rating: "5" }
      });
      const res = createRes();
      const next = createNext();

      await getReviews(req, res, next);

      expect(Review.find).toHaveBeenCalledWith({
        product: productId,
        status: "published",
        rating: 5
      });
    });

    it("throws 404 PRODUCT_NOT_FOUND when product does not exist", async () => {
      vi.spyOn(Product, "exists").mockResolvedValue(null);

      const req = createReq();
      const res = createRes();
      const next = createNext();

      await getReviews(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404,
          code: "PRODUCT_NOT_FOUND"
        })
      );
    });
  });

  describe("updateReview Controller", () => {
    it("36, 44. allows owner to update their own review and recalculates product rating", async () => {
      const existingReview = {
        _id: reviewId,
        product: productId,
        user: new mongoose.Types.ObjectId(userId)
      };
      vi.spyOn(Review, "findOne").mockResolvedValue(existingReview);

      const updatedReviewDoc = {
        _id: reviewId,
        product: productId,
        user: { _id: userId, name: "Alex" },
        rating: 4,
        title: "Revised Review",
        body: "Updated feedback after 6 months of use.",
        isVerifiedBuyer: true,
        status: "published"
      };

      const mockFindOneAndUpdate = {
        populate: vi.fn().mockReturnThis(),
        select: vi.fn().mockResolvedValue(updatedReviewDoc)
      };
      vi.spyOn(Review, "findOneAndUpdate").mockReturnValue(mockFindOneAndUpdate);
      const recalcSpy = vi.spyOn(reviewService, "recalculateProductRating").mockResolvedValue({});

      const req = createReq({
        params: { productId, reviewId },
        body: { rating: 4, title: "Revised Review", body: "Updated feedback after 6 months of use." }
      });
      const res = createRes();
      const next = createNext();

      await updateReview(req, res, next);

      expect(Review.findOne).toHaveBeenCalledWith({
        _id: reviewId,
        product: productId
      });
      expect(Review.findOneAndUpdate).toHaveBeenCalledWith(
        {
          _id: reviewId,
          product: productId,
          user: req.user._id
        },
        {
          $set: {
            rating: 4,
            title: "Revised Review",
            body: "Updated feedback after 6 months of use."
          }
        },
        {
          new: true,
          runValidators: true
        }
      );
      expect(recalcSpy).toHaveBeenCalledWith(productId);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: "Review updated successfully",
          data: {
            review: updatedReviewDoc
          }
        })
      );
    });

    it("37. rejects update with 403 REVIEW_ACCESS_DENIED when review belongs to another user", async () => {
      const existingReview = {
        _id: reviewId,
        product: productId,
        user: new mongoose.Types.ObjectId(otherUserId)
      };
      vi.spyOn(Review, "findOne").mockResolvedValue(existingReview);
      const updateSpy = vi.spyOn(Review, "findOneAndUpdate");

      const req = createReq({
        params: { productId, reviewId },
        body: { rating: 4 }
      });
      const res = createRes();
      const next = createNext();

      await updateReview(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 403,
          code: "REVIEW_ACCESS_DENIED"
        })
      );
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it("38. rejects update with 404 REVIEW_NOT_FOUND when review does not exist in target product scope", async () => {
      vi.spyOn(Review, "findOne").mockResolvedValue(null);

      const req = createReq({
        params: { productId: otherProductId, reviewId },
        body: { rating: 4 }
      });
      const res = createRes();
      const next = createNext();

      await updateReview(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404,
          code: "REVIEW_NOT_FOUND"
        })
      );
    });
  });

  describe("deleteReview Controller", () => {
    it("48, 52, 53. allows owner to delete their own review and recalculates rating", async () => {
      const existingReview = {
        _id: reviewId,
        product: productId,
        user: new mongoose.Types.ObjectId(userId)
      };
      vi.spyOn(Review, "findOne").mockResolvedValue(existingReview);
      vi.spyOn(Review, "findOneAndDelete").mockResolvedValue(existingReview);
      const recalcSpy = vi.spyOn(reviewService, "recalculateProductRating").mockResolvedValue({
        ratingAverage: 0,
        ratingCount: 0
      });

      const req = createReq({
        params: { productId, reviewId }
      });
      const res = createRes();
      const next = createNext();

      await deleteReview(req, res, next);

      expect(Review.findOneAndDelete).toHaveBeenCalledWith({
        _id: reviewId,
        product: productId,
        user: req.user._id
      });
      expect(recalcSpy).toHaveBeenCalledWith(productId);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: "Review deleted successfully",
          data: {
            reviewId
          }
        })
      );
    });

    it("49. rejects delete with 403 REVIEW_ACCESS_DENIED when review belongs to another user", async () => {
      const existingReview = {
        _id: reviewId,
        product: productId,
        user: new mongoose.Types.ObjectId(otherUserId)
      };
      vi.spyOn(Review, "findOne").mockResolvedValue(existingReview);
      const deleteSpy = vi.spyOn(Review, "findOneAndDelete");

      const req = createReq({
        params: { productId, reviewId }
      });
      const res = createRes();
      const next = createNext();

      await deleteReview(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 403,
          code: "REVIEW_ACCESS_DENIED"
        })
      );
      expect(deleteSpy).not.toHaveBeenCalled();
    });

    it("50. rejects delete with 404 REVIEW_NOT_FOUND when review does not exist in target product scope", async () => {
      vi.spyOn(Review, "findOne").mockResolvedValue(null);

      const req = createReq({
        params: { productId: otherProductId, reviewId }
      });
      const res = createRes();
      const next = createNext();

      await deleteReview(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404,
          code: "REVIEW_NOT_FOUND"
        })
      );
    });
  });
});
