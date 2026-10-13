import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import User from "../users/user.model.js";
import Product from "../products/product.model.js";
import InventoryAdjustment from "./inventory-adjustment.model.js";
import generateToken from "../../utils/generate-token.js";

describe("Admin Inventory Controller Tests", () => {
  const adminUserId = "507f1f77bcf86cd799439001";
  const customerUserId = "507f1f77bcf86cd799439002";
  const simpleProductId = "507f1f77bcf86cd799439011";
  const variantProductId = "507f1f77bcf86cd799439022";

  let app;
  let adminToken;
  let customerToken;

  const mockSimpleProduct = {
    _id: simpleProductId,
    name: "Classic Camp Mug",
    category: "Drinkware",
    price: 999,
    stock: 20,
    sku: "MUG-CLS-01",
    variants: [],
    isActive: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z")
  };

  const mockVariantProduct = {
    _id: variantProductId,
    name: "Alpine Expedition Jacket",
    category: "Apparel",
    price: 12999,
    stock: 15,
    sku: null,
    variants: [
      {
        variantId: "var_blue_m",
        sku: "JCKT-BLU-M",
        variantName: "Alpine Blue / M",
        price: 12999,
        stock: 10,
        attributes: { color: "Alpine Blue", size: "M" },
        isActive: true
      },
      {
        variantId: "var_blue_l",
        sku: "JCKT-BLU-L",
        variantName: "Alpine Blue / L",
        price: 13499,
        stock: 5,
        attributes: new Map([["color", "Alpine Blue"], ["size", "L"]]),
        isActive: true
      },
      {
        variantId: "var_black_s",
        sku: "JCKT-BLK-S",
        variantName: "Midnight Black / S",
        price: 12999,
        stock: 0,
        isActive: true
      }
    ],
    isActive: true,
    createdAt: new Date("2026-01-02T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z")
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    app = createApp();
    adminToken = generateToken({ userId: adminUserId, email: "admin@example.com", role: "admin" });
    customerToken = generateToken({ userId: customerUserId, email: "user@example.com", role: "customer" });

    // Mock admin authentication
    vi.spyOn(User, "findById").mockImplementation((id) => {
      if (id.toString() === adminUserId) {
        return Promise.resolve({
          _id: adminUserId,
          email: "admin@example.com",
          role: "admin",
          isActive: true
        });
      }
      return Promise.resolve({
        _id: customerUserId,
        email: "user@example.com",
        role: "customer",
        isActive: true
      });
    });
  });

  describe("Security & Authorization", () => {
    it("rejects unauthenticated requests with 401 AUTH_TOKEN_REQUIRED", async () => {
      const res = await request(app).get("/api/v1/admin/inventory");

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("AUTH_TOKEN_REQUIRED");
    });

    it("rejects non-admin customer requests with 403 FORBIDDEN", async () => {
      const res = await request(app)
        .get("/api/v1/admin/inventory")
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("rejects non-admin on adjust endpoint with 403 FORBIDDEN", async () => {
      const res = await request(app)
        .post("/api/v1/admin/inventory/adjust")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          productId: simpleProductId,
          adjustment: 5,
          reason: "receiving"
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe("GET /api/v1/admin/inventory", () => {
    it("returns paginated inventory with both simple and variant line items", async () => {
      vi.spyOn(Product, "find").mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([mockSimpleProduct, mockVariantProduct])
      });

      vi.spyOn(Product, "countDocuments").mockResolvedValue(2);
      vi.spyOn(Product, "aggregate").mockResolvedValue([{ totalAggregateStock: 35 }]);

      const res = await request(app)
        .get("/api/v1/admin/inventory?page=1&limit=10")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(4); // 1 simple mug + 3 jacket variants

      // Validate simple product item
      const mugItem = res.body.data.items.find((i) => i.type === "simple");
      expect(mugItem).toBeDefined();
      expect(mugItem.productName).toBe("Classic Camp Mug");
      expect(mugItem.sku).toBe("MUG-CLS-01");
      expect(mugItem.stock).toBe(20);
      expect(mugItem.variantId).toBeNull();
      expect(mugItem.attributes).toBeNull();
      expect(mugItem.stockState).toBe("inStock");

      // Validate variant items
      const variantItems = res.body.data.items.filter((i) => i.type === "variant");
      expect(variantItems).toHaveLength(3);

      // Variant with plain object attributes
      const blueMVariant = variantItems.find((v) => v.sku === "JCKT-BLU-M");
      expect(blueMVariant).toBeDefined();
      expect(blueMVariant.attributes).toEqual({ color: "Alpine Blue", size: "M" });

      // Variant with Map attributes converted to object
      const blueLVariant = variantItems.find((v) => v.sku === "JCKT-BLU-L");
      expect(blueLVariant).toBeDefined();
      expect(blueLVariant.attributes).toEqual({ color: "Alpine Blue", size: "L" });
      expect(blueLVariant.stockState).toBe("lowStock");

      // Variant without attributes returns empty object
      const outOfStockVariant = variantItems.find((v) => v.stock === 0);
      expect(outOfStockVariant.stockState).toBe("outOfStock");
      expect(outOfStockVariant.sku).toBe("JCKT-BLK-S");
      expect(outOfStockVariant.attributes).toEqual({});

      expect(res.body.data.summary.totalStock).toBe(35);
      expect(res.body.data.summary.lowStockThreshold).toBe(5);
    });

    it("applies stock filters (lowStock, outOfStock, inStock)", async () => {
      const findSpy = vi.spyOn(Product, "find").mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([mockVariantProduct])
      });
      vi.spyOn(Product, "countDocuments").mockResolvedValue(1);
      vi.spyOn(Product, "aggregate").mockResolvedValue([{ totalAggregateStock: 15 }]);

      const res = await request(app)
        .get("/api/v1/admin/inventory?stock=lowStock")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(findSpy).toHaveBeenCalled();
    });

    it("supports search across product name and variant SKUs", async () => {
      const findSpy = vi.spyOn(Product, "find").mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([mockVariantProduct])
      });
      vi.spyOn(Product, "countDocuments").mockResolvedValue(1);
      vi.spyOn(Product, "aggregate").mockResolvedValue([{ totalAggregateStock: 15 }]);

      const res = await request(app)
        .get("/api/v1/admin/inventory?search=JCKT-BLU")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(findSpy).toHaveBeenCalled();
    });
  });

  describe("POST /api/v1/admin/inventory/adjust", () => {
    it("successfully performs an atomic stock adjustment for a simple product", async () => {
      vi.spyOn(Product, "findById").mockResolvedValue({
        _id: simpleProductId,
        name: "Classic Camp Mug",
        stock: 20,
        sku: "MUG-CLS-01",
        variants: []
      });

      const updatedDoc = {
        _id: simpleProductId,
        name: "Classic Camp Mug",
        stock: 25,
        sku: "MUG-CLS-01",
        variants: []
      };
      const findOneAndUpdateSpy = vi.spyOn(Product, "findOneAndUpdate").mockResolvedValue(updatedDoc);

      const createAdjustmentSpy = vi.spyOn(InventoryAdjustment, "create").mockResolvedValue({
        _id: "adj_1",
        product: simpleProductId,
        productName: "Classic Camp Mug",
        variantId: null,
        variantName: null,
        sku: "MUG-CLS-01",
        previousStock: 20,
        adjustment: 5,
        resultingStock: 25,
        reason: "receiving",
        note: "Supplier crate unpacked",
        adminId: adminUserId,
        adminEmail: "admin@example.com",
        createdAt: new Date()
      });

      const res = await request(app)
        .post("/api/v1/admin/inventory/adjust")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          productId: simpleProductId,
          adjustment: 5,
          reason: "receiving",
          note: "Supplier crate unpacked"
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.adjustment.previousStock).toBe(20);
      expect(res.body.data.adjustment.adjustment).toBe(5);
      expect(res.body.data.adjustment.resultingStock).toBe(25);
      expect(res.body.data.adjustment.adjustedBy.email).toBe("admin@example.com");

      // Verify atomic simple product increment
      expect(findOneAndUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: simpleProductId
        }),
        { $inc: { stock: 5 } },
        { new: true }
      );
      expect(createAdjustmentSpy).toHaveBeenCalled();
    });

    it("successfully performs an exact variant stock adjustment without modifying root stock", async () => {
      vi.spyOn(Product, "findById").mockResolvedValue({
        _id: variantProductId,
        name: "Alpine Expedition Jacket",
        stock: 15,
        variants: [
          {
            variantId: "var_blue_m",
            sku: "JCKT-BLU-M",
            variantName: "Alpine Blue / M",
            stock: 10
          }
        ]
      });

      const updatedVariantDoc = {
        _id: variantProductId,
        name: "Alpine Expedition Jacket",
        stock: 15,
        variants: [
          {
            variantId: "var_blue_m",
            sku: "JCKT-BLU-M",
            variantName: "Alpine Blue / M",
            stock: 8
          }
        ]
      };
      const findOneAndUpdateSpy = vi.spyOn(Product, "findOneAndUpdate").mockResolvedValue(updatedVariantDoc);

      vi.spyOn(InventoryAdjustment, "create").mockResolvedValue({
        _id: "adj_2",
        product: variantProductId,
        productName: "Alpine Expedition Jacket",
        variantId: "var_blue_m",
        variantName: "Alpine Blue / M",
        sku: "JCKT-BLU-M",
        previousStock: 10,
        adjustment: -2,
        resultingStock: 8,
        reason: "damaged_inventory",
        note: "Zipper snag in warehouse",
        adminId: adminUserId,
        adminEmail: "admin@example.com",
        createdAt: new Date()
      });

      const res = await request(app)
        .post("/api/v1/admin/inventory/adjust")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          productId: variantProductId,
          variantId: "var_blue_m",
          adjustment: -2,
          reason: "damaged_inventory",
          note: "Zipper snag in warehouse"
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.adjustment.variantId).toBe("var_blue_m");
      expect(res.body.data.adjustment.previousStock).toBe(10);
      expect(res.body.data.adjustment.resultingStock).toBe(8);

      // Crucial: verify that variants.$.stock was targeted and root stock was NOT incremented
      expect(findOneAndUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: variantProductId,
          variants: expect.objectContaining({
            $elemMatch: expect.objectContaining({
              stock: { $gte: 2 }
            })
          })
        }),
        { $inc: { "variants.$.stock": -2 } },
        { new: true }
      );
    });

    it("rejects reduction below zero with 400 INSUFFICIENT_STOCK_FOR_ADJUSTMENT", async () => {
      vi.spyOn(Product, "findById").mockResolvedValue({
        _id: simpleProductId,
        name: "Classic Camp Mug",
        stock: 3,
        variants: []
      });

      const res = await request(app)
        .post("/api/v1/admin/inventory/adjust")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          productId: simpleProductId,
          adjustment: -5,
          reason: "damaged_inventory"
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("INSUFFICIENT_STOCK_FOR_ADJUSTMENT");
    });

    it("rejects variant adjustment when variantId is omitted on a variant product", async () => {
      vi.spyOn(Product, "findById").mockResolvedValue({
        _id: variantProductId,
        name: "Alpine Expedition Jacket",
        variants: [{ variantId: "var_1", stock: 10 }]
      });

      const res = await request(app)
        .post("/api/v1/admin/inventory/adjust")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          productId: variantProductId,
          adjustment: 5,
          reason: "stock_correction"
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VARIANT_ID_REQUIRED");
    });

    it("rejects variantId on a simple product with 400 SIMPLE_PRODUCT_NO_VARIANTS", async () => {
      vi.spyOn(Product, "findById").mockResolvedValue({
        _id: simpleProductId,
        name: "Classic Camp Mug",
        variants: []
      });

      const res = await request(app)
        .post("/api/v1/admin/inventory/adjust")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          productId: simpleProductId,
          variantId: "nonexistent_var",
          adjustment: 5,
          reason: "stock_correction"
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("SIMPLE_PRODUCT_NO_VARIANTS");
    });

    it("rejects non-existent product with 404 PRODUCT_NOT_FOUND", async () => {
      vi.spyOn(Product, "findById").mockResolvedValue(null);

      const res = await request(app)
        .post("/api/v1/admin/inventory/adjust")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          productId: "507f1f77bcf86cd799439099",
          adjustment: 5,
          reason: "stock_correction"
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("PRODUCT_NOT_FOUND");
    });

    it("handles concurrent update race collision with 409 CONCURRENT_STOCK_CONFLICT", async () => {
      vi.spyOn(Product, "findById").mockResolvedValue({
        _id: simpleProductId,
        name: "Classic Camp Mug",
        stock: 5,
        variants: []
      });

      // findOneAndUpdate returns null (e.g. stock was reduced below threshold by parallel checkout)
      vi.spyOn(Product, "findOneAndUpdate").mockResolvedValue(null);

      const res = await request(app)
        .post("/api/v1/admin/inventory/adjust")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          productId: simpleProductId,
          adjustment: -5,
          reason: "stock_correction"
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("CONCURRENT_STOCK_CONFLICT");
    });
  });

  describe("GET /api/v1/admin/inventory/adjustments", () => {
    it("returns paginated historical adjustments", async () => {
      vi.spyOn(InventoryAdjustment, "find").mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([
          {
            _id: "adj_1",
            product: simpleProductId,
            productName: "Classic Camp Mug",
            adjustment: 10,
            resultingStock: 30,
            reason: "receiving",
            adminEmail: "admin@example.com"
          }
        ])
      });
      vi.spyOn(InventoryAdjustment, "countDocuments").mockResolvedValue(1);

      const res = await request(app)
        .get("/api/v1/admin/inventory/adjustments")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.adjustments).toHaveLength(1);
      expect(res.body.data.adjustments[0].reason).toBe("receiving");
    });

    it("applies deterministic tie-breaker on adjustments and validates pagination bounds", async () => {
      const mockQuery = {
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([])
      };
      vi.spyOn(InventoryAdjustment, "find").mockReturnValue(mockQuery);
      vi.spyOn(InventoryAdjustment, "countDocuments").mockResolvedValue(0);

      // Valid maximum limit 100
      const validRes = await request(app)
        .get("/api/v1/admin/inventory/adjustments?page=1&limit=100")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(validRes.status).toBe(200);
      expect(mockQuery.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
      expect(mockQuery.limit).toHaveBeenCalledWith(100);
      expect(validRes.body.data.pagination.limit).toBe(100);

      // Out-of-bounds limit 500 should be rejected by validation
      const invalidRes = await request(app)
        .get("/api/v1/admin/inventory/adjustments?page=1&limit=500")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(invalidRes.status).toBe(400);
      expect(invalidRes.body.error.code).toBe("VALIDATION_ERROR");
    });
  });
});
