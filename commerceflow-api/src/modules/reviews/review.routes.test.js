import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../../app.js";
import User from "../users/user.model.js";
import Product from "../products/product.model.js";
import Review from "./review.model.js";
import * as reviewService from "./review.service.js";
import generateToken from "../../utils/generate-token.js";

describe("Review Routes Integration Tests", () => {
  let app;
  const userId = "507f1f77bcf86cd799439011";
  const productId = "607f1f77bcf86cd799439021";
  const orderId = "707f1f77bcf86cd799439031";
  const reviewId = "807f1f77bcf86cd799439041";

  const mockUser = {
    _id: new mongoose.Types.ObjectId(userId),
    email: "customer@example.com",
    role: "customer",
    isActive: true
  };

  const validToken = generateToken({
    userId: userId,
    email: "customer@example.com",
    role: "customer"
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    app = createApp();
    vi.spyOn(User, "findById").mockResolvedValue(mockUser);
  });

  describe("Route Existence & Authentication Guards", () => {
    it("1. POST /api/v1/products/:productId/reviews rejects unauthenticated requests with 401", async () => {
      const response = await request(app)
        .post(`/api/v1/products/${productId}/reviews`)
        .send({ rating: 5, body: "Great quality gear!" });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it("21. GET /api/v1/products/:productId/reviews rejects unauthenticated requests with 401", async () => {
      const response = await request(app)
        .get(`/api/v1/products/${productId}/reviews`);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it("31. PATCH /api/v1/products/:productId/reviews/:reviewId rejects unauthenticated requests with 401", async () => {
      const response = await request(app)
        .patch(`/api/v1/products/${productId}/reviews/${reviewId}`)
        .send({ rating: 4 });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it("45. DELETE /api/v1/products/:productId/reviews/:reviewId rejects unauthenticated requests with 401", async () => {
      const response = await request(app)
        .delete(`/api/v1/products/${productId}/reviews/${reviewId}`);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe("POST /api/v1/products/:productId/reviews", () => {
    it("2. rejects malformed productId with 400", async () => {
      const response = await request(app)
        .post("/api/v1/products/invalid-id/reviews")
        .set("Authorization", `Bearer ${validToken}`)
        .send({ rating: 5, body: "Great quality gear!" });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("3. rejects invalid body (e.g. rating 0) with 400", async () => {
      const response = await request(app)
        .post(`/api/v1/products/${productId}/reviews`)
        .set("Authorization", `Bearer ${validToken}`)
        .send({ rating: 0, body: "Great quality gear!" });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("4, 7-10. rejects unknown/injected fields (user, order, isVerifiedBuyer) with 400", async () => {
      const response = await request(app)
        .post(`/api/v1/products/${productId}/reviews`)
        .set("Authorization", `Bearer ${validToken}`)
        .send({
          rating: 5,
          body: "Great quality gear!",
          user: userId,
          order: orderId,
          isVerifiedBuyer: true,
          status: "published"
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("creates a review successfully and returns 201", async () => {
      vi.spyOn(Product, "findById").mockResolvedValue({ _id: productId });
      vi.spyOn(reviewService, "findQualifyingOrder").mockResolvedValue({
        eligible: true,
        order: { _id: orderId }
      });
      vi.spyOn(Review, "findOne").mockResolvedValue(null);
      vi.spyOn(Review, "create").mockResolvedValue({
        _id: reviewId,
        product: productId,
        user: userId,
        order: orderId,
        rating: 5,
        title: "Durable",
        body: "Solid construction.",
        isVerifiedBuyer: true,
        status: "published",
        createdAt: new Date(),
        updatedAt: new Date()
      });
      vi.spyOn(reviewService, "recalculateProductRating").mockResolvedValue({});

      const response = await request(app)
        .post(`/api/v1/products/${productId}/reviews`)
        .set("Authorization", `Bearer ${validToken}`)
        .send({ rating: 5, title: "Durable", body: "Solid construction." });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.review.rating).toBe(5);
      expect(response.body.data.review.isVerifiedBuyer).toBe(true);
    });
  });

  describe("GET /api/v1/products/:productId/reviews", () => {
    it("22. rejects malformed productId with 400", async () => {
      const response = await request(app)
        .get("/api/v1/products/invalid-id/reviews")
        .set("Authorization", `Bearer ${validToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("27, 28. retrieves reviews with pagination and sorting", async () => {
      vi.spyOn(Product, "exists").mockResolvedValue({ _id: productId });
      vi.spyOn(Review, "countDocuments").mockResolvedValue(1);

      const mockFind = {
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([
          {
            _id: reviewId,
            product: productId,
            user: { _id: userId, name: "Customer One" },
            rating: 5,
            body: "Excellent gear.",
            isVerifiedBuyer: true,
            status: "published"
          }
        ])
      };
      vi.spyOn(Review, "find").mockReturnValue(mockFind);

      const response = await request(app)
        .get(`/api/v1/products/${productId}/reviews?page=1&limit=10&sortBy=createdAt&sortOrder=desc`)
        .set("Authorization", `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.reviews).toHaveLength(1);
      expect(response.body.data.pagination.totalReviews).toBe(1);
    });
  });

  describe("PATCH /api/v1/products/:productId/reviews/:reviewId", () => {
    it("32, 33. rejects malformed reviewId with 400", async () => {
      const response = await request(app)
        .patch(`/api/v1/products/${productId}/reviews/invalid-review-id`)
        .set("Authorization", `Bearer ${validToken}`)
        .send({ rating: 4 });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("34, 35. rejects empty update body with 400", async () => {
      const response = await request(app)
        .patch(`/api/v1/products/${productId}/reviews/${reviewId}`)
        .set("Authorization", `Bearer ${validToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("36. updates review successfully and returns 200", async () => {
      vi.spyOn(Review, "findOne").mockResolvedValue({
        _id: reviewId,
        product: productId,
        user: new mongoose.Types.ObjectId(userId)
      });

      const mockFindOneAndUpdate = {
        populate: vi.fn().mockReturnThis(),
        select: vi.fn().mockResolvedValue({
          _id: reviewId,
          product: productId,
          rating: 4,
          title: "Updated",
          body: "Updated body content."
        })
      };
      vi.spyOn(Review, "findOneAndUpdate").mockReturnValue(mockFindOneAndUpdate);
      vi.spyOn(reviewService, "recalculateProductRating").mockResolvedValue({});

      const response = await request(app)
        .patch(`/api/v1/products/${productId}/reviews/${reviewId}`)
        .set("Authorization", `Bearer ${validToken}`)
        .send({ rating: 4, title: "Updated" });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.review.rating).toBe(4);
    });
  });

  describe("DELETE /api/v1/products/:productId/reviews/:reviewId", () => {
    it("46, 47. rejects malformed reviewId with 400", async () => {
      const response = await request(app)
        .delete(`/api/v1/products/${productId}/reviews/bad-review-id`)
        .set("Authorization", `Bearer ${validToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("48. deletes review successfully and returns 200", async () => {
      vi.spyOn(Review, "findOne").mockResolvedValue({
        _id: reviewId,
        product: productId,
        user: new mongoose.Types.ObjectId(userId)
      });
      vi.spyOn(Review, "findOneAndDelete").mockResolvedValue({ _id: reviewId });
      vi.spyOn(reviewService, "recalculateProductRating").mockResolvedValue({});

      const response = await request(app)
        .delete(`/api/v1/products/${productId}/reviews/${reviewId}`)
        .set("Authorization", `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.reviewId).toBe(reviewId);
    });
  });
});
