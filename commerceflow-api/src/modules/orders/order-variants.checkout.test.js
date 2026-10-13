import {
  describe,
  it,
  expect,
  vi,
  beforeEach
} from "vitest";

import mongoose from "mongoose";
import Address from "../users/address.model.js";
import Cart from "../cart/cart.model.js";
import Product from "../products/product.model.js";
import Order from "./order.model.js";
import CheckoutInventoryRestoration from "./checkout-inventory-restoration.model.js";
import CouponReservation from "../coupons/coupon-reservation.model.js";
import CouponUsage from "../coupons/coupon-usage.model.js";

import { createOrder } from "./order.controller.js";

describe("P1.6.2 — Order Checkout Variant Snapshotting Integration Tests", () => {
  const customerId = "507f1f77bcf86cd799439012";
  const addressId = "507f1f77bcf86cd799439011";
  const productId = "507f1f77bcf86cd799439013";
  const variantId = "var_shoe_42_black";

  const standardAddress = {
    _id: addressId,
    user: customerId,
    fullName: "Jane Runner",
    phone: "9876543210",
    addressLine1: "123 Marathon Way",
    addressLine2: "",
    city: "Bengaluru",
    state: "Karnataka",
    postalCode: "560001",
    country: "India"
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(Order, "updateOne").mockResolvedValue({ acknowledged: true, modifiedCount: 1 });
    vi.spyOn(Order, "findByIdAndUpdate").mockResolvedValue(true);
    vi.spyOn(CouponReservation, "deleteOne").mockResolvedValue({ acknowledged: true, deletedCount: 0 });
    vi.spyOn(CouponUsage, "deleteOne").mockResolvedValue({ acknowledged: true, deletedCount: 0 });
    vi.spyOn(CheckoutInventoryRestoration, "create").mockResolvedValue({ status: "pending" });
    vi.spyOn(CheckoutInventoryRestoration, "updateOne").mockResolvedValue({ acknowledged: true });
  });

  function setupReqRes(bodyOverrides = {}) {
    const req = {
      body: {
        addressId,
        ...bodyOverrides
      },
      user: {
        _id: customerId
      },
      requestId: "req-p162-test"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    const next = vi.fn();

    return { req, res, next };
  }

  it("Test 1 — Variant checkout succeeds with full snapshot attributes", async () => {
    vi.spyOn(Address, "findOne").mockResolvedValue(standardAddress);

    const cart = {
      items: [
        {
          product: { _id: productId },
          variantId,
          quantity: 2
        }
      ],
      save: vi.fn().mockResolvedValue(true)
    };
    vi.spyOn(Cart, "findOne").mockReturnValue({
      populate: vi.fn().mockResolvedValue(cart)
    });

    const productDoc = {
      _id: productId,
      name: "Pro Marathon Shoes",
      price: 2999, // Base product price
      stock: 50,
      isActive: true,
      variants: [
        {
          variantId,
          sku: "SHOE-42-BLK",
          attributes: new Map([
            ["size", "42"],
            ["color", "Black"]
          ]),
          price: 3499, // Variant price override
          stock: 10,
          isActive: true
        }
      ]
    };
    vi.spyOn(Product, "findOne").mockResolvedValue(productDoc);
    vi.spyOn(Product, "findOneAndUpdate").mockResolvedValue(productDoc);

    let createdOrderPayload = null;
    vi.spyOn(Order, "create").mockImplementation(async (payload) => {
      createdOrderPayload = payload;
      return {
        _id: new mongoose.Types.ObjectId(),
        ...payload
      };
    });

    const { req, res, next } = setupReqRes();
    await createOrder(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(Order.create).toHaveBeenCalled();

    expect(createdOrderPayload).toBeDefined();
    expect(createdOrderPayload.items).toHaveLength(1);

    const itemSnapshot = createdOrderPayload.items[0];
    expect(itemSnapshot.product.toString()).toBe(productId);
    expect(itemSnapshot.name).toBe("Pro Marathon Shoes");
    expect(itemSnapshot.variantId).toBe(variantId);
    expect(itemSnapshot.sku).toBe("SHOE-42-BLK");
    expect(itemSnapshot.variantName).toBe("42 / Black");
    expect(itemSnapshot.price).toBe(3499);
    expect(itemSnapshot.quantity).toBe(2);
    expect(itemSnapshot.subtotal).toBe(6998);
    expect(createdOrderPayload.subtotal).toBe(6998);
    expect(createdOrderPayload.total).toBe(6998);

    // Verify cart was cleared
    expect(cart.items).toEqual([]);
    expect(cart.save).toHaveBeenCalled();
  });

  it("Test 2 — Variant stock and price are authoritative over parent product", async () => {
    vi.spyOn(Address, "findOne").mockResolvedValue(standardAddress);

    const cart = {
      items: [
        {
          product: { _id: productId },
          variantId,
          quantity: 3
        }
      ],
      save: vi.fn().mockResolvedValue(true)
    };
    vi.spyOn(Cart, "findOne").mockReturnValue({
      populate: vi.fn().mockResolvedValue(cart)
    });

    // Parent product has stock: 100 and price: 1000, but variant has stock: 5 and price: 2500
    const productDoc = {
      _id: productId,
      name: "Performance Jacket",
      price: 1000,
      stock: 100,
      isActive: true,
      variants: [
        {
          variantId,
          sku: "JCK-XL-RED",
          attributes: { size: "XL", color: "Red" },
          price: 2500,
          stock: 5,
          isActive: true
        }
      ]
    };
    vi.spyOn(Product, "findOne").mockResolvedValue(productDoc);
    vi.spyOn(Product, "findOneAndUpdate").mockResolvedValue(productDoc);

    let createdOrderPayload = null;
    vi.spyOn(Order, "create").mockImplementation(async (payload) => {
      createdOrderPayload = payload;
      return {
        _id: new mongoose.Types.ObjectId(),
        ...payload
      };
    });

    const { req, res, next } = setupReqRes();
    await createOrder(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(createdOrderPayload.items[0].price).toBe(2500);
    expect(createdOrderPayload.items[0].subtotal).toBe(7500);
    expect(createdOrderPayload.items[0].sku).toBe("JCK-XL-RED");
    expect(createdOrderPayload.items[0].variantName).toBe("XL / Red");
  });

  it("Test 3 — Rejects checkout when requested quantity exceeds variant stock", async () => {
    vi.spyOn(Address, "findOne").mockResolvedValue(standardAddress);

    const cart = {
      items: [
        {
          product: { _id: productId },
          variantId,
          quantity: 6
        }
      ],
      save: vi.fn()
    };
    vi.spyOn(Cart, "findOne").mockReturnValue({
      populate: vi.fn().mockResolvedValue(cart)
    });

    // Parent product aggregate stock is 50, but variant stock is only 4
    const productDoc = {
      _id: productId,
      name: "Trek Backpack",
      price: 1500,
      stock: 50,
      isActive: true,
      variants: [
        {
          variantId,
          sku: "BP-35L-BLU",
          attributes: { capacity: "35L", color: "Blue" },
          price: 1800,
          stock: 4,
          isActive: true
        }
      ]
    };
    vi.spyOn(Product, "findOne").mockResolvedValue(productDoc);

    const { req, res, next } = setupReqRes();
    await createOrder(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("INSUFFICIENT_STOCK");
    expect(err.message).toBe("Insufficient stock for Trek Backpack");
    expect(res.status).not.toHaveBeenCalled();
  });

  it("Test 4 — Rejects checkout with invalid or inactive variant", async () => {
    vi.spyOn(Address, "findOne").mockResolvedValue(standardAddress);

    // Case 4A: Variant not found
    const cartMissingVar = {
      items: [
        {
          product: { _id: productId },
          variantId: "nonexistent_var_id",
          quantity: 1
        }
      ]
    };
    vi.spyOn(Cart, "findOne").mockReturnValue({
      populate: vi.fn().mockResolvedValue(cartMissingVar)
    });

    const productDoc = {
      _id: productId,
      name: "Camp Mug",
      price: 499,
      stock: 20,
      isActive: true,
      variants: [
        {
          variantId: "var_mug_steel",
          sku: "MUG-STL",
          attributes: { material: "Steel" },
          stock: 10,
          isActive: true
        }
      ]
    };
    vi.spyOn(Product, "findOne").mockResolvedValue(productDoc);

    const { req, res, next } = setupReqRes();
    await createOrder(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err4A = next.mock.calls[0][0];
    expect(err4A.statusCode).toBe(404);
    expect(err4A.code).toBe("VARIANT_NOT_FOUND");

    // Case 4B: Inactive variant
    vi.clearAllMocks();
    const cartInactiveVar = {
      items: [
        {
          product: { _id: productId },
          variantId: "var_mug_copper",
          quantity: 1
        }
      ]
    };
    vi.spyOn(Cart, "findOne").mockReturnValue({
      populate: vi.fn().mockResolvedValue(cartInactiveVar)
    });

    const productInactiveVarDoc = {
      _id: productId,
      name: "Camp Mug",
      price: 499,
      stock: 20,
      isActive: true,
      variants: [
        {
          variantId: "var_mug_copper",
          sku: "MUG-CPR",
          attributes: { material: "Copper" },
          stock: 10,
          isActive: false
        }
      ]
    };
    vi.spyOn(Product, "findOne").mockResolvedValue(productInactiveVarDoc);

    const next4B = vi.fn();
    await createOrder(req, res, next4B);

    expect(next4B).toHaveBeenCalledTimes(1);
    const err4B = next4B.mock.calls[0][0];
    expect(err4B.statusCode).toBe(400);
    expect(err4B.code).toBe("VARIANT_INACTIVE");

    // Case 4C: Variant-enabled product with missing variantId
    vi.clearAllMocks();
    const cartMissingSelection = {
      items: [
        {
          product: { _id: productId },
          variantId: null,
          quantity: 1
        }
      ]
    };
    vi.spyOn(Cart, "findOne").mockReturnValue({
      populate: vi.fn().mockResolvedValue(cartMissingSelection)
    });
    vi.spyOn(Product, "findOne").mockResolvedValue(productDoc);

    const next4C = vi.fn();
    await createOrder(req, res, next4C);

    expect(next4C).toHaveBeenCalledTimes(1);
    const err4C = next4C.mock.calls[0][0];
    expect(err4C.statusCode).toBe(400);
    expect(err4C.code).toBe("VARIANT_REQUIRED");
  });

  it("Test 5 — Variant order snapshot survives catalog price and SKU mutations", async () => {
    vi.spyOn(Address, "findOne").mockResolvedValue(standardAddress);

    const cart = {
      items: [
        {
          product: { _id: productId },
          variantId,
          quantity: 1
        }
      ],
      save: vi.fn().mockResolvedValue(true)
    };
    vi.spyOn(Cart, "findOne").mockReturnValue({
      populate: vi.fn().mockResolvedValue(cart)
    });

    const productDoc = {
      _id: productId,
      name: "Basecamp Sleeping Bag",
      price: 3000,
      stock: 20,
      isActive: true,
      variants: [
        {
          variantId,
          sku: "BAG-0C-REG",
          attributes: { tempRating: "0C", fit: "Regular" },
          price: 3500,
          stock: 5,
          isActive: true
        }
      ]
    };
    vi.spyOn(Product, "findOne").mockResolvedValue(productDoc);
    vi.spyOn(Product, "findOneAndUpdate").mockResolvedValue(productDoc);

    let storedOrder = null;
    vi.spyOn(Order, "create").mockImplementation(async (payload) => {
      // Create a real Order Mongoose document to test schema validation and snapshot durability
      storedOrder = new Order(payload);
      await storedOrder.validate();
      return storedOrder;
    });

    const { req, res, next } = setupReqRes();
    await createOrder(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(storedOrder).toBeDefined();

    const snapshot = storedOrder.items[0];
    expect(snapshot.variantId).toBe(variantId);
    expect(snapshot.variantName).toBe("0C / Regular");
    expect(snapshot.sku).toBe("BAG-0C-REG");
    expect(snapshot.price).toBe(3500);

    // Now simulate subsequent catalog changes (price increased to 5000, SKU renamed, variant deleted)
    productDoc.price = 4500;
    productDoc.variants[0].price = 5000;
    productDoc.variants[0].sku = "BAG-0C-REG-V2";
    delete productDoc.variants;

    // Verify stored order remains completely untouched
    expect(snapshot.variantId).toBe(variantId);
    expect(snapshot.variantName).toBe("0C / Regular");
    expect(snapshot.sku).toBe("BAG-0C-REG");
    expect(snapshot.price).toBe(3500);
  });

  it("Test 6 — Preserves simple product checkout behavior without variant regression", async () => {
    vi.spyOn(Address, "findOne").mockResolvedValue(standardAddress);

    const cart = {
      items: [
        {
          product: { _id: productId },
          variantId: null,
          quantity: 2
        }
      ],
      save: vi.fn().mockResolvedValue(true)
    };
    vi.spyOn(Cart, "findOne").mockReturnValue({
      populate: vi.fn().mockResolvedValue(cart)
    });

    // Simple product without variants
    const simpleProductDoc = {
      _id: productId,
      name: "Water Purification Tablets",
      sku: "TABLET-PUR-50",
      price: 350,
      stock: 100,
      isActive: true,
      variants: []
    };
    vi.spyOn(Product, "findOne").mockResolvedValue(simpleProductDoc);
    vi.spyOn(Product, "findOneAndUpdate").mockResolvedValue(simpleProductDoc);

    let createdOrderPayload = null;
    vi.spyOn(Order, "create").mockImplementation(async (payload) => {
      createdOrderPayload = payload;
      return {
        _id: new mongoose.Types.ObjectId(),
        ...payload
      };
    });

    const { req, res, next } = setupReqRes();
    await createOrder(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);

    const item = createdOrderPayload.items[0];
    expect(item.name).toBe("Water Purification Tablets");
    expect(item.price).toBe(350);
    expect(item.quantity).toBe(2);
    expect(item.subtotal).toBe(700);
    expect(item.variantId).toBeUndefined(); // Simple product payload omits null variantId
    expect(item.sku).toBe("TABLET-PUR-50");
  });

  it("Test 7 — Client cannot override server-authoritative price, SKU, or variantName", async () => {
    vi.spyOn(Address, "findOne").mockResolvedValue(standardAddress);

    const cart = {
      items: [
        {
          product: { _id: productId },
          variantId,
          quantity: 1
        }
      ],
      save: vi.fn().mockResolvedValue(true)
    };
    vi.spyOn(Cart, "findOne").mockReturnValue({
      populate: vi.fn().mockResolvedValue(cart)
    });

    const productDoc = {
      _id: productId,
      name: "Thermal Flask",
      price: 899,
      stock: 10,
      isActive: true,
      variants: [
        {
          variantId,
          sku: "FLSK-1L-SLV",
          attributes: { size: "1L", color: "Silver" },
          price: 999,
          stock: 5,
          isActive: true
        }
      ]
    };
    vi.spyOn(Product, "findOne").mockResolvedValue(productDoc);
    vi.spyOn(Product, "findOneAndUpdate").mockResolvedValue(productDoc);

    let createdOrderPayload = null;
    vi.spyOn(Order, "create").mockImplementation(async (payload) => {
      createdOrderPayload = payload;
      return {
        _id: new mongoose.Types.ObjectId(),
        ...payload
      };
    });

    // Client maliciously attempts to inject modified price, SKU, variantName, and subtotal
    const { req, res, next } = setupReqRes({
      price: 1,
      sku: "HACKED-SKU",
      variantName: "Hacked Name",
      subtotal: 1,
      total: 1
    });

    await createOrder(req, res, next);

    expect(next).not.toHaveBeenCalled();

    // Verify server-authoritative values prevail
    const snapshot = createdOrderPayload.items[0];
    expect(snapshot.price).toBe(999); // Authoritative variant price
    expect(snapshot.sku).toBe("FLSK-1L-SLV"); // Authoritative SKU
    expect(snapshot.variantName).toBe("1L / Silver"); // Authoritative variant name
    expect(snapshot.subtotal).toBe(999);
    expect(createdOrderPayload.total).toBe(999);
  });

  it("Test 8 — Checkout compensation snapshot records variantId for restoration", async () => {
    vi.spyOn(Address, "findOne").mockResolvedValue(standardAddress);

    const cart = {
      items: [
        {
          product: { _id: productId },
          variantId,
          quantity: 2
        }
      ],
      save: vi.fn().mockResolvedValue(true)
    };
    vi.spyOn(Cart, "findOne").mockReturnValue({
      populate: vi.fn().mockResolvedValue(cart)
    });

    const productDoc = {
      _id: productId,
      name: "Trekking Poles",
      price: 1500,
      stock: 15,
      isActive: true,
      variants: [
        {
          variantId,
          sku: "POLE-ALU-RED",
          attributes: { material: "Aluminum", color: "Red" },
          price: 1500,
          stock: 8,
          isActive: true
        }
      ]
    };
    vi.spyOn(Product, "findOne").mockResolvedValue(productDoc);
    vi.spyOn(Product, "findOneAndUpdate").mockResolvedValue(productDoc);

    let createdOrderPayload = null;
    vi.spyOn(Order, "create").mockImplementation(async (payload) => {
      createdOrderPayload = payload;
      return {
        _id: new mongoose.Types.ObjectId(),
        ...payload
      };
    });

    const { req, res, next } = setupReqRes();
    await createOrder(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(createdOrderPayload.checkoutCompensation).toBeDefined();

    const restoredItems = createdOrderPayload.checkoutCompensation.restoredItems;
    expect(restoredItems).toHaveLength(1);
    expect(restoredItems[0].variantId).toBe(variantId);
    expect(restoredItems[0].product.toString()).toBe(productId);
    expect(restoredItems[0].quantity).toBe(2);
    expect(restoredItems[0].restorationKey).toBeDefined();
    expect(typeof restoredItems[0].restorationKey).toBe("string");
  });
});
