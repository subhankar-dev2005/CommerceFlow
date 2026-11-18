import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import User from "../users/user.model.js";
import Product from "./product.model.js";
import generateToken from "../../utils/generate-token.js";
import {
  getAdminProducts,
  getAdminProductById,
  updateAdminProductStatus
} from "./admin-product.controller.js";

describe("Admin Product Controller Unit Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("getAdminProducts", () => {
    it("returns paginated products with default options", async () => {
      const mockProducts = [
        {
          _id: "507f1f77bcf86cd799439011",
          name: "Alpine Tent",
          category: "Camping",
          price: 14999,
          stock: 25,
          sku: "TENT-ALP",
          hasVariants: true,
          variants: [{ variantId: "var_1", sku: "TENT-ALP-1", stock: 25, isActive: true }],
          isActive: true
        }
      ];

      vi.spyOn(Product, "countDocuments").mockResolvedValue(1);
      const queryMock = {
        select: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(mockProducts)
      };
      vi.spyOn(Product, "find").mockReturnValue(queryMock);

      const req = {
        query: {
          page: 1,
          limit: 10,
          status: "all",
          stock: "all",
          hasVariants: "all",
          sort: "newest"
        },
        requestId: "req-1"
      };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await getAdminProducts(req, res, next);

      expect(Product.countDocuments).toHaveBeenCalledWith({});
      expect(Product.find).toHaveBeenCalledWith({});
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            products: mockProducts,
            pagination: {
              page: 1,
              limit: 10,
              totalProducts: 1,
              totalPages: 1
            }
          })
        })
      );
    });

    it("applies status, stock, variants, category and search filters correctly", async () => {
      vi.spyOn(Product, "countDocuments").mockResolvedValue(0);
      const queryMock = {
        select: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([])
      };
      vi.spyOn(Product, "find").mockReturnValue(queryMock);

      const req = {
        query: {
          page: 2,
          limit: 20,
          search: "pro",
          category: "Gear",
          status: "inactive",
          stock: "lowStock",
          hasVariants: "true",
          sort: "price_asc"
        },
        requestId: "req-2"
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await getAdminProducts(req, res, next);

      const expectedFilter = {
        category: "Gear",
        isActive: false,
        stock: { $gt: 0, $lte: 5 },
        "variants.0": { $exists: true },
        $or: [
          { name: { $regex: "pro", $options: "i" } },
          { description: { $regex: "pro", $options: "i" } },
          { sku: { $regex: "pro", $options: "i" } },
          { "variants.sku": { $regex: "pro", $options: "i" } }
        ]
      };

      expect(Product.countDocuments).toHaveBeenCalledWith(expectedFilter);
      expect(Product.find).toHaveBeenCalledWith(expectedFilter);
      expect(queryMock.sort).toHaveBeenCalledWith({ price: 1, _id: -1 });
    });
  });

  describe("getAdminProductById", () => {
    it("returns product even when inactive", async () => {
      const mockProduct = {
        _id: "507f1f77bcf86cd799439011",
        name: "Inactive Sleeping Bag",
        isActive: false,
        price: 2999,
        stock: 0
      };

      const queryMock = {
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(mockProduct)
      };
      vi.spyOn(Product, "findById").mockReturnValue(queryMock);

      const req = {
        params: { id: "507f1f77bcf86cd799439011" },
        requestId: "req-3"
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await getAdminProductById(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Admin product retrieved successfully",
        data: { product: mockProduct },
        requestId: "req-3"
      });
    });

    it("passes 404 AppError when product is not found", async () => {
      const queryMock = {
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(null)
      };
      vi.spyOn(Product, "findById").mockReturnValue(queryMock);

      const req = {
        params: { id: "507f1f77bcf86cd799439099" },
        requestId: "req-4"
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await getAdminProductById(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404,
          code: "PRODUCT_NOT_FOUND"
        })
      );
    });
  });

  describe("updateAdminProductStatus", () => {
    it("toggles product active status successfully", async () => {
      const updatedMock = {
        _id: "507f1f77bcf86cd799439011",
        name: "Trail Shoes",
        isActive: false
      };

      const queryMock = {
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(updatedMock)
      };
      vi.spyOn(Product, "findByIdAndUpdate").mockReturnValue(queryMock);

      const req = {
        params: { id: "507f1f77bcf86cd799439011" },
        body: { isActive: false },
        requestId: "req-5"
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await updateAdminProductStatus(req, res, next);

      expect(Product.findByIdAndUpdate).toHaveBeenCalledWith(
        "507f1f77bcf86cd799439011",
        {
          isActive: false,
          changeToken: expect.stringMatching(/^[0-9a-fA-F]{24}$/)
        },
        { new: true, runValidators: true }
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: "Product deactivated successfully",
          data: { product: updatedMock }
        })
      );
    });

    it("passes 404 AppError when updating non-existent product", async () => {
      const queryMock = {
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(null)
      };
      vi.spyOn(Product, "findByIdAndUpdate").mockReturnValue(queryMock);

      const req = {
        params: { id: "507f1f77bcf86cd799439099" },
        body: { isActive: true },
        requestId: "req-6"
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await updateAdminProductStatus(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404,
          code: "PRODUCT_NOT_FOUND"
        })
      );
    });
  });
});

describe("Admin Product Routes Integration Tests", () => {
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

  it("rejects unauthenticated requests with 401 AUTH_TOKEN_REQUIRED", async () => {
    const res = await request(app).get("/api/v1/admin/products");

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("AUTH_TOKEN_REQUIRED");
  });

  it("rejects non-admin role with 403 FORBIDDEN", async () => {
    vi.spyOn(User, "findById").mockResolvedValue({
      _id: customerUserId,
      email: "cust@example.com",
      role: "customer",
      isActive: true
    });

    const res = await request(app)
      .get("/api/v1/admin/products")
      .set("Authorization", `Bearer ${customerToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("accepts admin request to GET /api/v1/admin/products", async () => {
    vi.spyOn(User, "findById").mockResolvedValue({
      _id: adminUserId,
      email: "admin@example.com",
      role: "admin",
      isActive: true
    });

    vi.spyOn(Product, "countDocuments").mockResolvedValue(1);
    vi.spyOn(Product, "find").mockReturnValue({
      select: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([
        {
          _id: "507f1f77bcf86cd799439011",
          name: "Trail Backpack",
          category: "Bags",
          price: 4999,
          stock: 12,
          isActive: false
        }
      ])
    });

    const res = await request(app)
      .get("/api/v1/admin/products?status=all")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.products).toHaveLength(1);
    expect(res.body.data.products[0].name).toBe("Trail Backpack");
  });

  it("accepts admin request to PATCH /api/v1/admin/products/:id/status", async () => {
    vi.spyOn(User, "findById").mockResolvedValue({
      _id: adminUserId,
      email: "admin@example.com",
      role: "admin",
      isActive: true
    });

    vi.spyOn(Product, "findByIdAndUpdate").mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue({
        _id: "507f1f77bcf86cd799439011",
        name: "Trail Backpack",
        isActive: false
      })
    });

    const res = await request(app)
      .patch("/api/v1/admin/products/507f1f77bcf86cd799439011/status")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.product.isActive).toBe(false);
  });
});
