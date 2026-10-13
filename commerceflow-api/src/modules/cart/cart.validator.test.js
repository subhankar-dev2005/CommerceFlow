import { describe, it, expect } from "vitest";
import {
  addToCartSchema,
  updateCartItemSchema,
  removeCartItemSchema
} from "./cart.validator.js";

const VALID_PRODUCT_ID = "507f1f77bcf86cd799439011";
const VALID_VARIANT_ID = "var_ab12cd34ef56";

describe("removeCartItemSchema", () => {
  function parse(options = {}) {
    const payload = {
      params: "productId" in options ? (options.productId !== undefined ? { productId: options.productId } : {}) : { productId: VALID_PRODUCT_ID },
      query: "variantId" in options ? (options.variantId !== undefined ? { variantId: options.variantId } : {}) : {}
    };
    if ("body" in options) {
      payload.body = options.body;
    }
    return removeCartItemSchema.safeParse(payload);
  }

  it("accepts valid productId without a request body (undefined body)", () => {
    const result = parse();
    expect(result.success).toBe(true);
  });

  it("accepts valid productId with an empty JSON body ({})", () => {
    const result = parse({ body: {} });
    expect(result.success).toBe(true);
  });

  it("accepts valid productId with optional variantId in query and no body", () => {
    const result = parse({ variantId: VALID_VARIANT_ID });
    expect(result.success).toBe(true);
  });

  it("accepts valid productId with optional variantId in query and empty JSON body", () => {
    const result = parse({ variantId: VALID_VARIANT_ID, body: {} });
    expect(result.success).toBe(true);
  });

  it("rejects non-object body (e.g. string)", () => {
    const result = parse({ body: "invalid-string" });
    expect(result.success).toBe(false);
  });

  it("rejects non-object body (e.g. number)", () => {
    const result = parse({ body: 999 });
    expect(result.success).toBe(false);
  });

  it("rejects invalid productId (too short)", () => {
    const result = parse({ productId: "507f1f77bcf86cd79943901" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid productId (non-hex characters)", () => {
    const result = parse({ productId: "507f1f77bcf86cd79943901z" });
    expect(result.success).toBe(false);
  });

  it("rejects missing productId", () => {
    const result = parse({ productId: undefined });
    expect(result.success).toBe(false);
  });

  it("rejects invalid variantId query format", () => {
    const result = parse({ variantId: "invalid_format_without_var_prefix" });
    expect(result.success).toBe(false);
  });
});
