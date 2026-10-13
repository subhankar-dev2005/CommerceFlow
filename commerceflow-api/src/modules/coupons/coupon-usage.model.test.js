import { describe, it, expect } from "vitest";
import CouponUsage from "./coupon-usage.model.js";

describe("CouponUsage Model Unit Tests", () => {
  const validUsage = {
    coupon: "507f1f77bcf86cd799439011",
    user: "507f1f77bcf86cd799439012",
    order: "507f1f77bcf86cd799439013",
    couponCode: "SUMMER10",
    discountAmount: 200,
    status: "redeemed"
  };

  it("validates successfully with valid required fields", async () => {
    const doc = new CouponUsage(validUsage);
    let error;
    try {
      await doc.validate();
    } catch (e) {
      error = e;
    }
    expect(error).toBeUndefined();
    expect(doc.status).toBe("redeemed");
    expect(doc.redeemedAt).toBeInstanceOf(Date);
  });

  it("requires coupon reference", async () => {
    const doc = new CouponUsage({ ...validUsage, coupon: undefined });
    let error;
    try {
      await doc.validate();
    } catch (e) {
      error = e;
    }
    expect(error).toBeDefined();
    expect(error.errors.coupon).toBeDefined();
  });

  it("requires user reference", async () => {
    const doc = new CouponUsage({ ...validUsage, user: undefined });
    let error;
    try {
      await doc.validate();
    } catch (e) {
      error = e;
    }
    expect(error).toBeDefined();
    expect(error.errors.user).toBeDefined();
  });

  it("requires order reference", async () => {
    const doc = new CouponUsage({ ...validUsage, order: undefined });
    let error;
    try {
      await doc.validate();
    } catch (e) {
      error = e;
    }
    expect(error).toBeDefined();
    expect(error.errors.order).toBeDefined();
  });

  it("requires couponCode string", async () => {
    const doc = new CouponUsage({ ...validUsage, couponCode: undefined });
    let error;
    try {
      await doc.validate();
    } catch (e) {
      error = e;
    }
    expect(error).toBeDefined();
    expect(error.errors.couponCode).toBeDefined();
  });

  it("rejects negative discountAmount", async () => {
    const doc = new CouponUsage({ ...validUsage, discountAmount: -50 });
    let error;
    try {
      await doc.validate();
    } catch (e) {
      error = e;
    }
    expect(error).toBeDefined();
    expect(error.errors.discountAmount).toBeDefined();
  });

  it("accepts zero discountAmount", async () => {
    const doc = new CouponUsage({ ...validUsage, discountAmount: 0 });
    let error;
    try {
      await doc.validate();
    } catch (e) {
      error = e;
    }
    expect(error).toBeUndefined();
  });

  it("rejects invalid status enum", async () => {
    const doc = new CouponUsage({ ...validUsage, status: "pending" });
    let error;
    try {
      await doc.validate();
    } catch (e) {
      error = e;
    }
    expect(error).toBeDefined();
    expect(error.errors.status).toBeDefined();
  });

  it("has correct indexes declared", () => {
    const indexes = CouponUsage.schema.indexes();
    const hasCouponOrderUnique = indexes.some(
      ([fields, opts]) =>
        fields.coupon === 1 && fields.order === 1 && opts.unique === true
    );
    const hasCouponUserIndex = indexes.some(
      ([fields]) => fields.coupon === 1 && fields.user === 1
    );

    expect(hasCouponOrderUnique).toBe(true);
    expect(hasCouponUserIndex).toBe(true);
  });
});
