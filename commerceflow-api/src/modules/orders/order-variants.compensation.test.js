import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import mongoose from "mongoose";
import { env } from "../../config/env.js";

import Address from "../users/address.model.js";
import Cart from "../cart/cart.model.js";
import Product from "../products/product.model.js";
import Order from "./order.model.js";
import User from "../users/user.model.js";
import Coupon from "../coupons/coupon.model.js";
import CheckoutInventoryRestoration from "./checkout-inventory-restoration.model.js";

import { createOrder } from "./order.controller.js";
import { compensateOrderRedemption } from "./compensate-order-redemption.js";

/**
 * Evaluates whether the configured MongoDB connection supports multi-document transactions.
 * Uses top-level probe connection so Vitest it.skipIf resolves accurately at registration.
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

describe("P1.6.5 — Variant-Aware Checkout Compensation Restoration Integration Tests", () => {
  const isMongoAvailable = Boolean(env.MONGODB_URI);
  const isCI = Boolean(process.env.CI);

  const testProductIds = new Set();
  const testOrderIds = new Set();
  const testAddressIds = new Set();
  const testCartIds = new Set();
  const testUserIds = new Set();
  const testCouponIds = new Set();

  beforeAll(async () => {
    if (isMongoAvailable && mongoose.connection.readyState === 0) {
      await mongoose.connect(env.MONGODB_URI);
    }
    await User.init();
    await Product.init();
    await Order.init();
    await Address.init();
    await Cart.init();
    await Coupon.init();
    await CheckoutInventoryRestoration.init();
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
      if (testCouponIds.size > 0) {
        await Coupon.deleteMany({ _id: { $in: Array.from(testCouponIds) } });
      }
    }
  });

  async function createTestCustomer() {
    const user = await User.create({
      name: "Comp Test Customer",
      email: `test-comp-${Date.now()}-${Math.random().toString(36).substring(2, 8)}@example.com`,
      password: "Password123!",
      role: "customer"
    });
    testUserIds.add(user._id);

    const address = await Address.create({
      user: user._id,
      fullName: "Comp Customer",
      phone: "9876543210",
      addressLine1: "123 Compensation Lane",
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
      name: "Compensation Test Product",
      description: "Compensation product description",
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
        requestId: `req-comp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
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

  it("Test 1 — Variant compensation restores exact stock after downstream failure", async () => {
    const { user, address } = await createTestCustomer();

    const product = await createTestProduct({
      name: "Fail Shoes",
      price: 2000,
      stock: 50,
      variants: [
        {
          variantId: "var_fail_shoes_42",
          sku: `SKU-FS-${Date.now()}`,
          attributes: new Map([["size", "42"]]),
          price: 2000,
          stock: 10,
          isActive: true
        }
      ]
    });

    const code = `FC${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const coupon = await Coupon.create({
      code,
      normalizedCode: code.toLowerCase(),
      type: "percentage",
      value: 10,
      isActive: true,
      usageLimit: 1,
      usedCount: 0
    });
    testCouponIds.add(coupon._id);

    const cart = await Cart.create({
      user: user._id,
      items: [
        {
          product: product._id,
          variantId: "var_fail_shoes_42",
          quantity: 4
        }
      ]
    });
    testCartIds.add(cart._id);

    // Force downstream failure after inventory reservation: mock Coupon.findOneAndUpdate to simulate limit exhausted
    const couponSpy = vi.spyOn(Coupon, "findOneAndUpdate").mockResolvedValueOnce(null);

    await expect(
      executeCheckout(user, address, { couponCode: coupon.code })
    ).rejects.toThrow("Coupon usage limit has been reached");

    couponSpy.mockRestore();

    // Check that variant stock was restored from 6 (10 - 4) back to 10
    const finalProduct = await Product.findById(product._id);
    const variant = finalProduct.variants.find((v) => v.variantId === "var_fail_shoes_42");
    expect(variant.stock).toBe(10);
    expect(finalProduct.stock).toBe(50); // Parent stock unchanged
  });

  it("Test 2 — Simple product compensation remains correct", async () => {
    const { user, address } = await createTestCustomer();

    const product = await createTestProduct({
      name: "Simple Backpack",
      price: 1500,
      stock: 10,
      variants: []
    });

    const code = `SB${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const coupon = await Coupon.create({
      code,
      normalizedCode: code.toLowerCase(),
      type: "percentage",
      value: 10,
      isActive: true,
      usageLimit: 1,
      usedCount: 0
    });
    testCouponIds.add(coupon._id);

    const cart = await Cart.create({
      user: user._id,
      items: [
        {
          product: product._id,
          quantity: 4
        }
      ]
    });
    testCartIds.add(cart._id);

    const couponSpy = vi.spyOn(Coupon, "findOneAndUpdate").mockResolvedValueOnce(null);

    await expect(
      executeCheckout(user, address, { couponCode: coupon.code })
    ).rejects.toThrow("Coupon usage limit has been reached");

    couponSpy.mockRestore();

    const finalProduct = await Product.findById(product._id);
    expect(finalProduct.stock).toBe(10);
  });

  it("Test 3 — Exact variant targeting during compensation", async () => {
    const { user, address } = await createTestCustomer();

    const product = await createTestProduct({
      name: "Targeting Shirt",
      price: 1200,
      stock: 30,
      variants: [
        {
          variantId: "var_sh_a",
          sku: `SKU-A-${Date.now()}`,
          attributes: new Map([["size", "S"]]),
          stock: 10,
          isActive: true
        },
        {
          variantId: "var_sh_b",
          sku: `SKU-B-${Date.now()}`,
          attributes: new Map([["size", "M"]]),
          stock: 20,
          isActive: true
        }
      ]
    });

    const code = `TS${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const coupon = await Coupon.create({
      code,
      normalizedCode: code.toLowerCase(),
      type: "percentage",
      value: 10,
      isActive: true,
      usageLimit: 1,
      usedCount: 0
    });
    testCouponIds.add(coupon._id);

    const cart = await Cart.create({
      user: user._id,
      items: [
        {
          product: product._id,
          variantId: "var_sh_b",
          quantity: 4
        }
      ]
    });
    testCartIds.add(cart._id);

    const couponSpy = vi.spyOn(Coupon, "findOneAndUpdate").mockResolvedValueOnce(null);

    await expect(
      executeCheckout(user, address, { couponCode: coupon.code })
    ).rejects.toThrow("Coupon usage limit has been reached");

    couponSpy.mockRestore();

    const finalProduct = await Product.findById(product._id);
    const varA = finalProduct.variants.find((v) => v.variantId === "var_sh_a");
    const varB = finalProduct.variants.find((v) => v.variantId === "var_sh_b");
    expect(varA.stock).toBe(10);
    expect(varB.stock).toBe(20);
    expect(finalProduct.stock).toBe(30);
  });

  it("Test 4 — Multiple variants of same product restored independently during compensation", async () => {
    const { user, address } = await createTestCustomer();

    const product = await createTestProduct({
      name: "Multi Variant Pants",
      price: 1800,
      stock: 50,
      variants: [
        {
          variantId: "var_p_sm",
          sku: `SKU-SM-${Date.now()}`,
          attributes: new Map([["size", "Small"]]),
          stock: 10,
          isActive: true
        },
        {
          variantId: "var_p_lg",
          sku: `SKU-LG-${Date.now()}`,
          attributes: new Map([["size", "Large"]]),
          stock: 20,
          isActive: true
        }
      ]
    });

    const code = `MV${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const coupon = await Coupon.create({
      code,
      normalizedCode: code.toLowerCase(),
      type: "percentage",
      value: 10,
      isActive: true,
      usageLimit: 1,
      usedCount: 0
    });
    testCouponIds.add(coupon._id);

    const cart = await Cart.create({
      user: user._id,
      items: [
        {
          product: product._id,
          variantId: "var_p_sm",
          quantity: 2
        },
        {
          product: product._id,
          variantId: "var_p_lg",
          quantity: 5
        }
      ]
    });
    testCartIds.add(cart._id);

    const couponSpy = vi.spyOn(Coupon, "findOneAndUpdate").mockResolvedValueOnce(null);

    await expect(
      executeCheckout(user, address, { couponCode: coupon.code })
    ).rejects.toThrow("Coupon usage limit has been reached");

    couponSpy.mockRestore();

    const finalProduct = await Product.findById(product._id);
    const varSm = finalProduct.variants.find((v) => v.variantId === "var_p_sm");
    const varLg = finalProduct.variants.find((v) => v.variantId === "var_p_lg");
    expect(varSm.stock).toBe(10);
    expect(varLg.stock).toBe(20);
    expect(finalProduct.stock).toBe(50);
  });

  it("Test 5 — Mixed simple + variant checkout compensation restores all inventory pools", async () => {
    const { user, address } = await createTestCustomer();

    const productA = await createTestProduct({
      name: "Mixed Simple Product",
      price: 500,
      stock: 10,
      variants: []
    });

    const productB = await createTestProduct({
      name: "Mixed Variant Product",
      price: 1500,
      stock: 0,
      variants: [
        {
          variantId: "var_b_blue",
          sku: `SKU-B-${Date.now()}`,
          attributes: new Map([["color", "Blue"]]),
          stock: 15,
          isActive: true
        }
      ]
    });

    const productC = await createTestProduct({
      name: "Mixed Variant Product C",
      price: 2500,
      stock: 0,
      variants: [
        {
          variantId: "var_c_large",
          sku: `SKU-C-${Date.now()}`,
          attributes: new Map([["size", "Large"]]),
          stock: 25,
          isActive: true
        }
      ]
    });

    const code = `MX${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const coupon = await Coupon.create({
      code,
      normalizedCode: code.toLowerCase(),
      type: "percentage",
      value: 10,
      isActive: true,
      usageLimit: 1,
      usedCount: 0
    });
    testCouponIds.add(coupon._id);

    const cart = await Cart.create({
      user: user._id,
      items: [
        {
          product: productA._id,
          quantity: 2
        },
        {
          product: productB._id,
          variantId: "var_b_blue",
          quantity: 3
        },
        {
          product: productC._id,
          variantId: "var_c_large",
          quantity: 4
        }
      ]
    });
    testCartIds.add(cart._id);

    const couponSpy = vi.spyOn(Coupon, "findOneAndUpdate").mockResolvedValueOnce(null);

    await expect(
      executeCheckout(user, address, { couponCode: coupon.code })
    ).rejects.toThrow("Coupon usage limit has been reached");

    couponSpy.mockRestore();

    const finalA = await Product.findById(productA._id);
    const finalB = await Product.findById(productB._id);
    const finalC = await Product.findById(productC._id);

    expect(finalA.stock).toBe(10);
    expect(finalB.variants.find((v) => v.variantId === "var_b_blue").stock).toBe(15);
    expect(finalB.stock).toBe(0);
    expect(finalC.variants.find((v) => v.variantId === "var_c_large").stock).toBe(25);
    expect(finalC.stock).toBe(0);
  });

  it("Test 6 — Variant becomes inactive before compensation: stock is still restored", async () => {
    const { user, address } = await createTestCustomer();

    const product = await createTestProduct({
      name: "Deactivated Variant Jacket",
      price: 3000,
      stock: 0,
      variants: [
        {
          variantId: "var_inact_1",
          sku: `SKU-INACT-${Date.now()}`,
          attributes: new Map([["color", "Red"]]),
          stock: 10,
          isActive: true
        }
      ]
    });

    // We manually simulate the reservation on product
    await Product.updateOne(
      { _id: product._id, "variants.variantId": "var_inact_1" },
      { $inc: { "variants.$.stock": -4 } }
    );

    // Deactivate variant
    await Product.updateOne(
      { _id: product._id, "variants.variantId": "var_inact_1" },
      { $set: { "variants.$.isActive": false } }
    );

    const order = await Order.create({
      user: user._id,
      items: [
        {
          product: product._id,
          name: product.name,
          variantId: "var_inact_1",
          price: 3000,
          quantity: 4,
          subtotal: 12000
        }
      ],
      totalQuantity: 4,
      subtotal: 12000,
      total: 12000,
      payment: {
        provider: "razorpay",
        status: "pending",
        transactionId: ""
      },
      shippingAddress: {
        fullName: "Test",
        phone: "9876543210",
        addressLine1: "123 St",
        city: "City",
        state: "State",
        postalCode: "123456",
        country: "India"
      },
      status: "pending",
      checkoutState: "in_progress",
      checkoutCompensation: {
        restoredItems: [
          {
            product: product._id,
            variantId: "var_inact_1",
            quantity: 4,
            deducted: true,
            restorationState: "pending",
            restored: false,
            restorationKey: `k_inact_${Date.now()}`
          }
        ]
      }
    });
    testOrderIds.add(order._id);

    const compResult = await compensateOrderRedemption({
      orderId: order._id
    });

    expect(compResult.isFullyCompensated).toBe(true);
    expect(compResult.inventoryRestored).toBe(true);

    const finalProduct = await Product.findById(product._id);
    const variant = finalProduct.variants.find((v) => v.variantId === "var_inact_1");
    expect(variant.stock).toBe(10);
    expect(variant.isActive).toBe(false);
  });

  it("Test 7 — Product becomes inactive before compensation: stock is still restored", async () => {
    const { user, address } = await createTestCustomer();

    const product = await createTestProduct({
      name: "Deactivated Product",
      price: 1000,
      stock: 0,
      variants: [
        {
          variantId: "var_pinact_1",
          sku: `SKU-PINACT-${Date.now()}`,
          attributes: new Map([["size", "M"]]),
          stock: 10,
          isActive: true
        }
      ]
    });

    // Reserve 4
    await Product.updateOne(
      { _id: product._id, "variants.variantId": "var_pinact_1" },
      { $inc: { "variants.$.stock": -4 } }
    );

    // Deactivate parent product
    await Product.updateOne({ _id: product._id }, { $set: { isActive: false } });

    const order = await Order.create({
      user: user._id,
      items: [
        {
          product: product._id,
          name: product.name,
          variantId: "var_pinact_1",
          price: 1000,
          quantity: 4,
          subtotal: 4000
        }
      ],
      totalQuantity: 4,
      subtotal: 4000,
      total: 4000,
      payment: {
        provider: "razorpay",
        status: "pending",
        transactionId: ""
      },
      shippingAddress: {
        fullName: "Test",
        phone: "9876543210",
        addressLine1: "123 St",
        city: "City",
        state: "State",
        postalCode: "123456",
        country: "India"
      },
      status: "pending",
      checkoutState: "in_progress",
      checkoutCompensation: {
        restoredItems: [
          {
            product: product._id,
            variantId: "var_pinact_1",
            quantity: 4,
            deducted: true,
            restorationState: "pending",
            restored: false,
            restorationKey: `k_pinact_${Date.now()}`
          }
        ]
      }
    });
    testOrderIds.add(order._id);

    const compResult = await compensateOrderRedemption({
      orderId: order._id
    });

    expect(compResult.isFullyCompensated).toBe(true);
    expect(compResult.inventoryRestored).toBe(true);

    const finalProduct = await Product.findById(product._id);
    const variant = finalProduct.variants.find((v) => v.variantId === "var_pinact_1");
    expect(variant.stock).toBe(10);
    expect(finalProduct.isActive).toBe(false);
  });

  it("Test 8 — Compensation retry: running compensation twice does not double-restore", async () => {
    const { user, address } = await createTestCustomer();

    const product = await createTestProduct({
      name: "Retry Test Product",
      price: 2000,
      stock: 0,
      variants: [
        {
          variantId: "var_retry_1",
          sku: `SKU-RETRY-${Date.now()}`,
          attributes: new Map([["size", "L"]]),
          stock: 10,
          isActive: true
        }
      ]
    });

    // Reserve 4
    await Product.updateOne(
      { _id: product._id, "variants.variantId": "var_retry_1" },
      { $inc: { "variants.$.stock": -4 } }
    );

    const order = await Order.create({
      user: user._id,
      items: [
        {
          product: product._id,
          name: product.name,
          variantId: "var_retry_1",
          price: 2000,
          quantity: 4,
          subtotal: 8000
        }
      ],
      totalQuantity: 4,
      subtotal: 8000,
      total: 8000,
      payment: {
        provider: "razorpay",
        status: "pending",
        transactionId: ""
      },
      shippingAddress: {
        fullName: "Test",
        phone: "9876543210",
        addressLine1: "123 St",
        city: "City",
        state: "State",
        postalCode: "123456",
        country: "India"
      },
      status: "pending",
      checkoutState: "in_progress",
      checkoutCompensation: {
        restoredItems: [
          {
            product: product._id,
            variantId: "var_retry_1",
            quantity: 4,
            deducted: true,
            restorationState: "pending",
            restored: false,
            restorationKey: `k_retry_${Date.now()}`
          }
        ]
      }
    });
    testOrderIds.add(order._id);

    // Call 1
    const res1 = await compensateOrderRedemption({ orderId: order._id });
    expect(res1.isFullyCompensated).toBe(true);

    const midProduct = await Product.findById(product._id);
    expect(midProduct.variants.find((v) => v.variantId === "var_retry_1").stock).toBe(10);

    // Call 2 (Retry)
    const res2 = await compensateOrderRedemption({ orderId: order._id });
    expect(res2.isFullyCompensated).toBe(true);

    const finalProduct = await Product.findById(product._id);
    expect(finalProduct.variants.find((v) => v.variantId === "var_retry_1").stock).toBe(10); // NOT 14
  });

  it("Test 9 — Concurrent compensation against the same order restores exactly once", async () => {
    const { user, address } = await createTestCustomer();

    const product = await createTestProduct({
      name: "Concurrent Test Product",
      price: 2000,
      stock: 0,
      variants: [
        {
          variantId: "var_conc_1",
          sku: `SKU-CONC-${Date.now()}`,
          attributes: new Map([["size", "XL"]]),
          stock: 10,
          isActive: true
        }
      ]
    });

    // Reserve 4
    await Product.updateOne(
      { _id: product._id, "variants.variantId": "var_conc_1" },
      { $inc: { "variants.$.stock": -4 } }
    );

    const restorationKey = `k_conc_${Date.now()}`;
    const order = await Order.create({
      user: user._id,
      items: [
        {
          product: product._id,
          name: product.name,
          variantId: "var_conc_1",
          price: 2000,
          quantity: 4,
          subtotal: 8000
        }
      ],
      totalQuantity: 4,
      subtotal: 8000,
      total: 8000,
      payment: {
        provider: "razorpay",
        status: "pending",
        transactionId: ""
      },
      shippingAddress: {
        fullName: "Test",
        phone: "9876543210",
        addressLine1: "123 St",
        city: "City",
        state: "State",
        postalCode: "123456",
        country: "India"
      },
      status: "pending",
      checkoutState: "in_progress",
      checkoutCompensation: {
        restoredItems: [
          {
            product: product._id,
            variantId: "var_conc_1",
            quantity: 4,
            deducted: true,
            restorationState: "pending",
            restored: false,
            restorationKey
          }
        ]
      }
    });
    testOrderIds.add(order._id);

    // Trigger concurrently
    const [run1, run2] = await Promise.allSettled([
      compensateOrderRedemption({ orderId: order._id }),
      compensateOrderRedemption({ orderId: order._id })
    ]);

    expect(run1.status).toBe("fulfilled");
    expect(run2.status).toBe("fulfilled");

    const finalProduct = await Product.findById(product._id);
    const variant = finalProduct.variants.find((v) => v.variantId === "var_conc_1");
    expect(variant.stock).toBe(10); // NOT 14
  });

  it("Test 10 — Partial compensation retry restores only remaining unrestored items", async () => {
    const { user, address } = await createTestCustomer();

    const productA = await createTestProduct({
      name: "Partial Item A",
      price: 1000,
      stock: 0,
      variants: [
        {
          variantId: "var_part_a",
          sku: `SKU-PART-A-${Date.now()}`,
          attributes: new Map([["size", "S"]]),
          stock: 10,
          isActive: true
        }
      ]
    });

    const productB = await createTestProduct({
      name: "Partial Item B",
      price: 2000,
      stock: 0,
      variants: [
        {
          variantId: "var_part_b",
          sku: `SKU-PART-B-${Date.now()}`,
          attributes: new Map([["size", "M"]]),
          stock: 20,
          isActive: true
        }
      ]
    });

    // Reserve 2 of A and 5 of B
    await Product.updateOne(
      { _id: productA._id, "variants.variantId": "var_part_a" },
      { $inc: { "variants.$.stock": -2 } }
    );
    await Product.updateOne(
      { _id: productB._id, "variants.variantId": "var_part_b" },
      { $inc: { "variants.$.stock": -5 } }
    );

    const keyA = `k_part_a_${Date.now()}`;
    const keyB = `k_part_b_${Date.now()}`;

    // Item A is ALREADY marked restored in order ledger & product
    await Product.updateOne(
      { _id: productA._id, "variants.variantId": "var_part_a" },
      {
        $inc: { "variants.$.stock": 2 },
        $push: { restorationKeys: keyA }
      }
    );

    const order = await Order.create({
      user: user._id,
      items: [
        {
          product: productA._id,
          name: productA.name,
          variantId: "var_part_a",
          price: 1000,
          quantity: 2,
          subtotal: 2000
        },
        {
          product: productB._id,
          name: productB.name,
          variantId: "var_part_b",
          price: 2000,
          quantity: 5,
          subtotal: 10000
        }
      ],
      totalQuantity: 7,
      subtotal: 12000,
      total: 12000,
      payment: {
        provider: "razorpay",
        status: "pending",
        transactionId: ""
      },
      shippingAddress: {
        fullName: "Test",
        phone: "9876543210",
        addressLine1: "123 St",
        city: "City",
        state: "State",
        postalCode: "123456",
        country: "India"
      },
      status: "pending",
      checkoutState: "compensation_pending",
      checkoutCompensation: {
        restoredItems: [
          {
            product: productA._id,
            variantId: "var_part_a",
            quantity: 2,
            deducted: true,
            restorationState: "restored",
            restored: true,
            restorationKey: keyA
          },
          {
            product: productB._id,
            variantId: "var_part_b",
            quantity: 5,
            deducted: true,
            restorationState: "pending",
            restored: false,
            restorationKey: keyB
          }
        ]
      }
    });
    testOrderIds.add(order._id);

    const compResult = await compensateOrderRedemption({ orderId: order._id });
    expect(compResult.isFullyCompensated).toBe(true);

    const finalA = await Product.findById(productA._id);
    const finalB = await Product.findById(productB._id);

    // Item A stock remained 10 (not double-restored to 12)
    expect(finalA.variants.find((v) => v.variantId === "var_part_a").stock).toBe(10);
    // Item B stock restored from 15 to 20
    expect(finalB.variants.find((v) => v.variantId === "var_part_b").stock).toBe(20);
  });

  it("Test 11 — Historical snapshot identity: modifying catalog metadata after reservation does not break compensation", async () => {
    const { user, address } = await createTestCustomer();

    const product = await createTestProduct({
      name: "Historical Variant Shirt",
      price: 1500,
      stock: 0,
      variants: [
        {
          variantId: "var_hist_1",
          sku: `SKU-HIST-ORIG-${Date.now()}`,
          attributes: new Map([["size", "S"]]),
          stock: 10,
          isActive: true
        }
      ]
    });

    // Reserve 3
    await Product.updateOne(
      { _id: product._id, "variants.variantId": "var_hist_1" },
      { $inc: { "variants.$.stock": -3 } }
    );

    const order = await Order.create({
      user: user._id,
      items: [
        {
          product: product._id,
          name: product.name,
          variantId: "var_hist_1",
          price: 1500,
          quantity: 3,
          subtotal: 4500
        }
      ],
      totalQuantity: 3,
      subtotal: 4500,
      total: 4500,
      payment: {
        provider: "razorpay",
        status: "pending",
        transactionId: ""
      },
      shippingAddress: {
        fullName: "Test",
        phone: "9876543210",
        addressLine1: "123 St",
        city: "City",
        state: "State",
        postalCode: "123456",
        country: "India"
      },
      status: "pending",
      checkoutState: "in_progress",
      checkoutCompensation: {
        restoredItems: [
          {
            product: product._id,
            variantId: "var_hist_1",
            quantity: 3,
            deducted: true,
            restorationState: "pending",
            restored: false,
            restorationKey: `k_hist_${Date.now()}`
          }
        ]
      }
    });
    testOrderIds.add(order._id);

    // Mutate catalog name and variant SKU after reservation
    await Product.updateOne(
      { _id: product._id, "variants.variantId": "var_hist_1" },
      {
        $set: {
          name: "Renamed Shirt After Reservation",
          "variants.$.sku": "SKU-CHANGED-NEW"
        }
      }
    );

    const compResult = await compensateOrderRedemption({ orderId: order._id });
    expect(compResult.isFullyCompensated).toBe(true);

    const finalProduct = await Product.findById(product._id);
    const variant = finalProduct.variants.find((v) => v.variantId === "var_hist_1");
    expect(variant.stock).toBe(10);
  });

  it("Test 12 — Hard-deleted variant behavior: never falls back to root stock", async () => {
    const { user, address } = await createTestCustomer();

    const product = await createTestProduct({
      name: "Deleted Variant Product",
      price: 1000,
      stock: 50, // Root stock is 50
      variants: [
        {
          variantId: "var_del_1",
          sku: `SKU-DEL-${Date.now()}`,
          attributes: new Map([["size", "M"]]),
          stock: 10,
          isActive: true
        }
      ]
    });

    const order = await Order.create({
      user: user._id,
      items: [
        {
          product: product._id,
          name: product.name,
          variantId: "var_del_1",
          price: 1000,
          quantity: 4,
          subtotal: 4000
        }
      ],
      totalQuantity: 4,
      subtotal: 4000,
      total: 4000,
      payment: {
        provider: "razorpay",
        status: "pending",
        transactionId: ""
      },
      shippingAddress: {
        fullName: "Test",
        phone: "9876543210",
        addressLine1: "123 St",
        city: "City",
        state: "State",
        postalCode: "123456",
        country: "India"
      },
      status: "pending",
      checkoutState: "in_progress",
      checkoutCompensation: {
        restoredItems: [
          {
            product: product._id,
            variantId: "var_del_1",
            quantity: 4,
            deducted: true,
            restorationState: "pending",
            restored: false,
            restorationKey: `k_del_${Date.now()}`
          }
        ]
      }
    });
    testOrderIds.add(order._id);

    // Physically pull variant subdocument
    await Product.updateOne(
      { _id: product._id },
      { $pull: { variants: { variantId: "var_del_1" } } }
    );

    const compResult = await compensateOrderRedemption({ orderId: order._id });

    // Inventory could not be restored because variant subdocument was deleted;
    // CRITICAL INVARIANT: Root stock MUST NOT be incremented to 54!
    expect(compResult.inventoryRestored).toBe(false);
    expect(compResult.isFullyCompensated).toBe(false);

    const finalProduct = await Product.findById(product._id);
    expect(finalProduct.stock).toBe(50); // NEVER 54
  });

  it("Test 13 — Client override resistance: compensation uses persisted server data", async () => {
    const { user, address } = await createTestCustomer();

    const product = await createTestProduct({
      name: "Override Resistance Item",
      price: 1000,
      stock: 0,
      variants: [
        {
          variantId: "var_auth_1",
          sku: `SKU-AUTH-${Date.now()}`,
          attributes: new Map([["size", "L"]]),
          stock: 10,
          isActive: true
        }
      ]
    });

    const code = `OR${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const coupon = await Coupon.create({
      code,
      normalizedCode: code.toLowerCase(),
      type: "percentage",
      value: 10,
      isActive: true,
      usageLimit: 1,
      usedCount: 0
    });
    testCouponIds.add(coupon._id);

    const cart = await Cart.create({
      user: user._id,
      items: [
        {
          product: product._id,
          variantId: "var_auth_1",
          quantity: 2
        }
      ]
    });
    testCartIds.add(cart._id);

    // Inject bogus client override fields into checkout request payload
    const couponSpy = vi.spyOn(Coupon, "findOneAndUpdate").mockResolvedValueOnce(null);

    await expect(
      executeCheckout(user, address, {
        couponCode: coupon.code,
        variantId: "bogus_variant",
        quantity: 9999,
        restoredQuantity: 9999
      })
    ).rejects.toThrow();

    couponSpy.mockRestore();

    const finalProduct = await Product.findById(product._id);
    const variant = finalProduct.variants.find((v) => v.variantId === "var_auth_1");
    // Restored exactly 2 back to 10; never incremented by bogus 9999
    expect(variant.stock).toBe(10);
  });

  it.skipIf(isCI ? false : !hasReplicaSet)(
    "Test 14 — P1.6.4 variant cancellation regression test continues to pass",
    async () => {
      // Enforcement: In CI, MongoDB replica set MUST be available; fail immediately if missing
      if (isCI && !hasReplicaSet) {
        throw new Error(
          "CRITICAL CI FAILURE: MongoDB replica set is required in CI but is not available or not primary."
        );
      }

      const { user, address } = await createTestCustomer();

    const product = await createTestProduct({
      name: "Cancellation Sanity Pants",
      price: 1500,
      stock: 0,
      variants: [
        {
          variantId: "var_san_1",
          sku: `SKU-SAN-${Date.now()}`,
          attributes: new Map([["size", "M"]]),
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
          variantId: "var_san_1",
          quantity: 3
        }
      ]
    });
    testCartIds.add(cart._id);

    // Successful checkout
    const checkoutRes = await executeCheckout(user, address);
    expect(checkoutRes.status).toBe(201);
    const orderId = checkoutRes.body.data.order._id;

    // Verify reserved stock
    let midProduct = await Product.findById(product._id);
    expect(midProduct.variants.find((v) => v.variantId === "var_san_1").stock).toBe(7);

    // Cancel order
    const cancelRes = await new Promise(async (resolve, reject) => {
      const { default: cancelOrder } = await import("./cancel-order.controller.js");
      const req = {
        params: { orderId: orderId.toString() },
        body: { reason: "changed_mind" },
        user: { _id: user._id },
        requestId: `req-cancel-san-${Date.now()}`
      };
      const res = {
        statusCode: 200,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(data) {
          resolve({ status: this.statusCode, body: data });
        }
      };
      const next = (err) => (err ? reject(err) : resolve({ status: res.statusCode, body: null }));
      await cancelOrder(req, res, next);
    });

    expect(cancelRes.status).toBe(200);

    const finalProduct = await Product.findById(product._id);
    expect(finalProduct.variants.find((v) => v.variantId === "var_san_1").stock).toBe(10);
  });
});
