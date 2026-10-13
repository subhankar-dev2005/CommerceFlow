
import { z } from "zod";
import {
  CUSTOMER_CANCELLATION_REASONS,
  ADMIN_CANCELLATION_REASONS
} from "./order-cancellation.constants.js";

const createOrderSchema = z.object({
  body: z
    .object({
      addressId: z
        .string()
        .regex(
          /^[0-9a-fA-F]{24}$/,
          "Invalid address ID"
        ),

      couponCode: z
        .string({
          message: "Coupon code must be a string"
        })
        .trim()
        .min(3, "Coupon code must contain at least 3 characters")
        .max(20, "Coupon code cannot exceed 20 characters")
        .regex(
          /^[A-Za-z0-9_-]+$/,
          "Coupon code can only contain letters, numbers, hyphens, and underscores"
        )
        .optional()
    })
    .strict("Unsupported fields in order payload"),

  query: z.object({}).optional(),

  params: z.object({}).optional()
});

const getOrdersSchema = z.object({
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

    status: z
      .enum(
        [
          "pending",
          "confirmed",
          "processing",
          "shipped",
          "delivered",
          "cancelled"
        ],
        {
          message: "Invalid order status"
        }
      )
      .optional(),

    sortOrder: z
      .enum(["asc", "desc"])
      .default("desc")
  }),

  params: z.object({}).optional()
});

const getOrderSchema = z.object({
  body: z.object({}).optional(),

  query: z.object({}).optional(),

  params: z.object({
    orderId: z
      .string()
      .regex(
        /^[0-9a-fA-F]{24}$/,
        "Invalid order ID"
      )
  })
});

const updateOrderStatusSchema = z.object({
  body: z
    .object({
      status: z.enum(
        [
          "pending",
          "confirmed",
          "processing",
          "shipped",
          "delivered",
          "cancelled"
        ],
        {
          message: "Invalid order status"
        }
      ),

      reason: z
        .enum(ADMIN_CANCELLATION_REASONS, {
          message: "Invalid cancellation reason"
        })
        .optional(),

      reasonDetail: z
        .string({
          message: "Reason detail must be a string"
        })
        .trim()
        .max(500, "Reason detail cannot exceed 500 characters")
        .optional()
    })
    .strict("Unknown fields in update status payload are not allowed")
    .superRefine((data, ctx) => {
      if (data.status !== "cancelled") {
        if (data.reason !== undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["reason"],
            message: "Reason can only be provided when status is 'cancelled'"
          });
        }
        if (data.reasonDetail !== undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["reasonDetail"],
            message: "Reason detail can only be provided when status is 'cancelled'"
          });
        }
      }
    })
    .transform((data) => {
      if (data.status === "cancelled") {
        return {
          status: data.status,
          reason: data.reason ?? "other",
          reasonDetail: data.reasonDetail ?? ""
        };
      }
      return data;
    }),

  query: z.object({}).optional(),

  params: z.object({
    orderId: z
      .string()
      .regex(
        /^[0-9a-fA-F]{24}$/,
        "Invalid order ID"
      )
  })
});

const cancelOrderSchema = z.object({
  body: z
    .object({
      reason: z
        .enum(CUSTOMER_CANCELLATION_REASONS, {
          message: "Invalid cancellation reason"
        })
        .optional()
        .default("other"),

      reasonDetail: z
        .string({
          message: "Reason detail must be a string"
        })
        .trim()
        .max(500, "Reason detail cannot exceed 500 characters")
        .optional()
        .default("")
    })
    .strict("Unknown fields in cancellation payload are not allowed")
    .default({
      reason: "other",
      reasonDetail: ""
    }),

  query: z.object({}).optional(),

  params: z.object({
    orderId: z
      .string()
      .regex(
        /^[0-9a-fA-F]{24}$/,
        "Invalid order ID"
      )
  })
});


const getAdminOrdersSchema = z.object({
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

    status: z
      .enum(
        [
          "pending",
          "confirmed",
          "processing",
          "shipped",
          "delivered",
          "cancelled"
        ],
        {
          message: "Invalid order status"
        }
      )
      .optional(),

    paymentStatus: z
      .enum(
        [
          "pending",
          "paid",
          "failed",
          "refunded"
        ],
        {
          message: "Invalid payment status"
        }
      )
      .optional(),

    search: z
      .string()
      .trim()
      .max(100, "Search query cannot exceed 100 characters")
      .optional(),

    sortBy: z
      .enum(["createdAt", "updatedAt", "subtotal", "totalQuantity"], {
        message: "Invalid sort field"
      })
      .default("createdAt"),

    sortOrder: z
      .enum(["asc", "desc"], {
        message: "Sort order must be 'asc' or 'desc'"
      })
      .default("desc")
  }),

  params: z.object({}).optional()
});

const updateShipmentSchema = z.object({
  params: z.object({
    orderId: z
      .string({ required_error: "Order ID is required" })
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid order ID")
  }),

  body: z
    .object({
      carrier: z
        .string({ required_error: "Carrier is required" })
        .trim()
        .min(2, "Carrier must be at least 2 characters")
        .max(60, "Carrier cannot exceed 60 characters"),

      trackingNumber: z
        .string({ required_error: "Tracking number is required" })
        .trim()
        .min(3, "Tracking number must be at least 3 characters")
        .max(100, "Tracking number cannot exceed 100 characters")
        .regex(
          /^[A-Za-z0-9_\-\.\/]+$/,
          "Tracking number may only contain letters, numbers, and '_', '-', '.', '/'"
        ),

      trackingUrl: z
        .string()
        .trim()
        .max(500, "Tracking URL cannot exceed 500 characters")
        .refine(
          (val) => {
            if (!val) return true;
            try {
              const parsed = new URL(val);
              return parsed.protocol === "http:" || parsed.protocol === "https:";
            } catch {
              return false;
            }
          },
          { message: "Tracking URL must begin with http:// or https://" }
        )
        .optional()
        .default(""),

      status: z
        .enum(
          [
            "label_created",
            "in_transit",
            "out_for_delivery",
            "delivered",
            "exception"
          ],
          {
            message: "Invalid shipment status"
          }
        )
        .optional()
        .default("in_transit"),

      estimatedDelivery: z
        .string()
        .datetime({ message: "Estimated delivery must be a valid ISO datetime string" })
        .nullable()
        .optional()
    })
    .strict({ message: "Unknown fields in request body are not allowed" }),

  query: z.object({}).optional()
});

export {
  createOrderSchema,
  getOrdersSchema,
  getOrderSchema,
  updateOrderStatusSchema,
  cancelOrderSchema,
  getAdminOrdersSchema,
  updateShipmentSchema
};
