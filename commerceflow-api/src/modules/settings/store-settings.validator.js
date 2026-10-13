import { z } from "zod";

export const updateStoreSettingsSchema = z.object({
  params: z.object({}).optional(),
  query: z.object({}).optional(),
  body: z
    .object({
      storeName: z
        .string()
        .trim()
        .min(2, "Store name must contain at least 2 characters")
        .max(100, "Store name cannot exceed 100 characters")
        .optional(),
      supportEmail: z
        .string()
        .trim()
        .email("Must be a valid email address")
        .optional(),
      supportPhone: z
        .string()
        .trim()
        .max(30, "Phone number cannot exceed 30 characters")
        .optional(),
      currency: z
        .string()
        .trim()
        .length(3, "Currency must be a 3-letter code (e.g. INR)")
        .toUpperCase()
        .optional(),
      currencySymbol: z
        .string()
        .trim()
        .max(5, "Currency symbol cannot exceed 5 characters")
        .optional(),
      freeShippingThreshold: z
        .number({ invalid_type_error: "Free shipping threshold must be a number" })
        .min(0, "Free shipping threshold cannot be negative")
        .optional(),
      standardShippingRate: z
        .number({ invalid_type_error: "Standard shipping rate must be a number" })
        .min(0, "Standard shipping rate cannot be negative")
        .optional(),
      lowStockThreshold: z
        .number({ invalid_type_error: "Low stock threshold must be a number" })
        .int("Low stock threshold must be an integer")
        .min(1, "Low stock threshold must be at least 1")
        .max(100, "Low stock threshold cannot exceed 100")
        .optional(),
      returnWindowDays: z
        .number({ invalid_type_error: "Return window must be a number" })
        .int("Return window must be an integer")
        .min(1, "Return window must be at least 1 day")
        .max(90, "Return window cannot exceed 90 days")
        .optional(),
      isMaintenanceMode: z.boolean().optional()
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one settings field must be provided for update"
    })
});
