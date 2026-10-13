import { z } from "zod";

/**
 * Normalizes a coupon code for deterministic storage, indexing, and lookup.
 * Trims leading/trailing whitespace and converts all characters to uppercase.
 *
 * @param {string} code - Raw coupon code string
 * @returns {string} Normalized uppercase trimmed code
 */
export function normalizeCouponCode(code) {
  if (typeof code !== "string") {
    return "";
  }
  return code.trim().toUpperCase();
}

/**
 * Zod validation schema for creating a new Coupon.
 * Follows CommerceFlow strict validation conventions.
 */
const createCouponSchema = z.object({
  body: z
    .object({
      code: z
        .string({
          required_error: "Coupon code is required",
          invalid_type_error: "Coupon code must be a string"
        })
        .trim()
        .min(3, "Coupon code must contain at least 3 characters")
        .max(20, "Coupon code cannot exceed 20 characters")
        .regex(
          /^[A-Za-z0-9_-]+$/,
          "Coupon code can only contain letters, numbers, hyphens, and underscores"
        ),

      type: z.enum(["percentage", "fixed"], {
        message: "Type must be either 'percentage' or 'fixed'"
      }),

      value: z
        .number({
          required_error: "Value is required",
          invalid_type_error: "Value must be a number"
        })
        .positive("Value must be greater than 0")
        .finite("Value must be finite"),

      minimumSubtotal: z
        .number({
          invalid_type_error: "Minimum subtotal must be a number"
        })
        .min(0, "Minimum subtotal cannot be negative")
        .finite("Minimum subtotal must be finite")
        .default(0)
        .optional(),

      maximumDiscount: z
        .number({
          invalid_type_error: "Maximum discount must be a number"
        })
        .positive("Maximum discount must be greater than 0")
        .finite("Maximum discount must be finite")
        .nullable()
        .optional(),

      startsAt: z
        .union([
          z.string().datetime({ message: "startsAt must be a valid ISO date string" }),
          z.date()
        ])
        .nullable()
        .optional(),

      expiresAt: z
        .union([
          z.string().datetime({ message: "expiresAt must be a valid ISO date string" }),
          z.date()
        ])
        .nullable()
        .optional(),

      usageLimit: z
        .number({
          invalid_type_error: "Usage limit must be a number"
        })
        .int("Usage limit must be an integer")
        .positive("Usage limit must be greater than 0")
        .nullable()
        .optional(),

      perUserLimit: z
        .number({
          invalid_type_error: "Per user limit must be a number"
        })
        .int("Per user limit must be an integer")
        .positive("Per user limit must be greater than 0")
        .nullable()
        .default(1)
        .optional(),

      applicableProducts: z
        .array(
          z
            .string({
              invalid_type_error: "Product ID must be a string"
            })
            .regex(
              /^[0-9a-fA-F]{24}$/,
              "Each product must be a valid 24-character hexadecimal ObjectId"
            )
        )
        .default([])
        .optional()
        .refine(
          (arr) => !arr || new Set(arr).size === arr.length,
          { message: "applicableProducts cannot contain duplicate product IDs" }
        ),

      applicableCategories: z
        .array(
          z
            .string({
              invalid_type_error: "Category must be a string"
            })
            .trim()
            .min(1, "Category name cannot be empty")
        )
        .default([])
        .optional()
        .refine(
          (arr) => {
            if (!arr || arr.length === 0) return true;
            const normalized = arr.map((c) => c.trim().toLowerCase());
            return new Set(normalized).size === normalized.length;
          },
          { message: "applicableCategories cannot contain duplicate categories" }
        ),

      isActive: z
        .boolean({
          invalid_type_error: "isActive must be a boolean"
        })
        .default(true)
        .optional()
    })
    .strict("Unsupported fields in coupon payload")
    .superRefine((data, ctx) => {
      // 1. Percentage value rule: 1 to 100
      if (data.type === "percentage" && data.value > 100) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["value"],
          message: "Percentage discount cannot exceed 100%"
        });
      }

      // 2. Date relationship: expiresAt >= startsAt
      if (data.startsAt && data.expiresAt) {
        const start = new Date(data.startsAt).getTime();
        const expiry = new Date(data.expiresAt).getTime();
        if (Number.isFinite(start) && Number.isFinite(expiry) && expiry < start) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["expiresAt"],
            message: "expiresAt must be at or after startsAt"
          });
        }
      }
    }),

  query: z.object({}).optional(),
  params: z.object({}).optional()
});

/**
 * Zod validation schema for updating an existing Coupon.
 */
const updateCouponSchema = z.object({
  body: z
    .object({
      code: z
        .string({ invalid_type_error: "Coupon code must be a string" })
        .trim()
        .min(3, "Coupon code must contain at least 3 characters")
        .max(20, "Coupon code cannot exceed 20 characters")
        .regex(
          /^[A-Za-z0-9_-]+$/,
          "Coupon code can only contain letters, numbers, hyphens, and underscores"
        )
        .optional(),

      type: z
        .enum(["percentage", "fixed"], {
          message: "Type must be either 'percentage' or 'fixed'"
        })
        .optional(),

      value: z
        .number({ invalid_type_error: "Value must be a number" })
        .positive("Value must be greater than 0")
        .finite("Value must be finite")
        .optional(),

      minimumSubtotal: z
        .number({ invalid_type_error: "Minimum subtotal must be a number" })
        .min(0, "Minimum subtotal cannot be negative")
        .finite("Minimum subtotal must be finite")
        .optional(),

      maximumDiscount: z
        .number({ invalid_type_error: "Maximum discount must be a number" })
        .positive("Maximum discount must be greater than 0")
        .finite("Maximum discount must be finite")
        .nullable()
        .optional(),

      startsAt: z
        .union([
          z.string().datetime({ message: "startsAt must be a valid ISO date string" }),
          z.date()
        ])
        .nullable()
        .optional(),

      expiresAt: z
        .union([
          z.string().datetime({ message: "expiresAt must be a valid ISO date string" }),
          z.date()
        ])
        .nullable()
        .optional(),

      usageLimit: z
        .number({ invalid_type_error: "Usage limit must be a number" })
        .int("Usage limit must be an integer")
        .positive("Usage limit must be greater than 0")
        .nullable()
        .optional(),

      perUserLimit: z
        .number({ invalid_type_error: "Per user limit must be a number" })
        .int("Per user limit must be an integer")
        .positive("Per user limit must be greater than 0")
        .nullable()
        .optional(),

      applicableProducts: z
        .array(
          z
            .string({ invalid_type_error: "Product ID must be a string" })
            .regex(
              /^[0-9a-fA-F]{24}$/,
              "Each product must be a valid 24-character hexadecimal ObjectId"
            )
        )
        .optional()
        .refine((arr) => !arr || new Set(arr).size === arr.length, {
          message: "applicableProducts cannot contain duplicate product IDs"
        }),

      applicableCategories: z
        .array(
          z
            .string({ invalid_type_error: "Category must be a string" })
            .trim()
            .min(1, "Category name cannot be empty")
        )
        .optional()
        .refine(
          (arr) => {
            if (!arr || arr.length === 0) return true;
            const normalized = arr.map((c) => c.trim().toLowerCase());
            return new Set(normalized).size === normalized.length;
          },
          { message: "applicableCategories cannot contain duplicate categories" }
        ),

      isActive: z
        .boolean({ invalid_type_error: "isActive must be a boolean" })
        .optional()
    })
    .strict("Unsupported fields in coupon update payload")
    .refine((body) => Object.keys(body).length > 0, {
      message: "At least one field must be provided for update"
    })
    .superRefine((data, ctx) => {
      if (data.type === "percentage" && data.value !== undefined && data.value > 100) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["value"],
          message: "Percentage discount cannot exceed 100%"
        });
      }

      if (data.startsAt && data.expiresAt) {
        const start = new Date(data.startsAt).getTime();
        const expiry = new Date(data.expiresAt).getTime();
        if (Number.isFinite(start) && Number.isFinite(expiry) && expiry < start) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["expiresAt"],
            message: "expiresAt must be at or after startsAt"
          });
        }
      }
    }),

  query: z.object({}).optional(),
  params: z.object({
    couponId: z
      .string({ required_error: "couponId is required" })
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid coupon ID")
  })
});

/**
 * Zod validation schema for updating coupon active status only.
 */
const updateCouponStatusSchema = z.object({
  body: z
    .object({
      isActive: z.boolean({
        required_error: "isActive is required",
        invalid_type_error: "isActive must be a boolean"
      })
    })
    .strict("Only isActive is allowed in status payload"),

  query: z.object({}).optional(),
  params: z.object({
    couponId: z
      .string({ required_error: "couponId is required" })
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid coupon ID")
  })
});

/**
 * Zod validation schema for coupon ID parameter.
 */
const couponIdParamSchema = z.object({
  body: z.object({}).optional(),
  query: z.object({}).optional(),
  params: z.object({
    couponId: z
      .string({ required_error: "couponId is required" })
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid coupon ID")
  })
});

/**
 * Zod validation schema for listing coupons with administrative filters and pagination.
 */
const getAdminCouponsSchema = z.object({
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

    search: z.string().trim().optional(),

    isActive: z
      .enum(["true", "false"], {
        message: "isActive must be either 'true' or 'false'"
      })
      .optional(),

    type: z
      .enum(["percentage", "fixed"], {
        message: "Type must be either 'percentage' or 'fixed'"
      })
      .optional(),

    sortBy: z
      .enum(["createdAt", "code", "usedCount", "value", "expiresAt"])
      .default("createdAt"),

    sortOrder: z.enum(["asc", "desc"]).default("desc")
  }),
  params: z.object({}).optional()
});

export default createCouponSchema;
export {
  createCouponSchema,
  updateCouponSchema,
  updateCouponStatusSchema,
  couponIdParamSchema,
  getAdminCouponsSchema
};
