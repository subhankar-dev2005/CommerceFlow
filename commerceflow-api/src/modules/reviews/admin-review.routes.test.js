import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import User from "../users/user.model.js";
import Review from "./review.model.js";
import * as reviewService from "./review.service.js";
import generateToken from "../../utils/generate-token.js";
import { authRateLimitMiddleware } from "../../common/middleware/auth-rate-limit.middleware.js";

describe("Admin Review Routes Security & Integration Tests", () => {
  let app;
  const adminId = "507f1f77bcf86cd799439001";
  const customerId = "507f1f77bcf86cd799439002";
  const reviewId = "507f1f77bcf86cd799439010";
  const productId = "507f1f77bcf86cd799439020";

  let adminToken;
  let customerToken;

  beforeEach(() => {
    vi.restoreAllMocks();
    app = createApp();

    authRateLimitMiddleware.resetKey("::ffff:127.0.0.1");
    authRateLimitMiddleware.resetKey("127.0.0.1");
    authRateLimitMiddleware.resetKey("::1");

    adminToken = generateToken({
      userId: adminId,
      email: "admin@example.com",
      role: "admin"
    });

    customerToken = generateToken({
      userId: customerId,
      email: "customer@example.com",
      role: "customer"
    });

    vi.spyOn(User, "findById").mockImplementation((id) => {
      const idStr = id?.toString();
      if (idStr === adminId) {
        return Promise.resolve({
          _id: adminId,
          email: "admin@example.com",
          role: "admin",
          isActive: true,
          tokenVersion: 0
        });
      }
      if (idStr === customerId) {
        return Promise.resolve({
          _id: customerId,
          email: "customer@example.com",
          role: "customer",
          isActive: true,
          tokenVersion: 0
        });
      }
      return Promise.resolve(null);
    });
  });

  describe("Authentication Gateways", () => {
    it("rejects unauthenticated GET /api/v1/admin/reviews with 401 AUTH_TOKEN_REQUIRED", async () => {
      const res = await request(app).get("/api/v1/admin/reviews");

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("AUTH_TOKEN_REQUIRED");
    });

    it("rejects unauthenticated PATCH /api/v1/admin/reviews/:id/status with 401 AUTH_TOKEN_REQUIRED", async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/reviews/${reviewId}/status`)
        .send({ status: "hidden" });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("AUTH_TOKEN_REQUIRED");
    });

    it("rejects unauthenticated DELETE /api/v1/admin/reviews/:id with 401 AUTH_TOKEN_REQUIRED", async () => {
      const res = await request(app).delete(`/api/v1/admin/reviews/${reviewId}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("AUTH_TOKEN_REQUIRED");
    });

    it("rejects unauthenticated POST /api/v1/admin/reviews/products/:productId/repair-rating with 401", async () => {
      const res = await request(app).post(`/api/v1/admin/reviews/products/${productId}/repair-rating`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("AUTH_TOKEN_REQUIRED");
    });
  });

  describe("Authorization Gateways", () => {
    it("rejects customer access to GET /api/v1/admin/reviews with 403 FORBIDDEN", async () => {
      const res = await request(app)
        .get("/api/v1/admin/reviews")
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("rejects customer access to PATCH /api/v1/admin/reviews/:id/status with 403 FORBIDDEN", async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/reviews/${reviewId}/status`)
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ status: "hidden" });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("rejects customer access to DELETE /api/v1/admin/reviews/:id with 403 FORBIDDEN", async () => {
      const res = await request(app)
        .delete(`/api/v1/admin/reviews/${reviewId}`)
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("rejects customer access to POST /api/v1/admin/reviews/products/:productId/repair-rating with 403", async () => {
      const res = await request(app)
        .post(`/api/v1/admin/reviews/products/${productId}/repair-rating`)
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });
  });

  describe("Validation Controls", () => {
    it("rejects invalid query rating values with 400 VALIDATION_ERROR", async () => {
      const res = await request(app)
        .get("/api/v1/admin/reviews?rating=10")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects invalid review ID format on status update with 400 VALIDATION_ERROR", async () => {
      const res = await request(app)
        .patch("/api/v1/admin/reviews/invalid-hex-id/status")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "hidden" });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects unsupported status value on status update with 400 VALIDATION_ERROR", async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/reviews/${reviewId}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "archived" });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects invalid review ID format on delete with 400 VALIDATION_ERROR", async () => {
      const res = await request(app)
        .delete("/api/v1/admin/reviews/invalid-id")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects invalid product ID format on repair-rating with 400 VALIDATION_ERROR", async () => {
      const res = await request(app)
        .post("/api/v1/admin/reviews/products/not-hex/repair-rating")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("Admin Execution & Controller Reaching", () => {
    it("allows admin to retrieve paginated reviews with 200 OK", async () => {
      const leanMock = vi.fn().mockResolvedValue([
        {
          _id: reviewId,
          rating: 5,
          title: "Super Tent",
          body: "Excellent gear",
          status: "published",
          product: { _id: productId, name: "Alpine Tent" },
          user: { _id: customerId, name: "Jane Doe", email: "jane@example.com" }
        }
      ]);
      const selectMock = vi.fn().mockReturnValue({ lean: leanMock });
      const popUserMock = vi.fn().mockReturnValue({ select: selectMock });
      const popProdMock = vi.fn().mockReturnValue({ populate: popUserMock });
      const limitMock = vi.fn().mockReturnValue({ populate: popProdMock });
      const skipMock = vi.fn().mockReturnValue({ limit: limitMock });
      const sortMock = vi.fn().mockReturnValue({ skip: skipMock });

      vi.spyOn(Review, "find").mockReturnValue({ sort: sortMock });
      vi.spyOn(Review, "countDocuments").mockResolvedValue(1);

      const res = await request(app)
        .get("/api/v1/admin/reviews")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.reviews).toHaveLength(1);
      expect(res.body.data.pagination.totalReviews).toBe(1);
    });

    it("allows admin to update review status with 200 OK", async () => {
      const mockDoc = {
        _id: reviewId,
        product: productId,
        status: "published",
        save: vi.fn().mockResolvedValue(true)
      };

      const populatedChain = {
        populate: vi.fn().mockReturnValue({
          populate: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              lean: vi.fn().mockResolvedValue({
                _id: reviewId,
                status: "hidden",
                product: { _id: productId, name: "Alpine Tent" }
              })
            })
          })
        })
      };

      vi.spyOn(Review, "findById")
        .mockResolvedValueOnce(mockDoc)
        .mockReturnValueOnce(populatedChain);

      vi.spyOn(reviewService, "recalculateProductRating").mockResolvedValue({
        ratingAverage: 4.0,
        ratingCount: 1
      });

      const res = await request(app)
        .patch(`/api/v1/admin/reviews/${reviewId}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "hidden" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.review.status).toBe("hidden");
    });

    it("allows admin to delete review with 200 OK", async () => {
      const mockDoc = {
        _id: reviewId,
        product: productId,
        status: "published",
        save: vi.fn().mockResolvedValue(true)
      };

      vi.spyOn(Review, "findById").mockResolvedValue(mockDoc);
      vi.spyOn(Review, "findByIdAndDelete").mockResolvedValue(mockDoc);
      vi.spyOn(reviewService, "recalculateProductRating").mockResolvedValue({
        ratingAverage: 0,
        ratingCount: 0
      });

      const res = await request(app)
        .delete(`/api/v1/admin/reviews/${reviewId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.reviewId).toBe(reviewId);
    });

    it("allows admin to trigger repair-rating with 200 OK", async () => {
      vi.spyOn(reviewService, "repairProductRating").mockResolvedValue({
        repaired: true,
        previous: { ratingAverage: 3.0, ratingCount: 1 },
        current: { ratingAverage: 4.5, ratingCount: 2 }
      });

      const res = await request(app)
        .post(`/api/v1/admin/reviews/products/${productId}/repair-rating`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.repaired).toBe(true);
    });
  });
});
