import { describe, it, expect } from "vitest";

import createProductSchema from "./product.validator.js";

describe("createProductSchema - validation and images support", () => {
  const validBasePayload = {
    name: "Mechanical Keyboard",
    description: "High-grade RGB mechanical gaming keyboard with brown switches",
    price: 3499,
    stock: 15,
    category: "Peripherals"
  };

  it("accepts a valid product with both primary image and images array", () => {
    const result = createProductSchema.safeParse({
      body: {
        ...validBasePayload,
        image: "https://example.com/primary.jpg",
        images: [
          "https://example.com/gallery1.jpg",
          "https://example.com/gallery2.jpg"
        ]
      },
      query: {},
      params: {}
    });

    expect(result.success).toBe(true);
    expect(result.data.body.image).toBe("https://example.com/primary.jpg");
    expect(result.data.body.images).toEqual([
      "https://example.com/gallery1.jpg",
      "https://example.com/gallery2.jpg"
    ]);
  });

  it("accepts a legacy product with only primary image (backward compatibility)", () => {
    const result = createProductSchema.safeParse({
      body: {
        ...validBasePayload,
        image: "https://example.com/legacy-primary.jpg"
      },
      query: {},
      params: {}
    });

    expect(result.success).toBe(true);
    expect(result.data.body.image).toBe("https://example.com/legacy-primary.jpg");
    expect(result.data.body.images).toBeUndefined();
  });

  it("accepts a product with empty images array", () => {
    const result = createProductSchema.safeParse({
      body: {
        ...validBasePayload,
        image: "https://example.com/primary.jpg",
        images: []
      },
      query: {},
      params: {}
    });

    expect(result.success).toBe(true);
    expect(result.data.body.images).toEqual([]);
  });

  it("accepts a product without any image or images", () => {
    const result = createProductSchema.safeParse({
      body: {
        ...validBasePayload
      },
      query: {},
      params: {}
    });

    expect(result.success).toBe(true);
    expect(result.data.body.image).toBeUndefined();
    expect(result.data.body.images).toBeUndefined();
  });

  it("rejects a malformed URL in images array", () => {
    const result = createProductSchema.safeParse({
      body: {
        ...validBasePayload,
        images: [
          "https://example.com/valid.jpg",
          "invalid-gallery-url"
        ]
      },
      query: {},
      params: {}
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

  it("rejects non-string items in images array", () => {
    const result = createProductSchema.safeParse({
      body: {
        ...validBasePayload,
        images: ["https://example.com/valid.jpg", 999]
      },
      query: {},
      params: {}
    });

    expect(result.success).toBe(false);
    expect(
      result.error.issues.some((issue) =>
        issue.path.join(".").startsWith("body.images")
      )
    ).toBe(true);
  });

  it("rejects non-array value for images", () => {
    const result = createProductSchema.safeParse({
      body: {
        ...validBasePayload,
        images: "https://example.com/not-an-array.jpg"
      },
      query: {},
      params: {}
    });

    expect(result.success).toBe(false);
    expect(
      result.error.issues.some(
        (issue) => issue.path.join(".") === "body.images"
      )
    ).toBe(true);
  });

  it("rejects missing required core fields", () => {
    const result = createProductSchema.safeParse({
      body: {
        name: "Mechanical Keyboard"
      },
      query: {},
      params: {}
    });

    expect(result.success).toBe(false);
    expect(
      result.error.issues.some(
        (issue) => issue.path.join(".") === "body.description"
      )
    ).toBe(true);
    expect(
      result.error.issues.some((issue) => issue.path.join(".") === "body.price")
    ).toBe(true);
  });

  describe("specifications validation", () => {
    it("accepts a valid single specification", () => {
      const result = createProductSchema.safeParse({
        body: {
          ...validBasePayload,
          specifications: [
            { label: "Connectivity", value: "Wireless" }
          ]
        },
        query: {},
        params: {}
      });

      expect(result.success).toBe(true);
      expect(result.data.body.specifications).toEqual([
        { label: "Connectivity", value: "Wireless" }
      ]);
    });

    it("accepts valid multiple specifications and trims values", () => {
      const result = createProductSchema.safeParse({
        body: {
          ...validBasePayload,
          specifications: [
            { label: "  Brand  ", value: "  Logitech  " },
            { label: "Battery Life", value: "70 hours" },
            { label: "Weight", value: "63g" }
          ]
        },
        query: {},
        params: {}
      });

      expect(result.success).toBe(true);
      expect(result.data.body.specifications).toEqual([
        { label: "Brand", value: "Logitech" },
        { label: "Battery Life", value: "70 hours" },
        { label: "Weight", value: "63g" }
      ]);
    });

    it("accepts empty specifications array", () => {
      const result = createProductSchema.safeParse({
        body: {
          ...validBasePayload,
          specifications: []
        },
        query: {},
        params: {}
      });

      expect(result.success).toBe(true);
      expect(result.data.body.specifications).toEqual([]);
    });

    it("rejects missing label", () => {
      const result = createProductSchema.safeParse({
        body: {
          ...validBasePayload,
          specifications: [
            { value: "Wireless" }
          ]
        },
        query: {},
        params: {}
      });

      expect(result.success).toBe(false);
      expect(
        result.error.issues.some(
          (issue) => issue.path.join(".") === "body.specifications.0.label"
        )
      ).toBe(true);
    });

    it("rejects missing value", () => {
      const result = createProductSchema.safeParse({
        body: {
          ...validBasePayload,
          specifications: [
            { label: "Connectivity" }
          ]
        },
        query: {},
        params: {}
      });

      expect(result.success).toBe(false);
      expect(
        result.error.issues.some(
          (issue) => issue.path.join(".") === "body.specifications.0.value"
        )
      ).toBe(true);
    });

    it("rejects whitespace-only label", () => {
      const result = createProductSchema.safeParse({
        body: {
          ...validBasePayload,
          specifications: [
            { label: "   ", value: "Wireless" }
          ]
        },
        query: {},
        params: {}
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

    it("rejects whitespace-only value", () => {
      const result = createProductSchema.safeParse({
        body: {
          ...validBasePayload,
          specifications: [
            { label: "Connectivity", value: "   " }
          ]
        },
        query: {},
        params: {}
      });

      expect(result.success).toBe(false);
      expect(
        result.error.issues.some(
          (issue) =>
            issue.path.join(".") === "body.specifications.0.value" &&
            issue.message === "Specification value is required"
        )
      ).toBe(true);
    });

    it("rejects label exceeding 60 characters", () => {
      const result = createProductSchema.safeParse({
        body: {
          ...validBasePayload,
          specifications: [
            { label: "A".repeat(61), value: "Valid Value" }
          ]
        },
        query: {},
        params: {}
      });

      expect(result.success).toBe(false);
      expect(
        result.error.issues.some(
          (issue) =>
            issue.path.join(".") === "body.specifications.0.label" &&
            issue.message === "Specification label cannot exceed 60 characters"
        )
      ).toBe(true);
    });

    it("rejects value exceeding 300 characters", () => {
      const result = createProductSchema.safeParse({
        body: {
          ...validBasePayload,
          specifications: [
            { label: "Connectivity", value: "B".repeat(301) }
          ]
        },
        query: {},
        params: {}
      });

      expect(result.success).toBe(false);
      expect(
        result.error.issues.some(
          (issue) =>
            issue.path.join(".") === "body.specifications.0.value" &&
            issue.message === "Specification value cannot exceed 300 characters"
        )
      ).toBe(true);
    });

    it("rejects more than 30 specifications", () => {
      const tooManySpecs = Array.from({ length: 31 }, (_, i) => ({
        label: `Key ${i + 1}`,
        value: `Value ${i + 1}`
      }));

      const result = createProductSchema.safeParse({
        body: {
          ...validBasePayload,
          specifications: tooManySpecs
        },
        query: {},
        params: {}
      });

      expect(result.success).toBe(false);
      expect(
        result.error.issues.some(
          (issue) =>
            issue.path.join(".") === "body.specifications" &&
            issue.message === "A product cannot have more than 30 specifications"
        )
      ).toBe(true);
    });

    it("rejects unsupported nested fields in specification object", () => {
      const result = createProductSchema.safeParse({
        body: {
          ...validBasePayload,
          specifications: [
            { label: "Connectivity", value: "Wireless", extraField: "invalid" }
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
            issue.path.join(".").startsWith("body.specifications.0")
        )
      ).toBe(true);
    });
  });

  describe("category validation - disallows forward slashes", () => {
    it("rejects category containing forward slash", () => {
      const result = createProductSchema.safeParse({
        body: {
          ...validBasePayload,
          category: "Electronics/Audio"
        },
        query: {},
        params: {}
      });

      expect(result.success).toBe(false);
      expect(
        result.error.issues.some((issue) => issue.message === "Category name cannot contain '/'")
      ).toBe(true);
    });
  });
});
