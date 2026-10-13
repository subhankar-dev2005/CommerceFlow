import { z } from "zod";

export const getAdminUsersSchema = z.object({
  query: z.object({
    page: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : 1))
      .refine((val) => !isNaN(val) && val >= 1, {
        message: "Page must be a positive integer"
      }),

    limit: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : 10))
      .refine((val) => !isNaN(val) && val >= 1 && val <= 50, {
        message: "Limit must be between 1 and 50"
      }),

    search: z
      .string()
      .trim()
      .max(100, "Search term cannot exceed 100 characters")
      .optional(),

    role: z
      .enum(["all", "admin", "customer"], {
        errorMap: () => ({ message: "Role filter must be 'all', 'admin', or 'customer'" })
      })
      .optional()
      .default("all"),

    status: z
      .enum(["all", "active", "inactive"], {
        errorMap: () => ({ message: "Status must be 'all', 'active', or 'inactive'" })
      })
      .optional()
      .default("all"),

    sortBy: z
      .enum(["createdAt", "name", "email", "role"], {
        errorMap: () => ({ message: "Sort by must be 'createdAt', 'name', 'email', or 'role'" })
      })
      .optional()
      .default("createdAt"),

    sortOrder: z
      .enum(["asc", "desc"], {
        errorMap: () => ({ message: "Sort order must be 'asc' or 'desc'" })
      })
      .optional()
      .default("desc")
  }),

  body: z.object({}).optional(),
  params: z.object({}).optional()
});

export const createAdminUserSchema = z.object({
  body: z.object({
    name: z
      .string()
      .trim()
      .min(2, "Name must contain at least 2 characters")
      .max(100, "Name cannot exceed 100 characters"),

    email: z
      .string()
      .trim()
      .email("Please provide a valid email address")
      .toLowerCase(),

    password: z
      .string()
      .min(6, "Password must contain at least 6 characters")
      .max(128, "Password cannot exceed 128 characters")
  }),

  query: z.object({}).optional(),
  params: z.object({}).optional()
});

export const userIdParamSchema = z.object({
  params: z.object({
    userId: z
      .string()
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid user ID format")
  }),

  body: z.object({}).optional(),
  query: z.object({}).optional()
});

export const updateUserStatusSchema = z.object({
  params: z.object({
    userId: z
      .string()
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid user ID format")
  }),

  body: z.object({
    isActive: z.boolean({
      required_error: "isActive status boolean is required",
      invalid_type_error: "isActive must be a boolean"
    })
  }),

  query: z.object({}).optional()
});

export const updateUserRoleSchema = z.object({
  params: z.object({
    userId: z
      .string()
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid user ID format")
  }),

  body: z.object({
    role: z.enum(["admin", "customer"], {
      errorMap: () => ({ message: "Role must be 'admin' or 'customer'" })
    })
  }),

  query: z.object({}).optional()
});
