import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import { env } from "../../config/env.js";

import Address from "../users/address.model.js";
import Cart from "../cart/cart.model.js";
import Product from "../products/product.model.js";
import Order from "./order.model.js";
import User from "../users/user.model.js";

import { createOrder } from "./order.controller.js";
import cancelOrder from "./cancel-order.controller.js";
import updateOrderStatus from "./update-order-status.controller.js";

/**
 * Evaluates whether the configured MongoDB connection supports multi-document transactions.
 * Uses top-level probe connection so Vitest describe.skipIf resolves accurately at registration.
 */
const targetMongoUri = process.env.MONGODB_URI || env.MONGODB_URI || "mongodb://127.0.0.1:27017/commerceflow";
let hasReplicaSet = false;
try {
  const probeConn = await mongoose.createConnection(targetMongoUri, {
    serverSelectionTimeoutMS: 1500
  }).asPromise();
  const hello = await probeConn.db.admin().command({ hello: 1 });
  hasReplicaSet = Boolean(hello.setName && hello.isWritablePrimary);
  await probeConn.close();
} catch {
  hasReplicaSet = false;
}

describe("P1.6.4 — Variant Inventory Cancellation Restoration Integration Tests", () => {
  const isCI = Boolean(process.env.CI);

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      try {
        await mongoose.connect(targetMongoUri, { serverSelectionTimeoutMS: 2000 });
      } catch {
        // Standalone or offline fallback handled gracefully
      }
    }

    // Enforcement: In CI, MongoDB replica set MUST be available; fail immediately if missing
    if (isCI && !hasReplicaSet) {
      throw new Error(
        "CRITICAL CI FAILURE: MongoDB replica set is required in CI but is not available or not primary."
      );
    }

    if (hasReplicaSet && mongoose.connection.readyState !== 0) {
      await User.init();
      await Product.init();
      await Order.init();
      await Address.init();
      await Cart.init();
    }
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  describe.skipIf(isCI ? false : !hasReplicaSet)("Replica-Set Dependent Cancellation Restoration Scenarios", () => {
    const testProductIds = new Set();
    const testOrderIds = new Set();
    const testAddressIds = new Set();
    const testCartIds = new Set();
    const testUserIds = new Set();

    afterAll(async () => {
      if (mongoose.connection.readyState !== 0) {
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

  async function createTestCustomer(role = "customer") {
    const user = await User.create({
      name: `Test User ${role}`,
      email: `test-cancel-${Date.now()}-${Math.random().toString(36).substring(2, 8)}@example.com`,
      password: "Password123!",
      role
    });
    testUserIds.add(user._id);

    const address = await Address.create({
      user: user._id,
      fullName: `Address ${user.name}`,
      phone: "9876543210",
      addressLine1: "123 Restitution Road",
      city: "Mumbai",
      state: "Maharashtra",
      postalCode: "400001",
      country: "India"
    });
    testAddressIds.add(address._id);

    return { user, address };
  }

  async function createTestProduct(overrides = {}) {
    const product = await Product.create({
      name: "Cancellation Test Product",
      description: "Standard cancellation test product description",
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
        requestId: `req-checkout-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
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

  function executeCustomerCancellation(user, orderId, body = {}) {
    return new Promise(async (resolve, reject) => {
      const req = {
        params: { orderId: orderId.toString() },
        body: {
          reason: "customer_requested",
          reasonDetail: "Decided not to purchase",
          ...body
        },
        user: {
          _id: user._id,
          role: user.role
        },
        requestId: `req-cancel-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
      };

      const res = {
        statusCode: 200,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(payload) {
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
        await cancelOrder(req, res, next);
      } catch (err) {
        reject(err);
      }
    });
  }

  function executeAdminStatusUpdate(adminUser, orderId, status, body = {}) {
    return new Promise(async (resolve, reject) => {
      const req = {
        params: { orderId: orderId.toString() },
        body: {
          status,
          reason: "admin_request",
          reasonDetail: "Admin cancelled per customer request",
          ...body
        },
        user: {
          _id: adminUser._id,
          role: "admin"
        },
        requestId: `req-admin-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
      };

      const res = {
        statusCode: 200,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(payload) {
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
        await updateOrderStatus(req, res, next);
      } catch (err) {
        reject(err);
      }
    });
  }

  it("Test 1 — Variant cancellation restores exact stock to the variant", async () => {
    const { user, address } = await createTestCustomer();

    const product = await createTestProduct({
      name: "Restoration Sneaker",
      stock: 50,
      variants: [
        {
          variantId: "var_snk_42",
          sku: `SKU-SNK-${Date.now()}`,
          attributes: new Map([["size", "42"]]),
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
          variantId: "var_snk_42",
          quantity: 4
        }
      ]
    });
    testCartIds.add(cart._id);

    // 1. Checkout reserves 4 units
    const checkoutRes = await executeCheckout(user, address);
    expect(checkoutRes.status).toBe(201);
    const orderId = checkoutRes.body.data.order._id;

    // After reservation: 10 - 4 = 6
    let midProduct = await Product.findById(product._id);
    let midVariant = midProduct.variants.find((v) => v.variantId === "var_snk_42");
    expect(midVariant.stock).toBe(6);

    // 2. Customer cancellation restores 4 units
    const cancelRes = await executeCustomerCancellation(user, orderId);
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.order.status).toBe("cancelled");

    // After cancellation: 6 + 4 = 10
    const finalProduct = await Product.findById(product._id);
    const finalVariant = finalProduct.variants.find((v) => v.variantId === "var_snk_42");
    expect(finalVariant.stock).toBe(10);
    expect(finalProduct.stock).toBe(50); // Parent stock was never mutated
  });

  it("Test 2 — Simple product cancellation remains correct", async () => {
    const { user, address } = await createTestCustomer();

    const product = await createTestProduct({
      name: "Simple Mug",
      stock: 10,
      variants: []
    });

    const cart = await Cart.create({
      user: user._id,
      items: [
        {
          product: product._id,
          variantId: null,
          quantity: 4
        }
      ]
    });
    testCartIds.add(cart._id);

    const checkoutRes = await executeCheckout(user, address);
    expect(checkoutRes.status).toBe(201);
    const orderId = checkoutRes.body.data.order._id;

    // After reservation: 10 - 4 = 6
    let midProduct = await Product.findById(product._id);
    expect(midProduct.stock).toBe(6);

    // Customer cancellation
    const cancelRes = await executeCustomerCancellation(user, orderId);
    expect(cancelRes.status).toBe(200);

    // After cancellation: 6 + 4 = 10
    const finalProduct = await Product.findById(product._id);
    expect(finalProduct.stock).toBe(10);
  });

  it("Test 3 — Targets the correct variant and does not alter unpurchased variants", async () => {
    const { user, address } = await createTestCustomer();

    const product = await createTestProduct({
      name: "Dual Variant Tumbler",
      stock: 30,
      variants: [
        {
          variantId: "var_tmb_a",
          sku: `SKU-TMBA-${Date.now()}`,
          attributes: new Map([["color", "Red"]]),
          stock: 10,
          isActive: true
        },
        {
          variantId: "var_tmb_b",
          sku: `SKU-TMBB-${Date.now()}`,
          attributes: new Map([["color", "Blue"]]),
          stock: 20,
          isActive: true
        }
      ]
    });

    const cart = await Cart.create({
      user: user._id,
      items: [
        {
          product: product._id,
          variantId: "var_tmb_b",
          quantity: 4
        }
      ]
    });
    testCartIds.add(cart._id);

    const checkoutRes = await executeCheckout(user, address);
    const orderId = checkoutRes.body.data.order._id;

    // After reservation: A remains 10, B is 20 - 4 = 16
    let midProduct = await Product.findById(product._id);
    expect(midProduct.variants.find((v) => v.variantId === "var_tmb_a").stock).toBe(10);
    expect(midProduct.variants.find((v) => v.variantId === "var_tmb_b").stock).toBe(16);

    // Cancel order
    const cancelRes = await executeCustomerCancellation(user, orderId);
    expect(cancelRes.status).toBe(200);

    // After cancellation: A remains 10, B restored to 20
    const finalProduct = await Product.findById(product._id);
    expect(finalProduct.variants.find((v) => v.variantId === "var_tmb_a").stock).toBe(10);
    expect(finalProduct.variants.find((v) => v.variantId === "var_tmb_b").stock).toBe(20);
    expect(finalProduct.stock).toBe(30);
  });

  it("Test 4 — Multiple variants of same product are restored independently", async () => {
    const { user, address } = await createTestCustomer();

    const product = await createTestProduct({
      name: "Multi Variant Jacket",
      stock: 30,
      variants: [
        {
          variantId: "var_jck_s",
          sku: `SKU-JCKS-${Date.now()}`,
          attributes: new Map([["size", "S"]]),
          stock: 10,
          isActive: true
        },
        {
          variantId: "var_jck_m",
          sku: `SKU-JCKM-${Date.now()}`,
          attributes: new Map([["size", "M"]]),
          stock: 20,
          isActive: true
        }
      ]
    });

    const cart = await Cart.create({
      user: user._id,
      items: [
        {
          product: product._id,
          variantId: "var_jck_s",
          quantity: 3
        },
        {
          product: product._id,
          variantId: "var_jck_m",
          quantity: 5
        }
      ]
    });
    testCartIds.add(cart._id);

    const checkoutRes = await executeCheckout(user, address);
    const orderId = checkoutRes.body.data.order._id;

    // After reservation: S = 7, M = 15
    let midProduct = await Product.findById(product._id);
    expect(midProduct.variants.find((v) => v.variantId === "var_jck_s").stock).toBe(7);
    expect(midProduct.variants.find((v) => v.variantId === "var_jck_m").stock).toBe(15);

    // Cancel order
    const cancelRes = await executeCustomerCancellation(user, orderId);
    expect(cancelRes.status).toBe(200);

    // After cancellation: S restored to 10, M restored to 20
    const finalProduct = await Product.findById(product._id);
    expect(finalProduct.variants.find((v) => v.variantId === "var_jck_s").stock).toBe(10);
    expect(finalProduct.variants.find((v) => v.variantId === "var_jck_m").stock).toBe(20);
    expect(finalProduct.stock).toBe(30);
  });

  it("Test 5 — Mixed simple + variant order restores both inventory pools correctly", async () => {
    const { user, address } = await createTestCustomer();

    const simpleProduct = await createTestProduct({
      name: "Notebook Simple",
      stock: 15,
      variants: []
    });

    const variantProduct = await createTestProduct({
      name: "Luxury Pen",
      stock: 50,
      variants: [
        {
          variantId: "var_pen_gold",
          sku: `SKU-PNG-${Date.now()}`,
          attributes: new Map([["finish", "Gold"]]),
          stock: 25,
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
          quantity: 5
        },
        {
          product: variantProduct._id,
          variantId: "var_pen_gold",
          quantity: 10
        }
      ]
    });
    testCartIds.add(cart._id);

    const checkoutRes = await executeCheckout(user, address);
    const orderId = checkoutRes.body.data.order._id;

    // After reservation: Simple is 10, Pen variant is 15
    let midSimple = await Product.findById(simpleProduct._id);
    let midVariant = await Product.findById(variantProduct._id);
    expect(midSimple.stock).toBe(10);
    expect(midVariant.variants.find((v) => v.variantId === "var_pen_gold").stock).toBe(15);

    // Admin cancellation via updateOrderStatus
    const { user: adminUser } = await createTestCustomer("admin");
    const cancelRes = await executeAdminStatusUpdate(adminUser, orderId, "cancelled");
    expect(cancelRes.status).toBe(200);

    // After cancellation: Simple restored to 15, Pen variant restored to 25
    const finalSimple = await Product.findById(simpleProduct._id);
    const finalVariant = await Product.findById(variantProduct._id);
    expect(finalSimple.stock).toBe(15);
    expect(finalVariant.variants.find((v) => v.variantId === "var_pen_gold").stock).toBe(25);
    expect(finalVariant.stock).toBe(50); // Parent stock untouched
  });

  it("Test 6 — Repeated cancellation request does not double-restore stock", async () => {
    const { user, address } = await createTestCustomer();

    const product = await createTestProduct({
      name: "Idempotent Stock Item",
      stock: 20,
      variants: [
        {
          variantId: "var_idemp",
          sku: `SKU-IDM-${Date.now()}`,
          attributes: new Map([["color", "Grey"]]),
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
          variantId: "var_idemp",
          quantity: 4
        }
      ]
    });
    testCartIds.add(cart._id);

    const checkoutRes = await executeCheckout(user, address);
    const orderId = checkoutRes.body.data.order._id;

    // 1. First cancellation succeeds and restores stock: 6 -> 10
    const cancelRes1 = await executeCustomerCancellation(user, orderId);
    expect(cancelRes1.status).toBe(200);

    let stockAfterFirst = (await Product.findById(product._id)).variants.find((v) => v.variantId === "var_idemp").stock;
    expect(stockAfterFirst).toBe(10);

    // 2. Second cancellation request is rejected with ORDER_ALREADY_CANCELLED
    let error = null;
    try {
      await executeCustomerCancellation(user, orderId);
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe("ORDER_ALREADY_CANCELLED");

    // Stock must remain 10, NOT 14
    let stockAfterSecond = (await Product.findById(product._id)).variants.find((v) => v.variantId === "var_idemp").stock;
    expect(stockAfterSecond).toBe(10);
  });

  it("Test 7 — Concurrent cancellation executes exactly once and restores exact inventory", async () => {
    const { user, address } = await createTestCustomer();

    const product = await createTestProduct({
      name: "Race Safe Cancellation Sneaker",
      stock: 50,
      variants: [
        {
          variantId: "var_race_snk",
          sku: `SKU-RCE-${Date.now()}`,
          attributes: new Map([["size", "10"]]),
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
          variantId: "var_race_snk",
          quantity: 4
        }
      ]
    });
    testCartIds.add(cart._id);

    const checkoutRes = await executeCheckout(user, address);
    const orderId = checkoutRes.body.data.order._id;

    // Verify reserved: 10 - 4 = 6
    let midProduct = await Product.findById(product._id);
    expect(midProduct.variants.find((v) => v.variantId === "var_race_snk").stock).toBe(6);

    // Launch two simultaneous cancellation requests
    const [res1, res2] = await Promise.allSettled([
      executeCustomerCancellation(user, orderId),
      executeCustomerCancellation(user, orderId)
    ]);

    const successes = [res1, res2].filter((r) => r.status === "fulfilled" && r.value.status === 200);
    const failures = [res1, res2].filter(
      (r) => r.status === "rejected" || (r.status === "fulfilled" && r.value.status >= 400)
    );

    // Exactly one authoritative transition
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);

    const failureReason = failures[0].status === "rejected" ? failures[0].reason : failures[0].value.body;
    expect(failureReason.code || failureReason.error?.code).toBe("ORDER_ALREADY_CANCELLED");

    // Stock restored exactly once: must be 10, NOT 14
    const finalProduct = await Product.findById(product._id);
    const finalVariant = finalProduct.variants.find((v) => v.variantId === "var_race_snk");
    expect(finalVariant.stock).toBe(10);
  });

  it("Test 8 — Inactive product does not prevent cancellation restoration", async () => {
    const { user, address } = await createTestCustomer();

    const product = await createTestProduct({
      name: "Product To Deactivate",
      stock: 50,
      variants: [
        {
          variantId: "var_deact_prod",
          sku: `SKU-DPRD-${Date.now()}`,
          attributes: new Map([["color", "Black"]]),
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
          variantId: "var_deact_prod",
          quantity: 3
        }
      ]
    });
    testCartIds.add(cart._id);

    const checkoutRes = await executeCheckout(user, address);
    const orderId = checkoutRes.body.data.order._id;

    // Deactivate the parent product after checkout
    await Product.findByIdAndUpdate(product._id, { $set: { isActive: false } });

    // Cancellation should still restore the reserved stock
    const cancelRes = await executeCustomerCancellation(user, orderId);
    expect(cancelRes.status).toBe(200);

    const updatedProduct = await Product.findById(product._id);
    expect(updatedProduct.isActive).toBe(false);
    const variant = updatedProduct.variants.find((v) => v.variantId === "var_deact_prod");
    expect(variant.stock).toBe(10); // Restored back to 10
  });

  it("Test 9 — Inactive variant does not prevent cancellation restoration", async () => {
    const { user, address } = await createTestCustomer();

    const product = await createTestProduct({
      name: "Variant To Deactivate",
      stock: 50,
      variants: [
        {
          variantId: "var_deact_var",
          sku: `SKU-DVAR-${Date.now()}`,
          attributes: new Map([["color", "Green"]]),
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
          variantId: "var_deact_var",
          quantity: 3
        }
      ]
    });
    testCartIds.add(cart._id);

    const checkoutRes = await executeCheckout(user, address);
    const orderId = checkoutRes.body.data.order._id;

    // Deactivate the variant subdocument after checkout
    await Product.updateOne(
      { _id: product._id, "variants.variantId": "var_deact_var" },
      { $set: { "variants.$.isActive": false } }
    );

    // Cancel order
    const cancelRes = await executeCustomerCancellation(user, orderId);
    expect(cancelRes.status).toBe(200);

    const updatedProduct = await Product.findById(product._id);
    const variant = updatedProduct.variants.find((v) => v.variantId === "var_deact_var");
    expect(variant.isActive).toBe(false);
    expect(variant.stock).toBe(10); // Restored back to 10
  });

  it("Test 10 — Historical snapshot identity is used for restoration regardless of catalog mutation", async () => {
    const { user, address } = await createTestCustomer();

    const product = await createTestProduct({
      name: "Original Name Backpack",
      price: 2000,
      stock: 50,
      variants: [
        {
          variantId: "var_mut_bp",
          sku: `SKU-MUT-${Date.now()}`,
          attributes: new Map([["color", "Navy"]]),
          price: 2500,
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
          variantId: "var_mut_bp",
          quantity: 4
        }
      ]
    });
    testCartIds.add(cart._id);

    const checkoutRes = await executeCheckout(user, address);
    const orderId = checkoutRes.body.data.order._id;

    // Mutate catalog metadata: name, price, variant SKU
    await Product.updateOne(
      { _id: product._id, "variants.variantId": "var_mut_bp" },
      {
        $set: {
          name: "Brand New Altered Name",
          price: 9999,
          "variants.$.sku": "ALTERED-SKU-999",
          "variants.$.price": 9999
        }
      }
    );

    // Cancellation uses the order snapshot
    const cancelRes = await executeCustomerCancellation(user, orderId);
    expect(cancelRes.status).toBe(200);

    const finalProduct = await Product.findById(product._id);
    const variant = finalProduct.variants.find((v) => v.variantId === "var_mut_bp");
    expect(variant.stock).toBe(10); // Restored
  });

  it("Test 11 — Unauthorized user cannot cancel another user's order and stock is preserved", async () => {
    const { user: ownerUser, address } = await createTestCustomer();
    const { user: otherUser } = await createTestCustomer();

    const product = await createTestProduct({
      name: "Protected Order Item",
      stock: 50,
      variants: [
        {
          variantId: "var_prot_item",
          sku: `SKU-PRT-${Date.now()}`,
          attributes: new Map([["color", "White"]]),
          stock: 10,
          isActive: true
        }
      ]
    });

    const cart = await Cart.create({
      user: ownerUser._id,
      items: [
        {
          product: product._id,
          variantId: "var_prot_item",
          quantity: 3
        }
      ]
    });
    testCartIds.add(cart._id);

    const checkoutRes = await executeCheckout(ownerUser, address);
    const orderId = checkoutRes.body.data.order._id;

    // Other user attempts to cancel owner's order
    let error = null;
    try {
      await executeCustomerCancellation(otherUser, orderId);
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error.statusCode).toBe(403);
    expect(error.code).toBe("ORDER_ACCESS_DENIED");

    // Stock must remain 7, NOT restored
    const finalProduct = await Product.findById(product._id);
    const variant = finalProduct.variants.find((v) => v.variantId === "var_prot_item");
    expect(variant.stock).toBe(7);
  });

  it("Test 12 — Cancelled order is terminal and cannot transition to other fulfillment statuses", async () => {
    const { user, address } = await createTestCustomer();
    const { user: adminUser } = await createTestCustomer("admin");

    const product = await createTestProduct({
      name: "Terminal Status Product",
      stock: 50,
      variants: [
        {
          variantId: "var_term_test",
          sku: `SKU-TRM-${Date.now()}`,
          attributes: new Map([["color", "Yellow"]]),
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
          variantId: "var_term_test",
          quantity: 2
        }
      ]
    });
    testCartIds.add(cart._id);

    const checkoutRes = await executeCheckout(user, address);
    const orderId = checkoutRes.body.data.order._id;

    // Cancel order
    const cancelRes = await executeCustomerCancellation(user, orderId);
    expect(cancelRes.status).toBe(200);

    // Attempt to transition cancelled order to "processing" or "shipped"
    let transitionError = null;
    try {
      await executeAdminStatusUpdate(adminUser, orderId, "processing");
    } catch (err) {
      transitionError = err;
    }

    expect(transitionError).toBeDefined();
    expect(transitionError.statusCode).toBe(400);
    expect(transitionError.code).toBe("INVALID_ORDER_STATUS_TRANSITION");

    // Verify order remains terminal cancelled
    const persistedOrder = await Order.findById(orderId);
    expect(persistedOrder.status).toBe("cancelled");
  });
  });
});
