import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

import { createApp } from "../../app.js";
import { env } from "../../config/env.js";
import webhookRateLimitMiddleware from "../../common/middleware/webhook-rate-limit.middleware.js";

describe("Webhook rate limiting and proxy configuration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    webhookRateLimitMiddleware.resetKey("::ffff:127.0.0.1");
    webhookRateLimitMiddleware.resetKey("127.0.0.1");
    webhookRateLimitMiddleware.resetKey("::1");
  });

  it("Test A: allows webhook requests below the limit", async () => {
    const app = createApp();

    const response = await request(app)
      .post("/api/v1/payments/webhook")
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error?.code).toBe("MISSING_WEBHOOK_SIGNATURE");
  });

  it("Test B: blocks requests with 429 when webhook rate limit is exceeded", async () => {
    const app = createApp();
    const limit = env.WEBHOOK_RATE_LIMIT || 60;

    const promises = Array.from({ length: limit }).map(() =>
      request(app).post("/api/v1/payments/webhook").send({})
    );
    const responses = await Promise.all(promises);

    for (const res of responses) {
      expect(res.status).not.toBe(429);
    }

    const blocked = await request(app)
      .post("/api/v1/payments/webhook")
      .send({});

    expect(blocked.status).toBe(429);
    expect(blocked.body.success).toBe(false);
    expect(blocked.body.error.code).toBe("WEBHOOK_RATE_LIMIT_EXCEEDED");
    expect(blocked.body.error.message).toBe(
      "Too many webhook requests. Please try again later."
    );
  });

  it("Test C: webhook and normal API rate limits are independent", async () => {
    const app = createApp();
    const limit = env.WEBHOOK_RATE_LIMIT || 60;

    const promises = Array.from({ length: limit }).map(() =>
      request(app).post("/api/v1/payments/webhook").send({})
    );
    await Promise.all(promises);

    const webhookBlocked = await request(app)
      .post("/api/v1/payments/webhook")
      .send({});
    expect(webhookBlocked.status).toBe(429);
    expect(webhookBlocked.body.error.code).toBe("WEBHOOK_RATE_LIMIT_EXCEEDED");

    const loginResponse = await request(app)
      .post("/api/v1/users/login")
      .send({ email: "not-a-valid-email", password: "password" });

    // Should return 400 validation error rather than 429 rate limit exceeded
    expect(loginResponse.status).toBe(400);
    expect(loginResponse.body.error?.code).toBe("VALIDATION_ERROR");
  });

  it("Test D: safe proxy configuration ignores spoofed X-Forwarded-For when trust proxy is false", async () => {
    const app = createApp();

    expect(app.get("trust proxy")).toBe(false);

    const res1 = await request(app)
      .post("/api/v1/payments/webhook")
      .set("X-Forwarded-For", "203.0.113.1")
      .send({});

    const res2 = await request(app)
      .post("/api/v1/payments/webhook")
      .set("X-Forwarded-For", "203.0.113.2")
      .send({});

    const match1 = res1.headers.ratelimit?.match(/remaining=(\d+)/);
    const match2 = res2.headers.ratelimit?.match(/remaining=(\d+)/);

    expect(match1).toBeTruthy();
    expect(match2).toBeTruthy();

    const remaining1 = parseInt(match1[1], 10);
    const remaining2 = parseInt(match2[1], 10);

    expect(remaining2).toBe(remaining1 - 1);
  });

  it("Test D (continued): when trust proxy is enabled, respects client IP from trusted hop", async () => {
    const app = createApp();

    app.set("trust proxy", 1);

    const res1 = await request(app)
      .post("/api/v1/payments/webhook")
      .set("X-Forwarded-For", "203.0.113.10")
      .send({});

    const res2 = await request(app)
      .post("/api/v1/payments/webhook")
      .set("X-Forwarded-For", "203.0.113.20")
      .send({});

    const match1 = res1.headers.ratelimit?.match(/remaining=(\d+)/);
    const match2 = res2.headers.ratelimit?.match(/remaining=(\d+)/);

    expect(match1).toBeTruthy();
    expect(match2).toBeTruthy();

    const remaining1 = parseInt(match1[1], 10);
    const remaining2 = parseInt(match2[1], 10);

    expect(remaining1).toBe((env.WEBHOOK_RATE_LIMIT || 60) - 1);
    expect(remaining2).toBe((env.WEBHOOK_RATE_LIMIT || 60) - 1);
  });
});
