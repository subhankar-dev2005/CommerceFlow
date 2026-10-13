import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from "vitest";
import mongoose from "mongoose";
import Order from "./order.model.js";
import Product from "../products/product.model.js";
import User from "../users/user.model.js";
import AppError from "../../common/errors/app-error.js";
import {
  cancelOrderWithInventoryRestoration,
  reconcileAmbiguousCancellation,
  isUnknownCommitError
} from "./order-cancellation.service.js";
import cancelOrder from "./cancel-order.controller.js";
import updateOrderStatus from "./update-order-status.controller.js";
import * as auditService from "../audit/admin-audit.service.js";
import authorize from "../../common/middleware/authorize.middleware.js";
import { env } from "../../config/env.js";

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

describe("CommerceFlow Stage 5 — Transactional Order Cancellation Suite", () => {
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
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Part A: Unit, Serialization, Protocol & Fault-Injection Tests
  // =========================================================================

  describe("Scenario 10 — Manifest Privacy & Public Serialization Suppression", () => {
    it("excludes cancellationRestoration from order.toJSON() output", () => {
      const order = new Order({
        user: new mongoose.Types.ObjectId(),
        items: [
          {
            product: new mongoose.Types.ObjectId(),
            name: "Alpine Jacket",
            variantId: "var_jacket_m",
            variantName: "Medium / Black",
            sku: "ALP-JCK-M",
            price: 5000,
            quantity: 1,
            subtotal: 5000
          }
        ],
        totalQuantity: 1,
        subtotal: 5000,
        total: 5000,
        payment: { provider: "razorpay", status: "pending" },
        shippingAddress: {
          fullName: "Alex Mercer",
          phone: "9876543210",
          addressLine1: "123 Trailhead",
          city: "Bengaluru",
          state: "Karnataka",
          postalCode: "560001",
          country: "India"
        },
        status: "cancelled",
        cancellation: {
          reason: "customer_request",
          reasonDetail: "Wrong size ordered",
          cancelledBy: "customer",
          cancelledAt: new Date()
        },
        cancellationRestoration: {
          status: "completed",
          items: [
            {
              product: new mongoose.Types.ObjectId(),
              variantId: "var_jacket_m",
              quantity: 1,
              lineIndex: 0,
              status: "restored",
              restoredAt: new Date()
            }
          ],
          completedAt: new Date()
        }
      });

      const json = order.toJSON();
      expect(json.status).toBe("cancelled");
      expect(json.cancellation).toBeDefined();
      expect(json.cancellation.reason).toBe("customer_request");
      expect(json.cancellationRestoration).toBeUndefined();

      const stringified = JSON.stringify(order);
      expect(stringified).not.toContain("cancellationRestoration");
      expect(stringified).not.toContain("restoredAt");
    });
  });

  describe("Scenario 7 — Customer Ownership and Admin Authorization Guards", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it("rejects cancellation when customer does not own the order (403 ORDER_ACCESS_DENIED)", async () => {
      const ownerId = new mongoose.Types.ObjectId();
      const attackerId = new mongoose.Types.ObjectId();

      const mockOrder = {
        _id: new mongoose.Types.ObjectId(),
        user: ownerId,
        status: "pending",
        items: [{ product: new mongoose.Types.ObjectId(), quantity: 1 }]
      };

      vi.spyOn(Order, "findById").mockResolvedValue(mockOrder);

      const req = {
        params: { orderId: mockOrder._id.toString() },
        user: { _id: attackerId },
        requestId: "test-req-auth"
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await cancelOrder(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 403,
          code: "ORDER_ACCESS_DENIED"
        })
      );
      expect(res.status).not.toHaveBeenCalled();
    });

    it("rejects non-admin from using admin order status update (403 FORBIDDEN)", () => {
      const adminMiddleware = authorize("admin");
      const req = {
        user: { _id: new mongoose.Types.ObjectId(), role: "customer" }
      };
      const res = {};
      const next = vi.fn();

      adminMiddleware(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 403,
          code: "FORBIDDEN"
        })
      );
    });
  });

  describe("Scenario 6 — Legacy Cancelled Orders Preservation", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
      vi.spyOn(Product, "findByIdAndUpdate");
      vi.spyOn(Product, "findOneAndUpdate");
    });

    it("returns 400 ORDER_ALREADY_CANCELLED for customer on legacy cancelled order without mutating stock", async () => {
      const userId = new mongoose.Types.ObjectId();
      const legacyOrder = {
        _id: new mongoose.Types.ObjectId(),
        user: userId,
        status: "cancelled",
        cancellation: null,
        cancellationRestoration: null,
        items: [{ product: new mongoose.Types.ObjectId(), quantity: 2 }]
      };

      vi.spyOn(Order, "findById").mockResolvedValue(legacyOrder);

      const req = {
        params: { orderId: legacyOrder._id.toString() },
        user: { _id: userId },
        requestId: "test-req-legacy"
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
      expect(Product.findByIdAndUpdate).not.toHaveBeenCalled();
      expect(Product.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it("returns 400 INVALID_ORDER_STATUS_TRANSITION for admin on legacy cancelled order without mutating stock", async () => {
      const legacyOrder = {
        _id: new mongoose.Types.ObjectId(),
        status: "cancelled",
        cancellation: null,
        cancellationRestoration: null,
        items: [{ product: new mongoose.Types.ObjectId(), quantity: 2 }]
      };

      vi.spyOn(Order, "findOneAndUpdate").mockResolvedValue(null);
      vi.spyOn(Order, "findById").mockResolvedValue(legacyOrder);

      const req = {
        params: { orderId: legacyOrder._id.toString() },
        user: { _id: new mongoose.Types.ObjectId(), role: "admin" },
        body: { status: "cancelled" },
        requestId: "test-req-legacy-admin"
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await updateOrderStatus(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          code: "INVALID_ORDER_STATUS_TRANSITION",
          message: "Cannot change order status from cancelled to cancelled"
        })
      );
      expect(Product.findByIdAndUpdate).not.toHaveBeenCalled();
      expect(Product.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe("Scenario 11 — Audit Failure After Successful Commit Isolation", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it("preserves 200 OK and successful cancellation when post-commit audit write fails", async () => {
      const orderId = new mongoose.Types.ObjectId();
      const updatedOrder = {
        _id: orderId,
        status: "cancelled",
        items: []
      };

      vi.spyOn(Order, "findOneAndUpdate").mockResolvedValue(updatedOrder);
      vi.spyOn(auditService, "recordAdminAuditEvent").mockRejectedValue(
        new Error("Audit database connection dropped")
      );

      const logErrorSpy = vi.fn();
      const req = {
        params: { orderId: orderId.toString() },
        body: { status: "cancelled", reason: "item_unavailable" },
        user: { _id: new mongoose.Types.ObjectId(), role: "admin" },
        log: { error: logErrorSpy },
        requestId: "test-req-audit-fail"
      };

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await updateOrderStatus(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: "Order status updated successfully",
          data: { order: updatedOrder }
        })
      );
      expect(next).not.toHaveBeenCalled();
      expect(logErrorSpy).toHaveBeenCalled();
    });
  });

  describe("Scenario 5 — Transaction Retry Behavior (Fault Injection)", () => {
    it("retries transaction callback when a TransientTransactionError is encountered", async () => {
      const orderId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();
      const productId = new mongoose.Types.ObjectId();

      let attempts = 0;
      const mockSession = {
        id: "mock-session-retry",
        withTransaction: async (fn) => {
          // Attempt 1 fails with transient error, attempt 2 succeeds
          attempts++;
          try {
            await fn();
          } catch (err) {
            if (err.hasErrorLabel && err.hasErrorLabel("TransientTransactionError")) {
              attempts++;
              return await fn();
            }
            throw err;
          }
        },
        endSession: vi.fn()
      };

      const transientError = new Error("WriteConflict in transaction");
      transientError.hasErrorLabel = (label) => label === "TransientTransactionError";

      vi.spyOn(Order, "findById").mockImplementation(() => {
        if (attempts === 1) {
          throw transientError;
        }
        return Promise.resolve({
          _id: orderId,
          user: userId,
          status: "pending",
          items: [{ product: productId, quantity: 1 }]
        });
      });

      vi.spyOn(Order, "findOneAndUpdate").mockResolvedValue({
        _id: orderId,
        status: "cancelled",
        items: [{ product: productId, quantity: 1 }]
      });
      vi.spyOn(Product, "findByIdAndUpdate").mockResolvedValue(true);

      const result = await cancelOrderWithInventoryRestoration({
        orderId: orderId.toString(),
        actor: "customer",
        userId,
        session: mockSession
      });

      expect(attempts).toBe(2);
      expect(result.status).toBe("cancelled");
    });
  });

  describe("Scenario 9 — Ambiguous / Interrupted Commit Outcome Protocol", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
      vi.spyOn(Product, "findByIdAndUpdate");
    });

    it("correctly identifies unknown commit errors via isUnknownCommitError", () => {
      const errorWithLabel = new Error("Commit unknown");
      errorWithLabel.hasErrorLabel = (label) => label === "UnknownTransactionCommitResult";
      expect(isUnknownCommitError(errorWithLabel)).toBe(true);

      const timeoutError = new Error("operation timed out");
      timeoutError.name = "MongoOperationTimeoutError";
      expect(isUnknownCommitError(timeoutError)).toBe(true);

      const standardError = new AppError("Standard validation error", 400);
      expect(isUnknownCommitError(standardError)).toBe(false);
    });

    it("reconciles as success when persisted order and manifest confirm transaction committed", async () => {
      const orderId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();

      const reconciledDoc = {
        _id: orderId,
        user: userId,
        status: "cancelled",
        cancellationRestoration: {
          status: "completed",
          items: [{ product: new mongoose.Types.ObjectId(), quantity: 1, status: "restored" }],
          completedAt: new Date()
        }
      };

      vi.spyOn(Order, "findById").mockReturnValue({
        select: vi.fn().mockResolvedValue(reconciledDoc)
      });

      const order = await reconcileAmbiguousCancellation({
        orderId: orderId.toString(),
        actor: "customer",
        userId
      });

      expect(order).not.toBeNull();
      expect(order.status).toBe("cancelled");
      expect(order.cancellationRestoration.status).toBe("completed");
      expect(Product.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it("returns null when persisted order was not cancelled (inconclusive / aborted)", async () => {
      const orderId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();

      const uncommittedDoc = {
        _id: orderId,
        user: userId,
        status: "pending",
        cancellationRestoration: null
      };

      vi.spyOn(Order, "findById").mockReturnValue({
        select: vi.fn().mockResolvedValue(uncommittedDoc)
      });

      const order = await reconcileAmbiguousCancellation({
        orderId: orderId.toString(),
        actor: "customer",
        userId
      });

      expect(order).toBeNull();
      expect(Product.findByIdAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe("Scenario 12 — Database Unavailability Safeguard", () => {
    it("rejects with 503 DATABASE_UNAVAILABLE when database is unavailable and performs zero writes", async () => {
      const orderId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();

      const readyStateSpy = vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(0);
      const orderFindAndUpdateSpy = vi.spyOn(Order, "findOneAndUpdate");
      const productFindAndUpdateSpy = vi.spyOn(Product, "findOneAndUpdate");
      const productByIdAndUpdateSpy = vi.spyOn(Product, "findByIdAndUpdate");

      let caughtError = null;
      try {
        await cancelOrderWithInventoryRestoration({
          orderId: orderId.toString(),
          actor: "customer",
          userId,
          reason: "changed_mind"
        });
      } catch (err) {
        caughtError = err;
      } finally {
        readyStateSpy.mockRestore();
        orderFindAndUpdateSpy.mockRestore();
        productFindAndUpdateSpy.mockRestore();
        productByIdAndUpdateSpy.mockRestore();
      }

      expect(caughtError).toBeInstanceOf(AppError);
      expect(caughtError.statusCode).toBe(503);
      expect(caughtError.code).toBe("DATABASE_UNAVAILABLE");
      expect(caughtError.message).toContain("Database is unavailable");

      // Verify no order mutation or manifest finalization was performed
      expect(orderFindAndUpdateSpy).not.toHaveBeenCalled();
      // Verify no product or variant stock increment was performed
      expect(productFindAndUpdateSpy).not.toHaveBeenCalled();
      expect(productByIdAndUpdateSpy).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Part B: Real Replica-Set-Backed Integration Tests (Scenarios 1-4, 8)
  //
  // NOTE ON EXECUTION ENVIRONMENT:
  // Multi-document ACID transactions strictly require a MongoDB replica set
  // (e.g. MongoDB Atlas, or local Docker mongod with --replSet rs0).
  // In CI, GHA spins up mongo:7.0 with --replSet rs0.
  // Locally, if run against standalone MongoDB, these tests are cleanly skipped.
  // =========================================================================

  describe.skipIf(!hasReplicaSet)("P1.6.5 Real Replica-Set Integration Tests", () => {
    const testProductIds = new Set();
    const testOrderIds = new Set();
    const testUserIds = new Set();

    afterAll(async () => {
      if (mongoose.connection.readyState !== 0) {
        if (testProductIds.size > 0) {
          await Product.deleteMany({ _id: { $in: Array.from(testProductIds) } });
        }
        if (testOrderIds.size > 0) {
          await Order.deleteMany({ _id: { $in: Array.from(testOrderIds) } });
        }
        if (testUserIds.size > 0) {
          await User.deleteMany({ _id: { $in: Array.from(testUserIds) } });
        }
      }
    });

    it("Scenario 1 — Successfully cancels order restoring both simple product and variant lines", async () => {
      const user = await User.create({
        name: "Test Customer RS",
        email: `rs-test-${Date.now()}@example.com`,
        password: "Password123!"
      });
      testUserIds.add(user._id);

      const simpleProd = await Product.create({
        name: "RS Simple Camp Mug",
        description: "Enamel mug",
        price: 299,
        stock: 20,
        category: "Campware",
        isActive: true
      });
      testProductIds.add(simpleProd._id);

      const variantProd = await Product.create({
        name: "RS Winter Jacket",
        description: "Insulated jacket",
        price: 4999,
        stock: 15,
        category: "Apparel",
        isActive: true,
        variants: [
          {
            variantId: "var_rs_jck_large",
            sku: "RS-JCK-L",
            price: 5499,
            stock: 10,
            isActive: true
          }
        ]
      });
      testProductIds.add(variantProd._id);

      const order = await Order.create({
        user: user._id,
        items: [
          {
            product: simpleProd._id,
            name: simpleProd.name,
            price: 299,
            quantity: 3,
            subtotal: 897
          },
          {
            product: variantProd._id,
            name: variantProd.name,
            variantId: "var_rs_jck_large",
            variantName: "Large",
            sku: "RS-JCK-L",
            price: 5499,
            quantity: 2,
            subtotal: 10998
          }
        ],
        totalQuantity: 5,
        subtotal: 11895,
        total: 11895,
        payment: { provider: "razorpay", status: "pending" },
        shippingAddress: {
          fullName: "RS Tester",
          phone: "9876543210",
          addressLine1: "101 Replica Way",
          city: "Bengaluru",
          state: "Karnataka",
          postalCode: "560001",
          country: "India"
        },
        status: "pending"
      });
      testOrderIds.add(order._id);

      const cancelledOrder = await cancelOrderWithInventoryRestoration({
        orderId: order._id.toString(),
        actor: "customer",
        userId: user._id
      });

      expect(cancelledOrder.status).toBe("cancelled");
      expect(cancelledOrder.cancellation.cancelledBy).toBe("customer");

      // Verify stock was incremented by line quantities
      const refreshedSimple = await Product.findById(simpleProd._id);
      expect(refreshedSimple.stock).toBe(23); // 20 + 3

      const refreshedVariant = await Product.findById(variantProd._id);
      expect(refreshedVariant.variants[0].stock).toBe(12); // 10 + 2

      // Verify persisted restoration manifest
      const persistedOrder = await Order.findById(order._id).select("+cancellationRestoration");
      expect(persistedOrder.cancellationRestoration.status).toBe("completed");
      expect(persistedOrder.cancellationRestoration.items).toHaveLength(2);
      expect(persistedOrder.cancellationRestoration.items[0].status).toBe("restored");
      expect(persistedOrder.cancellationRestoration.items[1].status).toBe("restored");
    });

    it("Scenario 2 — Rolls back entire transaction when a subsequent line item product is missing", async () => {
      const user = await User.create({
        name: "Test Customer Rollback",
        email: `rollback-${Date.now()}@example.com`,
        password: "Password123!"
      });
      testUserIds.add(user._id);

      const validProd = await Product.create({
        name: "Rollback Valid Item",
        description: "Valid item",
        price: 100,
        stock: 50,
        category: "Test",
        isActive: true
      });
      testProductIds.add(validProd._id);

      const missingProdId = new mongoose.Types.ObjectId();

      const order = await Order.create({
        user: user._id,
        items: [
          {
            product: validProd._id,
            name: validProd.name,
            price: 100,
            quantity: 5,
            subtotal: 500
          },
          {
            product: missingProdId,
            name: "Missing Item",
            price: 200,
            quantity: 2,
            subtotal: 400
          }
        ],
        totalQuantity: 7,
        subtotal: 900,
        total: 900,
        payment: { provider: "razorpay", status: "pending" },
        shippingAddress: {
          fullName: "Rollback Tester",
          phone: "9876543210",
          addressLine1: "101 Fail Way",
          city: "Bengaluru",
          state: "Karnataka",
          postalCode: "560001",
          country: "India"
        },
        status: "pending"
      });
      testOrderIds.add(order._id);

      let thrownError = null;
      try {
        await cancelOrderWithInventoryRestoration({
          orderId: order._id.toString(),
          actor: "customer",
          userId: user._id
        });
      } catch (err) {
        thrownError = err;
      }

      expect(thrownError).toBeDefined();
      expect(thrownError.statusCode).toBe(404);

      // Verify atomic rollback: validProd stock MUST NOT have incremented
      const refreshedValidProd = await Product.findById(validProd._id);
      expect(refreshedValidProd.stock).toBe(50); // Untouched

      // Verify order status MUST remain 'pending'
      const refreshedOrder = await Order.findById(order._id);
      expect(refreshedOrder.status).toBe("pending");
    });

    it("Scenario 3 — Exactly one request succeeds during concurrent cancellation race", async () => {
      const user = await User.create({
        name: "Test Customer Concurrency",
        email: `concur-${Date.now()}@example.com`,
        password: "Password123!"
      });
      testUserIds.add(user._id);

      const prod = await Product.create({
        name: "Concurrency Test Item",
        description: "Item for race test",
        price: 500,
        stock: 30,
        category: "Test",
        isActive: true
      });
      testProductIds.add(prod._id);

      const order = await Order.create({
        user: user._id,
        items: [
          {
            product: prod._id,
            name: prod.name,
            price: 500,
            quantity: 4,
            subtotal: 2000
          }
        ],
        totalQuantity: 4,
        subtotal: 2000,
        total: 2000,
        payment: { provider: "razorpay", status: "pending" },
        shippingAddress: {
          fullName: "Race Tester",
          phone: "9876543210",
          addressLine1: "Race St",
          city: "Bengaluru",
          state: "Karnataka",
          postalCode: "560001",
          country: "India"
        },
        status: "pending"
      });
      testOrderIds.add(order._id);

      const results = await Promise.allSettled([
        cancelOrderWithInventoryRestoration({
          orderId: order._id.toString(),
          actor: "customer",
          userId: user._id
        }),
        cancelOrderWithInventoryRestoration({
          orderId: order._id.toString(),
          actor: "customer",
          userId: user._id
        })
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason.statusCode).toBe(400);
      expect(rejected[0].reason.code).toBe("ORDER_ALREADY_CANCELLED");

      // Verify stock was restored EXACTLY ONCE (30 + 4 = 34, not 38)
      const refreshedProd = await Product.findById(prod._id);
      expect(refreshedProd.stock).toBe(34);
    });

    it("Scenario 4 — Restores inventory correctly despite concurrent inventory mutation on the same product", async () => {
      const user = await User.create({
        name: "Test Customer Concur Inv",
        email: `concur-inv-${Date.now()}@example.com`,
        password: "Password123!"
      });
      testUserIds.add(user._id);

      const prod = await Product.create({
        name: "Concurrent Stock Product",
        description: "Testing concurrent stock write",
        price: 300,
        stock: 20,
        category: "Test",
        isActive: true
      });
      testProductIds.add(prod._id);

      const order = await Order.create({
        user: user._id,
        items: [
          {
            product: prod._id,
            name: prod.name,
            price: 300,
            quantity: 5,
            subtotal: 1500
          }
        ],
        totalQuantity: 5,
        subtotal: 1500,
        total: 1500,
        payment: { provider: "razorpay", status: "pending" },
        shippingAddress: {
          fullName: "Inv Concur Tester",
          phone: "9876543210",
          addressLine1: "Inv St",
          city: "Bengaluru",
          state: "Karnataka",
          postalCode: "560001",
          country: "India"
        },
        status: "pending"
      });
      testOrderIds.add(order._id);

      // Concurrently run cancellation (+5 stock) and an independent inventory mutation (-2 stock)
      const [cancelResult, invResult] = await Promise.all([
        cancelOrderWithInventoryRestoration({
          orderId: order._id.toString(),
          actor: "customer",
          userId: user._id
        }),
        Product.findByIdAndUpdate(prod._id, { $inc: { stock: -2 } }, { new: true })
      ]);

      expect(cancelResult.status).toBe("cancelled");
      expect(invResult).toBeDefined();

      // Net stock must be 20 + 5 - 2 = 23
      const refreshedProd = await Product.findById(prod._id);
      expect(refreshedProd.stock).toBe(23);
    });

    it("Scenario 8 — Correctly restores duplicate line items referencing the same variant", async () => {
      const user = await User.create({
        name: "Test Customer Dup Lines",
        email: `dup-lines-${Date.now()}@example.com`,
        password: "Password123!"
      });
      testUserIds.add(user._id);

      const variantProd = await Product.create({
        name: "Dup Variant Product",
        description: "Test product with duplicate lines",
        price: 1000,
        stock: 50,
        category: "Test",
        isActive: true,
        variants: [
          {
            variantId: "var_dup_sku_1",
            sku: "DUP-SKU-1",
            price: 1000,
            stock: 20,
            isActive: true
          }
        ]
      });
      testProductIds.add(variantProd._id);

      const order = await Order.create({
        user: user._id,
        items: [
          {
            product: variantProd._id,
            name: variantProd.name,
            variantId: "var_dup_sku_1",
            variantName: "Blue",
            sku: "DUP-SKU-1",
            price: 1000,
            quantity: 2,
            subtotal: 2000
          },
          {
            product: variantProd._id,
            name: variantProd.name,
            variantId: "var_dup_sku_1",
            variantName: "Blue",
            sku: "DUP-SKU-1",
            price: 1000,
            quantity: 3,
            subtotal: 3000
          }
        ],
        totalQuantity: 5,
        subtotal: 5000,
        total: 5000,
        payment: { provider: "razorpay", status: "pending" },
        shippingAddress: {
          fullName: "Dup Tester",
          phone: "9876543210",
          addressLine1: "Dup Way",
          city: "Bengaluru",
          state: "Karnataka",
          postalCode: "560001",
          country: "India"
        },
        status: "pending"
      });
      testOrderIds.add(order._id);

      await cancelOrderWithInventoryRestoration({
        orderId: order._id.toString(),
        actor: "customer",
        userId: user._id
      });

      // Stock must increment by total quantity across both lines (20 + 2 + 3 = 25)
      const refreshedProd = await Product.findById(variantProd._id);
      expect(refreshedProd.variants[0].stock).toBe(25);

      const persistedOrder = await Order.findById(order._id).select("+cancellationRestoration");
      expect(persistedOrder.cancellationRestoration.items).toHaveLength(2);
      expect(persistedOrder.cancellationRestoration.items[0].lineIndex).toBe(0);
      expect(persistedOrder.cancellationRestoration.items[0].status).toBe("restored");
      expect(persistedOrder.cancellationRestoration.items[1].lineIndex).toBe(1);
      expect(persistedOrder.cancellationRestoration.items[1].status).toBe("restored");
    });
  });
});
