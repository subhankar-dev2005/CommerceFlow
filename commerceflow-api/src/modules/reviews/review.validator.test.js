import { describe, it, expect } from "vitest";
import {
  createReviewSchema,
  updateReviewSchema,
  reviewQuerySchema,
  reviewIdParamSchema,
  reviewProductIdParamSchema
} from "./review.validator.js";

describe("Review Validators", () => {
  const validObjectId = "507f1f77bcf86cd799439011";

  describe("createReviewSchema", () => {
    it("accepts a valid payload with rating and body", () => {
      const result = createReviewSchema.safeParse({
        body: {
          rating: 5,
          body: "Outstanding build quality and comfort."
        }
      });

      expect(result.success).toBe(true);
      expect(result.data.body.rating).toBe(5);
      expect(result.data.body.body).toBe("Outstanding build quality and comfort.");
    });

    it("accepts a valid payload with rating, title, and body", () => {
      const result = createReviewSchema.safeParse({
        body: {
          rating: 4,
          title: "Very durable tent",
          body: "Kept us dry during heavy downpours. Highly recommended."
        }
      });

      expect(result.success).toBe(true);
      expect(result.data.body.rating).toBe(4);
      expect(result.data.body.title).toBe("Very durable tent");
    });

    it("trims whitespace from title and body", () => {
      const result = createReviewSchema.safeParse({
        body: {
          rating: 5,
          title: "   Trimmed Title   ",
          body: "   Trimmed review body text.   "
        }
      });

      expect(result.success).toBe(true);
      expect(result.data.body.title).toBe("Trimmed Title");
      expect(result.data.body.body).toBe("Trimmed review body text.");
    });

    it("accepts boundary values: rating 1 and body of exactly 5 characters", () => {
      const result = createReviewSchema.safeParse({
        body: {
          rating: 1,
          body: "12345"
        }
      });

      expect(result.success).toBe(true);
    });

    it("accepts boundary values: rating 5 and body of exactly 2000 characters", () => {
      const result = createReviewSchema.safeParse({
        body: {
          rating: 5,
          body: "A".repeat(2000)
        }
      });

      expect(result.success).toBe(true);
    });

    it("rejects missing rating", () => {
      const result = createReviewSchema.safeParse({
        body: {
          body: "Great product with solid specs."
        }
      });

      expect(result.success).toBe(false);
      expect(
        result.error.issues.some((issue) => issue.path.join(".") === "body.rating")
      ).toBe(true);
    });

    it("rejects non-integer rating (decimal 3.5)", () => {
      const result = createReviewSchema.safeParse({
        body: {
          rating: 3.5,
          body: "Decent product overall."
        }
      });

      expect(result.success).toBe(false);
      expect(
        result.error.issues.some((issue) => issue.message.includes("whole number"))
      ).toBe(true);
    });

    it("rejects rating below 1 (0)", () => {
      const result = createReviewSchema.safeParse({
        body: {
          rating: 0,
          body: "Terrible experience with this gear."
        }
      });

      expect(result.success).toBe(false);
      expect(
        result.error.issues.some((issue) => issue.path.join(".") === "body.rating")
      ).toBe(true);
    });

    it("rejects rating above 5 (6)", () => {
      const result = createReviewSchema.safeParse({
        body: {
          rating: 6,
          body: "Super amazing product."
        }
      });

      expect(result.success).toBe(false);
      expect(
        result.error.issues.some((issue) => issue.path.join(".") === "body.rating")
      ).toBe(true);
    });

    it("rejects missing review body", () => {
      const result = createReviewSchema.safeParse({
        body: {
          rating: 5
        }
      });

      expect(result.success).toBe(false);
      expect(
        result.error.issues.some((issue) => issue.path.join(".") === "body.body")
      ).toBe(true);
    });

    it("rejects review body shorter than 5 characters", () => {
      const result = createReviewSchema.safeParse({
        body: {
          rating: 5,
          body: "Good"
        }
      });

      expect(result.success).toBe(false);
      expect(
        result.error.issues.some((issue) => issue.message.includes("at least 5 characters"))
      ).toBe(true);
    });

    it("rejects review body exceeding 2000 characters", () => {
      const result = createReviewSchema.safeParse({
        body: {
          rating: 5,
          body: "A".repeat(2001)
        }
      });

      expect(result.success).toBe(false);
      expect(
        result.error.issues.some((issue) => issue.message.includes("cannot exceed 2000 characters"))
      ).toBe(true);
    });

    it("rejects review title exceeding 100 characters", () => {
      const result = createReviewSchema.safeParse({
        body: {
          rating: 5,
          title: "T".repeat(101),
          body: "Great product review content."
        }
      });

      expect(result.success).toBe(false);
      expect(
        result.error.issues.some((issue) => issue.message.includes("cannot exceed 100 characters"))
      ).toBe(true);
    });

    it("strictly rejects client injection of user, order, or isVerifiedBuyer", () => {
      const result = createReviewSchema.safeParse({
        body: {
          rating: 5,
          body: "Attempting field injection",
          user: validObjectId,
          order: validObjectId,
          isVerifiedBuyer: true,
          status: "published"
        }
      });

      expect(result.success).toBe(false);
      expect(
        result.error.issues.some((issue) => issue.code === "unrecognized_keys")
      ).toBe(true);
    });
  });

  describe("updateReviewSchema", () => {
    it("accepts a rating-only update", () => {
      const result = updateReviewSchema.safeParse({
        body: {
          rating: 4
        }
      });

      expect(result.success).toBe(true);
      expect(result.data.body.rating).toBe(4);
    });

    it("accepts a title-only update", () => {
      const result = updateReviewSchema.safeParse({
        body: {
          title: "Updated after 6 months of use"
        }
      });

      expect(result.success).toBe(true);
      expect(result.data.body.title).toBe("Updated after 6 months of use");
    });

    it("accepts a body-only update", () => {
      const result = updateReviewSchema.safeParse({
        body: {
          body: "Still holding up remarkably well on rocky terrains."
        }
      });

      expect(result.success).toBe(true);
      expect(result.data.body.body).toBe("Still holding up remarkably well on rocky terrains.");
    });

    it("accepts an update with all editable fields", () => {
      const result = updateReviewSchema.safeParse({
        body: {
          rating: 5,
          title: "Revised Long-term Review",
          body: "Upgraded rating from 4 to 5 after winter camping trip."
        }
      });

      expect(result.success).toBe(true);
      expect(result.data.body).toEqual({
        rating: 5,
        title: "Revised Long-term Review",
        body: "Upgraded rating from 4 to 5 after winter camping trip."
      });
    });

    it("rejects an empty update object", () => {
      const result = updateReviewSchema.safeParse({
        body: {}
      });

      expect(result.success).toBe(false);
      expect(
        result.error.issues.some((issue) => issue.message.includes("At least one field is required to update"))
      ).toBe(true);
    });

    it("rejects invalid values in update (e.g. rating 0)", () => {
      const result = updateReviewSchema.safeParse({
        body: {
          rating: 0
        }
      });

      expect(result.success).toBe(false);
    });

    it("rejects body shorter than 5 characters in update", () => {
      const result = updateReviewSchema.safeParse({
        body: {
          body: "Bad"
        }
      });

      expect(result.success).toBe(false);
    });

    it("strictly rejects client attempts to modify protected fields", () => {
      const result = updateReviewSchema.safeParse({
        body: {
          rating: 5,
          isVerifiedBuyer: true,
          status: "published",
          user: validObjectId,
          product: validObjectId
        }
      });

      expect(result.success).toBe(false);
      expect(
        result.error.issues.some((issue) => issue.code === "unrecognized_keys")
      ).toBe(true);
    });
  });

  describe("reviewQuerySchema", () => {
    it("applies default values for page, limit, sortBy, and sortOrder", () => {
      const result = reviewQuerySchema.safeParse({
        query: {}
      });

      expect(result.success).toBe(true);
      expect(result.data.query.page).toBe(1);
      expect(result.data.query.limit).toBe(10);
      expect(result.data.query.sortBy).toBe("createdAt");
      expect(result.data.query.sortOrder).toBe("desc");
    });

    it("coerces string query parameters to numbers", () => {
      const result = reviewQuerySchema.safeParse({
        query: {
          page: "3",
          limit: "25",
          rating: "5",
          sortBy: "rating",
          sortOrder: "asc"
        }
      });

      expect(result.success).toBe(true);
      expect(result.data.query.page).toBe(3);
      expect(result.data.query.limit).toBe(25);
      expect(result.data.query.rating).toBe(5);
      expect(result.data.query.sortBy).toBe("rating");
      expect(result.data.query.sortOrder).toBe("asc");
    });

    it("rejects page less than 1", () => {
      const result = reviewQuerySchema.safeParse({
        query: {
          page: "0"
        }
      });

      expect(result.success).toBe(false);
    });

    it("rejects limit greater than 50", () => {
      const result = reviewQuerySchema.safeParse({
        query: {
          limit: "51"
        }
      });

      expect(result.success).toBe(false);
    });

    it("rejects invalid rating query value (e.g. 6)", () => {
      const result = reviewQuerySchema.safeParse({
        query: {
          rating: "6"
        }
      });

      expect(result.success).toBe(false);
    });

    it("rejects invalid sortBy field", () => {
      const result = reviewQuerySchema.safeParse({
        query: {
          sortBy: "unsupportedField"
        }
      });

      expect(result.success).toBe(false);
    });

    it("rejects invalid sortOrder", () => {
      const result = reviewQuerySchema.safeParse({
        query: {
          sortOrder: "random"
        }
      });

      expect(result.success).toBe(false);
    });
  });

  describe("reviewIdParamSchema", () => {
    it("accepts a valid 24-character hexadecimal ObjectId", () => {
      const result = reviewIdParamSchema.safeParse({
        params: {
          reviewId: validObjectId
        }
      });

      expect(result.success).toBe(true);
      expect(result.data.params.reviewId).toBe(validObjectId);
    });

    it("rejects non-hexadecimal or malformed review ID", () => {
      const result = reviewIdParamSchema.safeParse({
        params: {
          reviewId: "not-a-valid-hex-id-12345"
        }
      });

      expect(result.success).toBe(false);
      expect(
        result.error.issues.some((issue) => issue.message.includes("Invalid review ID"))
      ).toBe(true);
    });

    it("rejects missing review ID", () => {
      const result = reviewIdParamSchema.safeParse({
        params: {}
      });

      expect(result.success).toBe(false);
    });
  });

  describe("reviewProductIdParamSchema", () => {
    it("accepts a valid 24-character hexadecimal ObjectId", () => {
      const result = reviewProductIdParamSchema.safeParse({
        params: {
          productId: validObjectId
        }
      });

      expect(result.success).toBe(true);
      expect(result.data.params.productId).toBe(validObjectId);
    });

    it("rejects invalid product ID", () => {
      const result = reviewProductIdParamSchema.safeParse({
        params: {
          productId: "123"
        }
      });

      expect(result.success).toBe(false);
      expect(
        result.error.issues.some((issue) => issue.message.includes("Invalid product ID"))
      ).toBe(true);
    });
  });
});
