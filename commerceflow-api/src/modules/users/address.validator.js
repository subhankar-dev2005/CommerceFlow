
import { z } from "zod";

const createAddressSchema = z.object({
  body: z.object({
    fullName: z
      .string()
      .trim()
      .min(2, "Full name must be at least 2 characters")
      .max(100, "Full name must not exceed 100 characters"),

    phone: z
      .string()
      .trim()
      .min(10, "Phone number must be at least 10 characters")
      .max(20, "Phone number must not exceed 20 characters"),

    addressLine1: z
      .string()
      .trim()
      .min(1, "Address line 1 is required")
      .max(200, "Address line 1 must not exceed 200 characters"),

    addressLine2: z
      .string()
      .trim()
      .max(200, "Address line 2 must not exceed 200 characters")
      .optional(),

    city: z
      .string()
      .trim()
      .min(1, "City is required")
      .max(100, "City must not exceed 100 characters"),

    state: z
      .string()
      .trim()
      .min(1, "State is required")
      .max(100, "State must not exceed 100 characters"),

    postalCode: z
      .string()
      .trim()
      .min(3, "Postal code is required")
      .max(20, "Postal code must not exceed 20 characters"),

    country: z
      .string()
      .trim()
      .min(1, "Country is required")
      .max(100, "Country must not exceed 100 characters")
      .default("India"),

    isDefault: z
      .boolean()
      .default(false)
  }),

  query: z.object({}).optional(),

  params: z.object({}).optional()
});

const addressIdSchema = z.object({
  body: z.object({}).optional(),
  query: z.object({}).optional(),

  params: z.object({
    addressId: z
      .string()
      .regex(
        /^[0-9a-fA-F]{24}$/,
        "Invalid address ID"
      )
  })
});

const updateAddressSchema = z.object({
  body: z.object({
    fullName: z
      .string()
      .trim()
      .min(2, "Full name must be at least 2 characters")
      .max(100, "Full name must not exceed 100 characters")
      .optional(),

    phone: z
      .string()
      .trim()
      .min(10, "Phone number must be at least 10 characters")
      .max(20, "Phone number must not exceed 20 characters")
      .optional(),

    addressLine1: z
      .string()
      .trim()
      .min(1, "Address line 1 is required")
      .max(200, "Address line 1 must not exceed 200 characters")
      .optional(),

    addressLine2: z
      .string()
      .trim()
      .max(200, "Address line 2 must not exceed 200 characters")
      .optional(),

    city: z
      .string()
      .trim()
      .min(1, "City is required")
      .max(100, "City must not exceed 100 characters")
      .optional(),

    state: z
      .string()
      .trim()
      .min(1, "State is required")
      .max(100, "State must not exceed 100 characters")
      .optional(),

    postalCode: z
      .string()
      .trim()
      .min(3, "Postal code is required")
      .max(20, "Postal code must not exceed 20 characters")
      .optional(),

    country: z
      .string()
      .trim()
      .min(1, "Country is required")
      .max(100, "Country must not exceed 100 characters")
      .optional(),

    isDefault: z
      .boolean()
      .optional()
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    {
      message: "At least one field is required"
    }
  ),

  query: z.object({}).optional(),

  params: z.object({
    addressId: z
      .string()
      .regex(
        /^[0-9a-fA-F]{24}$/,
        "Invalid address ID"
      )
  })
});

export {
  createAddressSchema,
  addressIdSchema,
  updateAddressSchema
};
