import { describe, it, expect } from "vitest";
import createProductSchema, {
  collapseWhitespace,
  getCanonicalVariantSignature
} from "./product.validator.js";
import updateProductSchema from "./update-product.validator.js";

describe("Product Variant Validation (P2.1.3)", () => {
  const validBasePayload = {
    name: "Classic Crewneck Sweatshirt",
    description: "Heavyweight fleece sweatshirt with ribbed cuffs and hem",
    price: 1499,
    stock: 50,
    category: "Apparel"
  };

  const validProductId = "507f1f77bcf86cd799439011";

  describe("Helper Functions", () => {
    it("collapseWhitespace trims and collapses internal spaces", () => {
      expect(collapseWhitespace("  Navy    Blue   Extra  ")).toBe("Navy Blue Extra");
      expect(collapseWhitespace("Standard")).toBe("Standard");
    });

    it("getCanonicalVariantSignature sorts normalized keys and lowercases values", () => {
      const sig1 = getCanonicalVariantSignature({
        Color: "Navy Blue",
        Size: "XL"
      });
      const sig2 = getCanonicalVariantSignature({
        size: "xl",
        color: "navy   blue"
      });

      expect(sig1).toBe("color:navy blue|size:xl");
      expect(sig2).toBe("color:navy blue|size:xl");
      expect(sig1).toBe(sig2);
    });

    it("getCanonicalVariantSignature handles empty or non-object attributes safely", () => {
      expect(getCanonicalVariantSignature(null)).toBe("");
      expect(getCanonicalVariantSignature({})).toBe("");
    });
  });

  describe("Simple Product Compatibility", () => {
    it("createProductSchema accepts omitted variants", () => {
      const result = createProductSchema.safeParse({
        body: { ...validBasePayload },
        query: {},
        params: {}
      });

      expect(result.success).toBe(true);
      expect(result.data.body.variants).toBeUndefined();
    });

    it("createProductSchema accepts empty variants array", () => {
      const result = createProductSchema.safeParse({
        body: {
          ...validBasePayload,
          variants: []
        },
        query: {},
        params: {}
      });

      expect(result.success).toBe(true);
      expect(result.data.body.variants).toEqual([]);
    });

    it("updateProductSchema accepts omitted variants", () => {
      const result = updateProductSchema.safeParse({
        body: { price: 1299 },
        params: { id: validProductId }
      });

      expect(result.success).toBe(true);
      expect(result.data.body.variants).toBeUndefined();
    });

    it("updateProductSchema accepts empty variants array", () => {
      const result = updateProductSchema.safeParse({
        body: { variants: [] },
        params: { id: validProductId }
      });

      expect(result.success).toBe(true);
      expect(result.data.body.variants).toEqual([]);
    });
  });

  describe("Valid Variant Payloads & Normalization", () => {
    it("accepts a complete, valid variant with all fields and normalizes SKU / keys", () => {
      const result = createProductSchema.safeParse({
        body: {
          ...validBasePayload,
          variants: [
            {
              sku: "  sw-navy-xl  ",
              attributes: {
                "  Color  ": "  Navy   Blue  ",
                Size: "XL"
              },
              price: 1599,
              stock: 20,
              images: ["https://example.com/navy-xl.jpg"],
              isActive: true
            }
          ]
        },
        query: {},
        params: {}
      });

      expect(result.success).toBe(true);
      const variant = result.data.body.variants[0];
      expect(variant.sku).toBe("SW-NAVY-XL");
      expect(variant.attributes).toEqual({
        color: "Navy Blue",
        size: "XL"
      });
      expect(variant.price).toBe(1599);
      expect(variant.stock).toBe(20);
      expect(variant.images).toEqual(["https://example.com/navy-xl.jpg"]);
      expect(variant.isActive).toBe(true);
    });

    it("accepts a minimal variant with only required fields and nullable price", () => {
      const result = createProductSchema.safeParse({
        body: {
          ...validBasePayload,
          variants: [
            {
              sku: "SW-BASE-M",
              attributes: { size: "M" },
              price: null,
              stock: 0
            }
          ]
        },
        query: {},
        params: {}
      });

      expect(result.success).toBe(true);
      const variant = result.data.body.variants[0];
      expect(variant.sku).toBe("SW-BASE-M");
      expect(variant.price).toBeNull();
      expect(variant.stock).toBe(0);
      expect(variant.images).toBeUndefined();
      expect(variant.isActive).toBeUndefined();
    });

    it("preserves display casing of attribute values", () => {
      const result = createProductSchema.safeParse({
        body: {
          ...validBasePayload,
          variants: [
            {
              sku: "SW-RED-S",
              attributes: { shade: "Crimson Red (Limited Edition)" },
              stock: 5
            }
          ]
        },
        query: {},
        params: {}
      });

      expect(result.success).toBe(true);
      expect(result.data.body.variants[0].attributes.shade).toBe(
        "Crimson Red (Limited Edition)"
      );
    });

    it("accepts valid flexible attributes across different product categories", () => {
      const categoryTestCases = [
        {
          name: "Premium Oxford Shirt",
          category: "Apparel",
          variants: [
            {
              sku: "APP-OXF-WHT-L",
              attributes: { size: "L", color: "White", material: "100% Cotton" },
              stock: 25
            }
          ]
        },
        {
          name: "Pro Gaming Laptop",
          category: "Electronics",
          variants: [
            {
              sku: "ELEC-LAP-32-1TB",
              attributes: { ram: "32GB", storage: "1TB SSD", color: "Space Gray" },
              price: 129999,
              stock: 8
            }
          ]
        },
        {
          name: "Trail Running Shoes",
          category: "Footwear",
          variants: [
            {
              sku: "FOOT-TR-10-WIDE",
              attributes: { shoe_size: "10.5", width: "Wide", color: "Slate" },
              stock: 14
            }
          ]
        },
        {
          name: "Artisan Single-Origin Coffee",
          category: "Grocery",
          variants: [
            {
              sku: "COF-ETH-DRK-500G",
              attributes: { roast: "Dark Roast", grind: "Whole Bean", weight: "500g" },
              stock: 40
            }
          ]
        }
      ];

      for (const productData of categoryTestCases) {
        const result = createProductSchema.safeParse({
          body: {
            ...validBasePayload,
            name: productData.name,
            category: productData.category,
            variants: productData.variants
          },
          query: {},
          params: {}
        });

        expect(result.success).toBe(true);
        expect(result.data.body.variants[0].sku).toBe(productData.variants[0].sku);
      }
    });
  });

  describe("Variant Limits", () => {
    it("accepts exactly 50 variants", () => {
      const fiftyVariants = Array.from({ length: 50 }, (_, i) => ({
        sku: `SW-VAR-${i + 1}`,
        attributes: { option: `Option ${i + 1}` },
        stock: 5
      }));

      const result = createProductSchema.safeParse({
        body: {
          ...validBasePayload,
          variants: fiftyVariants
        },
        query: {},
        params: {}
      });

      expect(result.success).toBe(true);
      expect(result.data.body.variants.length).toBe(50);
    });

    it("rejects 51 variants exceeding limit", () => {
      const fiftyOneVariants = Array.from({ length: 51 }, (_, i) => ({
        sku: `SW-VAR-${i + 1}`,
        attributes: { option: `Option ${i + 1}` },
        stock: 5
      }));

      const result = createProductSchema.safeParse({
        body: {
          ...validBasePayload,
          variants: fiftyOneVariants
        },
        query: {},
        params: {}
      });

      expect(result.success).toBe(false);
      expect(
        result.error.issues.some(
          (issue) => issue.message === "A product cannot have more than 50 variants"
        )
      ).toBe(true);
    });

    it("accepts up to 5 attributes per variant", () => {
      const result = createProductSchema.safeParse({
        body: {
          ...validBasePayload,
          variants: [
            {
              sku: "SW-MULTI-5",
              attributes: {
                dim1: "Val1",
                dim2: "Val2",
                dim3: "Val3",
                dim4: "Val4",
                dim5: "Val5"
              },
              stock: 10
            }
          ]
        },
        query: {},
        params: {}
      });

      expect(result.success).toBe(true);
      expect(Object.keys(result.data.body.variants[0].attributes).length).toBe(5);
    });

    it("rejects 6 attributes on a variant", () => {
      const result = createProductSchema.safeParse({
        body: {
          ...validBasePayload,
          variants: [
            {
              sku: "SW-MULTI-6",
              attributes: {
                dim1: "Val1",
                dim2: "Val2",
                dim3: "Val3",
                dim4: "Val4",
                dim5: "Val5",
                dim6: "Val6"
              },
              stock: 10
            }
          ]
        },
        query: {},
        params: {}
      });

      expect(result.success).toBe(false);
      expect(
        result.error.issues.some(
          (issue) => issue.message === "A variant cannot have more than 5 attributes"
        )
      ).toBe(true);
    });
  });

  describe("Attribute Keys and Values Validation", () => {
    it("rejects attribute keys with invalid characters", () => {
      const result = createProductSchema.safeParse({
        body: {
          ...validBasePayload,
          variants: [
            {
              sku: "SW-INVALID-KEY",
              attributes: { "color!": "Blue" },
              stock: 5
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
            issue.path.join(".") === "body.variants.0.attributes.color!" &&
            issue.message.includes("is invalid")
        )
      ).toBe(true);
    });

    it("rejects empty attributes object", () => {
      const result = createProductSchema.safeParse({
        body: {
          ...validBasePayload,
          variants: [
            {
              sku: "SW-EMPTY-ATTRS",
              attributes: {},
              stock: 5
            }
          ]
        },
        query: {},
        params: {}
      });

      expect(result.success).toBe(false);
      expect(
        result.error.issues.some((issue) =>
          issue.message.includes("Variant attributes must contain at least one key-value pair")
        )
      ).toBe(true);
    });

    it("accepts attribute key of up to 30 characters and rejects 31 characters", () => {
      const valid30Key = "k".repeat(30);
      const validResult = createProductSchema.safeParse({
        body: {
          ...validBasePayload,
          variants: [
            {
              sku: "SW-30-KEY",
              attributes: { [valid30Key]: "Valid Value" },
              stock: 5
            }
          ]
        },
        query: {},
        params: {}
      });
      expect(validResult.success).toBe(true);

      const invalid31Key = "k".repeat(31);
      const invalidResult = createProductSchema.safeParse({
        body: {
          ...validBasePayload,
          variants: [
            {
              sku: "SW-31-KEY",
              attributes: { [invalid31Key]: "Valid Value" },
              stock: 5
            }
          ]
        },
        query: {},
        params: {}
      });
      expect(invalidResult.success).toBe(false);
      expect(
        invalidResult.error.issues.some((issue) => issue.message.includes("is invalid"))
      ).toBe(true);
    });

    it("rejects empty or whitespace-only attribute value", () => {
      const result = createProductSchema.safeParse({
        body: {
          ...validBasePayload,
          variants: [
            {
              sku: "SW-EMPTY-VAL",
              attributes: { size: "   " },
              stock: 5
            }
          ]
        },
        query: {},
        params: {}
      });

      expect(result.success).toBe(false);
      expect(
        result.error.issues.some((issue) =>
          issue.message.includes("between 1 and 50 characters")
        )
      ).toBe(true);
    });

    it("accepts attribute value of up to 50 characters and rejects 51 characters", () => {
      const valid50Val = "v".repeat(50);
      const validResult = createProductSchema.safeParse({
        body: {
          ...validBasePayload,
          variants: [
            {
              sku: "SW-50-VAL",
              attributes: { size: valid50Val },
              stock: 5
            }
          ]
        },
        query: {},
        params: {}
      });
      expect(validResult.success).toBe(true);

      const invalid51Val = "v".repeat(51);
      const invalidResult = createProductSchema.safeParse({
        body: {
          ...validBasePayload,
          variants: [
            {
              sku: "SW-51-VAL",
              attributes: { size: invalid51Val },
              stock: 5
            }
          ]
        },
        query: {},
        params: {}
      });
      expect(invalidResult.success).toBe(false);
      expect(
        invalidResult.error.issues.some((issue) =>
          issue.message.includes("between 1 and 50 characters")
        )
      ).toBe(true);
    });

    it("rejects non-string attribute values (number, boolean, array, object)", () => {
      const testCases = [123, true, ["red"], { hex: "#fff" }];

      for (const invalidVal of testCases) {
        const result = createProductSchema.safeParse({
          body: {
            ...validBasePayload,
            variants: [
              {
                sku: "SW-BAD-VAL",
                attributes: { color: invalidVal },
                stock: 5
              }
            ]
          },
          query: {},
          params: {}
        });

        expect(result.success).toBe(false);
        expect(
          result.error.issues.some((issue) =>
            issue.message.includes("must be a string")
          )
        ).toBe(true);
      }
    });

    it("rejects non-object attributes (array, string, null)", () => {
      const testCases = ["string", null, [1, 2, 3]];

      for (const invalidAttrs of testCases) {
        const result = createProductSchema.safeParse({
          body: {
            ...validBasePayload,
            variants: [
              {
                sku: "SW-BAD-ATTRS",
                attributes: invalidAttrs,
                stock: 5
              }
            ]
          },
          query: {},
          params: {}
        });

        expect(result.success).toBe(false);
      }
    });
  });

  describe("Duplicate Combinations & Duplicate SKUs", () => {
    it("rejects duplicate variant attribute combinations with identical casing", () => {
      const result = createProductSchema.safeParse({
        body: {
          ...validBasePayload,
          variants: [
            {
              sku: "SW-NAVY-M-1",
              attributes: { color: "Navy", size: "M" },
              stock: 10
            },
            {
              sku: "SW-NAVY-M-2",
              attributes: { color: "Navy", size: "M" },
              stock: 10
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
            issue.message === "Duplicate variant attribute combination found"
        )
      ).toBe(true);
    });

    it("rejects duplicate variant attribute combinations with different casing", () => {
      const result = createProductSchema.safeParse({
        body: {
          ...validBasePayload,
          variants: [
            {
              sku: "SW-RED-1",
              attributes: { Color: "Crimson Red" },
              stock: 10
            },
            {
              sku: "SW-RED-2",
              attributes: { color: "CRIMSON RED" },
              stock: 10
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
            issue.message === "Duplicate variant attribute combination found"
        )
      ).toBe(true);
    });

    it("rejects duplicate variant attribute combinations with different key ordering", () => {
      const result = createProductSchema.safeParse({
        body: {
          ...validBasePayload,
          variants: [
            {
              sku: "SW-COMB-1",
              attributes: { color: "Black", size: "L" },
              stock: 5
            },
            {
              sku: "SW-COMB-2",
              attributes: { size: "L", color: "Black" },
              stock: 5
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
            issue.message === "Duplicate variant attribute combination found"
        )
      ).toBe(true);
    });

    it("rejects duplicate SKUs within the same submitted variant array", () => {
      const result = createProductSchema.safeParse({
        body: {
          ...validBasePayload,
          variants: [
            {
              sku: "SW-DUPLICATE-SKU",
              attributes: { size: "S" },
              stock: 5
            },
            {
              sku: "  sw-duplicate-sku  ",
              attributes: { size: "M" },
              stock: 5
            }
          ]
        },
        query: {},
        params: {}
      });

      expect(result.success).toBe(false);
      expect(
        result.error.issues.some((issue) =>
          issue.message.includes("Duplicate SKU 'SW-DUPLICATE-SKU'")
        )
      ).toBe(true);
    });
  });

  describe("SKU Normalization & Format Rules", () => {
    it("trims and normalizes lowercase SKU to uppercase", () => {
      const result = createProductSchema.safeParse({
        body: {
          ...validBasePayload,
          variants: [
            {
              sku: "  sw-trim-lower-sku  ",
              attributes: { size: "M" },
              stock: 5
            }
          ]
        },
        query: {},
        params: {}
      });

      expect(result.success).toBe(true);
      expect(result.data.body.variants[0].sku).toBe("SW-TRIM-LOWER-SKU");
    });

    it("accepts alphanumeric characters, hyphens, and underscores in SKU", () => {
      const result = createProductSchema.safeParse({
        body: {
          ...validBasePayload,
          variants: [
            {
              sku: "ABC_123-XYZ_456",
              attributes: { size: "L" },
              stock: 10
            }
          ]
        },
        query: {},
        params: {}
      });

      expect(result.success).toBe(true);
      expect(result.data.body.variants[0].sku).toBe("ABC_123-XYZ_456");
    });

    it("rejects SKU with invalid characters (spaces, symbols)", () => {
      const invalidSkus = [
        "SW SKU WITH SPACES",
        "SW@SPECIAL",
        "SW#123",
        "SW.DOT",
        "SW$MONEY",
        "SW/SLASH"
      ];

      for (const badSku of invalidSkus) {
        const result = createProductSchema.safeParse({
          body: {
            ...validBasePayload,
            variants: [
              {
                sku: badSku,
                attributes: { size: "M" },
                stock: 5
              }
            ]
          },
          query: {},
          params: {}
        });

        expect(result.success).toBe(false);
        expect(
          result.error.issues.some((issue) =>
            issue.message.includes("letters, numbers, hyphens, and underscores")
          )
        ).toBe(true);
      }
    });

    it("rejects empty or whitespace-only SKU", () => {
      const emptySkus = ["", "   "];

      for (const emptySku of emptySkus) {
        const result = createProductSchema.safeParse({
          body: {
            ...validBasePayload,
            variants: [
              {
                sku: emptySku,
                attributes: { size: "M" },
                stock: 5
              }
            ]
          },
          query: {},
          params: {}
        });

        expect(result.success).toBe(false);
      }
    });
  });

  describe("Variant Identity & Strict Rules", () => {
    it("createProductSchema rejects client-supplied variantId", () => {
      const result = createProductSchema.safeParse({
        body: {
          ...validBasePayload,
          variants: [
            {
              variantId: "var_client_12345",
              sku: "SW-CLIENT-ID",
              attributes: { size: "S" },
              stock: 5
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
            issue.keys?.includes("variantId")
        )
      ).toBe(true);
    });

    it("updateProductSchema accepts optional variantId in valid shape", () => {
      const result = updateProductSchema.safeParse({
        body: {
          variants: [
            {
              variantId: "var_existing_12345",
              sku: "SW-EXISTING",
              attributes: { size: "L" },
              stock: 15
            }
          ]
        },
        params: { id: validProductId }
      });

      expect(result.success).toBe(true);
      expect(result.data.body.variants[0].variantId).toBe("var_existing_12345");
    });

    it("updateProductSchema accepts new variant without variantId during update", () => {
      const result = updateProductSchema.safeParse({
        body: {
          variants: [
            {
              sku: "SW-NEW-VARIANT",
              attributes: { size: "XXL" },
              stock: 8
            }
          ]
        },
        params: { id: validProductId }
      });

      expect(result.success).toBe(true);
      expect(result.data.body.variants[0].variantId).toBeUndefined();
    });

    it("updateProductSchema rejects empty or malformed variantId", () => {
      const result = updateProductSchema.safeParse({
        body: {
          variants: [
            {
              variantId: "   ",
              sku: "SW-BAD-VAR-ID",
              attributes: { size: "L" },
              stock: 15
            }
          ]
        },
        params: { id: validProductId }
      });

      expect(result.success).toBe(false);
      expect(
        result.error.issues.some((issue) =>
          issue.message.includes("variantId cannot be empty")
        )
      ).toBe(true);
    });

    it("updateProductSchema rejects variantId containing invalid characters or whitespace", () => {
      const badIds = ["var id with spaces", "var@bad!", "var#123", "var.dot"];

      for (const badId of badIds) {
        const result = updateProductSchema.safeParse({
          body: {
            variants: [
              {
                variantId: badId,
                sku: "SW-GOOD-SKU",
                attributes: { size: "L" },
                stock: 10
              }
            ]
          },
          params: { id: validProductId }
        });

        expect(result.success).toBe(false);
        expect(
          result.error.issues.some((issue) =>
            issue.message.includes("variantId can only contain letters, numbers, hyphens, and underscores")
          )
        ).toBe(true);
      }
    });

    it("rejects client-supplied MongoDB _id on create and update variants", () => {
      const createResult = createProductSchema.safeParse({
        body: {
          ...validBasePayload,
          variants: [
            {
              _id: "507f1f77bcf86cd799439011",
              sku: "SW-WITH-MONGO-ID",
              attributes: { size: "M" },
              stock: 5
            }
          ]
        },
        query: {},
        params: {}
      });

      expect(createResult.success).toBe(false);
      expect(
        createResult.error.issues.some(
          (issue) =>
            issue.code === "unrecognized_keys" && issue.keys?.includes("_id")
        )
      ).toBe(true);

      const updateResult = updateProductSchema.safeParse({
        body: {
          variants: [
            {
              _id: "507f1f77bcf86cd799439011",
              sku: "SW-WITH-MONGO-ID",
              attributes: { size: "M" },
              stock: 5
            }
          ]
        },
        params: { id: validProductId }
      });

      expect(updateResult.success).toBe(false);
      expect(
        updateResult.error.issues.some(
          (issue) =>
            issue.code === "unrecognized_keys" && issue.keys?.includes("_id")
        )
      ).toBe(true);
    });

    it("rejects arbitrary unknown fields on variant item", () => {
      const result = createProductSchema.safeParse({
        body: {
          ...validBasePayload,
          variants: [
            {
              sku: "SW-UNKNOWN-FIELD",
              attributes: { size: "M" },
              stock: 5,
              arbitraryField: "not-allowed"
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
            issue.keys?.includes("arbitraryField")
        )
      ).toBe(true);
    });
  });

  describe("Variant Field Type and Range Rules", () => {
    it("rejects negative variant price", () => {
      const result = createProductSchema.safeParse({
        body: {
          ...validBasePayload,
          variants: [
            {
              sku: "SW-NEG-PRICE",
              attributes: { size: "M" },
              price: -10,
              stock: 5
            }
          ]
        },
        query: {},
        params: {}
      });

      expect(result.success).toBe(false);
      expect(
        result.error.issues.some(
          (issue) => issue.message === "Variant price cannot be negative"
        )
      ).toBe(true);
    });

    it("rejects negative variant stock", () => {
      const result = createProductSchema.safeParse({
        body: {
          ...validBasePayload,
          variants: [
            {
              sku: "SW-NEG-STOCK",
              attributes: { size: "M" },
              stock: -1
            }
          ]
        },
        query: {},
        params: {}
      });

      expect(result.success).toBe(false);
      expect(
        result.error.issues.some(
          (issue) => issue.message === "Variant stock cannot be negative"
        )
      ).toBe(true);
    });

    it("rejects floating-point variant stock", () => {
      const result = createProductSchema.safeParse({
        body: {
          ...validBasePayload,
          variants: [
            {
              sku: "SW-FLOAT-STOCK",
              attributes: { size: "M" },
              stock: 2.5
            }
          ]
        },
        query: {},
        params: {}
      });

      expect(result.success).toBe(false);
      expect(
        result.error.issues.some(
          (issue) => issue.message === "Variant stock must be a whole number"
        )
      ).toBe(true);
    });

    it("rejects invalid URL in variant images array", () => {
      const result = createProductSchema.safeParse({
        body: {
          ...validBasePayload,
          variants: [
            {
              sku: "SW-BAD-IMAGE",
              attributes: { size: "M" },
              stock: 5,
              images: ["invalid-image-url"]
            }
          ]
        },
        query: {},
        params: {}
      });

      expect(result.success).toBe(false);
      expect(
        result.error.issues.some(
          (issue) => issue.message === "Each variant image must be a valid URL"
        )
      ).toBe(true);
    });

    it("rejects non-boolean isActive on variant", () => {
      const result = createProductSchema.safeParse({
        body: {
          ...validBasePayload,
          variants: [
            {
              sku: "SW-BAD-ISACTIVE",
              attributes: { size: "M" },
              stock: 5,
              isActive: "yes"
            }
          ]
        },
        query: {},
        params: {}
      });

      expect(result.success).toBe(false);
      expect(
        result.error.issues.some(
          (issue) => issue.message === "isActive must be a boolean"
        )
      ).toBe(true);
    });

    it("rejects non-finite variant price (Infinity)", () => {
      const result = createProductSchema.safeParse({
        body: {
          ...validBasePayload,
          variants: [
            {
              sku: "SW-INF-PRICE",
              attributes: { size: "M" },
              price: Infinity,
              stock: 5
            }
          ]
        },
        query: {},
        params: {}
      });

      expect(result.success).toBe(false);
      expect(
        result.error.issues.some((issue) =>
          issue.path.join(".") === "body.variants.0.price"
        )
      ).toBe(true);
    });

    it("rejects non-finite variant stock (Infinity)", () => {
      const result = createProductSchema.safeParse({
        body: {
          ...validBasePayload,
          variants: [
            {
              sku: "SW-INF-STOCK",
              attributes: { size: "M" },
              stock: Infinity
            }
          ]
        },
        query: {},
        params: {}
      });

      expect(result.success).toBe(false);
      expect(
        result.error.issues.some((issue) =>
          issue.path.join(".") === "body.variants.0.stock"
        )
      ).toBe(true);
    });
  });
});
