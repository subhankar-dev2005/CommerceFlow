import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import generateToken from "../../utils/generate-token.js";

const app = createApp();
import Refund from "./refund.model.js";
import FinancialLedger from "./financial-ledger.model.js";
import Order from "../orders/order.model.js";
import Return from "../returns/return.model.js";
import AdminAuditLog from "../audit/admin-audit-log.model.js";
import User from "../users/user.model.js";
import razorpay from "../payments/razorpay.service.js";
import { toPaise } from "../../utils/pricing.js";

describe("Payment Refunds & Financial Safety Gate Suite", () => {
  const adminId = "507f1f77bcf86cd799439011";
  const customerId = "507f1f77bcf86cd799439022";
  const orderId = "507f1f77bcf86cd799439033";
  const returnIdA = "507f1f77bcf86cd799439044";
  const returnIdB = "507f1f77bcf86cd799439055";

  const adminUser = {
    _id: adminId,
    email: "admin-safety@commerceflow.dev",
    role: "admin",
    name: "Financial Safety Officer"
  };

  const customerUser = {
    _id: customerId,
    email: "customer-safety@commerceflow.dev",
    role: "customer",
    name: "Legitimate Customer"
  };

  let adminToken;
  let customerToken;

  beforeEach(() => {
    adminToken = generateToken({
      userId: adminId,
      email: adminUser.email,
      role: adminUser.role
    });
    customerToken = generateToken({
      userId: customerId,
      email: customerUser.email,
      role: customerUser.role
    });

    vi.spyOn(User, "findById").mockImplementation(async (id) => {
      const idStr = id?.toString();
      if (idStr === adminId) return adminUser;
      if (idStr === customerId) return customerUser;
      return null;
    });

    vi.spyOn(Refund, "findOne").mockResolvedValue(null);
    vi.spyOn(Refund, "findOneAndUpdate").mockImplementation(async (query, update) => ({
      _id: query._id,
      status: "reconciliation_required",
      save: vi.fn().mockResolvedValue(true),
      ...(update?.$set || {})
    }));
    vi.spyOn(Refund, "aggregate").mockResolvedValue([{ total: 0 }]);
    vi.spyOn(Order, "findOneAndUpdate").mockImplementation(async (query) => ({
      _id: query._id,
      __v: (query.__v || 0) + 1
    }));
    vi.spyOn(Return, "findByIdAndUpdate").mockResolvedValue({});
    vi.spyOn(FinancialLedger, "create").mockResolvedValue({});
    vi.spyOn(AdminAuditLog, "create").mockResolvedValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // SECTION 2: Concurrency Reservation & Paused Interleaving
  // =========================================================================
  describe("Section 2: Concurrency-Safe Durable Reservation & Paused Interleaving", () => {
    it("proves Request A pauses after reservation, blocking Request B from exceeding balance", async () => {
      const mockReturnA = {
        _id: returnIdA,
        returnNumber: "RET-PAUSE-A",
        orderId,
        customerId,
        status: "completed",
        totalRefundAmount: 600
      };
      const mockReturnB = {
        _id: returnIdB,
        returnNumber: "RET-PAUSE-B",
        orderId,
        customerId,
        status: "completed",
        totalRefundAmount: 400
      };
      const mockOrder = {
        _id: orderId,
        user: customerId,
        total: 800, // Captured ceiling is 800
        refundSummary: { totalRefunded: 0, totalRefundedPaise: 0, totalReserved: 0, totalReservedPaise: 0 },
        payment: { status: "paid", transactionId: "pay_concurrency_123" }
      };

      vi.spyOn(Return, "findById").mockImplementation(async (id) => {
        if (id?.toString() === returnIdA) return mockReturnA;
        if (id?.toString() === returnIdB) return mockReturnB;
        return null;
      });
      vi.spyOn(Order, "findById").mockResolvedValue(mockOrder);

      // Model durable state on Order:
      // Request A reserves 600 -> totalReserved becomes 600.
      // When Request B tries to reserve 400 -> 600 + 400 = 1000 > 800 -> rejected!
      let orderReservedPaise = 0;
      vi.spyOn(Order, "findOneAndUpdate").mockImplementation(async (query, update) => {
        const amountInPaise = update?.$inc?.["refundSummary.totalReservedPaise"] || 0;
        if (orderReservedPaise + amountInPaise > toPaise(mockOrder.total)) {
          return null; // Atomic ceiling violation
        }
        orderReservedPaise += amountInPaise;
        return {
          _id: orderId,
          __v: 1,
          refundSummary: { totalReservedPaise: orderReservedPaise }
        };
      });

      // Pause Request A after reservation by delaying Refund.create
      let pauseResolver;
      let hitPauseResolver;
      const hitPausePromise = new Promise((resolve) => { hitPauseResolver = resolve; });
      const pausePromise = new Promise((resolve) => { pauseResolver = resolve; });

      vi.spyOn(Refund, "create").mockImplementation(async (doc) => {
        if (doc.returnId?.toString() === returnIdA) {
          hitPauseResolver();
          await pausePromise; // Request A pauses here!
        }
        return { ...doc, _id: "ref_created_123", save: vi.fn().mockResolvedValue(true) };
      });
      vi.spyOn(razorpay.payments, "refund").mockResolvedValue({ id: "rfnd_razorpay_succ", status: "processed" });

      // Start Request A (600) and dispatch it
      const resAPromise = request(app)
        .post(`/api/v1/admin/refunds/returns/${returnIdA}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({})
        .then((res) => res);

      // Explicitly wait until Request A has reserved on Order and paused at Refund.create
      await hitPausePromise;

      // While Request A is paused, dispatch Request B (400) for the second return on the same order
      // Request B should immediately fail because 600 + 400 > 800 ceiling!
      const resB = await request(app)
        .post(`/api/v1/admin/refunds/returns/${returnIdB}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});

      expect([400, 409]).toContain(resB.status);
      expect(["REFUND_EXCEEDS_REMAINING_BALANCE", "CONCURRENT_FINANCIAL_OPERATION_CONFLICT"]).toContain(resB.body.error.code);

      // Now resume Request A
      pauseResolver();
      const resA = await resAPromise;
      expect(resA.status).toBe(201);
      expect(resA.body.data.refund.amount).toBe(600);
    });

    it("rejects simultaneous requests for two different returns when combined amount exceeds balance", async () => {
      const mockOrder = {
        _id: orderId,
        user: customerId,
        total: 500,
        payment: { status: "paid", transactionId: "pay_simultaneous_ceiling" }
      };
      const mockReturnA = { _id: returnIdA, orderId, status: "completed", totalRefundAmount: 300 };
      const mockReturnB = { _id: returnIdB, orderId, status: "completed", totalRefundAmount: 300 };

      vi.spyOn(Order, "findById").mockResolvedValue(mockOrder);
      vi.spyOn(Return, "findById").mockImplementation(async (id) => {
        if (id?.toString() === returnIdA) return mockReturnA;
        if (id?.toString() === returnIdB) return mockReturnB;
        return null;
      });

      let orderReservedPaise = 0;
      vi.spyOn(Order, "findOneAndUpdate").mockImplementation(async (query, update) => {
        const amountInPaise = update?.$inc?.["refundSummary.totalReservedPaise"] || 0;
        if (orderReservedPaise + amountInPaise > toPaise(mockOrder.total)) {
          return null;
        }
        orderReservedPaise += amountInPaise;
        return { _id: orderId, __v: 1 };
      });
      vi.spyOn(Refund, "create").mockImplementation(async (doc) => ({
        ...doc, _id: "ref_sim", save: vi.fn().mockResolvedValue(true)
      }));
      vi.spyOn(razorpay.payments, "refund").mockResolvedValue({ id: "rfnd_sim_1", status: "processed" });

      const [res1, res2] = await Promise.all([
        request(app).post(`/api/v1/admin/refunds/returns/${returnIdA}`).set("Authorization", `Bearer ${adminToken}`).send({}),
        request(app).post(`/api/v1/admin/refunds/returns/${returnIdB}`).set("Authorization", `Bearer ${adminToken}`).send({})
      ]);

      const statuses = [res1.status, res2.status];
      expect(statuses).toContain(201);
      expect(statuses.some((s) => s === 400 || s === 409)).toBe(true); // Exactly one succeeded, one rejected!
    });
  });

  // =========================================================================
  // SECTION 3: Captured Money Ceiling & Pricing Policy
  // =========================================================================
  describe("Section 3: Verified Captured Amount & Integer Arithmetic Integrity", () => {
    it("strictly bounds refund ceiling to verified order.payment.capturedAmount when differing from order.total", async () => {
      const mockOrder = {
        _id: orderId,
        user: customerId,
        total: 1000, // naive total says 1000
        payment: {
          status: "paid",
          transactionId: "pay_captured_diff",
          capturedAmount: 700, // authoritative captured payment was only 700!
          capturedAmountPaise: 70000
        }
      };
      const mockReturn = {
        _id: returnIdA,
        orderId,
        status: "completed",
        totalRefundAmount: 750 // requests 750 (which would be < 1000, but > 700 captured ceiling)
      };

      vi.spyOn(Order, "findById").mockResolvedValue(mockOrder);
      vi.spyOn(Return, "findById").mockResolvedValue(mockReturn);

      const res = await request(app)
        .post(`/api/v1/admin/refunds/returns/${returnIdA}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("REFUND_EXCEEDS_REMAINING_BALANCE");
      expect(res.body.error.details[0].capturedCeiling).toBe(700);
    });

    it("treats non-refundable shipping fee as excluded from partial return calculations", async () => {
      // Order: Subtotal 1000, Shipping 100, Total 1100.
      // Item 1 returned: unit price 500, quantity 1.
      // Documented policy: shipping fee is consumed fulfillment charge and non-refundable on partial returns.
      const mockOrder = {
        _id: orderId,
        user: customerId,
        subtotal: 1000,
        shippingAmount: 100,
        total: 1100,
        items: [{ product: "507f1f77bcf86cd799439099", name: "Widget", price: 500, quantity: 2 }],
        status: "delivered",
        __v: 0
      };

      vi.spyOn(Order, "findById").mockResolvedValue(mockOrder);
      vi.spyOn(Return, "find").mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
      vi.spyOn(Order, "findOneAndUpdate").mockResolvedValue({ ...mockOrder, __v: 1 });

      let returnPayload = null;
      vi.spyOn(Return, "create").mockImplementation(async (doc) => {
        returnPayload = doc;
        return { _id: returnIdA, ...doc };
      });

      const res = await request(app)
        .post(`/api/v1/orders/${orderId}/returns`)
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          reason: "defective",
          items: [{ productId: "507f1f77bcf86cd799439099", quantity: 1 }]
        });

      expect(res.status).toBe(201);
      // Only the item's 500 is refundable, not shipping!
      expect(returnPayload.totalRefundAmount).toBe(500);
    });

    it("preserves integer paise conservation without IEEE-754 floating point rounding drift", () => {
      const amounts = [33.33, 66.67, 99.99, 100.01];
      for (const amt of amounts) {
        const paise = toPaise(amt);
        expect(Number.isInteger(paise)).toBe(true);
        expect(paise).toBe(Math.round(amt * 100));
      }
    });
  });

  // =========================================================================
  // SECTION 4: Ambiguous Gateway Outcomes & Safe Reconciliation
  // =========================================================================
  describe("Section 4: Ambiguous Gateway Outcomes & Reconciliation Completeness", () => {
    it("rejects reconciliation resolution when gateway refund list is incomplete/paginated (count > items)", async () => {
      const reconcileDoc = {
        _id: "507f1f77bcf86cd799439088",
        refundNumber: "RFND-PAGINATED-TEST",
        orderId,
        returnId: returnIdA,
        customerId,
        amount: 500,
        amountInPaise: 50000,
        currency: "INR",
        gatewayPaymentId: "pay_paginated_123",
        status: "reconciliation_required",
        save: vi.fn().mockResolvedValue(true)
      };

      vi.spyOn(Refund, "findById").mockResolvedValue(reconcileDoc);
      vi.spyOn(Order, "findById").mockResolvedValue({ _id: orderId, total: 500 });
      vi.spyOn(Return, "findById").mockResolvedValue({ _id: returnIdA });

      // Razorpay reports count: 25, but items returned: 10 (incomplete/paginated!)
      vi.spyOn(razorpay.payments, "fetchMultipleRefund").mockResolvedValue({
        count: 25,
        items: [] // No match found in first page, but more pages exist!
      });

      const res = await request(app)
        .post(`/api/v1/admin/refunds/${reconcileDoc._id}/reconcile`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(502);
      expect(res.body.error.code).toBe("RECONCILIATION_INCOMPLETE");
      // Must remain in reconciliation_required!
      expect(reconcileDoc.status).toBe("reconciliation_required");
    });

    it("prevents two administrators from reconciling the same refund concurrently", async () => {
      const reconcileDoc = {
        _id: "507f1f77bcf86cd799439099",
        orderId,
        status: "reconciliation_required"
      };

      vi.spyOn(Refund, "findById").mockResolvedValue(reconcileDoc);
      // First admin acquires isReconciling lock; second admin fails to acquire lock
      vi.spyOn(Refund, "findOneAndUpdate").mockResolvedValue(null);

      const res = await request(app)
        .post(`/api/v1/admin/refunds/${reconcileDoc._id}/reconcile`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("RECONCILIATION_IN_PROGRESS");
    });

    it("blocks retry attempts while status is reconciliation_required with 409 conflict", async () => {
      const blockedRefund = {
        _id: "507f1f77bcf86cd799439077",
        status: "reconciliation_required"
      };
      vi.spyOn(Refund, "findById").mockResolvedValue(blockedRefund);

      const res = await request(app)
        .post(`/api/v1/admin/refunds/${blockedRefund._id}/retry`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("REFUND_RECONCILIATION_REQUIRED");
    });
  });

  // =========================================================================
  // SECTION 5: Fault-Injection & Total Database Write Failure Recovery
  // =========================================================================
  describe("Section 5: Total Post-Gateway Persistence Failure Recovery", () => {
    it("recovers intent after process stops immediately following gateway success without saving gatewayRefundId", async () => {
      const preDispatchedRefund = {
        _id: "507f1f77bcf86cd799439033",
        refundNumber: "RFND-CRASH-PREDISPATCH",
        orderId,
        returnId: returnIdA,
        customerId,
        amount: 450,
        amountInPaise: 45000,
        currency: "INR",
        gatewayPaymentId: "pay_crash_test",
        gatewayRefundId: null, // process crashed before this was ever saved!
        status: "pending",
        save: vi.fn().mockResolvedValue(true)
      };

      vi.spyOn(Refund, "findById").mockResolvedValue(preDispatchedRefund);
      vi.spyOn(Order, "findById").mockResolvedValue({ _id: orderId, total: 450 });
      vi.spyOn(Return, "findById").mockResolvedValue({ _id: returnIdA });
      vi.spyOn(Return, "findByIdAndUpdate").mockResolvedValue(true);
      vi.spyOn(FinancialLedger, "create").mockResolvedValue(true);
      vi.spyOn(AdminAuditLog, "create").mockResolvedValue(true);

      // Gateway authoritative list contains the refund matching by receipt:
      vi.spyOn(razorpay.payments, "fetchMultipleRefund").mockResolvedValue({
        count: 1,
        items: [
          {
            id: "rfnd_crash_discovered_999",
            receipt: "RFND-CRASH-PREDISPATCH",
            amount: 45000,
            status: "processed"
          }
        ]
      });

      const res = await request(app)
        .post(`/api/v1/admin/refunds/${preDispatchedRefund._id}/reconcile`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.outcome).toBe("succeeded");
      expect(preDispatchedRefund.status).toBe("succeeded");
      expect(preDispatchedRefund.gatewayRefundId).toBe("rfnd_crash_discovered_999");
    });

    it("re-running reconciliation multiple times creates zero duplicate financial ledger events", async () => {
      const alreadySucceededRefund = {
        _id: "507f1f77bcf86cd799439011",
        status: "succeeded",
        amount: 300,
        gatewayRefundId: "rfnd_already_done"
      };

      vi.spyOn(Refund, "findById").mockResolvedValue(alreadySucceededRefund);
      const ledgerCreateSpy = vi.spyOn(FinancialLedger, "create");

      const res = await request(app)
        .post(`/api/v1/admin/refunds/${alreadySucceededRefund._id}/reconcile`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.reconciled).toBe(true);
      expect(res.body.data.outcome).toBe("succeeded");
      // Zero duplicate ledger events!
      expect(ledgerCreateSpy).not.toHaveBeenCalled();
    });
  });
});
