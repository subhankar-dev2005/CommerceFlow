import { z } from "zod";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const createReviewSchema = z.object({
  body: z
    .object({
      rating: z
        .number({
          required_error: "Rating is required",
          invalid_type_error: "Rating must be a number"
        })
        .int("Rating must be a whole number")
        .min(1, "Rating must be at least 1")
        .max(5, "Rating cannot exceed 5"),

      title: z
        .string({
          invalid_type_error: "Title must be a string"
        })
        .trim()
        .max(100, "Title cannot exceed 100 characters")
        .optional(),

      body: z
        .string({
          required_error: "Review body is required",
          invalid_type_error: "Review body must be a string"
        })
        .trim()
        .min(5, "Review body must contain at least 5 characters")
        .max(2000, "Review body cannot exceed 2000 characters")
    })
    .strict("Unsupported fields in review payload"),

  query: z.object({}).optional(),

  params: z
    .object({
      productId: z
        .string()
        .regex(objectIdRegex, "Invalid product ID")
        .optional()
    })
    .optional()
});

const updateReviewSchema = z.object({
  body: z
    .object({
      rating: z
        .number({
          invalid_type_error: "Rating must be a number"
        })
        .int("Rating must be a whole number")
        .min(1, "Rating must be at least 1")
        .max(5, "Rating cannot exceed 5")
        .optional(),

      title: z
        .string({
          invalid_type_error: "Title must be a string"
        })
        .trim()
        .max(100, "Title cannot exceed 100 characters")
        .optional(),

      body: z
        .string({
          invalid_type_error: "Review body must be a string"
        })
        .trim()
        .min(5, "Review body must contain at least 5 characters")
        .max(2000, "Review body cannot exceed 2000 characters")
        .optional()
    })
    .strict("Unsupported fields in review update payload")
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field is required to update"
    }),

  query: z.object({}).optional(),

  params: z
    .object({
      productId: z
        .string()
        .regex(objectIdRegex, "Invalid product ID")
        .optional(),
      reviewId: z
        .string()
        .regex(objectIdRegex, "Invalid review ID")
        .optional()
    })
    .optional()
});

const reviewQuerySchema = z.object({
  body: z.object({}).optional(),

  query: z.object({
    page: z.coerce
      .number({ invalid_type_error: "Page must be a number" })
      .int("Page must be an integer")
      .min(1, "Page must be at least 1")
      .default(1),

    limit: z.coerce
      .number({ invalid_type_error: "Limit must be a number" })
      .int("Limit must be an integer")
      .min(1, "Limit must be at least 1")
      .max(50, "Limit cannot exceed 50")
      .default(10),

    rating: z.coerce
      .number({ invalid_type_error: "Rating must be a number" })
      .int("Rating must be an integer")
      .min(1, "Rating must be at least 1")
      .max(5, "Rating cannot exceed 5")
      .optional(),

    sortBy: z
      .enum(["createdAt", "rating"], {
        message: "Invalid sort field"
      })
      .default("createdAt"),

    sortOrder: z
      .enum(["asc", "desc"], {
        message: "Invalid sort order"
      })
      .default("desc")
  }),

  params: z
    .object({
      productId: z
        .string()
        .regex(objectIdRegex, "Invalid product ID")
        .optional()
    })
    .optional()
});

const reviewIdParamSchema = z.object({
  body: z.object({}).optional(),
  query: z.object({}).optional(),
  params: z.object({
    reviewId: z
      .string({
        required_error: "Review ID is required",
        invalid_type_error: "Review ID must be a string"
      })
      .regex(objectIdRegex, "Invalid review ID")
  })
});

const reviewProductIdParamSchema = z.object({
  body: z.object({}).optional(),
  query: z.object({}).optional(),
  params: z.object({
    productId: z
      .string({
        required_error: "Product ID is required",
        invalid_type_error: "Product ID must be a string"
      })
      .regex(objectIdRegex, "Invalid product ID")
  })
});

const reviewParamsSchema = z.object({
  body: z.object({}).optional(),
  query: z.object({}).optional(),
  params: z.object({
    productId: z
      .string({
        required_error: "Product ID is required",
        invalid_type_error: "Product ID must be a string"
      })
      .regex(objectIdRegex, "Invalid product ID"),
    reviewId: z
      .string({
        required_error: "Review ID is required",
        invalid_type_error: "Review ID must be a string"
      })
      .regex(objectIdRegex, "Invalid review ID")
  })
});

export {
  createReviewSchema,
  updateReviewSchema,
  reviewQuerySchema,
  reviewIdParamSchema,
  reviewProductIdParamSchema,
  reviewParamsSchema
};
export default createReviewSchema;
