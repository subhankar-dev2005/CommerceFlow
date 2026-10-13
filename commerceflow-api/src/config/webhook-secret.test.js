import { describe, it, expect } from "vitest";
import { environmentSchema } from "./env.js";

const baseValidEnv = {
  JWT_SECRET: "12345678901234567890123456789012",
  MONGODB_URI: "mongodb://localhost:27017/test_db",
  RAZORPAY_KEY_ID: "rzp_test_key_id",
  RAZORPAY_KEY_SECRET: "rzp_test_key_secret",
  CORS_ORIGIN: "https://shop.example.com"
};

describe("RAZORPAY_WEBHOOK_SECRET Environment Validation", () => {
  it("rejects production startup when RAZORPAY_WEBHOOK_SECRET is missing", () => {
    const result = environmentSchema.safeParse({
      ...baseValidEnv,
      NODE_ENV: "production"
    });

    expect(result.success).toBe(false);
    expect(result.error.flatten().fieldErrors.RAZORPAY_WEBHOOK_SECRET).toContain(
      "RAZORPAY_WEBHOOK_SECRET is required in production"
    );
  });

  it("rejects production startup when RAZORPAY_WEBHOOK_SECRET is empty or whitespace-only", () => {
    const emptyResult = environmentSchema.safeParse({
      ...baseValidEnv,
      NODE_ENV: "production",
      RAZORPAY_WEBHOOK_SECRET: ""
    });
    expect(emptyResult.success).toBe(false);
    expect(emptyResult.error.flatten().fieldErrors.RAZORPAY_WEBHOOK_SECRET).toContain(
      "RAZORPAY_WEBHOOK_SECRET is required in production"
    );

    const whitespaceResult = environmentSchema.safeParse({
      ...baseValidEnv,
      NODE_ENV: "production",
      RAZORPAY_WEBHOOK_SECRET: "   "
    });
    expect(whitespaceResult.success).toBe(false);
    expect(whitespaceResult.error.flatten().fieldErrors.RAZORPAY_WEBHOOK_SECRET).toContain(
      "RAZORPAY_WEBHOOK_SECRET is required in production"
    );
  });

  it("rejects production startup when RAZORPAY_WEBHOOK_SECRET equals the .env.example placeholder", () => {
    const result = environmentSchema.safeParse({
      ...baseValidEnv,
      NODE_ENV: "production",
      RAZORPAY_WEBHOOK_SECRET: "your_razorpay_webhook_secret"
    });

    expect(result.success).toBe(false);
    expect(result.error.flatten().fieldErrors.RAZORPAY_WEBHOOK_SECRET).toContain(
      "RAZORPAY_WEBHOOK_SECRET cannot be the default placeholder in production"
    );
  });

  it("accepts production startup with a valid, non-placeholder webhook secret", () => {
    const result = environmentSchema.safeParse({
      ...baseValidEnv,
      NODE_ENV: "production",
      RAZORPAY_WEBHOOK_SECRET: "whsec_live_example_secret_token_123"
    });

    expect(result.success).toBe(true);
    expect(result.data.RAZORPAY_WEBHOOK_SECRET).toBe(
      "whsec_live_example_secret_token_123"
    );
  });

  it("preserves development and test compatibility when webhook secret is omitted", () => {
    const devResult = environmentSchema.safeParse({
      ...baseValidEnv,
      NODE_ENV: "development",
      CORS_ORIGIN: undefined
    });
    expect(devResult.success).toBe(true);
    expect(devResult.data.RAZORPAY_WEBHOOK_SECRET).toBeUndefined();

    const testResult = environmentSchema.safeParse({
      ...baseValidEnv,
      NODE_ENV: "test",
      CORS_ORIGIN: undefined
    });
    expect(testResult.success).toBe(true);
    expect(testResult.data.RAZORPAY_WEBHOOK_SECRET).toBeUndefined();
  });

  it("preserves development compatibility when placeholder secret is present", () => {
    const devPlaceholderResult = environmentSchema.safeParse({
      ...baseValidEnv,
      NODE_ENV: "development",
      RAZORPAY_WEBHOOK_SECRET: "your_razorpay_webhook_secret"
    });

    expect(devPlaceholderResult.success).toBe(true);
    expect(devPlaceholderResult.data.RAZORPAY_WEBHOOK_SECRET).toBe(
      "your_razorpay_webhook_secret"
    );
  });
});
