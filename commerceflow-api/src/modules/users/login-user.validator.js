import { z } from "zod";

const loginUserSchema = z.object({
  body: z.object({
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
        1,
        "Password is required"
      )
  }),

  query: z.object({}),

  params: z.object({})
});

export default loginUserSchema;