import { describe, it, expect } from "vitest";
import {
  applyCouponSchema,
  removeCouponSchema
} from "./apply-coupon.validator.js";

describe("applyCouponSchema Validation", () => {
  it("accepts a valid couponCode", () => {
    const result = applyCouponSchema.safeParse({
      body: { couponCode: "SUMMER10" }
    });
    expect(result.success).toBe(true);
    expect(result.data.body.couponCode).toBe("SUMMER10");
  });

  it("accepts a valid code alias and transforms it to couponCode", () => {
    const result = applyCouponSchema.safeParse({
      body: { code: "TRAIL20" }
    });
    expect(result.success).toBe(true);
    expect(result.data.body.couponCode).toBe("TRAIL20");
  });

  it("trims whitespace on couponCode", () => {
    const result = applyCouponSchema.safeParse({
      body: { couponCode: "  WINTER50  " }
    });
    expect(result.success).toBe(true);
    expect(result.data.body.couponCode).toBe("WINTER50");
  });

  it("rejects missing coupon code", () => {
    const result = applyCouponSchema.safeParse({
      body: {}
    });
    expect(result.success).toBe(false);
    expect(
      result.error.issues.some((i) => i.message.includes("Coupon code is required"))
    ).toBe(true);
  });

  it("rejects code shorter than 3 characters", () => {
    const result = applyCouponSchema.safeParse({
      body: { couponCode: "AB" }
    });
    expect(result.success).toBe(false);
    expect(
      result.error.issues.some((i) => i.message.includes("at least 3 characters"))
    ).toBe(true);
  });

  it("rejects code longer than 20 characters", () => {
    const result = applyCouponSchema.safeParse({
      body: { couponCode: "A".repeat(21) }
    });
    expect(result.success).toBe(false);
    expect(
      result.error.issues.some((i) => i.message.includes("cannot exceed 20 characters"))
    ).toBe(true);
  });

  it("rejects invalid characters in code", () => {
    const result = applyCouponSchema.safeParse({
      body: { couponCode: "SAVE!10" }
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-string code", () => {
    const result = applyCouponSchema.safeParse({
      body: { couponCode: 12345 }
    });
    expect(result.success).toBe(false);
    expect(
      result.error.issues.some((i) => i.message.includes("must be a string"))
    ).toBe(true);
  });

  describe("Security: Injection and unknown fields prevention", () => {
    it("rejects couponId injection", () => {
      const result = applyCouponSchema.safeParse({
        body: {
          couponCode: "SUMMER10",
          couponId: "507f1f77bcf86cd799439011"
        }
      });
      expect(result.success).toBe(false);
      expect(
        result.error.issues.some((i) => i.code === "unrecognized_keys")
      ).toBe(true);
    });

    it("rejects discount injection", () => {
      const result = applyCouponSchema.safeParse({
        body: {
          couponCode: "SUMMER10",
          discount: 500
        }
      });
      expect(result.success).toBe(false);
      expect(
        result.error.issues.some((i) => i.code === "unrecognized_keys")
      ).toBe(true);
    });

    it("rejects total injection", () => {
      const result = applyCouponSchema.safeParse({
        body: {
          couponCode: "SUMMER10",
          total: 100
        }
      });
      expect(result.success).toBe(false);
      expect(
        result.error.issues.some((i) => i.code === "unrecognized_keys")
      ).toBe(true);
    });

    it("rejects usedCount injection", () => {
      const result = applyCouponSchema.safeParse({
        body: {
          couponCode: "SUMMER10",
          usedCount: 0
        }
      });
      expect(result.success).toBe(false);
      expect(
        result.error.issues.some((i) => i.code === "unrecognized_keys")
      ).toBe(true);
    });

    it("rejects arbitrary unknown fields", () => {
      const result = applyCouponSchema.safeParse({
        body: {
          couponCode: "SUMMER10",
          adminRole: true
        }
      });
      expect(result.success).toBe(false);
      expect(
        result.error.issues.some((i) => i.code === "unrecognized_keys")
      ).toBe(true);
    });
  });
});

describe("removeCouponSchema Validation", () => {
  it("accepts empty body", () => {
    const result = removeCouponSchema.safeParse({
      body: {}
    });
    expect(result.success).toBe(true);
  });
});
