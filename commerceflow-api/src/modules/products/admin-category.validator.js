import { z } from "zod";

export const getAdminCategoriesSchema = z.object({
  body: z.object({}).optional(),
  query: z
    .object({
      search: z.string().trim().max(100).optional(),
      sortBy: z.enum(["name", "totalProducts", "activeProducts", "totalStock"]).default("name"),
      sortOrder: z.enum(["asc", "desc"]).default("asc")
    })
    .default({}),
  params: z.object({}).optional()
});

export const updateAdminCategorySchema = z.object({
  params: z.object({
    name: z
      .string()
      .trim()
      .min(1, "Category name is required")
      .max(100)
      .refine((val) => !val.includes("/"), { message: "Category name cannot contain '/'" })
  }),
  body: z.object({
    newName: z
      .string({ required_error: "New category name is required" })
      .trim()
      .min(2, "New category name must contain at least 2 characters")
      .max(50, "New category name cannot exceed 50 characters")
      .refine((val) => !val.includes("/"), { message: "Category name cannot contain '/'" })
  }),
  query: z.object({}).optional()
});

export const deleteAdminCategorySchema = z.object({
  params: z.object({
    name: z
      .string()
      .trim()
      .min(1, "Category name is required")
      .max(100)
      .refine((val) => !val.includes("/"), { message: "Category name cannot contain '/'" })
  }),
  body: z.object({}).optional(),
  query: z
    .object({
      cascade: z.enum(["true", "false"]).optional()
    })
    .default({})
});
