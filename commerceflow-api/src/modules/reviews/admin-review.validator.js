import { z } from "zod";

export const reviewIdParamSchema = z.object({
  body: z.object({}).optional(),
  query: z.object({}).optional(),
  params: z.object({
    id: z
      .string({ required_error: "Review ID is required" })
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid review ID format")
  })
});

export const getAdminReviewsSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({}).optional(),
  query: z
    .object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(10),
      status: z.enum(["all", "published", "hidden", "flagged"]).default("all"),
      rating: z.coerce.number().int().min(1).max(5).optional(),
      search: z.string().trim().max(100).optional(),
      sortBy: z.enum(["createdAt", "rating", "updatedAt"]).default("createdAt"),
      sortOrder: z.enum(["asc", "desc"]).default("desc")
    })
    .default({})
});

export const updateAdminReviewStatusSchema = z.object({
  params: z.object({
    id: z
      .string({ required_error: "Review ID is required" })
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid review ID format")
  }),
  query: z.object({}).optional(),
  body: z.object({
    status: z.enum(["published", "hidden", "flagged"], {
      required_error: "Review status is required"
    })
  })
});

export const productIdParamSchema = z.object({
  body: z.object({}).optional(),
  query: z.object({}).optional(),
  params: z.object({
    productId: z
      .string({ required_error: "Product ID is required" })
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid product ID format")
  })
});
