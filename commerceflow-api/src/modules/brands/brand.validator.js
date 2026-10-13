import { z } from "zod";

export const brandIdSchema = z.object({
  body: z.object({}).optional(),
  query: z.object({}).optional(),
  params: z.object({
    id: z
      .string()
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid brand ID format")
  })
});

export const getBrandsQuerySchema = z.object({
  body: z.object({}).optional(),
  params: z.object({}).optional(),
  query: z
    .object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(10),
      search: z.string().trim().max(100).optional(),
      status: z.enum(["all", "active", "inactive"]).default("all"),
      sortBy: z.enum(["name", "createdAt", "updatedAt"]).default("name"),
      sortOrder: z.enum(["asc", "desc"]).default("asc")
    })
    .default({})
});

export const createBrandSchema = z.object({
  params: z.object({}).optional(),
  query: z.object({}).optional(),
  body: z.object({
    name: z
      .string({ required_error: "Brand name is required" })
      .trim()
      .min(2, "Brand name must contain at least 2 characters")
      .max(100, "Brand name cannot exceed 100 characters"),
    slug: z
      .string()
      .trim()
      .min(2, "Brand slug must contain at least 2 characters")
      .max(100, "Brand slug cannot exceed 100 characters")
      .regex(/^[a-z0-9-]+$/, "Slug must contain only lowercase letters, numbers, and hyphens")
      .optional(),
    description: z.string().trim().max(1000).optional().default(""),
    website: z.preprocess(
      (val) => (val === "" ? null : val),
      z.string().trim().url("Website must be a valid URL").optional().nullable()
    ),
    logo: z.preprocess(
      (val) => (val === "" ? null : val),
      z.string().trim().url("Logo must be a valid URL").optional().nullable()
    ),
    isActive: z.boolean().optional().default(true)
  })
});

export const updateBrandSchema = z.object({
  params: z.object({
    id: z
      .string()
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid brand ID format")
  }),
  query: z.object({}).optional(),
  body: z
    .object({
      name: z
        .string()
        .trim()
        .min(2, "Brand name must contain at least 2 characters")
        .max(100, "Brand name cannot exceed 100 characters")
        .optional(),
      slug: z
        .string()
        .trim()
        .min(2, "Brand slug must contain at least 2 characters")
        .max(100, "Brand slug cannot exceed 100 characters")
        .regex(/^[a-z0-9-]+$/, "Slug must contain only lowercase letters, numbers, and hyphens")
        .optional(),
      description: z.string().trim().max(1000).optional(),
      website: z.preprocess(
        (val) => (val === "" ? null : val),
        z.string().trim().url("Website must be a valid URL").optional().nullable()
      ),
      logo: z.preprocess(
        (val) => (val === "" ? null : val),
        z.string().trim().url("Logo must be a valid URL").optional().nullable()
      ),
      isActive: z.boolean().optional()
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field must be provided for update"
    })
});
