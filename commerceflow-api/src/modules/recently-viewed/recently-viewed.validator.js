import { z } from "zod";
import {
  DEFAULT_RECENTLY_VIEWED_LIMIT,
  MAX_RECENTLY_VIEWED_LIMIT,
  MAX_STORED_RECENTLY_VIEWED
} from "./recently-viewed.constants.js";

const MONGO_OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

/**
 * recordProductViewSchema
 * Validates request to record or update a product view.
 * Consumes: POST /api/v1/recently-viewed
 */
export const recordProductViewSchema = z.object({
  body: z
    .object({
      productId: z
        .string({
          required_error: "productId is required",
          invalid_type_error: "productId must be a string"
        })
        .regex(MONGO_OBJECT_ID_REGEX, "Invalid product ID")
    })
    .strict("Unsupported fields in request body"),

  query: z.object({}).optional(),
  params: z.object({}).optional()
});

/**
 * getRecentlyViewedQuerySchema
 * Validates query parameters when retrieving customer recently viewed items.
 * Consumes: GET /api/v1/recently-viewed
 */
export const getRecentlyViewedQuerySchema = z.object({
  body: z.object({}).optional(),
  query: z.object({
    limit: z.coerce
      .number({ invalid_type_error: "Limit must be a number" })
      .int("Limit must be an integer")
      .min(1, "Limit must be at least 1")
      .max(
        MAX_RECENTLY_VIEWED_LIMIT,
        `Limit cannot exceed ${MAX_RECENTLY_VIEWED_LIMIT}`
      )
      .default(DEFAULT_RECENTLY_VIEWED_LIMIT)
  }),
  params: z.object({}).optional()
});

/**
 * mergeRecentlyViewedSchema
 * Validates payload when synchronizing guest recently viewed history upon login.
 * Consumes: POST /api/v1/recently-viewed/merge
 */
export const mergeRecentlyViewedSchema = z.object({
  body: z
    .object({
      productIds: z
        .array(
          z
            .string({ invalid_type_error: "Product ID must be a string" })
            .regex(MONGO_OBJECT_ID_REGEX, "Invalid product ID"),
          {
            required_error: "productIds is required",
            invalid_type_error: "productIds must be an array"
          }
        )
        .min(1, "productIds array cannot be empty")
        .max(
          MAX_STORED_RECENTLY_VIEWED,
          `productIds array cannot exceed ${MAX_STORED_RECENTLY_VIEWED} items`
        )
    })
    .strict("Unsupported fields in request body"),

  query: z.object({}).optional(),
  params: z.object({}).optional()
});

export default {
  recordProductViewSchema,
  getRecentlyViewedQuerySchema,
  mergeRecentlyViewedSchema
};
