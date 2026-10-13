import { z } from "zod";
import { REFUND_STATUSES } from "./refund.constants.js";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const objectIdSchema = z
  .string({ required_error: "ID is required" })
  .trim()
  .regex(objectIdRegex, { message: "Invalid ObjectId format" });

export const getRefundsQuerySchema = z.object({
  query: z
    .object({
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
        .refine((val) => !isNaN(val) && val >= 1 && val <= 100, {
          message: "Limit must be between 1 and 100"
        }),
      status: z.enum(REFUND_STATUSES).optional(),
      orderId: z.string().trim().regex(objectIdRegex, { message: "Invalid orderId format" }).optional(),
      returnId: z.string().trim().regex(objectIdRegex, { message: "Invalid returnId format" }).optional(),
      customerId: z.string().trim().regex(objectIdRegex, { message: "Invalid customerId format" }).optional(),
      gateway: z.enum(["razorpay", "manual"]).optional(),
      search: z.string().trim().max(100).optional(),
      sortBy: z.enum(["createdAt", "amount", "status", "refundNumber"]).optional().default("createdAt"),
      sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
      dateFrom: z.string().datetime({ message: "dateFrom must be a valid ISO 8601 string" }).optional(),
      dateTo: z.string().datetime({ message: "dateTo must be a valid ISO 8601 string" }).optional()
    })
    .strict()
});

export const refundIdParamSchema = z.object({
  params: z
    .object({
      refundId: objectIdSchema
    })
    .strict()
});

export const initiateReturnRefundSchema = z.object({
  params: z
    .object({
      returnId: objectIdSchema
    })
    .strict(),
  body: z
    .object({
      reasonDetail: z.string().trim().max(500, { message: "reasonDetail cannot exceed 500 characters" }).optional()
    })
    .strict() // Rejects any client-supplied amount, status, gateway IDs, etc.
});

export const retryRefundParamSchema = z.object({
  params: z
    .object({
      refundId: objectIdSchema
    })
    .strict(),
  body: z.object({}).strict().optional()
});
