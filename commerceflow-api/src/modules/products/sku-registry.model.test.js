import mongoose from "mongoose";
import { describe, it, expect } from "vitest";
import SkuRegistry from "./sku-registry.model.js";

describe("SkuRegistry Model", () => {
  const validProductId = new mongoose.Types.ObjectId();

  it("defines expected schema fields and types", () => {
    const paths = SkuRegistry.schema.paths;

    expect(paths.sku).toBeDefined();
    expect(paths.sku.instance).toBe("String");
    expect(paths.sku.isRequired).toBe(true);

    expect(paths.product).toBeDefined();
    expect(paths.product.instance).toBe("ObjectId");
    expect(paths.product.isRequired).toBe(true);
    expect(paths.product.options.ref).toBe("Product");

    expect(paths.variantId).toBeDefined();
    expect(paths.variantId.instance).toBe("String");
    expect(paths.variantId.defaultValue).toBeNull();
  });

  it("defines a unique index on { sku: 1 }", () => {
    const indexes = SkuRegistry.schema.indexes();

    const skuUniqueIndex = indexes.find(
      ([spec, options]) => spec.sku === 1 && options?.unique === true
    );

    expect(skuUniqueIndex).toBeDefined();
  });

  it("validates a complete, valid SKU registry document", async () => {
    const doc = new SkuRegistry({
      sku: "PROD-VAR-NAVY-M",
      product: validProductId,
      variantId: "var_12345"
    });

    await doc.validate();

    expect(doc.sku).toBe("PROD-VAR-NAVY-M");
    expect(doc.product.toString()).toBe(validProductId.toString());
    expect(doc.variantId).toBe("var_12345");
  });

  it("defaults variantId to null for simple products", async () => {
    const doc = new SkuRegistry({
      sku: "SIMPLE-PROD-SKU",
      product: validProductId
    });

    await doc.validate();

    expect(doc.variantId).toBeNull();
  });

  it("trims and uppercases sku", async () => {
    const doc = new SkuRegistry({
      sku: "  prod-lower-sku  ",
      product: validProductId
    });

    await doc.validate();

    expect(doc.sku).toBe("PROD-LOWER-SKU");
  });

  it("fails validation when sku is missing", async () => {
    const doc = new SkuRegistry({
      product: validProductId
    });

    await expect(doc.validate()).rejects.toThrow("SKU is required");
  });

  it("fails validation when product reference is missing", async () => {
    const doc = new SkuRegistry({
      sku: "PROD-SKU-1"
    });

    await expect(doc.validate()).rejects.toThrow("Product reference is required");
  });

  it("fails validation when sku contains invalid characters or whitespace", async () => {
    const invalidSkus = [
      "PROD SKU WITH SPACES",
      "PROD@SKU!",
      "PROD#123",
      "PROD.DOT",
      "PROD$MONEY"
    ];

    for (const invalidSku of invalidSkus) {
      const doc = new SkuRegistry({
        sku: invalidSku,
        product: validProductId
      });

      await expect(doc.validate()).rejects.toThrow(
        "SKU can only contain alphanumeric characters, hyphens, and underscores"
      );
    }
  });

  it("accepts valid alphanumeric SKUs with hyphens and underscores", async () => {
    const doc = new SkuRegistry({
      sku: "PROD_CODE-123_VAR",
      product: validProductId
    });

    await doc.validate();
    expect(doc.sku).toBe("PROD_CODE-123_VAR");
  });

  it("reuses existing model without OverwriteModelError", () => {
    expect(mongoose.models.SkuRegistry).toBe(SkuRegistry);
  });
});
