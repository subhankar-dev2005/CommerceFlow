import { z } from "zod";
import {
  RETURN_REASONS,
  RETURN_STATUSES
} from "./return.constants.js";

const mongoIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid ID format");

export const returnItemInputSchema = z
  .object({
    productId: mongoIdSchema,
    variantId: z.string().trim().min(1).max(64).nullable().optional(),
    quantity: z
      .number({ required_error: "Quantity is required" })
      .int("Quantity must be an integer")
      .min(1, "Quantity must be at least 1")
      .max(1000, "Quantity exceeds permissible limit")
  });

export const createReturnSchema = z.object({
  params: z
    .object({
      orderId: mongoIdSchema
    })
    .strict(),
  body: z
    .object({
      reason: z.enum(RETURN_REASONS, {
        errorMap: () => ({ message: "A valid return reason is required" })
      }),
      customerNote: z
        .string()
        .trim()
        .max(500, "Customer note cannot exceed 500 characters")
        .optional()
        .default(""),
      items: z
        .array(returnItemInputSchema)
        .min(1, "At least one item must be selected for return")
        .max(50, "Cannot return more than 50 distinct items in a single request")
    }),
  query: z.object({}).optional()
});

export const getOrderReturnsSchema = z.object({
  params: z
    .object({
      orderId: mongoIdSchema
    })
    .strict(),
  query: z.object({}).optional(),
  body: z.object({}).optional()
});

export const getReturnByIdSchema = z.object({
  params: z
    .object({
      returnId: mongoIdSchema
    })
    .strict(),
  query: z.object({}).optional(),
  body: z.object({}).optional()
});

export const cancelReturnSchema = z.object({
  params: z
    .object({
      returnId: mongoIdSchema
    })
    .strict(),
  body: z
    .object({
      customerNote: z.string().trim().max(500).optional()
    })
    .strict()
    .optional(),
  query: z.object({}).optional()
});

export const adminGetReturnsSchema = z.object({
  query: z
    .object({
      page: z
        .string()
        .optional()
        .transform((val) => (val ? Math.max(1, parseInt(val, 10) || 1) : 1)),
      limit: z
        .string()
        .optional()
        .transform((val) => (val ? Math.min(100, Math.max(1, parseInt(val, 10) || 10)) : 10)),
      status: z.enum([...RETURN_STATUSES, ""]).optional(),
      orderId: z
        .string()
        .regex(/^[0-9a-fA-F]{24}$/, "Invalid order ID")
        .optional(),
      customerId: z
        .string()
        .regex(/^[0-9a-fA-F]{24}$/, "Invalid customer ID")
        .optional(),
      search: z.string().trim().max(100).optional(),
      sortBy: z.enum(["createdAt", "totalRefundAmount", "status", "returnNumber"]).optional().default("createdAt"),
      sortOrder: z.enum(["asc", "desc"]).optional().default("desc")
    })
    .optional(),
  params: z.object({}).optional(),
  body: z.object({}).optional()
});

export const adminApproveReturnSchema = z.object({
  params: z
    .object({
      returnId: mongoIdSchema
    })
    .strict(),
  body: z
    .object({
      adminNote: z.string().trim().max(500).optional()
    })
    .strict()
    .optional(),
  query: z.object({}).optional()
});

export const adminRejectReturnSchema = z.object({
  params: z
    .object({
      returnId: mongoIdSchema
    })
    .strict(),
  body: z
    .object({
      rejectionReason: z
        .string({ required_error: "Rejection reason is required" })
        .trim()
        .min(2, "Rejection reason must be at least 2 characters")
        .max(500, "Rejection reason cannot exceed 500 characters"),
      adminNote: z.string().trim().max(500).optional()
    })
    .strict(),
  query: z.object({}).optional()
});

export const adminReceiveReturnSchema = z.object({
  params: z
    .object({
      returnId: mongoIdSchema
    })
    .strict(),
  body: z
    .object({
      adminNote: z.string().trim().max(500).optional()
    })
    .strict()
    .optional(),
  query: z.object({}).optional()
});

export const adminCompleteReturnSchema = z.object({
  params: z
    .object({
      returnId: mongoIdSchema
    })
    .strict(),
  body: z
    .object({
      adminNote: z.string().trim().max(500).optional()
    })
    .strict()
    .optional(),
  query: z.object({}).optional()
});
