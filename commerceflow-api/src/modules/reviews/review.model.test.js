import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import Review from "./review.model.js";

describe("Review Model Schema Invariants", () => {
  const validObjectId = () => new mongoose.Types.ObjectId();

  const getValidReviewData = () => ({
    product: validObjectId(),
    user: validObjectId(),
    order: validObjectId(),
    rating: 5,
    title: "Exceptional quality",
    body: "Used this backpack on a 4-day trail. Outstanding durability and comfort."
  });

  const validateDoc = async (review) => {
    try {
      await review.validate();
      return null;
    } catch (err) {
      return err;
    }
  };

  describe("Schema Field Definitions & References", () => {
    it("has a product field of ObjectId type referencing Product", () => {
      const productPath = Review.schema.path("product");
      expect(productPath).toBeDefined();
      expect(productPath.instance).toBe("ObjectId");
      expect(productPath.options.ref).toBe("Product");
      expect(productPath.isRequired).toBe(true);
    });

    it("has a user field of ObjectId type referencing User", () => {
      const userPath = Review.schema.path("user");
      expect(userPath).toBeDefined();
      expect(userPath.instance).toBe("ObjectId");
      expect(userPath.options.ref).toBe("User");
      expect(userPath.isRequired).toBe(true);
    });

    it("has an order field of ObjectId type referencing Order", () => {
      const orderPath = Review.schema.path("order");
      expect(orderPath).toBeDefined();
      expect(orderPath.instance).toBe("ObjectId");
      expect(orderPath.options.ref).toBe("Order");
      expect(orderPath.isRequired).toBe(true);
    });

    it("has a rating field of Number type with min 1 and max 5", () => {
      const ratingPath = Review.schema.path("rating");
      expect(ratingPath).toBeDefined();
      expect(ratingPath.instance).toBe("Number");
      expect(ratingPath.isRequired).toBe(true);
    });

    it("has a title field of String type with maxlength 100 and default empty string", () => {
      const titlePath = Review.schema.path("title");
      expect(titlePath).toBeDefined();
      expect(titlePath.instance).toBe("String");
      expect(titlePath.options.maxlength[0]).toBe(100);
      expect(titlePath.defaultValue).toBe("");
    });

    it("has a body field of String type with minlength 5 and maxlength 2000", () => {
      const bodyPath = Review.schema.path("body");
      expect(bodyPath).toBeDefined();
      expect(bodyPath.instance).toBe("String");
      expect(bodyPath.isRequired).toBe(true);
      expect(bodyPath.options.minlength[0]).toBe(5);
      expect(bodyPath.options.maxlength[0]).toBe(2000);
    });

    it("has an isVerifiedBuyer Boolean field defaulting to true and immutable", () => {
      const verifiedPath = Review.schema.path("isVerifiedBuyer");
      expect(verifiedPath).toBeDefined();
      expect(verifiedPath.instance).toBe("Boolean");
      expect(verifiedPath.defaultValue).toBe(true);
      expect(verifiedPath.options.immutable).toBe(true);
    });

    it("has a status field with enum [published, hidden, flagged] defaulting to published", () => {
      const statusPath = Review.schema.path("status");
      expect(statusPath).toBeDefined();
      expect(statusPath.instance).toBe("String");
      expect(statusPath.enumValues).toEqual(["published", "hidden", "flagged"]);
      expect(statusPath.defaultValue).toBe("published");
    });

    it("has timestamps enabled", () => {
      expect(Review.schema.options.timestamps).toBe(true);
    });
  });

  describe("Required Fields Validation", () => {
    it("validates successfully with complete valid data", async () => {
      const review = new Review(getValidReviewData());
      const error = await validateDoc(review);
      expect(error).toBeNull();
    });

    it("rejects when product is missing", async () => {
      const data = getValidReviewData();
      delete data.product;
      const review = new Review(data);
      const error = await validateDoc(review);
      expect(error).not.toBeNull();
      expect(error.errors.product).toBeDefined();
      expect(error.errors.product.message).toContain("Product reference is required");
    });

    it("rejects when user is missing", async () => {
      const data = getValidReviewData();
      delete data.user;
      const review = new Review(data);
      const error = await validateDoc(review);
      expect(error).not.toBeNull();
      expect(error.errors.user).toBeDefined();
      expect(error.errors.user.message).toContain("User reference is required");
    });

    it("rejects when order is missing", async () => {
      const data = getValidReviewData();
      delete data.order;
      const review = new Review(data);
      const error = await validateDoc(review);
      expect(error).not.toBeNull();
      expect(error.errors.order).toBeDefined();
      expect(error.errors.order.message).toContain("Order reference is required");
    });

    it("rejects when rating is missing", async () => {
      const data = getValidReviewData();
      delete data.rating;
      const review = new Review(data);
      const error = await validateDoc(review);
      expect(error).not.toBeNull();
      expect(error.errors.rating).toBeDefined();
      expect(error.errors.rating.message).toContain("Rating is required");
    });

    it("rejects when body is missing", async () => {
      const data = getValidReviewData();
      delete data.body;
      const review = new Review(data);
      const error = await validateDoc(review);
      expect(error).not.toBeNull();
      expect(error.errors.body).toBeDefined();
      expect(error.errors.body.message).toContain("Review body is required");
    });
  });

  describe("Rating Invariant Validation", () => {
    it.each([1, 2, 3, 4, 5])("accepts valid integer rating: %d", async (rating) => {
      const review = new Review({ ...getValidReviewData(), rating });
      const error = await validateDoc(review);
      expect(error).toBeNull();
    });

    it("rejects rating below minimum (0)", async () => {
      const review = new Review({ ...getValidReviewData(), rating: 0 });
      const error = await validateDoc(review);
      expect(error).not.toBeNull();
      expect(error.errors.rating).toBeDefined();
    });

    it("rejects negative rating (-1)", async () => {
      const review = new Review({ ...getValidReviewData(), rating: -1 });
      const error = await validateDoc(review);
      expect(error).not.toBeNull();
      expect(error.errors.rating).toBeDefined();
    });

    it("rejects rating above maximum (6)", async () => {
      const review = new Review({ ...getValidReviewData(), rating: 6 });
      const error = await validateDoc(review);
      expect(error).not.toBeNull();
      expect(error.errors.rating).toBeDefined();
    });

    it("rejects decimal rating (3.5)", async () => {
      const review = new Review({ ...getValidReviewData(), rating: 3.5 });
      const error = await validateDoc(review);
      expect(error).not.toBeNull();
      expect(error.errors.rating).toBeDefined();
      expect(error.errors.rating.message).toContain("Rating must be an integer between 1 and 5");
    });

    it("rejects NaN rating", async () => {
      const review = new Review({ ...getValidReviewData(), rating: NaN });
      const error = await validateDoc(review);
      expect(error).not.toBeNull();
      expect(error.errors.rating).toBeDefined();
    });

    it("rejects non-numeric string rating", async () => {
      const review = new Review({ ...getValidReviewData(), rating: "excellent" });
      const error = await validateDoc(review);
      expect(error).not.toBeNull();
      expect(error.errors.rating).toBeDefined();
    });
  });

  describe("Title Invariant Validation", () => {
    it("accepts omitted title and defaults to empty string", async () => {
      const data = getValidReviewData();
      delete data.title;
      const review = new Review(data);
      const error = await validateDoc(review);
      expect(error).toBeNull();
      expect(review.title).toBe("");
    });

    it("trims whitespace from title", () => {
      const review = new Review({
        ...getValidReviewData(),
        title: "   Solid Hiking Boots   "
      });
      expect(review.title).toBe("Solid Hiking Boots");
    });

    it("accepts title of exactly 100 characters", async () => {
      const title = "A".repeat(100);
      const review = new Review({ ...getValidReviewData(), title });
      const error = await validateDoc(review);
      expect(error).toBeNull();
    });

    it("rejects title exceeding 100 characters", async () => {
      const title = "A".repeat(101);
      const review = new Review({ ...getValidReviewData(), title });
      const error = await validateDoc(review);
      expect(error).not.toBeNull();
      expect(error.errors.title).toBeDefined();
      expect(error.errors.title.message).toContain("Review title cannot exceed 100 characters");
    });
  });

  describe("Body Invariant Validation", () => {
    it("trims whitespace from review body", () => {
      const review = new Review({
        ...getValidReviewData(),
        body: "   Great tent, kept us warm and dry.   "
      });
      expect(review.body).toBe("Great tent, kept us warm and dry.");
    });

    it("accepts body of exactly 5 characters", async () => {
      const review = new Review({ ...getValidReviewData(), body: "Great" });
      const error = await validateDoc(review);
      expect(error).toBeNull();
    });

    it("rejects body shorter than 5 characters", async () => {
      const review = new Review({ ...getValidReviewData(), body: "Good" });
      const error = await validateDoc(review);
      expect(error).not.toBeNull();
      expect(error.errors.body).toBeDefined();
      expect(error.errors.body.message).toContain("Review body must be at least 5 characters");
    });

    it("accepts body of exactly 2000 characters", async () => {
      const body = "B".repeat(2000);
      const review = new Review({ ...getValidReviewData(), body });
      const error = await validateDoc(review);
      expect(error).toBeNull();
    });

    it("rejects body exceeding 2000 characters", async () => {
      const body = "B".repeat(2001);
      const review = new Review({ ...getValidReviewData(), body });
      const error = await validateDoc(review);
      expect(error).not.toBeNull();
      expect(error.errors.body).toBeDefined();
      expect(error.errors.body.message).toContain("Review body cannot exceed 2000 characters");
    });
  });

  describe("Status Invariant Validation", () => {
    it.each(["published", "hidden", "flagged"])("accepts valid status: %s", async (status) => {
      const review = new Review({ ...getValidReviewData(), status });
      const error = await validateDoc(review);
      expect(error).toBeNull();
      expect(review.status).toBe(status);
    });

    it("rejects invalid status", async () => {
      const review = new Review({ ...getValidReviewData(), status: "deleted" });
      const error = await validateDoc(review);
      expect(error).not.toBeNull();
      expect(error.errors.status).toBeDefined();
      expect(error.errors.status.message).toContain("Invalid review status");
    });
  });

  describe("Verified Buyer Default Invariant", () => {
    it("defaults isVerifiedBuyer to true", () => {
      const review = new Review(getValidReviewData());
      expect(review.isVerifiedBuyer).toBe(true);
    });

    it("allows explicitly setting isVerifiedBuyer to false if needed by model", () => {
      const review = new Review({ ...getValidReviewData(), isVerifiedBuyer: false });
      expect(review.isVerifiedBuyer).toBe(false);
    });
  });

  describe("Database Indexes", () => {
    it("defines compound unique index on { user: 1, product: 1 }", () => {
      const indexes = Review.schema.indexes();
      const uniqueUserProductIndex = indexes.find(([fields, options]) => {
        return (
          fields.user === 1 &&
          fields.product === 1 &&
          options.unique === true
        );
      });

      expect(uniqueUserProductIndex).toBeDefined();
    });

    it("defines query index on { product: 1, status: 1, createdAt: -1 }", () => {
      const indexes = Review.schema.indexes();
      const queryIndex = indexes.find(([fields]) => {
        return (
          fields.product === 1 &&
          fields.status === 1 &&
          fields.createdAt === -1
        );
      });

      expect(queryIndex).toBeDefined();
    });
  });
});
