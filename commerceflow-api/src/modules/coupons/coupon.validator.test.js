import { describe, it, expect } from "vitest";
import createCouponSchema, {
  normalizeCouponCode,
  updateCouponSchema,
  updateCouponStatusSchema,
  couponIdParamSchema,
  getAdminCouponsSchema
} from "./coupon.validator.js";

describe("Coupon Normalization (normalizeCouponCode)", () => {
  it("trims and converts codes to uppercase", () => {
    expect(normalizeCouponCode(" summer10 ")).toBe("SUMMER10");
    expect(normalizeCouponCode("summer10")).toBe("SUMMER10");
    expect(normalizeCouponCode("Summer10")).toBe("SUMMER10");
    expect(normalizeCouponCode("SUMMER10")).toBe("SUMMER10");
    expect(normalizeCouponCode("SuMmEr10")).toBe("SUMMER10");
    expect(normalizeCouponCode("  GEAR-2026_PRO  ")).toBe("GEAR-2026_PRO");
  });

  it("handles non-string inputs safely by returning empty string", () => {
    expect(normalizeCouponCode(null)).toBe("");
    expect(normalizeCouponCode(undefined)).toBe("");
    expect(normalizeCouponCode(12345)).toBe("");
    expect(normalizeCouponCode({})).toBe("");
  });
});

describe("createCouponSchema Validation", () => {
  const validPercentagePayload = {
    code: "TRAIL20",
    type: "percentage",
    value: 20,
    minimumSubtotal: 1000,
    maximumDiscount: 500,
    usageLimit: 100,
    perUserLimit: 2,
    applicableProducts: ["6a9ff8e941dd9da4fd30bdc2"],
    applicableCategories: ["Camping", "Hiking"],
    isActive: true
  };

  const validFixedPayload = {
    code: "FLAT300",
    type: "fixed",
    value: 300,
    minimumSubtotal: 1500
  };

  it("accepts a valid percentage coupon payload", () => {
    const result = createCouponSchema.safeParse({
      body: validPercentagePayload,
      query: {},
      params: {}
    });

    expect(result.success).toBe(true);
    expect(result.data.body.code).toBe("TRAIL20");
    expect(result.data.body.type).toBe("percentage");
    expect(result.data.body.value).toBe(20);
    expect(result.data.body.minimumSubtotal).toBe(1000);
    expect(result.data.body.maximumDiscount).toBe(500);
    expect(result.data.body.usageLimit).toBe(100);
    expect(result.data.body.perUserLimit).toBe(2);
  });

  it("accepts a valid fixed discount coupon payload", () => {
    const result = createCouponSchema.safeParse({
      body: validFixedPayload,
      query: {},
      params: {}
    });

    expect(result.success).toBe(true);
    expect(result.data.body.code).toBe("FLAT300");
    expect(result.data.body.type).toBe("fixed");
    expect(result.data.body.value).toBe(300);
    expect(result.data.body.minimumSubtotal).toBe(1500);
    expect(result.data.body.maximumDiscount).toBeUndefined();
  });

  it("applies default values for optional fields", () => {
    const result = createCouponSchema.safeParse({
      body: {
        code: "WELCOME",
        type: "fixed",
        value: 100
      }
    });

    expect(result.success).toBe(true);
    expect(result.data.body.minimumSubtotal).toBe(0);
    expect(result.data.body.perUserLimit).toBe(1);
    expect(result.data.body.applicableProducts).toEqual([]);
    expect(result.data.body.applicableCategories).toEqual([]);
    expect(result.data.body.isActive).toBe(true);
  });

  describe("Code validation", () => {
    it("rejects missing code", () => {
      const result = createCouponSchema.safeParse({
        body: { type: "percentage", value: 10 }
      });
      expect(result.success).toBe(false);
      expect(result.error.issues.some((i) => i.path.join(".") === "body.code")).toBe(true);
    });

    it("rejects code shorter than 3 characters", () => {
      const result = createCouponSchema.safeParse({
        body: { code: "AB", type: "percentage", value: 10 }
      });
      expect(result.success).toBe(false);
      expect(result.error.issues.some((i) => i.message.includes("at least 3 characters"))).toBe(true);
    });

    it("rejects code longer than 20 characters", () => {
      const result = createCouponSchema.safeParse({
        body: { code: "A".repeat(21), type: "percentage", value: 10 }
      });
      expect(result.success).toBe(false);
      expect(result.error.issues.some((i) => i.message.includes("cannot exceed 20 characters"))).toBe(true);
    });

    it("rejects code with invalid special characters", () => {
      const result = createCouponSchema.safeParse({
        body: { code: "SAVE@20!", type: "percentage", value: 10 }
      });
      expect(result.success).toBe(false);
      expect(result.error.issues.some((i) => i.path.join(".") === "body.code")).toBe(true);
    });

    it("accepts valid alphanumeric, hyphen, and underscore characters in code", () => {
      const result = createCouponSchema.safeParse({
        body: { code: "SPRING_2026-X", type: "percentage", value: 10 }
      });
      expect(result.success).toBe(true);
    });
  });

  describe("Type and Value validation", () => {
    it("rejects invalid type", () => {
      const result = createCouponSchema.safeParse({
        body: { code: "TEST10", type: "bogo", value: 10 }
      });
      expect(result.success).toBe(false);
      expect(result.error.issues.some((i) => i.path.join(".") === "body.type")).toBe(true);
    });

    it("rejects percentage value greater than 100", () => {
      const result = createCouponSchema.safeParse({
        body: { code: "TEST101", type: "percentage", value: 101 }
      });
      expect(result.success).toBe(false);
      expect(result.error.issues.some((i) => i.message === "Percentage discount cannot exceed 100%")).toBe(true);
    });

    it("accepts percentage value of exactly 100", () => {
      const result = createCouponSchema.safeParse({
        body: { code: "FULL100", type: "percentage", value: 100 }
      });
      expect(result.success).toBe(true);
    });

    it("rejects zero discount value", () => {
      const result = createCouponSchema.safeParse({
        body: { code: "ZERO", type: "fixed", value: 0 }
      });
      expect(result.success).toBe(false);
      expect(result.error.issues.some((i) => i.path.join(".") === "body.value")).toBe(true);
    });

    it("rejects negative discount value", () => {
      const result = createCouponSchema.safeParse({
        body: { code: "NEG", type: "fixed", value: -50 }
      });
      expect(result.success).toBe(false);
      expect(result.error.issues.some((i) => i.path.join(".") === "body.value")).toBe(true);
    });
  });

  describe("Subtotal and discount bounds", () => {
    it("rejects negative minimumSubtotal", () => {
      const result = createCouponSchema.safeParse({
        body: { code: "MINTEST", type: "fixed", value: 50, minimumSubtotal: -10 }
      });
      expect(result.success).toBe(false);
      expect(result.error.issues.some((i) => i.path.join(".") === "body.minimumSubtotal")).toBe(true);
    });

    it("rejects zero or negative maximumDiscount", () => {
      const resultZero = createCouponSchema.safeParse({
        body: { code: "MAXTEST", type: "percentage", value: 20, maximumDiscount: 0 }
      });
      expect(resultZero.success).toBe(false);

      const resultNeg = createCouponSchema.safeParse({
        body: { code: "MAXTEST", type: "percentage", value: 20, maximumDiscount: -10 }
      });
      expect(resultNeg.success).toBe(false);
    });

    it("accepts null maximumDiscount", () => {
      const result = createCouponSchema.safeParse({
        body: { code: "MAXNULL", type: "percentage", value: 20, maximumDiscount: null }
      });
      expect(result.success).toBe(true);
      expect(result.data.body.maximumDiscount).toBeNull();
    });
  });

  describe("Dates validation", () => {
    it("accepts valid ISO date strings where expiresAt > startsAt", () => {
      const result = createCouponSchema.safeParse({
        body: {
          code: "SUMMERTIME",
          type: "percentage",
          value: 15,
          startsAt: "2026-06-01T00:00:00.000Z",
          expiresAt: "2026-08-31T23:59:59.000Z"
        }
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid date string", () => {
      const result = createCouponSchema.safeParse({
        body: {
          code: "BADDATE",
          type: "percentage",
          value: 15,
          startsAt: "not-a-date"
        }
      });
      expect(result.success).toBe(false);
      expect(result.error.issues.some((i) => i.path.join(".") === "body.startsAt")).toBe(true);
    });

    it("rejects expiresAt before startsAt", () => {
      const result = createCouponSchema.safeParse({
        body: {
          code: "DATEERR",
          type: "percentage",
          value: 15,
          startsAt: "2026-08-01T00:00:00.000Z",
          expiresAt: "2026-07-01T00:00:00.000Z"
        }
      });
      expect(result.success).toBe(false);
      expect(result.error.issues.some((i) => i.message === "expiresAt must be at or after startsAt")).toBe(true);
    });
  });

  describe("Usage limits validation", () => {
    it("rejects non-integer or zero usageLimit", () => {
      const resFloat = createCouponSchema.safeParse({
        body: { code: "LIMIT", type: "fixed", value: 100, usageLimit: 5.5 }
      });
      expect(resFloat.success).toBe(false);

      const resZero = createCouponSchema.safeParse({
        body: { code: "LIMIT", type: "fixed", value: 100, usageLimit: 0 }
      });
      expect(resZero.success).toBe(false);

      const resNeg = createCouponSchema.safeParse({
        body: { code: "LIMIT", type: "fixed", value: 100, usageLimit: -10 }
      });
      expect(resNeg.success).toBe(false);
    });

    it("rejects zero or negative perUserLimit", () => {
      const resZero = createCouponSchema.safeParse({
        body: { code: "USERLIMIT", type: "fixed", value: 100, perUserLimit: 0 }
      });
      expect(resZero.success).toBe(false);

      const resNeg = createCouponSchema.safeParse({
        body: { code: "USERLIMIT", type: "fixed", value: 100, perUserLimit: -1 }
      });
      expect(resNeg.success).toBe(false);
    });
  });

  describe("Applicable products and categories", () => {
    it("rejects malformed product ObjectId in applicableProducts", () => {
      const result = createCouponSchema.safeParse({
        body: {
          code: "PRODERR",
          type: "fixed",
          value: 100,
          applicableProducts: ["not-a-valid-object-id"]
        }
      });
      expect(result.success).toBe(false);
      expect(result.error.issues.some((i) => i.path.join(".") === "body.applicableProducts.0")).toBe(true);
    });

    it("rejects duplicate product IDs in applicableProducts", () => {
      const result = createCouponSchema.safeParse({
        body: {
          code: "DUPPROD",
          type: "fixed",
          value: 100,
          applicableProducts: [
            "6a9ff8e941dd9da4fd30bdc2",
            "6a9ff8e941dd9da4fd30bdc2"
          ]
        }
      });
      expect(result.success).toBe(false);
      expect(result.error.issues.some((i) => i.message.includes("cannot contain duplicate product IDs"))).toBe(true);
    });

    it("rejects duplicate category names (case-insensitive)", () => {
      const result = createCouponSchema.safeParse({
        body: {
          code: "DUPCAT",
          type: "fixed",
          value: 100,
          applicableCategories: ["Camping", "camping"]
        }
      });
      expect(result.success).toBe(false);
      expect(result.error.issues.some((i) => i.message.includes("cannot contain duplicate categories"))).toBe(true);
    });

    it("rejects empty string in applicableCategories", () => {
      const result = createCouponSchema.safeParse({
        body: {
          code: "EMPTYCAT",
          type: "fixed",
          value: 100,
          applicableCategories: [""]
        }
      });
      expect(result.success).toBe(false);
    });
  });

  describe("Strict unknown fields rejection", () => {
    it("rejects unsupported payload fields", () => {
      const result = createCouponSchema.safeParse({
        body: {
          code: "EXTRA",
          type: "percentage",
          value: 10,
          unsupportedField: "hack"
        }
      });
      expect(result.success).toBe(false);
      expect(result.error.issues.some((i) => i.code === "unrecognized_keys")).toBe(true);
    });
  });
});

describe("updateCouponSchema Validation", () => {
  const validCouponId = "507f1f77bcf86cd799439011";

  it("accepts valid partial update payload", () => {
    const result = updateCouponSchema.safeParse({
      params: { couponId: validCouponId },
      body: {
        value: 15,
        isActive: false
      }
    });

    expect(result.success).toBe(true);
    expect(result.data.body.value).toBe(15);
    expect(result.data.body.isActive).toBe(false);
  });

  it("rejects empty body", () => {
    const result = updateCouponSchema.safeParse({
      params: { couponId: validCouponId },
      body: {}
    });

    expect(result.success).toBe(false);
    expect(result.error.issues.some((i) => i.message.includes("At least one field must be provided"))).toBe(true);
  });

  it("rejects invalid percentage value > 100", () => {
    const result = updateCouponSchema.safeParse({
      params: { couponId: validCouponId },
      body: {
        type: "percentage",
        value: 120
      }
    });

    expect(result.success).toBe(false);
    expect(result.error.issues.some((i) => i.message.includes("cannot exceed 100%"))).toBe(true);
  });

  it("rejects when expiresAt is before startsAt", () => {
    const result = updateCouponSchema.safeParse({
      params: { couponId: validCouponId },
      body: {
        startsAt: "2026-10-01T00:00:00.000Z",
        expiresAt: "2026-09-01T00:00:00.000Z"
      }
    });

    expect(result.success).toBe(false);
    expect(result.error.issues.some((i) => i.message.includes("expiresAt must be at or after startsAt"))).toBe(true);
  });

  it("rejects invalid couponId param", () => {
    const result = updateCouponSchema.safeParse({
      params: { couponId: "not-an-object-id" },
      body: { value: 10 }
    });

    expect(result.success).toBe(false);
    expect(result.error.issues.some((i) => i.message.includes("Invalid coupon ID"))).toBe(true);
  });

  it("rejects mass-assignment attempts (usedCount, internal fields)", () => {
    const result = updateCouponSchema.safeParse({
      params: { couponId: validCouponId },
      body: {
        usedCount: 10
      }
    });

    expect(result.success).toBe(false);
    expect(result.error.issues.some((i) => i.code === "unrecognized_keys")).toBe(true);
  });
});

describe("updateCouponStatusSchema Validation", () => {
  const validCouponId = "507f1f77bcf86cd799439011";

  it("accepts valid status payload", () => {
    const result = updateCouponStatusSchema.safeParse({
      params: { couponId: validCouponId },
      body: { isActive: false }
    });

    expect(result.success).toBe(true);
    expect(result.data.body.isActive).toBe(false);
  });

  it("rejects non-boolean isActive", () => {
    const result = updateCouponStatusSchema.safeParse({
      params: { couponId: validCouponId },
      body: { isActive: "true" }
    });

    expect(result.success).toBe(false);
  });

  it("rejects additional fields in status payload", () => {
    const result = updateCouponStatusSchema.safeParse({
      params: { couponId: validCouponId },
      body: { isActive: true, usedCount: 5 }
    });

    expect(result.success).toBe(false);
    expect(result.error.issues.some((i) => i.code === "unrecognized_keys")).toBe(true);
  });
});

describe("couponIdParamSchema Validation", () => {
  it("accepts valid 24-char hex string", () => {
    const result = couponIdParamSchema.safeParse({
      params: { couponId: "507f1f77bcf86cd799439011" }
    });

    expect(result.success).toBe(true);
  });

  it("rejects malformed couponId", () => {
    const result = couponIdParamSchema.safeParse({
      params: { couponId: "12345" }
    });

    expect(result.success).toBe(false);
  });
});

describe("getAdminCouponsSchema Validation", () => {
  it("provides defaults for pagination and sorting", () => {
    const result = getAdminCouponsSchema.safeParse({
      query: {}
    });

    expect(result.success).toBe(true);
    expect(result.data.query.page).toBe(1);
    expect(result.data.query.limit).toBe(10);
    expect(result.data.query.sortBy).toBe("createdAt");
    expect(result.data.query.sortOrder).toBe("desc");
  });

  it("coerces numeric query strings and validates limits", () => {
    const result = getAdminCouponsSchema.safeParse({
      query: {
        page: "3",
        limit: "25",
        search: "SUMMER",
        isActive: "true",
        type: "percentage",
        sortBy: "value",
        sortOrder: "asc"
      }
    });

    expect(result.success).toBe(true);
    expect(result.data.query.page).toBe(3);
    expect(result.data.query.limit).toBe(25);
    expect(result.data.query.search).toBe("SUMMER");
    expect(result.data.query.isActive).toBe("true");
    expect(result.data.query.type).toBe("percentage");
    expect(result.data.query.sortBy).toBe("value");
    expect(result.data.query.sortOrder).toBe("asc");
  });

  it("rejects limit > 100", () => {
    const result = getAdminCouponsSchema.safeParse({
      query: { limit: "101" }
    });

    expect(result.success).toBe(false);
    expect(result.error.issues.some((i) => i.message.includes("cannot exceed 100"))).toBe(true);
  });

  it("rejects invalid isActive enum value", () => {
    const result = getAdminCouponsSchema.safeParse({
      query: { isActive: "active" }
    });

    expect(result.success).toBe(false);
    expect(result.error.issues.some((i) => i.message.includes("isActive must be either 'true' or 'false'"))).toBe(true);
  });
});
