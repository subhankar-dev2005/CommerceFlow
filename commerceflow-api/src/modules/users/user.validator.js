import { z } from "zod";

const registerUserSchema = z.object({
  body: z.object({
    name: z
      .string()
      .trim()
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
      .trim()
      .email(
        "Please provide a valid email address"
      )
      .toLowerCase(),

    password: z
      .string()
      .min(
        6,
        "Password must contain at least 6 characters"
      )
      .max(
        128,
        "Password cannot exceed 128 characters"
      )
  }),

  query: z.object({}),

  params: z.object({})
});

export default registerUserSchema;