import { z } from "zod";

export const getDashboardSalesSchema = z.object({
  body: z.object({}).optional(),
  query: z.object({
    period: z
      .enum(["7d", "30d", "90d"], {
        message: "Period must be '7d', '30d', or '90d'"
      })
      .default("7d")
  }),
  params: z.object({}).optional()
});

export const getDashboardTopProductsSchema = z.object({
  body: z.object({}).optional(),
  query: z.object({
    period: z
      .enum(["7d", "30d", "90d", "all"], {
        message: "Period must be '7d', '30d', '90d', or 'all'"
      })
      .optional()
      .default("30d"),
    limit: z.coerce
      .number({ invalid_type_error: "Limit must be a number" })
      .int("Limit must be an integer")
      .min(1, "Limit must be at least 1")
      .max(50, "Limit cannot exceed 50")
      .optional()
      .default(5)
  }),
  params: z.object({}).optional()
});
