import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import Product from "./product.model.js";
import {
  catalogRateLimitMiddleware,
  authRateLimitMiddleware
} from "../../common/middleware/auth-rate-limit.middleware.js";

describe("Catalog Rate Limiter & Bucket Isolation", () => {
  let app;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(Product, "distinct").mockResolvedValue(["Accessories", "Footwear", "Clothing"]);
    vi.spyOn(Product, "find").mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([])
    });
    vi.spyOn(Product, "countDocuments").mockResolvedValue(0);

    catalogRateLimitMiddleware.resetKey("127.0.0.1");
    catalogRateLimitMiddleware.resetKey("::1");
    catalogRateLimitMiddleware.resetKey("::ffff:127.0.0.1");
    authRateLimitMiddleware.resetKey("127.0.0.1");
    authRateLimitMiddleware.resetKey("::1");
    authRateLimitMiddleware.resetKey("::ffff:127.0.0.1");
    app = createApp();
  });

  it("1. GET /api/v1/products/categories returns catalog ratelimit header with limit=300", async () => {
    const res = await request(app).get("/api/v1/products/categories");
    expect(res.status).toBe(200);
    expect(res.headers["ratelimit"]).toBeDefined();
    expect(res.headers["ratelimit"]).toContain("limit=300");
  });

  it("2. GET /api/v1/products returns catalog ratelimit header with limit=300", async () => {
    const res = await request(app).get("/api/v1/products?limit=12&sortBy=createdAt&sortOrder=desc");
    expect(res.status).toBe(200);
    expect(res.headers["ratelimit"]).toBeDefined();
    expect(res.headers["ratelimit"]).toContain("limit=300");
  });

  it("3. Catalog browsing requests do not consume global rate limit quota on sensitive endpoints", async () => {
    // Perform multiple catalog requests
    for (let i = 0; i < 5; i += 1) {
      await request(app).get("/api/v1/products/categories");
    }

    // Check sensitive endpoint governed by global limiter
    const profileRes = await request(app).get("/api/v1/users/profile");
    expect(profileRes.headers["ratelimit"]).toBeDefined();
    expect(profileRes.headers["ratelimit"]).toContain("limit=100");
    // Global quota remaining must reflect only the profile request (99 remaining), not 94
    expect(profileRes.headers["ratelimit"]).toContain("remaining=99");
  });

  it("4. POST /api/v1/products is not governed by catalog limiter and remains in global limiter bucket", async () => {
    const res = await request(app).post("/api/v1/products").send({});
    expect(res.headers["ratelimit"]).toBeDefined();
    expect(res.headers["ratelimit"]).toContain("limit=100");
    expect(res.headers["ratelimit"]).not.toContain("limit=300");
  });

  it("5. catalogRateLimitMiddleware resetKey cleanly clears loopback quota", async () => {
    const res1 = await request(app).get("/api/v1/products/categories");
    expect(res1.headers["ratelimit"]).toContain("remaining=299");

    catalogRateLimitMiddleware.resetKey("127.0.0.1");

    const res2 = await request(app).get("/api/v1/products/categories");
    expect(res2.headers["ratelimit"]).toContain("remaining=299");
  });

  it("6. genuine excessive catalog requests (>300) receive HTTP 429 RATE_LIMIT_EXCEEDED", async () => {
    // Dispatch 300 successful requests
    const promises = Array.from({ length: 300 }).map(() =>
      request(app).get("/api/v1/products/categories")
    );
    await Promise.all(promises);

    // 301st request must be rejected with 429
    const blockedRes = await request(app).get("/api/v1/products/categories");
    expect(blockedRes.status).toBe(429);
    expect(blockedRes.body.success).toBe(false);
    expect(blockedRes.body.error.code).toBe("RATE_LIMIT_EXCEEDED");
    expect(blockedRes.body.error.message).toBe("Too many catalog requests, please try again later.");
    expect(blockedRes.headers["retry-after"]).toBeDefined();
  });
});
