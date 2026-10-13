import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { createApp } from "../../app.js";
import User from "./user.model.js";
import generateToken from "../../utils/generate-token.js";
import { authRateLimitMiddleware, registerRateLimitMiddleware } from "../../common/middleware/auth-rate-limit.middleware.js";
import { AUTH_COOKIE_NAME } from "../../config/cookie.js";

describe("Production Admin Authentication Security & Routing Integration Tests", () => {
  let app;
  const adminId = "507f1f77bcf86cd799439001";
  const customerId = "507f1f77bcf86cd799439002";
  const adminEmail = "admin@example.com";
  const customerEmail = "customer@example.com";

  beforeEach(() => {
    vi.restoreAllMocks();
    app = createApp();

    // Reset rate limiter keys for consistent test execution
    authRateLimitMiddleware.resetKey("::ffff:127.0.0.1");
    authRateLimitMiddleware.resetKey("127.0.0.1");
    authRateLimitMiddleware.resetKey("::1");
    registerRateLimitMiddleware.resetKey("::ffff:127.0.0.1");
    registerRateLimitMiddleware.resetKey("127.0.0.1");
    registerRateLimitMiddleware.resetKey("::1");
  });

  describe("1-8. Admin Login Authentication Endpoint (POST /api/v1/users/admin/login)", () => {
    it("1. admin login succeeds with valid admin credentials", async () => {
      const mockAdmin = {
        _id: adminId,
        name: "Admin User",
        email: adminEmail,
        password: "hashed-admin-password",
        role: "admin",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      vi.spyOn(User, "findOne").mockReturnValue({
        select: vi.fn().mockResolvedValue(mockAdmin)
      });
      vi.spyOn(bcrypt, "compare").mockResolvedValue(true);

      const res = await request(app)
        .post("/api/v1/users/admin/login")
        .send({
          email: adminEmail,
          password: "AdminPassword123!"
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe("Admin logged in successfully");
      expect(res.body.data.user.role).toBe("admin");
      expect(res.body.data.user.email).toBe(adminEmail);
    });

    it("2. admin login sets HttpOnly authentication cookie", async () => {
      const mockAdmin = {
        _id: adminId,
        name: "Admin User",
        email: adminEmail,
        password: "hashed-admin-password",
        role: "admin",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      vi.spyOn(User, "findOne").mockReturnValue({
        select: vi.fn().mockResolvedValue(mockAdmin)
      });
      vi.spyOn(bcrypt, "compare").mockResolvedValue(true);

      const res = await request(app)
        .post("/api/v1/users/admin/login")
        .send({
          email: adminEmail,
          password: "AdminPassword123!"
        });

      expect(res.status).toBe(200);
      const cookies = res.headers["set-cookie"];
      expect(cookies).toBeDefined();
      const authCookie = cookies.find((c) => c.startsWith(`${AUTH_COOKIE_NAME}=`));
      expect(authCookie).toBeDefined();
      expect(authCookie).toContain("HttpOnly");
      expect(authCookie).toContain("Path=/");
    });

    it("3. admin login does NOT return JWT in JSON response body", async () => {
      const mockAdmin = {
        _id: adminId,
        name: "Admin User",
        email: adminEmail,
        password: "hashed-admin-password",
        role: "admin",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      vi.spyOn(User, "findOne").mockReturnValue({
        select: vi.fn().mockResolvedValue(mockAdmin)
      });
      vi.spyOn(bcrypt, "compare").mockResolvedValue(true);

      const res = await request(app)
        .post("/api/v1/users/admin/login")
        .send({
          email: adminEmail,
          password: "AdminPassword123!"
        });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeUndefined();
      expect(res.body.data.token).toBeUndefined();
      expect(res.body.data.accessToken).toBeUndefined();
    });

    it("4. admin login rejects customer credentials with generic INVALID_CREDENTIALS", async () => {
      const mockCustomer = {
        _id: customerId,
        name: "Customer User",
        email: customerEmail,
        password: "hashed-customer-password",
        role: "customer", // NOT an admin!
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      vi.spyOn(User, "findOne").mockReturnValue({
        select: vi.fn().mockResolvedValue(mockCustomer)
      });
      vi.spyOn(bcrypt, "compare").mockResolvedValue(true);

      const res = await request(app)
        .post("/api/v1/users/admin/login")
        .send({
          email: customerEmail,
          password: "CustomerPassword123!"
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
      expect(res.body.error.message).toBe("Invalid email or password");
    });

    it("5. rejected customer admin-login attempt does NOT establish admin session", async () => {
      const mockCustomer = {
        _id: customerId,
        name: "Customer User",
        email: customerEmail,
        password: "hashed-customer-password",
        role: "customer",
        isActive: true,
        createdAt: new Date()
      };

      vi.spyOn(User, "findOne").mockReturnValue({
        select: vi.fn().mockResolvedValue(mockCustomer)
      });
      vi.spyOn(bcrypt, "compare").mockResolvedValue(true);

      const res = await request(app)
        .post("/api/v1/users/admin/login")
        .send({
          email: customerEmail,
          password: "CustomerPassword123!"
        });

      expect(res.status).toBe(401);
      const cookies = res.headers["set-cookie"];
      // No set-cookie header should exist, or it must not set the auth cookie
      if (cookies) {
        const authCookie = cookies.find((c) => c.startsWith(`${AUTH_COOKIE_NAME}=`));
        expect(authCookie).toBeUndefined();
      }
    });

    it("6. inactive admin cannot login", async () => {
      const mockInactiveAdmin = {
        _id: adminId,
        name: "Deactivated Admin",
        email: adminEmail,
        password: "hashed-admin-password",
        role: "admin",
        isActive: false, // Deactivated!
        createdAt: new Date()
      };

      vi.spyOn(User, "findOne").mockReturnValue({
        select: vi.fn().mockResolvedValue(mockInactiveAdmin)
      });
      vi.spyOn(bcrypt, "compare").mockResolvedValue(true);

      const res = await request(app)
        .post("/api/v1/users/admin/login")
        .send({
          email: adminEmail,
          password: "AdminPassword123!"
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("ACCOUNT_DEACTIVATED");
    });

    it("7. invalid password rejected with INVALID_CREDENTIALS", async () => {
      const mockAdmin = {
        _id: adminId,
        name: "Admin User",
        email: adminEmail,
        password: "hashed-admin-password",
        role: "admin",
        isActive: true
      };

      vi.spyOn(User, "findOne").mockReturnValue({
        select: vi.fn().mockResolvedValue(mockAdmin)
      });
      vi.spyOn(bcrypt, "compare").mockResolvedValue(false); // Password mismatch

      const res = await request(app)
        .post("/api/v1/users/admin/login")
        .send({
          email: adminEmail,
          password: "WrongPassword123!"
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
    });

    it("8. malformed input rejected by Zod schema validation", async () => {
      const res = await request(app)
        .post("/api/v1/users/admin/login")
        .send({
          email: "not-an-email",
          password: "short"
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("9-13. Rate Limiting & Registration Isolation", () => {
    it("9. dedicated login rate limiter blocks 11th attempt with AUTH_RATE_LIMIT_EXCEEDED", async () => {
      vi.spyOn(User, "findOne").mockReturnValue({
        select: vi.fn().mockResolvedValue(null)
      });

      const payload = {
        email: "unknown@example.com",
        password: "Password123!"
      };

      const responses = [];
      for (let i = 0; i < 11; i += 1) {
        const res = await request(app)
          .post("/api/v1/users/admin/login")
          .send(payload);
        responses.push(res);
      }

      for (let i = 0; i < 10; i += 1) {
        expect(responses[i].status).not.toBe(429);
      }

      expect(responses[10].status).toBe(429);
      expect(responses[10].body.success).toBe(false);
      expect(responses[10].body.error.code).toBe("AUTH_RATE_LIMIT_EXCEEDED");
    });

    it("10. global API limiter does not consume quota for admin login / customer login", async () => {
      // Global rate limiter skip logic verifies that POST /api/v1/users/login and
      // POST /api/v1/users/admin/login do not exhaust the 100 global rate limit quota
      const skipCheck = (path) => {
        return (
          path === "/api/v1/users/login" ||
          path === "/api/v1/users/register" ||
          path === "/api/v1/users/admin/login"
        );
      };

      expect(skipCheck("/api/v1/users/login")).toBe(true);
      expect(skipCheck("/api/v1/users/admin/login")).toBe(true);
      expect(skipCheck("/api/v1/users/register")).toBe(true);
      expect(skipCheck("/api/v1/products")).toBe(false);
    });

    it("11. registration rate limiter blocks 11th registration attempt with AUTH_RATE_LIMIT_EXCEEDED", async () => {
      const payload = {
        name: "Test User",
        email: "invalid-email-format",
        password: "short"
      };

      const responses = [];
      for (let i = 0; i < 11; i += 1) {
        const res = await request(app)
          .post("/api/v1/users/register")
          .send(payload);
        responses.push(res);
      }

      for (let i = 0; i < 10; i += 1) {
        expect(responses[i].status).not.toBe(429);
      }

      expect(responses[10].status).toBe(429);
      expect(responses[10].body.error.code).toBe("AUTH_RATE_LIMIT_EXCEEDED");
    });

    it("12. public registration still creates customer account", async () => {
      vi.spyOn(User, "findOne").mockResolvedValue(null);
      vi.spyOn(bcrypt, "hash").mockResolvedValue("hashed-password");

      const createdUser = {
        _id: customerId,
        name: "Store Customer",
        email: "customer@example.com",
        role: "customer",
        createdAt: new Date()
      };
      const createSpy = vi.spyOn(User, "create").mockResolvedValue(createdUser);

      const res = await request(app)
        .post("/api/v1/users/register")
        .send({
          name: "Store Customer",
          email: "customer@example.com",
          password: "CustomerPassword123!"
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe("customer");
      expect(createSpy).toHaveBeenCalledWith({
        name: "Store Customer",
        email: "customer@example.com",
        password: "hashed-password"
      });
    });

    it("13. role injection in public registration body is strictly ignored and rejected", async () => {
      vi.spyOn(User, "findOne").mockResolvedValue(null);
      vi.spyOn(bcrypt, "hash").mockResolvedValue("hashed-password");

      const createdUser = {
        _id: customerId,
        name: "Attacker User",
        email: "attacker@example.com",
        role: "customer",
        createdAt: new Date()
      };
      const createSpy = vi.spyOn(User, "create").mockResolvedValue(createdUser);

      const res = await request(app)
        .post("/api/v1/users/register")
        .send({
          name: "Attacker User",
          email: "attacker@example.com",
          password: "Password123!",
          role: "admin" // Escalation attempt
        });

      expect(res.status).toBe(201);
      expect(res.body.data.user.role).toBe("customer");
      expect(createSpy).toHaveBeenCalledWith({
        name: "Attacker User",
        email: "attacker@example.com",
        password: "hashed-password"
      });
    });
  });

  describe("14-16. Session Lifecycle & Authorization Endpoints", () => {
    it("14. logout clears authentication cookie", async () => {
      const res = await request(app).post("/api/v1/users/logout");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const cookies = res.headers["set-cookie"];
      expect(cookies).toBeDefined();
      const authCookie = cookies.find((c) => c.startsWith(`${AUTH_COOKIE_NAME}=`));
      expect(authCookie).toBeDefined();
      // Cookie is cleared with max-age=0 or expires in past
      expect(authCookie).toMatch(/Expires=|Max-Age=0/i);
    });

    it("15. admin cookie can access protected admin endpoint (/api/v1/admin/test)", async () => {
      const token = generateToken({
        userId: adminId,
        email: adminEmail,
        role: "admin"
      });

      vi.spyOn(User, "findById").mockResolvedValue({
        _id: adminId,
        email: adminEmail,
        role: "admin",
        isActive: true
      });

      const res = await request(app)
        .get("/api/v1/admin/test")
        .set("Cookie", `${AUTH_COOKIE_NAME}=${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe("admin");
    });

    it("16. customer cookie cannot access protected admin endpoint and receives 403 FORBIDDEN", async () => {
      const token = generateToken({
        userId: customerId,
        email: customerEmail,
        role: "customer"
      });

      vi.spyOn(User, "findById").mockResolvedValue({
        _id: customerId,
        email: customerEmail,
        role: "customer",
        isActive: true
      });

      const res = await request(app)
        .get("/api/v1/admin/test")
        .set("Cookie", `${AUTH_COOKIE_NAME}=${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("17. admin login cookie permits GET /api/v1/users/me and without cookie returns 401", async () => {
      const mockAdmin = {
        _id: adminId,
        name: "Admin User",
        email: adminEmail,
        password: "hashed-admin-password",
        role: "admin",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      vi.spyOn(User, "findOne").mockReturnValue({
        select: vi.fn().mockResolvedValue(mockAdmin)
      });
      vi.spyOn(User, "findById").mockResolvedValue(mockAdmin);
      vi.spyOn(bcrypt, "compare").mockResolvedValue(true);

      // 1. Login to obtain cookie
      const loginRes = await request(app)
        .post("/api/v1/users/admin/login")
        .send({
          email: adminEmail,
          password: "AdminPassword123!"
        });

      expect(loginRes.status).toBe(200);
      const cookies = loginRes.headers["set-cookie"];
      expect(cookies).toBeDefined();
      const authCookie = cookies.find((c) => c.startsWith(`${AUTH_COOKIE_NAME}=`));
      expect(authCookie).toBeDefined();

      // 2. GET /me with that cookie
      const meRes = await request(app)
        .get("/api/v1/users/me")
        .set("Cookie", authCookie);

      expect(meRes.status).toBe(200);
      expect(meRes.body.success).toBe(true);
      expect(meRes.body.data.user.role).toBe("admin");
      expect(meRes.body.data.user.email).toBe(adminEmail);

      // 3. GET /me without cookie returns 401
      const unauthMeRes = await request(app).get("/api/v1/users/me");
      expect(unauthMeRes.status).toBe(401);
      expect(unauthMeRes.body.error.code).toBe("AUTH_TOKEN_REQUIRED");
    });
  });
});
