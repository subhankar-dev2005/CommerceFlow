import { describe, it, expect } from "vitest";
import mergeCartSchema from "./merge-cart.validator.js";

describe("mergeCartSchema", () => {
  const validProductId1 = "507f1f77bcf86cd799439011";
  const validProductId2 = "507f1f77bcf86cd799439012";

  it("accepts a valid merge payload with a single item", () => {
    const result = mergeCartSchema.safeParse({
      body: {
        items: [
          {
            productId: validProductId1,
            quantity: 2
          }
        ]
      },
      query: {},
      params: {}
    });

    expect(result.success).toBe(true);
    expect(result.data.body.items).toEqual([
      {
        productId: validProductId1,
        quantity: 2,
        variantId: null
      }
    ]);
  });

  it("accepts a valid merge payload with multiple distinct items", () => {
    const result = mergeCartSchema.safeParse({
      body: {
        items: [
          {
            productId: validProductId1,
            quantity: 2
          },
          {
            productId: validProductId2,
            quantity: 5
          }
        ]
      },
      query: {},
      params: {}
    });

    expect(result.success).toBe(true);
    expect(result.data.body.items).toHaveLength(2);
    expect(result.data.body.items[0].variantId).toBeNull();
    expect(result.data.body.items[1].variantId).toBeNull();
  });

  it("rejects missing items field", () => {
    const result = mergeCartSchema.safeParse({
      body: {},
      query: {},
      params: {}
    });

    expect(result.success).toBe(false);
    expect(
      result.error.issues.some((issue) => issue.path.join(".") === "body.items")
    ).toBe(true);
  });

  it("rejects empty items array", () => {
    const result = mergeCartSchema.safeParse({
      body: {
        items: []
      },
      query: {},
      params: {}
    });

    expect(result.success).toBe(false);
    expect(
      result.error.issues.some(
        (issue) =>
          issue.path.join(".") === "body.items" &&
          issue.message === "Items array must contain at least 1 item"
      )
    ).toBe(true);
  });

  it("rejects items when not an array", () => {
    const result = mergeCartSchema.safeParse({
      body: {
        items: "not-an-array"
      },
      query: {},
      params: {}
    });

    expect(result.success).toBe(false);
    expect(
      result.error.issues.some((issue) => issue.path.join(".") === "body.items")
    ).toBe(true);
  });

  it("rejects malformed product ID", () => {
    const result = mergeCartSchema.safeParse({
      body: {
        items: [
          {
            productId: "invalid-id-123",
            quantity: 1
          }
        ]
      },
      query: {},
      params: {}
    });

    expect(result.success).toBe(false);
    expect(
      result.error.issues.some(
        (issue) =>
          issue.path.join(".") === "body.items.0.productId" &&
          issue.message === "Invalid product ID"
      )
    ).toBe(true);
  });

  it("rejects quantity of 0", () => {
    const result = mergeCartSchema.safeParse({
      body: {
        items: [
          {
            productId: validProductId1,
            quantity: 0
          }
        ]
      },
      query: {},
      params: {}
    });

    expect(result.success).toBe(false);
    expect(
      result.error.issues.some(
        (issue) =>
          issue.path.join(".") === "body.items.0.quantity" &&
          issue.message === "Quantity must be at least 1"
      )
    ).toBe(true);
  });

  it("rejects negative quantity", () => {
    const result = mergeCartSchema.safeParse({
      body: {
        items: [
          {
            productId: validProductId1,
            quantity: -3
          }
        ]
      },
      query: {},
      params: {}
    });

    expect(result.success).toBe(false);
    expect(
      result.error.issues.some(
        (issue) =>
          issue.path.join(".") === "body.items.0.quantity" &&
          issue.message === "Quantity must be at least 1"
      )
    ).toBe(true);
  });

  it("rejects fractional quantity", () => {
    const result = mergeCartSchema.safeParse({
      body: {
        items: [
          {
            productId: validProductId1,
            quantity: 1.5
          }
        ]
      },
      query: {},
      params: {}
    });

    expect(result.success).toBe(false);
    expect(
      result.error.issues.some(
        (issue) =>
          issue.path.join(".") === "body.items.0.quantity" &&
          issue.message === "Quantity must be an integer"
      )
    ).toBe(true);
  });

  it("rejects quantity exceeding 99", () => {
    const result = mergeCartSchema.safeParse({
      body: {
        items: [
          {
            productId: validProductId1,
            quantity: 100
          }
        ]
      },
      query: {},
      params: {}
    });

    expect(result.success).toBe(false);
    expect(
      result.error.issues.some(
        (issue) =>
          issue.path.join(".") === "body.items.0.quantity" &&
          issue.message === "Quantity cannot exceed 99"
      )
    ).toBe(true);
  });

  it("rejects more than 30 items in items array", () => {
    const tooManyItems = Array.from({ length: 31 }, (_, i) => ({
      productId: (i + 1).toString(16).padStart(24, "0"),
      quantity: 1
    }));

    const result = mergeCartSchema.safeParse({
      body: {
        items: tooManyItems
      },
      query: {},
      params: {}
    });

    expect(result.success).toBe(false);
    expect(
      result.error.issues.some(
        (issue) =>
          issue.path.join(".") === "body.items" &&
          issue.message === "Cannot merge more than 30 items"
      )
    ).toBe(true);
  });

  it("rejects duplicate items with identical productId and missing variantId", () => {
    const result = mergeCartSchema.safeParse({
      body: {
        items: [
          {
            productId: validProductId1,
            quantity: 1
          },
          {
            productId: validProductId1,
            quantity: 3
          }
        ]
      },
      query: {},
      params: {}
    });

    expect(result.success).toBe(false);
    expect(
      result.error.issues.some(
        (issue) =>
          issue.path.join(".") === "body.items" &&
          issue.message === "Duplicate items are not allowed in merge payload"
      )
    ).toBe(true);
  });

  it("rejects unknown nested properties in item object", () => {
    const result = mergeCartSchema.safeParse({
      body: {
        items: [
          {
            productId: validProductId1,
            quantity: 1,
            extraField: "not-allowed"
          }
        ]
      },
      query: {},
      params: {}
    });

    expect(result.success).toBe(false);
    expect(
      result.error.issues.some(
        (issue) =>
          issue.code === "unrecognized_keys" &&
          issue.path.join(".").startsWith("body.items.0")
      )
    ).toBe(true);
  });

  it("rejects unknown top-level body properties", () => {
    const result = mergeCartSchema.safeParse({
      body: {
        items: [
          {
            productId: validProductId1,
            quantity: 1
          }
        ],
        extraField: "not-allowed"
      },
      query: {},
      params: {}
    });

    expect(result.success).toBe(false);
    expect(
      result.error.issues.some(
        (issue) =>
          issue.code === "unrecognized_keys" &&
          issue.path.join(".") === "body"
      )
    ).toBe(true);
  });

  describe("variant validation & composite uniqueness", () => {
    const validVariantA = "var_aaaaaaaa-1111-2222-3333-444444444444";
    const validVariantB = "var_bbbbbbbb-5555-6666-7777-888888888888";

    it("defaults missing variantId to null", () => {
      const result = mergeCartSchema.safeParse({
        body: {
          items: [{ productId: validProductId1, quantity: 2 }]
        },
        query: {},
        params: {}
      });

      expect(result.success).toBe(true);
      expect(result.data.body.items[0].variantId).toBeNull();
    });

    it("accepts explicit variantId: null and normalizes to null", () => {
      const result = mergeCartSchema.safeParse({
        body: {
          items: [{ productId: validProductId1, variantId: null, quantity: 2 }]
        },
        query: {},
        params: {}
      });

      expect(result.success).toBe(true);
      expect(result.data.body.items[0].variantId).toBeNull();
    });

    it("accepts valid variant ID format", () => {
      const result = mergeCartSchema.safeParse({
        body: {
          items: [{ productId: validProductId1, variantId: validVariantA, quantity: 1 }]
        },
        query: {},
        params: {}
      });

      expect(result.success).toBe(true);
      expect(result.data.body.items[0].variantId).toBe(validVariantA);
    });

    it("rejects malformed variant ID format not starting with var_", () => {
      const result = mergeCartSchema.safeParse({
        body: {
          items: [{ productId: validProductId1, variantId: "not_a_variant", quantity: 1 }]
        },
        query: {},
        params: {}
      });

      expect(result.success).toBe(false);
      expect(
        result.error.issues.some(
          (issue) =>
            issue.path.join(".") === "body.items.0.variantId" &&
            issue.message === "Invalid variant ID format"
        )
      ).toBe(true);
    });

    it("rejects non-string variant ID", () => {
      const result = mergeCartSchema.safeParse({
        body: {
          items: [{ productId: validProductId1, variantId: 12345, quantity: 1 }]
        },
        query: {},
        params: {}
      });

      expect(result.success).toBe(false);
      expect(
        result.error.issues.some((issue) => issue.path.join(".") === "body.items.0.variantId")
      ).toBe(true);
    });

    it("accepts same product with two different variants as separate items", () => {
      const result = mergeCartSchema.safeParse({
        body: {
          items: [
            { productId: validProductId1, variantId: validVariantA, quantity: 1 },
            { productId: validProductId1, variantId: validVariantB, quantity: 2 }
          ]
        },
        query: {},
        params: {}
      });

      expect(result.success).toBe(true);
      expect(result.data.body.items).toHaveLength(2);
      expect(result.data.body.items[0].variantId).toBe(validVariantA);
      expect(result.data.body.items[1].variantId).toBe(validVariantB);
    });

    it("accepts simple product lines with different products", () => {
      const result = mergeCartSchema.safeParse({
        body: {
          items: [
            { productId: validProductId1, quantity: 1 },
            { productId: validProductId2, quantity: 2 }
          ]
        },
        query: {},
        params: {}
      });

      expect(result.success).toBe(true);
      expect(result.data.body.items).toHaveLength(2);
      expect(result.data.body.items[0].variantId).toBeNull();
      expect(result.data.body.items[1].variantId).toBeNull();
    });

    it("rejects duplicate items with identical (productId, variantId)", () => {
      const result = mergeCartSchema.safeParse({
        body: {
          items: [
            { productId: validProductId1, variantId: validVariantA, quantity: 1 },
            { productId: validProductId1, variantId: validVariantA, quantity: 2 }
          ]
        },
        query: {},
        params: {}
      });

      expect(result.success).toBe(false);
      expect(
        result.error.issues.some(
          (issue) =>
            issue.path.join(".") === "body.items" &&
            issue.message === "Duplicate items are not allowed in merge payload"
        )
      ).toBe(true);
    });

    it("treats missing variantId and explicit variantId: null as the same identity and rejects as duplicate", () => {
      const result = mergeCartSchema.safeParse({
        body: {
          items: [
            { productId: validProductId1, quantity: 1 },
            { productId: validProductId1, variantId: null, quantity: 2 }
          ]
        },
        query: {},
        params: {}
      });

      expect(result.success).toBe(false);
      expect(
        result.error.issues.some(
          (issue) =>
            issue.path.join(".") === "body.items" &&
            issue.message === "Duplicate items are not allowed in merge payload"
        )
      ).toBe(true);
    });
  });
});
