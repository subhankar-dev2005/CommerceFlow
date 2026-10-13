import { z } from "zod";

export const DEFAULT_LOW_STOCK_THRESHOLD = 5;

export const INVENTORY_ADJUSTMENT_REASONS = [
  "stock_correction",
  "damaged_inventory",
  "returned_inventory",
  "manual_count",
  "receiving",
  "other"
];

export const getAdminInventorySchema = z.object({
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

    type: z
      .enum(["all", "simple", "variant"], {
        message: "Type filter must be 'all', 'simple', or 'variant'"
      })
      .default("all"),

    sortBy: z
      .enum(["name", "stock", "createdAt", "updatedAt"], {
        message: "sortBy must be 'name', 'stock', 'createdAt', or 'updatedAt'"
      })
      .default("createdAt"),

    sortOrder: z
      .enum(["asc", "desc"], {
        message: "sortOrder must be 'asc' or 'desc'"
      })
      .default("desc")
  }).default({})
});

export const adjustStockSchema = z.object({
  params: z.object({}).optional(),
  query: z.object({}).optional(),

  body: z.object({
    productId: z
      .string({ required_error: "productId is required" })
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid product ID format"),

    variantId: z
      .string()
      .trim()
      .min(1, "variantId cannot be empty string")
      .optional()
      .nullable(),

    adjustment: z.coerce
      .number({ required_error: "Adjustment quantity is required", invalid_type_error: "Adjustment must be a number" })
      .int("Adjustment quantity must be an integer")
      .refine((val) => val !== 0, {
        message: "Adjustment quantity cannot be zero"
      }),

    reason: z.enum(
      [
        "stock_correction",
        "damaged_inventory",
        "returned_inventory",
        "manual_count",
        "receiving",
        "other"
      ],
      {
        message:
          "Reason must be one of: stock_correction, damaged_inventory, returned_inventory, manual_count, receiving, other"
      }
    ),

    note: z
      .string()
      .trim()
      .max(500, "Note cannot exceed 500 characters")
      .optional()
      .default("")
  })
});

export const getInventoryAdjustmentsSchema = z.object({
  body: z.object({}).optional(),

  query: z.object({
    productId: z
      .string()
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid product ID format")
      .optional(),

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
      .default(20)
  }).default({})
});
