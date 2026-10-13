import { z } from "zod";

export const objectIdSchema = z
  .string()
  .regex(
    /^[a-f\d]{24}$/i,
    "Invalid MongoDB ObjectId"
  );

export const paginationQuerySchema = z.object({
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
});