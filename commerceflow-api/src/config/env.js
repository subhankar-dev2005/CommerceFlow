import "dotenv/config";

import { z } from "zod";

const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum([
        "development",
        "test",
        "staging",
        "production"
      ])
      .default("development"),

    PORT: z.coerce
      .number()
      .int()
      .min(1)
      .max(65535)
      .default(4000),

    CORS_ORIGIN: z.string().optional(),

    LOG_LEVEL: z
      .enum([
        "fatal",
        "error",
        "warn",
        "info",
        "debug",
        "trace"
      ])
      .default("info"),

    JWT_SECRET: z.string().min(32),
    JWT_EXPIRES_IN: z.string().default("20m"),

    RAZORPAY_KEY_ID: z
      .string()
      .min(1, "RAZORPAY_KEY_ID is required"),

    RAZORPAY_KEY_SECRET: z
      .string()
      .min(1, "RAZORPAY_KEY_SECRET is required"),

    RAZORPAY_WEBHOOK_SECRET: z
      .string()
      .optional(),

    MONGODB_URI: z
      .string()
      .min(1, "MONGODB_URI is required"),

    TRUST_PROXY: z
      .string()
      .default("false"),

    WEBHOOK_RATE_LIMIT: z.coerce
      .number()
      .int()
      .min(1)
      .default(60)
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === "production") {
      if (!data.CORS_ORIGIN || !data.CORS_ORIGIN.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "CORS_ORIGIN is required in production",
          path: ["CORS_ORIGIN"]
        });
      }

      if (
        !data.RAZORPAY_WEBHOOK_SECRET ||
        !data.RAZORPAY_WEBHOOK_SECRET.trim()
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "RAZORPAY_WEBHOOK_SECRET is required in production",
          path: ["RAZORPAY_WEBHOOK_SECRET"]
        });
      } else if (
        data.RAZORPAY_WEBHOOK_SECRET.trim() === "your_razorpay_webhook_secret"
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "RAZORPAY_WEBHOOK_SECRET cannot be the default placeholder in production",
          path: ["RAZORPAY_WEBHOOK_SECRET"]
        });
      }

      /*
       * Prevent known placeholder / example JWT secrets from being used in
       * production. A minimum length of 32 is already enforced by the schema;
       * this catches values that are long enough but still obviously insecure.
       */
      const KNOWN_WEAK_JWT_SECRETS = [
        "your_jwt_secret",
        "your-jwt-secret",
        "jwt_secret",
        "secret",
        "changeme",
        "supersecret",
        "your_super_secret_jwt_key_here",
        "your_super_secret_jwt_key_here_change_me"
      ];
      if (
        data.JWT_SECRET &&
        KNOWN_WEAK_JWT_SECRETS.includes(data.JWT_SECRET.trim().toLowerCase())
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "JWT_SECRET cannot be a default placeholder value in production",
          path: ["JWT_SECRET"]
        });
      }
    }


    if (data.CORS_ORIGIN !== undefined) {
      const origins = data.CORS_ORIGIN.split(",").map((item) => item.trim());

      if (origins.some((item) => item.length === 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "CORS_ORIGIN cannot contain empty origin entries",
          path: ["CORS_ORIGIN"]
        });
      } else if (data.NODE_ENV === "production" && origins.includes("*")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Wildcard '*' is not allowed as a CORS origin in production",
          path: ["CORS_ORIGIN"]
        });
      }
    }
  })
  .transform((data) => {
    let origins;
    if (data.CORS_ORIGIN !== undefined) {
      origins = data.CORS_ORIGIN.split(",").map((item) => item.trim());
    } else {
      origins = ["http://localhost:3000"];
    }

    return {
      ...data,
      CORS_ORIGIN: origins,
      RAZORPAY_WEBHOOK_SECRET: data.RAZORPAY_WEBHOOK_SECRET?.trim()
    };
  });

const parsedEnvironment =
  environmentSchema.safeParse(process.env);

if (!parsedEnvironment.success) {
  console.error(
    "Invalid environment configuration:",
    parsedEnvironment.error.flatten().fieldErrors
  );

  process.exit(1);
}

export { environmentSchema };

export const env =
  parsedEnvironment.data;
