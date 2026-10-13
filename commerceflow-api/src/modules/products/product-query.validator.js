
import { z } from "zod";

const productQuerySchema = z.object({
  body: z.object({}).optional(),

  query: z.object({
    page: z.coerce
      .number()
      .int()
      .min(1)
      .default(1),

    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(10),

    search: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .optional(),

    category: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .optional(),

    inStock: z
      .enum(["true", "false"])
      .optional(),

    minPrice: z.coerce
      .number()
      .min(0)
      .optional(),

    maxPrice: z.coerce
      .number()
      .min(0)
      .optional(),

    sortBy: z
      .enum(["price", "createdAt", "name"])
      .optional(),

    sortOrder: z
      .enum(["asc", "desc"])
      .optional()
  }),

  params: z.object({}).optional()
});

export default productQuerySchema;
