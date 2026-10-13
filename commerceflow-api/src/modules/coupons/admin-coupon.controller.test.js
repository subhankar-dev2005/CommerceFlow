import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import Coupon from "./coupon.model.js";
import User from "../users/user.model.js";
import generateToken from "../../utils/generate-token.js";
import {
  createCoupon,
  getAdminCoupons,
  getCouponById,
  updateCoupon,
  updateCouponStatus
} from "./admin-coupon.controller.js";

describe("Admin Coupon Controller & Routes Tests", () => {
  let app;
  const adminUserId = "507f1f77bcf86cd799439001";
  const customerUserId = "507f1f77bcf86cd799439002";
  const validCouponId = "507f1f77bcf86cd799439011";
  const validProductId = "6a9ff8e941dd9da4fd30bdc2";
  let adminToken;
  let customerToken;

  beforeEach(() => {
    vi.restoreAllMocks();
    app = createApp();
    adminToken = generateToken({ userId: adminUserId });
    customerToken = generateToken({ userId: customerUserId });
  });

  describe("Authorization & Authentication Gates", () => {
    it("rejects unauthenticated requests with 401 AUTH_TOKEN_REQUIRED", async () => {
      const res = await request(app).get("/api/v1/admin/coupons");
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("AUTH_TOKEN_REQUIRED");
    });

    it("rejects non-admin requests with 403 FORBIDDEN", async () => {
      vi.spyOn(User, "findById").mockResolvedValue({
        _id: customerUserId,
        email: "customer@example.com",
        role: "customer",
        isActive: true
      });

      const res = await request(app)
        .get("/api/v1/admin/coupons")
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });
  });

  describe("POST /api/v1/admin/coupons", () => {
    beforeEach(() => {
      vi.spyOn(User, "findById").mockResolvedValue({
        _id: adminUserId,
        email: "admin@example.com",
        role: "admin",
        isActive: true
      });
    });

    it("creates a valid percentage discount coupon (201 Created)", async () => {
      vi.spyOn(Coupon, "findOne").mockResolvedValue(null);
      const mockCreated = {
        _id: validCouponId,
        code: "SUMMER25",
        normalizedCode: "SUMMER25",
        type: "percentage",
        value: 25,
        minimumSubtotal: 1000,
        maximumDiscount: 500,
        usageLimit: 100,
        usedCount: 0,
        perUserLimit: 1,
        applicableProducts: [validProductId],
        applicableCategories: ["Camping"],
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      vi.spyOn(Coupon, "create").mockResolvedValue(mockCreated);

      const res = await request(app)
        .post("/api/v1/admin/coupons")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          code: "SUMMER25",
          type: "percentage",
          value: 25,
          minimumSubtotal: 1000,
          maximumDiscount: 500,
          usageLimit: 100,
          applicableProducts: [validProductId],
          applicableCategories: ["Camping"],
          isActive: true
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe("Coupon created successfully");
      expect(res.body.data.coupon.code).toBe("SUMMER25");
      expect(res.body.data.coupon.usedCount).toBe(0);
    });

    it("creates a valid fixed discount coupon (201 Created)", async () => {
      vi.spyOn(Coupon, "findOne").mockResolvedValue(null);
      const mockCreated = {
        _id: validCouponId,
        code: "FLAT150",
        normalizedCode: "FLAT150",
        type: "fixed",
        value: 150,
        minimumSubtotal: 500,
        maximumDiscount: null,
        usageLimit: null,
        usedCount: 0,
        perUserLimit: 1,
        applicableProducts: [],
        applicableCategories: [],
        isActive: true
      };
      vi.spyOn(Coupon, "create").mockResolvedValue(mockCreated);

      const res = await request(app)
        .post("/api/v1/admin/coupons")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          code: "FLAT150",
          type: "fixed",
          value: 150,
          minimumSubtotal: 500
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.coupon.type).toBe("fixed");
      expect(res.body.data.coupon.value).toBe(150);
    });

    it("rejects duplicate normalized coupon code with 409 COUPON_ALREADY_EXISTS", async () => {
      vi.spyOn(Coupon, "findOne").mockResolvedValue({
        _id: validCouponId,
        normalizedCode: "EXISTING"
      });

      const res = await request(app)
        .post("/api/v1/admin/coupons")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          code: "existing",
          type: "fixed",
          value: 50
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("COUPON_ALREADY_EXISTS");
      expect(res.body.error.message).toBe("A coupon with this code already exists");
    });

    it("catches duplicate key error (code 11000) and returns 409 COUPON_ALREADY_EXISTS", async () => {
      vi.spyOn(Coupon, "findOne").mockResolvedValue(null);
      const mongoError = new Error("E11000 duplicate key error collection");
      mongoError.code = 11000;
      vi.spyOn(Coupon, "create").mockRejectedValue(mongoError);

      const res = await request(app)
        .post("/api/v1/admin/coupons")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          code: "RACECODE",
          type: "percentage",
          value: 10
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("COUPON_ALREADY_EXISTS");
    });

    it("rejects invalid percentage (> 100) with 400 VALIDATION_ERROR", async () => {
      const res = await request(app)
        .post("/api/v1/admin/coupons")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          code: "INVALID105",
          type: "percentage",
          value: 105
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(res.body.error.details.some((d) => d.message.includes("cannot exceed 100%"))).toBe(true);
    });

    it("rejects non-positive value with 400 VALIDATION_ERROR", async () => {
      const res = await request(app)
        .post("/api/v1/admin/coupons")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          code: "ZEROVAL",
          type: "fixed",
          value: 0
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects invalid ObjectId in applicableProducts with 400 VALIDATION_ERROR", async () => {
      const res = await request(app)
        .post("/api/v1/admin/coupons")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          code: "BADPROD",
          type: "fixed",
          value: 100,
          applicableProducts: ["invalid-id"]
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects unknown fields with 400 VALIDATION_ERROR", async () => {
      const res = await request(app)
        .post("/api/v1/admin/coupons")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          code: "UNKNOWNFIELD",
          type: "fixed",
          value: 100,
          extraField: "not_allowed"
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects usedCount injection with 400 VALIDATION_ERROR", async () => {
      const res = await request(app)
        .post("/api/v1/admin/coupons")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          code: "INJECTCOUNT",
          type: "fixed",
          value: 100,
          usedCount: 50
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects createdAt and updatedAt injection with 400 VALIDATION_ERROR", async () => {
      const res = await request(app)
        .post("/api/v1/admin/coupons")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          code: "INJECTTIME",
          type: "fixed",
          value: 100,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("GET /api/v1/admin/coupons", () => {
    beforeEach(() => {
      vi.spyOn(User, "findById").mockResolvedValue({
        _id: adminUserId,
        email: "admin@example.com",
        role: "admin",
        isActive: true
      });
    });

    it("returns paginated coupons with default pagination", async () => {
      const mockCoupons = [
        {
          _id: validCouponId,
          code: "SPRING10",
          normalizedCode: "SPRING10",
          type: "percentage",
          value: 10,
          usedCount: 5,
          isActive: true
        }
      ];

      vi.spyOn(Coupon, "countDocuments").mockResolvedValue(1);
      const queryMock = {
        select: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(mockCoupons)
      };
      vi.spyOn(Coupon, "find").mockReturnValue(queryMock);

      const res = await request(app)
        .get("/api/v1/admin/coupons")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.coupons).toHaveLength(1);
      expect(res.body.data.pagination).toEqual({
        page: 1,
        limit: 10,
        totalCoupons: 1,
        totalPages: 1
      });
    });

    it("supports search, isActive, and type query filters", async () => {
      vi.spyOn(Coupon, "countDocuments").mockResolvedValue(0);
      const queryMock = {
        select: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([])
      };
      vi.spyOn(Coupon, "find").mockReturnValue(queryMock);

      const res = await request(app)
        .get("/api/v1/admin/coupons?search=spring&isActive=true&type=percentage&page=2&limit=5&sortBy=value&sortOrder=asc")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.pagination.page).toBe(2);
      expect(res.body.data.pagination.limit).toBe(5);
      expect(queryMock.sort).toHaveBeenCalledWith({ value: 1, _id: 1 });
      expect(Coupon.find).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: true,
          type: "percentage",
          $or: expect.any(Array)
        })
      );
    });

    it("returns empty result when no coupons match", async () => {
      vi.spyOn(Coupon, "countDocuments").mockResolvedValue(0);
      const queryMock = {
        select: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([])
      };
      vi.spyOn(Coupon, "find").mockReturnValue(queryMock);

      const res = await request(app)
        .get("/api/v1/admin/coupons?search=nomatch")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.coupons).toEqual([]);
      expect(res.body.data.pagination.totalCoupons).toBe(0);
      expect(res.body.data.pagination.totalPages).toBe(1);
    });

    it("rejects invalid query parameters with 400 VALIDATION_ERROR", async () => {
      const res = await request(app)
        .get("/api/v1/admin/coupons?limit=500&isActive=maybe")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("GET /api/v1/admin/coupons/:couponId", () => {
    beforeEach(() => {
      vi.spyOn(User, "findById").mockResolvedValue({
        _id: adminUserId,
        email: "admin@example.com",
        role: "admin",
        isActive: true
      });
    });

    it("returns coupon details on valid ID (200 OK)", async () => {
      const mockCoupon = {
        _id: validCouponId,
        code: "DETAIL10",
        normalizedCode: "DETAIL10",
        type: "percentage",
        value: 10,
        usedCount: 2,
        isActive: true
      };
      const queryMock = {
        select: vi.fn().mockResolvedValue(mockCoupon)
      };
      vi.spyOn(Coupon, "findById").mockReturnValue(queryMock);

      const res = await request(app)
        .get(`/api/v1/admin/coupons/${validCouponId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.coupon.code).toBe("DETAIL10");
      expect(queryMock.select).toHaveBeenCalledWith("-__v");
    });

    it("returns 404 COUPON_NOT_FOUND if coupon does not exist", async () => {
      const queryMock = {
        select: vi.fn().mockResolvedValue(null)
      };
      vi.spyOn(Coupon, "findById").mockReturnValue(queryMock);

      const res = await request(app)
        .get(`/api/v1/admin/coupons/${validCouponId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("COUPON_NOT_FOUND");
    });

    it("rejects malformed couponId with 400 VALIDATION_ERROR", async () => {
      const res = await request(app)
        .get("/api/v1/admin/coupons/not-a-valid-id")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("PATCH /api/v1/admin/coupons/:couponId", () => {
    beforeEach(() => {
      vi.spyOn(User, "findById").mockResolvedValue({
        _id: adminUserId,
        email: "admin@example.com",
        role: "admin",
        isActive: true
      });
    });

    it("updates valid configuration fields (200 OK)", async () => {
      const mockDoc = {
        _id: validCouponId,
        code: "OLDCODE",
        normalizedCode: "OLDCODE",
        type: "percentage",
        value: 10,
        minimumSubtotal: 0,
        maximumDiscount: null,
        usageLimit: null,
        perUserLimit: 1,
        applicableProducts: [],
        applicableCategories: [],
        isActive: true,
        save: vi.fn().mockResolvedValue(true)
      };
      vi.spyOn(Coupon, "findById").mockResolvedValue(mockDoc);
      vi.spyOn(Coupon, "findOne").mockResolvedValue(null);

      const res = await request(app)
        .patch(`/api/v1/admin/coupons/${validCouponId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          code: "NEWCODE",
          value: 15,
          minimumSubtotal: 200,
          maximumDiscount: 100,
          usageLimit: 50,
          perUserLimit: 2,
          applicableCategories: ["Gear"],
          isActive: false
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockDoc.code).toBe("NEWCODE");
      expect(mockDoc.normalizedCode).toBe("NEWCODE");
      expect(mockDoc.value).toBe(15);
      expect(mockDoc.minimumSubtotal).toBe(200);
      expect(mockDoc.maximumDiscount).toBe(100);
      expect(mockDoc.usageLimit).toBe(50);
      expect(mockDoc.perUserLimit).toBe(2);
      expect(mockDoc.isActive).toBe(false);
      expect(mockDoc.save).toHaveBeenCalled();
    });

    it("allows case-only code update without self-conflict", async () => {
      const mockDoc = {
        _id: validCouponId,
        code: "discount",
        normalizedCode: "DISCOUNT",
        save: vi.fn().mockResolvedValue(true)
      };
      vi.spyOn(Coupon, "findById").mockResolvedValue(mockDoc);
      const findOneSpy = vi.spyOn(Coupon, "findOne");

      const res = await request(app)
        .patch(`/api/v1/admin/coupons/${validCouponId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          code: "DISCOUNT"
        });

      expect(res.status).toBe(200);
      expect(findOneSpy).not.toHaveBeenCalled();
      expect(mockDoc.save).toHaveBeenCalled();
    });

    it("rejects code update to an existing code with 409 COUPON_ALREADY_EXISTS", async () => {
      const mockDoc = {
        _id: validCouponId,
        code: "ORIGINAL",
        normalizedCode: "ORIGINAL",
        save: vi.fn()
      };
      vi.spyOn(Coupon, "findById").mockResolvedValue(mockDoc);
      vi.spyOn(Coupon, "findOne").mockResolvedValue({
        _id: "other-id",
        normalizedCode: "TAKEN"
      });

      const res = await request(app)
        .patch(`/api/v1/admin/coupons/${validCouponId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          code: "TAKEN"
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("COUPON_ALREADY_EXISTS");
      expect(mockDoc.save).not.toHaveBeenCalled();
    });

    it("catches Mongo duplicate key error 11000 on save and returns 409", async () => {
      const mongoError = new Error("E11000 duplicate key error");
      mongoError.code = 11000;
      const mockDoc = {
        _id: validCouponId,
        code: "ORIGINAL",
        normalizedCode: "ORIGINAL",
        save: vi.fn().mockRejectedValue(mongoError)
      };
      vi.spyOn(Coupon, "findById").mockResolvedValue(mockDoc);
      vi.spyOn(Coupon, "findOne").mockResolvedValue(null);

      const res = await request(app)
        .patch(`/api/v1/admin/coupons/${validCouponId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          code: "COLLIDE"
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("COUPON_ALREADY_EXISTS");
    });

    it("returns 404 COUPON_NOT_FOUND when updating non-existent coupon", async () => {
      vi.spyOn(Coupon, "findById").mockResolvedValue(null);

      const res = await request(app)
        .patch(`/api/v1/admin/coupons/${validCouponId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          value: 20
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("COUPON_NOT_FOUND");
    });

    it("rejects empty update body with 400 VALIDATION_ERROR", async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/coupons/${validCouponId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects usedCount modification with 400 VALIDATION_ERROR", async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/coupons/${validCouponId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          usedCount: 99
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects internal field modification (_id, createdAt, updatedAt) with 400", async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/coupons/${validCouponId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          _id: "507f1f77bcf86cd799439099",
          createdAt: new Date().toISOString()
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects malformed couponId with 400 VALIDATION_ERROR", async () => {
      const res = await request(app)
        .patch("/api/v1/admin/coupons/not-hex-id")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          value: 20
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("PATCH /api/v1/admin/coupons/:couponId/status", () => {
    beforeEach(() => {
      vi.spyOn(User, "findById").mockResolvedValue({
        _id: adminUserId,
        email: "admin@example.com",
        role: "admin",
        isActive: true
      });
    });

    it("activates coupon successfully (200 OK)", async () => {
      const mockUpdated = {
        _id: validCouponId,
        code: "DEACTIVE1",
        isActive: true
      };
      const queryMock = {
        select: vi.fn().mockResolvedValue(mockUpdated)
      };
      vi.spyOn(Coupon, "findByIdAndUpdate").mockReturnValue(queryMock);

      const res = await request(app)
        .patch(`/api/v1/admin/coupons/${validCouponId}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ isActive: true });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe("Coupon activated successfully");
      expect(res.body.data.coupon.isActive).toBe(true);
      expect(Coupon.findByIdAndUpdate).toHaveBeenCalledWith(
        validCouponId,
        { $set: { isActive: true } },
        { new: true, runValidators: true }
      );
    });

    it("deactivates coupon successfully (200 OK)", async () => {
      const mockUpdated = {
        _id: validCouponId,
        code: "ACTIVE1",
        isActive: false
      };
      const queryMock = {
        select: vi.fn().mockResolvedValue(mockUpdated)
      };
      vi.spyOn(Coupon, "findByIdAndUpdate").mockReturnValue(queryMock);

      const res = await request(app)
        .patch(`/api/v1/admin/coupons/${validCouponId}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ isActive: false });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe("Coupon deactivated successfully");
      expect(res.body.data.coupon.isActive).toBe(false);
    });

    it("returns 404 COUPON_NOT_FOUND when coupon is missing", async () => {
      const queryMock = {
        select: vi.fn().mockResolvedValue(null)
      };
      vi.spyOn(Coupon, "findByIdAndUpdate").mockReturnValue(queryMock);

      const res = await request(app)
        .patch(`/api/v1/admin/coupons/${validCouponId}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ isActive: false });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("COUPON_NOT_FOUND");
    });

    it("rejects unknown fields with 400 VALIDATION_ERROR", async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/coupons/${validCouponId}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          isActive: true,
          value: 50
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects usedCount injection with 400 VALIDATION_ERROR", async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/coupons/${validCouponId}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          isActive: true,
          usedCount: 10
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects missing isActive boolean with 400 VALIDATION_ERROR", async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/coupons/${validCouponId}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects malformed couponId with 400 VALIDATION_ERROR", async () => {
      const res = await request(app)
        .patch("/api/v1/admin/coupons/not-valid-id/status")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ isActive: true });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("Controller Unit Error Forwarding", () => {
    it("createCoupon forwards unexpected database errors to next()", async () => {
      const dbErr = new Error("DB fatal");
      vi.spyOn(Coupon, "findOne").mockRejectedValue(dbErr);

      const req = {
        body: { code: "ERRTEST", type: "fixed", value: 10 },
        requestId: "test-req"
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await createCoupon(req, res, next);
      expect(next).toHaveBeenCalledWith(dbErr);
    });

    it("getAdminCoupons forwards unexpected database errors to next()", async () => {
      const dbErr = new Error("DB count error");
      vi.spyOn(Coupon, "countDocuments").mockRejectedValue(dbErr);

      const req = { query: {}, requestId: "test-req" };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await getAdminCoupons(req, res, next);
      expect(next).toHaveBeenCalledWith(dbErr);
    });

    it("getCouponById forwards unexpected database errors to next()", async () => {
      const dbErr = new Error("DB find error");
      const queryMock = {
        select: vi.fn().mockRejectedValue(dbErr)
      };
      vi.spyOn(Coupon, "findById").mockReturnValue(queryMock);

      const req = { params: { couponId: validCouponId }, requestId: "test-req" };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await getCouponById(req, res, next);
      expect(next).toHaveBeenCalledWith(dbErr);
    });

    it("updateCoupon forwards unexpected database errors to next()", async () => {
      const dbErr = new Error("DB findById error");
      vi.spyOn(Coupon, "findById").mockRejectedValue(dbErr);

      const req = { params: { couponId: validCouponId }, body: { value: 10 }, requestId: "test-req" };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await updateCoupon(req, res, next);
      expect(next).toHaveBeenCalledWith(dbErr);
    });

    it("updateCouponStatus forwards unexpected database errors to next()", async () => {
      const dbErr = new Error("DB update error");
      const queryMock = {
        select: vi.fn().mockRejectedValue(dbErr)
      };
      vi.spyOn(Coupon, "findByIdAndUpdate").mockReturnValue(queryMock);

      const req = { params: { couponId: validCouponId }, body: { isActive: true }, requestId: "test-req" };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await updateCouponStatus(req, res, next);
      expect(next).toHaveBeenCalledWith(dbErr);
    });
  });
});
