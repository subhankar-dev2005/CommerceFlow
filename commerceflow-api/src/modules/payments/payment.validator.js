import { z } from "zod";

const paymentOrderSchema = z.object({
  body: z.object({}).optional(),

  query: z.object({}).optional(),

  params: z.object({
    orderId: z.string().regex(
      /^[0-9a-fA-F]{24}$/,
      "Invalid order ID"
    )
  })
});

const verifyPaymentSchema = z.object({
  body: z.object({
    razorpayPaymentId: z
      .string()
      .min(1, "Razorpay payment ID is required"),

    razorpayOrderId: z
      .string()
      .min(1, "Razorpay order ID is required"),

    razorpaySignature: z
      .string()
      .min(1, "Razorpay signature is required")
  }),

  query: z.object({}).optional(),

  params: z.object({
    orderId: z.string().regex(
      /^[0-9a-fA-F]{24}$/,
      "Invalid order ID"
    )
  })
});

export {
  paymentOrderSchema,
  verifyPaymentSchema
};