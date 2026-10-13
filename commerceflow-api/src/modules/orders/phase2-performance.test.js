import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import Order from "./order.model.js";
import Product from "../products/product.model.js";
import SkuRegistry from "../products/sku-registry.model.js";
import User from "../users/user.model.js";
import generateToken from "../../utils/generate-token.js";
import {
  calculateSalesOverview,
  calculateTopSellingProducts
} from "../dashboard/admin-dashboard.controller.js";
import getAdminOrders from "./get-admin-orders.controller.js";

describe("Phase 2 Database Performance, Indexing & Query-Safety Hardening", () => {
  let app;
  const adminUserId = "507f1f77bcf86cd799439001";
  let adminToken;

  beforeEach(() => {
    vi.restoreAllMocks();
    app = createApp();
    adminToken = generateToken({ userId: adminUserId });

    vi.spyOn(User, "findById").mockResolvedValue({
      _id: adminUserId,
      email: "admin@example.com",
      role: "admin",
      isActive: true
    });
  });

  describe("1 & 2 & 3. Dashboard Top-Products & Sales Bounds", () => {
    it("bounds calculateTopSellingProducts to time window and projects before $unwind", async () => {
      let pipelineCaptured = null;
      vi.spyOn(Order, "aggregate").mockImplementation((pipeline) => {
        pipelineCaptured = pipeline;
        return Promise.resolve([]);
      });

      await calculateTopSellingProducts(5, "30d");

      expect(pipelineCaptured).toBeDefined();
      // 1. Time bounded
      expect(pipelineCaptured[0].$match).toHaveProperty("createdAt");
      expect(pipelineCaptured[0].$match.createdAt).toHaveProperty("$gte");

      // 3. Excludes cancelled orders and unconfirmed payments
      expect(pipelineCaptured[0].$match.status).toEqual({ $ne: "cancelled" });
      expect(pipelineCaptured[0].$match["payment.status"]).toBe("paid");

      // Stage ordering: $match -> $project -> $unwind -> $group -> $sort -> $limit
      expect(pipelineCaptured[1]).toEqual({
        $project: {
          "items.product": 1,
          "items.name": 1,
          "items.sku": 1,
          "items.quantity": 1,
          "items.subtotal": 1
        }
      });
      expect(pipelineCaptured[2]).toEqual({ $unwind: "$items" });
      expect(pipelineCaptured[3]).toHaveProperty("$group");
      expect(pipelineCaptured[4]).toEqual({ $sort: { unitsSold: -1, revenue: -1 } });
      expect(pipelineCaptured[5]).toEqual({ $limit: 5 });
    });

    it("preserves 7d, 30d, 90d periods in calculateSalesOverview", async () => {
      vi.spyOn(Order, "aggregate").mockResolvedValue([]);

      const s7 = await calculateSalesOverview("7d");
      expect(s7.period).toBe("7d");
      expect(s7.points).toHaveLength(7);

      const s30 = await calculateSalesOverview("30d");
      expect(s30.period).toBe("30d");
      expect(s30.points).toHaveLength(30);

      const s90 = await calculateSalesOverview("90d");
      expect(s90.period).toBe("90d");
      expect(s90.points).toHaveLength(90);
    });
  });

  describe("4 & 5. Admin Orders Deterministic Sorting & Pagination Bounds", () => {
    it("enforces deterministic tiebreaker on admin orders sorting", async () => {
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([])
      };
      vi.spyOn(Order, "countDocuments").mockResolvedValue(0);
      vi.spyOn(Order, "find").mockReturnValue(mockQuery);

      const req = {
        query: { page: "1", limit: "10", sortBy: "createdAt", sortOrder: "desc" },
        requestId: "test-req"
      };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await getAdminOrders(req, res, next);

      expect(mockQuery.sort).toHaveBeenCalledWith({
        createdAt: -1,
        _id: -1
      });
    });

    it("enforces max page size limit on GET /api/v1/admin/orders", async () => {
      const res = await request(app)
        .get("/api/v1/admin/orders?page=1&limit=250")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("6. Admin Inventory Pagination Bounds", () => {
    it("enforces max page size limit on GET /api/v1/admin/inventory", async () => {
      const res = await request(app)
        .get("/api/v1/admin/inventory?page=1&limit=500")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("enforces max page size limit on GET /api/v1/admin/inventory/adjustments", async () => {
      const res = await request(app)
        .get("/api/v1/admin/inventory/adjustments?page=1&limit=500")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("7 & 8. SKU and Variant SKU Index Architecture", () => {
    it("verifies SkuRegistry is authoritative for global unique SKU lookup", () => {
      const skuIndexes = SkuRegistry.schema.indexes();
      expect(skuIndexes).toContainEqual([
        { sku: 1 },
        { unique: true }
      ]);
    });

    it("verifies Product schema does not define an unsafe unique root SKU index", () => {
      const productIndexes = Product.schema.indexes();
      const rootSkuIndex = productIndexes.find(
        ([fields]) => fields && fields.sku !== undefined
      );
      expect(rootSkuIndex).toBeUndefined();
    });
  });

  describe("9. Order Indexes & P1.6 Behavior Verification", () => {
    it("verifies evidence-backed compound index { status: 1, createdAt: -1 } exists on Order", () => {
      const orderIndexes = Order.schema.indexes();

      expect(orderIndexes).toContainEqual([
        { status: 1, createdAt: -1 },
        {}
      ]);

      expect(orderIndexes).toContainEqual([
        { user: 1, createdAt: -1 },
        {}
      ]);

      expect(orderIndexes).toContainEqual([
        { user: 1, status: 1, createdAt: -1 },
        {}
      ]);

      expect(orderIndexes).toContainEqual([
        { "payment.status": 1, createdAt: -1 },
        {}
      ]);
    });
  });
});
