import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import Order from "./order.model.js";

function createValidOrderData(overrides = {}) {
  return {
    user: new mongoose.Types.ObjectId(),
    items: [
      {
        product: new mongoose.Types.ObjectId(),
        name: "Test Product",
        price: 100,
        quantity: 1,
        subtotal: 100
      }
    ],
    totalQuantity: 1,
    subtotal: 100,
    shippingAmount: 0,
    taxAmount: 0,
    discountAmount: 0,
    total: 100,
    payment: {
      provider: "razorpay",
      status: "pending"
    },
    shippingAddress: {
      fullName: "Test User",
      phone: "1234567890",
      addressLine1: "123 Main St",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
      country: "India"
    },
    ...overrides
  };
}

describe("P1.6.2 Order Model — Variant Snapshot & Restoration Tests", () => {
  describe("Order Item Variant Snapshot Fields", () => {
    it("defaults variantId, variantName, and sku to null for legacy/simple orders", async () => {
      const order = new Order(createValidOrderData());
      await order.validate();

      const item = order.items[0];
      expect(item.variantId).toBeNull();
      expect(item.variantName).toBeNull();
      expect(item.sku).toBeNull();
      expect(item._id).toBeUndefined();
    });

    it("persists snapshot of variant identity (variantId, variantName, sku)", async () => {
      const order = new Order(
        createValidOrderData({
          items: [
            {
              product: new mongoose.Types.ObjectId(),
              name: "Running Shoes",
              variantId: "var_shoe_42_black",
              variantName: "Size 42 / Black",
              sku: "SHOE-42-BLK",
              price: 3499,
              quantity: 1,
              subtotal: 3499
            }
          ],
          totalQuantity: 1,
          subtotal: 3499,
          total: 3499
        })
      );

      await order.validate();
      const item = order.items[0];

      expect(item.name).toBe("Running Shoes");
      expect(item.variantId).toBe("var_shoe_42_black");
      expect(item.variantName).toBe("Size 42 / Black");
      expect(item.sku).toBe("SHOE-42-BLK");
      expect(item.price).toBe(3499);
      expect(item._id).toBeUndefined();
    });

    it("trims variant snapshot strings properly", async () => {
      const order = new Order(
        createValidOrderData({
          items: [
            {
              product: new mongoose.Types.ObjectId(),
              name: "Hoodie",
              variantId: "   var_hoodie_xl   ",
              variantName: "   XL / Navy   ",
              sku: "   HD-XL-NVY   ",
              price: 1299,
              quantity: 1,
              subtotal: 1299
            }
          ]
        })
      );

      await order.validate();
      const item = order.items[0];

      expect(item.variantId).toBe("var_hoodie_xl");
      expect(item.variantName).toBe("XL / Navy");
      expect(item.sku).toBe("HD-XL-NVY");
    });
  });

  describe("Checkout Compensation Restored Items Variant Support", () => {
    it("defaults variantId to null on restoredItems for backward compatibility", async () => {
      const productId = new mongoose.Types.ObjectId();
      const order = new Order(
        createValidOrderData({
          checkoutState: "compensation_pending",
          checkoutCompensation: {
            reservationId: "res-123",
            couponId: null,
            restoredItems: [
              {
                product: productId,
                quantity: 2,
                restorationKey: "restore_key_1",
                restorationState: "pending"
              }
            ]
          }
        })
      );

      await order.validate();
      const restored = order.checkoutCompensation.restoredItems[0];
      expect(restored.variantId).toBeNull();
      expect(restored.product.toString()).toBe(productId.toString());
      expect(restored.quantity).toBe(2);
      expect(restored._id).toBeUndefined();
    });

    it("persists exact variantId on restoredItems for variant stock restoration", async () => {
      const productId = new mongoose.Types.ObjectId();
      const order = new Order(
        createValidOrderData({
          checkoutState: "compensation_pending",
          checkoutCompensation: {
            reservationId: null,
            couponId: null,
            restoredItems: [
              {
                product: productId,
                variantId: "var_uuid_variant_restored",
                quantity: 1,
                restorationKey: "restore_key_var",
                restorationState: "pending"
              }
            ]
          }
        })
      );

      await order.validate();
      const restored = order.checkoutCompensation.restoredItems[0];
      expect(restored.variantId).toBe("var_uuid_variant_restored");
      expect(restored.product.toString()).toBe(productId.toString());
    });
  });
});
