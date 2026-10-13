import { describe, it, expect } from "vitest";
import {
  getAdminProductsSchema,
  updateProductStatusSchema
} from "./admin-product.validator.js";

describe("admin-product.validator tests", () => {
  describe("getAdminProductsSchema", () => {
    it("accepts valid default query params", () => {
      const result = getAdminProductsSchema.safeParse({
        query: {}
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query.page).toBe(1);
        expect(result.data.query.limit).toBe(10);
        expect(result.data.query.status).toBe("all");
        expect(result.data.query.stock).toBe("all");
        expect(result.data.query.hasVariants).toBe("all");
        expect(result.data.query.sortBy).toBe("createdAt");
        expect(result.data.query.sortOrder).toBe("desc");
      }
    });

    it("parses filter query params correctly", () => {
      const result = getAdminProductsSchema.safeParse({
        query: {
          page: "2",
          limit: "25",
          search: "Tent",
          category: "Camping",
          status: "active",
          stock: "lowStock",
          hasVariants: "true",
          sort: "price_asc"
        }
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query.page).toBe(2);
        expect(result.data.query.limit).toBe(25);
        expect(result.data.query.search).toBe("Tent");
        expect(result.data.query.category).toBe("Camping");
        expect(result.data.query.status).toBe("active");
        expect(result.data.query.stock).toBe("lowStock");
        expect(result.data.query.hasVariants).toBe("true");
        expect(result.data.query.sort).toBe("price_asc");
      }
    });

    it("rejects invalid page, limit, or filter enums", () => {
      const badPage = getAdminProductsSchema.safeParse({ query: { page: "0" } });
      expect(badPage.success).toBe(false);

      const badLimit = getAdminProductsSchema.safeParse({ query: { limit: "150" } });
      expect(badLimit.success).toBe(false);

      const badStatus = getAdminProductsSchema.safeParse({ query: { status: "unknown" } });
      expect(badStatus.success).toBe(false);

      const badStock = getAdminProductsSchema.safeParse({ query: { stock: "plenty" } });
      expect(badStock.success).toBe(false);

      const badSort = getAdminProductsSchema.safeParse({ query: { sort: "invalid_sort_enum" } });
      expect(badSort.success).toBe(false);
    });
  });

  describe("updateProductStatusSchema", () => {
    it("validates valid status body and mongoId param", () => {
      const valid = updateProductStatusSchema.safeParse({
        params: { id: "507f1f77bcf86cd799439011" },
        body: { isActive: false }
      });
      expect(valid.success).toBe(true);
    });

    it("rejects invalid mongoId param", () => {
      const invalid = updateProductStatusSchema.safeParse({
        params: { id: "not-a-mongo-id" },
        body: { isActive: true }
      });
      expect(invalid.success).toBe(false);
    });

    it("rejects non-boolean isActive", () => {
      const invalid = updateProductStatusSchema.safeParse({
        params: { id: "507f1f77bcf86cd799439011" },
        body: { isActive: "yes" }
      });
      expect(invalid.success).toBe(false);
    });
  });
});
