import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../../app.js";
import User from "../users/user.model.js";
import * as service from "./recently-viewed.service.js";
import generateToken from "../../utils/generate-token.js";

describe("Recently Viewed Routes Integration Tests", () => {
  let app;
  const userId = "507f1f77bcf86cd799439011";
  const productId = "607f1f77bcf86cd799439021";

  const mockUser = {
    _id: new mongoose.Types.ObjectId(userId),
    email: "customer@example.com",
    role: "customer",
    isActive: true
  };

  const validToken = generateToken({
    userId,
    email: "customer@example.com",
    role: "customer"
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    app = createApp();
    vi.spyOn(User, "findById").mockResolvedValue(mockUser);
  });

  describe("Authentication Guards", () => {
    it("POST /api/v1/recently-viewed rejects unauthenticated request with 401", async () => {
      const response = await request(app)
        .post("/api/v1/recently-viewed")
        .send({ productId });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it("GET /api/v1/recently-viewed rejects unauthenticated request with 401", async () => {
      const response = await request(app).get("/api/v1/recently-viewed");

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it("DELETE /api/v1/recently-viewed rejects unauthenticated request with 401", async () => {
      const response = await request(app).delete("/api/v1/recently-viewed");

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it("POST /api/v1/recently-viewed/merge rejects unauthenticated request with 401", async () => {
      const response = await request(app)
        .post("/api/v1/recently-viewed/merge")
        .send({ productIds: [productId] });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe("Input Validation & Strict Schema Enforcement", () => {
    it("POST /api/v1/recently-viewed rejects missing productId with 400", async () => {
      const response = await request(app)
        .post("/api/v1/recently-viewed")
        .set("Authorization", `Bearer ${validToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("POST /api/v1/recently-viewed rejects malformed productId with 400", async () => {
      const response = await request(app)
        .post("/api/v1/recently-viewed")
        .set("Authorization", `Bearer ${validToken}`)
        .send({ productId: "not-a-valid-hex-id" });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("POST /api/v1/recently-viewed rejects unrecognized extra fields (e.g. userId) with 400", async () => {
      const response = await request(app)
        .post("/api/v1/recently-viewed")
        .set("Authorization", `Bearer ${validToken}`)
        .send({ productId, userId: "forged-user-id" });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("GET /api/v1/recently-viewed rejects limit of 0 with 400", async () => {
      const response = await request(app)
        .get("/api/v1/recently-viewed?limit=0")
        .set("Authorization", `Bearer ${validToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("GET /api/v1/recently-viewed rejects limit exceeding maximum (21) with 400", async () => {
      const response = await request(app)
        .get("/api/v1/recently-viewed?limit=21")
        .set("Authorization", `Bearer ${validToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("POST /api/v1/recently-viewed/merge rejects empty productIds array with 400", async () => {
      const response = await request(app)
        .post("/api/v1/recently-viewed/merge")
        .set("Authorization", `Bearer ${validToken}`)
        .send({ productIds: [] });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("POST /api/v1/recently-viewed/merge rejects productIds array exceeding 12 items with 400", async () => {
      const tooMany = Array.from({ length: 13 }, () => productId);
      const response = await request(app)
        .post("/api/v1/recently-viewed/merge")
        .set("Authorization", `Bearer ${validToken}`)
        .send({ productIds: tooMany });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("End-to-End Endpoint Workflows", () => {
    it("POST /api/v1/recently-viewed records view and returns 200 with authoritative result", async () => {
      const mockResult = {
        productId,
        viewedAt: new Date().toISOString()
      };
      vi.spyOn(service, "recordProductView").mockResolvedValue(mockResult);

      const response = await request(app)
        .post("/api/v1/recently-viewed")
        .set("Authorization", `Bearer ${validToken}`)
        .send({ productId });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.productId).toBe(productId);
      expect(response.body.requestId).toBeDefined();
    });

    it("GET /api/v1/recently-viewed returns 200 with populated items and total count", async () => {
      const mockResult = {
        items: [
          {
            viewedAt: new Date().toISOString(),
            product: {
              _id: productId,
              name: "Alpine Tent",
              price: 9999,
              stock: 5,
              category: "Gear",
              image: "https://example.com/tent.jpg",
              isActive: true
            }
          }
        ],
        totalItems: 1
      };
      vi.spyOn(service, "getRecentlyViewed").mockResolvedValue(mockResult);

      const response = await request(app)
        .get("/api/v1/recently-viewed?limit=5")
        .set("Authorization", `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.items).toHaveLength(1);
      expect(response.body.data.totalItems).toBe(1);
    });

    it("DELETE /api/v1/recently-viewed clears history and returns 200", async () => {
      vi.spyOn(service, "clearRecentlyViewed").mockResolvedValue({ success: true });

      const response = await request(app)
        .delete("/api/v1/recently-viewed")
        .set("Authorization", `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe("Recently viewed history cleared successfully");
    });

    it("POST /api/v1/recently-viewed returns 404 PRODUCT_NOT_FOUND when product does not exist", async () => {
      const notFoundErr = new Error("Product not found");
      notFoundErr.statusCode = 404;
      notFoundErr.code = "PRODUCT_NOT_FOUND";
      notFoundErr.isOperational = true;
      vi.spyOn(service, "recordProductView").mockRejectedValue(notFoundErr);

      const response = await request(app)
        .post("/api/v1/recently-viewed")
        .set("Authorization", `Bearer ${validToken}`)
        .send({ productId });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("PRODUCT_NOT_FOUND");
    });

    it("POST /api/v1/recently-viewed/merge merges guest products and returns 200", async () => {
      vi.spyOn(service, "mergeRecentlyViewed").mockResolvedValue({ mergedCount: 1 });

      const response = await request(app)
        .post("/api/v1/recently-viewed/merge")
        .set("Authorization", `Bearer ${validToken}`)
        .send({ productIds: [productId] });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.mergedCount).toBe(1);
    });
  });

  describe("User Isolation & Cross-User Security", () => {
    it("GET /api/v1/recently-viewed scopes query strictly to authenticated user and ignores query attempts to spoof user", async () => {
      const getSpy = vi.spyOn(service, "getRecentlyViewed").mockResolvedValue({ items: [], totalItems: 0 });

      await request(app)
        .get(`/api/v1/recently-viewed?userId=507f1f77bcf86cd799439099`)
        .set("Authorization", `Bearer ${validToken}`);

      // The service must be called with mockUser._id, NOT the spoofed userId
      expect(getSpy).toHaveBeenCalledWith(mockUser._id, expect.any(Number));
    });

    it("DELETE /api/v1/recently-viewed scopes deletion strictly to authenticated user", async () => {
      const clearSpy = vi.spyOn(service, "clearRecentlyViewed").mockResolvedValue({ success: true });

      await request(app)
        .delete("/api/v1/recently-viewed")
        .set("Authorization", `Bearer ${validToken}`);

      expect(clearSpy).toHaveBeenCalledWith(mockUser._id);
    });

    it("POST /api/v1/recently-viewed scopes record upsert strictly to authenticated user", async () => {
      const recordSpy = vi.spyOn(service, "recordProductView").mockResolvedValue({
        productId,
        viewedAt: new Date().toISOString()
      });

      await request(app)
        .post("/api/v1/recently-viewed")
        .set("Authorization", `Bearer ${validToken}`)
        .send({ productId });

      expect(recordSpy).toHaveBeenCalledWith(mockUser._id, productId);
    });
  });
});
