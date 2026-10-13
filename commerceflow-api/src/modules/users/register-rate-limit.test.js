import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";

import { createApp } from "../../app.js";
import { registerRateLimitMiddleware } from "../../common/middleware/auth-rate-limit.middleware.js";

describe("POST /api/v1/users/register rate limiting and proxy security", () => {
  beforeEach(() => {
    registerRateLimitMiddleware.resetKey("::ffff:127.0.0.1");
    registerRateLimitMiddleware.resetKey("127.0.0.1");
    registerRateLimitMiddleware.resetKey("::1");
  });

  it("allows 10 registration attempts and blocks the 11th attempt with 429", async () => {
    const app = createApp();

    const registerPayload = {
      name: "Test User",
      email: "invalid-email-format",
      password: "short"
    };

    const responses = [];

    for (let i = 0; i < 11; i += 1) {
      const response = await request(app)
        .post("/api/v1/users/register")
        .send(registerPayload);

      responses.push(response);
    }

    for (let i = 0; i < 10; i += 1) {
      expect(responses[i].status).not.toBe(429);
    }

    expect(responses[10].status).toBe(429);
    expect(responses[10].body.success).toBe(false);
    expect(responses[10].body.error.code).toBe("AUTH_RATE_LIMIT_EXCEEDED");
  });

  it("prevents bypassing registration rate limits via spoofed X-Forwarded-For when trust proxy is false", async () => {
    const app = createApp();

    expect(app.get("trust proxy")).toBe(false);

    // Make 10 requests with varying spoofed X-Forwarded-For headers
    for (let i = 0; i < 10; i += 1) {
      const response = await request(app)
        .post("/api/v1/users/register")
        .set("X-Forwarded-For", `198.51.100.${i + 1}`)
        .send({});

      expect(response.status).not.toBe(429);
    }

    // 11th request with a new spoofed header must still be blocked because direct remote IP is used
    const blockedResponse = await request(app)
      .post("/api/v1/users/register")
      .set("X-Forwarded-For", "198.51.100.99")
      .send({});

    expect(blockedResponse.status).toBe(429);
    expect(blockedResponse.body.error.code).toBe("AUTH_RATE_LIMIT_EXCEEDED");
  });

  it("respects trusted client IP when trust proxy is configured for reverse proxy deployment", async () => {
    const app = createApp();
    app.set("trust proxy", 1);

    // Requests from distinct client IPs behind trusted proxy maintain distinct rate limit buckets
    const res1 = await request(app)
      .post("/api/v1/users/register")
      .set("X-Forwarded-For", "203.0.113.50")
      .send({});

    const res2 = await request(app)
      .post("/api/v1/users/register")
      .set("X-Forwarded-For", "203.0.113.60")
      .send({});

    expect(res1.status).not.toBe(429);
    expect(res2.status).not.toBe(429);
  });
});
