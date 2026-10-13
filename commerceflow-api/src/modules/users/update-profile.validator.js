
import { z } from "zod";

const updateProfileSchema = z.object({
  body: z.object({
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters")
      .max(100, "Name must not exceed 100 characters")
      .optional(),

    email: z
      .string()
      .trim()
      .email("Invalid email address")
      .max(255, "Email must not exceed 255 characters")
      .optional()
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    {
      message: "At least one field is required"
    }
  ),

  query: z.object({}).optional(),

  params: z.object({}).optional()
});

export default updateProfileSchema;
