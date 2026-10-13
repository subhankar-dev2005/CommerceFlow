import { z } from "zod";

/**
 * Shared optional variantId field.
 *
 * Accepts the server-generated format: `var_` followed by a UUID or other
 * alphanumeric suffix (max 64 chars total, same ceiling as the product model).
 * Absent or null/undefined values are treated as "no variant" (simple product).
 */
const variantIdField = z
  .string()
  .trim()
  .regex(
    /^var_[A-Za-z0-9_-]{1,59}$/,
    "Invalid variant ID format"
  )
  .optional()
  .nullable();

const addToCartSchema = z.object({
  body: z.object({
    productId: z
      .string()
      .regex(
        /^[0-9a-fA-F]{24}$/,
        "Invalid product ID"
      ),

    variantId: variantIdField,

    quantity: z
      .number()
      .int()
      .min(
        1,
        "Quantity must be at least 1"
      )
  }),

  query: z.object({}),

  params: z.object({})
});

const updateCartItemSchema = z.object({
  body: z.object({
    variantId: variantIdField,

    quantity: z
      .number()
      .int()
      .min(
        1,
        "Quantity must be at least 1"
      )
  }),

  query: z.object({}),

  params: z.object({
    productId: z
      .string()
      .regex(
        /^[0-9a-fA-F]{24}$/,
        "Invalid product ID"
      )
  })
});

const removeCartItemSchema = z.object({
  body: z.object({}).optional(),

  query: z.object({
    variantId: variantIdField
  }),

  params: z.object({
    productId: z
      .string()
      .regex(
        /^[0-9a-fA-F]{24}$/,
        "Invalid product ID"
      )
  })
});

export {
  addToCartSchema,
  updateCartItemSchema,
  removeCartItemSchema
};
