import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

import { createApp } from "../app.js";
import * as mongodb from "../database/mongodb.js";

describe("Health Routes", () => {
  let app;

  beforeEach(() => {
    vi.restoreAllMocks();
    app = createApp();
  });

  describe("GET /api/v1/health", () => {
    it("returns HTTP 200 with status ok and requestId", async () => {
      const response = await request(app).get("/api/v1/health");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data?.status).toBe("ok");
      expect(response.body.requestId).toBeDefined();
      expect(typeof response.body.requestId).toBe("string");
      expect(response.body.requestId.length).toBeGreaterThan(0);
    });
  });

  describe("GET /api/v1/health/live", () => {
    it("returns HTTP 200 with status alive and requestId", async () => {
      const response = await request(app).get("/api/v1/health/live");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data?.status).toBe("alive");
      expect(response.body.requestId).toBeDefined();
      expect(typeof response.body.requestId).toBe("string");
      expect(response.body.requestId.length).toBeGreaterThan(0);
    });
  });

  describe("GET /api/v1/health/ready", () => {
    it("returns HTTP 200 with status ready when MongoDB is connected", async () => {
      vi.spyOn(mongodb, "getMongoDBStatus").mockReturnValue({
        status: "connected",
        readyState: 1
      });
      // Mock the real ping so the test does not need a live MongoDB connection
      vi.spyOn(mongodb, "pingMongoDB").mockResolvedValue(undefined);

      const response = await request(app).get("/api/v1/health/ready");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data?.status).toBe("ready");
    });

    it("returns HTTP 503 with status not_ready when MongoDB is disconnected", async () => {
      vi.spyOn(mongodb, "getMongoDBStatus").mockReturnValue({
        status: "disconnected",
        readyState: 0
      });

      const response = await request(app).get("/api/v1/health/ready");

      expect(response.status).toBe(503);
      expect(response.body.success).toBe(false);
      expect(response.body.data?.status).toBe("not_ready");
    });
  });

  describe("Global API rate limiter exemption", () => {
    it("does not count health endpoint requests toward the global rate limiter limit", async () => {
      const healthRes = await request(app).get("/api/v1/health/");
      expect(healthRes.status).toBe(200);
      expect(healthRes.headers["ratelimit"]).toBeUndefined();

      for (let i = 0; i < 5; i += 1) {
        await request(app).get("/api/v1/health/live");
      }

      const nonHealthRes = await request(app)
        .get("/api/v1/users/profile");

      expect(nonHealthRes.headers["ratelimit"]).toBeDefined();
      expect(nonHealthRes.headers["ratelimit"]).toContain("limit=100");
      expect(nonHealthRes.headers["ratelimit"]).toContain("remaining=99");
    });

    it("does not return 429 when repeated requests are made to health endpoints", async () => {
      const count = 105;
      const promises = Array.from({ length: count }).map(() =>
        request(app).get("/api/v1/health/live")
      );

      const responses = await Promise.all(promises);

      for (const res of responses) {
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      }
    });

    it("ensures /api/v1/health/live remains accessible", async () => {
      const response = await request(app).get("/api/v1/health/live");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data?.status).toBe("alive");
    });

    it("ensures /api/v1/health/ready remains accessible", async () => {
      vi.spyOn(mongodb, "getMongoDBStatus").mockReturnValue({
        status: "connected",
        readyState: 1
      });
      vi.spyOn(mongodb, "pingMongoDB").mockResolvedValue(undefined);

      const response = await request(app).get("/api/v1/health/ready");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data?.status).toBe("ready");
    });

    it("ensures ordinary non-health API endpoints remain subject to the global rate limiter", async () => {
      const response = await request(app)
        .get("/api/v1/users/profile");

      expect(response.headers["ratelimit"]).toBeDefined();
      expect(response.headers["ratelimit"]).toContain("limit=100");
    });

    it("ensures the existing webhook exemption continues to work independently", async () => {
      const response = await request(app)
        .post("/api/v1/payments/webhook")
        .send({});

      expect(response.headers["ratelimit"]).toBeDefined();
      expect(response.headers["ratelimit"]).toContain("limit=60");
      expect(response.headers["ratelimit"]).not.toContain("limit=100");
    });
  });
});
