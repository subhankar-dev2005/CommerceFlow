import { describe, it, expect, vi, beforeEach } from "vitest";
import Product from "./product.model.js";
import {
  getAdminCategories,
  updateAdminCategory,
  deleteAdminCategory
} from "./admin-category.controller.js";
import {
  updateAdminCategorySchema,
  deleteAdminCategorySchema
} from "./admin-category.validator.js";
import AppError from "../../common/errors/app-error.js";

describe("Admin Category Controller Unit Tests", () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    vi.restoreAllMocks();

    req = {
      params: {},
      query: {},
      body: {},
      user: { _id: "507f1f77bcf86cd799439011", role: "admin" },
      requestId: "req-category-test-123"
    };

    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };

    next = vi.fn();
  });

  describe("getAdminCategories", () => {
    it("returns aggregated categories successfully", async () => {
      const mockAggregated = [
        {
          name: "Footwear",
          totalProducts: 5,
          activeProducts: 4,
          inStockProducts: 4,
          outOfStockProducts: 1,
          totalStock: 42
        },
        {
          name: "Apparel",
          totalProducts: 8,
          activeProducts: 7,
          inStockProducts: 6,
          outOfStockProducts: 2,
          totalStock: 95
        }
      ];

      vi.spyOn(Product, "aggregate").mockResolvedValue(mockAggregated);

      req.query = { sortBy: "name", sortOrder: "asc" };
      await getAdminCategories(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: {
            categories: mockAggregated,
            totalCategories: 2
          }
        })
      );
    });

    it("applies search regex filter in aggregate pipeline", async () => {
      const aggregateSpy = vi.spyOn(Product, "aggregate").mockResolvedValue([]);
      req.query = { search: "foot", sortBy: "totalProducts", sortOrder: "desc" };

      await getAdminCategories(req, res, next);

      expect(aggregateSpy).toHaveBeenCalled();
      const pipeline = aggregateSpy.mock.calls[0][0];
      const matchStage = pipeline.find((stage) => stage.$match?.name);
      expect(matchStage).toBeDefined();
      expect(matchStage.$match.name.$regex).toBe("foot");
    });
  });

  describe("updateAdminCategory (rename)", () => {
    it("successfully renames a category across products", async () => {
      req.params = { name: "Footwear" };
      req.body = { newName: "Shoes & Boots" };

      vi.spyOn(Product, "countDocuments").mockImplementation(async (query) => {
        if (query.category?.$regex) return 0; // Destination category does not exist
        return 5; // Current category exists
      });
      vi.spyOn(Product, "updateMany").mockResolvedValue({ modifiedCount: 5 });

      await updateAdminCategory(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: {
            previousCategory: "Footwear",
            newCategory: "Shoes & Boots",
            affectedProductsCount: 5
          }
        })
      );
    });

    it("returns 409 CATEGORY_ALREADY_EXISTS if destination category already exists in catalog", async () => {
      req.params = { name: "Sneakers" };
      req.body = { newName: "Footwear" };

      vi.spyOn(Product, "countDocuments").mockImplementation(async (query) => {
        if (query.category?.$regex) return 12; // Destination "Footwear" already exists
        return 4; // Source "Sneakers" exists
      });
      const updateSpy = vi.spyOn(Product, "updateMany");

      await updateAdminCategory(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = next.mock.calls[0][0];
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe("CATEGORY_ALREADY_EXISTS");
      expect(error.message).toContain("already exists in catalog. Accidental category merging is prevented");
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it("returns 400 if newName is identical to current name", async () => {
      req.params = { name: "Footwear" };
      req.body = { newName: "footwear" };

      await updateAdminCategory(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = next.mock.calls[0][0];
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 404 if category has no products in catalog", async () => {
      req.params = { name: "NonExistent" };
      req.body = { newName: "NewName" };

      vi.spyOn(Product, "countDocuments").mockResolvedValue(0);

      await updateAdminCategory(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = next.mock.calls[0][0];
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe("CATEGORY_NOT_FOUND");
    });
  });

  describe("deleteAdminCategory (guarded delete)", () => {
    it("strictly blocks deletion with 409 when category has products and cascade is not set", async () => {
      req.params = { name: "Footwear" };
      req.query = {};
      vi.spyOn(Product, "countDocuments").mockResolvedValue(3);

      await deleteAdminCategory(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = next.mock.calls[0][0];
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe("CATEGORY_IN_USE");
      expect(error.message).toContain("Cannot delete category 'Footwear' because 3 products are currently assigned");
    });

    it("safely deletes and reassigns products to 'Uncategorized' when cascade=true is passed", async () => {
      req.params = { name: "Footwear" };
      req.query = { cascade: "true" };
      vi.spyOn(Product, "countDocuments").mockResolvedValue(3);
      vi.spyOn(Product, "updateMany").mockResolvedValue({ modifiedCount: 3 });

      await deleteAdminCategory(req, res, next);

      expect(Product.updateMany).toHaveBeenCalledWith(
        { category: "Footwear" },
        { $set: { category: "Uncategorized" } }
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            category: "Footwear",
            cascade: true,
            reassignedProductsCount: 3
          })
        })
      );
    });

    it("allows deletion when 0 products are assigned", async () => {
      req.params = { name: "EmptyCategory" };
      vi.spyOn(Product, "countDocuments").mockResolvedValue(0);

      await deleteAdminCategory(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: "Category 'EmptyCategory' deleted successfully"
        })
      );
    });
  });

  describe("Category Schema Slash Validation", () => {
    it("rejects slash in updateAdminCategorySchema params.name", () => {
      const result = updateAdminCategorySchema.safeParse({
        params: { name: "Footwear/Sneakers" },
        body: { newName: "Boots" }
      });
      expect(result.success).toBe(false);
      expect(result.error.issues.some((i) => i.message === "Category name cannot contain '/'")).toBe(true);
    });

    it("rejects slash in updateAdminCategorySchema body.newName", () => {
      const result = updateAdminCategorySchema.safeParse({
        params: { name: "Footwear" },
        body: { newName: "Shoes/Boots" }
      });
      expect(result.success).toBe(false);
      expect(result.error.issues.some((i) => i.message === "Category name cannot contain '/'")).toBe(true);
    });

    it("accepts valid category name without slash in updateAdminCategorySchema", () => {
      const result = updateAdminCategorySchema.safeParse({
        params: { name: "Footwear" },
        body: { newName: "Shoes and Boots" }
      });
      expect(result.success).toBe(true);
    });

    it("rejects slash in deleteAdminCategorySchema params.name", () => {
      const result = deleteAdminCategorySchema.safeParse({
        params: { name: "Outdoor/Gear" }
      });
      expect(result.success).toBe(false);
      expect(result.error.issues.some((i) => i.message === "Category name cannot contain '/'")).toBe(true);
    });
  });
});
