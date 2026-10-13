import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import Cart from "./cart.model.js";
import WishlistItem from "../wishlist/wishlist-item.model.js";
import User from "../users/user.model.js";
import generateToken from "../../utils/generate-token.js";

describe("Cart and Wishlist DELETE HTTP Contract Tests", () => {
  let app;
  const userId = "507f1f77bcf86cd799439002";
  const validProductId = "507f1f77bcf86cd799439011";
  let authToken;

  beforeEach(() => {
    vi.restoreAllMocks();
    app = createApp();
    authToken = generateToken({
      userId,
      email: "user@example.com",
      role: "customer"
    });

    vi.spyOn(User, "findById").mockImplementation((id) => {
      const idStr = id.toString();
      return Promise.resolve({
        _id: idStr,
        email: `${idStr}@example.com`,
        role: "customer",
        isActive: true
      });
    });
  });

  describe("DELETE /api/v1/cart/items/:productId", () => {
    function mockCartWithItem() {
      const cart = {
        _id: "507f1f77bcf86cd799439099",
        user: userId,
        items: [
          {
            product: {
              toString: () => validProductId
            },
            variantId: null,
            quantity: 1
          }
        ],
        save: vi.fn().mockResolvedValue(true)
      };
      vi.spyOn(Cart, "findOne").mockResolvedValue(cart);
      return cart;
    }

    it("successfully deletes cart item without a request body", async () => {
      const cart = mockCartWithItem();

      const res = await request(app)
        .delete(`/api/v1/cart/items/${validProductId}`)
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe("Product removed from cart successfully");
      expect(cart.save).toHaveBeenCalledTimes(1);
    });

    it("successfully deletes cart item with an empty JSON body ({})", async () => {
      const cart = mockCartWithItem();

      const res = await request(app)
        .delete(`/api/v1/cart/items/${validProductId}`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe("Product removed from cart successfully");
      expect(cart.save).toHaveBeenCalledTimes(1);
    });

    it("rejects invalid productId with 400 validation error", async () => {
      const res = await request(app)
        .delete("/api/v1/cart/items/invalid-product-id")
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects unauthorized request without token with 401", async () => {
      const res = await request(app)
        .delete(`/api/v1/cart/items/${validProductId}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("AUTH_TOKEN_REQUIRED");
    });
  });

  describe("DELETE /api/v1/wishlist/items/:productId", () => {
    it("successfully deletes wishlist item without a request body", async () => {
      vi.spyOn(WishlistItem, "deleteOne").mockResolvedValue({ deletedCount: 1 });

      const res = await request(app)
        .delete(`/api/v1/wishlist/items/${validProductId}`)
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe("Product removed from wishlist");
      expect(WishlistItem.deleteOne).toHaveBeenCalledWith({
        user: userId,
        product: validProductId
      });
    });

    it("successfully deletes wishlist item with an empty JSON body ({})", async () => {
      vi.spyOn(WishlistItem, "deleteOne").mockResolvedValue({ deletedCount: 1 });

      const res = await request(app)
        .delete(`/api/v1/wishlist/items/${validProductId}`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe("Product removed from wishlist");
      expect(WishlistItem.deleteOne).toHaveBeenCalledWith({
        user: userId,
        product: validProductId
      });
    });

    it("rejects invalid productId with 400 validation error", async () => {
      const res = await request(app)
        .delete("/api/v1/wishlist/items/invalid-hex-id")
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects unauthorized request without token with 401", async () => {
      const res = await request(app)
        .delete(`/api/v1/wishlist/items/${validProductId}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("AUTH_TOKEN_REQUIRED");
    });
  });
});
