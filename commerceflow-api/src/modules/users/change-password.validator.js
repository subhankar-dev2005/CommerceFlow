
import { z } from "zod";

const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z
      .string()
      .min(6, "Current password must be at least 6 characters"),

    newPassword: z
      .string()
      .min(6, "New password must be at least 6 characters")
      .max(100, "New password must not exceed 100 characters")
  })
  .refine(
    (data) => data.currentPassword !== data.newPassword,
    {
      message: "New password must be different from current password",
      path: ["newPassword"]
    }
  ),

  query: z.object({}).optional(),

  params: z.object({}).optional()
});

export default changePasswordSchema;
