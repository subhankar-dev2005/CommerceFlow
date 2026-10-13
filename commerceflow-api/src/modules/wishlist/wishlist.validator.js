import { z } from "zod";

/*
 * addWishlistItemSchema
 *
 * Validates the body for POST /api/v1/wishlist/items.
 *
 * Rules:
 *  - productId is required
 *  - productId must be a valid 24-character hexadecimal MongoDB ObjectId
 *  - No additional fields accepted (strict)
 *  - No userId, quantity, price, or product metadata accepted
 */
const addWishlistItemSchema = z.object({
  body: z
    .object({
      productId: z
        .string()
        .regex(
          /^[0-9a-fA-F]{24}$/,
          "Invalid product ID"
        )
    })
    .strict("Unsupported fields in request body"),

  query: z.object({}),

  params: z.object({})
});

/*
 * wishlistProductIdParamSchema
 *
 * Validates the :productId route param for
 * DELETE /api/v1/wishlist/items/:productId
 */
const wishlistProductIdParamSchema = z.object({
  body: z.object({}).optional(),

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

export {
  addWishlistItemSchema,
  wishlistProductIdParamSchema
};
