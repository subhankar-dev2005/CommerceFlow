import { z } from "zod";

export const testRequestSchema =
  z.object({
    body: z.object({
      name: z
        .string()
        .min(
          2,
          "Name must contain at least 2 characters"
        )
        .max(
          100,
          "Name cannot exceed 100 characters"
        ),

      email: z
        .string()
        .email(
          "Invalid email address"
        )
    }),

    query:
      z.object({}),

    params:
      z.object({})
  });
