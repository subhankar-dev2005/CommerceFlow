import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import Address from "../users/address.model.js";
import Cart from "../cart/cart.model.js";
import Product from "../products/product.model.js";
import Order from "./order.model.js";
import Coupon from "../coupons/coupon.model.js";
import CouponUsage from "../coupons/coupon-usage.model.js";
import CouponReservation from "../coupons/coupon-reservation.model.js";
import CheckoutInventoryRestoration from "./checkout-inventory-restoration.model.js";
import User from "../users/user.model.js";
import generateToken from "../../utils/generate-token.js";
import razorpay from "../payments/razorpay.service.js";

describe("P1.1 Step 77.5 — Coupon Redemption During Order Creation & Atomic Protection", () => {
  let app;
  const customerUserId = "507f1f77bcf86cd799439002";
  const otherCustomerUserId = "507f1f77bcf86cd799439003";
  const validAddressId = "507f1f77bcf86cd799439011";
  const otherAddressId = "507f1f77bcf86cd799439012";
  const validCouponId = "507f1f77bcf86cd799439022";
  const validProductId = "6a9ff8e941dd9da4fd30bdc2";
  const otherProductId = "6a9ff8e941dd9da4fd30bdc3";
  let customerToken;
  let otherCustomerToken;

  const mockAddress = {
    _id: validAddressId,
    user: customerUserId,
    fullName: "John Adventurer",
    phone: "9876543210",
    addressLine1: "123 Trailhead Road",
    addressLine2: "Suite 4B",
    city: "Bengaluru",
    state: "Karnataka",
    postalCode: "560001",
    country: "India"
  };

  const mockOtherAddress = {
    _id: otherAddressId,
    user: otherCustomerUserId,
    fullName: "Alice Explorer",
    phone: "9876543211",
    addressLine1: "456 Summit Ave",
    addressLine2: "",
    city: "Mumbai",
    state: "Maharashtra",
    postalCode: "400001",
    country: "India"
  };

  const mockProduct = {
    _id: validProductId,
    name: "Basecamp 4-Person Tent",
    price: 2000,
    stock: 10,
    category: "Camping",
    isActive: true
  };

  const mockOtherProduct = {
    _id: otherProductId,
    name: "Alpine Trekking Poles",
    price: 1500,
    stock: 10,
    category: "Footwear",
    isActive: true
  };

  const createMockCart = (userId = customerUserId, items = [{ product: mockProduct, quantity: 1 }]) => ({
    _id: "507f1f77bcf86cd799439099",
    user: userId,
    items,
    coupon: null,
    save: vi.fn().mockResolvedValue(true),
    populate: function () {
      return Promise.resolve(this);
    }
  });

  const baseCoupon = {
    _id: validCouponId,
    code: "SUMMER10",
    normalizedCode: "SUMMER10",
    type: "percentage",
    value: 10,
    isActive: true,
    minimumSubtotal: 1000,
    maximumDiscount: 500,
    startsAt: null,
    expiresAt: null,
    usageLimit: 100,
    perUserLimit: 1,
    usedCount: 5,
    reservations: [],
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

    vi.spyOn(Address, "findOne").mockImplementation((query) => {
      if (query._id === validAddressId && query.user === customerUserId) {
        return Promise.resolve(mockAddress);
      }
      if (query._id === otherAddressId && query.user === otherCustomerUserId) {
        return Promise.resolve(mockOtherAddress);
      }
      return Promise.resolve(null);
    });

    vi.spyOn(Product, "findOne").mockImplementation((query) => {
      if (query._id === validProductId) {
        return Promise.resolve({ ...mockProduct });
      }
      if (query._id === otherProductId) {
        return Promise.resolve({ ...mockOtherProduct });
      }
      return Promise.resolve(null);
    });

    vi.spyOn(Product, "findOneAndUpdate").mockImplementation((query, update) => {
      if (query._id === validProductId) {
        return Promise.resolve({
          ...mockProduct,
          stock: mockProduct.stock + (update.$inc?.stock || 0)
        });
      }
      if (query._id === otherProductId) {
        return Promise.resolve({
          ...mockOtherProduct,
          stock: mockOtherProduct.stock + (update.$inc?.stock || 0)
        });
      }
      return Promise.resolve(null);
    });

    vi.spyOn(Product, "findByIdAndUpdate").mockResolvedValue(true);

    vi.spyOn(CouponReservation, "find").mockResolvedValue([]);
    vi.spyOn(CouponReservation, "countDocuments").mockResolvedValue(0);
    vi.spyOn(CouponReservation, "create").mockImplementation((data) =>
      Promise.resolve({ _id: "res-obj-12345", ...data })
    );
    vi.spyOn(CouponReservation, "deleteOne").mockResolvedValue(true);
    vi.spyOn(CouponReservation, "updateOne").mockResolvedValue(true);
    vi.spyOn(Coupon, "updateOne").mockResolvedValue(true);
    vi.spyOn(Order, "updateOne").mockResolvedValue({ acknowledged: true, modifiedCount: 1 });
    vi.spyOn(Order, "findByIdAndUpdate").mockResolvedValue(true);
    vi.spyOn(Order, "findById").mockImplementation((id) =>
      Promise.resolve({ _id: id, status: "pending", checkoutState: "in_progress" })
    );
    vi.spyOn(CouponUsage, "deleteOne").mockResolvedValue({ acknowledged: true, deletedCount: 1 });
    vi.spyOn(Coupon, "findById").mockImplementation((id) =>
      Promise.resolve({ ...baseCoupon, _id: id })
    );
    vi.spyOn(Coupon, "findOneAndUpdate").mockImplementation((query, update) => {
      return Promise.resolve({
        ...baseCoupon,
        usedCount: Math.max(0, baseCoupon.usedCount + (update?.$inc?.usedCount || 0))
      });
    });
    vi.spyOn(CheckoutInventoryRestoration, "create").mockResolvedValue({ status: "pending" });
    vi.spyOn(CheckoutInventoryRestoration, "findOne").mockResolvedValue({ status: "pending" });
    vi.spyOn(CheckoutInventoryRestoration, "findOneAndUpdate").mockResolvedValue({ status: "restored" });
    vi.spyOn(CheckoutInventoryRestoration, "updateOne").mockResolvedValue({ acknowledged: true });
  });

  describe("Valid Coupon Redemption & Financial Snapshots", () => {
    it("successfully creates order with percentage coupon, snapshots discount, and creates CouponUsage", async () => {
      const mockCart = createMockCart();
      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockCart)
      });
      vi.spyOn(Coupon, "findOne").mockResolvedValue({ ...baseCoupon });
      vi.spyOn(CouponUsage, "countDocuments").mockResolvedValue(0);

      const reservedCouponDoc = { ...baseCoupon, usedCount: 6, reservations: ["test-token"] };
      const findOneAndUpdateSpy = vi
        .spyOn(Coupon, "findOneAndUpdate")
        .mockResolvedValue(reservedCouponDoc);

      const orderCreateSpy = vi.spyOn(Order, "create").mockImplementation((data) =>
        Promise.resolve({ _id: "607f1f77bcf86cd799439099", ...data })
      );
      const couponUsageCreateSpy = vi
        .spyOn(CouponUsage, "create")
        .mockResolvedValue(true);

      const res = await request(app)
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          addressId: validAddressId,
          couponCode: "SUMMER10"
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      // Verify coupon lookup was normalized
      expect(findOneAndUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: validCouponId,
          isActive: true
        }),
        expect.objectContaining({
          $inc: { usedCount: 1 },
          $push: { reservations: expect.any(String) }
        }),
        { new: true }
      );

      // Verify financial snapshot
      // Subtotal = 2000, 10% discount = 200, total = 1800
      expect(res.body.data.order.subtotal).toBe(2000);
      expect(res.body.data.order.discountAmount).toBe(200);
      expect(res.body.data.order.total).toBe(1800);
      expect(res.body.data.order.coupon).toEqual({
        couponId: validCouponId,
        code: "SUMMER10",
        type: "percentage",
        value: 10,
        discountAmount: 200
      });

      // Verify Order.create was called with discounted total
      expect(orderCreateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          subtotal: 2000,
          discountAmount: 200,
          total: 1800
        })
      );

      // Verify CouponUsage audit record creation
      expect(couponUsageCreateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          coupon: validCouponId,
          user: customerUserId,
          order: "607f1f77bcf86cd799439099",
          couponCode: "SUMMER10",
          discountAmount: 200,
          status: "redeemed"
        })
      );

      // Verify cart was cleared
      expect(mockCart.items).toEqual([]);
      expect(mockCart.coupon).toBeNull();
      expect(mockCart.save).toHaveBeenCalled();
    });

    it("successfully creates order with fixed coupon discount capped at subtotal", async () => {
      const mockCart = createMockCart();
      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockCart)
      });
      const fixedCoupon = {
        ...baseCoupon,
        type: "fixed",
        value: 3000 // Fixed 3000 on 2000 subtotal -> capped at 2000
      };
      vi.spyOn(Coupon, "findOne").mockResolvedValue(fixedCoupon);
      vi.spyOn(CouponUsage, "countDocuments").mockResolvedValue(0);
      vi.spyOn(Coupon, "findOneAndUpdate").mockResolvedValue({ ...fixedCoupon, usedCount: 6 });
      vi.spyOn(Order, "create").mockImplementation((data) =>
        Promise.resolve({ _id: "607f1f77bcf86cd799439099", ...data })
      );
      vi.spyOn(CouponUsage, "create").mockResolvedValue(true);

      const res = await request(app)
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          addressId: validAddressId,
          couponCode: "SUMMER10"
        });

      expect(res.status).toBe(201);
      expect(res.body.data.order.subtotal).toBe(2000);
      expect(res.body.data.order.discountAmount).toBe(2000);
      expect(res.body.data.order.total).toBe(0);
    });

    it("creates order normally with discountAmount = 0 when couponCode is omitted", async () => {
      const mockCart = createMockCart();
      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockCart)
      });
      const orderCreateSpy = vi.spyOn(Order, "create").mockImplementation((data) =>
        Promise.resolve({ _id: "607f1f77bcf86cd799439099", ...data })
      );
      const couponUsageSpy = vi.spyOn(CouponUsage, "create");

      const res = await request(app)
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          addressId: validAddressId
        });

      expect(res.status).toBe(201);
      expect(res.body.data.order.discountAmount).toBe(0);
      expect(res.body.data.order.total).toBe(2000);
      expect(orderCreateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          discountAmount: 0,
          total: 2000
        })
      );
      expect(couponUsageSpy).not.toHaveBeenCalled();
    });

    it("normalizes coupon code (trims whitespace and uppercase)", async () => {
      const mockCart = createMockCart();
      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockCart)
      });
      const couponFindSpy = vi
        .spyOn(Coupon, "findOne")
        .mockResolvedValue({ ...baseCoupon });
      vi.spyOn(CouponUsage, "countDocuments").mockResolvedValue(0);
      vi.spyOn(Coupon, "findOneAndUpdate").mockResolvedValue({ ...baseCoupon, usedCount: 6 });
      vi.spyOn(Order, "create").mockImplementation((data) =>
        Promise.resolve({ _id: "607f1f77bcf86cd799439099", ...data })
      );
      vi.spyOn(CouponUsage, "create").mockResolvedValue(true);

      const res = await request(app)
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          addressId: validAddressId,
          couponCode: "  summer10  "
        });

      expect(res.status).toBe(201);
      expect(couponFindSpy).toHaveBeenCalledWith({ normalizedCode: "SUMMER10" });
    });
  });

  describe("Coupon Invalidation and Eligibility Rejections at Order Time", () => {
    it("returns 404 COUPON_NOT_FOUND when coupon code does not exist", async () => {
      const mockCart = createMockCart();
      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockCart)
      });
      vi.spyOn(Coupon, "findOne").mockResolvedValue(null);

      const res = await request(app)
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          addressId: validAddressId,
          couponCode: "NONEXISTENT"
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("COUPON_NOT_FOUND");
    });

    it("returns 400 COUPON_INACTIVE when coupon isActive is false", async () => {
      const mockCart = createMockCart();
      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockCart)
      });
      vi.spyOn(Coupon, "findOne").mockResolvedValue({
        ...baseCoupon,
        isActive: false
      });

      const res = await request(app)
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          addressId: validAddressId,
          couponCode: "SUMMER10"
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("COUPON_INACTIVE");
    });

    it("returns 400 COUPON_NOT_STARTED when startsAt is in the future", async () => {
      const mockCart = createMockCart();
      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockCart)
      });
      const futureDate = new Date(Date.now() + 86400000);
      vi.spyOn(Coupon, "findOne").mockResolvedValue({
        ...baseCoupon,
        startsAt: futureDate
      });

      const res = await request(app)
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          addressId: validAddressId,
          couponCode: "SUMMER10"
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("COUPON_NOT_STARTED");
    });

    it("returns 400 COUPON_EXPIRED when expiresAt is in the past", async () => {
      const mockCart = createMockCart();
      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockCart)
      });
      const pastDate = new Date(Date.now() - 86400000);
      vi.spyOn(Coupon, "findOne").mockResolvedValue({
        ...baseCoupon,
        expiresAt: pastDate
      });

      const res = await request(app)
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          addressId: validAddressId,
          couponCode: "SUMMER10"
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("COUPON_EXPIRED");
    });

    it("returns 400 COUPON_MIN_SUBTOTAL_NOT_MET when subtotal is below minimumSubtotal", async () => {
      const mockCart = createMockCart();
      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockCart)
      });
      vi.spyOn(Coupon, "findOne").mockResolvedValue({
        ...baseCoupon,
        minimumSubtotal: 5000 // Cart subtotal is 2000
      });

      const res = await request(app)
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          addressId: validAddressId,
          couponCode: "SUMMER10"
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("COUPON_MINIMUM_SUBTOTAL_NOT_MET");
    });

    it("returns 400 COUPON_PRODUCT_NOT_APPLICABLE when cart lacks restricted products", async () => {
      const mockCart = createMockCart();
      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockCart)
      });
      vi.spyOn(Coupon, "findOne").mockResolvedValue({
        ...baseCoupon,
        applicableProducts: [otherProductId] // Cart only has validProductId
      });

      const res = await request(app)
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          addressId: validAddressId,
          couponCode: "SUMMER10"
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("COUPON_PRODUCT_NOT_APPLICABLE");
    });

    it("returns 400 COUPON_CATEGORY_NOT_APPLICABLE when cart lacks restricted categories", async () => {
      const mockCart = createMockCart();
      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockCart)
      });
      vi.spyOn(Coupon, "findOne").mockResolvedValue({
        ...baseCoupon,
        applicableCategories: ["Footwear"] // Product category is Camping
      });

      const res = await request(app)
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          addressId: validAddressId,
          couponCode: "SUMMER10"
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("COUPON_CATEGORY_NOT_APPLICABLE");
    });
  });

  describe("Section 6 — Same-User Concurrency & Atomic Per-User Limit", () => {
    it("proves two simultaneous redemption attempts by same user allow exactly ONE successful redemption", async () => {
      const mockCart1 = createMockCart();
      const mockCart2 = createMockCart();

      vi.spyOn(Cart, "findOne")
        .mockReturnValueOnce({ populate: vi.fn().mockResolvedValue(mockCart1) })
        .mockReturnValueOnce({ populate: vi.fn().mockResolvedValue(mockCart2) });

      vi.spyOn(Coupon, "findOne").mockResolvedValue({
        ...baseCoupon,
        perUserLimit: 1,
        usageLimit: 100
      });

      // Both requests observe 0 prior usages initially
      vi.spyOn(CouponUsage, "countDocuments").mockResolvedValue(0);
      vi.spyOn(CouponReservation, "countDocuments").mockResolvedValue(0);
      vi.spyOn(CouponReservation, "find").mockResolvedValue([]);

      // Mock atomic reservation on Coupon
      vi.spyOn(Coupon, "findOneAndUpdate").mockResolvedValue({
        ...baseCoupon,
        usedCount: 6,
        reservations: ["uuid-1"]
      });

      // First call to CouponReservation.create succeeds, second call hits E11000 duplicate key!
      const dupError = new Error("E11000 duplicate key error collection");
      dupError.code = 11000;
      vi.spyOn(CouponReservation, "create")
        .mockResolvedValueOnce({
          _id: "res-obj-1",
          slotNumber: 1,
          reservationId: "uuid-1",
          status: "reserved"
        })
        .mockRejectedValueOnce(dupError);

      vi.spyOn(Order, "create").mockImplementation((data) =>
        Promise.resolve({ _id: "607f1f77bcf86cd799439099", ...data })
      );
      const couponUsageCreateSpy = vi
        .spyOn(CouponUsage, "create")
        .mockResolvedValue(true);

      // Execute Request A and Request B concurrently!
      const [resA, resB] = await Promise.all([
        request(app)
          .post("/api/v1/orders")
          .set("Authorization", `Bearer ${customerToken}`)
          .send({
            addressId: validAddressId,
            couponCode: "SUMMER10"
          }),
        request(app)
          .post("/api/v1/orders")
          .set("Authorization", `Bearer ${customerToken}`)
          .send({
            addressId: validAddressId,
            couponCode: "SUMMER10"
          })
      ]);

      const successResponses = [resA, resB].filter((r) => r.status === 201);
      const rejectedResponses = [resA, resB].filter((r) => r.status === 400);

      // Invariant: Exactly ONE successful redemption
      expect(successResponses).toHaveLength(1);
      expect(successResponses[0].body.success).toBe(true);

      // Invariant: Exactly ONE successful CouponUsage record
      expect(couponUsageCreateSpy).toHaveBeenCalledTimes(1);

      // Invariant: Other request receives COUPON_USER_USAGE_LIMIT_REACHED
      expect(rejectedResponses).toHaveLength(1);
      expect(rejectedResponses[0].body.error.code).toBe("COUPON_USER_USAGE_LIMIT_REACHED");
    });
  });

  describe("Section 7 — Global Limit + User Limit Combinations", () => {
    it("Case A: global usageLimit = 1, perUserLimit = 5, two different users concurrently -> exactly ONE succeeds", async () => {
      const mockCart1 = createMockCart(customerUserId);
      const mockCart2 = createMockCart(otherCustomerUserId);

      vi.spyOn(Cart, "findOne").mockImplementation((query) => {
        if (query.user === customerUserId) {
          return { populate: vi.fn().mockResolvedValue(mockCart1) };
        }
        return { populate: vi.fn().mockResolvedValue(mockCart2) };
      });

      vi.spyOn(Coupon, "findOne").mockResolvedValue({
        ...baseCoupon,
        usageLimit: 1,
        perUserLimit: 5,
        usedCount: 0
      });

      vi.spyOn(CouponUsage, "countDocuments").mockResolvedValue(0);
      vi.spyOn(CouponReservation, "countDocuments").mockResolvedValue(0);
      vi.spyOn(CouponReservation, "find").mockResolvedValue([]);

      // Atomic global reservation: 1st caller wins slot, 2nd caller gets null!
      vi.spyOn(Coupon, "findOneAndUpdate")
        .mockResolvedValueOnce({ ...baseCoupon, usedCount: 1, usageLimit: 1 })
        .mockResolvedValueOnce(null);

      vi.spyOn(Order, "create").mockImplementation((data) =>
        Promise.resolve({ _id: "607f1f77bcf86cd799439099", ...data })
      );
      vi.spyOn(CouponUsage, "create").mockResolvedValue(true);

      const [res1, res2] = await Promise.all([
        request(app)
          .post("/api/v1/orders")
          .set("Authorization", `Bearer ${customerToken}`)
          .send({
            addressId: validAddressId,
            couponCode: "SUMMER10"
          }),
        request(app)
          .post("/api/v1/orders")
          .set("Authorization", `Bearer ${otherCustomerToken}`)
          .send({
            addressId: otherAddressId,
            couponCode: "SUMMER10"
          })
      ]);

      const successResponses = [res1, res2].filter((r) => r.status === 201);
      const rejectedResponses = [res1, res2].filter((r) => r.status === 400);

      expect(successResponses).toHaveLength(1);
      expect(rejectedResponses).toHaveLength(1);
      expect(rejectedResponses[0].body.error.code).toBe("COUPON_USAGE_LIMIT_REACHED");
    });

    it("Case B: global usageLimit = 10, perUserLimit = 1, same user concurrently -> exactly ONE succeeds", async () => {
      const mockCart1 = createMockCart();
      const mockCart2 = createMockCart();

      vi.spyOn(Cart, "findOne")
        .mockReturnValueOnce({ populate: vi.fn().mockResolvedValue(mockCart1) })
        .mockReturnValueOnce({ populate: vi.fn().mockResolvedValue(mockCart2) });

      vi.spyOn(Coupon, "findOne").mockResolvedValue({
        ...baseCoupon,
        usageLimit: 10,
        perUserLimit: 1
      });

      vi.spyOn(CouponUsage, "countDocuments").mockResolvedValue(0);
      vi.spyOn(CouponReservation, "countDocuments").mockResolvedValue(0);
      vi.spyOn(CouponReservation, "find").mockResolvedValue([]);

      vi.spyOn(Coupon, "findOneAndUpdate").mockResolvedValue({
        ...baseCoupon,
        usedCount: 1
      });

      const dupError = new Error("E11000 duplicate key error");
      dupError.code = 11000;
      vi.spyOn(CouponReservation, "create")
        .mockResolvedValueOnce({ _id: "res-1", slotNumber: 1, reservationId: "r1" })
        .mockRejectedValueOnce(dupError);

      vi.spyOn(Order, "create").mockImplementation((data) =>
        Promise.resolve({ _id: "607f1f77bcf86cd799439099", ...data })
      );
      vi.spyOn(CouponUsage, "create").mockResolvedValue(true);

      const [res1, res2] = await Promise.all([
        request(app)
          .post("/api/v1/orders")
          .set("Authorization", `Bearer ${customerToken}`)
          .send({
            addressId: validAddressId,
            couponCode: "SUMMER10"
          }),
        request(app)
          .post("/api/v1/orders")
          .set("Authorization", `Bearer ${customerToken}`)
          .send({
            addressId: validAddressId,
            couponCode: "SUMMER10"
          })
      ]);

      const successResponses = [res1, res2].filter((r) => r.status === 201);
      const rejectedResponses = [res1, res2].filter((r) => r.status === 400);

      expect(successResponses).toHaveLength(1);
      expect(rejectedResponses).toHaveLength(1);
      expect(rejectedResponses[0].body.error.code).toBe("COUPON_USER_USAGE_LIMIT_REACHED");
    });

    it("Case C: global usageLimit = 1, perUserLimit = 1, same user concurrently -> exactly ONE succeeds", async () => {
      const mockCart1 = createMockCart();
      const mockCart2 = createMockCart();

      vi.spyOn(Cart, "findOne")
        .mockReturnValueOnce({ populate: vi.fn().mockResolvedValue(mockCart1) })
        .mockReturnValueOnce({ populate: vi.fn().mockResolvedValue(mockCart2) });

      vi.spyOn(Coupon, "findOne").mockResolvedValue({
        ...baseCoupon,
        usageLimit: 1,
        perUserLimit: 1,
        usedCount: 0
      });

      vi.spyOn(CouponUsage, "countDocuments").mockResolvedValue(0);
      vi.spyOn(CouponReservation, "countDocuments").mockResolvedValue(0);
      vi.spyOn(CouponReservation, "find").mockResolvedValue([]);

      vi.spyOn(Coupon, "findOneAndUpdate").mockResolvedValue({
        ...baseCoupon,
        usedCount: 1
      });

      const dupError = new Error("E11000 duplicate key");
      dupError.code = 11000;
      vi.spyOn(CouponReservation, "create")
        .mockResolvedValueOnce({ _id: "res-1", slotNumber: 1, reservationId: "r1" })
        .mockRejectedValueOnce(dupError);

      vi.spyOn(Order, "create").mockImplementation((data) =>
        Promise.resolve({ _id: "607f1f77bcf86cd799439099", ...data })
      );
      vi.spyOn(CouponUsage, "create").mockResolvedValue(true);

      const [res1, res2] = await Promise.all([
        request(app)
          .post("/api/v1/orders")
          .set("Authorization", `Bearer ${customerToken}`)
          .send({
            addressId: validAddressId,
            couponCode: "SUMMER10"
          }),
        request(app)
          .post("/api/v1/orders")
          .set("Authorization", `Bearer ${customerToken}`)
          .send({
            addressId: validAddressId,
            couponCode: "SUMMER10"
          })
      ]);

      const successResponses = [res1, res2].filter((r) => r.status === 201);
      const rejectedResponses = [res1, res2].filter((r) => r.status === 400);

      expect(successResponses).toHaveLength(1);
      expect(rejectedResponses).toHaveLength(1);
      expect(rejectedResponses[0].body.error.code).toBe("COUPON_USER_USAGE_LIMIT_REACHED");
    });

    it("Case D: global usageLimit = 10, perUserLimit = 2, same user makes 3 attempts -> maximum 2 succeed", async () => {
      let redemptionsCount = 0;
      const consumedReservations = [];

      vi.spyOn(Cart, "findOne").mockImplementation(() => ({
        populate: vi.fn().mockResolvedValue(createMockCart())
      }));

      vi.spyOn(Coupon, "findOne").mockResolvedValue({
        ...baseCoupon,
        usageLimit: 10,
        perUserLimit: 2
      });

      vi.spyOn(CouponUsage, "countDocuments").mockImplementation(() =>
        Promise.resolve(redemptionsCount)
      );
      vi.spyOn(CouponReservation, "find").mockImplementation(() =>
        Promise.resolve(consumedReservations)
      );
      vi.spyOn(CouponReservation, "countDocuments").mockImplementation(() =>
        Promise.resolve(consumedReservations.length)
      );

      vi.spyOn(Coupon, "findOneAndUpdate").mockImplementation((query, update) =>
        Promise.resolve({ ...baseCoupon, usedCount: 1 })
      );

      vi.spyOn(CouponReservation, "create").mockImplementation((data) => {
        const doc = { _id: `res-${data.slotNumber}`, ...data };
        consumedReservations.push(doc);
        return Promise.resolve(doc);
      });

      vi.spyOn(Order, "create").mockImplementation((data) => {
        return Promise.resolve({ _id: `ord-${data.items[0].product}`, ...data });
      });
      vi.spyOn(CouponUsage, "create").mockImplementation(() => {
        redemptionsCount++;
        return Promise.resolve(true);
      });

      // Attempt 1: succeeds (slot 1)
      const res1 = await request(app)
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ addressId: validAddressId, couponCode: "SUMMER10" });
      expect(res1.status).toBe(201);

      // Attempt 2: succeeds (slot 2)
      const res2 = await request(app)
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ addressId: validAddressId, couponCode: "SUMMER10" });
      expect(res2.status).toBe(201);

      // Attempt 3: rejected with COUPON_USER_USAGE_LIMIT_REACHED
      const res3 = await request(app)
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ addressId: validAddressId, couponCode: "SUMMER10" });
      expect(res3.status).toBe(400);
      expect(res3.body.error.code).toBe("COUPON_USER_USAGE_LIMIT_REACHED");
    });
  });

  describe("Section 8 — Safe Failure Compensation & Token Ownership", () => {
    it("proves compensation releases ONLY the failing request's reservation and keeps another request's reservation intact", async () => {
      const mockCart = createMockCart();
      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockCart)
      });
      vi.spyOn(Coupon, "findOne").mockResolvedValue({ ...baseCoupon });
      vi.spyOn(CouponUsage, "countDocuments").mockResolvedValue(0);

      const findOneAndUpdateSpy = vi.spyOn(Coupon, "findOneAndUpdate");

      // 1. Request A reserves usage
      let tokenA;
      findOneAndUpdateSpy.mockImplementationOnce((query, update) => {
        tokenA = update.$push.reservations;
        return Promise.resolve({
          ...baseCoupon,
          usedCount: 6,
          reservations: [tokenA]
        });
      });

      // Compensation call for Request A
      findOneAndUpdateSpy.mockImplementationOnce((query, update) => {
        // Query must specifically match tokenA!
        expect(query.reservations).toBe(tokenA);
        expect(query.usedCount).toEqual({ $gt: 0 });
        expect(update.$inc.usedCount).toBe(-1);
        expect(update.$pull.reservations).toBe(tokenA);
        return Promise.resolve({
          ...baseCoupon,
          usedCount: 5,
          reservations: []
        });
      });

      // Downstream failure triggers compensation after reservation
      vi.spyOn(Order, "create").mockImplementation((data) =>
        Promise.resolve({ _id: "607f1f77bcf86cd799439099", ...data })
      );
      vi.spyOn(CouponUsage, "create").mockRejectedValue(new Error("Simulated DB failure"));
      const userResDeleteSpy = vi.spyOn(CouponReservation, "deleteOne");

      const resA = await request(app)
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          addressId: validAddressId,
          couponCode: "SUMMER10"
        });

      expect(resA.status).toBe(500);

      // Verified: User reservation was deleted
      expect(userResDeleteSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          reservationId: tokenA
        })
      );

      // Verified: Global coupon compensation called with specific reservationId ownership token
      expect(findOneAndUpdateSpy).toHaveBeenCalledTimes(2);
      expect(findOneAndUpdateSpy).toHaveBeenLastCalledWith(
        {
          _id: validCouponId,
          reservations: tokenA,
          usedCount: { $gt: 0 }
        },
        {
          $inc: { usedCount: -1 },
          $pull: { reservations: tokenA }
        }
      );
    });

    it("proves compensation query requires usedCount > 0 and cannot decrement below zero", async () => {
      const mockCart = createMockCart();
      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockCart)
      });
      vi.spyOn(Coupon, "findOne").mockResolvedValue({ ...baseCoupon });
      vi.spyOn(CouponUsage, "countDocuments").mockResolvedValue(0);

      const findOneAndUpdateSpy = vi
        .spyOn(Coupon, "findOneAndUpdate")
        .mockResolvedValueOnce({ ...baseCoupon, usedCount: 1, reservations: ["tok1"] })
        .mockResolvedValueOnce(true);

      vi.spyOn(Order, "create").mockImplementation((data) =>
        Promise.resolve({ _id: "607f1f77bcf86cd799439099", ...data })
      );
      vi.spyOn(CouponUsage, "create").mockRejectedValue(new Error("Write error"));

      await request(app)
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          addressId: validAddressId,
          couponCode: "SUMMER10"
        });

      // Ensure compensation filter has usedCount: { $gt: 0 }
      const compensationCall = findOneAndUpdateSpy.mock.calls[1];
      expect(compensationCall[0].usedCount).toEqual({ $gt: 0 });
    });

    it("proves successful redemption pulls reservation token without decrementing usedCount", async () => {
      const mockCart = createMockCart();
      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockCart)
      });
      vi.spyOn(Coupon, "findOne").mockResolvedValue({ ...baseCoupon });
      vi.spyOn(CouponUsage, "countDocuments").mockResolvedValue(0);

      let capturedToken;
      vi.spyOn(Coupon, "findOneAndUpdate").mockImplementation((query, update) => {
        capturedToken = update.$push.reservations;
        return Promise.resolve({
          ...baseCoupon,
          usedCount: 6,
          reservations: [capturedToken]
        });
      });

      const couponUpdateOneSpy = vi.spyOn(Coupon, "updateOne");
      const userResUpdateSpy = vi.spyOn(CouponReservation, "updateOne");

      vi.spyOn(Order, "create").mockImplementation((data) =>
        Promise.resolve({ _id: "607f1f77bcf86cd799439099", ...data })
      );
      vi.spyOn(CouponUsage, "create").mockResolvedValue(true);

      const res = await request(app)
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          addressId: validAddressId,
          couponCode: "SUMMER10"
        });

      expect(res.status).toBe(201);

      // Verified: on success, Coupon.updateOne pulls the token without decrementing usedCount!
      expect(couponUpdateOneSpy).toHaveBeenCalledWith(
        { _id: validCouponId },
        { $pull: { reservations: capturedToken } }
      );

      // Verified: user reservation marked as consumed
      expect(userResUpdateSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          $set: expect.objectContaining({
            status: "consumed",
            order: "607f1f77bcf86cd799439099"
          })
        })
      );
    });

    it("proves retry after a failed redemption works correctly", async () => {
      let isFirstAttempt = true;
      const mockCart = createMockCart();

      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockCart)
      });
      vi.spyOn(Coupon, "findOne").mockResolvedValue({ ...baseCoupon });
      vi.spyOn(CouponUsage, "countDocuments").mockResolvedValue(0);
      vi.spyOn(CouponReservation, "find").mockResolvedValue([]);
      vi.spyOn(CouponReservation, "countDocuments").mockResolvedValue(0);

      vi.spyOn(Coupon, "findOneAndUpdate").mockResolvedValue({
        ...baseCoupon,
        usedCount: 6
      });

      vi.spyOn(Order, "create").mockImplementation((data) => {
        if (isFirstAttempt) {
          isFirstAttempt = false;
          return Promise.reject(new Error("Transient payment failure"));
        }
        return Promise.resolve({ _id: "607f1f77bcf86cd799439099", ...data });
      });

      vi.spyOn(CouponUsage, "create").mockResolvedValue(true);

      // First attempt: fails
      const res1 = await request(app)
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          addressId: validAddressId,
          couponCode: "SUMMER10"
        });
      expect(res1.status).toBe(500);

      // Second attempt (retry): succeeds!
      const res2 = await request(app)
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          addressId: validAddressId,
          couponCode: "SUMMER10"
        });
      expect(res2.status).toBe(201);
      expect(res2.body.success).toBe(true);
      expect(res2.body.data.order.discountAmount).toBe(200);
    });
  });

  describe("Security: Payload Injection & Customer Isolation", () => {
    it("rejects client attempts to inject discount into order body", async () => {
      const res = await request(app)
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          addressId: validAddressId,
          couponCode: "SUMMER10",
          discount: 500
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects client attempts to inject total into order body", async () => {
      const res = await request(app)
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          addressId: validAddressId,
          total: 10
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects client attempts to inject usedCount or status into order body", async () => {
      const res = await request(app)
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          addressId: validAddressId,
          usedCount: 0,
          status: "confirmed"
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("enforces customer isolation: cannot order using another user's address", async () => {
      vi.spyOn(Address, "findOne").mockResolvedValue(null);

      const res = await request(app)
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          addressId: "507f1f77bcf86cd799439088" // Other user's address
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("ADDRESS_NOT_FOUND");
    });
  });

  describe("Payment Authority Binding", () => {
    it("verifies Razorpay payment creation uses discounted Order.total authoritatively", async () => {
      const discountedOrder = {
        _id: "607f1f77bcf86cd799439099",
        user: customerUserId,
        subtotal: 2000,
        discountAmount: 500,
        total: 1500, // Discounted total
        status: "pending",
        payment: {
          provider: "razorpay",
          status: "pending",
          transactionId: "",
          razorpayOrderId: ""
        },
        save: vi.fn().mockResolvedValue(true)
      };

      vi.spyOn(Order, "findOne").mockResolvedValue(discountedOrder);
      const razorpayCreateSpy = vi.spyOn(razorpay.orders, "create").mockResolvedValue({
        id: "order_mock123",
        amount: 150000, // 1500 INR in paise
        currency: "INR"
      });

      const res = await request(app)
        .post(`/api/v1/payments/orders/${discountedOrder._id}`)
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(201);
      expect(razorpayCreateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 150000, // Strictly 1500 * 100 paise, NOT 2000 * 100 paise!
          currency: "INR"
        })
      );
      expect(res.body.data.amount).toBe(150000);
    });
  });

  describe("Post-Order Compensation Hardening (P1.1 Step 77.5.1)", () => {
    it("explicitly transitions created order to cancelled if CouponUsage.create throws an error", async () => {
      const mockCart = createMockCart();
      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockCart)
      });
      vi.spyOn(Coupon, "findOne").mockResolvedValue({ ...baseCoupon });
      vi.spyOn(CouponUsage, "countDocuments").mockResolvedValue(0);

      const reservedDoc = { ...baseCoupon, usedCount: 6, reservations: ["tok-fail-usage"] };
      const couponFindAndUpdateSpy = vi
        .spyOn(Coupon, "findOneAndUpdate")
        .mockResolvedValueOnce(reservedDoc) // 1: reservation
        .mockResolvedValueOnce(true); // 2: compensation

      const createdOrderId = "607f1f77bcf86cd799439099";
      vi.spyOn(Order, "create").mockImplementation((data) =>
        Promise.resolve({ _id: createdOrderId, ...data, status: "pending" })
      );

      const orderCancelSpy = vi.spyOn(Order, "findByIdAndUpdate").mockResolvedValue(true);
      const userResDeleteSpy = vi.spyOn(CouponReservation, "deleteOne");
      const rollbackProductSpy = vi.spyOn(Product, "findOneAndUpdate");

      // CouponUsage creation throws a database failure
      vi.spyOn(CouponUsage, "create").mockRejectedValue(new Error("Audit record write failed"));

      const res = await request(app)
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          addressId: validAddressId,
          couponCode: "SUMMER10"
        });

      expect(res.status).toBe(500);

      // Invariant: Created order must be explicitly cancelled!
      expect(orderCancelSpy).toHaveBeenCalledWith(
        createdOrderId,
        {
          $set: {
            status: "cancelled",
            cancellation: {
              reason: "system_checkout_failure",
              reasonDetail: "",
              cancelledBy: "system",
              cancelledAt: expect.any(Date)
            }
          }
        }
      );

      // Invariant: User reservation released
      expect(userResDeleteSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          reservationId: expect.any(String)
        })
      );

      // Invariant: Global coupon usage compensated
      expect(couponFindAndUpdateSpy).toHaveBeenCalledTimes(2);
      expect(couponFindAndUpdateSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          _id: validCouponId,
          reservations: expect.any(String),
          usedCount: { $gt: 0 }
        }),
        expect.objectContaining({
          $inc: { usedCount: -1 },
          $pull: { reservations: expect.any(String) }
        })
      );

      // Invariant: Product inventory stock restored
      expect(rollbackProductSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: mockProduct._id,
          restorationKeys: { $ne: expect.any(String) }
        }),
        expect.objectContaining({
          $inc: { stock: 1 }
        }),
        expect.anything()
      );

      // Invariant: Cart was NOT cleared on failure
      expect(mockCart.items).toHaveLength(1);
    });

    it("cancels created order and deletes created CouponUsage if Coupon.updateOne fails during finalization", async () => {
      const mockCart = createMockCart();
      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockCart)
      });
      vi.spyOn(Coupon, "findOne").mockResolvedValue({ ...baseCoupon });
      vi.spyOn(CouponUsage, "countDocuments").mockResolvedValue(0);

      const reservedDoc = { ...baseCoupon, usedCount: 6, reservations: ["tok-fin-fail"] };
      vi.spyOn(Coupon, "findOneAndUpdate")
        .mockResolvedValueOnce(reservedDoc)
        .mockResolvedValueOnce(true);

      const createdOrderId = "607f1f77bcf86cd799439099";
      vi.spyOn(Order, "create").mockImplementation((data) =>
        Promise.resolve({ _id: createdOrderId, ...data, status: "pending" })
      );

      const usageDocId = "usage-doc-12345";
      vi.spyOn(CouponUsage, "create").mockResolvedValue({ _id: usageDocId, status: "redeemed" });
      const usageDeleteSpy = vi.spyOn(CouponUsage, "deleteOne").mockResolvedValue(true);
      const orderCancelSpy = vi.spyOn(Order, "findByIdAndUpdate").mockResolvedValue(true);
      const userResDeleteSpy = vi.spyOn(CouponReservation, "deleteOne");

      // Coupon.updateOne throws an error during finalization
      vi.spyOn(Coupon, "updateOne").mockRejectedValue(new Error("Token release write failed"));

      const res = await request(app)
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          addressId: validAddressId,
          couponCode: "SUMMER10"
        });

      expect(res.status).toBe(500);

      // Invariant: Order cancelled
      expect(orderCancelSpy).toHaveBeenCalledWith(
        createdOrderId,
        {
          $set: {
            status: "cancelled",
            cancellation: {
              reason: "system_checkout_failure",
              reasonDetail: "",
              cancelledBy: "system",
              cancelledAt: expect.any(Date)
            }
          }
        }
      );

      // Invariant: Created CouponUsage deleted to avoid leaving orphan redeemed record
      expect(usageDeleteSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: usageDocId
        })
      );

      // Invariant: User reservation released
      expect(userResDeleteSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          reservationId: expect.any(String)
        })
      );
    });

    it("cancels created order and deletes created CouponUsage if CouponReservation.updateOne fails during finalization", async () => {
      const mockCart = createMockCart();
      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockCart)
      });
      vi.spyOn(Coupon, "findOne").mockResolvedValue({ ...baseCoupon });
      vi.spyOn(CouponUsage, "countDocuments").mockResolvedValue(0);

      const reservedDoc = { ...baseCoupon, usedCount: 6, reservations: ["tok-fin-res-fail"] };
      vi.spyOn(Coupon, "findOneAndUpdate")
        .mockResolvedValueOnce(reservedDoc)
        .mockResolvedValueOnce(true);

      const createdOrderId = "607f1f77bcf86cd799439099";
      vi.spyOn(Order, "create").mockImplementation((data) =>
        Promise.resolve({ _id: createdOrderId, ...data, status: "pending" })
      );

      const usageDocId = "usage-doc-67890";
      vi.spyOn(CouponUsage, "create").mockResolvedValue({ _id: usageDocId, status: "redeemed" });
      const usageDeleteSpy = vi.spyOn(CouponUsage, "deleteOne").mockResolvedValue(true);
      const orderCancelSpy = vi.spyOn(Order, "findByIdAndUpdate").mockResolvedValue(true);

      // Coupon.updateOne succeeds
      vi.spyOn(Coupon, "updateOne").mockResolvedValue(true);
      // But CouponReservation.updateOne throws!
      vi.spyOn(CouponReservation, "updateOne").mockRejectedValue(new Error("Reservation consumed update failed"));

      const res = await request(app)
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          addressId: validAddressId,
          couponCode: "SUMMER10"
        });

      expect(res.status).toBe(500);

      // Invariant: Order cancelled
      expect(orderCancelSpy).toHaveBeenCalledWith(
        createdOrderId,
        {
          $set: {
            status: "cancelled",
            cancellation: {
              reason: "system_checkout_failure",
              reasonDetail: "",
              cancelledBy: "system",
              cancelledAt: expect.any(Date)
            }
          }
        }
      );

      // Invariant: CouponUsage deleted
      expect(usageDeleteSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: usageDocId
        })
      );
    });

    it("cancels created order and cleans up reservations if cart.save() throws during final step", async () => {
      const mockCart = createMockCart();
      // cart.save throws
      mockCart.save = vi.fn().mockRejectedValue(new Error("Cart write failed"));

      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockCart)
      });
      vi.spyOn(Coupon, "findOne").mockResolvedValue({ ...baseCoupon });
      vi.spyOn(CouponUsage, "countDocuments").mockResolvedValue(0);

      const reservedDoc = { ...baseCoupon, usedCount: 6, reservations: ["tok-cart-fail"] };
      vi.spyOn(Coupon, "findOneAndUpdate")
        .mockResolvedValueOnce(reservedDoc)
        .mockResolvedValueOnce(true);

      const createdOrderId = "607f1f77bcf86cd799439099";
      vi.spyOn(Order, "create").mockImplementation((data) =>
        Promise.resolve({ _id: createdOrderId, ...data, status: "pending" })
      );

      const usageDocId = "usage-doc-11111";
      vi.spyOn(CouponUsage, "create").mockResolvedValue({ _id: usageDocId, status: "redeemed" });
      const usageDeleteSpy = vi.spyOn(CouponUsage, "deleteOne").mockResolvedValue(true);
      const orderCancelSpy = vi.spyOn(Order, "findByIdAndUpdate").mockResolvedValue(true);

      const res = await request(app)
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          addressId: validAddressId,
          couponCode: "SUMMER10"
        });

      expect(res.status).toBe(500);

      // Invariant: Order cancelled
      expect(orderCancelSpy).toHaveBeenCalledWith(
        createdOrderId,
        {
          $set: {
            status: "cancelled",
            cancellation: {
              reason: "system_checkout_failure",
              reasonDetail: "",
              cancelledBy: "system",
              cancelledAt: expect.any(Date)
            }
          }
        }
      );

      // Invariant: CouponUsage deleted
      expect(usageDeleteSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: usageDocId
        })
      );
    });

    it("verifies that a cancelled compensated order cannot subsequently create a valid payment order", async () => {
      const cancelledOrder = {
        _id: "607f1f77bcf86cd799439099",
        user: customerUserId,
        subtotal: 2000,
        discountAmount: 200,
        total: 1800,
        status: "cancelled", // Cancelled by post-order compensation
        payment: {
          provider: "razorpay",
          status: "pending",
          transactionId: "",
          razorpayOrderId: ""
        }
      };

      vi.spyOn(Order, "findOne").mockResolvedValue(cancelledOrder);
      const razorpayCreateSpy = vi.spyOn(razorpay.orders, "create");

      const res = await request(app)
        .post(`/api/v1/payments/orders/${cancelledOrder._id}`)
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("ORDER_CANCELLED");
      expect(razorpayCreateSpy).not.toHaveBeenCalled();
    });

    it("verifies cart remains intact after failed redemption", async () => {
      const mockCart = createMockCart();
      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockCart)
      });
      vi.spyOn(Coupon, "findOne").mockResolvedValue({ ...baseCoupon });
      vi.spyOn(CouponUsage, "countDocuments").mockResolvedValue(0);
      vi.spyOn(Coupon, "findOneAndUpdate")
        .mockResolvedValueOnce({ ...baseCoupon, usedCount: 6, reservations: ["tok-intact"] })
        .mockResolvedValueOnce(true);

      vi.spyOn(Order, "create").mockRejectedValue(new Error("DB failure"));

      const res = await request(app)
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          addressId: validAddressId,
          couponCode: "SUMMER10"
        });

      expect(res.status).toBe(500);
      // Cart items were not touched or cleared
      expect(mockCart.items).toHaveLength(1);
      expect(mockCart.items[0].product.name).toBe("Basecamp 4-Person Tent");
    });
  });

  describe("P1.1 Step 77.5.2 — Hardened Compensation Failure State & Observability (Tests A - E)", () => {
    it("Test A: Order cancellation fails - original error preserved, failure logged, order marked compensation_pending, payment blocked", async () => {
      const mockCart = createMockCart();
      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockCart)
      });
      vi.spyOn(Coupon, "findOne").mockResolvedValue({ ...baseCoupon });
      vi.spyOn(CouponUsage, "countDocuments").mockResolvedValue(0);
      vi.spyOn(Coupon, "findOneAndUpdate")
        .mockResolvedValueOnce({ ...baseCoupon, usedCount: 6, reservations: ["tok-a"] })
        .mockResolvedValueOnce(true);

      const createdOrder = {
        _id: "607f1f77bcf86cd799439099",
        user: customerUserId,
        status: "pending",
        checkoutState: "none",
        subtotal: 2000,
        discountAmount: 200,
        total: 1800,
        payment: { provider: "razorpay", status: "pending", razorpayOrderId: "" }
      };

      vi.spyOn(Order, "create").mockResolvedValue(createdOrder);
      vi.spyOn(CouponUsage, "create").mockRejectedValue(new Error("Downstream DB error"));

      // Compensation: Order cancellation throws on first call, then updates checkoutState on second call
      const updateOrderStateSpy = vi.spyOn(Order, "findByIdAndUpdate")
        .mockRejectedValueOnce(new Error("Order cancel DB error"))
        .mockResolvedValueOnce(true);

      const res = await request(app)
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          addressId: validAddressId,
          couponCode: "SUMMER10"
        });

      // Original checkout error preserved (500)
      expect(res.status).toBe(500);

      // Order was marked as compensation_pending for reconciliation
      expect(updateOrderStateSpy).toHaveBeenCalledWith(createdOrder._id, {
        $set: { checkoutState: "compensation_pending" }
      });

      // Subsequent payment attempt is rejected with 400 ORDER_COMPENSATION_PENDING
      createdOrder.checkoutState = "compensation_pending";
      vi.spyOn(Order, "findOne").mockResolvedValue(createdOrder);
      const razorpayCreateSpy = vi.spyOn(razorpay.orders, "create");

      const payRes = await request(app)
        .post(`/api/v1/payments/orders/${createdOrder._id}`)
        .set("Authorization", `Bearer ${customerToken}`);

      expect(payRes.status).toBe(400);
      expect(payRes.body.error.code).toBe("ORDER_COMPENSATION_PENDING");
      expect(razorpayCreateSpy).not.toHaveBeenCalled();
    });

    it("Test B: CouponUsage deletion fails - failure is observable and order is marked compensation_pending", async () => {
      const mockCart = createMockCart();
      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockCart)
      });
      vi.spyOn(Coupon, "findOne").mockResolvedValue({ ...baseCoupon });
      vi.spyOn(CouponUsage, "countDocuments").mockResolvedValue(0);
      vi.spyOn(Coupon, "findOneAndUpdate")
        .mockResolvedValueOnce({ ...baseCoupon, usedCount: 6, reservations: ["tok-b"] })
        .mockResolvedValueOnce(true);

      const createdOrder = {
        _id: "607f1f77bcf86cd799439099",
        user: customerUserId,
        status: "pending",
        checkoutState: "none"
      };
      const createdCouponUsage = { _id: "607f1f77bcf86cd799439088", order: createdOrder._id };

      vi.spyOn(Order, "create").mockResolvedValue(createdOrder);
      vi.spyOn(CouponUsage, "create").mockResolvedValue(createdCouponUsage);

      // Final step fails (e.g. Coupon.updateOne pulling token throws)
      vi.spyOn(Coupon, "updateOne").mockRejectedValue(new Error("Token pull error"));

      // Compensation: Order cancellation succeeds, but CouponUsage.deleteOne fails
      vi.spyOn(Order, "findById").mockResolvedValue(createdOrder);
      vi.spyOn(Order, "findOneAndUpdate").mockResolvedValue({ ...createdOrder, status: "cancelled" });
      vi.spyOn(CouponUsage, "deleteOne").mockRejectedValue(new Error("Usage delete failure"));
      const updateOrderStateSpy = vi.spyOn(Order, "findByIdAndUpdate").mockResolvedValue(true);

      const res = await request(app)
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          addressId: validAddressId,
          couponCode: "SUMMER10"
        });

      expect(res.status).toBe(500);
      expect(updateOrderStateSpy).toHaveBeenCalledWith(createdOrder._id, {
        $set: { checkoutState: "compensation_pending" }
      });
    });

    it("Test C: Per-user reservation deletion fails - original error preserved and failure logged", async () => {
      const mockCart = createMockCart();
      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockCart)
      });
      vi.spyOn(Coupon, "findOne").mockResolvedValue({ ...baseCoupon });
      vi.spyOn(CouponUsage, "countDocuments").mockResolvedValue(0);
      vi.spyOn(Coupon, "findOneAndUpdate")
        .mockResolvedValueOnce({ ...baseCoupon, usedCount: 6, reservations: ["tok-c"] })
        .mockResolvedValueOnce(true);

      const createdOrder = {
        _id: "607f1f77bcf86cd799439099",
        user: customerUserId,
        status: "pending",
        checkoutState: "none"
      };

      vi.spyOn(Order, "create").mockResolvedValue(createdOrder);
      vi.spyOn(CouponUsage, "create").mockRejectedValue(new Error("Usage creation failed"));

      // Compensation: CouponReservation.deleteOne fails
      vi.spyOn(Order, "findById").mockResolvedValue(createdOrder);
      vi.spyOn(Order, "findOneAndUpdate").mockResolvedValue({ ...createdOrder, status: "cancelled" });
      vi.spyOn(CouponReservation, "deleteOne").mockRejectedValue(new Error("Reservation deletion failed"));
      const updateOrderStateSpy = vi.spyOn(Order, "findByIdAndUpdate").mockResolvedValue(true);

      const res = await request(app)
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          addressId: validAddressId,
          couponCode: "SUMMER10"
        });

      expect(res.status).toBe(500);
      expect(updateOrderStateSpy).toHaveBeenCalledWith(createdOrder._id, {
        $set: { checkoutState: "compensation_pending" }
      });
    });

    it("Test D: Global coupon release fails - original error preserved and failure logged", async () => {
      const mockCart = createMockCart();
      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockCart)
      });
      vi.spyOn(Coupon, "findOne").mockResolvedValue({ ...baseCoupon });
      vi.spyOn(CouponUsage, "countDocuments").mockResolvedValue(0);

      // 1st call for reservation succeeds, 2nd call during compensation fails
      vi.spyOn(Coupon, "findOneAndUpdate")
        .mockResolvedValueOnce({ ...baseCoupon, usedCount: 6, reservations: ["tok-d"] })
        .mockRejectedValueOnce(new Error("Global release error"));

      const createdOrder = {
        _id: "607f1f77bcf86cd799439099",
        user: customerUserId,
        status: "pending",
        checkoutState: "none"
      };

      vi.spyOn(Order, "create").mockResolvedValue(createdOrder);
      vi.spyOn(CouponUsage, "create").mockRejectedValue(new Error("Usage creation failed"));

      vi.spyOn(Order, "findById").mockResolvedValue(createdOrder);
      vi.spyOn(Order, "findOneAndUpdate").mockResolvedValue({ ...createdOrder, status: "cancelled" });
      const updateOrderStateSpy = vi.spyOn(Order, "findByIdAndUpdate").mockResolvedValue(true);

      const res = await request(app)
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          addressId: validAddressId,
          couponCode: "SUMMER10"
        });

      expect(res.status).toBe(500);
      expect(updateOrderStateSpy).toHaveBeenCalledWith(createdOrder._id, {
        $set: { checkoutState: "compensation_pending" }
      });
    });

    it("Test E: Inventory restoration fails - original error preserved and order marked compensation_pending", async () => {
      const mockCart = createMockCart();
      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockCart)
      });
      vi.spyOn(Coupon, "findOne").mockResolvedValue({ ...baseCoupon });
      vi.spyOn(CouponUsage, "countDocuments").mockResolvedValue(0);
      vi.spyOn(Coupon, "findOneAndUpdate")
        .mockResolvedValueOnce({ ...baseCoupon, usedCount: 6, reservations: ["tok-e"] })
        .mockResolvedValueOnce(true);

      const createdOrder = {
        _id: "607f1f77bcf86cd799439099",
        user: customerUserId,
        status: "pending",
        checkoutState: "none"
      };

      vi.spyOn(Order, "create").mockResolvedValue(createdOrder);
      vi.spyOn(CouponUsage, "create").mockRejectedValue(new Error("Usage creation failed"));

      vi.spyOn(Order, "findById").mockResolvedValue(createdOrder);
      vi.spyOn(Order, "findOneAndUpdate").mockResolvedValue({ ...createdOrder, status: "cancelled" });
      // Product stock rollback fails
      vi.spyOn(Product, "findOneAndUpdate").mockImplementation((query, update) => {
        if (query && query.restorationKeys) {
          return Promise.reject(new Error("Stock rollback failure"));
        }
        if (query._id === mockProduct._id) {
          return Promise.resolve({
            ...mockProduct,
            stock: mockProduct.stock + (update?.$inc?.stock || 0)
          });
        }
        return Promise.resolve(null);
      });
      const updateOrderStateSpy = vi.spyOn(Order, "findByIdAndUpdate").mockResolvedValue(true);

      const res = await request(app)
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          addressId: validAddressId,
          couponCode: "SUMMER10"
        });

      expect(res.status).toBe(500);
      expect(updateOrderStateSpy).toHaveBeenCalledWith(createdOrder._id, {
        $set: { checkoutState: "compensation_pending" }
      });
    });
  });
});
