import { describe, it, expect } from "vitest";
import request from "supertest";
import { environmentSchema } from "./env.js";
import { createApp } from "../app.js";

const baseValidEnv = {
  JWT_SECRET: "12345678901234567890123456789012",
  MONGODB_URI: "mongodb://localhost:27017/test_db",
  RAZORPAY_KEY_ID: "rzp_test_key_id",
  RAZORPAY_KEY_SECRET: "rzp_test_key_secret",
  RAZORPAY_WEBHOOK_SECRET: "test_webhook_secret"
};

describe("CORS Configuration & Environment Validation", () => {
  describe("environmentSchema CORS_ORIGIN parsing", () => {
    it("1. defaults to ['http://localhost:3000'] in development when CORS_ORIGIN is omitted", () => {
      const result = environmentSchema.safeParse({
        ...baseValidEnv,
        NODE_ENV: "development"
      });

      expect(result.success).toBe(true);
      expect(result.data.CORS_ORIGIN).toEqual(["http://localhost:3000"]);
    });

    it("2. defaults to ['http://localhost:3000'] in test environment when CORS_ORIGIN is omitted", () => {
      const result = environmentSchema.safeParse({
        ...baseValidEnv,
        NODE_ENV: "test"
      });

      expect(result.success).toBe(true);
      expect(result.data.CORS_ORIGIN).toEqual(["http://localhost:3000"]);
    });

    it("3. parses a single allowed origin", () => {
      const result = environmentSchema.safeParse({
        ...baseValidEnv,
        CORS_ORIGIN: "http://localhost:3000"
      });

      expect(result.success).toBe(true);
      expect(result.data.CORS_ORIGIN).toEqual(["http://localhost:3000"]);
    });

    it("4. parses multiple comma-separated origins", () => {
      const result = environmentSchema.safeParse({
        ...baseValidEnv,
        CORS_ORIGIN: "http://localhost:3000,https://frontend.example.com"
      });

      expect(result.success).toBe(true);
      expect(result.data.CORS_ORIGIN).toEqual([
        "http://localhost:3000",
        "https://frontend.example.com"
      ]);
    });

    it("5. trims whitespace around each origin in comma-separated list", () => {
      const result = environmentSchema.safeParse({
        ...baseValidEnv,
        CORS_ORIGIN: "  http://localhost:3000  ,  https://frontend.example.com  , https://admin.example.com "
      });

      expect(result.success).toBe(true);
      expect(result.data.CORS_ORIGIN).toEqual([
        "http://localhost:3000",
        "https://frontend.example.com",
        "https://admin.example.com"
      ]);
    });

    it("6. rejects empty origin entries (trailing comma, double comma, or whitespace-only)", () => {
      const trailingCommaResult = environmentSchema.safeParse({
        ...baseValidEnv,
        CORS_ORIGIN: "http://localhost:3000,"
      });
      expect(trailingCommaResult.success).toBe(false);
      expect(trailingCommaResult.error.flatten().fieldErrors.CORS_ORIGIN).toContain(
        "CORS_ORIGIN cannot contain empty origin entries"
      );

      const doubleCommaResult = environmentSchema.safeParse({
        ...baseValidEnv,
        CORS_ORIGIN: "http://localhost:3000,,https://frontend.example.com"
      });
      expect(doubleCommaResult.success).toBe(false);
      expect(doubleCommaResult.error.flatten().fieldErrors.CORS_ORIGIN).toContain(
        "CORS_ORIGIN cannot contain empty origin entries"
      );

      const whitespaceEntryResult = environmentSchema.safeParse({
        ...baseValidEnv,
        CORS_ORIGIN: "http://localhost:3000,   ,https://frontend.example.com"
      });
      expect(whitespaceEntryResult.success).toBe(false);
      expect(whitespaceEntryResult.error.flatten().fieldErrors.CORS_ORIGIN).toContain(
        "CORS_ORIGIN cannot contain empty origin entries"
      );
    });

    it("7. rejects production startup when CORS_ORIGIN is missing or empty (no silent localhost fallback)", () => {
      const missingResult = environmentSchema.safeParse({
        ...baseValidEnv,
        NODE_ENV: "production"
      });
      expect(missingResult.success).toBe(false);
      expect(missingResult.error.flatten().fieldErrors.CORS_ORIGIN).toContain(
        "CORS_ORIGIN is required in production"
      );

      const whitespaceResult = environmentSchema.safeParse({
        ...baseValidEnv,
        NODE_ENV: "production",
        CORS_ORIGIN: "   "
      });
      expect(whitespaceResult.success).toBe(false);
      expect(whitespaceResult.error.flatten().fieldErrors.CORS_ORIGIN).toContain(
        "CORS_ORIGIN is required in production"
      );
    });

    it("8. rejects wildcard '*' as a CORS origin in production", () => {
      const wildcardOnlyResult = environmentSchema.safeParse({
        ...baseValidEnv,
        NODE_ENV: "production",
        CORS_ORIGIN: "*"
      });
      expect(wildcardOnlyResult.success).toBe(false);
      expect(wildcardOnlyResult.error.flatten().fieldErrors.CORS_ORIGIN).toContain(
        "Wildcard '*' is not allowed as a CORS origin in production"
      );

      const wildcardInListResult = environmentSchema.safeParse({
        ...baseValidEnv,
        NODE_ENV: "production",
        CORS_ORIGIN: "https://frontend.example.com, *"
      });
      expect(wildcardInListResult.success).toBe(false);
      expect(wildcardInListResult.error.flatten().fieldErrors.CORS_ORIGIN).toContain(
        "Wildcard '*' is not allowed as a CORS origin in production"
      );
    });

    it("9. accepts valid multiple origins in production", () => {
      const result = environmentSchema.safeParse({
        ...baseValidEnv,
        NODE_ENV: "production",
        CORS_ORIGIN: "https://shop.example.com, https://admin.example.com"
      });

      expect(result.success).toBe(true);
      expect(result.data.CORS_ORIGIN).toEqual([
        "https://shop.example.com",
        "https://admin.example.com"
      ]);
    });
  });

  describe("Express CORS Middleware HTTP Behavior", () => {
    it("allows a request from a single configured origin", async () => {
      const app = createApp({
        corsOrigin: ["http://localhost:3000"]
      });

      const response = await request(app)
        .get("/api/v1/health")
        .set("Origin", "http://localhost:3000");

      expect(response.status).toBe(200);
      expect(response.headers["access-control-allow-origin"]).toBe(
        "http://localhost:3000"
      );
      expect(response.headers["access-control-allow-credentials"]).toBe("true");
      expect(response.headers.vary).toContain("Origin");
    });

    it("allows requests from multiple comma-separated configured origins", async () => {
      const app = createApp({
        corsOrigin: [
          "https://frontend.example.com",
          "https://admin.example.com"
        ]
      });

      const response1 = await request(app)
        .get("/api/v1/health")
        .set("Origin", "https://frontend.example.com");

      expect(response1.status).toBe(200);
      expect(response1.headers["access-control-allow-origin"]).toBe(
        "https://frontend.example.com"
      );
      expect(response1.headers["access-control-allow-credentials"]).toBe("true");

      const response2 = await request(app)
        .get("/api/v1/health")
        .set("Origin", "https://admin.example.com");

      expect(response2.status).toBe(200);
      expect(response2.headers["access-control-allow-origin"]).toBe(
        "https://admin.example.com"
      );
      expect(response2.headers["access-control-allow-credentials"]).toBe("true");
    });

    it("does not set access-control-allow-origin for disallowed origins", async () => {
      const app = createApp({
        corsOrigin: ["https://frontend.example.com"]
      });

      const response = await request(app)
        .get("/api/v1/health")
        .set("Origin", "https://malicious.example.com");

      expect(response.status).toBe(200);
      expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    });

    it("handles preflight OPTIONS requests for allowed and disallowed origins", async () => {
      const app = createApp({
        corsOrigin: [
          "https://frontend.example.com",
          "https://admin.example.com"
        ]
      });

      const allowedPreflight = await request(app)
        .options("/api/v1/health")
        .set("Origin", "https://frontend.example.com")
        .set("Access-Control-Request-Method", "GET");

      expect(allowedPreflight.status).toBe(204);
      expect(allowedPreflight.headers["access-control-allow-origin"]).toBe(
        "https://frontend.example.com"
      );
      expect(allowedPreflight.headers["access-control-allow-methods"]).toBeDefined();

      const disallowedPreflight = await request(app)
        .options("/api/v1/health")
        .set("Origin", "https://malicious.example.com")
        .set("Access-Control-Request-Method", "GET");

      expect(disallowedPreflight.status).toBe(204);
      expect(disallowedPreflight.headers["access-control-allow-origin"]).toBeUndefined();
    });

    it("allows normal requests without an Origin header", async () => {
      const app = createApp({
        corsOrigin: ["https://frontend.example.com"]
      });

      const response = await request(app).get("/api/v1/health");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    });
  });
});
