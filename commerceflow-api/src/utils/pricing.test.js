import { describe, it, expect } from "vitest";
import {
  calculateOrderFinancials,
  getOrderPayableAmount,
  toPaise,
  calculateCouponDiscount
} from "./pricing.js";

describe("Pricing Utilities", () => {
  describe("calculateOrderFinancials", () => {
    it("calculates order financials under initial business rules (shipping=0, tax=0, discount=0)", () => {
      const result = calculateOrderFinancials(1500);

      expect(result).toEqual({
        subtotal: 1500,
        shippingAmount: 0,
        taxAmount: 0,
        discountAmount: 0,
        total: 1500
      });
      expect(result.total).toBe(
        result.subtotal +
        result.shippingAmount +
        result.taxAmount -
        result.discountAmount
      );
    });

    it("handles zero subtotal correctly", () => {
      const result = calculateOrderFinancials(0);

      expect(result).toEqual({
        subtotal: 0,
        shippingAmount: 0,
        taxAmount: 0,
        discountAmount: 0,
        total: 0
      });
      expect(result.total).toBe(
        result.subtotal +
        result.shippingAmount +
        result.taxAmount -
        result.discountAmount
      );
    });

    it("verifies financial calculations and invariant across required test values", () => {
      const testValues = [0, 10, 10.01, 19.99, 0.1, 0.29, 1000000.50];

      for (const val of testValues) {
        const result = calculateOrderFinancials(val);
        expect(result.subtotal).toBe(val);
        expect(result.shippingAmount).toBe(0);
        expect(result.taxAmount).toBe(0);
        expect(result.discountAmount).toBe(0);
        expect(result.total).toBe(val);
        expect(result.total).toBe(
          result.subtotal +
          result.shippingAmount +
          result.taxAmount -
          result.discountAmount
        );
      }
    });

    it("handles null or undefined options safely without throwing", () => {
      const resultNull = calculateOrderFinancials(500, null);
      expect(resultNull.subtotal).toBe(500);
      expect(resultNull.shippingAmount).toBe(0);
      expect(resultNull.taxAmount).toBe(0);
      expect(resultNull.discountAmount).toBe(0);
      expect(resultNull.total).toBe(500);

      const resultUndefined = calculateOrderFinancials(500, undefined);
      expect(resultUndefined.total).toBe(500);
    });

    it("enforces non-negative values for all financial components including negative subtotal", () => {
      const result = calculateOrderFinancials(-100, {
        shippingAmount: -10,
        taxAmount: -5,
        discountAmount: -20
      });

      expect(result.subtotal).toBe(0);
      expect(result.shippingAmount).toBe(0);
      expect(result.taxAmount).toBe(0);
      expect(result.discountAmount).toBe(0);
      expect(result.total).toBe(0);
      expect(result.total).toBe(
        result.subtotal +
        result.shippingAmount +
        result.taxAmount -
        result.discountAmount
      );
    });

    it("handles NaN, non-finite, or string numbers safely", () => {
      const result = calculateOrderFinancials("250");
      expect(result.subtotal).toBe(250);
      expect(result.total).toBe(250);

      const invalidResult = calculateOrderFinancials("not-a-number");
      expect(invalidResult.subtotal).toBe(0);
      expect(invalidResult.total).toBe(0);

      const infinityResult = calculateOrderFinancials(Infinity);
      expect(infinityResult.subtotal).toBe(0);
      expect(infinityResult.total).toBe(0);
    });
  });

  describe("getOrderPayableAmount", () => {
    it("returns order.total when order.total exists and is greater than 0", () => {
      const order = { subtotal: 1000, total: 1000 };
      expect(getOrderPayableAmount(order)).toBe(1000);
    });

    it("falls back to order.subtotal when order.total is undefined (legacy order)", () => {
      const legacyOrder = { subtotal: 499 };
      expect(getOrderPayableAmount(legacyOrder)).toBe(499);
    });

    it("falls back to order.subtotal when order.total is null (legacy order)", () => {
      const legacyOrder = { subtotal: 800, total: null };
      expect(getOrderPayableAmount(legacyOrder)).toBe(800);
    });

    it("falls back to subtotal when hydrated legacy order has total: 0 and subtotal > 0 without discount", () => {
      const hydratedLegacyOrder = { subtotal: 2500, total: 0 };
      expect(getOrderPayableAmount(hydratedLegacyOrder)).toBe(2500);
    });

    it("respects total: 0 when discount covers the entire order (future 100% discount)", () => {
      const zeroOrder = { subtotal: 500, discountAmount: 500, total: 0 };
      expect(getOrderPayableAmount(zeroOrder)).toBe(0);
    });

    it("returns 0 for null, undefined, primitive, or empty order safely", () => {
      expect(getOrderPayableAmount(null)).toBe(0);
      expect(getOrderPayableAmount(undefined)).toBe(0);
      expect(getOrderPayableAmount("invalid")).toBe(0);
      expect(getOrderPayableAmount({})).toBe(0);
    });

    it("returns 0 for negative or non-finite totals safely", () => {
      expect(getOrderPayableAmount({ total: -50 })).toBe(0);
      expect(getOrderPayableAmount({ total: Infinity })).toBe(0);
      expect(getOrderPayableAmount({ total: NaN })).toBe(0);
    });
  });

  describe("toPaise", () => {
    it("converts whole INR amount to paise correctly", () => {
      expect(toPaise(100)).toBe(10000);
      expect(toPaise(499)).toBe(49900);
      expect(toPaise(1999)).toBe(199900);
    });

    it("deterministically converts decimal values to paise for required test values", () => {
      expect(toPaise(0)).toBe(0);
      expect(toPaise(10)).toBe(1000);
      expect(toPaise(10.01)).toBe(1001);
      expect(toPaise(19.99)).toBe(1999);
      expect(toPaise(0.1)).toBe(10);
      expect(toPaise(0.29)).toBe(29);
      expect(toPaise(500000.50)).toBe(50000050);
    });

    it("rounds decimal amounts to the nearest whole paise", () => {
      expect(toPaise(499.50)).toBe(49950);
      expect(toPaise(499.999)).toBe(50000);
      expect(toPaise(499.001)).toBe(49900);
    });

    it("handles zero, negative, and invalid inputs safely by returning 0", () => {
      expect(toPaise(0)).toBe(0);
      expect(toPaise(-5)).toBe(0);
      expect(toPaise(-0.29)).toBe(0);
      expect(toPaise("invalid")).toBe(0);
      expect(toPaise(null)).toBe(0);
      expect(toPaise(undefined)).toBe(0);
      expect(toPaise(NaN)).toBe(0);
      expect(toPaise(Infinity)).toBe(0);
    });
  });

  describe("calculateCouponDiscount", () => {
    it("calculates percentage discount accurately", () => {
      const coupon = { type: "percentage", value: 10 };
      expect(calculateCouponDiscount(coupon, 2000)).toBe(200);
      expect(calculateCouponDiscount(coupon, 1500)).toBe(150);
    });

    it("applies deterministic rounding on percentage discounts", () => {
      const coupon = { type: "percentage", value: 15 };
      expect(calculateCouponDiscount(coupon, 99)).toBe(15); // 99 * 0.15 = 14.85 -> 15
      expect(calculateCouponDiscount(coupon, 90)).toBe(14); // 90 * 0.15 = 13.5 -> 14
    });

    it("caps percentage discount by maximumDiscount when configured", () => {
      const coupon = {
        type: "percentage",
        value: 20,
        maximumDiscount: 500
      };
      // 10,000 * 20% = 2,000, capped at 500
      expect(calculateCouponDiscount(coupon, 10000)).toBe(500);

      // 1,000 * 20% = 200, below 500 cap
      expect(calculateCouponDiscount(coupon, 1000)).toBe(200);
    });

    it("ignores null or undefined maximumDiscount", () => {
      const couponNull = {
        type: "percentage",
        value: 20,
        maximumDiscount: null
      };
      expect(calculateCouponDiscount(couponNull, 5000)).toBe(1000);

      const couponUndefined = {
        type: "percentage",
        value: 20
      };
      expect(calculateCouponDiscount(couponUndefined, 5000)).toBe(1000);
    });

    it("calculates fixed discount accurately", () => {
      const coupon = { type: "fixed", value: 300 };
      expect(calculateCouponDiscount(coupon, 1500)).toBe(300);
    });

    it("strictly caps discount at subtotal (never allows discount > subtotal)", () => {
      const fixedCoupon = { type: "fixed", value: 500 };
      expect(calculateCouponDiscount(fixedCoupon, 300)).toBe(300);

      const fullPercentCoupon = { type: "percentage", value: 100 };
      expect(calculateCouponDiscount(fullPercentCoupon, 300)).toBe(300);
    });

    it("returns 0 for zero subtotal or negative subtotal", () => {
      const coupon = { type: "fixed", value: 300 };
      expect(calculateCouponDiscount(coupon, 0)).toBe(0);
      expect(calculateCouponDiscount(coupon, -100)).toBe(0);
    });

    it("handles invalid coupon object safely by returning 0", () => {
      expect(calculateCouponDiscount(null, 1000)).toBe(0);
      expect(calculateCouponDiscount(undefined, 1000)).toBe(0);
      expect(calculateCouponDiscount({}, 1000)).toBe(0);
      expect(calculateCouponDiscount("invalid", 1000)).toBe(0);
    });

    it("guarantees non-negative finite integer return value", () => {
      const result = calculateCouponDiscount(
        { type: "percentage", value: NaN },
        1000
      );
      expect(result).toBe(0);
      expect(Number.isInteger(result)).toBe(true);
      expect(result).toBeGreaterThanOrEqual(0);
    });
  });
});
