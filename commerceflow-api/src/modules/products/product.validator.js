import { z } from "zod";

export const SKU_REGEX = /^[a-zA-Z0-9_-]+$/;
const ATTRIBUTE_KEY_REGEX = /^[a-z0-9_-]{1,30}$/;

export const collapseWhitespace = (str) =>
  typeof str === "string" ? str.trim().replace(/\s+/g, " ") : str;

export function getCanonicalVariantSignature(attributes) {
  if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) {
    return "";
  }
  const normalizedEntries = Object.entries(attributes).map(([k, v]) => [
    k.trim().toLowerCase(),
    typeof v === "string"
      ? collapseWhitespace(v).toLowerCase()
      : String(v).trim().toLowerCase()
  ]);

  normalizedEntries.sort((a, b) => a[0].localeCompare(b[0]));

  return normalizedEntries.map(([k, v]) => `${k}:${v}`).join("|");
}

export const variantAttributesSchema = z
  .record(z.string(), z.unknown(), {
    invalid_type_error: "Variant attributes must be an object of key-value pairs"
  })
  .superRefine((attrs, ctx) => {
    if (attrs === null || typeof attrs !== "object" || Array.isArray(attrs)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Variant attributes must be an object of key-value pairs"
      });
      return;
    }

    const entries = Object.entries(attrs);
    if (entries.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Variant attributes must contain at least one key-value pair"
      });
      return;
    }

    if (entries.length > 5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A variant cannot have more than 5 attributes"
      });
    }

    const seenNormalizedKeys = new Set();

    for (const [rawKey, rawVal] of entries) {
      const normalizedKey = rawKey.trim().toLowerCase();

      if (!ATTRIBUTE_KEY_REGEX.test(normalizedKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Attribute key '${rawKey}' is invalid. Keys must be 1-30 characters containing only letters, numbers, underscores, or hyphens`,
          path: [rawKey]
        });
      }

      if (seenNormalizedKeys.has(normalizedKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate attribute key '${rawKey}'`,
          path: [rawKey]
        });
      }
      seenNormalizedKeys.add(normalizedKey);

      if (typeof rawVal !== "string") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Attribute value for '${rawKey}' must be a string`,
          path: [rawKey]
        });
        continue;
      }

      const collapsed = collapseWhitespace(rawVal);
      if (collapsed.length < 1 || collapsed.length > 50) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Attribute value for '${rawKey}' must be between 1 and 50 characters`,
          path: [rawKey]
        });
      }
    }
  })
  .transform((attrs) => {
    if (!attrs || typeof attrs !== "object" || Array.isArray(attrs)) {
      return {};
    }
    const normalized = {};
    for (const [rawKey, rawVal] of Object.entries(attrs)) {
      if (typeof rawVal === "string") {
        normalized[rawKey.trim().toLowerCase()] = collapseWhitespace(rawVal);
      }
    }
    return normalized;
  });

export const createVariantSchema = z
  .object({
    sku: z
      .string({
        required_error: "Variant SKU is required",
        invalid_type_error: "Variant SKU must be a string"
      })
      .trim()
      .min(1, "Variant SKU cannot be empty")
      .max(100, "Variant SKU cannot exceed 100 characters")
      .regex(
        SKU_REGEX,
        "Variant SKU can only contain letters, numbers, hyphens, and underscores"
      )
      .transform((val) => val.toUpperCase()),

    attributes: variantAttributesSchema,

    price: z
      .number({ invalid_type_error: "Variant price must be a number" })
      .finite("Variant price must be a finite number")
      .min(0, "Variant price cannot be negative")
      .nullable()
      .optional(),

    stock: z
      .number({
        required_error: "Variant stock is required",
        invalid_type_error: "Variant stock must be a number"
      })
      .int("Variant stock must be a whole number")
      .min(0, "Variant stock cannot be negative"),

    images: z
      .array(
        z
          .string({ invalid_type_error: "Variant image URL must be a string" })
          .trim()
          .url("Each variant image must be a valid URL")
      )
      .optional(),

    isActive: z
      .boolean({ message: "isActive must be a boolean" })
      .optional()
  })
  .strict("Unsupported fields in variant item");

export function validateVariantArray(variants, ctx) {
  if (!Array.isArray(variants) || variants.length === 0) return;

  const skuSet = new Set();
  const signatureSet = new Set();

  for (let i = 0; i < variants.length; i++) {
    const variant = variants[i];
    if (!variant || typeof variant !== "object") continue;

    // Check duplicate SKU within the submitted array
    if (typeof variant.sku === "string") {
      const normalizedSku = variant.sku.trim().toUpperCase();
      if (normalizedSku) {
        if (skuSet.has(normalizedSku)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Duplicate SKU '${normalizedSku}' found in variants`,
            path: [i, "sku"]
          });
        }
        skuSet.add(normalizedSku);
      }
    }

    // Check duplicate attribute combination
    if (variant.attributes && typeof variant.attributes === "object") {
      const signature = getCanonicalVariantSignature(variant.attributes);
      if (signatureSet.has(signature)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Duplicate variant attribute combination found",
          path: [i, "attributes"]
        });
      }
      signatureSet.add(signature);
    }
  }
}

const createProductSchema = z.object({
  body: z.object({
    name: z
      .string()
      .trim()
      .min(
        2,
        "Product name must contain at least 2 characters"
      )
      .max(
        200,
        "Product name cannot exceed 200 characters"
      ),

    description: z
      .string()
      .trim()
      .min(
        10,
        "Description must contain at least 10 characters"
      ),

    price: z
      .number()
      .min(
        0,
        "Price cannot be negative"
      ),

    stock: z
      .number()
      .int(
        "Stock must be a whole number"
      )
      .min(
        0,
        "Stock cannot be negative"
      ),

    category: z
      .string()
      .trim()
      .min(
        2,
        "Category must contain at least 2 characters"
      )
      .refine((val) => !val.includes("/"), {
        message: "Category name cannot contain '/'"
      }),

    image: z
      .string()
      .trim()
      .url(
        "Image must be a valid URL"
      )
      .optional(),

    images: z
      .array(
        z
          .string()
          .trim()
          .url("Each image must be a valid URL")
      )
      .optional(),

    specifications: z
      .array(
        z
          .object({
            label: z
              .string()
              .trim()
              .min(1, "Specification label is required")
              .max(60, "Specification label cannot exceed 60 characters"),
            value: z
              .string()
              .trim()
              .min(1, "Specification value is required")
              .max(300, "Specification value cannot exceed 300 characters")
          })
          .strict("Unsupported fields in specification item")
      )
      .max(30, "A product cannot have more than 30 specifications")
      .optional(),

    variants: z
      .array(createVariantSchema)
      .max(50, "A product cannot have more than 50 variants")
      .superRefine(validateVariantArray)
      .optional()
  }),

  query: z.object({}),

  params: z.object({})
});

export default createProductSchema;