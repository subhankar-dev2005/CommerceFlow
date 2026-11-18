import mongoose from "mongoose";
import { describe, it, expect } from "vitest";
import Product from "./product.model.js";

function createValidProductData(overrides = {}) {
  return {
    name: "Classic Cotton T-Shirt",
    description: "Premium breathable organic cotton t-shirt",
    price: 499,
    stock: 50,
    category: "Apparel",
    ...overrides
  };
}

describe("P1.6.2 Product Model — Variant Schema Tests", () => {
  describe("Simple Product Behavior & Defaults", () => {
    it("defaults variants to an empty array for simple products", async () => {
      const product = new Product(createValidProductData());
      await product.validate();

      expect(product.variants).toBeDefined();
      expect(Array.isArray(product.variants)).toBe(true);
      expect(product.variants.length).toBe(0);
    });

    it("validates existing simple-product document structure with no variant configuration", async () => {
      const legacyData = {
        name: "Simple Mug",
        description: "Standard ceramic coffee mug",
        price: 249,
        stock: 25,
        category: "Kitchen",
        specifications: [{ label: "Material", value: "Ceramic" }]
      };

      const product = new Product(legacyData);
      await product.validate();

      expect(product.name).toBe("Simple Mug");
      expect(product.price).toBe(249);
      expect(product.stock).toBe(25);
      expect(product.variants).toEqual([]);
    });
  });

  describe("Variant Subdocument Schema & Defaults", () => {
    it("does not generate an _id for variant subdocuments", async () => {
      const product = new Product(
        createValidProductData({
          variants: [
            {
              variantId: "var_uuid_101",
              sku: "TSHIRT-BLK-M",
              stock: 15,
              attributes: { color: "Black", size: "M" }
            }
          ]
        })
      );

      await product.validate();
      const variant = product.variants[0];

      expect(variant._id).toBeUndefined();
      expect(variant.variantId).toBe("var_uuid_101");
    });

    it("applies expected safe defaults to variant subdocuments", async () => {
      const product = new Product(
        createValidProductData({
          variants: [
            {
              variantId: "var_uuid_102",
              sku: "  tshirt-def-s  ",
              stock: 10
            }
          ]
        })
      );

      await product.validate();
      const variant = product.variants[0];

      expect(variant.sku).toBe("TSHIRT-DEF-S");
      expect(variant.price).toBeNull();
      expect(variant.stock).toBe(10);
      expect(variant.images).toEqual([]);
      expect(variant.isActive).toBe(true);
      expect(variant.attributes instanceof Map).toBe(true);
      expect(variant.attributes.size).toBe(0);
    });

    it("accepts valid flexible attributes map", async () => {
      const product = new Product(
        createValidProductData({
          variants: [
            {
              variantId: "var_uuid_103",
              sku: "TSHIRT-RED-L",
              stock: 20,
              price: 549,
              attributes: {
                color: "Crimson Red",
                size: "Large",
                material: "Organic Cotton"
              }
            }
          ]
        })
      );

      await product.validate();
      const variant = product.variants[0];

      expect(variant.variantId).toBe("var_uuid_103");
      expect(variant.sku).toBe("TSHIRT-RED-L");
      expect(variant.price).toBe(549);
      expect(variant.stock).toBe(20);
      expect(variant.attributes.get("color")).toBe("Crimson Red");
      expect(variant.attributes.get("size")).toBe("Large");
      expect(variant.attributes.get("material")).toBe("Organic Cotton");
    });

    it("normalizes attribute keys to lowercase and preserves value casing", async () => {
      const product = new Product(
        createValidProductData({
          variants: [
            {
              variantId: "var_uuid_103_norm",
              sku: "TSHIRT-NORM",
              stock: 12,
              attributes: {
                "  Color  ": "  Deep Indigo  ",
                "SIZE": "XL"
              }
            }
          ]
        })
      );

      await product.validate();
      const variant = product.variants[0];

      expect(variant.attributes.get("color")).toBe("Deep Indigo");
      expect(variant.attributes.get("size")).toBe("XL");
      expect(variant.attributes.has("Color")).toBe(false);
    });

    it("allows variant price to be null (inherits parent product price)", async () => {
      const product = new Product(
        createValidProductData({
          price: 599,
          variants: [
            {
              variantId: "var_uuid_104",
              sku: "TSHIRT-NULL-PRICE",
              stock: 5,
              price: null
            }
          ]
        })
      );

      await product.validate();
      expect(product.variants[0].price).toBeNull();
    });

    it("allows variant price to be 0 for promotional/free items", async () => {
      const product = new Product(
        createValidProductData({
          variants: [
            {
              variantId: "var_uuid_105",
              sku: "TSHIRT-FREE",
              stock: 5,
              price: 0
            }
          ]
        })
      );

      await product.validate();
      expect(product.variants[0].price).toBe(0);
    });

    it("accepts valid image URLs in variant images array", async () => {
      const product = new Product(
        createValidProductData({
          variants: [
            {
              variantId: "var_uuid_105_img",
              sku: "TSHIRT-IMG",
              stock: 5,
              images: [
                "https://example.com/gallery1.jpg",
                "https://example.com/gallery2.jpg"
              ]
            }
          ]
        })
      );

      await product.validate();
      expect(product.variants[0].images).toEqual([
        "https://example.com/gallery1.jpg",
        "https://example.com/gallery2.jpg"
      ]);
    });
  });

  describe("Variant Validation Rules", () => {
    it("fails validation if variantId is missing", async () => {
      const product = new Product(
        createValidProductData({
          variants: [
            {
              sku: "TSHIRT-NO-ID",
              stock: 5
            }
          ]
        })
      );

      await expect(product.validate()).rejects.toThrow("Variant ID is required");
    });

    it("fails validation if variant SKU is missing", async () => {
      const product = new Product(
        createValidProductData({
          variants: [
            {
              variantId: "var_uuid_106_nosku",
              stock: 5
            }
          ]
        })
      );

      await expect(product.validate()).rejects.toThrow("Variant SKU is required");
    });

    it("fails validation if variant stock is missing", async () => {
      const product = new Product(
        createValidProductData({
          variants: [
            {
              variantId: "var_uuid_106_nostock",
              sku: "TSHIRT-NO-STOCK"
            }
          ]
        })
      );

      await expect(product.validate()).rejects.toThrow("Variant stock is required");
    });

    it("fails validation if variant stock is negative", async () => {
      const product = new Product(
        createValidProductData({
          variants: [
            {
              variantId: "var_uuid_106",
              sku: "TSHIRT-NEG-STOCK",
              stock: -1
            }
          ]
        })
      );

      await expect(product.validate()).rejects.toThrow("Variant stock cannot be negative");
    });

    it("fails validation if variant stock is a non-integer number", async () => {
      const product = new Product(
        createValidProductData({
          variants: [
            {
              variantId: "var_uuid_106_float",
              sku: "TSHIRT-FLOAT-STOCK",
              stock: 3.5
            }
          ]
        })
      );

      await expect(product.validate()).rejects.toThrow("Variant stock must be an integer");
    });

    it("fails validation if variant price is negative", async () => {
      const product = new Product(
        createValidProductData({
          variants: [
            {
              variantId: "var_uuid_107",
              sku: "TSHIRT-NEG-PRICE",
              stock: 5,
              price: -50
            }
          ]
        })
      );

      await expect(product.validate()).rejects.toThrow("Variant price cannot be negative");
    });

    it("fails validation if variant image URL is invalid", async () => {
      const product = new Product(
        createValidProductData({
          variants: [
            {
              variantId: "var_uuid_107_badimg",
              sku: "TSHIRT-BAD-IMG",
              stock: 5,
              images: ["invalid-url"]
            }
          ]
        })
      );

      await expect(product.validate()).rejects.toThrow("Each variant image must be a valid URL");
    });

    it("strictly rejects unsupported arbitrary fields on variant subdocuments", async () => {
      const product = new Product(
        createValidProductData({
          variants: [
            {
              variantId: "var_uuid_107_extra",
              sku: "TSHIRT-EXTRA",
              stock: 5,
              unsupportedField: "disallowed"
            }
          ]
        })
      );

      await expect(product.validate()).rejects.toThrow();
    });

    it("strictly rejects client-supplied _id on variant subdocuments", async () => {
      const product = new Product(
        createValidProductData({
          variants: [
            {
              _id: "507f1f77bcf86cd799439011",
              variantId: "var_uuid_107_client_id",
              sku: "TSHIRT-CLIENT-ID",
              stock: 5
            }
          ]
        })
      );

      await expect(product.validate()).rejects.toThrow();
    });
  });

  describe("Indexes & Catalog-Wide SKU Limitation", () => {
    it("defines multikey index on variants.variantId for fast lookup", () => {
      const indexes = Product.schema.indexes();
      expect(indexes).toContainEqual([
        { "variants.variantId": 1 },
        {}
      ]);
    });

    it("defines single-field index on vendorId for tenant lookup", () => {
      const indexes = Product.schema.indexes();
      expect(indexes).toContainEqual([
        { vendorId: 1 },
        {}
      ]);
    });

    it("does NOT define an unsafe unique multikey index on variants.sku", () => {
      const indexes = Product.schema.indexes();
      const skuIndex = indexes.find(
        ([idxFields]) => idxFields && idxFields["variants.sku"] !== undefined
      );

      // Model-layer limitation: Catalog-wide SKU uniqueness cannot be safely enforced
      // via an embedded multikey unique index in MongoDB without causing duplicate key collisions
      // on null/missing values across documents. It must be enforced at the application layer.
      expect(skuIndex).toBeUndefined();
    });
  });

  describe("Vendor Ownership Field & Backward Compatibility", () => {
    it("allows products to be created and validated without vendorId (defaults to null)", async () => {
      const product = new Product(createValidProductData());
      await product.validate();

      expect(product.vendorId).toBeNull();
    });

    it("allows products to be created and validated with a valid-shaped vendorId", async () => {
      const mockVendorId = new mongoose.Types.ObjectId();
      const product = new Product(
        createValidProductData({
          vendorId: mockVendorId
        })
      );
      await product.validate();

      expect(product.vendorId).toBeDefined();
      expect(product.vendorId.toString()).toBe(mockVendorId.toString());
    });
  });

  describe("Serialization & toJSON", () => {
    it("correctly includes variants in toJSON and preserves restorationKeys omission", () => {
      const product = new Product(
        createValidProductData({
          restorationKeys: ["key-123"],
          variants: [
            {
              variantId: "var_uuid_108",
              sku: "SKU-108",
              stock: 8,
              price: 399,
              attributes: { size: "S" }
            }
          ]
        })
      );

      const json = product.toJSON();
      expect(json.restorationKeys).toBeUndefined();
      expect(json.variants).toBeDefined();
      expect(json.variants.length).toBe(1);
      expect(json.variants[0].variantId).toBe("var_uuid_108");
      expect(json.variants[0].sku).toBe("SKU-108");
      expect(json.variants[0].stock).toBe(8);
      expect(json.variants[0]._id).toBeUndefined();
    });
  });

  describe("Change Token Field & Concurrency Invariants", () => {
    it("automatically assigns a fresh 24-character hex changeToken upon product instantiation", async () => {
      const product = new Product(createValidProductData());
      await product.validate();

      expect(product.changeToken).toBeDefined();
      expect(typeof product.changeToken).toBe("string");
      expect(product.changeToken).toMatch(/^[0-9a-fA-F]{24}$/);
    });

    it("generates distinct change tokens for sequentially instantiated products", () => {
      const product1 = new Product(createValidProductData());
      const product2 = new Product(createValidProductData());

      expect(product1.changeToken).not.toBe(product2.changeToken);
    });

    it("accepts and preserves an explicitly supplied valid 24-character hexadecimal changeToken", async () => {
      const explicitToken = new mongoose.Types.ObjectId().toHexString();
      const product = new Product(
        createValidProductData({
          changeToken: explicitToken
        })
      );
      await product.validate();

      expect(product.changeToken).toBe(explicitToken);
    });

    it("fails validation when changeToken is not a 24-character hex string", async () => {
      const invalidTokens = [
        "short_token",
        "12345678901234567890123z", // non-hex character 'z'
        "1234567890123456789012345", // 25 characters
        "not-a-hex-string-at-all!",
        123456789012345678901234
      ];

      for (const token of invalidTokens) {
        const product = new Product(
          createValidProductData({
            changeToken: token
          })
        );

        await expect(product.validate()).rejects.toThrow();
      }
    });

    it("fails validation when changeToken is explicitly set to null or empty string", async () => {
      const nullProduct = new Product(
        createValidProductData({
          changeToken: null
        })
      );
      await expect(nullProduct.validate()).rejects.toThrow();

      const emptyProduct = new Product(
        createValidProductData({
          changeToken: ""
        })
      );
      await expect(emptyProduct.validate()).rejects.toThrow();
    });
  });
});
