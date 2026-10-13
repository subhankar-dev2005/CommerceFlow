import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import Cart from "./cart.model.js";

function createValidCartData(overrides = {}) {
  return {
    user: new mongoose.Types.ObjectId(),
    items: [],
    coupon: null,
    ...overrides
  };
}

describe("P1.6.2 Cart Model — Variant Identity Tests", () => {
  describe("Cart Item Schema & Defaults", () => {
    it("defines variantId on cart items defaulting to null for simple products", async () => {
      const productId = new mongoose.Types.ObjectId();
      const cart = new Cart(
        createValidCartData({
          items: [
            {
              product: productId,
              quantity: 2
            }
          ]
        })
      );

      await cart.validate();
      expect(cart.items[0].product.toString()).toBe(productId.toString());
      expect(cart.items[0].quantity).toBe(2);
      expect(cart.items[0].variantId).toBeNull();
      expect(cart.items[0]._id).toBeUndefined();
    });

    it("accepts and trims explicit variantId for variant products", async () => {
      const productId = new mongoose.Types.ObjectId();
      const cart = new Cart(
        createValidCartData({
          items: [
            {
              product: productId,
              variantId: "   var_uuid_red_xl   ",
              quantity: 1
            }
          ]
        })
      );

      await cart.validate();
      expect(cart.items[0].variantId).toBe("var_uuid_red_xl");
    });

    it("can store both simple products and variant products in the same cart", async () => {
      const simpleProdId = new mongoose.Types.ObjectId();
      const variantProdId = new mongoose.Types.ObjectId();

      const cart = new Cart(
        createValidCartData({
          items: [
            {
              product: simpleProdId,
              variantId: null,
              quantity: 3
            },
            {
              product: variantProdId,
              variantId: "var_blue_m",
              quantity: 1
            },
            {
              product: variantProdId,
              variantId: "var_blue_l",
              quantity: 2
            }
          ]
        })
      );

      await cart.validate();
      expect(cart.items.length).toBe(3);
      expect(cart.items[0].variantId).toBeNull();
      expect(cart.items[1].variantId).toBe("var_blue_m");
      expect(cart.items[2].variantId).toBe("var_blue_l");
    });

    it("preserves legacy cart document compatibility without variantId", async () => {
      const legacyCartDoc = {
        user: new mongoose.Types.ObjectId(),
        items: [
          {
            product: new mongoose.Types.ObjectId(),
            quantity: 1
          }
        ]
      };

      const cart = new Cart(legacyCartDoc);
      await cart.validate();

      expect(cart.items[0].variantId).toBeNull();
    });

    it("fails validation if item product ObjectId is missing", async () => {
      const cart = new Cart(
        createValidCartData({
          items: [
            {
              quantity: 1
            }
          ]
        })
      );

      await expect(cart.validate()).rejects.toThrow();
    });

    it("fails validation if item quantity is less than 1", async () => {
      const cart = new Cart(
        createValidCartData({
          items: [
            {
              product: new mongoose.Types.ObjectId(),
              variantId: "var_123",
              quantity: 0
            }
          ]
        })
      );

      await expect(cart.validate()).rejects.toThrow();
    });
  });
});
