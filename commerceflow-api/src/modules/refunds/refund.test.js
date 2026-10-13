import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi
} from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../../app.js";
import Refund from "./refund.model.js";
import FinancialLedger from "./financial-ledger.model.js";
import Order from "../orders/order.model.js";
import Return from "../returns/return.model.js";
import User from "../users/user.model.js";
import AdminAuditLog from "../audit/admin-audit-log.model.js";
import { AUDIT_EVENT_TYPES } from "../audit/admin-audit.service.js";
import { logger } from "../../config/logger.js";
import razorpay from "../payments/razorpay.service.js";
import generateToken from "../../utils/generate-token.js";
import {
  REFUND_STATUSES,
  ALLOWED_REFUND_TRANSITIONS,
  LEDGER_EVENT_TYPES,
  LEDGER_DIRECTIONS
} from "./refund.constants.js";
import { isValidRefundTransition } from "./refund.service.js";

describe("Payment Refunds & Financial Ledger Subsystem", () => {
  let app;
  let adminUser;
  let customerUser;
  let adminToken;
  let customerToken;

  const adminId = "507f1f77bcf86cd799439001";
  const customerId = "507f1f77bcf86cd799439002";
  const orderId = "507f1f77bcf86cd799439003";
  const returnId = "507f1f77bcf86cd799439004";
  const productId = "507f1f77bcf86cd799439005";

  beforeEach(() => {
    vi.restoreAllMocks();
    app = createApp();

    adminUser = {
      _id: adminId,
      name: "Admin User",
      email: "admin@commerceflow.com",
      role: "admin",
      status: "active",
      isActive: true
    };

    customerUser = {
      _id: customerId,
      name: "Customer User",
      email: "customer@example.com",
      role: "customer",
      status: "active",
      isActive: true
    };

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

  // 1 & 2. Ledger Entry Creation and Immutable Behavior
  describe("1 & 2. Financial Ledger Model & Immutability", () => {
    it("1. creates immutable ledger entries with explicit currencies and smallest units", () => {
      const entry = new FinancialLedger({
        orderId,
        returnId,
        customerId,
        eventType: LEDGER_EVENT_TYPES.PAYMENT_REFUND_REQUESTED,
        direction: LEDGER_DIRECTIONS.DEBIT,
        amount: 2500,
        amountInPaise: 250000,
        currency: "INR",
        gateway: "razorpay",
        gatewayPaymentId: "pay_test123",
        idempotencyKey: `ledger:test:${Date.now()}`,
        status: "pending",
        actorType: "admin",
        actorId: adminId
      });

      expect(entry.currency).toBe("INR");
      expect(entry.amount).toBe(2500);
      expect(entry.amountInPaise).toBe(250000);
      expect(entry.eventType).toBe("PAYMENT_REFUND_REQUESTED");
      expect(entry.direction).toBe("debit");
    });

    it("2. strictly rejects mutations or updates on existing FinancialLedger records", async () => {
      const entry = new FinancialLedger({
        orderId,
        returnId,
        customerId,
        eventType: LEDGER_EVENT_TYPES.PAYMENT_REFUNDED,
        direction: LEDGER_DIRECTIONS.DEBIT,
        amount: 1000,
        amountInPaise: 100000,
        currency: "INR",
        gateway: "razorpay",
        idempotencyKey: "ledger:test:immutable",
        status: "succeeded",
        actorType: "admin"
      });

      // Emulate document is not new
      entry.isNew = false;
      await expect(entry.save()).rejects.toThrow(
        "FinancialLedger records are strictly immutable and cannot be updated after creation."
      );
    });
  });

  // 3 & 4. Server-Authoritative Amount and Currency Correctness
  describe("3 & 4. Server-Authoritative Amount & Currency", () => {
    it("3. derives refund amount from persisted Return.totalRefundAmount without trusting client values", async () => {
      const mockReturn = {
        _id: returnId,
        returnNumber: "RET-20261010-001",
        orderId,
        customerId,
        status: "completed",
        totalRefundAmount: 3499,
        items: [{ price: 3499, requestedQuantity: 1, inventoryRestored: true }]
      };

      const mockOrder = {
        _id: orderId,
        user: customerId,
        total: 3499,
        payment: {
          status: "paid",
          transactionId: "pay_authoritative_123"
        },
        save: vi.fn().mockResolvedValue(true)
      };

      vi.spyOn(Return, "findById").mockResolvedValue(mockReturn);
      vi.spyOn(Order, "findById").mockResolvedValue(mockOrder);
      vi.spyOn(Refund, "findOne").mockResolvedValue(null);
      vi.spyOn(Refund, "create").mockImplementation(async (data) => ({
        _id: "507f1f77bcf86cd799439099",
        ...data,
        save: vi.fn().mockResolvedValue(true)
      }));
      vi.spyOn(FinancialLedger, "create").mockResolvedValue(true);
      vi.spyOn(Return, "findByIdAndUpdate").mockResolvedValue(mockReturn);
      vi.spyOn(AdminAuditLog, "create").mockResolvedValue(true);
      vi.spyOn(Refund, "aggregate").mockResolvedValue([{ total: 0 }]);

      vi.spyOn(razorpay.payments, "refund").mockResolvedValue({
        id: "rfnd_razorpay_999",
        amount: 349900,
        currency: "INR",
        status: "processed"
      });

      const res = await request(app)
        .post(`/api/v1/admin/refunds/returns/${returnId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          reasonDetail: "Inspection complete"
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.refund.amount).toBe(3499);
      expect(res.body.data.refund.amountInPaise).toBe(349900);
      expect(res.body.data.refund.currency).toBe("INR");
    });

    it("4. rejects refund if Return.totalRefundAmount is zero or non-numeric", async () => {
      const mockReturn = {
        _id: returnId,
        returnNumber: "RET-20261010-002",
        orderId,
        customerId,
        status: "completed",
        totalRefundAmount: 0 // Invalid refund amount
      };

      const mockOrder = {
        _id: orderId,
        user: customerId,
        payment: { status: "paid", transactionId: "pay_valid" }
      };

      vi.spyOn(Return, "findById").mockResolvedValue(mockReturn);
      vi.spyOn(Order, "findById").mockResolvedValue(mockOrder);

      const res = await request(app)
        .post(`/api/v1/admin/refunds/returns/${returnId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_REFUND_AMOUNT");
    });
  });

  // 5 & 6. Client Input Manipulation Rejected
  describe("5 & 6. Client Parameter Manipulation Rejected", () => {
    it("5. rejects client-supplied refund amount in request body", async () => {
      const res = await request(app)
        .post(`/api/v1/admin/refunds/returns/${returnId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          amount: 50000 // Attempting to inject amount
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("6. rejects client-supplied refund status in request body", async () => {
      const res = await request(app)
        .post(`/api/v1/admin/refunds/returns/${returnId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          status: "succeeded" // Attempting to fake success
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  // 7 & 8. Authentication & Authorization Controls
  describe("7 & 8. Authentication and Admin Authorization", () => {
    it("7. rejects unauthenticated requests with 401 UNAUTHORIZED", async () => {
      const res = await request(app).get("/api/v1/admin/refunds");
      expect(res.status).toBe(401);
    });

    it("8. rejects customer users attempting to access admin refund routes with 403 FORBIDDEN", async () => {
      const res = await request(app)
        .get("/api/v1/admin/refunds")
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });
  });

  // 9 & 10. Refund State Machine Transitions
  describe("9 & 10. Refund State Machine Invariants", () => {
    it("9. permits only legal transitions in the refund lifecycle", () => {
      expect(isValidRefundTransition("requested", "pending")).toBe(true);
      expect(isValidRefundTransition("requested", "failed")).toBe(true);
      expect(isValidRefundTransition("pending", "succeeded")).toBe(true);
      expect(isValidRefundTransition("pending", "failed")).toBe(true);
      expect(isValidRefundTransition("failed", "pending")).toBe(true); // retry
    });

    it("10. strictly forbids illegal transitions and mutations on succeeded refunds", () => {
      expect(isValidRefundTransition("succeeded", "pending")).toBe(false);
      expect(isValidRefundTransition("succeeded", "failed")).toBe(false);
      expect(isValidRefundTransition("requested", "succeeded")).toBe(false);
      expect(ALLOWED_REFUND_TRANSITIONS.succeeded).toEqual([]);
    });
  });

  // 11, 12 & 13. Idempotency and Concurrency Protection
  describe("11, 12 & 13. Idempotency & Concurrency Safety", () => {
    it("11. uses deterministic idempotency key for RMA returns", async () => {
      const mockReturn = {
        _id: returnId,
        returnNumber: "RET-20261010-001",
        orderId,
        status: "completed",
        totalRefundAmount: 1500
      };
      const mockOrder = {
        _id: orderId,
        user: customerId,
        total: 1500,
        payment: { status: "paid", transactionId: "pay_111" },
        save: vi.fn().mockResolvedValue(true)
      };

      vi.spyOn(Return, "findById").mockResolvedValue(mockReturn);
      vi.spyOn(Order, "findById").mockResolvedValue(mockOrder);

      let capturedKey = null;
      vi.spyOn(Refund, "findOne").mockResolvedValue(null);
      vi.spyOn(Refund, "create").mockImplementation(async (doc) => {
        capturedKey = doc.idempotencyKey;
        return { ...doc, _id: "ref_11", save: vi.fn().mockResolvedValue(true) };
      });
      vi.spyOn(FinancialLedger, "create").mockResolvedValue(true);
      vi.spyOn(Return, "findByIdAndUpdate").mockResolvedValue(mockReturn);
      vi.spyOn(AdminAuditLog, "create").mockResolvedValue(true);
      vi.spyOn(Refund, "aggregate").mockResolvedValue([{ total: 0 }]);
      vi.spyOn(razorpay.payments, "refund").mockResolvedValue({ id: "rfnd_11", status: "processed" });

      await request(app)
        .post(`/api/v1/admin/refunds/returns/${returnId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});

      expect(capturedKey).toBe(`rma-refund:${returnId}`);
    });

    it("12. returns existing authoritative result on repeated duplicate refund requests", async () => {
      const mockReturn = {
        _id: returnId,
        orderId,
        status: "completed",
        totalRefundAmount: 1500
      };
      const mockOrder = {
        _id: orderId,
        payment: { status: "paid", transactionId: "pay_111" }
      };

      const existingSucceededRefund = {
        _id: "507f1f77bcf86cd799439088",
        refundNumber: "RFND-20261010-EXISTING",
        status: "succeeded",
        amount: 1500,
        gatewayRefundId: "rfnd_existing_123"
      };

      vi.spyOn(Return, "findById").mockResolvedValue(mockReturn);
      vi.spyOn(Order, "findById").mockResolvedValue(mockOrder);
      vi.spyOn(Refund, "findOne").mockResolvedValue(existingSucceededRefund);
      const gatewayRefundSpy = vi.spyOn(razorpay.payments, "refund");

      const res = await request(app)
        .post(`/api/v1/admin/refunds/returns/${returnId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(201);
      expect(res.body.data.refund.refundNumber).toBe("RFND-20261010-EXISTING");
      // Never issues a duplicate gateway refund!
      expect(gatewayRefundSpy).not.toHaveBeenCalled();
    });

    it("13. handles concurrent race condition via database uniqueness and prevents double-refund", async () => {
      const mockReturn = {
        _id: returnId,
        orderId,
        status: "completed",
        totalRefundAmount: 2000
      };
      const mockOrder = {
        _id: orderId,
        total: 2000,
        payment: { status: "paid", transactionId: "pay_222" }
      };

      vi.spyOn(Return, "findById").mockResolvedValue(mockReturn);
      vi.spyOn(Order, "findById").mockResolvedValue(mockOrder);
      vi.spyOn(Refund, "findOne")
        .mockResolvedValueOnce(null) // first check
        .mockResolvedValueOnce({ status: "succeeded", refundNumber: "RFND-RACED" }); // check after race

      // Simulate MongoDB duplicate key error code 11000
      const duplicateKeyError = new Error("E11000 duplicate key error");
      duplicateKeyError.code = 11000;
      vi.spyOn(Refund, "create").mockRejectedValue(duplicateKeyError);

      const gatewayRefundSpy = vi.spyOn(razorpay.payments, "refund");

      const res = await request(app)
        .post(`/api/v1/admin/refunds/returns/${returnId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(201);
      expect(res.body.data.refund.refundNumber).toBe("RFND-RACED");
      expect(gatewayRefundSpy).not.toHaveBeenCalled();
    });
  });

  // 14 & 15. Gateway Success and Failure Persistence
  describe("14 & 15. Gateway Outcome Persistence", () => {
    it("14. persists gateway refund success, saves gatewayRefundId, and updates Return refundStatus", async () => {
      const mockReturn = {
        _id: returnId,
        returnNumber: "RET-20261010-SUCC",
        orderId,
        status: "completed",
        totalRefundAmount: 1200
      };
      const mockOrder = {
        _id: orderId,
        user: customerId,
        total: 1200,
        payment: { status: "paid", transactionId: "pay_succ" },
        save: vi.fn().mockResolvedValue(true)
      };

      vi.spyOn(Return, "findById").mockResolvedValue(mockReturn);
      vi.spyOn(Order, "findById").mockResolvedValue(mockOrder);
      vi.spyOn(Refund, "findOne").mockResolvedValue(null);

      const savedRefund = {
        _id: "507f1f77bcf86cd799439077",
        refundNumber: "RFND-20261010-0077",
        amount: 1200,
        amountInPaise: 120000,
        currency: "INR",
        status: "requested",
        save: vi.fn().mockResolvedValue(true)
      };
      vi.spyOn(Refund, "create").mockResolvedValue(savedRefund);
      vi.spyOn(FinancialLedger, "create").mockResolvedValue(true);
      const returnUpdateSpy = vi.spyOn(Return, "findByIdAndUpdate").mockResolvedValue(mockReturn);
      vi.spyOn(AdminAuditLog, "create").mockResolvedValue(true);
      vi.spyOn(Refund, "aggregate").mockResolvedValue([{ total: 0 }]);

      vi.spyOn(razorpay.payments, "refund").mockResolvedValue({
        id: "rfnd_verified_12345",
        status: "processed",
        speed_processed: "instant"
      });

      const res = await request(app)
        .post(`/api/v1/admin/refunds/returns/${returnId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(201);
      expect(savedRefund.status).toBe("succeeded");
      expect(savedRefund.gatewayRefundId).toBe("rfnd_verified_12345");
      expect(returnUpdateSpy).toHaveBeenCalledWith(
        returnId,
        expect.objectContaining({ refundStatus: "succeeded" })
      );
    });

    it("15. persists gateway refund failure, records failureReason, and updates Return refundStatus to failed", async () => {
      const mockReturn = {
        _id: returnId,
        returnNumber: "RET-20261010-FAIL",
        orderId,
        status: "completed",
        totalRefundAmount: 800
      };
      const mockOrder = {
        _id: orderId,
        user: customerId,
        total: 800,
        payment: { status: "paid", transactionId: "pay_fail" }
      };

      vi.spyOn(Return, "findById").mockResolvedValue(mockReturn);
      vi.spyOn(Order, "findById").mockResolvedValue(mockOrder);
      vi.spyOn(Refund, "findOne").mockResolvedValue(null);

      const savedRefund = {
        _id: "507f1f77bcf86cd799439066",
        refundNumber: "RFND-20261010-0066",
        amount: 800,
        amountInPaise: 80000,
        currency: "INR",
        status: "requested",
        retryCount: 0,
        save: vi.fn().mockResolvedValue(true)
      };
      vi.spyOn(Refund, "create").mockResolvedValue(savedRefund);
      vi.spyOn(FinancialLedger, "create").mockResolvedValue(true);
      const returnUpdateSpy = vi.spyOn(Return, "findByIdAndUpdate").mockResolvedValue(mockReturn);
      vi.spyOn(AdminAuditLog, "create").mockResolvedValue(true);

      const gatewayError = new Error("Gateway declined transaction: Insufficient merchant balance");
      gatewayError.error = { code: "BAD_REQUEST_ERROR", description: "Insufficient merchant balance" };
      vi.spyOn(razorpay.payments, "refund").mockRejectedValue(gatewayError);

      const res = await request(app)
        .post(`/api/v1/admin/refunds/returns/${returnId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(502);
      expect(savedRefund.status).toBe("failed");
      expect(savedRefund.failureReason).toContain("Insufficient merchant balance");
      expect(returnUpdateSpy).toHaveBeenCalledWith(
        returnId,
        expect.objectContaining({ refundStatus: "failed" })
      );
    });
  });

  // 16, 17 & 18. Timeout, Already-Refunded Response, and Post-Success DB Failure
  describe("16, 17 & 18. Resilience, Deduplication & Authoritative Reconciliation", () => {
    it("16. enters reconciliation_required state upon network timeout (never ordinary retryable failed)", async () => {
      const mockReturn = {
        _id: returnId,
        orderId,
        status: "completed",
        totalRefundAmount: 500
      };
      const mockOrder = {
        _id: orderId,
        user: customerId,
        total: 500,
        __v: 0,
        payment: { status: "paid", transactionId: "pay_timeout" }
      };

      vi.spyOn(Return, "findById").mockResolvedValue(mockReturn);
      vi.spyOn(Order, "findById").mockResolvedValue(mockOrder);
      vi.spyOn(Order, "findOneAndUpdate").mockResolvedValue({ ...mockOrder, __v: 1 });
      vi.spyOn(Refund, "aggregate").mockResolvedValue([]);
      vi.spyOn(Refund, "findOne").mockResolvedValue(null);

      const savedRefund = {
        _id: "507f1f77bcf86cd799439055",
        refundNumber: "RFND-20261010-TIMEOUT",
        amount: 500,
        amountInPaise: 50000,
        currency: "INR",
        status: "requested",
        retryCount: 0,
        save: vi.fn().mockResolvedValue(true)
      };
      vi.spyOn(Refund, "create").mockResolvedValue(savedRefund);
      vi.spyOn(FinancialLedger, "create").mockResolvedValue(true);
      const returnUpdateSpy = vi.spyOn(Return, "findByIdAndUpdate").mockResolvedValue(mockReturn);
      vi.spyOn(AdminAuditLog, "create").mockResolvedValue(true);

      const timeoutError = new Error("ETIMEDOUT: Connection to payment gateway timed out");
      timeoutError.code = "ETIMEDOUT";
      vi.spyOn(razorpay.payments, "refund").mockRejectedValue(timeoutError);

      const res = await request(app)
        .post(`/api/v1/admin/refunds/returns/${returnId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(504);
      expect(savedRefund.status).toBe("reconciliation_required");
      expect(savedRefund.failureReason).toContain("AMBIGUOUS_GATEWAY_OUTCOME");
      expect(returnUpdateSpy).toHaveBeenCalledWith(
        returnId,
        expect.objectContaining({ refundStatus: "reconciliation_required" })
      );
    });

    it("17. blocks admin retry when refund status is reconciliation_required with 409 conflict", async () => {
      const reconcileRequiredRefund = {
        _id: "507f1f77bcf86cd799439088",
        status: "reconciliation_required",
        failureReason: "AMBIGUOUS_GATEWAY_OUTCOME: ETIMEDOUT"
      };
      vi.spyOn(Refund, "findById").mockResolvedValue(reconcileRequiredRefund);

      const res = await request(app)
        .post(`/api/v1/admin/refunds/${reconcileRequiredRefund._id}/retry`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("REFUND_RECONCILIATION_REQUIRED");
    });

    it("18a. operator reconciliation resolves authoritative gateway refund to succeeded when match found on gateway", async () => {
      const reconcileRefundDoc = {
        _id: "507f1f77bcf86cd799439077",
        refundNumber: "RFND-20261010-RECON",
        orderId,
        returnId,
        customerId,
        amount: 800,
        amountInPaise: 80000,
        currency: "INR",
        gatewayPaymentId: "pay_recon_123",
        status: "reconciliation_required",
        save: vi.fn().mockResolvedValue(true)
      };

      const mockOrder = {
        _id: orderId,
        user: customerId,
        total: 800,
        payment: { status: "paid" },
        save: vi.fn().mockResolvedValue(true)
      };
      const mockReturn = {
        _id: returnId,
        returnNumber: "RET-RECON"
      };

      vi.spyOn(Refund, "findById").mockResolvedValue(reconcileRefundDoc);
      vi.spyOn(Order, "findById").mockResolvedValue(mockOrder);
      vi.spyOn(Return, "findById").mockResolvedValue(mockReturn);
      vi.spyOn(Return, "findByIdAndUpdate").mockResolvedValue(mockReturn);
      vi.spyOn(FinancialLedger, "create").mockResolvedValue(true);
      vi.spyOn(AdminAuditLog, "create").mockResolvedValue(true);
      vi.spyOn(Refund, "aggregate").mockResolvedValue([{ total: 800 }]);

      vi.spyOn(razorpay.payments, "fetchMultipleRefund").mockResolvedValue({
        items: [
          {
            id: "rfnd_reconciled_gateway_888",
            receipt: "RFND-20261010-RECON",
            amount: 80000,
            status: "processed"
          }
        ]
      });

      const res = await request(app)
        .post(`/api/v1/admin/refunds/${reconcileRefundDoc._id}/reconcile`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.outcome).toBe("succeeded");
      expect(reconcileRefundDoc.status).toBe("succeeded");
      expect(reconcileRefundDoc.gatewayRefundId).toBe("rfnd_reconciled_gateway_888");
    });

    it("18b. operator reconciliation resolves to failed when confirmed absent on gateway, enabling safe retry", async () => {
      const reconcileRefundDoc = {
        _id: "507f1f77bcf86cd799439066",
        refundNumber: "RFND-20261010-ABSENT",
        orderId,
        returnId,
        customerId,
        amount: 800,
        amountInPaise: 80000,
        currency: "INR",
        gatewayPaymentId: "pay_absent_123",
        status: "reconciliation_required",
        save: vi.fn().mockResolvedValue(true)
      };

      vi.spyOn(Refund, "findById").mockResolvedValue(reconcileRefundDoc);
      vi.spyOn(Order, "findById").mockResolvedValue({ _id: orderId, total: 800 });
      vi.spyOn(Return, "findById").mockResolvedValue({ _id: returnId });
      vi.spyOn(Return, "findByIdAndUpdate").mockResolvedValue(true);
      vi.spyOn(FinancialLedger, "create").mockResolvedValue(true);
      vi.spyOn(AdminAuditLog, "create").mockResolvedValue(true);

      // Gateway returns no refund for this receipt
      vi.spyOn(razorpay.payments, "fetchMultipleRefund").mockResolvedValue({
        items: []
      });

      const res = await request(app)
        .post(`/api/v1/admin/refunds/${reconcileRefundDoc._id}/reconcile`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.outcome).toBe("failed");
      expect(reconcileRefundDoc.status).toBe("failed");
    });

    it("18c. post-gateway success database failure enters reconciliation_required and retains gatewayRefundId", async () => {
      const mockReturn = {
        _id: returnId,
        orderId,
        status: "completed",
        totalRefundAmount: 1000
      };
      const mockOrder = {
        _id: orderId,
        user: customerId,
        total: 1000,
        __v: 0,
        payment: { status: "paid", transactionId: "pay_db_crash" }
      };

      vi.spyOn(Return, "findById").mockResolvedValue(mockReturn);
      vi.spyOn(Order, "findById").mockResolvedValue(mockOrder);
      vi.spyOn(Order, "findOneAndUpdate").mockResolvedValue({ ...mockOrder, __v: 1 });
      vi.spyOn(Refund, "aggregate").mockResolvedValue([]);
      vi.spyOn(Refund, "findOne").mockResolvedValue(null);

      const savedRefund = {
        _id: "507f1f77bcf86cd799439044",
        refundNumber: "RFND-POST-CRASH",
        amount: 1000,
        amountInPaise: 100000,
        currency: "INR",
        status: "requested",
        save: vi.fn()
          .mockResolvedValueOnce(true) // pending save
          .mockRejectedValueOnce(new Error("MongoNetworkError: connection closed during save")) // success save throws!
      };
      vi.spyOn(Refund, "create").mockResolvedValue(savedRefund);
      const refundUpdateSpy = vi.spyOn(Refund, "findByIdAndUpdate").mockResolvedValue(true);

      // Razorpay refund successfully creates rfnd_crash_recovered
      vi.spyOn(razorpay.payments, "refund").mockResolvedValue({
        id: "rfnd_crash_recovered_777",
        status: "processed"
      });

      const res = await request(app)
        .post(`/api/v1/admin/refunds/returns/${returnId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe("REFUND_RECONCILIATION_REQUIRED");
      expect(refundUpdateSpy).toHaveBeenCalledWith(
        savedRefund._id,
        expect.objectContaining({
          $set: expect.objectContaining({
            status: "reconciliation_required",
            gatewayRefundId: "rfnd_crash_recovered_777"
          })
        })
      );
    });

    it("18d. two same-amount returns for identical items produce distinct refunds and do NOT reuse first gateway refund ID (P0-2)", async () => {
      const mockReturn2 = {
        _id: "507f1f77bcf86cd799439022",
        orderId,
        status: "completed",
        totalRefundAmount: 500
      };
      const mockOrder = {
        _id: orderId,
        user: customerId,
        total: 1000,
        __v: 1,
        payment: { status: "paid", transactionId: "pay_same_amount" },
        save: vi.fn().mockResolvedValue(true)
      };

      vi.spyOn(Return, "findById").mockResolvedValue(mockReturn2);
      vi.spyOn(Order, "findById").mockResolvedValue(mockOrder);
      vi.spyOn(Order, "findOneAndUpdate").mockResolvedValue({ ...mockOrder, __v: 2 });
      vi.spyOn(Refund, "aggregate").mockResolvedValue([{ total: 500 }]); // previous refund consumed 500
      vi.spyOn(Refund, "findOne").mockResolvedValue(null);

      const savedRefund2 = {
        _id: "507f1f77bcf86cd799439033",
        refundNumber: "RFND-SECOND-RETURN",
        amount: 500,
        amountInPaise: 50000,
        currency: "INR",
        status: "requested",
        save: vi.fn().mockResolvedValue(true)
      };
      vi.spyOn(Refund, "create").mockResolvedValue(savedRefund2);
      vi.spyOn(FinancialLedger, "create").mockResolvedValue(true);
      vi.spyOn(Return, "findByIdAndUpdate").mockResolvedValue(mockReturn2);
      vi.spyOn(AdminAuditLog, "create").mockResolvedValue(true);

      // Razorpay reports an existing refund with amount 50000 but a DIFFERENT receipt!
      vi.spyOn(razorpay.payments, "fetchMultipleRefund").mockResolvedValue({
        items: [
          {
            id: "rfnd_first_item_already_refunded",
            receipt: "RFND-FIRST-RETURN",
            amount: 50000,
            status: "processed"
          }
        ]
      });

      // Must call payments.refund to issue a NEW refund for the second return!
      const gatewayRefundSpy = vi.spyOn(razorpay.payments, "refund").mockResolvedValue({
        id: "rfnd_second_item_new_123",
        status: "processed"
      });

      const res = await request(app)
        .post(`/api/v1/admin/refunds/returns/${mockReturn2._id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(201);
      // It must NOT have reused rfnd_first_item_already_refunded!
      expect(gatewayRefundSpy).toHaveBeenCalled();
      expect(savedRefund2.gatewayRefundId).toBe("rfnd_second_item_new_123");
    });

    it("18e. gateway and ledger success remains successful when administrative audit insert fails (isolated failure)", async () => {
      const mockReturn = {
        _id: returnId,
        orderId,
        status: "completed",
        totalRefundAmount: 1500
      };
      const mockOrder = {
        _id: orderId,
        user: customerId,
        total: 1500,
        __v: 0,
        payment: { status: "paid", transactionId: "pay_audit_fail_test" },
        save: vi.fn().mockResolvedValue(true)
      };

      vi.spyOn(Return, "findById").mockResolvedValue(mockReturn);
      vi.spyOn(Order, "findById").mockResolvedValue(mockOrder);
      vi.spyOn(Order, "findOneAndUpdate").mockResolvedValue({ ...mockOrder, __v: 1 });
      vi.spyOn(Refund, "aggregate").mockResolvedValue([]);
      vi.spyOn(Refund, "findOne").mockResolvedValue(null);

      const savedRefund = {
        _id: "507f1f77bcf86cd799439055",
        refundNumber: "RFND-AUDIT-FAIL-ISOLATE",
        amount: 1500,
        amountInPaise: 150000,
        currency: "INR",
        status: "requested",
        save: vi.fn().mockResolvedValue(true)
      };
      vi.spyOn(Refund, "create").mockResolvedValue(savedRefund);
      const ledgerSpy = vi.spyOn(FinancialLedger, "create").mockResolvedValue(true);
      const returnUpdateSpy = vi.spyOn(Return, "findByIdAndUpdate").mockResolvedValue(mockReturn);

      // Audit log throws a simulated persistence failure ONLY for post-gateway REFUND_SUCCEEDED
      const auditError = new Error("MongoNetworkError: connection timed out during audit write");
      vi.spyOn(AdminAuditLog, "create").mockImplementation(async (payload) => {
        if (payload?.eventType === AUDIT_EVENT_TYPES.REFUND_SUCCEEDED) {
          throw auditError;
        }
        return { _id: "507f1f77bcf86cd799439099", ...payload };
      });

      const loggerErrorSpy = vi.spyOn(logger, "error");

      vi.spyOn(razorpay.payments, "refund").mockResolvedValue({
        id: "rfnd_gateway_audit_isolated_999",
        status: "processed"
      });

      const res = await request(app)
        .post(`/api/v1/admin/refunds/returns/${returnId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});

      // Financial operation MUST remain successful!
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(savedRefund.status).toBe("succeeded");
      expect(savedRefund.gatewayRefundId).toBe("rfnd_gateway_audit_isolated_999");
      expect(ledgerSpy).toHaveBeenCalled();
      expect(returnUpdateSpy).toHaveBeenCalledWith(
        returnId,
        expect.objectContaining({ refundStatus: "succeeded" })
      );
      // Audit failure is logged safely without exposing sensitive data
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          refundId: savedRefund._id,
          refundNumber: savedRefund.refundNumber,
          gatewayRefundId: "rfnd_gateway_audit_isolated_999"
        }),
        "Failed to record administrative audit log for successful refund"
      );
    });

    it("18f. gateway succeeds but financial ledger persistence failure enters reconciliation_required (genuine financial failure)", async () => {
      const mockReturn = {
        _id: returnId,
        orderId,
        status: "completed",
        totalRefundAmount: 2000
      };
      const mockOrder = {
        _id: orderId,
        user: customerId,
        total: 2000,
        __v: 0,
        payment: { status: "paid", transactionId: "pay_ledger_crash" },
        save: vi.fn().mockResolvedValue(true)
      };

      vi.spyOn(Return, "findById").mockResolvedValue(mockReturn);
      vi.spyOn(Order, "findById").mockResolvedValue(mockOrder);
      vi.spyOn(Order, "findOneAndUpdate").mockResolvedValue({ ...mockOrder, __v: 1 });
      vi.spyOn(Refund, "aggregate").mockResolvedValue([]);
      vi.spyOn(Refund, "findOne").mockResolvedValue(null);

      const savedRefund = {
        _id: "507f1f77bcf86cd799439066",
        refundNumber: "RFND-LEDGER-CRASH",
        amount: 2000,
        amountInPaise: 200000,
        currency: "INR",
        status: "requested",
        save: vi.fn().mockResolvedValue(true)
      };
      vi.spyOn(Refund, "create").mockResolvedValue(savedRefund);
      vi.spyOn(AdminAuditLog, "create").mockResolvedValue(true);
      const refundUpdateSpy = vi.spyOn(Refund, "findByIdAndUpdate").mockResolvedValue(true);

      // Financial ledger persistence throws ONLY for the post-gateway PAYMENT_REFUNDED entry
      vi.spyOn(FinancialLedger, "create").mockImplementation(async (payload) => {
        if (payload?.eventType === LEDGER_EVENT_TYPES.PAYMENT_REFUNDED) {
          throw new Error("MongoError: write concern timeout on ledger collection");
        }
        return { _id: "507f1f77bcf86cd799439088", ...payload };
      });

      vi.spyOn(razorpay.payments, "refund").mockResolvedValue({
        id: "rfnd_ledger_crash_recovered_888",
        status: "processed"
      });

      const res = await request(app)
        .post(`/api/v1/admin/refunds/returns/${returnId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe("REFUND_RECONCILIATION_REQUIRED");
      expect(refundUpdateSpy).toHaveBeenCalledWith(
        savedRefund._id,
        expect.objectContaining({
          $set: expect.objectContaining({
            status: "reconciliation_required",
            gatewayRefundId: "rfnd_ledger_crash_recovered_888"
          })
        })
      );
    });
  });

  // 19. Retry Behavior
  describe("19. Safe Server-Authorized Retry Endpoint", () => {
    it("19a. permits retry of failed refunds and increments retryCount", async () => {
      const failedRefund = {
        _id: "507f1f77bcf86cd799439033",
        refundNumber: "RFND-20261010-RETRY",
        orderId,
        returnId,
        customerId,
        amount: 1500,
        amountInPaise: 150000,
        currency: "INR",
        gatewayPaymentId: "pay_retry",
        status: "failed",
        retryCount: 0,
        save: vi.fn().mockResolvedValue(true)
      };

      vi.spyOn(Refund, "findById").mockResolvedValue(failedRefund);
      vi.spyOn(Refund, "findOneAndUpdate").mockResolvedValue({
        ...failedRefund,
        status: "pending",
        retryCount: 1
      });

      const mockOrder = {
        _id: orderId,
        user: customerId,
        total: 1500,
        payment: { status: "paid", transactionId: "pay_retry" },
        save: vi.fn().mockResolvedValue(true)
      };
      const mockReturn = {
        _id: returnId,
        returnNumber: "RET-RETRY",
        totalRefundAmount: 1500
      };

      vi.spyOn(Order, "findById").mockResolvedValue(mockOrder);
      vi.spyOn(Return, "findById").mockResolvedValue(mockReturn);
      vi.spyOn(Return, "findByIdAndUpdate").mockResolvedValue(mockReturn);
      vi.spyOn(FinancialLedger, "create").mockResolvedValue(true);
      vi.spyOn(AdminAuditLog, "create").mockResolvedValue(true);
      vi.spyOn(Refund, "aggregate").mockResolvedValue([{ total: 1500 }]);

      vi.spyOn(razorpay.payments, "refund").mockResolvedValue({
        id: "rfnd_retry_success",
        status: "processed"
      });

      const res = await request(app)
        .post(`/api/v1/admin/refunds/${failedRefund._id}/retry`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.refund.status).toBe("succeeded");
      expect(res.body.data.refund.gatewayRefundId).toBe("rfnd_retry_success");
    });

    it("19b. rejects retrying terminal succeeded refunds with 400 REFUND_ALREADY_SUCCEEDED", async () => {
      const succeededRefund = {
        _id: "507f1f77bcf86cd799439022",
        status: "succeeded"
      };

      vi.spyOn(Refund, "findById").mockResolvedValue(succeededRefund);

      const res = await request(app)
        .post(`/api/v1/admin/refunds/${succeededRefund._id}/retry`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("REFUND_ALREADY_SUCCEEDED");
    });
  });

  // 20, 21, 22 & 23. RMA Relationship, Discount Allocation & Balance Protection
  describe("20, 21, 22 & 23. RMA Pricing & Balance Integrity", () => {
    it("20. calculates proportional discount allocation for returned items on discounted orders (P0-3)", async () => {
      const discountedOrder = {
        _id: orderId,
        user: customerId,
        items: [
          {
            product: productId,
            name: "Item 1",
            price: 500,
            quantity: 2,
            subtotal: 1000
          }
        ],
        subtotal: 1000,
        discountAmount: 200, // 20% discount applied
        total: 800,          // Paid 800
        status: "delivered",
        __v: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      vi.spyOn(Order, "findById").mockResolvedValue(discountedOrder);
      vi.spyOn(Return, "find").mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
      vi.spyOn(Order, "findOneAndUpdate").mockResolvedValue({ ...discountedOrder, __v: 1 });

      let createdReturnData = null;
      vi.spyOn(Return, "create").mockImplementation(async (doc) => {
        createdReturnData = doc;
        return { _id: returnId, ...doc };
      });

      const res = await request(app)
        .post(`/api/v1/orders/${orderId}/returns`)
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          reason: "size_fit",
          items: [{ productId, quantity: 1 }] // Returning 1 out of 2 units
        });

      expect(res.status).toBe(201);
      // Unit undiscounted price = 500. With 20% discount (200/1000), refundable amount = 400!
      expect(createdReturnData.totalRefundAmount).toBe(400);
      expect(createdReturnData.items[0].returnAmount).toBe(400);
    });

    it("21. does NOT roll back inventory if financial refund fails", async () => {
      const mockReturn = {
        _id: returnId,
        returnNumber: "RET-INDEP-001",
        orderId,
        status: "completed",
        totalRefundAmount: 750,
        items: [{ name: "Test Item", quantity: 1, inventoryRestored: true }]
      };
      const mockOrder = {
        _id: orderId,
        user: customerId,
        total: 1000,
        __v: 0,
        payment: { status: "paid", transactionId: "pay_indep" }
      };

      vi.spyOn(Return, "findById").mockResolvedValue(mockReturn);
      vi.spyOn(Order, "findById").mockResolvedValue(mockOrder);
      vi.spyOn(Order, "findOneAndUpdate").mockResolvedValue({ ...mockOrder, __v: 1 });
      vi.spyOn(Refund, "aggregate").mockResolvedValue([]);
      vi.spyOn(Refund, "findOne").mockResolvedValue(null);

      const savedRefund = {
        _id: "507f1f77bcf86cd799439011",
        amount: 750,
        amountInPaise: 75000,
        currency: "INR",
        status: "requested",
        retryCount: 0,
        save: vi.fn().mockResolvedValue(true)
      };
      vi.spyOn(Refund, "create").mockResolvedValue(savedRefund);
      vi.spyOn(FinancialLedger, "create").mockResolvedValue(true);
      vi.spyOn(Return, "findByIdAndUpdate").mockResolvedValue(mockReturn);
      vi.spyOn(AdminAuditLog, "create").mockResolvedValue(true);

      const clientError = new Error("Invalid merchant credentials");
      clientError.error = { code: "BAD_REQUEST_ERROR", description: "Invalid credentials" };
      vi.spyOn(razorpay.payments, "refund").mockRejectedValue(clientError);

      const res = await request(app)
        .post(`/api/v1/admin/refunds/returns/${returnId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(502);
      expect(mockReturn.items[0].inventoryRestored).toBe(true);
    });

    it("22. rejects refund if amount exceeds order remaining refundable balance (P0-3)", async () => {
      const mockReturn = {
        _id: returnId,
        orderId,
        status: "completed",
        totalRefundAmount: 600
      };
      const mockOrder = {
        _id: orderId,
        user: customerId,
        total: 800,
        payment: { status: "paid", transactionId: "pay_bal_test" }
      };

      vi.spyOn(Return, "findById").mockResolvedValue(mockReturn);
      vi.spyOn(Order, "findById").mockResolvedValue(mockOrder);
      // Prior refunds already consumed 400 of 800. Remaining refundable is 400!
      vi.spyOn(Refund, "aggregate").mockResolvedValue([{ total: 400 }]);

      const res = await request(app)
        .post(`/api/v1/admin/refunds/returns/${returnId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("REFUND_EXCEEDS_REMAINING_BALANCE");
    });

    it("23. rejects concurrent refund attempt if order OCC version conflicts (P0-3)", async () => {
      const mockReturn = {
        _id: returnId,
        orderId,
        status: "completed",
        totalRefundAmount: 200
      };
      const mockOrder = {
        _id: orderId,
        user: customerId,
        total: 800,
        __v: 3,
        payment: { status: "paid", transactionId: "pay_occ_test" }
      };

      vi.spyOn(Return, "findById").mockResolvedValue(mockReturn);
      vi.spyOn(Order, "findById").mockResolvedValue(mockOrder);
      vi.spyOn(Refund, "aggregate").mockResolvedValue([]);
      // Order OCC returns null (simulating concurrent order modification race)
      vi.spyOn(Order, "findOneAndUpdate").mockResolvedValue(null);

      const res = await request(app)
        .post(`/api/v1/admin/refunds/returns/${returnId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("CONCURRENT_FINANCIAL_OPERATION_CONFLICT");
    });
  });

  // 24. Audit Logging & Security
  describe("24. Audit Logging & Security", () => {
    it("24. creates persistent audit events without leaking secrets or credentials", async () => {
      let loggedMetadata = null;
      vi.spyOn(AdminAuditLog, "create").mockImplementation(async (doc) => {
        loggedMetadata = doc.metadata;
        return { _id: "audit_1", ...doc };
      });

      const mockReturn = {
        _id: returnId,
        orderId,
        status: "completed",
        totalRefundAmount: 1100
      };
      const mockOrder = {
        _id: orderId,
        user: customerId,
        total: 1100,
        __v: 0,
        payment: { status: "paid", transactionId: "pay_audit" },
        save: vi.fn().mockResolvedValue(true)
      };

      vi.spyOn(Return, "findById").mockResolvedValue(mockReturn);
      vi.spyOn(Order, "findById").mockResolvedValue(mockOrder);
      vi.spyOn(Order, "findOneAndUpdate").mockResolvedValue({ ...mockOrder, __v: 1 });
      vi.spyOn(Refund, "aggregate").mockResolvedValue([]);
      vi.spyOn(Refund, "findOne").mockResolvedValue(null);
      vi.spyOn(Refund, "create").mockImplementation(async (d) => ({
        ...d,
        _id: "ref_audit_1",
        save: vi.fn().mockResolvedValue(true)
      }));
      vi.spyOn(FinancialLedger, "create").mockResolvedValue(true);
      vi.spyOn(Return, "findByIdAndUpdate").mockResolvedValue(mockReturn);

      vi.spyOn(razorpay.payments, "refund").mockResolvedValue({
        id: "rfnd_audit_success",
        status: "processed"
      });

      await request(app)
        .post(`/api/v1/admin/refunds/returns/${returnId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});

      expect(loggedMetadata).toBeDefined();
      expect(JSON.stringify(loggedMetadata)).not.toContain("secret");
      expect(JSON.stringify(loggedMetadata)).not.toContain("key_secret");
      expect(JSON.stringify(loggedMetadata)).not.toContain("password");
    });
  });

  // 25 & 26. Order Payment State Hardening
  describe("25 & 26. Order Payment State Hardening", () => {
    it("25a. rejects creating payment order if order payment is already refunded", async () => {
      const mockOrder = {
        _id: orderId,
        user: customerId,
        payment: { status: "refunded" }
      };
      vi.spyOn(Order, "findOne").mockResolvedValue(mockOrder);

      const res = await request(app)
        .post(`/api/v1/payments/orders/${orderId}`)
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("ORDER_ALREADY_REFUNDED");
    });

    it("25b. rejects payment verification if order payment is already refunded", async () => {
      const mockOrder = {
        _id: orderId,
        user: customerId,
        payment: { status: "refunded" }
      };
      vi.spyOn(Order, "findOne").mockResolvedValue(mockOrder);

      const res = await request(app)
        .post(`/api/v1/payments/orders/${orderId}/verify`)
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          razorpayPaymentId: "pay_123",
          razorpayOrderId: "order_123",
          razorpaySignature: "sig_123"
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("ORDER_ALREADY_REFUNDED");
    });
  });

  // 27 & 28. Regex Safety, Bounded Pagination, and Mongoose Mutation Guards
  describe("27, 28 & 29. Regex Safety, Pagination & Immutability Guards", () => {
    it("27. safely escapes user search input preventing MongoDB regex ReDoS (P1-3)", async () => {
      let capturedFilter = null;
      vi.spyOn(Refund, "countDocuments").mockImplementation(async (filter) => {
        capturedFilter = filter;
        return 0;
      });
      vi.spyOn(Refund, "find").mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([])
      });

      // Pass dangerous regex metacharacters
      const dangerousSearch = "RFND-[0-9]+.*(test)+";
      const res = await request(app)
        .get(`/api/v1/admin/refunds?search=${encodeURIComponent(dangerousSearch)}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(capturedFilter.$or[0].refundNumber.$regex).toBe("RFND-\\[0-9\\]\\+\\.\\*\\(test\\)\\+");
    });

    it("28. returns bounded pagination and supports status filtering", async () => {
      vi.spyOn(Refund, "countDocuments").mockResolvedValue(1);
      vi.spyOn(Refund, "find").mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([
          {
            _id: "507f1f77bcf86cd799439099",
            refundNumber: "RFND-20261010-PAGINATE",
            amount: 2500,
            currency: "INR",
            status: "succeeded"
          }
        ])
      });

      const res = await request(app)
        .get("/api/v1/admin/refunds?page=1&limit=20&status=succeeded")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.refunds).toHaveLength(1);
      expect(res.body.data.pagination.limit).toBe(20);
      expect(res.body.data.pagination.page).toBe(1);
    });

    it("29. strictly rejects Mongoose update and delete methods on FinancialLedger (P1-1)", async () => {
      const ops = ["updateOne", "updateMany", "findOneAndUpdate", "deleteOne", "deleteMany", "findOneAndDelete"];
      for (const op of ops) {
        await expect(
          FinancialLedger[op]({ _id: "507f1f77bcf86cd799439011" }, {})
        ).rejects.toThrow(/FinancialLedger records are strictly immutable/);
      }
    });
  });
});
