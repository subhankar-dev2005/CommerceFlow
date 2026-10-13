import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import mongoose from "mongoose";
import request from "supertest";
import { createApp } from "../../app.js";
import { env } from "../../config/env.js";
import User from "../users/user.model.js";
import Product from "../products/product.model.js";
import Order from "../orders/order.model.js";
import Return from "./return.model.js";
import AdminAuditLog from "../audit/admin-audit-log.model.js";
import { AUDIT_EVENT_TYPES } from "../audit/admin-audit.service.js";
import { logger } from "../../config/logger.js";
import generateToken from "../../utils/generate-token.js";
import { AUTH_COOKIE_NAME } from "../../config/cookie.js";
import { restoreReturnInventory } from "./return-inventory.service.js";

describe("Production Order Returns & RMA Lifecycle Integration Tests", () => {
  let app;
  const isMongoAvailable = Boolean(env.MONGODB_URI);

  const cleanupUserIds = new Set();
  const cleanupProductIds = new Set();
  const cleanupOrderIds = new Set();
  const cleanupReturnIds = new Set();
  const cleanupAuditIds = new Set();

  let customerUser;
  let otherCustomerUser;
  let adminUser;
  let customerToken;
  let otherCustomerToken;
  let adminToken;

  beforeAll(async () => {
    if (isMongoAvailable && mongoose.connection.readyState === 0) {
      await mongoose.connect(env.MONGODB_URI);
    }
    await User.init();
    await Product.init();
    await Order.init();
    await Return.init();
    await AdminAuditLog.init();
    app = createApp();
  });

  afterAll(async () => {
    if (isMongoAvailable && mongoose.connection.readyState !== 0) {
      if (cleanupReturnIds.size > 0) {
        await Return.deleteMany({ _id: { $in: Array.from(cleanupReturnIds) } });
      }
      if (cleanupOrderIds.size > 0) {
        await Order.deleteMany({ _id: { $in: Array.from(cleanupOrderIds) } });
      }
      if (cleanupProductIds.size > 0) {
        await Product.deleteMany({ _id: { $in: Array.from(cleanupProductIds) } });
      }
      if (cleanupUserIds.size > 0) {
        await User.deleteMany({ _id: { $in: Array.from(cleanupUserIds) } });
      }
      if (cleanupAuditIds.size > 0) {
        await AdminAuditLog.deleteMany({ _id: { $in: Array.from(cleanupAuditIds) } });
      }
    }
  });

  beforeEach(async () => {
    // Generate fresh users for testing
    customerUser = await User.create({
      name: "RMA Customer",
      email: `rma-cust-${Date.now()}-${Math.random().toString(36).substring(2, 7)}@example.com`,
      password: "Password123!",
      role: "customer"
    });
    cleanupUserIds.add(customerUser._id);

    otherCustomerUser = await User.create({
      name: "Other RMA Customer",
      email: `rma-other-${Date.now()}-${Math.random().toString(36).substring(2, 7)}@example.com`,
      password: "Password123!",
      role: "customer"
    });
    cleanupUserIds.add(otherCustomerUser._id);

    adminUser = await User.create({
      name: "RMA Admin",
      email: `rma-admin-${Date.now()}-${Math.random().toString(36).substring(2, 7)}@example.com`,
      password: "Password123!",
      role: "admin"
    });
    cleanupUserIds.add(adminUser._id);

    customerToken = generateToken({
      userId: customerUser._id,
      email: customerUser.email,
      role: "customer"
    });

    otherCustomerToken = generateToken({
      userId: otherCustomerUser._id,
      email: otherCustomerUser.email,
      role: "customer"
    });

    adminToken = generateToken({
      userId: adminUser._id,
      email: adminUser.email,
      role: "admin"
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function createDeliveredOrder(user, itemsConfig = []) {
    const items = [];
    let subtotal = 0;
    let totalQty = 0;

    for (const conf of itemsConfig) {
      const price = conf.price || 1000;
      const quantity = conf.quantity || 2;
      const itemSubtotal = price * quantity;
      subtotal += itemSubtotal;
      totalQty += quantity;

      items.push({
        product: conf.product._id,
        variantId: conf.variantId || null,
        variantName: conf.variantName || null,
        sku: conf.sku || null,
        name: conf.product.name,
        price,
        quantity,
        subtotal: itemSubtotal
      });
    }

    const order = await Order.create({
      user: user._id,
      items,
      totalQuantity: totalQty,
      subtotal,
      total: subtotal,
      payment: {
        provider: "razorpay",
        status: "paid",
        transactionId: "pay_test_123"
      },
      shippingAddress: {
        fullName: "Test Customer",
        phone: "9876543210",
        addressLine1: "123 Test Street",
        city: "Bengaluru",
        state: "Karnataka",
        postalCode: "560001",
        country: "India"
      },
      status: "delivered",
      shipment: {
        carrier: "BlueDart",
        trackingNumber: "TRK123456",
        status: "delivered",
        deliveredAt: new Date()
      }
    });

    cleanupOrderIds.add(order._id);
    return order;
  }

  describe("1-8. Return Request Validation & Eligibility Guardrails", () => {
    it("1. customer creates valid return", async () => {
      const product = await Product.create({
        name: "Test Backpack",
        description: "Backpack description",
        price: 1500,
        stock: 20,
        category: "Bags"
      });
      cleanupProductIds.add(product._id);

      const order = await createDeliveredOrder(customerUser, [
        { product, quantity: 2, price: 1500 }
      ]);

      const res = await request(app)
        .post(`/api/v1/orders/${order._id}/returns`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${customerToken}`)
        .send({
          reason: "defective",
          customerNote: "Zipper is broken",
          items: [
            {
              productId: product._id.toString(),
              quantity: 1
            }
          ]
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.return.returnNumber).toMatch(/^RET-/);
      expect(res.body.data.return.status).toBe("requested");
      expect(res.body.data.return.items).toHaveLength(1);
      expect(res.body.data.return.items[0].requestedQuantity).toBe(1);
      expect(res.body.data.return.items[0].price).toBe(1500);
      expect(res.body.data.return.totalRefundAmount).toBe(1500);
      cleanupReturnIds.add(res.body.data.return._id);
    });

    it("2. customer cannot return another customer's order", async () => {
      const product = await Product.create({
        name: "Secret Item",
        description: "Desc",
        price: 1000,
        stock: 10,
        category: "Test"
      });
      cleanupProductIds.add(product._id);

      const order = await createDeliveredOrder(otherCustomerUser, [
        { product, quantity: 1, price: 1000 }
      ]);

      const res = await request(app)
        .post(`/api/v1/orders/${order._id}/returns`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${customerToken}`)
        .send({
          reason: "damaged",
          items: [{ productId: product._id.toString(), quantity: 1 }]
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("ORDER_ACCESS_DENIED");
    });

    it("3. unauthenticated return request rejected", async () => {
      const dummyOrderId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .post(`/api/v1/orders/${dummyOrderId}/returns`)
        .send({
          reason: "damaged",
          items: [{ productId: new mongoose.Types.ObjectId().toString(), quantity: 1 }]
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("AUTH_TOKEN_REQUIRED");
    });

    it("4. cancelled order cannot be returned", async () => {
      const product = await Product.create({
        name: "Cancelled Order Item",
        description: "Desc",
        price: 2000,
        stock: 5,
        category: "Test"
      });
      cleanupProductIds.add(product._id);

      const order = await createDeliveredOrder(customerUser, [
        { product, quantity: 1, price: 2000 }
      ]);
      order.status = "cancelled";
      await order.save();

      const res = await request(app)
        .post(`/api/v1/orders/${order._id}/returns`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${customerToken}`)
        .send({
          reason: "damaged",
          items: [{ productId: product._id.toString(), quantity: 1 }]
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("ORDER_ALREADY_CANCELLED");
    });

    it("5. ineligible fulfillment state rejected", async () => {
      const product = await Product.create({
        name: "In-Transit Item",
        description: "Desc",
        price: 800,
        stock: 5,
        category: "Test"
      });
      cleanupProductIds.add(product._id);

      const order = await createDeliveredOrder(customerUser, [
        { product, quantity: 1, price: 800 }
      ]);
      order.status = "shipped";
      await order.save();

      const res = await request(app)
        .post(`/api/v1/orders/${order._id}/returns`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${customerToken}`)
        .send({
          reason: "damaged",
          items: [{ productId: product._id.toString(), quantity: 1 }]
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("ORDER_NOT_DELIVERED");
    });

    it("6. invalid quantity rejected", async () => {
      const product = await Product.create({
        name: "Zero Qty Item",
        description: "Desc",
        price: 500,
        stock: 10,
        category: "Test"
      });
      cleanupProductIds.add(product._id);

      const order = await createDeliveredOrder(customerUser, [
        { product, quantity: 2, price: 500 }
      ]);

      const res = await request(app)
        .post(`/api/v1/orders/${order._id}/returns`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${customerToken}`)
        .send({
          reason: "damaged",
          items: [{ productId: product._id.toString(), quantity: 0 }]
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it("7. quantity exceeding returnable quantity rejected", async () => {
      const product = await Product.create({
        name: "Overclaim Item",
        description: "Desc",
        price: 1200,
        stock: 10,
        category: "Test"
      });
      cleanupProductIds.add(product._id);

      const order = await createDeliveredOrder(customerUser, [
        { product, quantity: 2, price: 1200 }
      ]);

      const res = await request(app)
        .post(`/api/v1/orders/${order._id}/returns`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${customerToken}`)
        .send({
          reason: "defective",
          items: [{ productId: product._id.toString(), quantity: 5 }] // ordered 2, trying 5
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("QUANTITY_EXCEEDS_RETURNABLE");
    });

    it("8. duplicate quantity claim rejected across multiple requests", async () => {
      const product = await Product.create({
        name: "Multi-Claim Item",
        description: "Desc",
        price: 1000,
        stock: 10,
        category: "Test"
      });
      cleanupProductIds.add(product._id);

      const order = await createDeliveredOrder(customerUser, [
        { product, quantity: 2, price: 1000 }
      ]);

      // Request 1 for 2 units (claims all)
      const res1 = await request(app)
        .post(`/api/v1/orders/${order._id}/returns`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${customerToken}`)
        .send({
          reason: "size_fit",
          items: [{ productId: product._id.toString(), quantity: 2 }]
        });
      expect(res1.status).toBe(201);
      cleanupReturnIds.add(res1.body.data.return._id);

      // Request 2 for 1 more unit should be rejected as 0 units remain
      const res2 = await request(app)
        .post(`/api/v1/orders/${order._id}/returns`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${customerToken}`)
        .send({
          reason: "size_fit",
          items: [{ productId: product._id.toString(), quantity: 1 }]
        });

      expect(res2.status).toBe(400);
      expect(res2.body.error.code).toBe("QUANTITY_EXCEEDS_RETURNABLE");
    });
  });

  describe("9-13. State Machine & Security Boundaries", () => {
    it("9. legal status transitions succeed: requested -> approved -> received -> completed", async () => {
      const product = await Product.create({
        name: "Lifecycle Item",
        description: "Desc",
        price: 1000,
        stock: 10,
        category: "Test"
      });
      cleanupProductIds.add(product._id);

      const order = await createDeliveredOrder(customerUser, [
        { product, quantity: 1, price: 1000 }
      ]);

      const createRes = await request(app)
        .post(`/api/v1/orders/${order._id}/returns`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${customerToken}`)
        .send({
          reason: "defective",
          items: [{ productId: product._id.toString(), quantity: 1 }]
        });
      const returnId = createRes.body.data.return._id;
      cleanupReturnIds.add(returnId);

      // 1. Approve
      const approveRes = await request(app)
        .patch(`/api/v1/admin/returns/${returnId}/approve`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken}`)
        .send({ adminNote: "Approved for inspection" });
      expect(approveRes.status).toBe(200);
      expect(approveRes.body.data.return.status).toBe("approved");

      // 2. Receive
      const receiveRes = await request(app)
        .patch(`/api/v1/admin/returns/${returnId}/receive`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken}`)
        .send({ adminNote: "Package arrived at warehouse" });
      expect(receiveRes.status).toBe(200);
      expect(receiveRes.body.data.return.status).toBe("received");

      // 3. Complete
      const completeRes = await request(app)
        .patch(`/api/v1/admin/returns/${returnId}/complete`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken}`)
        .send({ adminNote: "Restocked item" });
      expect(completeRes.status).toBe(200);
      expect(completeRes.body.data.return.status).toBe("completed");
    });

    it("10. illegal status transitions fail", async () => {
      const product = await Product.create({
        name: "Transition Test Item",
        description: "Desc",
        price: 500,
        stock: 5,
        category: "Test"
      });
      cleanupProductIds.add(product._id);

      const order = await createDeliveredOrder(customerUser, [
        { product, quantity: 1, price: 500 }
      ]);

      const createRes = await request(app)
        .post(`/api/v1/orders/${order._id}/returns`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${customerToken}`)
        .send({
          reason: "wrong_item",
          items: [{ productId: product._id.toString(), quantity: 1 }]
        });
      const returnId = createRes.body.data.return._id;
      cleanupReturnIds.add(returnId);

      // Trying to complete a "requested" return without approving or receiving first
      const illegalComplete = await request(app)
        .patch(`/api/v1/admin/returns/${returnId}/complete`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken}`)
        .send({});
      expect(illegalComplete.status).toBe(400);
      expect(illegalComplete.body.error.code).toBe("INVALID_RETURN_STATUS_TRANSITION");

      // Reject return
      const rejectRes = await request(app)
        .patch(`/api/v1/admin/returns/${returnId}/reject`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken}`)
        .send({ rejectionReason: "Outside policy" });
      expect(rejectRes.status).toBe(200);

      // Rejected return cannot be approved
      const illegalApprove = await request(app)
        .patch(`/api/v1/admin/returns/${returnId}/approve`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken}`)
        .send({});
      expect(illegalApprove.status).toBe(400);
      expect(illegalApprove.body.error.code).toBe("INVALID_RETURN_STATUS_TRANSITION");
    });

    it("11. admin-only actions enforced against customers", async () => {
      const dummyReturnId = new mongoose.Types.ObjectId().toString();

      const res = await request(app)
        .patch(`/api/v1/admin/returns/${dummyReturnId}/approve`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${customerToken}`)
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("12. client actor identity ignored (req.user is authoritative)", async () => {
      const product = await Product.create({
        name: "Actor Test Item",
        description: "Desc",
        price: 1000,
        stock: 5,
        category: "Test"
      });
      cleanupProductIds.add(product._id);

      const order = await createDeliveredOrder(customerUser, [
        { product, quantity: 1, price: 1000 }
      ]);

      const fakeOtherUserId = new mongoose.Types.ObjectId().toString();

      const res = await request(app)
        .post(`/api/v1/orders/${order._id}/returns`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${customerToken}`)
        .send({
          reason: "defective",
          customerId: fakeOtherUserId, // Client attempts to forge customer
          createdBy: fakeOtherUserId,
          items: [{ productId: product._id.toString(), quantity: 1 }]
        });

      expect(res.status).toBe(201);
      expect(res.body.data.return.customerId.toString()).toBe(customerUser._id.toString());
      expect(res.body.data.return.createdBy.toString()).toBe(customerUser._id.toString());
      cleanupReturnIds.add(res.body.data.return._id);
    });

    it("13. client price/refund manipulation rejected", async () => {
      const product = await Product.create({
        name: "Price Tamper Item",
        description: "Desc",
        price: 2500, // Real price in order snapshot
        stock: 5,
        category: "Test"
      });
      cleanupProductIds.add(product._id);

      const order = await createDeliveredOrder(customerUser, [
        { product, quantity: 1, price: 2500 }
      ]);

      const res = await request(app)
        .post(`/api/v1/orders/${order._id}/returns`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${customerToken}`)
        .send({
          reason: "defective",
          totalRefundAmount: 999999, // Client attempts to inflate refund amount
          items: [
            {
              productId: product._id.toString(),
              quantity: 1,
              price: 999999,
              returnAmount: 999999
            }
          ]
        });

      // Price should be taken strictly from order snapshot ($2500), ignoring client input
      expect(res.status).toBe(201);
      expect(res.body.data.return.items[0].price).toBe(2500);
      expect(res.body.data.return.totalRefundAmount).toBe(2500);
      cleanupReturnIds.add(res.body.data.return._id);
    });
  });

  describe("14-23. Inventory Restoration Invariants & Variant Safety", () => {
    it("14. return rejection does not restore inventory", async () => {
      const product = await Product.create({
        name: "No-Restock Reject Item",
        description: "Desc",
        price: 1000,
        stock: 10,
        category: "Test"
      });
      cleanupProductIds.add(product._id);

      const order = await createDeliveredOrder(customerUser, [
        { product, quantity: 2, price: 1000 }
      ]);

      const createRes = await request(app)
        .post(`/api/v1/orders/${order._id}/returns`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${customerToken}`)
        .send({
          reason: "changed_mind",
          items: [{ productId: product._id.toString(), quantity: 2 }]
        });
      const returnId = createRes.body.data.return._id;
      cleanupReturnIds.add(returnId);

      await request(app)
        .patch(`/api/v1/admin/returns/${returnId}/reject`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken}`)
        .send({ rejectionReason: "Items opened" });

      const checkProduct = await Product.findById(product._id);
      expect(checkProduct.stock).toBe(10); // NOT incremented
    });

    it("15. return cancellation does not restore inventory", async () => {
      const product = await Product.create({
        name: "No-Restock Cancel Item",
        description: "Desc",
        price: 1000,
        stock: 15,
        category: "Test"
      });
      cleanupProductIds.add(product._id);

      const order = await createDeliveredOrder(customerUser, [
        { product, quantity: 3, price: 1000 }
      ]);

      const createRes = await request(app)
        .post(`/api/v1/orders/${order._id}/returns`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${customerToken}`)
        .send({
          reason: "size_fit",
          items: [{ productId: product._id.toString(), quantity: 3 }]
        });
      const returnId = createRes.body.data.return._id;
      cleanupReturnIds.add(returnId);

      await request(app)
        .post(`/api/v1/returns/${returnId}/cancel`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${customerToken}`)
        .send({});

      const checkProduct = await Product.findById(product._id);
      expect(checkProduct.stock).toBe(15); // NOT incremented
    });

    it("16. return request does not prematurely restore inventory", async () => {
      const product = await Product.create({
        name: "Premature Test Item",
        description: "Desc",
        price: 500,
        stock: 8,
        category: "Test"
      });
      cleanupProductIds.add(product._id);

      const order = await createDeliveredOrder(customerUser, [
        { product, quantity: 2, price: 500 }
      ]);

      const createRes = await request(app)
        .post(`/api/v1/orders/${order._id}/returns`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${customerToken}`)
        .send({
          reason: "defective",
          items: [{ productId: product._id.toString(), quantity: 2 }]
        });
      cleanupReturnIds.add(createRes.body.data.return._id);

      const checkProduct = await Product.findById(product._id);
      expect(checkProduct.stock).toBe(8); // Still 8
    });

    it("17. received/completed return restores exact simple-product stock", async () => {
      const product = await Product.create({
        name: "Simple Restock Item",
        description: "Desc",
        price: 1000,
        stock: 5,
        category: "Test"
      });
      cleanupProductIds.add(product._id);

      const order = await createDeliveredOrder(customerUser, [
        { product, quantity: 3, price: 1000 }
      ]);

      const createRes = await request(app)
        .post(`/api/v1/orders/${order._id}/returns`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${customerToken}`)
        .send({
          reason: "defective",
          items: [{ productId: product._id.toString(), quantity: 3 }]
        });
      const returnId = createRes.body.data.return._id;
      cleanupReturnIds.add(returnId);

      await request(app)
        .patch(`/api/v1/admin/returns/${returnId}/approve`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken}`);
      await request(app)
        .patch(`/api/v1/admin/returns/${returnId}/receive`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken}`);
      const completeRes = await request(app)
        .patch(`/api/v1/admin/returns/${returnId}/complete`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken}`);

      expect(completeRes.status).toBe(200);

      const checkProduct = await Product.findById(product._id);
      expect(checkProduct.stock).toBe(8); // 5 + 3 = 8
    });

    it("18. received/completed return restores exact variant stock", async () => {
      const product = await Product.create({
        name: "Variant Restock Item",
        description: "Desc",
        price: 2000,
        stock: 50,
        category: "Apparel",
        variants: [
          {
            variantId: "var_rma_restock",
            sku: `SKU-VRMA-${Date.now()}`,
            attributes: new Map([["size", "XL"]]),
            stock: 12,
            isActive: true
          }
        ]
      });
      cleanupProductIds.add(product._id);

      const order = await createDeliveredOrder(customerUser, [
        {
          product,
          variantId: "var_rma_restock",
          variantName: "Size XL",
          sku: "SKU-VRMA",
          quantity: 4,
          price: 2000
        }
      ]);

      const createRes = await request(app)
        .post(`/api/v1/orders/${order._id}/returns`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${customerToken}`)
        .send({
          reason: "size_fit",
          items: [
            {
              productId: product._id.toString(),
              variantId: "var_rma_restock",
              quantity: 4
            }
          ]
        });
      const returnId = createRes.body.data.return._id;
      cleanupReturnIds.add(returnId);

      await request(app)
        .patch(`/api/v1/admin/returns/${returnId}/approve`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken}`);
      await request(app)
        .patch(`/api/v1/admin/returns/${returnId}/receive`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken}`);
      const completeRes = await request(app)
        .patch(`/api/v1/admin/returns/${returnId}/complete`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken}`);

      expect(completeRes.status).toBe(200);

      const checkProduct = await Product.findById(product._id);
      const variant = checkProduct.variants.find((v) => v.variantId === "var_rma_restock");
      expect(variant.stock).toBe(16); // 12 + 4 = 16
      expect(checkProduct.stock).toBe(50); // Root stock remains unchanged at 50!
    });

    it("19. variant completion never falls back to root stock", async () => {
      const product = await Product.create({
        name: "No-Fallback Variant Item",
        description: "Desc",
        price: 1500,
        stock: 30, // Root stock
        category: "Test",
        variants: [
          {
            variantId: "var_nf_1",
            sku: `SKU-NF-${Date.now()}`,
            attributes: new Map([["color", "Red"]]),
            stock: 5,
            isActive: true
          }
        ]
      });
      cleanupProductIds.add(product._id);

      const order = await createDeliveredOrder(customerUser, [
        {
          product,
          variantId: "var_nf_1",
          quantity: 2,
          price: 1500
        }
      ]);

      const createRes = await request(app)
        .post(`/api/v1/orders/${order._id}/returns`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${customerToken}`)
        .send({
          reason: "wrong_item",
          items: [{ productId: product._id.toString(), variantId: "var_nf_1", quantity: 2 }]
        });
      const returnId = createRes.body.data.return._id;
      cleanupReturnIds.add(returnId);

      await request(app)
        .patch(`/api/v1/admin/returns/${returnId}/approve`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken}`);
      await request(app)
        .patch(`/api/v1/admin/returns/${returnId}/receive`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken}`);
      await request(app)
        .patch(`/api/v1/admin/returns/${returnId}/complete`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken}`);

      const checkProduct = await Product.findById(product._id);
      expect(checkProduct.stock).toBe(30); // ROOT STOCK MUST NEVER CHANGE!
      const variant = checkProduct.variants.find((v) => v.variantId === "var_nf_1");
      expect(variant.stock).toBe(7); // Variant updated
    });

    it("20. hard-deleted variant fails safely without root stock fallback", async () => {
      const product = await Product.create({
        name: "Hard-Delete Variant Item",
        description: "Desc",
        price: 1200,
        stock: 40,
        category: "Test",
        variants: [
          {
            variantId: "var_to_delete",
            sku: `SKU-HD-${Date.now()}`,
            attributes: new Map([["size", "S"]]),
            stock: 2,
            isActive: true
          }
        ]
      });
      cleanupProductIds.add(product._id);

      const order = await createDeliveredOrder(customerUser, [
        {
          product,
          variantId: "var_to_delete",
          quantity: 2,
          price: 1200
        }
      ]);

      const createRes = await request(app)
        .post(`/api/v1/orders/${order._id}/returns`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${customerToken}`)
        .send({
          reason: "damaged",
          items: [{ productId: product._id.toString(), variantId: "var_to_delete", quantity: 2 }]
        });
      const returnId = createRes.body.data.return._id;
      cleanupReturnIds.add(returnId);

      await request(app)
        .patch(`/api/v1/admin/returns/${returnId}/approve`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken}`);
      await request(app)
        .patch(`/api/v1/admin/returns/${returnId}/receive`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken}`);

      // Now physically delete the variant subdocument
      await Product.updateOne(
        { _id: product._id },
        { $pull: { variants: { variantId: "var_to_delete" } } }
      );

      // Attempting to complete must fail safely
      const completeRes = await request(app)
        .patch(`/api/v1/admin/returns/${returnId}/complete`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken}`);

      expect(completeRes.status).toBe(422);
      expect(completeRes.body.error.code).toBe("VARIANT_SUBDOCUMENT_MISSING");

      // Root stock MUST remain 40, not incremented to 42!
      const checkProduct = await Product.findById(product._id);
      expect(checkProduct.stock).toBe(40);

      // Return status remains "received"
      const checkReturn = await Return.findById(returnId);
      expect(checkReturn.status).toBe("received");
    });

    it("21. repeated completion does not double-restock (idempotent)", async () => {
      const product = await Product.create({
        name: "Idempotent Restock Item",
        description: "Desc",
        price: 1000,
        stock: 10,
        category: "Test"
      });
      cleanupProductIds.add(product._id);

      const order = await createDeliveredOrder(customerUser, [
        { product, quantity: 2, price: 1000 }
      ]);

      const createRes = await request(app)
        .post(`/api/v1/orders/${order._id}/returns`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${customerToken}`)
        .send({
          reason: "defective",
          items: [{ productId: product._id.toString(), quantity: 2 }]
        });
      const returnId = createRes.body.data.return._id;
      cleanupReturnIds.add(returnId);

      await request(app)
        .patch(`/api/v1/admin/returns/${returnId}/approve`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken}`);
      await request(app)
        .patch(`/api/v1/admin/returns/${returnId}/receive`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken}`);
      await request(app)
        .patch(`/api/v1/admin/returns/${returnId}/complete`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken}`);

      const returnDoc = await Return.findById(returnId);

      // Directly invoke restoreReturnInventory a second time
      const retryResult = await restoreReturnInventory({ returnDoc });
      expect(retryResult.success).toBe(true);

      const checkProduct = await Product.findById(product._id);
      expect(checkProduct.stock).toBe(12); // Restored exactly once (10 + 2 = 12)
    });

    it("22. concurrent completion does not double-restock", async () => {
      const product = await Product.create({
        name: "Concurrent Restock Item",
        description: "Desc",
        price: 1000,
        stock: 20,
        category: "Test"
      });
      cleanupProductIds.add(product._id);

      const order = await createDeliveredOrder(customerUser, [
        { product, quantity: 5, price: 1000 }
      ]);

      const createRes = await request(app)
        .post(`/api/v1/orders/${order._id}/returns`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${customerToken}`)
        .send({
          reason: "defective",
          items: [{ productId: product._id.toString(), quantity: 5 }]
        });
      const returnId = createRes.body.data.return._id;
      cleanupReturnIds.add(returnId);

      await request(app)
        .patch(`/api/v1/admin/returns/${returnId}/approve`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken}`);
      await request(app)
        .patch(`/api/v1/admin/returns/${returnId}/receive`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken}`);

      // Fire two concurrent completion requests simultaneously
      const [res1, res2] = await Promise.all([
        request(app)
          .patch(`/api/v1/admin/returns/${returnId}/complete`)
          .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken}`),
        request(app)
          .patch(`/api/v1/admin/returns/${returnId}/complete`)
          .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken}`)
      ]);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      const checkProduct = await Product.findById(product._id);
      expect(checkProduct.stock).toBe(25); // Exactly 20 + 5 = 25, NOT 30!
    });

    it("23. failed restoration does not produce false completed state", async () => {
      const returnDoc = await Return.create({
        returnNumber: `RET-FALSE-${Date.now()}`,
        orderId: new mongoose.Types.ObjectId(),
        customerId: customerUser._id,
        status: "received",
        reason: "other",
        items: [
          {
            productId: new mongoose.Types.ObjectId(), // Non-existent product ID
            name: "Ghost Item",
            price: 1000,
            originalQuantity: 1,
            requestedQuantity: 1,
            returnAmount: 1000
          }
        ],
        totalRefundAmount: 1000,
        createdBy: customerUser._id
      });
      cleanupReturnIds.add(returnDoc._id);

      const res = await request(app)
        .patch(`/api/v1/admin/returns/${returnDoc._id}/complete`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("PRODUCT_NOT_FOUND");

      const checkReturn = await Return.findById(returnDoc._id);
      expect(checkReturn.status).toBe("received"); // Must NOT be completed
    });
  });

  describe("24-28. Audit Logging, Access Control & Serialization Protections", () => {
    it("24. audit events created for admin lifecycle actions", async () => {
      const product = await Product.create({
        name: "Audit Test Item",
        description: "Desc",
        price: 1000,
        stock: 5,
        category: "Test"
      });
      cleanupProductIds.add(product._id);

      const order = await createDeliveredOrder(customerUser, [
        { product, quantity: 1, price: 1000 }
      ]);

      const createRes = await request(app)
        .post(`/api/v1/orders/${order._id}/returns`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${customerToken}`)
        .send({
          reason: "defective",
          items: [{ productId: product._id.toString(), quantity: 1 }]
        });
      const returnId = createRes.body.data.return._id;
      cleanupReturnIds.add(returnId);

      await request(app)
        .patch(`/api/v1/admin/returns/${returnId}/approve`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken}`);
      await request(app)
        .patch(`/api/v1/admin/returns/${returnId}/receive`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken}`);
      await request(app)
        .patch(`/api/v1/admin/returns/${returnId}/complete`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken}`);

      const auditLogs = await AdminAuditLog.find({
        "metadata.returnId": returnId
      });

      expect(auditLogs.length).toBeGreaterThanOrEqual(3);
      const eventTypes = auditLogs.map((l) => l.eventType);
      expect(eventTypes).toContain("RETURN_APPROVED");
      expect(eventTypes).toContain("RETURN_RECEIVED");
      expect(eventTypes).toContain("RETURN_COMPLETED");

      auditLogs.forEach((l) => cleanupAuditIds.add(l._id));
    });

    it("25. audit records contain no secrets or sensitive headers", async () => {
      const logs = await AdminAuditLog.find({ actorUserId: adminUser._id }).lean();
      for (const log of logs) {
        const str = JSON.stringify(log);
        expect(str).not.toMatch(/password/i);
        expect(str).not.toMatch(/jwt/i);
        expect(str).not.toMatch(/bearer/i);
        expect(str).not.toMatch(/secret/i);
        cleanupAuditIds.add(log._id);
      }
    });

    it("26. customer cannot access admin return API", async () => {
      const res = await request(app)
        .get("/api/v1/admin/returns")
        .set("Cookie", `${AUTH_COOKIE_NAME}=${customerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("27. admin filters and pagination are bounded", async () => {
      const res = await request(app)
        .get("/api/v1/admin/returns?limit=500&page=-5")
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.pagination.page).toBe(1);
      expect(res.body.data.pagination.limit).toBe(100); // Capped at max 100
    });

    it("28. serialization does not expose internal fields", async () => {
      const returnDoc = await Return.create({
        returnNumber: `RET-SER-${Date.now()}`,
        orderId: new mongoose.Types.ObjectId(),
        customerId: customerUser._id,
        status: "requested",
        reason: "other",
        items: [
          {
            productId: new mongoose.Types.ObjectId(),
            name: "Serialization Check",
            price: 500,
            originalQuantity: 1,
            requestedQuantity: 1,
            returnAmount: 500
          }
        ],
        totalRefundAmount: 500,
        createdBy: customerUser._id
      });
      cleanupReturnIds.add(returnDoc._id);

      const json = returnDoc.toJSON();
      expect(json.__v).toBeUndefined();
    });

    it("29a. return approval succeeds even if administrative audit insertion fails (isolated failure)", async () => {
      const product = await Product.create({
        name: "Approve Audit Failure Item",
        description: "Desc",
        price: 1200,
        stock: 5,
        category: "Test"
      });
      cleanupProductIds.add(product._id);

      const order = await createDeliveredOrder(customerUser, [
        { product, quantity: 1, price: 1200 }
      ]);

      const createRes = await request(app)
        .post(`/api/v1/orders/${order._id}/returns`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${customerToken}`)
        .send({
          reason: "defective",
          items: [{ productId: product._id.toString(), quantity: 1 }]
        });
      const returnId = createRes.body.data.return._id;
      cleanupReturnIds.add(returnId);

      // Simulate administrative audit log database failure specifically for RETURN_APPROVED
      const auditError = new Error("MongoNetworkError: audit log write timeout");
      vi.spyOn(AdminAuditLog, "create").mockImplementation(async (payload) => {
        if (payload?.eventType === AUDIT_EVENT_TYPES.RETURN_APPROVED) {
          throw auditError;
        }
        return { _id: new mongoose.Types.ObjectId(), ...payload };
      });

      const loggerErrorSpy = vi.spyOn(logger, "error");

      const res = await request(app)
        .patch(`/api/v1/admin/returns/${returnId}/approve`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken}`);

      // Primary business operation MUST succeed with 200
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.return.status).toBe("approved");

      // Verify database record has been updated to approved
      const inDb = await Return.findById(returnId);
      expect(inDb.status).toBe("approved");

      // Verify audit failure was safely logged without exposing secrets
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          err: auditError,
          returnId: returnId.toString(),
          returnNumber: inDb.returnNumber,
          orderId: order._id.toString()
        }),
        "Failed to record administrative audit log for return approval"
      );
    });

    it("29b. return rejection succeeds even if administrative audit insertion fails (isolated failure)", async () => {
      const product = await Product.create({
        name: "Reject Audit Failure Item",
        description: "Desc",
        price: 800,
        stock: 5,
        category: "Test"
      });
      cleanupProductIds.add(product._id);

      const order = await createDeliveredOrder(customerUser, [
        { product, quantity: 1, price: 800 }
      ]);

      const createRes = await request(app)
        .post(`/api/v1/orders/${order._id}/returns`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${customerToken}`)
        .send({
          reason: "changed_mind",
          items: [{ productId: product._id.toString(), quantity: 1 }]
        });
      const returnId = createRes.body.data.return._id;
      cleanupReturnIds.add(returnId);

      // Simulate administrative audit log database failure specifically for RETURN_REJECTED
      const auditError = new Error("MongoNetworkError: audit log write timeout");
      vi.spyOn(AdminAuditLog, "create").mockImplementation(async (payload) => {
        if (payload?.eventType === AUDIT_EVENT_TYPES.RETURN_REJECTED) {
          throw auditError;
        }
        return { _id: new mongoose.Types.ObjectId(), ...payload };
      });

      const loggerErrorSpy = vi.spyOn(logger, "error");

      const res = await request(app)
        .patch(`/api/v1/admin/returns/${returnId}/reject`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken}`)
        .send({ rejectionReason: "Outside 14-day discretionary window" });

      // Primary business operation MUST succeed with 200
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.return.status).toBe("rejected");
      expect(res.body.data.return.rejectionReason).toBe("Outside 14-day discretionary window");

      // Verify database record has been updated to rejected
      const inDb = await Return.findById(returnId);
      expect(inDb.status).toBe("rejected");
      expect(inDb.rejectionReason).toBe("Outside 14-day discretionary window");

      // Verify audit failure was safely logged without exposing secrets
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          err: auditError,
          returnId: returnId.toString(),
          returnNumber: inDb.returnNumber,
          orderId: order._id.toString()
        }),
        "Failed to record administrative audit log for return rejection"
      );
    });

    it("29c. primary return approval mutation failure preserves error and does not invoke audit", async () => {
      const product = await Product.create({
        name: "Approve Mutation Failure Item",
        description: "Desc",
        price: 500,
        stock: 5,
        category: "Test"
      });
      cleanupProductIds.add(product._id);

      const order = await createDeliveredOrder(customerUser, [
        { product, quantity: 1, price: 500 }
      ]);

      const createRes = await request(app)
        .post(`/api/v1/orders/${order._id}/returns`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${customerToken}`)
        .send({
          reason: "defective",
          items: [{ productId: product._id.toString(), quantity: 1 }]
        });
      const returnId = createRes.body.data.return._id;
      cleanupReturnIds.add(returnId);

      // Primary Return.findOneAndUpdate throws a database error
      vi.spyOn(Return, "findOneAndUpdate").mockRejectedValue(
        new Error("MongoError: connection pool destroyed")
      );
      const auditSpy = vi.spyOn(AdminAuditLog, "create");

      const res = await request(app)
        .patch(`/api/v1/admin/returns/${returnId}/approve`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken}`);

      expect(res.status).toBe(500);
      expect(auditSpy).not.toHaveBeenCalled();
    });

    it("29d. primary return rejection mutation failure preserves error and does not invoke audit", async () => {
      const product = await Product.create({
        name: "Reject Mutation Failure Item",
        description: "Desc",
        price: 500,
        stock: 5,
        category: "Test"
      });
      cleanupProductIds.add(product._id);

      const order = await createDeliveredOrder(customerUser, [
        { product, quantity: 1, price: 500 }
      ]);

      const createRes = await request(app)
        .post(`/api/v1/orders/${order._id}/returns`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${customerToken}`)
        .send({
          reason: "changed_mind",
          items: [{ productId: product._id.toString(), quantity: 1 }]
        });
      const returnId = createRes.body.data.return._id;
      cleanupReturnIds.add(returnId);

      // Primary Return.findOneAndUpdate throws a database error
      vi.spyOn(Return, "findOneAndUpdate").mockRejectedValue(
        new Error("MongoError: connection pool destroyed")
      );
      const auditSpy = vi.spyOn(AdminAuditLog, "create");

      const res = await request(app)
        .patch(`/api/v1/admin/returns/${returnId}/reject`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken}`)
        .send({ rejectionReason: "Invalid return reason" });

      expect(res.status).toBe(500);
      expect(auditSpy).not.toHaveBeenCalled();
    });

    it("29e. invalid return status transition remains rejected without attempting audit insertion", async () => {
      const product = await Product.create({
        name: "Invalid Transition Item",
        description: "Desc",
        price: 700,
        stock: 5,
        category: "Test"
      });
      cleanupProductIds.add(product._id);

      const order = await createDeliveredOrder(customerUser, [
        { product, quantity: 1, price: 700 }
      ]);

      const createRes = await request(app)
        .post(`/api/v1/orders/${order._id}/returns`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${customerToken}`)
        .send({
          reason: "defective",
          items: [{ productId: product._id.toString(), quantity: 1 }]
        });
      const returnId = createRes.body.data.return._id;
      cleanupReturnIds.add(returnId);

      // Transition to approved first
      const approveRes = await request(app)
        .patch(`/api/v1/admin/returns/${returnId}/approve`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken}`);
      expect(approveRes.status).toBe(200);

      // Now spy on audit log before attempting invalid rejection
      const auditSpy = vi.spyOn(AdminAuditLog, "create");

      // Attempting to reject an already approved return must fail with 400
      const illegalReject = await request(app)
        .patch(`/api/v1/admin/returns/${returnId}/reject`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken}`)
        .send({ rejectionReason: "Attempt rejection on approved return" });

      expect(illegalReject.status).toBe(400);
      expect(illegalReject.body.error.code).toBe("INVALID_RETURN_STATUS_TRANSITION");
      expect(auditSpy).not.toHaveBeenCalled();
    });
  });
});
