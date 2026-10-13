import { z } from "zod";

const variantIdField = z
  .string({ invalid_type_error: "Variant ID must be a string" })
  .trim()
  .regex(
    /^var_[A-Za-z0-9_-]{1,59}$/,
    "Invalid variant ID format"
  )
  .nullable()
  .optional()
  .transform((val) => val ?? null);

const mergeCartItemSchema = z
  .object({
    productId: z
      .string()
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid product ID"),
    variantId: variantIdField,
    quantity: z
      .number({ invalid_type_error: "Quantity must be a number" })
      .int("Quantity must be an integer")
      .min(1, "Quantity must be at least 1")
      .max(99, "Quantity cannot exceed 99")
  })
  .strict("Unsupported fields in item");

const mergeCartSchema = z.object({
  body: z
    .object({
      items: z
        .array(mergeCartItemSchema)
        .min(1, "Items array must contain at least 1 item")
        .max(30, "Cannot merge more than 30 items")
        .refine(
          (items) => {
            const seen = new Set();
            for (const item of items) {
              const vId = item.variantId ?? "null";
              const key = `${item.productId}:${vId}`;
              if (seen.has(key)) {
                return false;
              }
              seen.add(key);
            }
            return true;
          },
          {
            message: "Duplicate items are not allowed in merge payload"
          }
        )
    })
    .strict("Unsupported fields in request body"),
  query: z.object({}),
  params: z.object({})
});

export default mergeCartSchema;
