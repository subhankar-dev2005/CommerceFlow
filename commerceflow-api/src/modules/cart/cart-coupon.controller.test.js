import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import Cart from "./cart.model.js";
import Coupon from "../coupons/coupon.model.js";
import User from "../users/user.model.js";
import Product from "../products/product.model.js";
import generateToken from "../../utils/generate-token.js";

describe("Customer Coupon Apply/Remove & Cart Preview Tests", () => {
  let app;
  const customerUserId = "507f1f77bcf86cd799439002";
  const otherCustomerUserId = "507f1f77bcf86cd799439003";
  const validCouponId = "507f1f77bcf86cd799439011";
  const validProductId = "6a9ff8e941dd9da4fd30bdc2";
  const otherProductId = "6a9ff8e941dd9da4fd30bdc3";
  let customerToken;
  let otherCustomerToken;

  const mockProduct = {
    _id: validProductId,
    name: "Camping Tent",
    price: 2000,
    stock: 10,
    category: "Camping",
    isActive: true
  };

  const mockOtherProduct = {
    _id: otherProductId,
    name: "Trail Shoes",
    price: 1500,
    stock: 5,
    category: "Footwear",
    isActive: true
  };

  const createMockCart = (overrides = {}) => ({
    _id: "507f1f77bcf86cd799439099",
    user: customerUserId,
    items: [
      {
        product: mockProduct,
        quantity: 1
      }
    ],
    coupon: null,
    save: vi.fn().mockResolvedValue(true),
    populate: function () {
      return Promise.resolve(this);
    },
    ...overrides
  });

  const baseCoupon = {
    _id: validCouponId,
    code: "SUMMER10",
    normalizedCode: "SUMMER10",
    type: "percentage",
    value: 10,
    isActive: true,
    minimumSubtotal: 1000,
    maximumDiscount: null,
    startsAt: null,
    expiresAt: null,
    usageLimit: null,
    usedCount: 0,
    applicableProducts: [],
    applicableCategories: []
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    app = createApp();
    customerToken = generateToken({ userId: customerUserId });
    otherCustomerToken = generateToken({ userId: otherCustomerUserId });

    vi.spyOn(User, "findById").mockImplementation((id) => {
      const idStr = id.toString();
      return Promise.resolve({
        _id: idStr,
        email: `${idStr}@example.com`,
        role: "customer",
        isActive: true
      });
    });
  });

  describe("POST /api/v1/cart/coupon — Apply Coupon", () => {
    it("successfully applies a valid percentage coupon and returns preview", async () => {
      const mockCart = createMockCart();
      vi.spyOn(Coupon, "findOne").mockResolvedValue({ ...baseCoupon });
      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockCart)
      });

      const res = await request(app)
        .post("/api/v1/cart/coupon")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ couponCode: "SUMMER10" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe("Coupon applied successfully");
      expect(res.body.data.coupon).toEqual({
        code: "SUMMER10",
        couponId: validCouponId,
        type: "percentage",
        value: 10,
        discountAmount: 200 // 2000 * 10%
      });
      expect(res.body.data.financials).toEqual({
        subtotal: 2000,
        shippingAmount: 0,
        taxAmount: 0,
        discountAmount: 200,
        total: 1800
      });
      expect(mockCart.coupon).toEqual({
        couponId: validCouponId,
        code: "SUMMER10"
      });
      expect(mockCart.save).toHaveBeenCalledTimes(1);
    });

    it("normalizes coupon code (case-insensitive and trimmed)", async () => {
      const mockCart = createMockCart();
      const findCouponSpy = vi.spyOn(Coupon, "findOne").mockResolvedValue({ ...baseCoupon });
      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockCart)
      });

      const res = await request(app)
        .post("/api/v1/cart/coupon")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ couponCode: "  summer10  " });

      expect(res.status).toBe(200);
      expect(findCouponSpy).toHaveBeenCalledWith({ normalizedCode: "SUMMER10" });
    });

    it("returns 404 COUPON_NOT_FOUND when coupon does not exist", async () => {
      vi.spyOn(Coupon, "findOne").mockResolvedValue(null);

      const res = await request(app)
        .post("/api/v1/cart/coupon")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ couponCode: "NONEXISTENT" });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("COUPON_NOT_FOUND");
    });

    it("returns 400 COUPON_INACTIVE when coupon is inactive", async () => {
      const mockCart = createMockCart();
      vi.spyOn(Coupon, "findOne").mockResolvedValue({ ...baseCoupon, isActive: false });
      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockCart)
      });

      const res = await request(app)
        .post("/api/v1/cart/coupon")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ couponCode: "SUMMER10" });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("COUPON_INACTIVE");
    });

    it("returns 400 COUPON_NOT_STARTED when startsAt is in the future", async () => {
      const mockCart = createMockCart();
      vi.spyOn(Coupon, "findOne").mockResolvedValue({
        ...baseCoupon,
        startsAt: new Date(Date.now() + 86400000)
      });
      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockCart)
      });

      const res = await request(app)
        .post("/api/v1/cart/coupon")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ couponCode: "SUMMER10" });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("COUPON_NOT_STARTED");
    });

    it("returns 400 COUPON_EXPIRED when expiresAt is in the past", async () => {
      const mockCart = createMockCart();
      vi.spyOn(Coupon, "findOne").mockResolvedValue({
        ...baseCoupon,
        expiresAt: new Date(Date.now() - 86400000)
      });
      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockCart)
      });

      const res = await request(app)
        .post("/api/v1/cart/coupon")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ couponCode: "SUMMER10" });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("COUPON_EXPIRED");
    });

    it("returns 400 COUPON_USAGE_LIMIT_REACHED when usedCount >= usageLimit", async () => {
      const mockCart = createMockCart();
      vi.spyOn(Coupon, "findOne").mockResolvedValue({
        ...baseCoupon,
        usageLimit: 10,
        usedCount: 10
      });
      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockCart)
      });

      const res = await request(app)
        .post("/api/v1/cart/coupon")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ couponCode: "SUMMER10" });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("COUPON_USAGE_LIMIT_REACHED");
    });

    it("returns 400 COUPON_MINIMUM_SUBTOTAL_NOT_MET when subtotal is below minimum", async () => {
      const mockCart = createMockCart(); // Subtotal is 2000
      vi.spyOn(Coupon, "findOne").mockResolvedValue({
        ...baseCoupon,
        minimumSubtotal: 3000
      });
      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockCart)
      });

      const res = await request(app)
        .post("/api/v1/cart/coupon")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ couponCode: "SUMMER10" });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("COUPON_MINIMUM_SUBTOTAL_NOT_MET");
    });

    it("enforces product restrictions: rejects when no cart product matches", async () => {
      const mockCart = createMockCart(); // Has mockProduct (validProductId)
      vi.spyOn(Coupon, "findOne").mockResolvedValue({
        ...baseCoupon,
        applicableProducts: [otherProductId] // Only applicable to otherProductId
      });
      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockCart)
      });

      const res = await request(app)
        .post("/api/v1/cart/coupon")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ couponCode: "SUMMER10" });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("COUPON_PRODUCT_NOT_APPLICABLE");
    });

    it("enforces category restrictions: rejects when no cart product matches category", async () => {
      const mockCart = createMockCart(); // mockProduct has category "Camping"
      vi.spyOn(Coupon, "findOne").mockResolvedValue({
        ...baseCoupon,
        applicableCategories: ["Electronics"]
      });
      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockCart)
      });

      const res = await request(app)
        .post("/api/v1/cart/coupon")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ couponCode: "SUMMER10" });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("COUPON_CATEGORY_NOT_APPLICABLE");
    });

    it("applies fixed discount coupon accurately", async () => {
      const mockCart = createMockCart(); // Subtotal 2000
      vi.spyOn(Coupon, "findOne").mockResolvedValue({
        ...baseCoupon,
        code: "FLAT500",
        normalizedCode: "FLAT500",
        type: "fixed",
        value: 500
      });
      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockCart)
      });

      const res = await request(app)
        .post("/api/v1/cart/coupon")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ couponCode: "FLAT500" });

      expect(res.status).toBe(200);
      expect(res.body.data.coupon.discountAmount).toBe(500);
      expect(res.body.data.financials.discountAmount).toBe(500);
      expect(res.body.data.financials.total).toBe(1500);
    });

    it("caps percentage discount by maximumDiscount", async () => {
      const mockCart = createMockCart(); // Subtotal 2000, 20% would be 400
      vi.spyOn(Coupon, "findOne").mockResolvedValue({
        ...baseCoupon,
        value: 20,
        maximumDiscount: 250 // Capped at 250
      });
      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockCart)
      });

      const res = await request(app)
        .post("/api/v1/cart/coupon")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ couponCode: "SUMMER10" });

      expect(res.status).toBe(200);
      expect(res.body.data.coupon.discountAmount).toBe(250);
      expect(res.body.data.financials.discountAmount).toBe(250);
      expect(res.body.data.financials.total).toBe(1750);
    });

    it("caps discount at subtotal when fixed discount exceeds subtotal", async () => {
      const mockCart = createMockCart(); // Subtotal 2000
      vi.spyOn(Coupon, "findOne").mockResolvedValue({
        ...baseCoupon,
        type: "fixed",
        value: 5000 // Exceeds subtotal
      });
      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockCart)
      });

      const res = await request(app)
        .post("/api/v1/cart/coupon")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ couponCode: "SUMMER10" });

      expect(res.status).toBe(200);
      expect(res.body.data.coupon.discountAmount).toBe(2000); // Capped at 2000
      expect(res.body.data.financials.discountAmount).toBe(2000);
      expect(res.body.data.financials.total).toBe(0);
    });

    it("rejects applying coupon when cart is empty", async () => {
      const emptyCart = createMockCart({ items: [] });
      vi.spyOn(Coupon, "findOne").mockResolvedValue({ ...baseCoupon });
      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(emptyCart)
      });

      const res = await request(app)
        .post("/api/v1/cart/coupon")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ couponCode: "SUMMER10" });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("CART_EMPTY");
    });

    it("DOES NOT increment Coupon.usedCount or modify coupon document", async () => {
      const mockCart = createMockCart();
      const saveSpy = vi.fn().mockResolvedValue(true);
      const couponDoc = {
        ...baseCoupon,
        usedCount: 5,
        save: saveSpy
      };
      vi.spyOn(Coupon, "findOne").mockResolvedValue(couponDoc);
      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockCart)
      });

      await request(app)
        .post("/api/v1/cart/coupon")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ couponCode: "SUMMER10" });

      expect(couponDoc.usedCount).toBe(5);
      expect(saveSpy).not.toHaveBeenCalled();
    });
  });

  describe("Security Tests — Apply Coupon", () => {
    it("rejects unauthenticated requests with 401 AUTH_TOKEN_REQUIRED", async () => {
      const res = await request(app)
        .post("/api/v1/cart/coupon")
        .send({ couponCode: "SUMMER10" });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("AUTH_TOKEN_REQUIRED");
    });

    it("enforces customer isolation: cannot apply coupon to another user's cart", async () => {
      const findCartSpy = vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(createMockCart({ user: customerUserId }))
      });
      vi.spyOn(Coupon, "findOne").mockResolvedValue({ ...baseCoupon });

      await request(app)
        .post("/api/v1/cart/coupon")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ couponCode: "SUMMER10" });

      expect(findCartSpy).toHaveBeenCalledWith({ user: customerUserId });
      expect(findCartSpy).not.toHaveBeenCalledWith({ user: otherCustomerUserId });
    });

    it("rejects couponId injection attempt", async () => {
      const res = await request(app)
        .post("/api/v1/cart/coupon")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          couponCode: "SUMMER10",
          couponId: "507f1f77bcf86cd799439011"
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects discount injection attempt", async () => {
      const res = await request(app)
        .post("/api/v1/cart/coupon")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          couponCode: "SUMMER10",
          discount: 1000
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects total injection attempt", async () => {
      const res = await request(app)
        .post("/api/v1/cart/coupon")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          couponCode: "SUMMER10",
          total: 10
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects usedCount injection attempt", async () => {
      const res = await request(app)
        .post("/api/v1/cart/coupon")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          couponCode: "SUMMER10",
          usedCount: 0
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects arbitrary unknown fields", async () => {
      const res = await request(app)
        .post("/api/v1/cart/coupon")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          couponCode: "SUMMER10",
          bypassRestrictions: true
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("DELETE /api/v1/cart/coupon — Remove Coupon", () => {
    it("successfully removes an applied coupon from the user's cart", async () => {
      const mockCart = createMockCart({
        coupon: {
          couponId: validCouponId,
          code: "SUMMER10"
        }
      });
      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockCart)
      });

      const res = await request(app)
        .delete("/api/v1/cart/coupon")
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe("Coupon removed successfully");
      expect(mockCart.coupon).toBeNull();
      expect(mockCart.save).toHaveBeenCalledTimes(1);
      expect(res.body.data.coupon).toBeNull();
      expect(res.body.data.financials).toEqual({
        subtotal: 2000,
        shippingAmount: 0,
        taxAmount: 0,
        discountAmount: 0,
        total: 2000
      });
    });

    it("is safe and idempotent when no coupon was applied", async () => {
      const mockCart = createMockCart({ coupon: null });
      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockCart)
      });

      const res = await request(app)
        .delete("/api/v1/cart/coupon")
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.coupon).toBeNull();
      expect(res.body.data.financials.discountAmount).toBe(0);
      expect(res.body.data.financials.total).toBe(2000);
    });

    it("enforces customer isolation: removes coupon only from calling user's cart", async () => {
      const findCartSpy = vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(createMockCart())
      });

      await request(app)
        .delete("/api/v1/cart/coupon")
        .set("Authorization", `Bearer ${customerToken}`);

      expect(findCartSpy).toHaveBeenCalledWith({ user: customerUserId });
      expect(findCartSpy).not.toHaveBeenCalledWith({ user: otherCustomerUserId });
    });

    it("rejects unauthenticated request with 401 AUTH_TOKEN_REQUIRED", async () => {
      const res = await request(app).delete("/api/v1/cart/coupon");
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("AUTH_TOKEN_REQUIRED");
    });
  });

  describe("GET /api/v1/cart — Pricing Preview & Stale Coupon Handling", () => {
    it("returns baseline financials and coupon: null when no coupon is applied", async () => {
      const mockCart = createMockCart({ coupon: null });
      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockCart)
      });

      const res = await request(app)
        .get("/api/v1/cart")
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.coupon).toBeNull();
      expect(res.body.data.financials).toEqual({
        subtotal: 2000,
        shippingAmount: 0,
        taxAmount: 0,
        discountAmount: 0,
        total: 2000
      });
      expect(res.body.data.totals.total).toBe(2000);
    });

    it("returns active coupon preview and discounted financials when coupon is valid", async () => {
      const mockCart = createMockCart({
        coupon: {
          couponId: validCouponId,
          code: "SUMMER10"
        }
      });
      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockCart)
      });
      vi.spyOn(Coupon, "findById").mockResolvedValue({ ...baseCoupon });

      const res = await request(app)
        .get("/api/v1/cart")
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.coupon).toEqual({
        code: "SUMMER10",
        couponId: validCouponId,
        type: "percentage",
        value: 10,
        discountAmount: 200,
        isValid: true
      });
      expect(res.body.data.financials).toEqual({
        subtotal: 2000,
        shippingAmount: 0,
        taxAmount: 0,
        discountAmount: 200,
        total: 1800
      });
    });

    it("handles stale coupon safely: reports invalid coupon and applies 0 discount without deleting from DB", async () => {
      const mockCart = createMockCart({
        coupon: {
          couponId: validCouponId,
          code: "SUMMER10"
        }
      });
      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockCart)
      });
      // Coupon was deactivated by admin!
      vi.spyOn(Coupon, "findById").mockResolvedValue({
        ...baseCoupon,
        isActive: false
      });

      const res = await request(app)
        .get("/api/v1/cart")
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.coupon.isValid).toBe(false);
      expect(res.body.data.coupon.error.code).toBe("COUPON_INACTIVE");
      expect(res.body.data.financials.discountAmount).toBe(0);
      expect(res.body.data.financials.total).toBe(2000);
      // Confirms stored coupon in cart was NOT deleted
      expect(mockCart.coupon).not.toBeNull();
      expect(mockCart.save).not.toHaveBeenCalled();
    });

    it("handles expired coupon on GET: reports COUPON_EXPIRED and applies 0 discount", async () => {
      const mockCart = createMockCart({
        coupon: {
          couponId: validCouponId,
          code: "SUMMER10"
        }
      });
      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockCart)
      });
      vi.spyOn(Coupon, "findById").mockResolvedValue({
        ...baseCoupon,
        expiresAt: new Date(Date.now() - 100000)
      });

      const res = await request(app)
        .get("/api/v1/cart")
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.coupon.isValid).toBe(false);
      expect(res.body.data.coupon.error.code).toBe("COUPON_EXPIRED");
      expect(res.body.data.financials.discountAmount).toBe(0);
      expect(res.body.data.financials.total).toBe(2000);
    });

    it("preserves financial invariant: total = max(0, subtotal + shipping + tax - discount)", async () => {
      const mockCart = createMockCart({
        coupon: {
          couponId: validCouponId,
          code: "BIGDISCOUNT"
        }
      });
      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockCart)
      });
      vi.spyOn(Coupon, "findById").mockResolvedValue({
        ...baseCoupon,
        type: "fixed",
        value: 10000 // Exceeds subtotal
      });

      const res = await request(app)
        .get("/api/v1/cart")
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      const financials = res.body.data.financials;
      expect(financials.discountAmount).toBe(2000); // Capped at subtotal
      expect(financials.total).toBe(0);
      expect(financials.total).toBe(
        Math.max(
          0,
          financials.subtotal +
            financials.shippingAmount +
            financials.taxAmount -
            financials.discountAmount
        )
      );
    });
  });
});
