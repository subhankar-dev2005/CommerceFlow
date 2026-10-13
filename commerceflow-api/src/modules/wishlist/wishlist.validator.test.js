import { describe, it, expect } from "vitest";
import {
  addWishlistItemSchema,
  wishlistProductIdParamSchema
} from "./wishlist.validator.js";

const VALID_ID = "507f1f77bcf86cd799439011";

describe("addWishlistItemSchema", () => {
  function parse(body) {
    return addWishlistItemSchema.safeParse({
      body,
      query: {},
      params: {}
    });
  }

  it("accepts a valid 24-char hex productId", () => {
    const result = parse({ productId: VALID_ID });
    expect(result.success).toBe(true);
  });

  it("rejects missing productId", () => {
    const result = parse({});
    expect(result.success).toBe(false);
  });

  it("rejects productId that is too short (23 chars)", () => {
    const result = parse({ productId: "507f1f77bcf86cd79943901" });
    expect(result.success).toBe(false);
  });

  it("rejects productId that is too long (25 chars)", () => {
    const result = parse({ productId: "507f1f77bcf86cd7994390111" });
    expect(result.success).toBe(false);
  });

  it("rejects productId with non-hex characters", () => {
    const result = parse({ productId: "507f1f77bcf86cd79943901g" });
    expect(result.success).toBe(false);
  });

  it("rejects unknown extra field (strict)", () => {
    const result = parse({
      productId: VALID_ID,
      userId: "another-id"
    });
    expect(result.success).toBe(false);
  });

  it("rejects quantity field (not a wishlist concern)", () => {
    const result = parse({
      productId: VALID_ID,
      quantity: 1
    });
    expect(result.success).toBe(false);
  });

  it("rejects price field", () => {
    const result = parse({
      productId: VALID_ID,
      price: 999
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-string productId", () => {
    const result = parse({ productId: 12345 });
    expect(result.success).toBe(false);
  });
});

describe("wishlistProductIdParamSchema", () => {
  function parse(productId, body = {}) {
    return wishlistProductIdParamSchema.safeParse({
      body,
      query: {},
      params: { productId }
    });
  }

  it("accepts a valid 24-char hex productId param", () => {
    const result = parse(VALID_ID);
    expect(result.success).toBe(true);
  });

  it("accepts a valid productId without a request body (undefined body)", () => {
    const result = wishlistProductIdParamSchema.safeParse({
      params: { productId: VALID_ID },
      query: {}
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid productId with an empty JSON body", () => {
    const result = parse(VALID_ID, {});
    expect(result.success).toBe(true);
  });

  it("rejects non-object body (e.g. string)", () => {
    const result = parse(VALID_ID, "not-an-object");
    expect(result.success).toBe(false);
  });

  it("rejects non-object body (e.g. number)", () => {
    const result = parse(VALID_ID, 12345);
    expect(result.success).toBe(false);
  });

  it("rejects short productId param", () => {
    const result = parse("507f1f77bcf86cd79943901");
    expect(result.success).toBe(false);
  });

  it("rejects non-hex productId param", () => {
    const result = parse("507f1f77bcf86cd79943901z");
    expect(result.success).toBe(false);
  });

  it("rejects empty productId param", () => {
    const result = parse("");
    expect(result.success).toBe(false);
  });

  it("rejects missing productId param", () => {
    const result = wishlistProductIdParamSchema.safeParse({
      body: {},
      query: {},
      params: {}
    });
    expect(result.success).toBe(false);
  });
});
