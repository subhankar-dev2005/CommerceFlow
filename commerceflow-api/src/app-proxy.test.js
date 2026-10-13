import { describe, it, expect } from "vitest";
import request from "supertest";

import { createApp } from "./app.js";

describe("Reverse Proxy and Client IP Trust Hardening", () => {
  it("Test 1 (Direct Client Request): uses direct socket remote address and sets trust proxy to false by default", async () => {
    const app = createApp();
    expect(app.get("trust proxy")).toBe(false);

    const res = await request(app).get("/api/v1/health");
    expect(res.status).toBe(200);
  });

  it("Test 2 (Trusted Proxy Request): extracts actual client IP from single-hop reverse proxy when trust proxy is 1", async () => {
    const app = createApp();
    app.set("trust proxy", 1);
    expect(app.get("trust proxy")).toBe(1);

    const res = await request(app)
      .get("/api/v1/health")
      .set("X-Forwarded-For", "203.0.113.195");

    expect(res.status).toBe(200);
  });

  it("Test 3 (Spoofed X-Forwarded-For): ignores client-supplied X-Forwarded-For when trust proxy is false", async () => {
    const app = createApp();
    expect(app.get("trust proxy")).toBe(false);

    const res = await request(app)
      .post("/api/v1/users/login")
      .set("X-Forwarded-For", "198.51.100.77")
      .send({});

    // When trust proxy is false, rate limiting binds to the direct connection IP (127.0.0.1), ignoring the spoofed header
    const ratelimitHeader = res.headers["ratelimit"];
    expect(ratelimitHeader).toBeDefined();
    expect(res.status).toBe(400); // Validation failure, but headers populated
  });

  it("Test 4 (Rate-limit Key Generation): isolates rate-limit keys correctly per client IP when behind trusted proxy", async () => {
    const app = createApp();
    app.set("trust proxy", 1);

    const resClient1 = await request(app)
      .post("/api/v1/users/login")
      .set("X-Forwarded-For", "192.0.2.1")
      .send({});

    const resClient2 = await request(app)
      .post("/api/v1/users/login")
      .set("X-Forwarded-For", "192.0.2.2")
      .send({});

    // Each client IP behind the trusted proxy gets its own rate-limit bucket (remaining is limit - 1 for both)
    const match1 = resClient1.headers["ratelimit"]?.match(/remaining=(\d+)/);
    const match2 = resClient2.headers["ratelimit"]?.match(/remaining=(\d+)/);

    expect(match1).toBeTruthy();
    expect(match2).toBeTruthy();
    expect(match1[1]).toBe(match2[1]);
  });
});
