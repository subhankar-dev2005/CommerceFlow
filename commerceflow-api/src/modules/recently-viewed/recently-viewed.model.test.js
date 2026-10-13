import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import RecentlyViewed from "./recently-viewed.model.js";
import { RECENTLY_VIEWED_TTL_SECONDS } from "./recently-viewed.constants.js";

const VALID_USER_ID = new mongoose.Types.ObjectId();
const VALID_PRODUCT_ID = new mongoose.Types.ObjectId();

describe("RecentlyViewed Model Tests", () => {
  describe("Schema Structure & Field Types", () => {
    it("has a user field of ObjectId type referencing User", () => {
      const userPath = RecentlyViewed.schema.path("user");
      expect(userPath).toBeDefined();
      expect(userPath.instance).toBe("ObjectId");
      expect(userPath.options.ref).toBe("User");
      expect(userPath.isRequired).toBe(true);
    });

    it("has a product field of ObjectId type referencing Product", () => {
      const productPath = RecentlyViewed.schema.path("product");
      expect(productPath).toBeDefined();
      expect(productPath.instance).toBe("ObjectId");
      expect(productPath.options.ref).toBe("Product");
      expect(productPath.isRequired).toBe(true);
    });

    it("has a viewedAt Date field with a default function", () => {
      const viewedAtPath = RecentlyViewed.schema.path("viewedAt");
      expect(viewedAtPath).toBeDefined();
      expect(viewedAtPath.instance).toBe("Date");
      expect(viewedAtPath.defaultValue).toBeDefined();
      expect(viewedAtPath.isRequired).toBe(true);
    });

    it("disables timestamps and versionKey", () => {
      expect(RecentlyViewed.schema.options.timestamps).toBeFalsy();
      expect(RecentlyViewed.schema.options.versionKey).toBe(false);
    });
  });

  describe("Product Integrity & Snapshot Protection", () => {
    it("does NOT store product name snapshot", () => {
      expect(RecentlyViewed.schema.path("name")).toBeUndefined();
    });

    it("does NOT store product price snapshot", () => {
      expect(RecentlyViewed.schema.path("price")).toBeUndefined();
    });

    it("does NOT store product stock snapshot", () => {
      expect(RecentlyViewed.schema.path("stock")).toBeUndefined();
    });

    it("does NOT store product image or images snapshot", () => {
      expect(RecentlyViewed.schema.path("image")).toBeUndefined();
      expect(RecentlyViewed.schema.path("images")).toBeUndefined();
    });

    it("does NOT store category or rating snapshot", () => {
      expect(RecentlyViewed.schema.path("category")).toBeUndefined();
      expect(RecentlyViewed.schema.path("rating")).toBeUndefined();
      expect(RecentlyViewed.schema.path("ratingAverage")).toBeUndefined();
    });

    it("does NOT store order/cart quantities or financial data", () => {
      expect(RecentlyViewed.schema.path("quantity")).toBeUndefined();
      expect(RecentlyViewed.schema.path("subtotal")).toBeUndefined();
      expect(RecentlyViewed.schema.path("total")).toBeUndefined();
    });
  });

  describe("Index Design & Duplicate Protection", () => {
    it("defines compound unique index on { user: 1, product: 1 } for duplicate protection", () => {
      const indexes = RecentlyViewed.schema.indexes();
      const compoundUnique = indexes.find(([fields, opts]) => {
        return (
          fields.user === 1 &&
          fields.product === 1 &&
          opts.unique === true
        );
      });
      expect(compoundUnique).toBeDefined();
    });

    it("defines compound index on { user: 1, viewedAt: -1 } for fast retrieval and sorting", () => {
      const indexes = RecentlyViewed.schema.indexes();
      const sortingIndex = indexes.find(([fields]) => {
        return fields.user === 1 && fields.viewedAt === -1;
      });
      expect(sortingIndex).toBeDefined();
    });

    it("defines TTL index on { viewedAt: 1 } with 30-day retention expiration", () => {
      const indexes = RecentlyViewed.schema.indexes();
      const ttlIndex = indexes.find(([fields, opts]) => {
        return (
          fields.viewedAt === 1 &&
          opts.expireAfterSeconds === RECENTLY_VIEWED_TTL_SECONDS
        );
      });
      expect(ttlIndex).toBeDefined();
    });
  });

  describe("Document Validation", () => {
    it("successfully validates a complete and valid document", async () => {
      const doc = new RecentlyViewed({
        user: VALID_USER_ID,
        product: VALID_PRODUCT_ID,
        viewedAt: new Date()
      });

      await expect(doc.validate()).resolves.toBeUndefined();
    });

    it("rejects document missing required user", async () => {
      const doc = new RecentlyViewed({
        product: VALID_PRODUCT_ID
      });

      try {
        await doc.validate();
        expect.unreachable("should have thrown validation error");
      } catch (err) {
        expect(err.errors.user).toBeDefined();
        expect(err.errors.user.kind).toBe("required");
      }
    });

    it("rejects document missing required product", async () => {
      const doc = new RecentlyViewed({
        user: VALID_USER_ID
      });

      try {
        await doc.validate();
        expect.unreachable("should have thrown validation error");
      } catch (err) {
        expect(err.errors.product).toBeDefined();
        expect(err.errors.product.kind).toBe("required");
      }
    });

    it("rejects malformed user ObjectId string", async () => {
      const doc = new RecentlyViewed({
        user: "invalid-user-id",
        product: VALID_PRODUCT_ID
      });

      try {
        await doc.validate();
        expect.unreachable("should have thrown cast error");
      } catch (err) {
        expect(err.errors.user).toBeDefined();
        expect(err.errors.user.name).toBe("CastError");
      }
    });

    it("rejects malformed product ObjectId string", async () => {
      const doc = new RecentlyViewed({
        user: VALID_USER_ID,
        product: "invalid-product-id"
      });

      try {
        await doc.validate();
        expect.unreachable("should have thrown cast error");
      } catch (err) {
        expect(err.errors.product).toBeDefined();
        expect(err.errors.product.name).toBe("CastError");
      }
    });

    it("assigns viewedAt default when not explicitly provided", () => {
      const doc = new RecentlyViewed({
        user: VALID_USER_ID,
        product: VALID_PRODUCT_ID
      });

      expect(doc.viewedAt).toBeInstanceOf(Date);
      expect(Number.isNaN(doc.viewedAt.getTime())).toBe(false);
    });
  });
});
