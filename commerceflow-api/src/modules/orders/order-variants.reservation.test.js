import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import mongoose from "mongoose";
import { env } from "../../config/env.js";

import Address from "../users/address.model.js";
import Cart from "../cart/cart.model.js";
import Product from "../products/product.model.js";
import Order from "./order.model.js";
import User from "../users/user.model.js";

import { createOrder } from "./order.controller.js";

describe("P1.6.3 — Atomic Variant Inventory Reservation Integration Tests", () => {
  const isMongoAvailable = Boolean(env.MONGODB_URI);

  const testProductIds = new Set();
  const testOrderIds = new Set();
  const testAddressIds = new Set();
  const testCartIds = new Set();
  const testUserIds = new Set();

  beforeAll(async () => {
    if (isMongoAvailable && mongoose.connection.readyState === 0) {
      await mongoose.connect(env.MONGODB_URI);
    }
    await User.init();
    await Product.init();
    await Order.init();
    await Address.init();
    await Cart.init();
  });

  afterAll(async () => {
    if (isMongoAvailable && mongoose.connection.readyState !== 0) {
      if (testProductIds.size > 0) {
        await Product.deleteMany({ _id: { $in: Array.from(testProductIds) } });
      }
      if (testOrderIds.size > 0) {
        await Order.deleteMany({ _id: { $in: Array.from(testOrderIds) } });
      }
      if (testAddressIds.size > 0) {
        await Address.deleteMany({ _id: { $in: Array.from(testAddressIds) } });
      }
      if (testCartIds.size > 0) {
        await Cart.deleteMany({ _id: { $in: Array.from(testCartIds) } });
      }
      if (testUserIds.size > 0) {
        await User.deleteMany({ _id: { $in: Array.from(testUserIds) } });
      }
    }
  });

  async function createTestCustomer() {
    const user = await User.create({
      name: "Inventory Test User",
      email: `test-inv-${Date.now()}-${Math.random().toString(36).substring(2, 8)}@example.com`,
      password: "Password123!",
      role: "customer"
    });
    testUserIds.add(user._id);

    const address = await Address.create({
      user: user._id,
      fullName: "Inventory Test User",
      phone: "9876543210",
      addressLine1: "123 Warehouse Blvd",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
      country: "India"
    });
    testAddressIds.add(address._id);

    return { user, address };
  }

  async function createTestProduct(overrides = {}) {
    const product = await Product.create({
      name: "Test Product",
      description: "Standard test product description",
      price: 1000,
      stock: 50,
      category: "General",
      isActive: true,
      ...overrides
    });
    testProductIds.add(product._id);
    return product;
  }

  function executeCheckout(user, address, bodyOverrides = {}) {
    return new Promise(async (resolve, reject) => {
      const req = {
        body: {
          addressId: address._id.toString(),
          ...bodyOverrides
        },
        user: {
          _id: user._id
        },
        requestId: `req-inv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
      };

      const res = {
        statusCode: 200,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(payload) {
          if (payload?.data?.order?._id) {
            testOrderIds.add(payload.data.order._id);
          }
          resolve({ status: this.statusCode, body: payload });
        }
      };

      const next = (err) => {
        if (err) {
          reject(err);
        } else {
          resolve({ status: res.statusCode, body: null });
        }
      };

      try {
        await createOrder(req, res, next);
      } catch (err) {
        reject(err);
      }
    });
  }

  it("Test 1 — Single variant reservation atomically decrements variant stock", async () => {
    const { user, address } = await createTestCustomer();

    const product = await createTestProduct({
      name: "Atomic Test Shoes",
      price: 2000,
      stock: 50,
      category: "Footwear",
      variants: [
        {
          variantId: "var_shoe_42",
          sku: `SKU-42-${Date.now()}`,
          attributes: new Map([["size", "42"]]),
          price: 2200,
          stock: 10,
          isActive: true
        }
      ]
    });

    const cart = await Cart.create({
      user: user._id,
      items: [
        {
          product: product._id,
          variantId: "var_shoe_42",
          quantity: 3
        }
      ]
    });
    testCartIds.add(cart._id);

    const result = await executeCheckout(user, address);
    expect(result.status).toBe(201);
    expect(result.body.success).toBe(true);

    const updatedProduct = await Product.findById(product._id);
    const variant = updatedProduct.variants.find((v) => v.variantId === "var_shoe_42");
    expect(variant.stock).toBe(7); // 10 - 3 = 7
  });

  it("Test 2 — Parent stock is not decremented for variant", async () => {
    const { user, address } = await createTestCustomer();

    const product = await createTestProduct({
      name: "Parent Stock Independence Jacket",
      price: 1500,
      stock: 100, // Parent stock
      category: "Apparel",
      variants: [
        {
          variantId: "var_jck_xl",
          sku: `SKU-JCK-${Date.now()}`,
          attributes: new Map([["size", "XL"]]),
          price: 1800,
          stock: 10,
          isActive: true
        }
      ]
    });

    const cart = await Cart.create({
      user: user._id,
      items: [
        {
          product: product._id,
          variantId: "var_jck_xl",
          quantity: 3
        }
      ]
    });
    testCartIds.add(cart._id);

    const result = await executeCheckout(user, address);
    expect(result.status).toBe(201);

    const updatedProduct = await Product.findById(product._id);
    const variant = updatedProduct.variants.find((v) => v.variantId === "var_jck_xl");
    expect(variant.stock).toBe(7); // Variant stock decremented
    expect(updatedProduct.stock).toBe(100); // Parent stock remains unchanged
  });

  it("Test 3 — Exact-stock reservation succeeds and reaches 0", async () => {
    const { user, address } = await createTestCustomer();

    const product = await createTestProduct({
      name: "Exact Stock Cap",
      price: 500,
      stock: 5,
      category: "Accessories",
      variants: [
        {
          variantId: "var_cap_blue",
          sku: `SKU-CAP-${Date.now()}`,
          attributes: new Map([["color", "Blue"]]),
          stock: 5,
          isActive: true
        }
      ]
    });

    const cart = await Cart.create({
      user: user._id,
      items: [
        {
          product: product._id,
          variantId: "var_cap_blue",
          quantity: 5
        }
      ]
    });
    testCartIds.add(cart._id);

    const result = await executeCheckout(user, address);
    expect(result.status).toBe(201);

    const updatedProduct = await Product.findById(product._id);
    const variant = updatedProduct.variants.find((v) => v.variantId === "var_cap_blue");
    expect(variant.stock).toBe(0);
  });

  it("Test 4 — Insufficient stock rejects checkout and prevents negative stock", async () => {
    const { user, address } = await createTestCustomer();

    const product = await createTestProduct({
      name: "Limited Stock Gloves",
      price: 800,
      stock: 5,
      category: "Accessories",
      variants: [
        {
          variantId: "var_glv_m",
          sku: `SKU-GLV-${Date.now()}`,
          attributes: new Map([["size", "M"]]),
          stock: 5,
          isActive: true
        }
      ]
    });

    const cart = await Cart.create({
      user: user._id,
      items: [
        {
          product: product._id,
          variantId: "var_glv_m",
          quantity: 6 // Exceeds available stock of 5
        }
      ]
    });
    testCartIds.add(cart._id);

    let error = null;
    try {
      await executeCheckout(user, address);
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe("INSUFFICIENT_STOCK");

    const updatedProduct = await Product.findById(product._id);
    const variant = updatedProduct.variants.find((v) => v.variantId === "var_glv_m");
    expect(variant.stock).toBe(5); // Stock unchanged
  });

  it("Test 5 — Inactive variant rejects checkout and stock is not mutated", async () => {
    const { user, address } = await createTestCustomer();

    const product = await createTestProduct({
      name: "Inactive Variant Watch",
      price: 5000,
      stock: 10,
      category: "Electronics",
      variants: [
        {
          variantId: "var_watch_gold",
          sku: `SKU-WTC-${Date.now()}`,
          attributes: new Map([["material", "Gold"]]),
          stock: 10,
          isActive: false // Inactive variant
        }
      ]
    });

    const cart = await Cart.create({
      user: user._id,
      items: [
        {
          product: product._id,
          variantId: "var_watch_gold",
          quantity: 2
        }
      ]
    });
    testCartIds.add(cart._id);

    let error = null;
    try {
      await executeCheckout(user, address);
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe("VARIANT_INACTIVE");

    const updatedProduct = await Product.findById(product._id);
    const variant = updatedProduct.variants.find((v) => v.variantId === "var_watch_gold");
    expect(variant.stock).toBe(10); // Unchanged
  });

  it("Test 6 — Targets the exact selected variant without affecting other variants", async () => {
    const { user, address } = await createTestCustomer();

    const product = await createTestProduct({
      name: "Multi-Option Bottle",
      price: 300,
      stock: 14,
      category: "Home",
      variants: [
        {
          variantId: "var_bot_red",
          sku: `SKU-RED-${Date.now()}`,
          attributes: new Map([["color", "Red"]]),
          stock: 5,
          isActive: true
        },
        {
          variantId: "var_bot_blue",
          sku: `SKU-BLU-${Date.now()}`,
          attributes: new Map([["color", "Blue"]]),
          stock: 9,
          isActive: true
        }
      ]
    });

    const cart = await Cart.create({
      user: user._id,
      items: [
        {
          product: product._id,
          variantId: "var_bot_blue",
          quantity: 3
        }
      ]
    });
    testCartIds.add(cart._id);

    const result = await executeCheckout(user, address);
    expect(result.status).toBe(201);

    const updatedProduct = await Product.findById(product._id);
    const varRed = updatedProduct.variants.find((v) => v.variantId === "var_bot_red");
    const varBlue = updatedProduct.variants.find((v) => v.variantId === "var_bot_blue");

    expect(varRed.stock).toBe(5); // Untouched
    expect(varBlue.stock).toBe(6); // 9 - 3 = 6
  });

  it("Test 7 — Multiple variants of same product in one cart decrement independently", async () => {
    const { user, address } = await createTestCustomer();

    const product = await createTestProduct({
      name: "Dual Variant Shirt",
      price: 999,
      stock: 12,
      category: "Apparel",
      variants: [
        {
          variantId: "var_sh_small",
          sku: `SKU-SML-${Date.now()}`,
          attributes: new Map([["size", "S"]]),
          stock: 5,
          isActive: true
        },
        {
          variantId: "var_sh_large",
          sku: `SKU-LRG-${Date.now()}`,
          attributes: new Map([["size", "L"]]),
          stock: 7,
          isActive: true
        }
      ]
    });

    const cart = await Cart.create({
      user: user._id,
      items: [
        {
          product: product._id,
          variantId: "var_sh_small",
          quantity: 2
        },
        {
          product: product._id,
          variantId: "var_sh_large",
          quantity: 3
        }
      ]
    });
    testCartIds.add(cart._id);

    const result = await executeCheckout(user, address);
    expect(result.status).toBe(201);

    const updatedProduct = await Product.findById(product._id);
    const varS = updatedProduct.variants.find((v) => v.variantId === "var_sh_small");
    const varL = updatedProduct.variants.find((v) => v.variantId === "var_sh_large");

    expect(varS.stock).toBe(3); // 5 - 2 = 3
    expect(varL.stock).toBe(4); // 7 - 3 = 4
    expect(updatedProduct.stock).toBe(12); // Parent stock untouched
  });

  it("Test 8 — Mixed simple + variant cart reserves correct inventory pools", async () => {
    const { user, address } = await createTestCustomer();

    const simpleProduct = await createTestProduct({
      name: "Simple Notebook",
      price: 150,
      stock: 20,
      category: "Stationery",
      variants: []
    });

    const variantProduct = await createTestProduct({
      name: "Variant Pen",
      price: 250,
      stock: 50,
      category: "Stationery",
      variants: [
        {
          variantId: "var_pen_blue",
          sku: `SKU-PEN-${Date.now()}`,
          attributes: new Map([["ink", "Blue"]]),
          stock: 15,
          isActive: true
        }
      ]
    });

    const cart = await Cart.create({
      user: user._id,
      items: [
        {
          product: simpleProduct._id,
          variantId: null,
          quantity: 4
        },
        {
          product: variantProduct._id,
          variantId: "var_pen_blue",
          quantity: 5
        }
      ]
    });
    testCartIds.add(cart._id);

    const result = await executeCheckout(user, address);
    expect(result.status).toBe(201);

    const updatedSimple = await Product.findById(simpleProduct._id);
    const updatedVariant = await Product.findById(variantProduct._id);

    expect(updatedSimple.stock).toBe(16); // 20 - 4 = 16 (root stock)
    const penVariant = updatedVariant.variants.find((v) => v.variantId === "var_pen_blue");
    expect(penVariant.stock).toBe(10); // 15 - 5 = 10 (variant stock)
    expect(updatedVariant.stock).toBe(50); // Parent stock untouched
  });

  it("Test 9 — Concurrent oversell prevention under real database concurrency", async () => {
    const customer1 = await createTestCustomer();
    const customer2 = await createTestCustomer();

    const product = await createTestProduct({
      name: "Hot Drop Limited Sneaker",
      price: 5000,
      stock: 100,
      category: "Footwear",
      variants: [
        {
          variantId: "var_hot_drop_9",
          sku: `SKU-HOT-${Date.now()}`,
          attributes: new Map([["size", "9"]]),
          price: 5500,
          stock: 5, // Exactly 5 units available
          isActive: true
        }
      ]
    });

    const cart1 = await Cart.create({
      user: customer1.user._id,
      items: [
        {
          product: product._id,
          variantId: "var_hot_drop_9",
          quantity: 4 // Requests 4
        }
      ]
    });
    testCartIds.add(cart1._id);

    const cart2 = await Cart.create({
      user: customer2.user._id,
      items: [
        {
          product: product._id,
          variantId: "var_hot_drop_9",
          quantity: 4 // Also requests 4 concurrently
        }
      ]
    });
    testCartIds.add(cart2._id);

    // Launch both checkouts simultaneously against the database
    const [res1, res2] = await Promise.allSettled([
      executeCheckout(customer1.user, customer1.address),
      executeCheckout(customer2.user, customer2.address)
    ]);

    const successes = [res1, res2].filter((r) => r.status === "fulfilled" && r.value.status === 201);
    const failures = [res1, res2].filter(
      (r) => r.status === "rejected" || (r.status === "fulfilled" && r.value.status >= 400)
    );

    // Exactly one must succeed and exactly one must fail
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);

    // Verify error code on failed request
    const rejectedResult = failures[0];
    const failureError = rejectedResult.status === "rejected" ? rejectedResult.reason : rejectedResult.value.body;
    expect(failureError.code || failureError.error?.code).toBe("INSUFFICIENT_STOCK");

    // Verify database state: exactly 4 reserved, 1 remains
    const finalProduct = await Product.findById(product._id);
    const finalVariant = finalProduct.variants.find((v) => v.variantId === "var_hot_drop_9");
    expect(finalVariant.stock).toBe(1); // 5 - 4 = 1
    expect(finalVariant.stock).toBeGreaterThanOrEqual(0); // No negative stock

    // Verify only 1 order created in DB
    const createdOrders = await Order.find({ "items.product": product._id, status: { $ne: "cancelled" } });
    expect(createdOrders).toHaveLength(1);
    expect(createdOrders[0].items[0].quantity).toBe(4);
  });

  it("Test 10 — P1.6.2 snapshot remains intact after successful variant reservation", async () => {
    const { user, address } = await createTestCustomer();

    const skuVal = `SKU-BP-BLK-${Date.now()}`;
    const product = await createTestProduct({
      name: "Snapshot Integrity Backpack",
      price: 1200,
      stock: 10,
      category: "Luggage",
      variants: [
        {
          variantId: "var_bp_black",
          sku: skuVal,
          attributes: new Map([
            ["color", "Black"],
            ["capacity", "25L"]
          ]),
          price: 1450,
          stock: 8,
          isActive: true
        }
      ]
    });

    const cart = await Cart.create({
      user: user._id,
      items: [
        {
          product: product._id,
          variantId: "var_bp_black",
          quantity: 2
        }
      ]
    });
    testCartIds.add(cart._id);

    const result = await executeCheckout(user, address);
    expect(result.status).toBe(201);

    const orderId = result.body.data.order._id;
    const persistedOrder = await Order.findById(orderId);
    expect(persistedOrder).toBeDefined();

    const item = persistedOrder.items[0];
    expect(item.product.toString()).toBe(product._id.toString());
    expect(item.variantId).toBe("var_bp_black");
    expect(item.variantName).toBe("Black / 25L");
    expect(item.sku).toBe(skuVal);
    expect(item.price).toBe(1450);
    expect(item.quantity).toBe(2);
    expect(item.subtotal).toBe(2900);
  });

  it("Test 11 — Failed reservation does not create a successful order and stock is preserved", async () => {
    const { user, address } = await createTestCustomer();

    const product = await createTestProduct({
      name: "Failed Reservation Desk",
      price: 8000,
      stock: 2,
      category: "Furniture",
      variants: [
        {
          variantId: "var_desk_oak",
          sku: `SKU-DSK-${Date.now()}`,
          attributes: new Map([["finish", "Oak"]]),
          stock: 2,
          isActive: true
        }
      ]
    });

    const cart = await Cart.create({
      user: user._id,
      items: [
        {
          product: product._id,
          variantId: "var_desk_oak",
          quantity: 5 // Exceeds 2
        }
      ]
    });
    testCartIds.add(cart._id);

    let error = null;
    try {
      await executeCheckout(user, address);
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error.statusCode).toBe(400);

    // No non-cancelled order created
    const activeOrders = await Order.find({
      "items.product": product._id,
      status: { $ne: "cancelled" }
    });
    expect(activeOrders).toHaveLength(0);

    // Stock in database remains intact
    const dbProduct = await Product.findById(product._id);
    const variant = dbProduct.variants.find((v) => v.variantId === "var_desk_oak");
    expect(variant.stock).toBe(2);
  });

  it("Test 12 — Multi-line partial failure executes compensation and logs safely", async () => {
    const { user, address } = await createTestCustomer();

    // Both products initially pass pre-order validation
    const product1 = await createTestProduct({
      name: "Line 1 Sufficient Item",
      price: 500,
      stock: 10,
      category: "Tools",
      variants: [
        {
          variantId: "var_l1_ok",
          sku: `SKU-L1-${Date.now()}`,
          attributes: new Map([["type", "A"]]),
          stock: 10,
          isActive: true
        }
      ]
    });

    const product2 = await createTestProduct({
      name: "Line 2 Low Stock Item",
      price: 900,
      stock: 5,
      category: "Tools",
      variants: [
        {
          variantId: "var_l2_fail",
          sku: `SKU-L2-${Date.now()}`,
          attributes: new Map([["type", "B"]]),
          stock: 5,
          isActive: true
        }
      ]
    });

    const cart = await Cart.create({
      user: user._id,
      items: [
        {
          product: product1._id,
          variantId: "var_l1_ok",
          quantity: 2
        },
        {
          product: product2._id,
          variantId: "var_l2_fail",
          quantity: 5
        }
      ]
    });
    testCartIds.add(cart._id);

    // Simulate line 2 failing atomic deduction due to concurrent reservation
    const originalFindOneAndUpdate = Product.findOneAndUpdate.bind(Product);
    let deductionCall = 0;
    const spy = vi.spyOn(Product, "findOneAndUpdate").mockImplementation(function (filter, update, options) {
      // Check if this is the stock decrement update (has $inc)
      if (update?.$inc) {
        deductionCall++;
        if (deductionCall === 2) {
          // Line 2 fails atomic update (e.g. concurrent race)
          return Promise.resolve(null);
        }
      }
      return originalFindOneAndUpdate(filter, update, options);
    });

    let error = null;
    try {
      await executeCheckout(user, address);
    } catch (err) {
      error = err;
    } finally {
      spy.mockRestore();
    }

    expect(error).toBeDefined();
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe("INSUFFICIENT_STOCK");

    // The order created prior to stock deduction is compensated and marked cancelled
    const cancelledOrders = await Order.find({
      user: user._id,
      status: "cancelled"
    });
    expect(cancelledOrders.length).toBeGreaterThanOrEqual(1);
    expect(cancelledOrders[0].cancellation.reason).toBe("system_checkout_failure");

    // Cart remains intact with items so customer can retry
    const survivingCart = await Cart.findById(cart._id);
    expect(survivingCart.items.length).toBe(2);
  });
});
