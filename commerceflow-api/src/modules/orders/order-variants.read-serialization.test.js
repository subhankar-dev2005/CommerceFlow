import { describe, it, expect, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import Order from "./order.model.js";
import Product from "../products/product.model.js";
import getOrder from "./get-order.controller.js";
import getOrders from "./get-orders.controller.js";
import getAdminOrders from "./get-admin-orders.controller.js";

/**
 * P1.6.6 — Variant Regression & Read Serialization Tests
 *
 * Verifies that:
 * 1. Order line items expose public variant snapshot fields:
 *    - product, name, variantId, variantName, sku, price, quantity, subtotal
 * 2. Simple products default variantId/variantName to null (preserving sku if present).
 * 3. Sensitive internal fields are strictly suppressed from serialization:
 *    - checkoutCompensation
 *    - restorationKeys (on Product)
 *    - internal restoration ledger fields
 * 4. GET /api/v1/orders/:orderId preserves variant snapshots and suppresses internals.
 * 5. GET /api/v1/orders (customer list) preserves variant snapshots and suppresses internals.
 * 6. GET /api/v1/admin/orders (admin list) preserves variant snapshots and suppresses internals.
 */
describe("P1.6.6 — Order Read Serialization & Variant Snapshot Visibility", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockUserId = new mongoose.Types.ObjectId();
  const mockProductIdVariant = new mongoose.Types.ObjectId();
  const mockProductIdSimple = new mongoose.Types.ObjectId();

  const sampleVariantItem = {
    product: mockProductIdVariant,
    name: "Expedition Parka",
    variantId: "var_parka_xl_red",
    variantName: "XL / Crimson Red",
    sku: "EXP-PRK-XL-RED",
    price: 4999,
    quantity: 2,
    subtotal: 9998
  };

  const sampleSimpleItem = {
    product: mockProductIdSimple,
    name: "Classic Mug",
    variantId: null,
    variantName: null,
    sku: "MUG-CLS-01",
    price: 399,
    quantity: 1,
    subtotal: 399
  };

  const sampleOrderData = {
    _id: new mongoose.Types.ObjectId(),
    user: mockUserId,
    items: [sampleVariantItem, sampleSimpleItem],
    totalQuantity: 3,
    subtotal: 10397,
    shippingAmount: 0,
    taxAmount: 0,
    discountAmount: 0,
    total: 10397,
    payment: {
      provider: "razorpay",
      status: "pending",
      transactionId: "",
      razorpayOrderId: ""
    },
    shippingAddress: {
      fullName: "Alex Mercer",
      phone: "9876543210",
      addressLine1: "42 Pioneer Street",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
      country: "India"
    },
    status: "pending",
    checkoutState: "none",
    checkoutCompensation: {
      reservationId: "res-uuid-1234",
      couponId: null,
      restoredItems: [
        {
          product: mockProductIdVariant,
          variantId: "var_parka_xl_red",
          quantity: 2,
          deducted: true,
          restorationState: "pending",
          restored: false,
          restorationKey: "key-internal-123"
        }
      ]
    }
  };

  describe("Model-Level Serialization (toJSON)", () => {
    it("exposes public variant snapshot fields on order items", () => {
      const order = new Order(sampleOrderData);
      const json = order.toJSON();

      expect(json.items).toHaveLength(2);

      const variantItem = json.items[0];
      expect(variantItem.variantId).toBe("var_parka_xl_red");
      expect(variantItem.variantName).toBe("XL / Crimson Red");
      expect(variantItem.sku).toBe("EXP-PRK-XL-RED");
      expect(variantItem.name).toBe("Expedition Parka");
      expect(variantItem.price).toBe(4999);
      expect(variantItem.quantity).toBe(2);
      expect(variantItem.subtotal).toBe(9998);

      const simpleItem = json.items[1];
      expect(simpleItem.variantId).toBeNull();
      expect(simpleItem.variantName).toBeNull();
      expect(simpleItem.sku).toBe("MUG-CLS-01");
      expect(simpleItem.name).toBe("Classic Mug");
      expect(simpleItem.price).toBe(399);
      expect(simpleItem.quantity).toBe(1);
      expect(simpleItem.subtotal).toBe(399);
    });

    it("strictly deletes checkoutCompensation during toJSON transformation", () => {
      const order = new Order(sampleOrderData);
      const json = order.toJSON();

      expect(json.checkoutCompensation).toBeUndefined();
      const stringified = JSON.stringify(order);
      expect(stringified).not.toContain("checkoutCompensation");
      expect(stringified).not.toContain("res-uuid-1234");
      expect(stringified).not.toContain("key-internal-123");
    });

    it("strictly strips restorationKeys from Product toJSON", () => {
      const product = new Product({
        name: "Test Parka",
        description: "Heavy winter parka",
        price: 4999,
        stock: 10,
        category: "Outerwear",
        restorationKeys: ["key-restore-1", "key-restore-2"]
      });

      const json = product.toJSON();
      expect(json.restorationKeys).toBeUndefined();
      const stringified = JSON.stringify(product);
      expect(stringified).not.toContain("restorationKeys");
      expect(stringified).not.toContain("key-restore-1");
    });
  });

  describe("GET /api/v1/orders/:orderId (Single Order Read)", () => {
    it("returns variant snapshot fields while suppressing checkoutCompensation", async () => {
      const orderDoc = new Order(sampleOrderData);

      const populatedDoc = {
        ...orderDoc.toObject(),
        items: [
          {
            ...sampleVariantItem,
            product: {
              _id: mockProductIdVariant,
              name: "Expedition Parka",
              price: 4999,
              category: "Outerwear",
              image: "https://example.com/parka.jpg"
            }
          },
          {
            ...sampleSimpleItem,
            product: {
              _id: mockProductIdSimple,
              name: "Classic Mug",
              price: 399,
              category: "Merchandise",
              image: "https://example.com/mug.jpg"
            }
          }
        ]
      };
      delete populatedDoc.checkoutCompensation;

      const populateMock = vi.fn().mockResolvedValue(populatedDoc);
      vi.spyOn(Order, "findById").mockReturnValue({ populate: populateMock });

      const req = {
        params: { orderId: sampleOrderData._id.toString() },
        user: { _id: mockUserId, role: "customer" },
        requestId: "req-read-variant-test"
      };

      const res = {
        statusCode: 200,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json: vi.fn()
      };
      const next = vi.fn();

      await getOrder(req, res, next);

      expect(res.status).toBeDefined();
      expect(res.json).toHaveBeenCalled();
      const body = res.json.mock.calls[0][0];

      expect(body.success).toBe(true);
      expect(body.data.order.items[0].variantId).toBe("var_parka_xl_red");
      expect(body.data.order.items[0].variantName).toBe("XL / Crimson Red");
      expect(body.data.order.items[0].sku).toBe("EXP-PRK-XL-RED");

      expect(body.data.order.items[1].variantId).toBeNull();
      expect(body.data.order.items[1].variantName).toBeNull();

      expect(body.data.order.checkoutCompensation).toBeUndefined();
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/v1/orders (Customer Order List)", () => {
    it("returns items with variant snapshot fields and suppresses checkoutCompensation", async () => {
      const orderItem = {
        _id: sampleOrderData._id,
        user: mockUserId,
        items: [sampleVariantItem, sampleSimpleItem],
        status: "pending",
        subtotal: 10397,
        total: 10397,
        totalQuantity: 3,
        createdAt: new Date()
      };

      vi.spyOn(Order, "countDocuments").mockResolvedValue(1);

      const queryMock = {
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([orderItem])
      };
      vi.spyOn(Order, "find").mockReturnValue(queryMock);

      const req = {
        query: { page: "1", limit: "10" },
        user: { _id: mockUserId, role: "customer" },
        requestId: "req-list-customer-test"
      };

      const res = {
        statusCode: 200,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json: vi.fn()
      };
      const next = vi.fn();

      await getOrders(req, res, next);

      expect(res.json).toHaveBeenCalled();
      const body = res.json.mock.calls[0][0];

      expect(body.success).toBe(true);
      const returnedOrder = body.data.orders[0];
      expect(returnedOrder.items[0].variantId).toBe("var_parka_xl_red");
      expect(returnedOrder.items[0].variantName).toBe("XL / Crimson Red");
      expect(returnedOrder.items[0].sku).toBe("EXP-PRK-XL-RED");
      expect(returnedOrder.checkoutCompensation).toBeUndefined();
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/v1/admin/orders (Admin Order List)", () => {
    it("returns items with variant snapshot fields and suppresses checkoutCompensation", async () => {
      const adminOrderEntry = {
        _id: sampleOrderData._id,
        user: { _id: mockUserId, name: "Alex Mercer", email: "alex@example.com" },
        items: [sampleVariantItem, sampleSimpleItem],
        status: "confirmed",
        checkoutState: "none",
        payment: { status: "paid" },
        subtotal: 10397,
        total: 10397,
        totalQuantity: 3,
        createdAt: new Date()
      };

      vi.spyOn(Order, "countDocuments").mockResolvedValue(1);

      const queryMock = {
        select: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([adminOrderEntry])
      };
      vi.spyOn(Order, "find").mockReturnValue(queryMock);

      const req = {
        query: { page: "1", limit: "10" },
        user: { _id: new mongoose.Types.ObjectId(), role: "admin" },
        requestId: "req-list-admin-test"
      };

      const res = {
        statusCode: 200,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json: vi.fn()
      };
      const next = vi.fn();

      await getAdminOrders(req, res, next);

      expect(res.json).toHaveBeenCalled();
      const body = res.json.mock.calls[0][0];

      expect(body.success).toBe(true);
      const returnedOrder = body.data.orders[0];
      expect(returnedOrder.items[0].variantId).toBe("var_parka_xl_red");
      expect(returnedOrder.items[0].variantName).toBe("XL / Crimson Red");
      expect(returnedOrder.items[0].sku).toBe("EXP-PRK-XL-RED");
      expect(returnedOrder.checkoutCompensation).toBeUndefined();
      expect(next).not.toHaveBeenCalled();
    });
  });
});
