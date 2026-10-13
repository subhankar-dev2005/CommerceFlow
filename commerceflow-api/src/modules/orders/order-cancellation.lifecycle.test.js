import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";
import mongoose from "mongoose";
import Order from "./order.model.js";
import Product from "../products/product.model.js";
import cancelOrder from "./cancel-order.controller.js";
import updateOrderStatus from "./update-order-status.controller.js";
import { compensateOrderRedemption } from "./compensate-order-redemption.js";
import getOrder from "./get-order.controller.js";
import updateShipment from "./update-shipment.controller.js";
import verifyPayment from "../payments/verify-payment.controller.js";
import handleRazorpayWebhook from "../payments/webhook.controller.js";
import CouponReservation from "../coupons/coupon-reservation.model.js";
import CouponUsage from "../coupons/coupon-usage.model.js";
import { env } from "../../config/env.js";
import {
  CUSTOMER_CANCELLATION_REASONS,
  ADMIN_CANCELLATION_REASONS,
  SYSTEM_CANCELLATION_REASONS,
  CANCELLATION_ACTORS
} from "./order-cancellation.constants.js";

const TEST_WEBHOOK_SECRET = env.RAZORPAY_WEBHOOK_SECRET || "test_webhook_secret";
if (!env.RAZORPAY_WEBHOOK_SECRET) {
  env.RAZORPAY_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
}

describe("P1.5.6 — Cancellation Reason End-to-End Audit & Hardening Lifecycle", () => {
  const customerId = "507f1f77bcf86cd799439012";
  const adminId = "507f1f77bcf86cd799439099";
  const orderId = "507f1f77bcf86cd799439011";
  const productId = "507f1f77bcf86cd799439013";

  let mockSession;

  beforeEach(() => {
    vi.restoreAllMocks();

    mockSession = {
      id: "mock-session-lifecycle-test",
      withTransaction: vi.fn(async (fn) => fn()),
      endSession: vi.fn().mockResolvedValue(undefined)
    };

    vi.spyOn(mongoose, "startSession").mockResolvedValue(mockSession);
    vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(1);

    vi.spyOn(Product, "findByIdAndUpdate").mockResolvedValue({ _id: productId, stock: 10 });
    vi.spyOn(Product, "findOneAndUpdate").mockResolvedValue({ _id: productId, stock: 10 });
    vi.spyOn(CouponUsage, "deleteOne").mockResolvedValue({ acknowledged: true, deletedCount: 1 });
    vi.spyOn(CouponReservation, "deleteOne").mockResolvedValue({ acknowledged: true, deletedCount: 1 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createBaseOrder = (overrides = {}) => ({
    _id: orderId,
    user: customerId,
    status: "pending",
    checkoutState: "none",
    items: [
      {
        product: productId,
        name: "Test Product",
        price: 500,
        quantity: 2,
        subtotal: 1000
      }
    ],
    totalQuantity: 2,
    subtotal: 1000,
    shippingAmount: 0,
    taxAmount: 0,
    discountAmount: 0,
    total: 1000,
    payment: {
      provider: "razorpay",
      status: "pending",
      transactionId: "",
      razorpayOrderId: "order_rzp_123"
    },
    shippingAddress: {
      fullName: "Jane Doe",
      phone: "1234567890",
      addressLine1: "123 Main St",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
      country: "India"
    },
    shipment: null,
    cancellation: null,
    save: vi.fn().mockResolvedValue(true),
    ...overrides
  });

  describe("1. Actor Taxonomy & Metadata Invariants", () => {
    it("verifies all three actors are defined in CANCELLATION_ACTORS", () => {
      expect(CANCELLATION_ACTORS).toContain("customer");
      expect(CANCELLATION_ACTORS).toContain("admin");
      expect(CANCELLATION_ACTORS).toContain("system");
      expect(CANCELLATION_ACTORS.length).toBe(3);
    });

    it("verifies permitted cancellation reason sets remain frozen and restricted", () => {
      expect(Object.isFrozen(CUSTOMER_CANCELLATION_REASONS)).toBe(true);
      expect(Object.isFrozen(ADMIN_CANCELLATION_REASONS)).toBe(true);
      expect(Object.isFrozen(SYSTEM_CANCELLATION_REASONS)).toBe(true);
      expect(SYSTEM_CANCELLATION_REASONS).toEqual(["system_checkout_failure"]);
    });
  });

  describe("2. Customer Cancellation Lifecycle & Atomicity", () => {
    it("performs atomic write of status and metadata with server-enforced actor", async () => {
      const order = createBaseOrder();
      vi.spyOn(Order, "findById").mockResolvedValue(order);

      let capturedSet = null;
      vi.spyOn(Order, "findOneAndUpdate").mockImplementation((query, update) => {
        if (update.$set?.cancellation) {
          capturedSet = update.$set;
        }
        return Promise.resolve({
          ...order,
          status: update.$set?.status || order.status,
          cancellation: update.$set?.cancellation || order.cancellation
        });
      });

      const req = {
        params: { orderId },
        user: { _id: customerId },
        body: {
          reason: "changed_mind",
          reasonDetail: "Decided not to purchase",
          cancelledBy: "admin", // Client injection attempt
          cancelledAt: new Date("2020-01-01T00:00:00.000Z") // Client injection attempt
        },
        requestId: "req-cust-1"
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await cancelOrder(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);

      // Verify atomic write in a single $set transition
      expect(capturedSet).toBeDefined();
      expect(capturedSet.status).toBe("cancelled");
      expect(capturedSet.cancellation).toEqual({
        reason: "changed_mind",
        reasonDetail: "Decided not to purchase",
        cancelledBy: "customer", // Server forced
        cancelledAt: expect.any(Date) // Server forced Date, not client injected 2020
      });
      expect(capturedSet.cancellation.cancelledAt.getFullYear()).toBeGreaterThanOrEqual(2026);

      // Verify stock restored exactly once
      expect(Product.findByIdAndUpdate).toHaveBeenCalledTimes(1);
      expect(Product.findByIdAndUpdate).toHaveBeenCalledWith(
        productId,
        { $inc: { stock: 2 } },
        { session: mockSession }
      );
    });
  });

  describe("3. Admin Cancellation Lifecycle & Atomicity", () => {
    it("performs atomic write of status and metadata with server-enforced actor", async () => {
      const order = createBaseOrder({ status: "confirmed" });

      let capturedSet = null;
      vi.spyOn(Order, "findOneAndUpdate").mockImplementation((query, update) => {
        if (update.$set?.cancellation) {
          capturedSet = update.$set;
        }
        return Promise.resolve({
          ...order,
          status: update.$set?.status || order.status,
          cancellation: update.$set?.cancellation || order.cancellation
        });
      });

      const req = {
        params: { orderId },
        body: {
          status: "cancelled",
          reason: "fraud_suspected",
          reasonDetail: "Suspicious velocity",
          cancelledBy: "customer", // Client injection attempt
          cancelledAt: new Date("2020-01-01T00:00:00.000Z") // Client injection attempt
        },
        requestId: "req-admin-1"
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await updateOrderStatus(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);

      expect(capturedSet).toBeDefined();
      expect(capturedSet.status).toBe("cancelled");
      expect(capturedSet.cancellation).toEqual({
        reason: "fraud_suspected",
        reasonDetail: "Suspicious velocity",
        cancelledBy: "admin", // Server forced
        cancelledAt: expect.any(Date)
      });
      expect(capturedSet.cancellation.cancelledAt.getFullYear()).toBeGreaterThanOrEqual(2026);

      expect(Product.findByIdAndUpdate).toHaveBeenCalledTimes(1);
      expect(Product.findByIdAndUpdate).toHaveBeenCalledWith(
        productId,
        { $inc: { stock: 2 } },
        { session: mockSession }
      );
    });
  });

  describe("4. System Compensation Cancellation Lifecycle & Atomicity", () => {
    it("performs atomic write of status and metadata with system actor", async () => {
      const order = createBaseOrder();
      vi.spyOn(Order, "findById").mockReturnValue({
        select: vi.fn().mockResolvedValue(order)
      });

      const findOneAndUpdateSpy = vi.spyOn(Order, "findOneAndUpdate").mockResolvedValue({
        ...order,
        status: "cancelled",
        cancellation: {
          reason: "system_checkout_failure",
          reasonDetail: "",
          cancelledBy: "system",
          cancelledAt: new Date()
        }
      });
      vi.spyOn(Order, "findByIdAndUpdate").mockResolvedValue(true);

      const result = await compensateOrderRedemption({
        createdOrder: order
      });

      expect(result.isFullyCompensated).toBe(true);
      expect(findOneAndUpdateSpy).toHaveBeenCalledWith(
        {
          _id: orderId,
          status: { $ne: "cancelled" }
        },
        {
          $set: {
            status: "cancelled",
            cancellation: {
              reason: "system_checkout_failure",
              reasonDetail: "",
              cancelledBy: "system",
              cancelledAt: expect.any(Date)
            }
          }
        },
        { returnDocument: "after" }
      );
    });
  });

  describe("5. Immutability & Cross-Actor Protection", () => {
    it("admin cannot overwrite customer cancellation metadata or double-restore stock", async () => {
      const customerCancelledAt = new Date("2026-02-15T10:00:00.000Z");
      const customerCancelledOrder = createBaseOrder({
        status: "cancelled",
        cancellation: {
          reason: "changed_mind",
          reasonDetail: "Customer cancelled previously",
          cancelledBy: "customer",
          cancelledAt: customerCancelledAt
        }
      });

      vi.spyOn(Order, "findOneAndUpdate").mockResolvedValue(null);
      vi.spyOn(Order, "findById").mockResolvedValue(customerCancelledOrder);

      const req = {
        params: { orderId },
        body: {
          status: "cancelled",
          reason: "fraud_suspected",
          reasonDetail: "Admin overwrite attempt"
        },
        requestId: "req-immut-1"
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await updateOrderStatus(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          code: "INVALID_ORDER_STATUS_TRANSITION"
        })
      );
      expect(customerCancelledOrder.cancellation.cancelledBy).toBe("customer");
      expect(customerCancelledOrder.cancellation.reason).toBe("changed_mind");
      expect(customerCancelledOrder.cancellation.cancelledAt).toEqual(customerCancelledAt);
      expect(Product.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it("customer cannot overwrite admin cancellation metadata or double-restore stock", async () => {
      const adminCancelledAt = new Date("2026-02-16T14:00:00.000Z");
      const adminCancelledOrder = createBaseOrder({
        status: "cancelled",
        cancellation: {
          reason: "item_unavailable",
          reasonDetail: "Warehouse shortage",
          cancelledBy: "admin",
          cancelledAt: adminCancelledAt
        }
      });

      vi.spyOn(Order, "findById").mockResolvedValue(adminCancelledOrder);
      vi.spyOn(Order, "findOneAndUpdate");

      const req = {
        params: { orderId },
        user: { _id: customerId },
        body: {
          reason: "ordered_by_mistake"
        },
        requestId: "req-immut-2"
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await cancelOrder(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          code: "ORDER_ALREADY_CANCELLED"
        })
      );
      expect(Order.findOneAndUpdate).not.toHaveBeenCalled();
      expect(adminCancelledOrder.cancellation.cancelledBy).toBe("admin");
      expect(adminCancelledOrder.cancellation.reason).toBe("item_unavailable");
      expect(adminCancelledOrder.cancellation.cancelledAt).toEqual(adminCancelledAt);
      expect(Product.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it("system compensation preserves existing customer cancellation metadata without overwrite", async () => {
      const customerCancelledAt = new Date("2026-02-17T09:00:00.000Z");
      const customerCancelledOrder = createBaseOrder({
        status: "cancelled",
        checkoutState: "none",
        cancellation: {
          reason: "delivery_too_slow",
          reasonDetail: "Took too long",
          cancelledBy: "customer",
          cancelledAt: customerCancelledAt
        }
      });

      vi.spyOn(Order, "findById").mockImplementation(() => ({
        select: () => Promise.resolve(customerCancelledOrder),
        then: (resolve, reject) => Promise.resolve(customerCancelledOrder).then(resolve, reject)
      }));

      const res = await compensateOrderRedemption({ orderId });
      expect(res.isFullyCompensated).toBe(true);
      expect(customerCancelledOrder.cancellation.cancelledBy).toBe("customer");
      expect(customerCancelledOrder.cancellation.reason).toBe("delivery_too_slow");
      expect(customerCancelledOrder.cancellation.cancelledAt).toEqual(customerCancelledAt);
    });

    it("system compensation preserves existing admin cancellation metadata without overwrite", async () => {
      const adminCancelledAt = new Date("2026-02-18T11:00:00.000Z");
      const adminCancelledOrder = createBaseOrder({
        status: "cancelled",
        checkoutState: "none",
        cancellation: {
          reason: "payment_dispute",
          reasonDetail: "Chargeback dispute initiated",
          cancelledBy: "admin",
          cancelledAt: adminCancelledAt
        }
      });

      vi.spyOn(Order, "findById").mockImplementation(() => ({
        select: () => Promise.resolve(adminCancelledOrder),
        then: (resolve, reject) => Promise.resolve(adminCancelledOrder).then(resolve, reject)
      }));

      const res = await compensateOrderRedemption({ orderId });
      expect(res.isFullyCompensated).toBe(true);
      expect(adminCancelledOrder.cancellation.cancelledBy).toBe("admin");
      expect(adminCancelledOrder.cancellation.reason).toBe("payment_dispute");
      expect(adminCancelledOrder.cancellation.cancelledAt).toEqual(adminCancelledAt);
    });
  });

  describe("6. Payment Rejection & Safety on Cancelled Orders", () => {
    it("verifyPayment rejects a customer-cancelled order and cannot revive status or payment", async () => {
      const cancelledOrder = createBaseOrder({
        status: "cancelled",
        cancellation: {
          reason: "changed_mind",
          reasonDetail: "",
          cancelledBy: "customer",
          cancelledAt: new Date("2026-02-01T00:00:00.000Z")
        }
      });

      vi.spyOn(Order, "findOne").mockResolvedValue(cancelledOrder);

      const req = {
        params: { orderId },
        user: { _id: customerId },
        body: {
          razorpayPaymentId: "pay_123",
          razorpayOrderId: "order_rzp_123",
          razorpaySignature: "sig_123"
        },
        requestId: "req-pay-1"
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await verifyPayment(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          code: "ORDER_CANCELLED",
          message: "Cannot verify payment for a cancelled order"
        })
      );
      expect(cancelledOrder.payment.status).toBe("pending");
      expect(cancelledOrder.status).toBe("cancelled");
      expect(cancelledOrder.save).not.toHaveBeenCalled();
    });

    it("handleRazorpayWebhook rejects payment.captured for a system-compensated order", async () => {
      const cancelledOrder = createBaseOrder({
        status: "cancelled",
        cancellation: {
          reason: "system_checkout_failure",
          reasonDetail: "",
          cancelledBy: "system",
          cancelledAt: new Date("2026-02-01T00:00:00.000Z")
        }
      });

      vi.spyOn(Order, "findOne").mockResolvedValue(cancelledOrder);

      const payload = {
        id: "evt_123",
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_123",
              order_id: "order_rzp_123",
              amount: 100000,
              currency: "INR"
            }
          }
        }
      };

      const rawBody = Buffer.from(JSON.stringify(payload));
      const signature = crypto
        .createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET)
        .update(rawBody)
        .digest("hex");

      const req = {
        headers: { "x-razorpay-signature": signature },
        rawBody,
        requestId: "req-webhook-1"
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await handleRazorpayWebhook(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: "ORDER_CANCELLED",
            message: "Cannot process payment for a cancelled order"
          })
        })
      );
      expect(cancelledOrder.payment.status).toBe("pending");
      expect(cancelledOrder.status).toBe("cancelled");
      expect(cancelledOrder.save).not.toHaveBeenCalled();
    });
  });

  describe("7. Shipment Rejection & Safety on Cancelled Orders", () => {
    it("updateShipment rejects a cancelled order and cannot mutate or revive it", async () => {
      const cancelledOrder = createBaseOrder({
        status: "cancelled",
        cancellation: {
          reason: "admin_request",
          reasonDetail: "",
          cancelledBy: "admin",
          cancelledAt: new Date("2026-02-01T00:00:00.000Z")
        }
      });

      vi.spyOn(Order, "findById").mockResolvedValue(cancelledOrder);

      const req = {
        params: { orderId },
        user: { _id: adminId, role: "admin" },
        body: {
          carrier: "Blue Dart",
          trackingNumber: "BD999999",
          status: "in_transit"
        },
        requestId: "req-ship-1"
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await updateShipment(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          code: "ORDER_CANCELLED",
          message: "Cannot update shipment for a cancelled order"
        })
      );
      expect(cancelledOrder.shipment).toBeNull();
      expect(cancelledOrder.status).toBe("cancelled");
      expect(cancelledOrder.save).not.toHaveBeenCalled();
    });
  });

  describe("8. Legacy Cancelled Orders (null or missing cancellation metadata)", () => {
    it("getOrder serializes legacy cancelled orders with cancellation: null without crashing", async () => {
      const legacyCancelledOrder = createBaseOrder({
        status: "cancelled",
        cancellation: null
      });

      vi.spyOn(Order, "findById").mockReturnValue({
        populate: vi.fn().mockResolvedValue(legacyCancelledOrder)
      });

      const req = {
        params: { orderId },
        user: { _id: customerId, role: "customer" },
        requestId: "req-get-legacy"
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await getOrder(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: { order: legacyCancelledOrder }
        })
      );
      expect(legacyCancelledOrder.cancellation).toBeNull();
    });

    it("cancelOrder rejects legacy cancelled order without overwriting or restoring stock", async () => {
      const legacyCancelledOrder = createBaseOrder({
        status: "cancelled",
        cancellation: null
      });

      vi.spyOn(Order, "findById").mockResolvedValue(legacyCancelledOrder);
      vi.spyOn(Order, "findOneAndUpdate");

      const req = {
        params: { orderId },
        user: { _id: customerId },
        body: { reason: "changed_mind" },
        requestId: "req-cust-legacy"
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await cancelOrder(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          code: "ORDER_ALREADY_CANCELLED"
        })
      );
      expect(Order.findOneAndUpdate).not.toHaveBeenCalled();
      expect(legacyCancelledOrder.cancellation).toBeNull();
      expect(Product.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it("updateOrderStatus rejects legacy cancelled order transition", async () => {
      const legacyCancelledOrder = createBaseOrder({
        status: "cancelled",
        cancellation: null
      });

      vi.spyOn(Order, "findOneAndUpdate").mockResolvedValue(null);
      vi.spyOn(Order, "findById").mockResolvedValue(legacyCancelledOrder);

      const req = {
        params: { orderId },
        body: { status: "cancelled", reason: "item_unavailable" },
        requestId: "req-admin-legacy"
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await updateOrderStatus(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          code: "INVALID_ORDER_STATUS_TRANSITION"
        })
      );
      expect(legacyCancelledOrder.cancellation).toBeNull();
      expect(Product.findByIdAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe("9. Concurrent Races & Exactly-Once Inventory Restoration", () => {
    it("concurrent customer cancellations guarantee single winner and exactly-once stock restoration", async () => {
      const order = createBaseOrder();

      vi.spyOn(Order, "findById").mockResolvedValue(order);
      let winnerChosen = false;
      vi.spyOn(Order, "findOneAndUpdate").mockImplementation((query) => {
        if (query.status === "cancelled") {
          return Promise.resolve({ ...order, status: "cancelled" });
        }
        if (query.status && query.status.$nin) {
          if (!winnerChosen) {
            winnerChosen = true;
            return Promise.resolve({ ...order, status: "cancelled" });
          }
          return Promise.resolve(null);
        }
        return Promise.resolve(null);
      });

      const req1 = {
        params: { orderId },
        user: { _id: customerId },
        body: { reason: "changed_mind" },
        requestId: "req-race-c1"
      };
      const res1 = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next1 = vi.fn();

      const req2 = {
        params: { orderId },
        user: { _id: customerId },
        body: { reason: "ordered_by_mistake" },
        requestId: "req-race-c2"
      };
      const res2 = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next2 = vi.fn();

      await Promise.all([
        cancelOrder(req1, res1, next1),
        cancelOrder(req2, res2, next2)
      ]);

      expect(res1.status).toHaveBeenCalledWith(200);
      expect(next2).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          code: "ORDER_ALREADY_CANCELLED"
        })
      );

      // Exactly once stock restoration
      expect(Product.findByIdAndUpdate).toHaveBeenCalledTimes(1);
      expect(Product.findByIdAndUpdate).toHaveBeenCalledWith(
        productId,
        { $inc: { stock: 2 } },
        { session: mockSession }
      );
    });

    it("concurrent admin cancellations guarantee single winner and exactly-once stock restoration", async () => {
      const order = createBaseOrder({ status: "processing" });

      let winnerChosen = false;
      vi.spyOn(Order, "findOneAndUpdate").mockImplementation((query) => {
        if (query.status === "cancelled") {
          return Promise.resolve({ ...order, status: "cancelled" });
        }
        if (query.status && query.status.$in) {
          if (!winnerChosen) {
            winnerChosen = true;
            return Promise.resolve({ ...order, status: "cancelled" });
          }
          return Promise.resolve(null);
        }
        return Promise.resolve(null);
      });

      vi.spyOn(Order, "findById").mockResolvedValue({ ...order, status: "cancelled" });

      const req1 = {
        params: { orderId },
        body: { status: "cancelled", reason: "item_unavailable" },
        requestId: "req-race-a1"
      };
      const res1 = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next1 = vi.fn();

      const req2 = {
        params: { orderId },
        body: { status: "cancelled", reason: "fraud_suspected" },
        requestId: "req-race-a2"
      };
      const res2 = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next2 = vi.fn();

      await Promise.all([
        updateOrderStatus(req1, res1, next1),
        updateOrderStatus(req2, res2, next2)
      ]);

      expect(res1.status).toHaveBeenCalledWith(200);
      expect(next2).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          code: "INVALID_ORDER_STATUS_TRANSITION"
        })
      );

      // Exactly once stock restoration
      expect(Product.findByIdAndUpdate).toHaveBeenCalledTimes(1);
      expect(Product.findByIdAndUpdate).toHaveBeenCalledWith(
        productId,
        { $inc: { stock: 2 } },
        { session: mockSession }
      );
    });
  });
});
