import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import Product from "../products/product.model.js";
import Order from "../orders/order.model.js";
import User from "../users/user.model.js";
import generateToken from "../../utils/generate-token.js";
import {
  calculateSalesOverview,
  calculateTopSellingProducts,
  getDashboardSummary,
  getDashboardSales,
  getDashboardTopProducts
} from "./admin-dashboard.controller.js";

describe("Admin Dashboard Controller & Routes Integration Tests", () => {
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

  describe("Security & Authorization Gates", () => {
    it("1. rejects unauthenticated requests with 401 AUTH_TOKEN_REQUIRED", async () => {
      const res = await request(app).get("/api/v1/admin/dashboard/summary");
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("AUTH_TOKEN_REQUIRED");
    });

    it("2. rejects non-admin users with 403 FORBIDDEN", async () => {
      vi.spyOn(User, "findById").mockResolvedValue({
        _id: customerUserId,
        email: "customer@example.com",
        role: "customer",
        isActive: true
      });

      const res = await request(app)
        .get("/api/v1/admin/dashboard/summary")
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("3. ignores client-supplied role or user ID in query/body", async () => {
      const res = await request(app)
        .get("/api/v1/admin/dashboard/summary?role=admin&userId=" + adminUserId);

      expect(res.status).toBe(401);
    });

    it("4. allows authenticated admin users to access dashboard summary", async () => {
      vi.spyOn(User, "findById").mockResolvedValue({
        _id: adminUserId,
        email: "admin@example.com",
        role: "admin",
        isActive: true
      });

      vi.spyOn(Product, "countDocuments").mockResolvedValue(10);
      vi.spyOn(Order, "countDocuments").mockResolvedValue(5);
      vi.spyOn(Product, "distinct").mockResolvedValue(["Tents", "Boots"]);
      vi.spyOn(Order, "aggregate").mockResolvedValue([]);

      const orderFindMock = {
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([])
      };
      vi.spyOn(Order, "find").mockReturnValue(orderFindMock);

      const productFindMock = {
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([])
      };
      vi.spyOn(Product, "find").mockReturnValue(productFindMock);

      const res = await request(app)
        .get("/api/v1/admin/dashboard/summary")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty("summary");
      expect(res.body.data).toHaveProperty("sales");
      expect(res.body.data).toHaveProperty("recentOrders");
      expect(res.body.data).toHaveProperty("recentProducts");
      expect(res.body.data).toHaveProperty("topSellingProducts");
    });
  });

  describe("Server-Authoritative Metrics & Data Integrity", () => {
    beforeEach(() => {
      vi.spyOn(User, "findById").mockResolvedValue({
        _id: adminUserId,
        email: "admin@example.com",
        role: "admin",
        isActive: true
      });
    });

    it("5. calculates real product counts, active counts, low-stock, and categories", async () => {
      const countSpy = vi.spyOn(Product, "countDocuments");
      countSpy.mockImplementation((filter) => {
        if (!filter || Object.keys(filter).length === 0) return Promise.resolve(25);
        if (filter.isActive === true) return Promise.resolve(20);
        if (filter.stock === 0) return Promise.resolve(2);
        if (filter.stock && filter.stock.$gt === 0 && filter.stock.$lte === 5) return Promise.resolve(3);
        return Promise.resolve(0);
      });

      vi.spyOn(Product, "distinct").mockResolvedValue(["Apparel", "Footwear", "Equipment"]);

      vi.spyOn(Order, "countDocuments").mockImplementation((filter) => {
        if (!filter || Object.keys(filter).length === 0) return Promise.resolve(15);
        if (filter.status && filter.status.$in) return Promise.resolve(4);
        return Promise.resolve(0);
      });

      vi.spyOn(Order, "aggregate").mockImplementation((pipeline) => {
        // Revenue aggregate check
        if (pipeline[1] && pipeline[1].$group && pipeline[1].$group.totalRevenue) {
          return Promise.resolve([{ _id: null, totalRevenue: 125000 }]);
        }
        return Promise.resolve([]);
      });

      const orderFindMock = {
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([])
      };
      vi.spyOn(Order, "find").mockReturnValue(orderFindMock);

      const productFindMock = {
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([])
      };
      vi.spyOn(Product, "find").mockReturnValue(productFindMock);

      const res = await request(app)
        .get("/api/v1/admin/dashboard/summary")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const summary = res.body.data.summary;
      expect(summary.totalProducts).toBe(25);
      expect(summary.activeProducts).toBe(20);
      expect(summary.outOfStockProducts).toBe(2);
      expect(summary.lowStockProducts).toBe(3);
      expect(summary.totalCategories).toBe(3);
      expect(summary.totalOrders).toBe(15);
      expect(summary.pendingOrders).toBe(4);
      expect(summary.totalRevenue).toBe(125000);
    });

    it("6. revenue aggregation accurately matches non-cancelled and paid orders", async () => {
      let revenueMatch = null;
      vi.spyOn(Order, "aggregate").mockImplementation((pipeline) => {
        if (pipeline[1]?.$group?.totalRevenue) {
          revenueMatch = pipeline[0].$match;
          return Promise.resolve([{ _id: null, totalRevenue: 9800 }]);
        }
        return Promise.resolve([]);
      });

      vi.spyOn(Product, "countDocuments").mockResolvedValue(0);
      vi.spyOn(Order, "countDocuments").mockResolvedValue(0);
      vi.spyOn(Product, "distinct").mockResolvedValue([]);

      const mockFind = {
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([])
      };
      vi.spyOn(Order, "find").mockReturnValue(mockFind);
      vi.spyOn(Product, "find").mockReturnValue(mockFind);

      const res = await request(app)
        .get("/api/v1/admin/dashboard/summary")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(revenueMatch).toEqual({
        status: { $ne: "cancelled" },
        "payment.status": "paid"
      });
      expect(res.body.data.summary.totalRevenue).toBe(9800);
    });

    it("7. recent orders are bounded and strip sensitive compensation and payment internals", async () => {
      const mockOrders = [
        {
          _id: "507f1f77bcf86cd799439011",
          user: { name: "John Doe", email: "john@example.com" },
          status: "confirmed",
          payment: { status: "paid", transactionId: "pay_secret_123" },
          total: 4500,
          totalQuantity: 2,
          checkoutCompensation: { secret: "must_not_leak" },
          createdAt: new Date("2026-10-01T12:00:00Z")
        }
      ];

      vi.spyOn(Product, "countDocuments").mockResolvedValue(0);
      vi.spyOn(Order, "countDocuments").mockResolvedValue(1);
      vi.spyOn(Product, "distinct").mockResolvedValue([]);
      vi.spyOn(Order, "aggregate").mockResolvedValue([]);

      const orderFindMock = {
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(mockOrders)
      };
      vi.spyOn(Order, "find").mockReturnValue(orderFindMock);

      const productFindMock = {
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([])
      };
      vi.spyOn(Product, "find").mockReturnValue(productFindMock);

      const res = await request(app)
        .get("/api/v1/admin/dashboard/summary")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(orderFindMock.limit).toHaveBeenCalledWith(6);
      const orders = res.body.data.recentOrders;
      expect(orders).toHaveLength(1);
      expect(orders[0].customerName).toBe("John Doe");
      expect(orders[0].total).toBe(4500);
      expect(orders[0].status).toBe("confirmed");
      expect(orders[0]).not.toHaveProperty("checkoutCompensation");
    });

    it("8. recent products handles variant-aware stock, image, and SKUs correctly", async () => {
      const mockProducts = [
        {
          _id: "607f1f77bcf86cd799439022",
          name: "Alpine Tent",
          category: "Camping",
          price: 12000,
          stock: 8,
          isActive: true,
          variants: [
            { variantId: "var_1", sku: "ALP-TENT-GRN", stock: 5, images: ["https://example.com/green.jpg"] },
            { variantId: "var_2", sku: "ALP-TENT-BLU", stock: 3, images: ["https://example.com/blue.jpg"] }
          ],
          createdAt: new Date()
        }
      ];

      vi.spyOn(Product, "countDocuments").mockResolvedValue(1);
      vi.spyOn(Order, "countDocuments").mockResolvedValue(0);
      vi.spyOn(Product, "distinct").mockResolvedValue(["Camping"]);
      vi.spyOn(Order, "aggregate").mockResolvedValue([]);

      const orderFindMock = {
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([])
      };
      vi.spyOn(Order, "find").mockReturnValue(orderFindMock);

      const productFindMock = {
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(mockProducts)
      };
      vi.spyOn(Product, "find").mockReturnValue(productFindMock);

      const res = await request(app)
        .get("/api/v1/admin/dashboard/summary")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(productFindMock.limit).toHaveBeenCalledWith(6);
      const products = res.body.data.recentProducts;
      expect(products).toHaveLength(1);
      expect(products[0].hasVariants).toBe(true);
      expect(products[0].variantCount).toBe(2);
      expect(products[0].sku).toBe("ALP-TENT-GRN");
      expect(products[0].stock).toBe(8);
      expect(products[0].image).toBe("https://example.com/green.jpg");
    });

    it("9. empty database returns safe initial states with zero values and empty arrays", async () => {
      vi.spyOn(Product, "countDocuments").mockResolvedValue(0);
      vi.spyOn(Order, "countDocuments").mockResolvedValue(0);
      vi.spyOn(Product, "distinct").mockResolvedValue([]);
      vi.spyOn(Order, "aggregate").mockResolvedValue([]);

      const emptyMock = {
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([])
      };
      vi.spyOn(Order, "find").mockReturnValue(emptyMock);
      vi.spyOn(Product, "find").mockReturnValue(emptyMock);

      const res = await request(app)
        .get("/api/v1/admin/dashboard/summary")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.summary).toEqual({
        totalProducts: 0,
        activeProducts: 0,
        totalOrders: 0,
        pendingOrders: 0,
        lowStockProducts: 0,
        outOfStockProducts: 0,
        totalCategories: 0,
        totalRevenue: 0
      });
      expect(res.body.data.recentOrders).toEqual([]);
      expect(res.body.data.recentProducts).toEqual([]);
      expect(res.body.data.topSellingProducts).toEqual([]);
      expect(res.body.data.sales.points).toHaveLength(7);
      expect(res.body.data.sales.totalRevenue).toBe(0);
    });
  });

  describe("Sales Overview & Period Validation", () => {
    beforeEach(() => {
      vi.spyOn(User, "findById").mockResolvedValue({
        _id: adminUserId,
        email: "admin@example.com",
        role: "admin",
        isActive: true
      });
    });

    it("10. GET /sales defaults to 7d and returns continuous date points", async () => {
      vi.spyOn(Order, "aggregate").mockResolvedValue([
        { _id: new Date().toISOString().split("T")[0], revenue: 3500, orderCount: 2 }
      ]);

      const res = await request(app)
        .get("/api/v1/admin/dashboard/sales")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const sales = res.body.data.sales;
      expect(sales.period).toBe("7d");
      expect(sales.currency).toBe("INR");
      expect(sales.points).toHaveLength(7);
      expect(sales.totalRevenue).toBe(3500);
    });

    it("11. GET /sales?period=30d returns 30 continuous date buckets", async () => {
      vi.spyOn(Order, "aggregate").mockResolvedValue([]);

      const res = await request(app)
        .get("/api/v1/admin/dashboard/sales?period=30d")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.sales.period).toBe("30d");
      expect(res.body.data.sales.points).toHaveLength(30);
    });

    it("12. GET /sales rejects invalid period parameter with 400 validation error", async () => {
      const res = await request(app)
        .get("/api/v1/admin/dashboard/sales?period=invalid_period")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("13. GET /sales rejects out-of-range periods like 365d with 400 validation error", async () => {
      const res = await request(app)
        .get("/api/v1/admin/dashboard/sales?period=365d")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("Top Selling Products", () => {
    beforeEach(() => {
      vi.spyOn(User, "findById").mockResolvedValue({
        _id: adminUserId,
        email: "admin@example.com",
        role: "admin",
        isActive: true
      });
    });

    it("14. GET /top-products aggregates units sold and revenue from paid order line items", async () => {
      vi.spyOn(Order, "aggregate").mockResolvedValue([
        {
          _id: "507f1f77bcf86cd799439055",
          name: "Trail Backpack",
          sku: "BP-001",
          unitsSold: 12,
          revenue: 36000,
          image: "https://example.com/bp.jpg",
          category: "Bags",
          stock: 15
        }
      ]);

      const res = await request(app)
        .get("/api/v1/admin/dashboard/top-products")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const top = res.body.data.topSellingProducts;
      expect(top).toHaveLength(1);
      expect(top[0].name).toBe("Trail Backpack");
      expect(top[0].unitsSold).toBe(12);
      expect(top[0].revenue).toBe(36000);
    });

    it("15. calculateTopSellingProducts enforces period time-window and projection before $unwind", async () => {
      let capturedPipeline = null;
      vi.spyOn(Order, "aggregate").mockImplementation((pipeline) => {
        capturedPipeline = pipeline;
        return Promise.resolve([]);
      });

      await calculateTopSellingProducts(5, "30d");

      expect(capturedPipeline).toBeDefined();
      // Stage 0: $match with createdAt date bound
      expect(capturedPipeline[0].$match).toHaveProperty("createdAt");
      expect(capturedPipeline[0].$match.createdAt).toHaveProperty("$gte");
      expect(capturedPipeline[0].$match.status).toEqual({ $ne: "cancelled" });
      expect(capturedPipeline[0].$match["payment.status"]).toBe("paid");

      // Stage 1: $project before $unwind to prevent copying full documents into memory
      expect(capturedPipeline[1].$project).toEqual({
        "items.product": 1,
        "items.name": 1,
        "items.sku": 1,
        "items.quantity": 1,
        "items.subtotal": 1
      });

      // Stage 2: $unwind
      expect(capturedPipeline[2]).toEqual({ $unwind: "$items" });

      // Stage 3: $group
      expect(capturedPipeline[3]).toHaveProperty("$group");

      // Stage 4: $sort
      expect(capturedPipeline[4]).toEqual({ $sort: { unitsSold: -1, revenue: -1 } });

      // Stage 5: $limit
      expect(capturedPipeline[5]).toEqual({ $limit: 5 });
    });

    it("16. calculateTopSellingProducts with period='all' omits createdAt boundary", async () => {
      let capturedPipeline = null;
      vi.spyOn(Order, "aggregate").mockImplementation((pipeline) => {
        capturedPipeline = pipeline;
        return Promise.resolve([]);
      });

      await calculateTopSellingProducts(10, "all");

      expect(capturedPipeline[0].$match).not.toHaveProperty("createdAt");
      expect(capturedPipeline[0].$match.status).toEqual({ $ne: "cancelled" });
      expect(capturedPipeline[0].$match["payment.status"]).toBe("paid");
      expect(capturedPipeline[5]).toEqual({ $limit: 10 });
    });

    it("17. GET /top-products supports period query parameter", async () => {
      let capturedPipeline = null;
      vi.spyOn(Order, "aggregate").mockImplementation((pipeline) => {
        capturedPipeline = pipeline;
        return Promise.resolve([]);
      });

      const res = await request(app)
        .get("/api/v1/admin/dashboard/top-products?period=7d&limit=3")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(capturedPipeline[0].$match).toHaveProperty("createdAt");
      expect(capturedPipeline[5]).toEqual({ $limit: 3 });
    });

    it("18. GET /top-products rejects invalid period with 400 VALIDATION_ERROR", async () => {
      const res = await request(app)
        .get("/api/v1/admin/dashboard/top-products?period=unknown_range")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("19. GET /top-products rejects out-of-range limit (>50) with 400 VALIDATION_ERROR", async () => {
      const res = await request(app)
        .get("/api/v1/admin/dashboard/top-products?limit=100")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });
});
