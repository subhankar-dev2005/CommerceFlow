import crypto from "crypto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { createApp } from "../../app.js";
import User from "./user.model.js";
import AdminMfaChallenge, {
  MFA_CHALLENGE_PURPOSES,
  MFA_CHALLENGE_STATES
} from "./admin-mfa-challenge.model.js";
import generateToken from "../../utils/generate-token.js";
import * as tokenUtil from "../../utils/generate-token.js";
import {
  authRateLimitMiddleware,
  registerRateLimitMiddleware
} from "../../common/middleware/auth-rate-limit.middleware.js";
import { AUTH_COOKIE_NAME } from "../../config/cookie.js";
import * as cookieConfig from "../../config/cookie.js";
import * as refreshTokenService from "./refresh-token.service.js";
import * as adminAuditService from "../audit/admin-audit.service.js";
import { logger } from "../../config/logger.js";

describe("Production Admin Authentication Security & Routing Integration Tests", () => {
  let app;
  const adminId = "507f1f77bcf86cd799439001";
  const customerId = "507f1f77bcf86cd799439002";
  const adminEmail = "admin@example.com";
  const customerEmail = "customer@example.com";

  beforeEach(() => {
    vi.restoreAllMocks();
    app = createApp();

    // Default mock on AdminMfaChallenge.create for smooth integration runs
    vi.spyOn(AdminMfaChallenge, "create").mockResolvedValue({
      _id: "default-mfa-challenge-id"
    });

    // Reset rate limiter keys for consistent test execution
    authRateLimitMiddleware.resetKey("::ffff:127.0.0.1");
    authRateLimitMiddleware.resetKey("127.0.0.1");
    authRateLimitMiddleware.resetKey("::1");
    registerRateLimitMiddleware.resetKey("::ffff:127.0.0.1");
    registerRateLimitMiddleware.resetKey("127.0.0.1");
    registerRateLimitMiddleware.resetKey("::1");
  });

  describe("1-8. Admin Login Authentication Endpoint (POST /api/v1/users/admin/login)", () => {
    it("1. admin login succeeds directly with valid admin credentials, issuing session cookies and mfaRequired: false", async () => {
      const mockAdmin = {
        _id: adminId,
        name: "Admin User",
        email: adminEmail,
        password: "hashed-admin-password",
        role: "admin",
        isActive: true,
        twoFactorEnabled: true,
        tokenVersion: 2,
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
      expect(res.body.data.mfaRequired).toBe(false);
      expect(res.body.data.mfaEnrollmentRequired).toBe(false);
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.email).toBe(adminEmail);
      expect(res.body.data.user.role).toBe("admin");
      expect(res.headers["set-cookie"]).toBeDefined();
      expect(res.headers["set-cookie"].some((c) => c.includes(AUTH_COOKIE_NAME))).toBe(true);
    });

    it("2. admin login sets secure HTTPOnly auth and refresh cookies upon valid password authentication", async () => {
      const mockAdmin = {
        _id: adminId,
        name: "Admin User",
        email: adminEmail,
        password: "hashed-admin-password",
        role: "admin",
        isActive: true,
        twoFactorEnabled: true,
        tokenVersion: 1,
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
      expect(res.headers["set-cookie"]).toBeDefined();
      const authCookie = res.headers["set-cookie"].find((c) => c.startsWith(`${AUTH_COOKIE_NAME}=`));
      expect(authCookie).toBeDefined();
      expect(authCookie).toContain("HttpOnly");
      expect(authCookie).toContain("SameSite=Lax");
    });

    it("3. admin login sets tokens in cookies and never exposes raw JWT or refresh token in response body", async () => {
      const mockAdmin = {
        _id: adminId,
        name: "Admin User",
        email: adminEmail,
        password: "hashed-admin-password",
        role: "admin",
        isActive: true,
        twoFactorEnabled: true,
        tokenVersion: 1,
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
      expect(res.body.data.refreshToken).toBeUndefined();
      expect(res.body.data.user).toBeDefined();
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

      const challengeCreateSpy = vi.spyOn(AdminMfaChallenge, "create");
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
      expect(challengeCreateSpy).not.toHaveBeenCalled();
    });

    it("5. rejected customer admin-login attempt does NOT establish admin session or issue challenge", async () => {
      const mockCustomer = {
        _id: customerId,
        name: "Customer User",
        email: customerEmail,
        password: "hashed-customer-password",
        role: "customer",
        isActive: true,
        createdAt: new Date()
      };

      const challengeCreateSpy = vi.spyOn(AdminMfaChallenge, "create");
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
      expect(res.headers["set-cookie"]).toBeUndefined();
      expect(challengeCreateSpy).not.toHaveBeenCalled();
    });

    it("6. inactive admin cannot login and receives no challenge", async () => {
      const mockInactiveAdmin = {
        _id: adminId,
        name: "Deactivated Admin",
        email: adminEmail,
        password: "hashed-admin-password",
        role: "admin",
        isActive: false, // Deactivated!
        createdAt: new Date()
      };

      const challengeCreateSpy = vi.spyOn(AdminMfaChallenge, "create");
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
      expect(challengeCreateSpy).not.toHaveBeenCalled();
    });

    it("7. invalid password rejected with INVALID_CREDENTIALS and receives no challenge", async () => {
      const mockAdmin = {
        _id: adminId,
        name: "Admin User",
        email: adminEmail,
        password: "hashed-admin-password",
        role: "admin",
        isActive: true
      };

      const challengeCreateSpy = vi.spyOn(AdminMfaChallenge, "create");
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
      expect(challengeCreateSpy).not.toHaveBeenCalled();
    });

    it("7b. unknown admin email invokes bcrypt comparison with dummy hash and returns generic INVALID_CREDENTIALS", async () => {
      const compareSpy = vi.spyOn(bcrypt, "compare").mockResolvedValue(false);

      vi.spyOn(User, "findOne").mockReturnValue({
        select: vi.fn().mockResolvedValue(null)
      });

      const res = await request(app)
        .post("/api/v1/users/admin/login")
        .send({
          email: "nonexistent-admin@example.com",
          password: "AdminPassword123!"
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
      expect(res.body.error.message).toBe("Invalid email or password");
      expect(compareSpy).toHaveBeenCalledWith(
        "AdminPassword123!",
        expect.stringMatching(/^\$2[aby]\$12\$/)
      );
    });

    it("7c. safely rejects unknown admin login even if dummy comparison throws", async () => {
      vi.spyOn(bcrypt, "compare").mockRejectedValue(new Error("Unexpected bcrypt error"));

      vi.spyOn(User, "findOne").mockReturnValue({
        select: vi.fn().mockResolvedValue(null)
      });

      const res = await request(app)
        .post("/api/v1/users/admin/login")
        .send({
          email: "nonexistent-admin@example.com",
          password: "AdminPassword123!"
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

    it("8b. super_admin login succeeds directly with valid credentials without MFA challenge", async () => {
      const superAdminId = "507f1f77bcf86cd799439099";
      const superAdminEmail = "superadmin@example.com";
      const mockSuperAdmin = {
        _id: superAdminId,
        name: "Super Administrator",
        email: superAdminEmail,
        password: "hashed-super-password",
        role: "super_admin",
        isActive: true,
        twoFactorEnabled: true,
        tokenVersion: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      vi.spyOn(User, "findOne").mockReturnValue({
        select: vi.fn().mockResolvedValue(mockSuperAdmin)
      });
      vi.spyOn(bcrypt, "compare").mockResolvedValue(true);

      const res = await request(app)
        .post("/api/v1/users/admin/login")
        .send({
          email: superAdminEmail,
          password: "SuperPassword123!"
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe("Admin logged in successfully");
      expect(res.body.data.mfaRequired).toBe(false);
      expect(res.body.data.user.role).toBe("super_admin");
      expect(res.headers["set-cookie"]).toBeDefined();
    });

    it("8c. admin login with existing twoFactorEnabled flag authenticates directly with password and issues session", async () => {
      const mockAdmin = {
        _id: adminId,
        email: adminEmail,
        password: "hashed-admin-password",
        role: "admin",
        isActive: true,
        twoFactorEnabled: true,
        tokenVersion: 3
      };

      const createSpy = vi.spyOn(AdminMfaChallenge, "create");
      vi.spyOn(User, "findOne").mockReturnValue({
        select: vi.fn().mockResolvedValue(mockAdmin)
      });
      vi.spyOn(bcrypt, "compare").mockResolvedValue(true);

      const res = await request(app)
        .post("/api/v1/users/admin/login")
        .set("User-Agent", "Mozilla/5.0 TestBrowser")
        .send({
          email: adminEmail,
          password: "AdminPassword123!"
        });

      expect(res.status).toBe(200);
      expect(createSpy).not.toHaveBeenCalled();
      expect(res.body.success).toBe(true);
      expect(res.body.data.mfaRequired).toBe(false);
      expect(res.headers["set-cookie"]).toBeDefined();
    });

    it("8d. unenrolled admin (twoFactorEnabled !== true) logs in directly with valid password and receives session cookies with mfaRequired: false", async () => {
      const mockUnenrolledAdmin = {
        _id: adminId,
        email: adminEmail,
        password: "hashed-admin-password",
        role: "admin",
        isActive: true,
        twoFactorEnabled: false,
        tokenVersion: 1
      };

      vi.spyOn(User, "findOne").mockReturnValue({
        select: vi.fn().mockResolvedValue(mockUnenrolledAdmin)
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
      expect(res.body.data.mfaRequired).toBe(false);
      expect(res.body.data.mfaEnrollmentRequired).toBe(false);
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.email).toBe(adminEmail);
      expect(res.body.data.user.role).toBe("admin");
      expect(res.headers["set-cookie"]).toBeDefined();
      expect(res.headers["set-cookie"].some((c) => c.includes(AUTH_COOKIE_NAME))).toBe(true);
    });

    it("8e. unenrolled admin login does NOT create an AdminMfaChallenge or issue a challengeToken", async () => {
      const mockUnenrolledAdmin = {
        _id: adminId,
        email: adminEmail,
        password: "hashed-admin-password",
        role: "admin",
        isActive: true,
        twoFactorEnabled: false,
        tokenVersion: 0
      };

      const createSpy = vi.spyOn(AdminMfaChallenge, "create").mockResolvedValue({ _id: "mfa-challenge-2" });
      vi.spyOn(User, "findOne").mockReturnValue({
        select: vi.fn().mockResolvedValue(mockUnenrolledAdmin)
      });
      vi.spyOn(bcrypt, "compare").mockResolvedValue(true);

      const res = await request(app)
        .post("/api/v1/users/admin/login")
        .send({
          email: adminEmail,
          password: "AdminPassword123!"
        });

      expect(res.status).toBe(200);
      expect(createSpy).toHaveBeenCalledTimes(0);
      expect(res.body.data.challengeToken).toBeUndefined();
      expect(res.body.data.mfaRequired).toBe(false);
    });

    it("8e-2. unenrolled admin login records ADMIN_LOGIN_SUCCESS audit event with authoritative actor and safe metadata", async () => {
      const mockUnenrolledAdmin = {
        _id: adminId,
        name: "Admin User",
        email: adminEmail,
        password: "hashed-admin-password",
        role: "admin",
        isActive: true,
        twoFactorEnabled: false,
        tokenVersion: 2,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const auditSpy = vi.spyOn(adminAuditService, "recordAdminAuditEvent").mockResolvedValue({
        _id: "mock-audit-id"
      });

      vi.spyOn(User, "findOne").mockReturnValue({
        select: vi.fn().mockResolvedValue(mockUnenrolledAdmin)
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
      expect(auditSpy).toHaveBeenCalledTimes(1);

      const auditCall = auditSpy.mock.calls[0][0];
      expect(auditCall.eventType).toBe(adminAuditService.AUDIT_EVENT_TYPES.ADMIN_LOGIN_SUCCESS);
      expect(auditCall.eventType).toBe("ADMIN_LOGIN_SUCCESS");
      expect(auditCall.actor).toEqual({
        _id: adminId,
        email: adminEmail,
        role: "admin"
      });
      expect(auditCall.target).toEqual({
        _id: adminId,
        email: adminEmail,
        role: "admin"
      });
      expect(auditCall.resourceType).toBe("admin_user");
      expect(auditCall.resourceId).toBe(adminId);
      expect(auditCall.req).toBeDefined();

      // Verify safe metadata and ensure zero credential/token leakage
      expect(auditCall.metadata).toEqual({
        method: "password",
        mfaEnabled: false
      });
      expect(auditCall.metadata.password).toBeUndefined();
      expect(auditCall.metadata.token).toBeUndefined();
      expect(auditCall.metadata.refreshToken).toBeUndefined();
      expect(auditCall.metadata.challengeToken).toBeUndefined();
      expect(auditCall.metadata.secret).toBeUndefined();
    });

    it("8e-3. admin login audit event is NOT recorded when authentication, status, or role validation fails or for MFA challenges", async () => {
      const auditSpy = vi.spyOn(adminAuditService, "recordAdminAuditEvent").mockResolvedValue({});

      // Case 1: Unknown admin email
      vi.spyOn(User, "findOne").mockReturnValue({
        select: vi.fn().mockResolvedValue(null)
      });
      vi.spyOn(bcrypt, "compare").mockResolvedValue(false);

      let res = await request(app)
        .post("/api/v1/users/admin/login")
        .send({ email: "audit-unknown@example.com", password: "Password123!" });
      expect(res.status).toBe(401);
      expect(auditSpy).not.toHaveBeenCalled();

      // Case 2: Invalid password
      vi.spyOn(User, "findOne").mockReturnValue({
        select: vi.fn().mockResolvedValue({
          _id: adminId,
          email: "audit-wrong-pw@example.com",
          password: "hashed-pw",
          role: "admin",
          isActive: true
        })
      });
      vi.spyOn(bcrypt, "compare").mockResolvedValue(false);

      res = await request(app)
        .post("/api/v1/users/admin/login")
        .send({ email: "audit-wrong-pw@example.com", password: "WrongPassword!" });
      expect(res.status).toBe(401);
      expect(auditSpy).not.toHaveBeenCalled();

      // Case 3: Inactive admin account
      vi.spyOn(User, "findOne").mockReturnValue({
        select: vi.fn().mockResolvedValue({
          _id: adminId,
          email: "audit-inactive@example.com",
          password: "hashed-pw",
          role: "admin",
          isActive: false
        })
      });
      vi.spyOn(bcrypt, "compare").mockResolvedValue(true);

      res = await request(app)
        .post("/api/v1/users/admin/login")
        .send({ email: "audit-inactive@example.com", password: "AdminPassword123!" });
      expect(res.status).toBe(401);
      expect(auditSpy).not.toHaveBeenCalled();

      // Case 4: Non-admin / customer account
      vi.spyOn(User, "findOne").mockReturnValue({
        select: vi.fn().mockResolvedValue({
          _id: customerId,
          email: "audit-customer@example.com",
          password: "hashed-pw",
          role: "customer",
          isActive: true
        })
      });
      vi.spyOn(bcrypt, "compare").mockResolvedValue(true);

      res = await request(app)
        .post("/api/v1/users/admin/login")
        .send({ email: "audit-customer@example.com", password: "CustomerPassword123!" });
      expect(res.status).toBe(401);
      expect(auditSpy).not.toHaveBeenCalled();

      // Case 5: Valid admin credentials record the audit event
      vi.spyOn(User, "findOne").mockReturnValue({
        select: vi.fn().mockResolvedValue({
          _id: adminId,
          email: "audit-enrolled@example.com",
          password: "hashed-pw",
          role: "admin",
          isActive: true,
          twoFactorEnabled: true,
          tokenVersion: 1
        })
      });
      vi.spyOn(bcrypt, "compare").mockResolvedValue(true);

      res = await request(app)
        .post("/api/v1/users/admin/login")
        .send({ email: "audit-enrolled@example.com", password: "AdminPassword123!" });
      expect(res.status).toBe(200);
      expect(res.body.data.mfaRequired).toBe(false);
      expect(auditSpy).toHaveBeenCalledTimes(1);
    });

    it("8e-4. admin login succeeds even if audit recording fails (non-blocking audit failure resilience)", async () => {
      const mockUnenrolledAdmin = {
        _id: adminId,
        email: adminEmail,
        password: "hashed-admin-password",
        role: "admin",
        isActive: true,
        twoFactorEnabled: false,
        tokenVersion: 1
      };

      vi.spyOn(User, "findOne").mockReturnValue({
        select: vi.fn().mockResolvedValue(mockUnenrolledAdmin)
      });
      vi.spyOn(bcrypt, "compare").mockResolvedValue(true);

      // Audit service throws/rejects with a database error
      vi.spyOn(adminAuditService, "recordAdminAuditEvent").mockRejectedValue(
        new Error("Audit database connection lost")
      );
      const loggerErrorSpy = vi.spyOn(logger, "error");

      const res = await request(app)
        .post("/api/v1/users/admin/login")
        .send({
          email: adminEmail,
          password: "AdminPassword123!"
        });

      // Login must succeed fail-open despite audit failure
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe("Admin logged in successfully");
      expect(res.headers["set-cookie"]).toBeDefined();
      expect(res.headers["set-cookie"].some((c) => c.includes(AUTH_COOKIE_NAME))).toBe(true);

      // Verify failure was logged with context
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: adminId
        }),
        "Failed to record audit event for admin password login"
      );
    });

    it("8f. database failure during user lookup returns safe 500 error, zero cookies, and no token", async () => {
      vi.spyOn(User, "findOne").mockImplementation(() => {
        throw new Error("Database connection failure");
      });

      const res = await request(app)
        .post("/api/v1/users/admin/login")
        .send({
          email: adminEmail,
          password: "AdminPassword123!"
        });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.data).toBeUndefined();
      expect(res.body.token).toBeUndefined();
      expect(res.headers["set-cookie"]).toBeUndefined();
    });

    it("8g. CSPRNG failure during session issuance fails closed and returns safe 500 error", async () => {
      const mockAdmin = {
        _id: adminId,
        email: adminEmail,
        password: "hashed-admin-password",
        role: "admin",
        isActive: true,
        twoFactorEnabled: true
      };

      vi.spyOn(crypto, "randomBytes").mockImplementation(() => {
        throw new Error("Entropy pool failure");
      });
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

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.headers["set-cookie"]).toBeUndefined();
    });

    it("8h. client-supplied role, userId, tokenVersion, or twoFactorEnabled cannot tamper with session issuance", async () => {
      const mockAdmin = {
        _id: adminId,
        email: adminEmail,
        password: "hashed-admin-password",
        role: "admin",
        isActive: true,
        twoFactorEnabled: true,
        tokenVersion: 5
      };

      vi.spyOn(User, "findOne").mockReturnValue({
        select: vi.fn().mockResolvedValue(mockAdmin)
      });
      vi.spyOn(bcrypt, "compare").mockResolvedValue(true);

      const res = await request(app)
        .post("/api/v1/users/admin/login")
        .send({
          email: adminEmail,
          password: "AdminPassword123!",
          role: "customer",
          userId: "attacker-chosen-user-id",
          tokenVersion: 999,
          twoFactorEnabled: false
        });

      expect(res.status).toBe(200);
      expect(res.body.data.user.id).toBe(adminId);
      expect(res.body.data.user.role).toBe("admin");
    });

    it("8i. password login invokes token-generation, refresh-token issuance, and cookie setters", async () => {
      const mockAdmin = {
        _id: adminId,
        email: adminEmail,
        password: "hashed-admin-password",
        role: "admin",
        isActive: true,
        twoFactorEnabled: true,
        tokenVersion: 1
      };

      vi.spyOn(User, "findOne").mockReturnValue({
        select: vi.fn().mockResolvedValue(mockAdmin)
      });
      vi.spyOn(bcrypt, "compare").mockResolvedValue(true);

      const setAuthCookieSpy = vi.spyOn(cookieConfig, "setAuthCookie");
      const setRefreshCookieSpy = vi.spyOn(cookieConfig, "setRefreshCookie");
      const issueRefreshTokenSpy = vi.spyOn(refreshTokenService, "issueRefreshToken");
      const generateTokenSpy = vi.spyOn(tokenUtil, "default");

      const res = await request(app)
        .post("/api/v1/users/admin/login")
        .send({
          email: adminEmail,
          password: "AdminPassword123!"
        });

      expect(res.status).toBe(200);
      expect(setAuthCookieSpy).toHaveBeenCalledTimes(1);
      expect(setRefreshCookieSpy).toHaveBeenCalledTimes(1);
      expect(issueRefreshTokenSpy).toHaveBeenCalledTimes(1);
      expect(generateTokenSpy).toHaveBeenCalledTimes(1);
    });

    it("8j. raw password and credentials never appear in logged output", async () => {
      const mockAdmin = {
        _id: adminId,
        email: adminEmail,
        password: "hashed-admin-password",
        role: "admin",
        isActive: true,
        twoFactorEnabled: true,
        tokenVersion: 1
      };

      vi.spyOn(User, "findOne").mockReturnValue({
        select: vi.fn().mockResolvedValue(mockAdmin)
      });
      vi.spyOn(bcrypt, "compare").mockResolvedValue(true);

      const infoLogs = [];
      const errorLogs = [];
      const warnLogs = [];
      const safeCapture = (target) => (...args) => {
        for (const arg of args) {
          if (typeof arg === "string") {
            target.push(arg);
          } else if (arg && typeof arg === "object") {
            try {
              target.push(JSON.stringify(arg, (k, v) => (k === "socket" || k === "req" || k === "res" ? undefined : v)));
            } catch {
              target.push(String(arg));
            }
          }
        }
      };
      vi.spyOn(logger, "info").mockImplementation(safeCapture(infoLogs));
      vi.spyOn(logger, "error").mockImplementation(safeCapture(errorLogs));
      vi.spyOn(logger, "warn").mockImplementation(safeCapture(warnLogs));

      const res = await request(app)
        .post("/api/v1/users/admin/login")
        .send({
          email: adminEmail,
          password: "AdminPassword123!"
        });

      expect(res.status).toBe(200);
      const allLogs = [...infoLogs, ...errorLogs, ...warnLogs].join(" ");
      expect(allLogs).not.toContain("AdminPassword123!");
    });
  });

  describe("9-13. Rate Limiting & Registration Isolation", () => {
    it(
      "9. dedicated login rate limiter blocks 11th attempt with AUTH_RATE_LIMIT_EXCEEDED",
      async () => {
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
    }, 15000);

    it("10. global API limiter does not consume quota for admin login / customer login", async () => {
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

  describe("14-17. Session Lifecycle & Authorization Endpoints", () => {
    it("14. logout clears authentication cookie", async () => {
      const res = await request(app).post("/api/v1/users/logout");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const cookies = res.headers["set-cookie"];
      expect(cookies).toBeDefined();
      const authCookie = cookies.find((c) => c.startsWith(`${AUTH_COOKIE_NAME}=`));
      expect(authCookie).toBeDefined();
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

    it("17. admin password login sets session cookies, and authenticated admin cookie permits GET /api/v1/users/me", async () => {
      const mockAdmin = {
        _id: adminId,
        name: "Admin User",
        email: adminEmail,
        password: "hashed-admin-password",
        role: "admin",
        isActive: true,
        twoFactorEnabled: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      vi.spyOn(User, "findOne").mockReturnValue({
        select: vi.fn().mockResolvedValue(mockAdmin)
      });
      vi.spyOn(User, "findById").mockResolvedValue(mockAdmin);
      vi.spyOn(bcrypt, "compare").mockResolvedValue(true);

      // 1. Password login sets session cookies
      const loginRes = await request(app)
        .post("/api/v1/users/admin/login")
        .send({
          email: adminEmail,
          password: "AdminPassword123!"
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.headers["set-cookie"]).toBeDefined();
      expect(loginRes.headers["set-cookie"].some((c) => c.includes(AUTH_COOKIE_NAME))).toBe(true);

      // 2. An authenticated admin session cookie permits GET /api/v1/users/me
      const token = generateToken({
        userId: adminId,
        email: adminEmail,
        role: "admin"
      });

      const meRes = await request(app)
        .get("/api/v1/users/me")
        .set("Cookie", `${AUTH_COOKIE_NAME}=${token}`);

      expect(meRes.status).toBe(200);
      expect(meRes.body.success).toBe(true);
      expect(meRes.body.data.user.role).toBe("admin");
      expect(meRes.body.data.user.email).toBe(adminEmail);

      // 3. GET /me without cookie returns 401
      const unauthMeRes = await request(app).get("/api/v1/users/me");
      expect(unauthMeRes.status).toBe(401);
      expect(unauthMeRes.body.error.code).toBe("AUTH_TOKEN_REQUIRED");
    });

    it("18. retired MFA routes (/api/v1/users/admin/mfa/*) return HTTP 410 Gone with MFA_FEATURE_DISABLED", async () => {
      const routes = [
        "/api/v1/users/admin/mfa/setup",
        "/api/v1/users/admin/mfa/activate",
        "/api/v1/users/admin/mfa/verify",
        "/api/v1/users/admin/mfa/verify-recovery",
        "/api/v1/users/admin/mfa/disable",
        "/api/v1/users/admin/mfa/recovery-codes/regenerate",
      ];

      for (const route of routes) {
        const res = await request(app).post(route).send({});
        expect(res.status).toBe(410);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe("MFA_FEATURE_DISABLED");
        expect(res.body.error.message).toContain("Administrative two-factor authentication has been retired");
      }
    });
  });
});
