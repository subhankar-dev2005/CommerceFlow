import { z } from "zod";

export const getAdminAuditLogsSchema = z.object({
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

    eventType: z
      .string()
      .trim()
      .max(100, "Event type cannot exceed 100 characters")
      .optional(),

    actorUserId: z
      .string()
      .trim()
      .regex(/^[0-9a-fA-F]{24}$/, "actorUserId must be a valid 24-character ObjectId")
      .optional(),

    targetUserId: z
      .string()
      .trim()
      .regex(/^[0-9a-fA-F]{24}$/, "targetUserId must be a valid 24-character ObjectId")
      .optional(),

    resourceType: z
      .string()
      .trim()
      .max(50, "resourceType cannot exceed 50 characters")
      .optional(),

    resourceId: z
      .string()
      .trim()
      .max(100, "resourceId cannot exceed 100 characters")
      .optional(),

    startDate: z
      .string()
      .trim()
      .refine((val) => !val || !isNaN(Date.parse(val)), {
        message: "startDate must be a valid date string"
      })
      .optional(),

    endDate: z
      .string()
      .trim()
      .refine((val) => !val || !isNaN(Date.parse(val)), {
        message: "endDate must be a valid date string"
      })
      .optional()
  }).strict(),

  body: z.object({}).optional(),
  params: z.object({}).optional()
});
