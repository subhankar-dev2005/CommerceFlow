import { z } from "zod";
import {
  SKU_REGEX,
  variantAttributesSchema,
  validateVariantArray
} from "./product.validator.js";

export const updateVariantSchema = z
  .object({
    variantId: z
      .string({ invalid_type_error: "variantId must be a string" })
      .trim()
      .min(1, "variantId cannot be empty")
      .max(64, "variantId cannot exceed 64 characters")
      .regex(
        /^[a-zA-Z0-9_-]+$/,
        "variantId can only contain letters, numbers, hyphens, and underscores"
      )
      .optional(),

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

const updateProductSchema = z.object({
  body: z
    .object({
      name: z
        .string()
        .trim()
        .min(2, "Product name must contain at least 2 characters")
        .max(200, "Product name cannot exceed 200 characters")
        .optional(),

      description: z
        .string()
        .trim()
        .min(10, "Description must contain at least 10 characters")
        .optional(),

      price: z
        .number()
        .min(0, "Price cannot be negative")
        .optional(),

      stock: z
        .number()
        .int("Stock must be a whole number")
        .min(0, "Stock cannot be negative")
        .optional(),

      category: z
        .string()
        .trim()
        .min(2, "Category must contain at least 2 characters")
        .refine((val) => !val.includes("/"), {
          message: "Category name cannot contain '/'"
        })
        .optional(),

      image: z
        .string()
        .trim()
        .url("Image must be a valid URL")
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

      isActive: z
        .boolean()
        .optional(),

      variants: z
        .array(updateVariantSchema)
        .max(50, "A product cannot have more than 50 variants")
        .superRefine(validateVariantArray)
        .optional()
    })
    .strict("Unsupported fields in update payload")
    .refine(
      (data) => Object.keys(data).length > 0,
      {
        message: "At least one field is required to update"
      }
    ),

  query: z.object({}).optional(),

  params: z.object({
    id: z
      .string()
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid product ID")
  })
});

export default updateProductSchema;