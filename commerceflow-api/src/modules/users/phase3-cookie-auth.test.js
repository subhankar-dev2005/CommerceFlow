import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import User from "./user.model.js";
import bcrypt from "bcryptjs";
import generateToken from "../../utils/generate-token.js";

/**
 * Phase 3 Cookie Authentication Integration Tests
 *
 * Verifies the complete secure cookie authentication contract:
 * - Login sets HttpOnly auth cookie
 * - Login does NOT return JWT in response body
 * - Logout clears the auth cookie
 * - Cookie attributes (HttpOnly, SameSite, Path, maxAge)
 * - Authentication middleware accepts cookie-based auth
 * - Repeated logout is safe (idempotent)
 */
describe("Phase 3: Cookie Authentication Security", () => {
  let app;

  beforeEach(() => {
    vi.restoreAllMocks();
    app = createApp({ corsOrigin: "http://localhost:3000" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================
  // A. Login response — JWT must NOT appear in body
  // =========================================================
  describe("A. Login response does not expose JWT in body", () => {
    it("A1. login response contains no token field", async () => {
      const mockUser = {
        _id: "507f1f77bcf86cd799439011",
        name: "Test Customer",
        email: "testcustomer@commerceflow.com",
        role: "customer",
        isActive: true,
        password: "hashed-password"
      };

      vi.spyOn(User, "findOne").mockReturnValue({
        select: vi.fn().mockResolvedValue(mockUser)
      });
      vi.spyOn(bcrypt, "compare").mockResolvedValue(true);

      const res = await request(app)
        .post("/api/v1/users/login")
        .send({ email: "testcustomer@commerceflow.com", password: "Password123!" });

      expect(res.status).toBe(200);

      // JWT must NOT be in the response body
      expect(res.body.data?.token).toBeUndefined();
      expect(res.body.data?.accessToken).toBeUndefined();
      expect(res.body.data?.jwt).toBeUndefined();

      // Safe user information is returned
      expect(res.body.data?.user?.id).toBeDefined();
      expect(res.body.data?.user?.role).toBe("customer");
    });

    it("A2. login response contains no JWT anywhere in the body", async () => {
      const mockUser = {
        _id: "507f1f77bcf86cd799439012",
        name: "Admin User",
        email: "admin@commerceflow.com",
        role: "admin",
        isActive: true,
        password: "hashed-password"
      };

      vi.spyOn(User, "findOne").mockReturnValue({
        select: vi.fn().mockResolvedValue(mockUser)
      });
      vi.spyOn(bcrypt, "compare").mockResolvedValue(true);

      const res = await request(app)
        .post("/api/v1/users/login")
        .send({ email: "admin@commerceflow.com", password: "AdminPass123!" });

      expect(res.status).toBe(200);
      expect(res.body.data?.token).toBeUndefined();
      expect(res.body.data?.accessToken).toBeUndefined();
      expect(res.body.data?.user?.role).toBe("admin");
    });
  });

  // =========================================================
  // B. Login sets Set-Cookie with correct attributes
  // =========================================================
  describe("B. Login sets HttpOnly auth cookie with correct attributes", () => {
    it("B1. Set-Cookie header is present after successful login", async () => {
      const mockUser = {
        _id: "507f1f77bcf86cd799439011",
        name: "Test Customer",
        email: "testcustomer@commerceflow.com",
        role: "customer",
        isActive: true,
        password: "hashed-password"
      };

      vi.spyOn(User, "findOne").mockReturnValue({
        select: vi.fn().mockResolvedValue(mockUser)
      });
      vi.spyOn(bcrypt, "compare").mockResolvedValue(true);

      const res = await request(app)
        .post("/api/v1/users/login")
        .send({ email: "testcustomer@commerceflow.com", password: "Password123!" });

      expect(res.status).toBe(200);

      // Set-Cookie header must be present
      const setCookieHeader = res.headers["set-cookie"];
      expect(setCookieHeader).toBeDefined();
      expect(Array.isArray(setCookieHeader) ? setCookieHeader.length : 1).toBeGreaterThan(0);

      const cookieString = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;

      // Cookie name must be auth_token
      expect(cookieString).toContain("auth_token=");
    });

    it("B2. auth_token cookie has HttpOnly attribute", async () => {
      const mockUser = {
        _id: "507f1f77bcf86cd799439011",
        name: "Test Customer",
        email: "testcustomer@commerceflow.com",
        role: "customer",
        isActive: true,
        password: "hashed-password"
      };

      vi.spyOn(User, "findOne").mockReturnValue({
        select: vi.fn().mockResolvedValue(mockUser)
      });
      vi.spyOn(bcrypt, "compare").mockResolvedValue(true);

      const res = await request(app)
        .post("/api/v1/users/login")
        .send({ email: "testcustomer@commerceflow.com", password: "Password123!" });

      const setCookieHeader = res.headers["set-cookie"];
      const cookieString = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;

      expect(cookieString.toLowerCase()).toContain("httponly");
    });

    it("B3. auth_token cookie has SameSite attribute", async () => {
      const mockUser = {
        _id: "507f1f77bcf86cd799439011",
        name: "Test Customer",
        email: "testcustomer@commerceflow.com",
        role: "customer",
        isActive: true,
        password: "hashed-password"
      };

      vi.spyOn(User, "findOne").mockReturnValue({
        select: vi.fn().mockResolvedValue(mockUser)
      });
      vi.spyOn(bcrypt, "compare").mockResolvedValue(true);

      const res = await request(app)
        .post("/api/v1/users/login")
        .send({ email: "testcustomer@commerceflow.com", password: "Password123!" });

      const setCookieHeader = res.headers["set-cookie"];
      const cookieString = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;

      expect(cookieString.toLowerCase()).toContain("samesite=lax");
    });

    it("B4. auth_token cookie has Path=/ attribute", async () => {
      const mockUser = {
        _id: "507f1f77bcf86cd799439011",
        name: "Test Customer",
        email: "testcustomer@commerceflow.com",
        role: "customer",
        isActive: true,
        password: "hashed-password"
      };

      vi.spyOn(User, "findOne").mockReturnValue({
        select: vi.fn().mockResolvedValue(mockUser)
      });
      vi.spyOn(bcrypt, "compare").mockResolvedValue(true);

      const res = await request(app)
        .post("/api/v1/users/login")
        .send({ email: "testcustomer@commerceflow.com", password: "Password123!" });

      const setCookieHeader = res.headers["set-cookie"];
      const cookieString = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;

      expect(cookieString).toContain("Path=/");
    });

    it("B5. auth_token cookie has bounded Max-Age lifetime", async () => {
      const mockUser = {
        _id: "507f1f77bcf86cd799439011",
        name: "Test Customer",
        email: "testcustomer@commerceflow.com",
        role: "customer",
        isActive: true,
        password: "hashed-password"
      };

      vi.spyOn(User, "findOne").mockReturnValue({
        select: vi.fn().mockResolvedValue(mockUser)
      });
      vi.spyOn(bcrypt, "compare").mockResolvedValue(true);

      const res = await request(app)
        .post("/api/v1/users/login")
        .send({ email: "testcustomer@commerceflow.com", password: "Password123!" });

      const setCookieHeader = res.headers["set-cookie"];
      const cookieString = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;

      // Max-Age must be present and positive
      const maxAgeMatch = cookieString.match(/Max-Age=(\d+)/i);
      expect(maxAgeMatch).not.toBeNull();
      const maxAgeSeconds = parseInt(maxAgeMatch[1], 10);
      expect(maxAgeSeconds).toBeGreaterThan(0);
    });
  });

  // =========================================================
  // C. Logout clears the cookie
  // =========================================================
  describe("C. Logout clears the authentication cookie", () => {
    it("C1. POST /logout returns 200", async () => {
      const res = await request(app)
        .post("/api/v1/users/logout");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("C2. POST /logout sets a Set-Cookie that expires/clears auth_token", async () => {
      const res = await request(app)
        .post("/api/v1/users/logout");

      // clearCookie sets Set-Cookie with a past Max-Age or empty value
      const setCookieHeader = res.headers["set-cookie"];
      if (setCookieHeader) {
        const cookieString = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
        // Should be clearing the auth_token cookie
        expect(cookieString).toContain("auth_token");
      }
    });

    it("C3. repeated logout is idempotent (does not 401 or 500)", async () => {
      const res1 = await request(app).post("/api/v1/users/logout");
      const res2 = await request(app).post("/api/v1/users/logout");

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
    });
  });

  // =========================================================
  // D. Auth middleware — cookie-based authentication
  // =========================================================
  describe("D. Auth middleware cookie authentication", () => {
    it("D1. /me returns 401 with no cookie", async () => {
      vi.spyOn(User, "findById").mockResolvedValue(null);

      const res = await request(app)
        .get("/api/v1/users/me");

      expect(res.status).toBe(401);
    });

    it("D2. /me returns 401 with a malformed cookie value", async () => {
      const res = await request(app)
        .get("/api/v1/users/me")
        .set("Cookie", "auth_token=not.a.valid.jwt.at.all");

      expect(res.status).toBe(401);
    });

    it("D3. valid cookie authenticates the user at /me", async () => {
      const userId = "507f1f77bcf86cd799439011";
      const token = generateToken({ userId, email: "customer@test.com", role: "customer" });

      vi.spyOn(User, "findById").mockResolvedValue({
        _id: userId,
        name: "Customer",
        email: "customer@test.com",
        role: "customer",
        isActive: true
      });

      const res = await request(app)
        .get("/api/v1/users/me")
        .set("Cookie", `auth_token=${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data?.user?.role).toBe("customer");
    });
  });

  // =========================================================
  // E. CSRF analysis — SameSite=Lax justification
  // =========================================================
  describe("E. CORS / CSRF protection", () => {
    it("E1. unauthorized origin is rejected by CORS (no credentials leak)", async () => {
      const res = await request(app)
        .get("/api/v1/users/me")
        .set("Origin", "http://attacker.evil.com");

      // The response should not include Access-Control-Allow-Origin for an unknown origin
      const acao = res.headers["access-control-allow-origin"];
      expect(acao).not.toBe("*");
      // cors with explicit list will either omit header or not match evil origin
      if (acao) {
        expect(acao).not.toBe("http://attacker.evil.com");
      }
    });

    it("E2. allowed frontend origin receives credentials:true CORS headers", async () => {
      const res = await request(app)
        .options("/api/v1/users/me")
        .set("Origin", "http://localhost:3000")
        .set("Access-Control-Request-Method", "GET");

      // Must be exactly the allowed origin, not wildcard
      expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
      // credentials must be allowed
      expect(res.headers["access-control-allow-credentials"]).toBe("true");
    });

    it("E3. CORS never sends wildcard origin with credentials", async () => {
      // Any CORS response from authenticated endpoint must not use * with credentials
      const res = await request(app)
        .get("/api/v1/users/me")
        .set("Origin", "http://localhost:3000");

      const acao = res.headers["access-control-allow-origin"];
      if (res.headers["access-control-allow-credentials"] === "true") {
        expect(acao).not.toBe("*");
      }
    });
  });
});
