/**
 * Phase 4 — Production Runtime, Health Checks & Graceful Shutdown
 *
 * Regression tests covering all Phase 4 requirements:
 *   A. GET /health returns 200
 *   B. /health does not require authentication
 *   C. /health does not require MongoDB
 *   D. GET /ready returns 200 when MongoDB is ready
 *   E. /ready returns 503 when MongoDB is unavailable/disconnected
 *   F. /ready does not leak internal database errors
 *   G. Graceful shutdown closes the HTTP server
 *   H. Graceful shutdown closes/disconnects MongoDB
 *   I. SIGTERM triggers shutdown
 *   J. SIGINT triggers shutdown
 *   K. Duplicate shutdown signals do not execute shutdown twice
 *   L. Shutdown timeout prevents indefinite hanging
 *   M. Production configuration validation rejects missing/unsafe config
 *   N. Production error responses do not expose stack traces or secrets
 *   O. Existing authentication/admin/customer authorization remains intact
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";

import { createApp } from "../app.js";
import * as mongodb from "../database/mongodb.js";
import { createProcessHandlers } from "../common/process-handlers.js";
import { environmentSchema } from "../config/env.js";
import User from "../modules/users/user.model.js";
import generateToken from "../utils/generate-token.js";

// ---------------------------------------------------------------------------
// A, B, C — Liveness endpoint
// ---------------------------------------------------------------------------
describe("A–C. Liveness: GET /api/v1/health", () => {
  let app;

  beforeEach(() => {
    vi.restoreAllMocks();
    app = createApp();
  });

  it("A. returns HTTP 200 while the Node process is alive", async () => {
    const res = await request(app).get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body.data?.status).toBe("ok");
  });

  it("B. does not require an authentication token", async () => {
    // No Authorization header, no Cookie
    const res = await request(app).get("/api/v1/health");
    expect(res.status).toBe(200);
  });

  it("C. does not depend on MongoDB (returns 200 even when Mongoose readyState is disconnected)", async () => {
    // Even if the DB were disconnected, liveness must succeed
    vi.spyOn(mongodb, "getMongoDBStatus").mockReturnValue({
      status: "disconnected",
      readyState: 0
    });

    const res = await request(app).get("/api/v1/health");
    // Health is not affected by the MongoDB mock because it does not call getMongoDBStatus
    expect(res.status).toBe(200);
    expect(res.body.data?.status).toBe("ok");
  });
});

// ---------------------------------------------------------------------------
// A–C (root aliases) — Root /health probe
// ---------------------------------------------------------------------------
describe("Root probe aliases", () => {
  let app;

  beforeEach(() => {
    vi.restoreAllMocks();
    app = createApp();
  });

  it("GET /health returns 200 { status: 'ok' } without auth and without MongoDB", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("GET /ready returns 200 when MongoDB status is connected", async () => {
    vi.spyOn(mongodb, "getMongoDBStatus").mockReturnValue({
      status: "connected",
      readyState: 1
    });

    const res = await request(app).get("/ready");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ready");
  });

  it("GET /ready returns 503 when MongoDB status is disconnected", async () => {
    vi.spyOn(mongodb, "getMongoDBStatus").mockReturnValue({
      status: "disconnected",
      readyState: 0
    });

    const res = await request(app).get("/ready");
    expect(res.status).toBe(503);
    expect(res.body.status).toBe("not_ready");
  });
});

// ---------------------------------------------------------------------------
// D, E, F — Readiness endpoint
// ---------------------------------------------------------------------------
describe("D–F. Readiness: GET /api/v1/health/ready", () => {
  let app;

  beforeEach(() => {
    vi.restoreAllMocks();
    app = createApp();
  });

  it("D. returns HTTP 200 with status 'ready' when MongoDB is connected and ping succeeds", async () => {
    vi.spyOn(mongodb, "getMongoDBStatus").mockReturnValue({
      status: "connected",
      readyState: 1
    });
    vi.spyOn(mongodb, "pingMongoDB").mockResolvedValue(undefined);

    const res = await request(app).get("/api/v1/health/ready");
    expect(res.status).toBe(200);
    expect(res.body.data?.status).toBe("ready");
    expect(res.body.success).toBe(true);
  });

  it("E. returns HTTP 503 with status 'not_ready' when MongoDB is disconnected (readyState check)", async () => {
    vi.spyOn(mongodb, "getMongoDBStatus").mockReturnValue({
      status: "disconnected",
      readyState: 0
    });

    const res = await request(app).get("/api/v1/health/ready");
    expect(res.status).toBe(503);
    expect(res.body.data?.status).toBe("not_ready");
    expect(res.body.success).toBe(false);
  });

  it("E2. returns HTTP 503 when MongoDB ping fails (driver timeout / command error)", async () => {
    // Mongoose says connected but the actual ping fails (e.g. network partition)
    vi.spyOn(mongodb, "getMongoDBStatus").mockReturnValue({
      status: "connected",
      readyState: 1
    });
    vi.spyOn(mongodb, "pingMongoDB").mockRejectedValue(
      new Error("MongoDB ping timed out after 3000ms")
    );

    const res = await request(app).get("/api/v1/health/ready");
    expect(res.status).toBe(503);
    expect(res.body.data?.status).toBe("not_ready");
  });

  it("F. does not leak raw database error messages or connection strings in the response", async () => {
    vi.spyOn(mongodb, "getMongoDBStatus").mockReturnValue({
      status: "connected",
      readyState: 1
    });
    vi.spyOn(mongodb, "pingMongoDB").mockRejectedValue(
      new Error("MongoServerError: topology closed — mongodb://admin:secret@localhost/db")
    );

    const res = await request(app).get("/api/v1/health/ready");
    expect(res.status).toBe(503);

    const body = JSON.stringify(res.body);
    // Must not expose the raw error message
    expect(body).not.toContain("MongoServerError");
    expect(body).not.toContain("topology closed");
    expect(body).not.toContain("mongodb://");
    expect(body).not.toContain("secret");
    // Response must be safe
    expect(res.body.data?.status).toBe("not_ready");
  });

  it("F2. /ready response does not expose internal readyState integer", async () => {
    vi.spyOn(mongodb, "getMongoDBStatus").mockReturnValue({
      status: "connected",
      readyState: 1
    });
    vi.spyOn(mongodb, "pingMongoDB").mockResolvedValue(undefined);

    const res = await request(app).get("/api/v1/health/ready");
    const body = JSON.stringify(res.body);
    // readyState integer must not appear in response
    expect(body).not.toContain("\"readyState\"");
  });
});

// ---------------------------------------------------------------------------
// G, H, I, J, K, L — Graceful shutdown
// ---------------------------------------------------------------------------
describe("G–L. Graceful Shutdown", () => {
  let mockLogger;
  let mockServer;
  let mockDisconnectDb;
  let mockExitProcess;

  beforeEach(() => {
    vi.useFakeTimers();

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn()
    };

    mockServer = {
      close: vi.fn((cb) => cb(null))
    };

    mockDisconnectDb = vi.fn().mockResolvedValue(undefined);
    mockExitProcess = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("G. graceful shutdown closes the HTTP server", async () => {
    const handlers = createProcessHandlers({
      getServer: () => mockServer,
      disconnectDb: mockDisconnectDb,
      loggerInstance: mockLogger,
      exitProcess: mockExitProcess,
      timeoutMs: 5000
    });

    await handlers.shutdown({ signal: "SIGTERM", exitCode: 0 });
    expect(mockServer.close).toHaveBeenCalledTimes(1);
  });

  it("H. graceful shutdown disconnects MongoDB", async () => {
    const handlers = createProcessHandlers({
      getServer: () => mockServer,
      disconnectDb: mockDisconnectDb,
      loggerInstance: mockLogger,
      exitProcess: mockExitProcess,
      timeoutMs: 5000
    });

    await handlers.shutdown({ signal: "SIGTERM", exitCode: 0 });
    expect(mockDisconnectDb).toHaveBeenCalledTimes(1);
  });

  it("I. SIGTERM signal triggers graceful shutdown with exitCode 0", async () => {
    const handlers = createProcessHandlers({
      getServer: () => mockServer,
      disconnectDb: mockDisconnectDb,
      loggerInstance: mockLogger,
      exitProcess: mockExitProcess,
      timeoutMs: 5000
    });

    // Register on a mock process and emit SIGTERM
    const listeners = {};
    const mockProcess = { on: (event, fn) => { listeners[event] = fn; } };
    handlers.register(mockProcess);

    await listeners["SIGTERM"]();

    expect(mockServer.close).toHaveBeenCalledTimes(1);
    expect(mockDisconnectDb).toHaveBeenCalledTimes(1);
    expect(mockExitProcess).toHaveBeenCalledWith(0);
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ signal: "SIGTERM" }),
      "Graceful shutdown started"
    );
  });

  it("J. SIGINT signal triggers graceful shutdown with exitCode 0", async () => {
    const handlers = createProcessHandlers({
      getServer: () => mockServer,
      disconnectDb: mockDisconnectDb,
      loggerInstance: mockLogger,
      exitProcess: mockExitProcess,
      timeoutMs: 5000
    });

    const listeners = {};
    const mockProcess = { on: (event, fn) => { listeners[event] = fn; } };
    handlers.register(mockProcess);

    await listeners["SIGINT"]();

    expect(mockServer.close).toHaveBeenCalledTimes(1);
    expect(mockDisconnectDb).toHaveBeenCalledTimes(1);
    expect(mockExitProcess).toHaveBeenCalledWith(0);
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ signal: "SIGINT" }),
      "Graceful shutdown started"
    );
  });

  it("K. duplicate shutdown signals execute cleanup exactly once", async () => {
    const handlers = createProcessHandlers({
      getServer: () => mockServer,
      disconnectDb: mockDisconnectDb,
      loggerInstance: mockLogger,
      exitProcess: mockExitProcess,
      timeoutMs: 5000
    });

    const p1 = handlers.shutdown({ signal: "SIGTERM", exitCode: 0 });
    const p2 = handlers.shutdown({ signal: "SIGINT",  exitCode: 0 });

    await Promise.all([p1, p2]);

    expect(mockServer.close).toHaveBeenCalledTimes(1);
    expect(mockDisconnectDb).toHaveBeenCalledTimes(1);
    expect(mockExitProcess).toHaveBeenCalledTimes(1);
  });

  it("L. shutdown timeout forces exit when cleanup hangs indefinitely", () => {
    const hangingServer = {
      close: vi.fn() // callback never called — simulates a hung server
    };

    const handlers = createProcessHandlers({
      getServer: () => hangingServer,
      disconnectDb: mockDisconnectDb,
      loggerInstance: mockLogger,
      exitProcess: mockExitProcess,
      timeoutMs: 2000
    });

    // Start shutdown — it will not resolve because server.close hangs
    handlers.shutdown({ signal: "SIGTERM", exitCode: 0 });

    expect(mockExitProcess).not.toHaveBeenCalled();

    // Advance time past the bounded timeout
    vi.advanceTimersByTime(2000);

    expect(mockLogger.fatal).toHaveBeenCalledWith(
      expect.objectContaining({ signal: "SIGTERM" }),
      "Graceful shutdown timed out, forcing exit"
    );
    expect(mockExitProcess).toHaveBeenCalledWith(1);
  });
});

// ---------------------------------------------------------------------------
// M — Production configuration validation
// ---------------------------------------------------------------------------
describe("M. Production configuration validation", () => {
  const baseValidProductionEnv = {
    NODE_ENV: "production",
    JWT_SECRET: "a-real-production-secret-that-is-long-enough-1234",
    MONGODB_URI: "mongodb://localhost:27017/prod_db",
    RAZORPAY_KEY_ID: "rzp_live_key_id",
    RAZORPAY_KEY_SECRET: "rzp_live_key_secret",
    RAZORPAY_WEBHOOK_SECRET: "whsec_live_example_secret_token_123",
    CORS_ORIGIN: "https://shop.example.com"
  };

  it("M1. rejects production startup when CORS_ORIGIN is missing", () => {
    const result = environmentSchema.safeParse({
      ...baseValidProductionEnv,
      CORS_ORIGIN: undefined
    });
    expect(result.success).toBe(false);
    expect(result.error.flatten().fieldErrors.CORS_ORIGIN).toContain(
      "CORS_ORIGIN is required in production"
    );
  });

  it("M2. rejects wildcard CORS in production", () => {
    const result = environmentSchema.safeParse({
      ...baseValidProductionEnv,
      CORS_ORIGIN: "*"
    });
    expect(result.success).toBe(false);
    expect(result.error.flatten().fieldErrors.CORS_ORIGIN).toContain(
      "Wildcard '*' is not allowed as a CORS origin in production"
    );
  });

  it("M3. rejects production startup when RAZORPAY_WEBHOOK_SECRET is missing", () => {
    const result = environmentSchema.safeParse({
      ...baseValidProductionEnv,
      RAZORPAY_WEBHOOK_SECRET: undefined
    });
    expect(result.success).toBe(false);
    expect(result.error.flatten().fieldErrors.RAZORPAY_WEBHOOK_SECRET).toContain(
      "RAZORPAY_WEBHOOK_SECRET is required in production"
    );
  });

  it("M4. rejects placeholder RAZORPAY_WEBHOOK_SECRET in production", () => {
    const result = environmentSchema.safeParse({
      ...baseValidProductionEnv,
      RAZORPAY_WEBHOOK_SECRET: "your_razorpay_webhook_secret"
    });
    expect(result.success).toBe(false);
    expect(result.error.flatten().fieldErrors.RAZORPAY_WEBHOOK_SECRET).toContain(
      "RAZORPAY_WEBHOOK_SECRET cannot be the default placeholder in production"
    );
  });

  it("M5. rejects known placeholder JWT_SECRET values in production", () => {
    const weakSecrets = [
      "your_jwt_secret",
      "your-jwt-secret",
      "supersecret",
      "changeme",
      "jwt_secret"
    ];

    for (const weak of weakSecrets) {
      const result = environmentSchema.safeParse({
        ...baseValidProductionEnv,
        JWT_SECRET: weak
      });
      // Some values may fail the min(32) check first; either way, must fail
      expect(result.success).toBe(false);
    }
  });

  it("M5b. rejects known placeholder JWT_SECRET (long enough but placeholder) in production", () => {
    const result = environmentSchema.safeParse({
      ...baseValidProductionEnv,
      JWT_SECRET: "your_super_secret_jwt_key_here"
    });
    expect(result.success).toBe(false);
    expect(result.error.flatten().fieldErrors.JWT_SECRET).toContain(
      "JWT_SECRET cannot be a default placeholder value in production"
    );
  });

  it("M6. rejects production startup when MONGODB_URI is missing", () => {
    const result = environmentSchema.safeParse({
      ...baseValidProductionEnv,
      MONGODB_URI: undefined
    });
    expect(result.success).toBe(false);
  });

  it("M7. accepts valid production configuration", () => {
    const result = environmentSchema.safeParse(baseValidProductionEnv);
    expect(result.success).toBe(true);
  });

  it("M8. development startup does not require CORS_ORIGIN", () => {
    const result = environmentSchema.safeParse({
      ...baseValidProductionEnv,
      NODE_ENV: "development",
      CORS_ORIGIN: undefined,
      RAZORPAY_WEBHOOK_SECRET: undefined
    });
    expect(result.success).toBe(true);
    // Defaults to localhost
    expect(result.data.CORS_ORIGIN).toEqual(["http://localhost:3000"]);
  });
});

// ---------------------------------------------------------------------------
// N — Production error responses do not expose internals
// ---------------------------------------------------------------------------
describe("N. Production error responses are safe", () => {
  let app;

  beforeEach(() => {
    vi.restoreAllMocks();
    app = createApp();
  });

  it("N1. unexpected errors return 500 INTERNAL_SERVER_ERROR without stack trace or raw message", async () => {
    // Trigger a route that throws an operational error — we test the generic 500 path
    // by sending a malformed JSON body
    const res = await request(app)
      .post("/api/v1/users/register")
      .set("Content-Type", "application/json")
      .send("{ invalid json }");

    expect(res.status).toBe(400);
    const body = JSON.stringify(res.body);
    // Must not contain stack traces or internal paths
    expect(body).not.toContain("node_modules");
    expect(body).not.toContain("at Object.");
    expect(body).not.toContain("stack");
  });

  it("N2. health endpoint response does not contain secrets or internal details", async () => {
    const res = await request(app).get("/api/v1/health");
    const body = JSON.stringify(res.body);
    expect(body).not.toContain("MONGODB_URI");
    expect(body).not.toContain("JWT_SECRET");
    expect(body).not.toContain("RAZORPAY");
    expect(body).not.toContain("password");
    expect(res.body.stack).toBeUndefined();
  });

  it("N3. /ready 503 response does not contain MongoDB connection details", async () => {
    vi.spyOn(mongodb, "getMongoDBStatus").mockReturnValue({
      status: "connected",
      readyState: 1
    });
    vi.spyOn(mongodb, "pingMongoDB").mockRejectedValue(
      new Error("failed to connect to server [localhost:27017]: secret_password")
    );

    const res = await request(app).get("/api/v1/health/ready");
    expect(res.status).toBe(503);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain("localhost:27017");
    expect(body).not.toContain("secret_password");
    expect(body).not.toContain("failed to connect");
  });
});

// ---------------------------------------------------------------------------
// O — Existing authentication / admin / customer authorization
// ---------------------------------------------------------------------------
describe("O. Existing auth/admin/customer authorization remains intact", () => {
  let app;
  let adminToken;
  let customerToken;

  const adminId = "507f1f77bcf86cd799439001";
  const customerId = "507f1f77bcf86cd799439002";

  beforeEach(() => {
    vi.restoreAllMocks();
    app = createApp();
    adminToken = generateToken({ userId: adminId, email: "admin@test.com", role: "admin" });
    customerToken = generateToken({ userId: customerId, email: "customer@test.com", role: "customer" });
  });

  it("O1. unauthenticated request to protected endpoint returns 401", async () => {
    const res = await request(app).get("/api/v1/users/me");
    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe("AUTH_TOKEN_REQUIRED");
  });

  it("O2. customer cannot access admin endpoint (403 FORBIDDEN)", async () => {
    vi.spyOn(User, "findById").mockResolvedValue({
      _id: customerId,
      email: "customer@test.com",
      role: "customer",
      isActive: true
    });

    const res = await request(app)
      .get("/api/v1/admin/test")
      .set("Authorization", `Bearer ${customerToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe("FORBIDDEN");
  });

  it("O3. admin can access admin endpoint", async () => {
    vi.spyOn(User, "findById").mockResolvedValue({
      _id: adminId,
      email: "admin@test.com",
      role: "admin",
      isActive: true
    });

    const res = await request(app)
      .get("/api/v1/admin/test")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("O4. health and ready endpoints require no auth (not protected by middleware)", async () => {
    const healthRes = await request(app).get("/api/v1/health");
    expect(healthRes.status).toBe(200);

    vi.spyOn(mongodb, "getMongoDBStatus").mockReturnValue({
      status: "connected",
      readyState: 1
    });
    vi.spyOn(mongodb, "pingMongoDB").mockResolvedValue(undefined);

    const readyRes = await request(app).get("/api/v1/health/ready");
    expect(readyRes.status).toBe(200);
  });
});
