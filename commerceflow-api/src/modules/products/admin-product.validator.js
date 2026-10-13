import { z } from "zod";

export const getAdminProductsSchema = z.object({
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
      .max(100, "Limit cannot exceed 100")
      .default(10),

    search: z
      .string({ invalid_type_error: "Search must be a string" })
      .trim()
      .max(100, "Search query cannot exceed 100 characters")
      .optional(),

    category: z
      .string({ invalid_type_error: "Category must be a string" })
      .trim()
      .max(100, "Category cannot exceed 100 characters")
      .optional(),

    status: z
      .enum(["all", "active", "inactive"], {
        message: "Status must be 'all', 'active', or 'inactive'"
      })
      .default("all"),

    stock: z
      .enum(["all", "inStock", "outOfStock", "lowStock"], {
        message: "Stock filter must be 'all', 'inStock', 'outOfStock', or 'lowStock'"
      })
      .default("all"),

    hasVariants: z
      .enum(["all", "true", "false"], {
        message: "hasVariants must be 'all', 'true', or 'false'"
      })
      .default("all"),

    sortBy: z
      .enum(["createdAt", "price", "name", "stock"], {
        message: "sortBy must be 'createdAt', 'price', 'name', or 'stock'"
      })
      .default("createdAt"),

    sortOrder: z
      .enum(["asc", "desc"], {
        message: "sortOrder must be 'asc' or 'desc'"
      })
      .default("desc"),

    sort: z
      .enum([
        "newest",
        "oldest",
        "price_asc",
        "price_desc",
        "name_asc",
        "name_desc",
        "stock_asc",
        "stock_desc"
      ])
      .optional()
  }),

  params: z.object({}).optional()
});

export const updateProductStatusSchema = z.object({
  body: z.object({
    isActive: z.boolean({
      required_error: "isActive boolean is required",
      invalid_type_error: "isActive must be a boolean"
    })
  }),

  params: z.object({
    id: z
      .string()
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid product ID")
  }),

  query: z.object({}).optional()
});
