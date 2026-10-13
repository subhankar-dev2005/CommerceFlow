import { describe, it, expect } from "vitest";

import updateProductSchema from "./update-product.validator.js";

describe("updateProductSchema", () => {
  const validProductId = "507f1f77bcf86cd799439011";

  it("accepts a valid single-field update", () => {
    const result = updateProductSchema.safeParse({
      body: {
        price: 49.99
      },
      params: {
        id: validProductId
      }
    });

    expect(result.success).toBe(true);
    expect(result.data.body.price).toBe(49.99);
    expect(result.data.params.id).toBe(validProductId);
  });

  it("accepts multiple valid fields simultaneously", () => {
    const result = updateProductSchema.safeParse({
      body: {
        name: "Updated Wireless Headphones",
        description: "Updated description with sufficient length",
        price: 99.99,
        stock: 25,
        category: "Electronics",
        image: "https://example.com/updated-image.png",
        isActive: true
      },
      params: {
        id: validProductId
      }
    });

    expect(result.success).toBe(true);
    expect(result.data.body.name).toBe("Updated Wireless Headphones");
    expect(result.data.body.stock).toBe(25);
  });

  it("rejects an empty update body", () => {
    const result = updateProductSchema.safeParse({
      body: {},
      params: {
        id: validProductId
      }
    });

    expect(result.success).toBe(false);
    expect(
      result.error.issues.some(
        (issue) => issue.message === "At least one field is required to update"
      )
    ).toBe(true);
  });

  it("rejects unsupported/arbitrary fields", () => {
    const result = updateProductSchema.safeParse({
      body: {
        price: 19.99,
        arbitraryField: "not-allowed",
        isAdmin: true
      },
      params: {
        id: validProductId
      }
    });

    expect(result.success).toBe(false);
    expect(
      result.error.issues.some(
        (issue) => issue.code === "unrecognized_keys"
      )
    ).toBe(true);
  });

  it("rejects negative price", () => {
    const result = updateProductSchema.safeParse({
      body: {
        price: -10
      },
      params: {
        id: validProductId
      }
    });

    expect(result.success).toBe(false);
    expect(
      result.error.issues.some(
        (issue) =>
          issue.path.join(".") === "body.price" &&
          issue.message === "Price cannot be negative"
      )
    ).toBe(true);
  });

  it("rejects negative or non-integer stock", () => {
    const negativeResult = updateProductSchema.safeParse({
      body: {
        stock: -5
      },
      params: {
        id: validProductId
      }
    });

    expect(negativeResult.success).toBe(false);
    expect(
      negativeResult.error.issues.some(
        (issue) => issue.path.join(".") === "body.stock"
      )
    ).toBe(true);

    const floatResult = updateProductSchema.safeParse({
      body: {
        stock: 3.5
      },
      params: {
        id: validProductId
      }
    });

    expect(floatResult.success).toBe(false);
    expect(
      floatResult.error.issues.some(
        (issue) =>
          issue.path.join(".") === "body.stock" &&
          issue.message === "Stock must be a whole number"
      )
    ).toBe(true);
  });

  it("rejects a short product name", () => {
    const result = updateProductSchema.safeParse({
      body: {
        name: "A"
      },
      params: {
        id: validProductId
      }
    });

    expect(result.success).toBe(false);
    expect(
      result.error.issues.some(
        (issue) =>
          issue.path.join(".") === "body.name" &&
          issue.message === "Product name must contain at least 2 characters"
      )
    ).toBe(true);
  });

  it("rejects a short description", () => {
    const result = updateProductSchema.safeParse({
      body: {
        description: "Short"
      },
      params: {
        id: validProductId
      }
    });

    expect(result.success).toBe(false);
    expect(
      result.error.issues.some(
        (issue) =>
          issue.path.join(".") === "body.description" &&
          issue.message === "Description must contain at least 10 characters"
      )
    ).toBe(true);
  });

  it("rejects an invalid image URL", () => {
    const result = updateProductSchema.safeParse({
      body: {
        image: "not-a-valid-url"
      },
      params: {
        id: validProductId
      }
    });

    expect(result.success).toBe(false);
    expect(
      result.error.issues.some(
        (issue) =>
          issue.path.join(".") === "body.image" &&
          issue.message === "Image must be a valid URL"
      )
    ).toBe(true);
  });

  it("rejects an invalid product ID in params", () => {
    const result = updateProductSchema.safeParse({
      body: {
        price: 29.99
      },
      params: {
        id: "invalid-mongo-id"
      }
    });

    expect(result.success).toBe(false);
    expect(
      result.error.issues.some(
        (issue) =>
          issue.path.join(".") === "params.id" &&
          issue.message === "Invalid product ID"
      )
    ).toBe(true);
  });

  it("accepts a valid images array update", () => {
    const result = updateProductSchema.safeParse({
      body: {
        images: [
          "https://example.com/gallery1.jpg",
          "https://example.com/gallery2.jpg"
        ]
      },
      params: {
        id: validProductId
      }
    });

    expect(result.success).toBe(true);
    expect(result.data.body.images).toEqual([
      "https://example.com/gallery1.jpg",
      "https://example.com/gallery2.jpg"
    ]);
  });

  it("accepts an empty images array to clear gallery images", () => {
    const result = updateProductSchema.safeParse({
      body: {
        images: []
      },
      params: {
        id: validProductId
      }
    });

    expect(result.success).toBe(true);
    expect(result.data.body.images).toEqual([]);
  });

  it("rejects a malformed URL inside images array", () => {
    const result = updateProductSchema.safeParse({
      body: {
        images: ["https://example.com/valid.jpg", "invalid-url"]
      },
      params: {
        id: validProductId
      }
    });

    expect(result.success).toBe(false);
    expect(
      result.error.issues.some(
        (issue) =>
          issue.path.join(".") === "body.images.1" &&
          issue.message === "Each image must be a valid URL"
      )
    ).toBe(true);
  });

  it("rejects non-string items inside images array", () => {
    const result = updateProductSchema.safeParse({
      body: {
        images: [123, null]
      },
      params: {
        id: validProductId
      }
    });

    expect(result.success).toBe(false);
    expect(
      result.error.issues.some((issue) =>
        issue.path.join(".").startsWith("body.images")
      )
    ).toBe(true);
  });

  it("rejects non-array value for images", () => {
    const result = updateProductSchema.safeParse({
      body: {
        images: "https://example.com/not-an-array.jpg"
      },
      params: {
        id: validProductId
      }
    });

    expect(result.success).toBe(false);
    expect(
      result.error.issues.some(
        (issue) => issue.path.join(".") === "body.images"
      )
    ).toBe(true);
  });

  describe("specifications update validation", () => {
    it("accepts a valid specifications update", () => {
      const result = updateProductSchema.safeParse({
        body: {
          specifications: [
            { label: "Connectivity", value: "Bluetooth 5.3" },
            { label: "Weight", value: "180g" }
          ]
        },
        params: {
          id: validProductId
        }
      });

      expect(result.success).toBe(true);
      expect(result.data.body.specifications).toEqual([
        { label: "Connectivity", value: "Bluetooth 5.3" },
        { label: "Weight", value: "180g" }
      ]);
    });

    it("accepts an empty specifications array to clear all specifications", () => {
      const result = updateProductSchema.safeParse({
        body: {
          specifications: []
        },
        params: {
          id: validProductId
        }
      });

      expect(result.success).toBe(true);
      expect(result.data.body.specifications).toEqual([]);
    });

    it("rejects invalid specification item in update payload", () => {
      const result = updateProductSchema.safeParse({
        body: {
          specifications: [
            { label: "Missing Value" }
          ]
        },
        params: {
          id: validProductId
        }
      });

      expect(result.success).toBe(false);
      expect(
        result.error.issues.some(
          (issue) => issue.path.join(".") === "body.specifications.0.value"
        )
      ).toBe(true);
    });

    it("rejects whitespace-only label in update payload", () => {
      const result = updateProductSchema.safeParse({
        body: {
          specifications: [
            { label: "   ", value: "Valid Value" }
          ]
        },
        params: {
          id: validProductId
        }
      });

      expect(result.success).toBe(false);
      expect(
        result.error.issues.some(
          (issue) =>
            issue.path.join(".") === "body.specifications.0.label" &&
            issue.message === "Specification label is required"
        )
      ).toBe(true);
    });

    it("rejects unrecognized nested properties in specification item", () => {
      const result = updateProductSchema.safeParse({
        body: {
          specifications: [
            { label: "Brand", value: "Apple", unknownProp: "not-allowed" }
          ]
        },
        params: {
          id: validProductId
        }
      });

      expect(result.success).toBe(false);
      expect(
        result.error.issues.some(
          (issue) =>
            issue.code === "unrecognized_keys" &&
            issue.path.join(".").startsWith("body.specifications.0")
        )
      ).toBe(true);
    });
  });
});
