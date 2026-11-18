import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../../app.js";
import User from "./user.model.js";
import Address from "./address.model.js";
import Cart from "../cart/cart.model.js";
import WishlistItem from "../wishlist/wishlist-item.model.js";
import * as recentlyViewedService from "../recently-viewed/recently-viewed.service.js";
import StoreSettings, { STORE_SETTINGS_SINGLETON_KEY } from "../settings/store-settings.model.js";
import * as logoStorage from "../settings/logo-storage.service.js";
import generateToken from "../../utils/generate-token.js";

describe("P1.9.295 — Rate Limiting & Logo Resource Regression Tests", () => {
  let app;
  const userId = "507f1f77bcf86cd799439011";

  const mockUser = {
    _id: new mongoose.Types.ObjectId(userId),
    email: "customer@example.com",
    role: "customer",
    isActive: true,
    tokenVersion: 0,
    addresses: []
  };

  const validToken = generateToken({
    userId,
    email: "customer@example.com",
    role: "customer"
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    app = createApp();

    vi.spyOn(User, "findById").mockImplementation((id) => {
      if (id?.toString() === userId) {
        return Promise.resolve(mockUser);
      }
      return Promise.resolve(null);
    });

    vi.spyOn(Cart, "findOne").mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue({
        userId,
        items: [],
        createdAt: new Date(),
        updatedAt: new Date()
      })
    });

    vi.spyOn(WishlistItem, "find").mockReturnValue({
      populate: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([])
        })
      })
    });

    vi.spyOn(Address, "find").mockReturnValue({
      sort: vi.fn().mockResolvedValue([])
    });

    vi.spyOn(recentlyViewedService, "getRecentlyViewed").mockResolvedValue({
      items: [],
      total: 0
    });
  });

  describe("1. Storefront 4 API endpoints under normal request volumes", () => {
    it("successfully serves /api/v1/recently-viewed with authorized credentials", async () => {
      const res = await request(app)
        .get("/api/v1/recently-viewed")
        .set("Authorization", `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.headers["ratelimit"]).toBeDefined();
      expect(res.headers["ratelimit"]).toContain("limit=100");
    });

    it("successfully serves /api/v1/wishlist with authorized credentials", async () => {
      const res = await request(app)
        .get("/api/v1/wishlist")
        .set("Authorization", `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.headers["ratelimit"]).toBeDefined();
      expect(res.headers["ratelimit"]).toContain("limit=100");
    });

    it("successfully serves /api/v1/cart with authorized credentials", async () => {
      const res = await request(app)
        .get("/api/v1/cart")
        .set("Authorization", `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.headers["ratelimit"]).toBeDefined();
      expect(res.headers["ratelimit"]).toContain("limit=100");
    });

    it("successfully serves /api/v1/users/me/addresses with authorized credentials", async () => {
      const res = await request(app)
        .get("/api/v1/users/me/addresses")
        .set("Authorization", `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.headers["ratelimit"]).toBeDefined();
      expect(res.headers["ratelimit"]).toContain("limit=100");
    });
  });

  describe("2. Public logo & branding asset isolation from API rate limiter", () => {
    it("GET /api/v1/settings/logo and /api/v1/settings/branding do not decrement API rate limit bucket", async () => {
      vi.spyOn(StoreSettings, "findOne").mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          singletonKey: STORE_SETTINGS_SINGLETON_KEY,
          storeName: "CommerceFlow",
          logoUrl: null
        })
      });

      // Dispatch 10 branding and logo requests
      for (let i = 0; i < 10; i += 1) {
        await request(app).get("/api/v1/settings/branding");
        await request(app).get("/api/v1/settings/logo");
      }

      // Check /api/v1/cart remaining quota
      const cartRes = await request(app)
        .get("/api/v1/cart")
        .set("Authorization", `Bearer ${validToken}`);

      expect(cartRes.status).toBe(200);
      // Quota must reflect only the single cart request, completely unpolluted by branding/logo
      expect(cartRes.headers["ratelimit"]).toContain("remaining=99");
    });

    it("GET /api/v1/settings/logo returns Cross-Origin-Resource-Policy: cross-origin header", async () => {
      vi.spyOn(StoreSettings, "findOne").mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          singletonKey: STORE_SETTINGS_SINGLETON_KEY,
          logoStorageKey: null
        })
      });

      const res = await request(app)
        .get("/api/v1/settings/logo")
        .set("Origin", "http://localhost:5174");

      expect(res.headers["cross-origin-resource-policy"]).toBe("cross-origin");
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
    });
  });

  describe("3. Abuse protection: genuine excessive requests (>100) are blocked with 429", () => {
    it("enforces rate limit when requests genuinely exceed the 100-request window", async () => {
      // Send 100 requests to fill the bucket
      const promises = Array.from({ length: 100 }).map(() =>
        request(app)
          .get("/api/v1/cart")
          .set("Authorization", `Bearer ${validToken}`)
      );
      await Promise.all(promises);

      // 101st request must trigger HTTP 429 with RATE_LIMIT_EXCEEDED
      const blockedRes = await request(app)
        .get("/api/v1/cart")
        .set("Authorization", `Bearer ${validToken}`);

      expect(blockedRes.status).toBe(429);
      expect(blockedRes.body.success).toBe(false);
      expect(blockedRes.body.error.code).toBe("RATE_LIMIT_EXCEEDED");
      expect(blockedRes.headers["retry-after"]).toBeDefined();
    });
  });
});
