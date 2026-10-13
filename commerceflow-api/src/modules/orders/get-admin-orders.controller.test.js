import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import Order from "./order.model.js";
import User from "../users/user.model.js";
import generateToken from "../../utils/generate-token.js";
import getAdminOrders from "./get-admin-orders.controller.js";

describe("getAdminOrders Controller Unit Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns paginated orders with default options", async () => {
    const mockOrders = [
      {
        _id: "507f1f77bcf86cd799439011",
        user: { _id: "507f1f77bcf86cd799439012", name: "Alice", email: "alice@example.com" },
        status: "pending",
        payment: { status: "pending" },
        subtotal: 1000,
        createdAt: new Date()
      }
    ];

    vi.spyOn(Order, "countDocuments").mockResolvedValue(1);

    const queryMock = {
      select: vi.fn().mockReturnThis(),
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(mockOrders)
    };

    vi.spyOn(Order, "find").mockReturnValue(queryMock);

    const req = {
      query: { page: "1", limit: "10" },
      requestId: "test-req-id"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const next = vi.fn();

    await getAdminOrders(req, res, next);

    expect(Order.countDocuments).toHaveBeenCalledWith({});
    expect(queryMock.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
    expect(queryMock.populate).toHaveBeenCalledWith("user", "name email");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Admin orders retrieved successfully",
      data: {
        orders: mockOrders,
        pagination: {
          page: 1,
          limit: 10,
          totalOrders: 1,
          totalPages: 1
        }
      },
      requestId: "test-req-id"
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("exposes checkoutState on orders in admin listing so operators can identify in_progress/abandoned orders", async () => {
    const mockOrders = [
      {
        _id: "507f1f77bcf86cd799439011",
        user: { _id: "507f1f77bcf86cd799439012", name: "Alice", email: "alice@example.com" },
        status: "pending",
        checkoutState: "in_progress",
        payment: { status: "pending" },
        subtotal: 1000,
        createdAt: new Date()
      }
    ];

    vi.spyOn(Order, "countDocuments").mockResolvedValue(1);

    const queryMock = {
      select: vi.fn().mockReturnThis(),
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(mockOrders)
    };

    vi.spyOn(Order, "find").mockReturnValue(queryMock);

    const req = {
      query: { page: "1", limit: "10" },
      requestId: "test-req-id"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const next = vi.fn();

    await getAdminOrders(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.data.orders[0].checkoutState).toBe("in_progress");
  });

  it("applies status and paymentStatus filters", async () => {
    vi.spyOn(Order, "countDocuments").mockResolvedValue(0);

    const queryMock = {
      select: vi.fn().mockReturnThis(),
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([])
    };

    vi.spyOn(Order, "find").mockReturnValue(queryMock);

    const req = {
      query: {
        page: "1",
        limit: "10",
        status: "processing",
        paymentStatus: "paid"
      },
      requestId: "test-req-id"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const next = vi.fn();

    await getAdminOrders(req, res, next);

    const expectedFilter = {
      status: "processing",
      "payment.status": "paid"
    };

    expect(Order.countDocuments).toHaveBeenCalledWith(expectedFilter);
    expect(Order.find).toHaveBeenCalledWith(expectedFilter);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("applies exact search across order _id, razorpayOrderId, and transactionId when 24-hex ObjectId is given", async () => {
    vi.spyOn(Order, "countDocuments").mockResolvedValue(0);

    const queryMock = {
      select: vi.fn().mockReturnThis(),
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([])
    };

    vi.spyOn(Order, "find").mockReturnValue(queryMock);

    const req = {
      query: {
        search: "507f1f77bcf86cd799439011"
      },
      requestId: "test-req-id"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const next = vi.fn();

    await getAdminOrders(req, res, next);

    const expectedFilter = {
      $or: [
        { _id: "507f1f77bcf86cd799439011" },
        { "payment.razorpayOrderId": "507f1f77bcf86cd799439011" },
        { "payment.transactionId": "507f1f77bcf86cd799439011" }
      ]
    };

    expect(Order.countDocuments).toHaveBeenCalledWith(expectedFilter);
    expect(Order.find).toHaveBeenCalledWith(expectedFilter);
  });

  it("applies search for non-ObjectId strings across razorpayOrderId and transactionId", async () => {
    vi.spyOn(Order, "countDocuments").mockResolvedValue(0);

    const queryMock = {
      select: vi.fn().mockReturnThis(),
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([])
    };

    vi.spyOn(Order, "find").mockReturnValue(queryMock);

    const req = {
      query: {
        search: "order_Kj982347sd98f"
      },
      requestId: "test-req-id"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const next = vi.fn();

    await getAdminOrders(req, res, next);

    const expectedFilter = {
      $or: [
        { "payment.razorpayOrderId": "order_Kj982347sd98f" },
        { "payment.transactionId": "order_Kj982347sd98f" }
      ]
    };

    expect(Order.countDocuments).toHaveBeenCalledWith(expectedFilter);
    expect(Order.find).toHaveBeenCalledWith(expectedFilter);
  });

  it("applies custom sorting by subtotal ascending", async () => {
    vi.spyOn(Order, "countDocuments").mockResolvedValue(0);

    const queryMock = {
      select: vi.fn().mockReturnThis(),
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([])
    };

    vi.spyOn(Order, "find").mockReturnValue(queryMock);

    const req = {
      query: {
        sortBy: "subtotal",
        sortOrder: "asc"
      },
      requestId: "test-req-id"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const next = vi.fn();

    await getAdminOrders(req, res, next);

    expect(queryMock.sort).toHaveBeenCalledWith({ subtotal: 1, _id: 1 });
  });

  it("forwards database errors to error middleware", async () => {
    const dbError = new Error("Database query failed");
    vi.spyOn(Order, "countDocuments").mockRejectedValue(dbError);

    const req = { query: {}, requestId: "test-req-id" };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await getAdminOrders(req, res, next);

    expect(next).toHaveBeenCalledWith(dbError);
    expect(res.status).not.toHaveBeenCalled();
  });

  describe("P1.5.7 — Cancellation Metadata Read-Path Regression Tests", () => {
    it("preserves cancellation metadata in admin order list when order is cancelled", async () => {
      const mockOrders = [
        {
          _id: "507f1f77bcf86cd799439011",
          user: { _id: "507f1f77bcf86cd799439012", name: "Alice", email: "alice@example.com" },
          status: "cancelled",
          cancellation: {
            reason: "system_checkout_failure",
            reasonDetail: "",
            cancelledBy: "system",
            cancelledAt: new Date("2026-10-01T12:00:00.000Z")
          },
          payment: { status: "failed" },
          subtotal: 1000,
          createdAt: new Date()
        }
      ];

      vi.spyOn(Order, "countDocuments").mockResolvedValue(1);

      const queryMock = {
        select: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(mockOrders)
      };

      vi.spyOn(Order, "find").mockReturnValue(queryMock);

      const req = {
        query: { page: "1", limit: "10" },
        requestId: "test-req-admin-cancelled"
      };

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await getAdminOrders(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      const body = res.json.mock.calls[0][0];
      expect(body.data.orders).toHaveLength(1);
      expect(body.data.orders[0].status).toBe("cancelled");
      expect(body.data.orders[0].cancellation).toEqual({
        reason: "system_checkout_failure",
        reasonDetail: "",
        cancelledBy: "system",
        cancelledAt: new Date("2026-10-01T12:00:00.000Z")
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("returns cancellation as null in admin order list when order is active", async () => {
      const mockOrders = [
        {
          _id: "507f1f77bcf86cd799439011",
          user: { _id: "507f1f77bcf86cd799439012", name: "Alice", email: "alice@example.com" },
          status: "processing",
          cancellation: null,
          payment: { status: "paid" },
          subtotal: 1000,
          createdAt: new Date()
        }
      ];

      vi.spyOn(Order, "countDocuments").mockResolvedValue(1);

      const queryMock = {
        select: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(mockOrders)
      };

      vi.spyOn(Order, "find").mockReturnValue(queryMock);

      const req = {
        query: { page: "1", limit: "10" },
        requestId: "test-req-admin-active"
      };

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await getAdminOrders(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      const body = res.json.mock.calls[0][0];
      expect(body.data.orders).toHaveLength(1);
      expect(body.data.orders[0].status).toBe("processing");
      expect(body.data.orders[0].cancellation).toBeNull();
      expect(next).not.toHaveBeenCalled();
    });

    it("returns legacy cancelled order in admin order list without fabricated metadata", async () => {
      const mockOrders = [
        {
          _id: "507f1f77bcf86cd799439011",
          user: { _id: "507f1f77bcf86cd799439012", name: "Alice", email: "alice@example.com" },
          status: "cancelled",
          cancellation: null,
          payment: { status: "pending" },
          subtotal: 1000,
          createdAt: new Date()
        }
      ];

      vi.spyOn(Order, "countDocuments").mockResolvedValue(1);

      const queryMock = {
        select: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(mockOrders)
      };

      vi.spyOn(Order, "find").mockReturnValue(queryMock);

      const req = {
        query: { page: "1", limit: "10" },
        requestId: "test-req-admin-legacy-cancelled"
      };

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await getAdminOrders(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      const body = res.json.mock.calls[0][0];
      expect(body.data.orders).toHaveLength(1);
      expect(body.data.orders[0].status).toBe("cancelled");
      expect(body.data.orders[0].cancellation).toBeNull();
      expect(next).not.toHaveBeenCalled();
    });

    it("ensures internal checkoutCompensation checkpoints and reservation tokens are not exposed in admin order list", async () => {
      const mockOrders = [
        {
          _id: "507f1f77bcf86cd799439011",
          user: { _id: "507f1f77bcf86cd799439012", name: "Alice", email: "alice@example.com" },
          status: "cancelled",
          cancellation: {
            reason: "item_unavailable",
            reasonDetail: "Damaged in warehouse",
            cancelledBy: "admin",
            cancelledAt: new Date("2026-10-01T12:00:00.000Z")
          },
          payment: { status: "refunded" },
          subtotal: 1000,
          createdAt: new Date()
        }
      ];

      vi.spyOn(Order, "countDocuments").mockResolvedValue(1);

      const queryMock = {
        select: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(mockOrders)
      };

      vi.spyOn(Order, "find").mockReturnValue(queryMock);

      const req = {
        query: { page: "1", limit: "10" },
        requestId: "test-req-admin-security"
      };

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await getAdminOrders(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      const body = res.json.mock.calls[0][0];
      expect(body.data.orders[0].checkoutCompensation).toBeUndefined();
      expect(body.data.orders[0].cancellation).toMatchObject({
        reason: "item_unavailable",
        reasonDetail: "Damaged in warehouse",
        cancelledBy: "admin",
        cancelledAt: expect.any(Date)
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("does not allow request query or body parameters to override cancellation data in admin order list", async () => {
      const cancelledAt = new Date("2026-10-01T12:00:00.000Z");
      const mockOrders = [
        {
          _id: "507f1f77bcf86cd799439011",
          user: { _id: "507f1f77bcf86cd799439012", name: "Alice", email: "alice@example.com" },
          status: "cancelled",
          cancellation: {
            reason: "fraud_suspected",
            reasonDetail: "Suspicious activity detected",
            cancelledBy: "admin",
            cancelledAt
          },
          payment: { status: "refunded" },
          subtotal: 1000,
          createdAt: new Date()
        }
      ];

      vi.spyOn(Order, "countDocuments").mockResolvedValue(1);

      const queryMock = {
        select: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(mockOrders)
      };

      vi.spyOn(Order, "find").mockReturnValue(queryMock);

      const req = {
        query: {
          page: "1",
          limit: "10",
          cancellation: { reason: "hacked", cancelledBy: "customer" }
        },
        body: {
          cancellation: { reason: "forged" }
        },
        requestId: "test-req-admin-tampering"
      };

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await getAdminOrders(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      const body = res.json.mock.calls[0][0];
      expect(body.data.orders[0].cancellation).toEqual({
        reason: "fraud_suspected",
        reasonDetail: "Suspicious activity detected",
        cancelledBy: "admin",
        cancelledAt
      });
      expect(next).not.toHaveBeenCalled();
    });
  });
});


describe("GET /api/v1/admin/orders (HTTP Integration & Authorization)", () => {
  let app;
  const adminUserId = "507f1f77bcf86cd799439001";
  const customerUserId = "507f1f77bcf86cd799439002";
  let adminToken;
  let customerToken;

  beforeEach(() => {
    vi.restoreAllMocks();
    app = createApp();
    adminToken = generateToken({ userId: adminUserId });
    customerToken = generateToken({ userId: customerUserId });
  });

  it("rejects unauthenticated request with 401", async () => {
    const res = await request(app).get("/api/v1/admin/orders");
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("AUTH_TOKEN_REQUIRED");
  });

  it("rejects non-admin customer request with 403", async () => {
    vi.spyOn(User, "findById").mockResolvedValue({
      _id: customerUserId,
      email: "customer@example.com",
      role: "customer",
      isActive: true
    });

    const res = await request(app)
      .get("/api/v1/admin/orders")
      .set("Authorization", `Bearer ${customerToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("accepts admin request and returns paginated order list", async () => {
    vi.spyOn(User, "findById").mockResolvedValue({
      _id: adminUserId,
      email: "admin@example.com",
      role: "admin",
      isActive: true
    });

    vi.spyOn(Order, "countDocuments").mockResolvedValue(1);

    const mockOrder = {
      _id: "507f1f77bcf86cd799439011",
      user: { _id: customerUserId, name: "Customer Bob", email: "bob@example.com" },
      status: "processing",
      payment: {
        provider: "razorpay",
        status: "paid",
        transactionId: "pay_12345",
        razorpayOrderId: "order_67890"
      },
      totalQuantity: 2,
      subtotal: 2500,
      createdAt: new Date().toISOString()
    };

    const queryMock = {
      select: vi.fn().mockReturnThis(),
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([mockOrder])
    };

    vi.spyOn(Order, "find").mockReturnValue(queryMock);

    const res = await request(app)
      .get("/api/v1/admin/orders?page=1&limit=10&status=processing&paymentStatus=paid")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.orders).toHaveLength(1);
    expect(res.body.data.orders[0]._id).toBe("507f1f77bcf86cd799439011");
    expect(res.body.data.orders[0].user.name).toBe("Customer Bob");
    expect(res.body.data.orders[0].user.password).toBeUndefined();
    expect(res.body.data.pagination).toEqual({
      page: 1,
      limit: 10,
      totalOrders: 1,
      totalPages: 1
    });
  });

  it("rejects invalid status filter with 400 validation error", async () => {
    vi.spyOn(User, "findById").mockResolvedValue({
      _id: adminUserId,
      email: "admin@example.com",
      role: "admin",
      isActive: true
    });

    const res = await request(app)
      .get("/api/v1/admin/orders?status=invalid_status")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects invalid paymentStatus filter with 400 validation error", async () => {
    vi.spyOn(User, "findById").mockResolvedValue({
      _id: adminUserId,
      email: "admin@example.com",
      role: "admin",
      isActive: true
    });

    const res = await request(app)
      .get("/api/v1/admin/orders?paymentStatus=captured")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});
