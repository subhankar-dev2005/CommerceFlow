import { z } from "zod";
import { CAMPAIGN_STATUSES, CAMPAIGN_BANNER_PLACEMENTS } from "./campaign.model.js";

/**
 * Reusable date input schema supporting ISO 8601 strings, YYYY-MM-DD dates, and Date instances.
 */
function dateInputSchema(fieldName) {
  return z
    .union(
      [
        z.string().datetime({ message: `${fieldName} must be a valid ISO date string` }),
        z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${fieldName} must be in YYYY-MM-DD or ISO format`),
        z.date()
      ],
      {
        required_error: `${fieldName} is required`,
        invalid_type_error: `${fieldName} must be a valid date or date string`
      }
    )
    .refine((val) => !isNaN(new Date(val).getTime()), {
      message: `${fieldName} must be a valid calendar date`
    });
}

/**
 * Schema for creating an administrative campaign.
 */
export const createCampaignSchema = z.object({
  body: z
    .object({
      name: z
        .string({
          required_error: "Campaign name is required",
          invalid_type_error: "Campaign name must be a string"
        })
        .trim()
        .min(2, "Campaign name must contain at least 2 characters")
        .max(150, "Campaign name cannot exceed 150 characters"),

      objective: z
        .string({ invalid_type_error: "Objective must be a string" })
        .trim()
        .max(1000, "Objective cannot exceed 1000 characters")
        .nullable()
        .optional(),

      couponCode: z
        .string({ invalid_type_error: "Coupon code must be a string" })
        .trim()
        .max(50, "Coupon code cannot exceed 50 characters")
        .nullable()
        .optional(),

      startDate: dateInputSchema("startDate"),

      endDate: dateInputSchema("endDate"),

      status: z
        .enum(CAMPAIGN_STATUSES, {
          message: "Status must be 'active', 'upcoming', or 'ended'"
        })
        .default("active")
        .optional(),

      bannerPlacement: z
        .enum(CAMPAIGN_BANNER_PLACEMENTS, {
          message:
            "Banner placement must be 'hero_carousel', 'category_top', 'promotional_strip', or 'storefront_footer'"
        })
        .default("hero_carousel")
        .optional()
    })
    .strict("Unsupported fields in campaign payload")
    .superRefine((data, ctx) => {
      if (data.startDate && data.endDate) {
        const start = new Date(data.startDate).getTime();
        const end = new Date(data.endDate).getTime();
        if (Number.isFinite(start) && Number.isFinite(end) && end < start) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["endDate"],
            message: "End date must be at or after start date"
          });
        }
      }
    }),

  query: z.object({}).optional(),
  params: z.object({}).optional()
});

/**
 * Schema for updating an existing campaign's fields.
 */
export const updateCampaignSchema = z.object({
  body: z
    .object({
      name: z
        .string({ invalid_type_error: "Campaign name must be a string" })
        .trim()
        .min(2, "Campaign name must contain at least 2 characters")
        .max(150, "Campaign name cannot exceed 150 characters")
        .optional(),

      objective: z
        .string({ invalid_type_error: "Objective must be a string" })
        .trim()
        .max(1000, "Objective cannot exceed 1000 characters")
        .nullable()
        .optional(),

      couponCode: z
        .string({ invalid_type_error: "Coupon code must be a string" })
        .trim()
        .max(50, "Coupon code cannot exceed 50 characters")
        .nullable()
        .optional(),

      startDate: dateInputSchema("startDate").optional(),

      endDate: dateInputSchema("endDate").optional(),

      status: z
        .enum(CAMPAIGN_STATUSES, {
          message: "Status must be 'active', 'upcoming', or 'ended'"
        })
        .optional(),

      bannerPlacement: z
        .enum(CAMPAIGN_BANNER_PLACEMENTS, {
          message:
            "Banner placement must be 'hero_carousel', 'category_top', 'promotional_strip', or 'storefront_footer'"
        })
        .optional()
    })
    .strict("Unsupported fields in campaign update payload")
    .refine((body) => Object.keys(body).length > 0, {
      message: "At least one field must be provided for update"
    })
    .superRefine((data, ctx) => {
      if (data.startDate && data.endDate) {
        const start = new Date(data.startDate).getTime();
        const end = new Date(data.endDate).getTime();
        if (Number.isFinite(start) && Number.isFinite(end) && end < start) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["endDate"],
            message: "End date must be at or after start date"
          });
        }
      }
    }),

  query: z.object({}).optional(),
  params: z.object({
    campaignId: z
      .string({ required_error: "campaignId is required" })
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid campaign ID")
  })
});

/**
 * Schema for updating only the lifecycle status of a campaign.
 */
export const updateCampaignStatusSchema = z.object({
  body: z
    .object({
      status: z.enum(CAMPAIGN_STATUSES, {
        required_error: "status is required",
        message: "Status must be 'active', 'upcoming', or 'ended'"
      })
    })
    .strict("Only status is allowed in status payload"),

  query: z.object({}).optional(),
  params: z.object({
    campaignId: z
      .string({ required_error: "campaignId is required" })
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid campaign ID")
  })
});

/**
 * Schema for verifying valid campaignId in route params.
 */
export const campaignIdParamSchema = z.object({
  body: z.object({}).optional(),
  query: z.object({}).optional(),
  params: z.object({
    campaignId: z
      .string({ required_error: "campaignId is required" })
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid campaign ID")
  })
});

/**
 * Schema for listing campaigns with administrative pagination, sorting, and filters.
 */
export const getAdminCampaignsSchema = z.object({
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

    status: z
      .enum([...CAMPAIGN_STATUSES, "all"], {
        message: "status filter must be 'active', 'upcoming', 'ended', or 'all'"
      })
      .optional(),

    bannerPlacement: z
      .enum([...CAMPAIGN_BANNER_PLACEMENTS, "all"], {
        message: "bannerPlacement filter must be a valid placement or 'all'"
      })
      .optional(),

    sortBy: z
      .enum(["createdAt", "startDate", "endDate", "name", "status"])
      .default("createdAt"),

    sortOrder: z.enum(["asc", "desc"]).default("desc")
  }),
  params: z.object({}).optional()
});

export default {
  createCampaignSchema,
  updateCampaignSchema,
  updateCampaignStatusSchema,
  campaignIdParamSchema,
  getAdminCampaignsSchema
};
