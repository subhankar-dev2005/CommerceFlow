import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import Coupon from "./coupon.model.js";

describe("Coupon Mongoose Model Schema & Unit Tests", () => {
  it("defines expected schema paths with correct types", () => {
    expect(Coupon.schema.path("code").instance).toBe("String");
    expect(Coupon.schema.path("normalizedCode").instance).toBe("String");
    expect(Coupon.schema.path("type").instance).toBe("String");
    expect(Coupon.schema.path("value").instance).toBe("Number");
    expect(Coupon.schema.path("minimumSubtotal").instance).toBe("Number");
    expect(Coupon.schema.path("maximumDiscount").instance).toBe("Number");
    expect(Coupon.schema.path("startsAt").instance).toBe("Date");
    expect(Coupon.schema.path("expiresAt").instance).toBe("Date");
    expect(Coupon.schema.path("usageLimit").instance).toBe("Number");
    expect(Coupon.schema.path("usedCount").instance).toBe("Number");
    expect(Coupon.schema.path("perUserLimit").instance).toBe("Number");
    expect(Coupon.schema.path("applicableProducts").instance).toBe("Array");
    expect(Coupon.schema.path("applicableCategories").instance).toBe("Array");
    expect(Coupon.schema.path("isActive").instance).toBe("Boolean");
  });

  it("has timestamps enabled", () => {
    expect(Coupon.schema.options.timestamps).toBe(true);
  });

  it("applies default values accurately", () => {
    const doc = new Coupon({
      code: "TESTCODE",
      type: "fixed",
      value: 100
    });

    expect(doc.minimumSubtotal).toBe(0);
    expect(doc.maximumDiscount).toBeNull();
    expect(doc.startsAt).toBeNull();
    expect(doc.expiresAt).toBeNull();
    expect(doc.usageLimit).toBeNull();
    expect(doc.usedCount).toBe(0);
    expect(doc.perUserLimit).toBe(1);
    expect(doc.applicableProducts).toEqual([]);
    expect(doc.applicableCategories).toEqual([]);
    expect(doc.isActive).toBe(true);
  });

  it("automatically generates normalizedCode from code via pre-validate hook", async () => {
    const doc = new Coupon({
      code: "  summer2026-pro  ",
      type: "percentage",
      value: 15
    });

    await doc.validate();
    expect(doc.code).toBe("summer2026-pro");
    expect(doc.normalizedCode).toBe("SUMMER2026-PRO");
  });

  describe("Validation logic on document", () => {
    it("validates a valid percentage coupon document", async () => {
      const doc = new Coupon({
        code: "HIKING25",
        type: "percentage",
        value: 25,
        minimumSubtotal: 2000,
        maximumDiscount: 600,
        usageLimit: 50,
        perUserLimit: 2,
        applicableCategories: ["Hiking", "Footwear"]
      });

      const err = await doc.validate().catch((e) => e);
      expect(err).toBeUndefined();
    });

    it("validates a valid fixed amount coupon document", async () => {
      const doc = new Coupon({
        code: "FLAT200",
        type: "fixed",
        value: 200,
        minimumSubtotal: 1000
      });

      const err = await doc.validate().catch((e) => e);
      expect(err).toBeUndefined();
    });

    it("fails validation when percentage exceeds 100", async () => {
      const doc = new Coupon({
        code: "OVER100",
        type: "percentage",
        value: 101
      });

      const err = await doc.validate().catch((e) => e);
      expect(err).toBeDefined();
      expect(err.errors.value.message).toBe("Percentage discount cannot exceed 100%");
    });

    it("fails validation when discount value is 0 or negative", async () => {
      const docZero = new Coupon({ code: "ZERO", type: "fixed", value: 0 });
      const errZero = await docZero.validate().catch((e) => e);
      expect(errZero).toBeDefined();

      const docNeg = new Coupon({ code: "NEG", type: "fixed", value: -50 });
      const errNeg = await docNeg.validate().catch((e) => e);
      expect(errNeg).toBeDefined();
    });

    it("fails validation when usedCount is negative or floating point", async () => {
      const docNeg = new Coupon({ code: "USEDNEG", type: "fixed", value: 50, usedCount: -1 });
      const errNeg = await docNeg.validate().catch((e) => e);
      expect(errNeg).toBeDefined();

      const docFloat = new Coupon({ code: "USEDFLOAT", type: "fixed", value: 50, usedCount: 2.5 });
      const errFloat = await docFloat.validate().catch((e) => e);
      expect(errFloat).toBeDefined();
    });

    it("fails validation when expiresAt is earlier than startsAt", async () => {
      const doc = new Coupon({
        code: "EXPDATE",
        type: "fixed",
        value: 100,
        startsAt: new Date("2026-05-15T00:00:00Z"),
        expiresAt: new Date("2026-05-10T00:00:00Z")
      });

      const err = await doc.validate().catch((e) => e);
      expect(err).toBeDefined();
      expect(err.errors.expiresAt.message).toBe("expiresAt must be at or after startsAt");
    });

    it("fails validation when applicableProducts contains duplicate IDs", async () => {
      const pid = new mongoose.Types.ObjectId();
      const doc = new Coupon({
        code: "DUPPROD",
        type: "fixed",
        value: 50,
        applicableProducts: [pid, pid]
      });

      const err = await doc.validate().catch((e) => e);
      expect(err).toBeDefined();
      expect(err.errors.applicableProducts.message).toBe("applicableProducts cannot contain duplicate product IDs");
    });

    it("fails validation when applicableCategories contains duplicate categories", async () => {
      const doc = new Coupon({
        code: "DUPCAT",
        type: "fixed",
        value: 50,
        applicableCategories: ["Camping", "camping"]
      });

      const err = await doc.validate().catch((e) => e);
      expect(err).toBeDefined();
      expect(err.errors.applicableCategories.message).toBe("applicableCategories cannot contain duplicate categories");
    });
  });

  describe("Indexes definition", () => {
    it("defines unique index on normalizedCode", () => {
      const indexes = Coupon.schema.indexes();
      const normalizedIndex = indexes.find(([fields, opts]) => {
        return fields.normalizedCode === 1 && opts?.unique === true;
      });
      expect(normalizedIndex).toBeDefined();
    });

    it("defines compound index on { isActive: 1, expiresAt: 1 }", () => {
      const indexes = Coupon.schema.indexes();
      const compoundIndex = indexes.find(([fields]) => {
        return fields.isActive === 1 && fields.expiresAt === 1;
      });
      expect(compoundIndex).toBeDefined();
    });
  });
});

describe("Coupon Model Database Integration (Unique Constraint)", () => {
  const isMongoAvailable = Boolean(process.env.MONGODB_URI);

  beforeAll(async () => {
    if (isMongoAvailable && mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI);
      await Coupon.init(); // Ensure indexes are built
    }
  });

  afterAll(async () => {
    if (isMongoAvailable && mongoose.connection.readyState !== 0) {
      await Coupon.deleteMany({ normalizedCode: /^(?:TEST-UNIQUE|UNIQ)-/ });
    }
  });

  it("prevents two coupons with identical normalizedCode from coexisting", async () => {
    if (!isMongoAvailable || mongoose.connection.readyState === 0) {
      return; // Skip if db not connected in this test worker
    }

    const testCode1 = `UNIQ-${Date.now()}`;
    const testCode2 = testCode1.toLowerCase();

    const coupon1 = await Coupon.create({
      code: testCode1,
      type: "percentage",
      value: 10
    });
    expect(coupon1.normalizedCode).toBe(testCode1);

    // Attempting to create duplicate with lowercase should fail with duplicate key error (code 11000)
    let duplicateError = null;
    try {
      await Coupon.create({
        code: testCode2,
        type: "fixed",
        value: 50
      });
    } catch (err) {
      duplicateError = err;
    }

    expect(duplicateError).toBeDefined();
    expect(duplicateError.code).toBe(11000);
  });
});
