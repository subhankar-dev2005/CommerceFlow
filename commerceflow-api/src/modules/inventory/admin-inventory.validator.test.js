import { describe, it, expect } from "vitest";
import {
  getAdminInventorySchema,
  adjustStockSchema,
  getInventoryAdjustmentsSchema
} from "./admin-inventory.validator.js";

describe("Admin Inventory Validator Tests", () => {
  describe("getAdminInventorySchema", () => {
    it("applies defaults when empty query is provided", () => {
      const parsed = getAdminInventorySchema.parse({ query: {} });

      expect(parsed.query.page).toBe(1);
      expect(parsed.query.limit).toBe(10);
      expect(parsed.query.status).toBe("all");
      expect(parsed.query.stock).toBe("all");
      expect(parsed.query.type).toBe("all");
      expect(parsed.query.sortBy).toBe("createdAt");
      expect(parsed.query.sortOrder).toBe("desc");
    });

    it("parses valid pagination, search, and filter options", () => {
      const parsed = getAdminInventorySchema.parse({
        query: {
          page: "2",
          limit: "25",
          search: "  alpine tent  ",
          status: "active",
          stock: "lowStock",
          type: "variant",
          sortBy: "stock",
          sortOrder: "asc"
        }
      });

      expect(parsed.query.page).toBe(2);
      expect(parsed.query.limit).toBe(25);
      expect(parsed.query.search).toBe("alpine tent");
      expect(parsed.query.status).toBe("active");
      expect(parsed.query.stock).toBe("lowStock");
      expect(parsed.query.type).toBe("variant");
      expect(parsed.query.sortBy).toBe("stock");
      expect(parsed.query.sortOrder).toBe("asc");
    });

    it("rejects invalid stock filter value", () => {
      expect(() =>
        getAdminInventorySchema.parse({ query: { stock: "negativeStock" } })
      ).toThrow();
    });

    it("rejects invalid type filter value", () => {
      expect(() =>
        getAdminInventorySchema.parse({ query: { type: "composite" } })
      ).toThrow();
    });

    it("rejects non-positive page number", () => {
      expect(() =>
        getAdminInventorySchema.parse({ query: { page: "0" } })
      ).toThrow();
    });
  });

  describe("adjustStockSchema", () => {
    it("validates a correct simple product stock adjustment payload", () => {
      const parsed = adjustStockSchema.parse({
        body: {
          productId: "507f1f77bcf86cd799439011",
          adjustment: 15,
          reason: "receiving",
          note: "Warehouse shipment restock"
        }
      });

      expect(parsed.body.productId).toBe("507f1f77bcf86cd799439011");
      expect(parsed.body.variantId).toBeUndefined();
      expect(parsed.body.adjustment).toBe(15);
      expect(parsed.body.reason).toBe("receiving");
      expect(parsed.body.note).toBe("Warehouse shipment restock");
    });

    it("validates a correct variant stock adjustment payload", () => {
      const parsed = adjustStockSchema.parse({
        body: {
          productId: "507f1f77bcf86cd799439011",
          variantId: "var_blue_xl",
          adjustment: -3,
          reason: "damaged_inventory",
          note: "Water damage"
        }
      });

      expect(parsed.body.productId).toBe("507f1f77bcf86cd799439011");
      expect(parsed.body.variantId).toBe("var_blue_xl");
      expect(parsed.body.adjustment).toBe(-3);
      expect(parsed.body.reason).toBe("damaged_inventory");
      expect(parsed.body.note).toBe("Water damage");
    });

    it("rejects zero adjustment quantity", () => {
      expect(() =>
        adjustStockSchema.parse({
          body: {
            productId: "507f1f77bcf86cd799439011",
            adjustment: 0,
            reason: "manual_count"
          }
        })
      ).toThrow("Adjustment quantity cannot be zero");
    });

    it("rejects invalid ObjectId for productId", () => {
      expect(() =>
        adjustStockSchema.parse({
          body: {
            productId: "invalid-id",
            adjustment: 5,
            reason: "stock_correction"
          }
        })
      ).toThrow("Invalid product ID format");
    });

    it("rejects unknown adjustment reason", () => {
      expect(() =>
        adjustStockSchema.parse({
          body: {
            productId: "507f1f77bcf86cd799439011",
            adjustment: 5,
            reason: "stolen_goods"
          }
        })
      ).toThrow();
    });

    it("rejects note exceeding 500 characters", () => {
      expect(() =>
        adjustStockSchema.parse({
          body: {
            productId: "507f1f77bcf86cd799439011",
            adjustment: 5,
            reason: "other",
            note: "x".repeat(501)
          }
        })
      ).toThrow("Note cannot exceed 500 characters");
    });
  });

  describe("getInventoryAdjustmentsSchema", () => {
    it("parses valid query parameters with defaults", () => {
      const parsed = getInventoryAdjustmentsSchema.parse({ query: {} });
      expect(parsed.query.page).toBe(1);
      expect(parsed.query.limit).toBe(20);
    });

    it("accepts valid productId filter", () => {
      const parsed = getInventoryAdjustmentsSchema.parse({
        query: { productId: "507f1f77bcf86cd799439011", page: "2", limit: "15" }
      });
      expect(parsed.query.productId).toBe("507f1f77bcf86cd799439011");
      expect(parsed.query.page).toBe(2);
      expect(parsed.query.limit).toBe(15);
    });
  });
});
