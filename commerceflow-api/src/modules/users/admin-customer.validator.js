import { z } from "zod";

export const getAdminCustomersSchema = z.object({
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

    search: z
      .string({ invalid_type_error: "Search must be a string" })
      .trim()
      .max(100, "Search query cannot exceed 100 characters")
      .optional(),

    status: z
      .enum(["active", "inactive", "all"], {
        message: "Status must be 'active', 'inactive', or 'all'"
      })
      .default("all"),

    sortBy: z
      .enum(["createdAt", "name", "email"], {
        message: "sortBy must be 'createdAt', 'name', or 'email'"
      })
      .default("createdAt"),

    sortOrder: z
      .enum(["asc", "desc"], {
        message: "sortOrder must be 'asc' or 'desc'"
      })
      .default("desc")
  }),
  params: z.object({}).optional()
});

export const customerIdParamSchema = z.object({
  body: z.object({}).optional(),
  query: z.object({}).optional(),
  params: z.object({
    customerId: z
      .string({ invalid_type_error: "Customer ID must be a string" })
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid customer ID format")
  })
});

export const updateCustomerStatusSchema = z.object({
  params: z.object({
    customerId: z
      .string({ invalid_type_error: "Customer ID must be a string" })
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid customer ID format")
  }),
  body: z.object({
    isActive: z.boolean({
      required_error: "isActive is required",
      invalid_type_error: "isActive must be a boolean"
    })
  }).strict("Unrecognized fields in request body"),
  query: z.object({}).optional()
});

export default getAdminCustomersSchema;
