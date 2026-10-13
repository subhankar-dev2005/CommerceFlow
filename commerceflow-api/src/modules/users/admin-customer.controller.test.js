import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import User from "./user.model.js";
import Address from "./address.model.js";
import Order from "../orders/order.model.js";
import Review from "../reviews/review.model.js";
import WishlistItem from "../wishlist/wishlist-item.model.js";
import Cart from "../cart/cart.model.js";
import generateToken from "../../utils/generate-token.js";
import {
  getAdminCustomers,
  getAdminCustomerById,
  updateAdminCustomerStatus
} from "./admin-customer.controller.js";

describe("getAdminCustomers Controller Unit Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns paginated customer list with default options and role: 'customer' filter", async () => {
    const mockCustomers = [
      {
        _id: "507f1f77bcf86cd799439001",
        name: "Alice Smith",
        email: "alice@example.com",
        role: "customer",
        isActive: true,
        createdAt: new Date("2026-03-01T10:00:00Z"),
        updatedAt: new Date("2026-03-01T10:00:00Z")
      }
    ];

    vi.spyOn(User, "countDocuments").mockResolvedValue(1);

    const queryMock = {
      select: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(mockCustomers)
    };

    vi.spyOn(User, "find").mockReturnValue(queryMock);

    const req = {
      query: { page: "1", limit: "10", status: "all" },
      requestId: "test-req-id"
    };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const next = vi.fn();

    await getAdminCustomers(req, res, next);

    expect(User.countDocuments).toHaveBeenCalledWith({ role: "customer" });
    expect(User.find).toHaveBeenCalledWith({ role: "customer" });
    expect(queryMock.select).toHaveBeenCalledWith(
      "_id name email role isActive createdAt updatedAt"
    );
    expect(queryMock.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
    expect(queryMock.skip).toHaveBeenCalledWith(0);
    expect(queryMock.limit).toHaveBeenCalledWith(10);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Admin customers retrieved successfully",
      data: {
        customers: [
          {
            id: "507f1f77bcf86cd799439001",
            _id: "507f1f77bcf86cd799439001",
            name: "Alice Smith",
            email: "alice@example.com",
            role: "customer",
            isActive: true,
            createdAt: mockCustomers[0].createdAt,
            updatedAt: mockCustomers[0].updatedAt
          }
        ],
        pagination: {
          page: 1,
          limit: 10,
          totalCustomers: 1,
          total: 1,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false
        }
      },
      requestId: "test-req-id"
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("applies status=active filter with role: 'customer'", async () => {
    vi.spyOn(User, "countDocuments").mockResolvedValue(0);

    const queryMock = {
      select: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([])
    };
    vi.spyOn(User, "find").mockReturnValue(queryMock);

    const req = {
      query: { status: "active" },
      requestId: "test-req-id"
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await getAdminCustomers(req, res, next);

    expect(User.countDocuments).toHaveBeenCalledWith({
      role: "customer",
      isActive: true
    });
    expect(User.find).toHaveBeenCalledWith({
      role: "customer",
      isActive: true
    });
  });

  it("applies status=inactive filter with role: 'customer'", async () => {
    vi.spyOn(User, "countDocuments").mockResolvedValue(0);

    const queryMock = {
      select: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([])
    };
    vi.spyOn(User, "find").mockReturnValue(queryMock);

    const req = {
      query: { status: "inactive" },
      requestId: "test-req-id"
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await getAdminCustomers(req, res, next);

    expect(User.countDocuments).toHaveBeenCalledWith({
      role: "customer",
      isActive: false
    });
    expect(User.find).toHaveBeenCalledWith({
      role: "customer",
      isActive: false
    });
  });

  it("safely escapes regex metacharacters in search and prevents ReDoS", async () => {
    vi.spyOn(User, "countDocuments").mockResolvedValue(0);

    const queryMock = {
      select: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([])
    };
    vi.spyOn(User, "find").mockReturnValue(queryMock);

    const dangerousSearch = ".*+?^${}()|[\\]\\";
    const req = {
      query: { search: dangerousSearch },
      requestId: "test-req-id"
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await getAdminCustomers(req, res, next);

    const expectedEscaped = "\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\\\\\]\\\\";
    const expectedRegex = new RegExp(expectedEscaped, "i");

    expect(User.countDocuments).toHaveBeenCalledWith({
      role: "customer",
      $or: [
        { name: expectedRegex },
        { email: expectedRegex }
      ]
    });
  });

  it("supports sorting by name asc with _id tie-breaker", async () => {
    vi.spyOn(User, "countDocuments").mockResolvedValue(0);

    const queryMock = {
      select: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([])
    };
    vi.spyOn(User, "find").mockReturnValue(queryMock);

    const req = {
      query: { sortBy: "name", sortOrder: "asc" },
      requestId: "test-req-id"
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await getAdminCustomers(req, res, next);

    expect(queryMock.sort).toHaveBeenCalledWith({ name: 1, _id: 1 });
  });

  it("supports sorting by email desc with _id tie-breaker", async () => {
    vi.spyOn(User, "countDocuments").mockResolvedValue(0);

    const queryMock = {
      select: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([])
    };
    vi.spyOn(User, "find").mockReturnValue(queryMock);

    const req = {
      query: { sortBy: "email", sortOrder: "desc" },
      requestId: "test-req-id"
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await getAdminCustomers(req, res, next);

    expect(queryMock.sort).toHaveBeenCalledWith({ email: -1, _id: -1 });
  });

  it("correctly calculates pagination metadata when multiple pages exist", async () => {
    vi.spyOn(User, "countDocuments").mockResolvedValue(45);

    const queryMock = {
      select: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([])
    };
    vi.spyOn(User, "find").mockReturnValue(queryMock);

    const req = {
      query: { page: "2", limit: "10" },
      requestId: "test-req-id"
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await getAdminCustomers(req, res, next);

    expect(queryMock.skip).toHaveBeenCalledWith(10);
    expect(queryMock.limit).toHaveBeenCalledWith(10);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pagination: {
            page: 2,
            limit: 10,
            totalCustomers: 45,
            total: 45,
            totalPages: 5,
            hasNextPage: true,
            hasPrevPage: true
          }
        })
      })
    );
  });

  it("forwards database errors to error middleware", async () => {
    const dbError = new Error("Database query failed");
    vi.spyOn(User, "countDocuments").mockRejectedValue(dbError);

    const req = { query: {}, requestId: "test-req-id" };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await getAdminCustomers(req, res, next);

    expect(next).toHaveBeenCalledWith(dbError);
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/admin/customers (HTTP Integration & Authorization)", () => {
  let app;
  const adminUserId = "507f1f77bcf86cd799439001";
  const customerUserId = "507f1f77bcf86cd799439002";
  let adminToken;
  let customerToken;

  beforeEach(() => {
    vi.restoreAllMocks();
    app = createApp();
    adminToken = generateToken({ userId: adminUserId, role: "admin" });
    customerToken = generateToken({ userId: customerUserId, role: "customer" });
  });

  it("rejects unauthenticated request with 401 AUTH_TOKEN_REQUIRED", async () => {
    const res = await request(app).get("/api/v1/admin/customers");

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("AUTH_TOKEN_REQUIRED");
  });

  it("rejects non-admin customer request with 403 FORBIDDEN", async () => {
    vi.spyOn(User, "findById").mockResolvedValue({
      _id: customerUserId,
      email: "customer@example.com",
      role: "customer",
      isActive: true
    });

    const res = await request(app)
      .get("/api/v1/admin/customers")
      .set("Authorization", `Bearer ${customerToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("accepts admin request and returns customer list with safe projection", async () => {
    vi.spyOn(User, "findById").mockResolvedValue({
      _id: adminUserId,
      email: "admin@example.com",
      role: "admin",
      isActive: true
    });

    vi.spyOn(User, "countDocuments").mockResolvedValue(1);

    const mockCustomer = {
      _id: customerUserId,
      name: "Customer Jane",
      email: "jane@example.com",
      role: "customer",
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const queryMock = {
      select: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([mockCustomer])
    };

    vi.spyOn(User, "find").mockReturnValue(queryMock);

    const res = await request(app)
      .get("/api/v1/admin/customers?page=1&limit=10&status=all")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("Admin customers retrieved successfully");
    expect(res.body.data.customers).toHaveLength(1);
    expect(res.body.data.customers[0].id).toBe(customerUserId);
    expect(res.body.data.customers[0].name).toBe("Customer Jane");
    expect(res.body.data.customers[0].email).toBe("jane@example.com");
    expect(res.body.data.customers[0].role).toBe("customer");
    expect(res.body.data.customers[0].password).toBeUndefined();
    expect(res.body.data.customers[0].passwordHash).toBeUndefined();
    expect(res.body.data.pagination).toEqual({
      page: 1,
      limit: 10,
      totalCustomers: 1,
      total: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false
    });
  });

  it("never returns admin accounts even if search matches admin details", async () => {
    vi.spyOn(User, "findById").mockResolvedValue({
      _id: adminUserId,
      email: "admin@example.com",
      role: "admin",
      isActive: true
    });

    vi.spyOn(User, "countDocuments").mockResolvedValue(0);

    const queryMock = {
      select: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([])
    };

    vi.spyOn(User, "find").mockReturnValue(queryMock);

    const res = await request(app)
      .get("/api/v1/admin/customers?search=admin")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    // Verifies User.find was called with role: "customer"
    expect(User.find).toHaveBeenCalledWith(
      expect.objectContaining({ role: "customer" })
    );
    expect(User.countDocuments).toHaveBeenCalledWith(
      expect.objectContaining({ role: "customer" })
    );
  });

  it("rejects invalid query parameters (e.g. limit > 50) with 400 VALIDATION_ERROR", async () => {
    vi.spyOn(User, "findById").mockResolvedValue({
      _id: adminUserId,
      email: "admin@example.com",
      role: "admin",
      isActive: true
    });

    const res = await request(app)
      .get("/api/v1/admin/customers?limit=100")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects invalid status parameter with 400 VALIDATION_ERROR", async () => {
    vi.spyOn(User, "findById").mockResolvedValue({
      _id: adminUserId,
      email: "admin@example.com",
      role: "admin",
      isActive: true
    });

    const res = await request(app)
      .get("/api/v1/admin/customers?status=banned")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects invalid sortBy field with 400 VALIDATION_ERROR", async () => {
    vi.spyOn(User, "findById").mockResolvedValue({
      _id: adminUserId,
      email: "admin@example.com",
      role: "admin",
      isActive: true
    });

    const res = await request(app)
      .get("/api/v1/admin/customers?sortBy=password")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("getAdminCustomerById Controller Unit Tests", () => {
  const customerId = "507f1f77bcf86cd799439002";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns customer profile, addresses, aggregated stats, and recent orders for valid customer", async () => {
    const mockCustomer = {
      _id: customerId,
      name: "Alice Smith",
      email: "alice@example.com",
      role: "customer",
      isActive: true,
      createdAt: new Date("2026-01-15T10:00:00Z"),
      updatedAt: new Date("2026-01-15T10:00:00Z")
    };

    const mockAddresses = [
      {
        _id: "507f1f77bcf86cd799439011",
        user: customerId,
        fullName: "Alice Smith",
        phone: "9876543210",
        addressLine1: "123 Elm St",
        addressLine2: "Apt 4B",
        city: "Mumbai",
        state: "Maharashtra",
        postalCode: "400001",
        country: "India",
        isDefault: true,
        createdAt: new Date("2026-01-16T10:00:00Z"),
        updatedAt: new Date("2026-01-16T10:00:00Z")
      }
    ];

    const mockStats = [
      {
        _id: null,
        totalOrders: 3,
        totalSpent: 4500,
        lastOrderDate: new Date("2026-03-01T15:00:00Z")
      }
    ];

    const mockRecentOrders = [
      {
        _id: "507f1f77bcf86cd799439021",
        status: "delivered",
        payment: { status: "paid" },
        shipment: { status: "delivered" },
        total: 1500,
        totalQuantity: 2,
        createdAt: new Date("2026-03-01T15:00:00Z")
      }
    ];

    vi.spyOn(User, "findOne").mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(mockCustomer)
    });

    vi.spyOn(Address, "find").mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(mockAddresses)
    });

    vi.spyOn(Order, "aggregate").mockResolvedValue(mockStats);

    vi.spyOn(Order, "find").mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(mockRecentOrders)
    });

    const req = {
      params: { customerId },
      requestId: "test-req-id"
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await getAdminCustomerById(req, res, next);

    expect(User.findOne).toHaveBeenCalledWith({
      _id: customerId,
      role: "customer"
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Admin customer retrieved successfully",
      data: {
        customer: {
          id: customerId,
          _id: customerId,
          name: "Alice Smith",
          email: "alice@example.com",
          role: "customer",
          isActive: true,
          createdAt: mockCustomer.createdAt,
          updatedAt: mockCustomer.updatedAt
        },
        addresses: [
          {
            id: "507f1f77bcf86cd799439011",
            _id: "507f1f77bcf86cd799439011",
            fullName: "Alice Smith",
            phone: "9876543210",
            addressLine1: "123 Elm St",
            addressLine2: "Apt 4B",
            city: "Mumbai",
            state: "Maharashtra",
            postalCode: "400001",
            country: "India",
            isDefault: true,
            createdAt: mockAddresses[0].createdAt,
            updatedAt: mockAddresses[0].updatedAt
          }
        ],
        orderStats: {
          totalOrders: 3,
          totalSpent: 4500,
          lastOrderDate: mockStats[0].lastOrderDate
        },
        recentOrders: [
          {
            id: "507f1f77bcf86cd799439021",
            _id: "507f1f77bcf86cd799439021",
            status: "delivered",
            paymentStatus: "paid",
            shipmentStatus: "delivered",
            total: 1500,
            itemCount: 2,
            createdAt: mockRecentOrders[0].createdAt
          }
        ]
      },
      requestId: "test-req-id"
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("throws 404 CUSTOMER_NOT_FOUND when customer does not exist or has non-customer role", async () => {
    vi.spyOn(User, "findOne").mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(null)
    });

    const req = {
      params: { customerId },
      requestId: "test-req-id"
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await getAdminCustomerById(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe("CUSTOMER_NOT_FOUND");
    expect(error.message).toBe("Customer not found");
    expect(res.status).not.toHaveBeenCalled();
  });

  it("handles customer with zero addresses and zero orders gracefully", async () => {
    const mockCustomer = {
      _id: customerId,
      name: "New Customer",
      email: "new@example.com",
      role: "customer",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    vi.spyOn(User, "findOne").mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(mockCustomer)
    });

    vi.spyOn(Address, "find").mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([])
    });

    vi.spyOn(Order, "aggregate").mockResolvedValue([]);

    vi.spyOn(Order, "find").mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([])
    });

    const req = {
      params: { customerId },
      requestId: "test-req-id"
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await getAdminCustomerById(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          addresses: [],
          orderStats: {
            totalOrders: 0,
            totalSpent: 0,
            lastOrderDate: null
          },
          recentOrders: []
        })
      })
    );
  });

  it("returns inactive customer details preserving history and isActive: false", async () => {
    const mockCustomer = {
      _id: customerId,
      name: "Inactive Customer",
      email: "inactive@example.com",
      role: "customer",
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    vi.spyOn(User, "findOne").mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(mockCustomer)
    });

    vi.spyOn(Address, "find").mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([])
    });

    vi.spyOn(Order, "aggregate").mockResolvedValue([]);

    vi.spyOn(Order, "find").mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([])
    });

    const req = {
      params: { customerId },
      requestId: "test-req-id"
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await getAdminCustomerById(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customer: expect.objectContaining({
            isActive: false
          })
        })
      })
    );
  });

  it("forwards unexpected database errors to error middleware", async () => {
    const dbError = new Error("Database query failed");
    vi.spyOn(User, "findOne").mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockRejectedValue(dbError)
    });

    const req = {
      params: { customerId },
      requestId: "test-req-id"
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await getAdminCustomerById(req, res, next);

    expect(next).toHaveBeenCalledWith(dbError);
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/admin/customers/:customerId (HTTP Integration & Authorization)", () => {
  let app;
  const adminUserId = "507f1f77bcf86cd799439001";
  const customerUserId = "507f1f77bcf86cd799439002";
  let adminToken;
  let customerToken;

  beforeEach(() => {
    vi.restoreAllMocks();
    app = createApp();
    adminToken = generateToken({ userId: adminUserId, role: "admin" });
    customerToken = generateToken({ userId: customerUserId, role: "customer" });
  });

  it("rejects unauthenticated request with 401 AUTH_TOKEN_REQUIRED", async () => {
    const res = await request(app).get(`/api/v1/admin/customers/${customerUserId}`);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("AUTH_TOKEN_REQUIRED");
  });

  it("rejects non-admin customer request with 403 FORBIDDEN", async () => {
    vi.spyOn(User, "findById").mockResolvedValue({
      _id: customerUserId,
      email: "customer@example.com",
      role: "customer",
      isActive: true
    });

    const res = await request(app)
      .get(`/api/v1/admin/customers/${customerUserId}`)
      .set("Authorization", `Bearer ${customerToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("rejects malformed ObjectId with 400 VALIDATION_ERROR", async () => {
    vi.spyOn(User, "findById").mockResolvedValue({
      _id: adminUserId,
      email: "admin@example.com",
      role: "admin",
      isActive: true
    });

    const res = await request(app)
      .get("/api/v1/admin/customers/invalid-object-id")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 CUSTOMER_NOT_FOUND when customer does not exist", async () => {
    vi.spyOn(User, "findById").mockResolvedValue({
      _id: adminUserId,
      email: "admin@example.com",
      role: "admin",
      isActive: true
    });

    vi.spyOn(User, "findOne").mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(null)
    });

    const res = await request(app)
      .get(`/api/v1/admin/customers/${customerUserId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("CUSTOMER_NOT_FOUND");
  });

  it("returns 404 CUSTOMER_NOT_FOUND when customerId belongs to an admin account", async () => {
    vi.spyOn(User, "findById").mockResolvedValue({
      _id: adminUserId,
      email: "admin@example.com",
      role: "admin",
      isActive: true
    });

    // Mock query with role: "customer" returns null for an admin ID
    vi.spyOn(User, "findOne").mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(null)
    });

    const targetAdminId = "507f1f77bcf86cd799439099";
    const res = await request(app)
      .get(`/api/v1/admin/customers/${targetAdminId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("CUSTOMER_NOT_FOUND");
    expect(User.findOne).toHaveBeenCalledWith({
      _id: targetAdminId,
      role: "customer"
    });
  });

  it("successfully returns customer details with safe projection (no password or hash)", async () => {
    vi.spyOn(User, "findById").mockResolvedValue({
      _id: adminUserId,
      email: "admin@example.com",
      role: "admin",
      isActive: true
    });

    const mockCustomer = {
      _id: customerUserId,
      name: "Jane Customer",
      email: "jane@example.com",
      role: "customer",
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    vi.spyOn(User, "findOne").mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(mockCustomer)
    });

    vi.spyOn(Address, "find").mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([])
    });

    vi.spyOn(Order, "aggregate").mockResolvedValue([]);

    vi.spyOn(Order, "find").mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([])
    });

    const res = await request(app)
      .get(`/api/v1/admin/customers/${customerUserId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.customer.id).toBe(customerUserId);
    expect(res.body.data.customer.name).toBe("Jane Customer");
    expect(res.body.data.customer.email).toBe("jane@example.com");
    expect(res.body.data.customer.password).toBeUndefined();
    expect(res.body.data.customer.passwordHash).toBeUndefined();
    expect(res.body.data.addresses).toEqual([]);
    expect(res.body.data.orderStats).toEqual({
      totalOrders: 0,
      totalSpent: 0,
      lastOrderDate: null
    });
    expect(res.body.data.recentOrders).toEqual([]);
  });
});

describe("updateAdminCustomerStatus Controller Unit Tests", () => {
  const customerId = "507f1f77bcf86cd799439002";
  const adminId = "507f1f77bcf86cd799439001";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("successfully deactivates active customer (active -> inactive)", async () => {
    const updatedCustomer = {
      _id: customerId,
      name: "Bob Customer",
      email: "bob@example.com",
      role: "customer",
      isActive: false,
      createdAt: new Date("2026-02-01T10:00:00Z"),
      updatedAt: new Date("2026-03-30T10:00:00Z")
    };

    vi.spyOn(User, "findOneAndUpdate").mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(updatedCustomer)
    });

    const req = {
      params: { customerId },
      body: { isActive: false },
      user: { _id: adminId, role: "admin" },
      requestId: "test-req-id"
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await updateAdminCustomerStatus(req, res, next);

    expect(User.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: customerId, role: "customer" },
      { $set: { isActive: false } },
      { new: true, runValidators: true }
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Customer status updated successfully",
      data: {
        customer: {
          id: customerId,
          _id: customerId,
          name: "Bob Customer",
          email: "bob@example.com",
          role: "customer",
          isActive: false,
          createdAt: updatedCustomer.createdAt,
          updatedAt: updatedCustomer.updatedAt
        }
      },
      requestId: "test-req-id"
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("successfully activates inactive customer (inactive -> active)", async () => {
    const updatedCustomer = {
      _id: customerId,
      name: "Bob Customer",
      email: "bob@example.com",
      role: "customer",
      isActive: true,
      createdAt: new Date("2026-02-01T10:00:00Z"),
      updatedAt: new Date("2026-03-30T10:00:00Z")
    };

    vi.spyOn(User, "findOneAndUpdate").mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(updatedCustomer)
    });

    const req = {
      params: { customerId },
      body: { isActive: true },
      user: { _id: adminId, role: "admin" },
      requestId: "test-req-id"
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await updateAdminCustomerStatus(req, res, next);

    expect(User.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: customerId, role: "customer" },
      { $set: { isActive: true } },
      { new: true, runValidators: true }
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Customer status updated successfully",
      data: {
        customer: {
          id: customerId,
          _id: customerId,
          name: "Bob Customer",
          email: "bob@example.com",
          role: "customer",
          isActive: true,
          createdAt: updatedCustomer.createdAt,
          updatedAt: updatedCustomer.updatedAt
        }
      },
      requestId: "test-req-id"
    });
  });

  it("handles idempotent mutation (active -> active) without error", async () => {
    const updatedCustomer = {
      _id: customerId,
      name: "Bob Customer",
      email: "bob@example.com",
      role: "customer",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    vi.spyOn(User, "findOneAndUpdate").mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(updatedCustomer)
    });

    const req = {
      params: { customerId },
      body: { isActive: true },
      user: { _id: adminId, role: "admin" },
      requestId: "test-req-id"
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await updateAdminCustomerStatus(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: "Customer status updated successfully"
      })
    );
  });

  it("handles idempotent mutation (inactive -> inactive) without error", async () => {
    const updatedCustomer = {
      _id: customerId,
      name: "Bob Customer",
      email: "bob@example.com",
      role: "customer",
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    vi.spyOn(User, "findOneAndUpdate").mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(updatedCustomer)
    });

    const req = {
      params: { customerId },
      body: { isActive: false },
      user: { _id: adminId, role: "admin" },
      requestId: "test-req-id"
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await updateAdminCustomerStatus(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: "Customer status updated successfully"
      })
    );
  });

  it("rejects self-deactivation when admin attempts to deactivate their own account", async () => {
    const req = {
      params: { customerId: adminId },
      body: { isActive: false },
      user: { _id: adminId, role: "admin" },
      requestId: "test-req-id"
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await updateAdminCustomerStatus(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe("CUSTOMER_NOT_FOUND");
    expect(res.status).not.toHaveBeenCalled();
  });

  it("throws 404 CUSTOMER_NOT_FOUND when customer does not exist or target is an admin", async () => {
    vi.spyOn(User, "findOneAndUpdate").mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(null)
    });

    const req = {
      params: { customerId },
      body: { isActive: false },
      user: { _id: adminId, role: "admin" },
      requestId: "test-req-id"
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await updateAdminCustomerStatus(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe("CUSTOMER_NOT_FOUND");
    expect(error.message).toBe("Customer not found");
  });

  it("forwards unexpected database errors to error middleware", async () => {
    const dbError = new Error("Database update failed");
    vi.spyOn(User, "findOneAndUpdate").mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockRejectedValue(dbError)
    });

    const req = {
      params: { customerId },
      body: { isActive: false },
      user: { _id: adminId, role: "admin" },
      requestId: "test-req-id"
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await updateAdminCustomerStatus(req, res, next);

    expect(next).toHaveBeenCalledWith(dbError);
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/v1/admin/customers/:customerId/status (HTTP Integration & Security)", () => {
  let app;
  const adminUserId = "507f1f77bcf86cd799439001";
  const customerUserId = "507f1f77bcf86cd799439002";
  let adminToken;
  let customerToken;

  beforeEach(() => {
    vi.restoreAllMocks();
    app = createApp();
    adminToken = generateToken({ userId: adminUserId, role: "admin" });
    customerToken = generateToken({ userId: customerUserId, role: "customer" });
  });

  it("rejects unauthenticated request with 401 AUTH_TOKEN_REQUIRED", async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/customers/${customerUserId}/status`)
      .send({ isActive: false });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("AUTH_TOKEN_REQUIRED");
  });

  it("rejects non-admin customer request with 403 FORBIDDEN", async () => {
    vi.spyOn(User, "findById").mockResolvedValue({
      _id: customerUserId,
      email: "customer@example.com",
      role: "customer",
      isActive: true
    });

    const res = await request(app)
      .patch(`/api/v1/admin/customers/${customerUserId}/status`)
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ isActive: false });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("rejects malformed customerId with 400 VALIDATION_ERROR", async () => {
    vi.spyOn(User, "findById").mockResolvedValue({
      _id: adminUserId,
      email: "admin@example.com",
      role: "admin",
      isActive: true
    });

    const res = await request(app)
      .patch("/api/v1/admin/customers/invalid-id/status")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isActive: false });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects missing isActive in body with 400 VALIDATION_ERROR", async () => {
    vi.spyOn(User, "findById").mockResolvedValue({
      _id: adminUserId,
      email: "admin@example.com",
      role: "admin",
      isActive: true
    });

    const res = await request(app)
      .patch(`/api/v1/admin/customers/${customerUserId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects string 'false' in body with 400 VALIDATION_ERROR", async () => {
    vi.spyOn(User, "findById").mockResolvedValue({
      _id: adminUserId,
      email: "admin@example.com",
      role: "admin",
      isActive: true
    });

    const res = await request(app)
      .patch(`/api/v1/admin/customers/${customerUserId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isActive: "false" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects unknown field in body (strict mode) with 400 VALIDATION_ERROR", async () => {
    vi.spyOn(User, "findById").mockResolvedValue({
      _id: adminUserId,
      email: "admin@example.com",
      role: "admin",
      isActive: true
    });

    const res = await request(app)
      .patch(`/api/v1/admin/customers/${customerUserId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isActive: false, role: "admin" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 CUSTOMER_NOT_FOUND when customer does not exist", async () => {
    vi.spyOn(User, "findById").mockResolvedValue({
      _id: adminUserId,
      email: "admin@example.com",
      role: "admin",
      isActive: true
    });

    vi.spyOn(User, "findOneAndUpdate").mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(null)
    });

    const res = await request(app)
      .patch(`/api/v1/admin/customers/${customerUserId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isActive: false });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("CUSTOMER_NOT_FOUND");
  });

  it("returns 404 CUSTOMER_NOT_FOUND when target is an admin account", async () => {
    vi.spyOn(User, "findById").mockResolvedValue({
      _id: adminUserId,
      email: "admin@example.com",
      role: "admin",
      isActive: true
    });

    // The atomic filter { _id: targetAdminId, role: "customer" } naturally matches 0 records
    vi.spyOn(User, "findOneAndUpdate").mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(null)
    });

    const otherAdminId = "507f1f77bcf86cd799439099";
    const res = await request(app)
      .patch(`/api/v1/admin/customers/${otherAdminId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isActive: false });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("CUSTOMER_NOT_FOUND");
    expect(User.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: otherAdminId, role: "customer" },
      { $set: { isActive: false } },
      { new: true, runValidators: true }
    );
  });

  it("returns 404 CUSTOMER_NOT_FOUND and prevents admin from deactivating themselves", async () => {
    vi.spyOn(User, "findById").mockResolvedValue({
      _id: adminUserId,
      email: "admin@example.com",
      role: "admin",
      isActive: true
    });

    const res = await request(app)
      .patch(`/api/v1/admin/customers/${adminUserId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isActive: false });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("CUSTOMER_NOT_FOUND");
  });

  it("successfully updates customer status and returns safe projection without password or secrets", async () => {
    vi.spyOn(User, "findById").mockResolvedValue({
      _id: adminUserId,
      email: "admin@example.com",
      role: "admin",
      isActive: true
    });

    const updatedCustomer = {
      _id: customerUserId,
      name: "Jane Customer",
      email: "jane@example.com",
      role: "customer",
      isActive: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    vi.spyOn(User, "findOneAndUpdate").mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(updatedCustomer)
    });

    const res = await request(app)
      .patch(`/api/v1/admin/customers/${customerUserId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("Customer status updated successfully");
    expect(res.body.data.customer.id).toBe(customerUserId);
    expect(res.body.data.customer.isActive).toBe(false);
    expect(res.body.data.customer.role).toBe("customer");
    expect(res.body.data.customer.password).toBeUndefined();
    expect(res.body.data.customer.passwordHash).toBeUndefined();
  });

  it("commerce data preservation: status update does not delete or alter orders, addresses, reviews, wishlist, or cart", async () => {
    vi.spyOn(User, "findById").mockResolvedValue({
      _id: adminUserId,
      email: "admin@example.com",
      role: "admin",
      isActive: true
    });

    const updatedCustomer = {
      _id: customerUserId,
      name: "Jane Customer",
      email: "jane@example.com",
      role: "customer",
      isActive: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    vi.spyOn(User, "findOneAndUpdate").mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(updatedCustomer)
    });

    const orderDeleteSpy = vi.spyOn(Order, "deleteMany");
    const addressDeleteSpy = vi.spyOn(Address, "deleteMany");
    const reviewDeleteSpy = vi.spyOn(Review, "deleteMany");
    const wishlistDeleteSpy = vi.spyOn(WishlistItem, "deleteMany");
    const cartDeleteSpy = vi.spyOn(Cart, "deleteMany");

    const res = await request(app)
      .patch(`/api/v1/admin/customers/${customerUserId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isActive: false });

    expect(res.status).toBe(200);
    // Verify no cascade deletion calls on commerce models
    expect(orderDeleteSpy).not.toHaveBeenCalled();
    expect(addressDeleteSpy).not.toHaveBeenCalled();
    expect(reviewDeleteSpy).not.toHaveBeenCalled();
    expect(wishlistDeleteSpy).not.toHaveBeenCalled();
    expect(cartDeleteSpy).not.toHaveBeenCalled();
  });

  it("session integration: existing token for deactivated customer is rejected with ACCOUNT_DEACTIVATED on subsequent protected requests", async () => {
    // When customer is deactivated, User.findById in authMiddleware returns isActive: false
    vi.spyOn(User, "findById").mockResolvedValue({
      _id: customerUserId,
      email: "customer@example.com",
      role: "customer",
      isActive: false
    });

    const res = await request(app)
      .get("/api/v1/users/me")
      .set("Authorization", `Bearer ${customerToken}`);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("ACCOUNT_DEACTIVATED");
    expect(res.body.error.message).toBe("User account is deactivated");
  });
});
