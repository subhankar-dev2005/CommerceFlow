import { describe, it, expect } from "vitest";
import { evaluateCouponEligibility } from "./coupon.service.js";

describe("Coupon Service — evaluateCouponEligibility", () => {
  const baseCoupon = {
    _id: "507f1f77bcf86cd799439011",
    code: "SUMMER10",
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

  const sampleProduct = {
    _id: "607f1f77bcf86cd799439099",
    name: "Camping Tent",
    price: 1500,
    category: "Camping",
    isActive: true
  };

  const defaultCartItems = [
    {
      product: sampleProduct,
      quantity: 1
    }
  ];

  it("returns COUPON_NOT_FOUND when coupon is null or undefined", () => {
    const resNull = evaluateCouponEligibility(null, {
      cartItems: defaultCartItems,
      subtotal: 1500
    });
    expect(resNull.isValid).toBe(false);
    expect(resNull.error.code).toBe("COUPON_NOT_FOUND");
    expect(resNull.error.statusCode).toBe(404);

    const resUndefined = evaluateCouponEligibility(undefined);
    expect(resUndefined.isValid).toBe(false);
    expect(resUndefined.error.code).toBe("COUPON_NOT_FOUND");
  });

  it("returns COUPON_INACTIVE when coupon.isActive is false", () => {
    const coupon = { ...baseCoupon, isActive: false };
    const res = evaluateCouponEligibility(coupon, {
      cartItems: defaultCartItems,
      subtotal: 1500
    });

    expect(res.isValid).toBe(false);
    expect(res.error.code).toBe("COUPON_INACTIVE");
    expect(res.error.statusCode).toBe(400);
  });

  it("returns COUPON_NOT_STARTED when current time is before startsAt", () => {
    const futureDate = new Date(Date.now() + 100000);
    const coupon = { ...baseCoupon, startsAt: futureDate };
    const res = evaluateCouponEligibility(coupon, {
      cartItems: defaultCartItems,
      subtotal: 1500
    });

    expect(res.isValid).toBe(false);
    expect(res.error.code).toBe("COUPON_NOT_STARTED");
    expect(res.error.statusCode).toBe(400);
  });

  it("returns COUPON_EXPIRED when current time is after expiresAt", () => {
    const pastDate = new Date(Date.now() - 100000);
    const coupon = { ...baseCoupon, expiresAt: pastDate };
    const res = evaluateCouponEligibility(coupon, {
      cartItems: defaultCartItems,
      subtotal: 1500
    });

    expect(res.isValid).toBe(false);
    expect(res.error.code).toBe("COUPON_EXPIRED");
    expect(res.error.statusCode).toBe(400);
  });

  it("returns COUPON_USAGE_LIMIT_REACHED when usedCount >= usageLimit", () => {
    const coupon = { ...baseCoupon, usageLimit: 50, usedCount: 50 };
    const res = evaluateCouponEligibility(coupon, {
      cartItems: defaultCartItems,
      subtotal: 1500
    });

    expect(res.isValid).toBe(false);
    expect(res.error.code).toBe("COUPON_USAGE_LIMIT_REACHED");
    expect(res.error.statusCode).toBe(400);
  });

  it("allows coupon when usedCount < usageLimit", () => {
    const coupon = { ...baseCoupon, usageLimit: 50, usedCount: 49 };
    const res = evaluateCouponEligibility(coupon, {
      cartItems: defaultCartItems,
      subtotal: 1500
    });

    expect(res.isValid).toBe(true);
    expect(res.discountAmount).toBe(150);
  });

  it("returns COUPON_MINIMUM_SUBTOTAL_NOT_MET when subtotal is below minimumSubtotal", () => {
    const coupon = { ...baseCoupon, minimumSubtotal: 2000 };
    const res = evaluateCouponEligibility(coupon, {
      cartItems: defaultCartItems,
      subtotal: 1500
    });

    expect(res.isValid).toBe(false);
    expect(res.error.code).toBe("COUPON_MINIMUM_SUBTOTAL_NOT_MET");
    expect(res.error.statusCode).toBe(400);
  });

  it("validates product restrictions correctly", () => {
    const matchingProductId = "607f1f77bcf86cd799439099";
    const otherProductId = "607f1f77bcf86cd799439088";

    const restrictedCoupon = {
      ...baseCoupon,
      applicableProducts: [matchingProductId]
    };

    // Fails when cart does not contain matching product
    const failingCartItems = [
      {
        product: {
          _id: otherProductId,
          name: "Other Product",
          price: 1500,
          category: "Camping",
          isActive: true
        },
        quantity: 1
      }
    ];

    const failRes = evaluateCouponEligibility(restrictedCoupon, {
      cartItems: failingCartItems,
      subtotal: 1500
    });
    expect(failRes.isValid).toBe(false);
    expect(failRes.error.code).toBe("COUPON_PRODUCT_NOT_APPLICABLE");

    // Passes when cart contains matching product
    const passRes = evaluateCouponEligibility(restrictedCoupon, {
      cartItems: defaultCartItems,
      subtotal: 1500
    });
    expect(passRes.isValid).toBe(true);
    expect(passRes.discountAmount).toBe(150);
  });

  it("validates category restrictions correctly (case-insensitive)", () => {
    const restrictedCoupon = {
      ...baseCoupon,
      applicableCategories: ["Camping"]
    };

    // Fails when cart category does not match
    const failingCartItems = [
      {
        product: {
          _id: "607f1f77bcf86cd799439088",
          name: "Running Shoes",
          price: 1500,
          category: "Footwear",
          isActive: true
        },
        quantity: 1
      }
    ];

    const failRes = evaluateCouponEligibility(restrictedCoupon, {
      cartItems: failingCartItems,
      subtotal: 1500
    });
    expect(failRes.isValid).toBe(false);
    expect(failRes.error.code).toBe("COUPON_CATEGORY_NOT_APPLICABLE");

    // Passes when cart contains matching category with different casing
    const passingCartItems = [
      {
        product: {
          _id: "607f1f77bcf86cd799439088",
          name: "Sleeping Bag",
          price: 1500,
          category: "camping",
          isActive: true
        },
        quantity: 1
      }
    ];

    const passRes = evaluateCouponEligibility(restrictedCoupon, {
      cartItems: passingCartItems,
      subtotal: 1500
    });
    expect(passRes.isValid).toBe(true);
  });

  it("enforces OR semantics across product and category restrictions", () => {
    const targetProductId = "607f1f77bcf86cd799439099";
    const restrictedCoupon = {
      ...baseCoupon,
      applicableProducts: [targetProductId],
      applicableCategories: ["Climbing"]
    };

    // Case A: Cart item matches product ID (even if category is Footwear)
    const cartMatchesProductOnly = [
      {
        product: {
          _id: targetProductId,
          name: "Special Gear",
          price: 1500,
          category: "Footwear",
          isActive: true
        },
        quantity: 1
      }
    ];
    const resA = evaluateCouponEligibility(restrictedCoupon, {
      cartItems: cartMatchesProductOnly,
      subtotal: 1500
    });
    expect(resA.isValid).toBe(true);

    // Case B: Cart item matches category Climbing (even if product ID is different)
    const cartMatchesCategoryOnly = [
      {
        product: {
          _id: "607f1f77bcf86cd799439077",
          name: "Climbing Rope",
          price: 1500,
          category: "Climbing",
          isActive: true
        },
        quantity: 1
      }
    ];
    const resB = evaluateCouponEligibility(restrictedCoupon, {
      cartItems: cartMatchesCategoryOnly,
      subtotal: 1500
    });
    expect(resB.isValid).toBe(true);

    // Case C: Cart item matches neither product nor category
    const cartMatchesNeither = [
      {
        product: {
          _id: "607f1f77bcf86cd799439066",
          name: "Water Bottle",
          price: 1500,
          category: "Hydration",
          isActive: true
        },
        quantity: 1
      }
    ];
    const resC = evaluateCouponEligibility(restrictedCoupon, {
      cartItems: cartMatchesNeither,
      subtotal: 1500
    });
    expect(resC.isValid).toBe(false);
    expect(resC.error.code).toBe("COUPON_PRODUCT_NOT_APPLICABLE");
  });

  it("ignores inactive products in cart for eligibility matching", () => {
    const matchingProductId = "607f1f77bcf86cd799439099";
    const restrictedCoupon = {
      ...baseCoupon,
      applicableProducts: [matchingProductId]
    };

    // Product matches ID but isActive is false
    const cartWithInactiveItem = [
      {
        product: {
          _id: matchingProductId,
          name: "Deactivated Tent",
          price: 1500,
          category: "Camping",
          isActive: false
        },
        quantity: 1
      }
    ];

    const res = evaluateCouponEligibility(restrictedCoupon, {
      cartItems: cartWithInactiveItem,
      subtotal: 1500
    });
    expect(res.isValid).toBe(false);
    expect(res.error.code).toBe("COUPON_PRODUCT_NOT_APPLICABLE");
  });
});
