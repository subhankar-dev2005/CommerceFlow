import { z } from "zod";

const removeCartItemSchema =
  z.object({
    body: z.object({}),

    query: z.object({}),

    params: z.object({
      productId: z
        .string()
        .regex(
          /^[0-9a-fA-F]{24}$/,
          "Invalid product ID"
        )
    })
  });

export default removeCartItemSchema;