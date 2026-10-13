import { describe, it, expect, vi, beforeEach } from "vitest";
import Brand from "./brand.model.js";
import {
  getAdminBrands,
  getAdminBrandById,
  createAdminBrand,
  updateAdminBrand,
  deleteAdminBrand
} from "./admin-brand.controller.js";
import AppError from "../../common/errors/app-error.js";

describe("Admin Brand Controller Unit Tests", () => {
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
      requestId: "req-brand-test-123"
    };

    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };

    next = vi.fn();
  });

  describe("getAdminBrands", () => {
    it("returns paginated brands successfully", async () => {
      const mockBrands = [
        { _id: "brand1", name: "Arc'teryx", slug: "arcteryx", isActive: true },
        { _id: "brand2", name: "Patagonia", slug: "patagonia", isActive: true }
      ];

      const leanMock = vi.fn().mockResolvedValue(mockBrands);
      const limitMock = vi.fn().mockReturnValue({ lean: leanMock });
      const skipMock = vi.fn().mockReturnValue({ limit: limitMock });
      const sortMock = vi.fn().mockReturnValue({ skip: skipMock });

      vi.spyOn(Brand, "find").mockReturnValue({ sort: sortMock });
      vi.spyOn(Brand, "countDocuments").mockResolvedValue(2);

      req.query = { page: 1, limit: 10, status: "all" };
      await getAdminBrands(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            brands: mockBrands,
            pagination: expect.objectContaining({
              totalBrands: 2,
              totalPages: 1
            })
          })
        })
      );
    });
  });

  describe("createAdminBrand", () => {
    it("creates brand with auto-generated slug", async () => {
      req.body = {
        name: "North Face",
        description: "Outdoor apparel and equipment",
        isActive: true
      };

      vi.spyOn(Brand, "findOne").mockResolvedValue(null);
      vi.spyOn(Brand, "create").mockResolvedValue({
        _id: "brand123",
        name: "North Face",
        slug: "north-face",
        description: "Outdoor apparel and equipment",
        isActive: true
      });

      await createAdminBrand(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            brand: expect.objectContaining({
              name: "North Face",
              slug: "north-face"
            })
          })
        })
      );
    });

    it("returns 409 if brand name or slug already exists", async () => {
      req.body = { name: "Existing Brand" };

      vi.spyOn(Brand, "findOne").mockResolvedValue({
        _id: "existing_id",
        name: "Existing Brand",
        slug: "existing-brand"
      });

      await createAdminBrand(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = next.mock.calls[0][0];
      expect(error.statusCode).toBe(409);
    });
  });

  describe("updateAdminBrand", () => {
    it("updates existing brand details", async () => {
      req.params = { id: "507f1f77bcf86cd799439011" };
      req.body = { description: "Updated description" };

      const mockBrandInstance = {
        _id: "507f1f77bcf86cd799439011",
        name: "Patagonia",
        slug: "patagonia",
        description: "Old description",
        save: vi.fn().mockResolvedValue(true)
      };

      vi.spyOn(Brand, "findById").mockResolvedValue(mockBrandInstance);

      await updateAdminBrand(req, res, next);

      expect(mockBrandInstance.description).toBe("Updated description");
      expect(mockBrandInstance.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("returns 404 if brand does not exist", async () => {
      req.params = { id: "507f1f77bcf86cd799439099" };
      req.body = { name: "New Name" };

      vi.spyOn(Brand, "findById").mockResolvedValue(null);

      await updateAdminBrand(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = next.mock.calls[0][0];
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe("BRAND_NOT_FOUND");
    });
  });

  describe("deleteAdminBrand", () => {
    it("deletes brand successfully", async () => {
      req.params = { id: "507f1f77bcf86cd799439011" };

      vi.spyOn(Brand, "findById").mockResolvedValue({
        _id: "507f1f77bcf86cd799439011",
        name: "Old Brand"
      });
      vi.spyOn(Brand, "findByIdAndDelete").mockResolvedValue(true);

      await deleteAdminBrand(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: { id: "507f1f77bcf86cd799439011" }
        })
      );
    });
  });
});
