import { z } from "zod";

/**
 * Zod validation schema for applying a coupon to the customer's cart.
 *
 * Rules:
 * - Accepts `couponCode` (or `code` as alias)
 * - Strict rejection of unknown / injection fields (couponId, discount, total, usedCount, etc.)
 * - Code length: 3 to 20 characters
 * - Regex: letters, numbers, hyphens, and underscores only
 */
const applyCouponSchema = z.object({
  body: z
    .object({
      couponCode: z
        .string({
          message: "Coupon code must be a string"
        })
        .trim()
        .min(3, "Coupon code must contain at least 3 characters")
        .max(20, "Coupon code cannot exceed 20 characters")
        .regex(
          /^[A-Za-z0-9_-]+$/,
          "Coupon code can only contain letters, numbers, hyphens, and underscores"
        )
        .optional(),

      code: z
        .string({
          message: "Coupon code must be a string"
        })
        .trim()
        .min(3, "Coupon code must contain at least 3 characters")
        .max(20, "Coupon code cannot exceed 20 characters")
        .regex(
          /^[A-Za-z0-9_-]+$/,
          "Coupon code can only contain letters, numbers, hyphens, and underscores"
        )
        .optional()
    })
    .strict("Unsupported fields in coupon payload")
    .superRefine((data, ctx) => {
      if (!data.couponCode && !data.code) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["couponCode"],
          message: "Coupon code is required"
        });
      }
    })
    .transform((data) => ({
      couponCode: data.couponCode || data.code
    })),

  query: z.object({}).optional(),
  params: z.object({}).optional()
});

const removeCouponSchema = z.object({
  body: z.object({}).optional(),
  query: z.object({}).optional(),
  params: z.object({}).optional()
});

export default applyCouponSchema;
export { applyCouponSchema, removeCouponSchema };
