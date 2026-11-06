import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import User from "./user.model.js";
import RefreshToken from "./refresh-token.model.js";
import bcrypt from "bcryptjs";
import generateToken from "../../utils/generate-token.js";
import {
  hashToken,
  generateOpaqueToken,
  issueRefreshToken
} from "./refresh-token.service.js";
import {
  AUTH_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH
} from "../../config/cookie.js";

describe("Refresh Token Controller & Authentication Integration Tests", () => {
  let app;

  beforeEach(() => {
    vi.restoreAllMocks();
    app = createApp({ corsOrigin: "http://localhost:3000" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("A. Dual Cookie Issuance on Login", () => {
    it("A1. customer login sets both auth_token and refresh_token HttpOnly cookies", async () => {
      const mockUser = {
        _id: "507f1f77bcf86cd799439011",
        name: "Test Customer",
        email: "customer@example.com",
        role: "customer",
        isActive: true,
        tokenVersion: 0,
        password: "hashed-password"
      };

      vi.spyOn(User, "findOne").mockReturnValue({
        select: vi.fn().mockResolvedValue(mockUser)
      });
      vi.spyOn(bcrypt, "compare").mockResolvedValue(true);
      vi.spyOn(RefreshToken, "create").mockResolvedValue({
        _id: "rt-1",
        tokenHash: "dummy-hash",
        userId: mockUser._id,
        family: "family-1",
        audience: "customer",
        isRevoked: false,
        expiresAt: new Date(Date.now() + 600000000)
      });

      const res = await request(app)
        .post("/api/v1/users/login")
        .send({ email: "customer@example.com", password: "Password123!" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify Set-Cookie header contains both cookies
      const setCookie = res.headers["set-cookie"];
      expect(setCookie).toBeDefined();

      const authCookie = setCookie.find((c) => c.startsWith(`${AUTH_COOKIE_NAME}=`));
      const refreshCookie = setCookie.find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`));

      expect(authCookie).toBeDefined();
      expect(authCookie).toContain("HttpOnly");
      expect(authCookie).toContain("Path=/;");

      expect(refreshCookie).toBeDefined();
      expect(refreshCookie).toContain("HttpOnly");
      expect(refreshCookie).toContain(`Path=${REFRESH_COOKIE_PATH}`);

      // Verify token is NOT exposed in response body
      expect(res.body.data?.token).toBeUndefined();
      expect(res.body.data?.accessToken).toBeUndefined();
      expect(res.body.data?.refreshToken).toBeUndefined();
    });

    it("A2. admin login sets dual cookies with audience: 'admin'", async () => {
      const mockAdmin = {
        _id: "507f1f77bcf86cd799439012",
        name: "Admin User",
        email: "admin@example.com",
        role: "admin",
        isActive: true,
        tokenVersion: 0,
        password: "hashed-password"
      };

      vi.spyOn(User, "findOne").mockReturnValue({
        select: vi.fn().mockResolvedValue(mockAdmin)
      });
      vi.spyOn(bcrypt, "compare").mockResolvedValue(true);
      const createSpy = vi.spyOn(RefreshToken, "create").mockResolvedValue({
        _id: "rt-admin",
        tokenHash: "admin-hash",
        userId: mockAdmin._id,
        family: "family-admin",
        audience: "admin",
        isRevoked: false,
        expiresAt: new Date(Date.now() + 600000000)
      });

      const res = await request(app)
        .post("/api/v1/users/admin/login")
        .send({ email: "admin@example.com", password: "AdminPassword123!" });

      expect(res.status).toBe(200);
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockAdmin._id,
          audience: "admin"
        })
      );
    });
  });

  describe("B. POST /api/v1/users/refresh Endpoint", () => {
    it("B1. rejects request with 403 when CSRF client header is missing", async () => {
      const res = await request(app)
        .post("/api/v1/users/refresh")
        .set("Origin", "http://localhost:3000")
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.error?.code).toBe("CSRF_HEADER_MISSING");
    });

    it("B2. rejects request with 401 when refresh token is missing", async () => {
      const res = await request(app)
        .post("/api/v1/users/refresh")
        .set("Origin", "http://localhost:3000")
        .set("X-CommerceFlow-Client", "web")
        .send({});

      expect(res.status).toBe(401);
      expect(res.body.error?.code).toBe("REFRESH_TOKEN_REQUIRED");
    });

    it("B3. successfully rotates session and sets new dual cookies on valid refresh", async () => {
      const rawToken = generateOpaqueToken();
      const tokenHash = hashToken(rawToken);

      const mockUser = {
        _id: "507f1f77bcf86cd799439011",
        name: "Test Customer",
        email: "customer@example.com",
        role: "customer",
        isActive: true,
        tokenVersion: 0
      };

      const mockExistingToken = {
        _id: "token-doc-1",
        tokenHash,
        userId: mockUser._id,
        family: "family-1",
        audience: "customer",
        isRevoked: false,
        expiresAt: new Date(Date.now() + 500000)
      };

      vi.spyOn(RefreshToken, "findOne").mockResolvedValue(mockExistingToken);
      vi.spyOn(RefreshToken, "findOneAndUpdate").mockResolvedValue(mockExistingToken);
      vi.spyOn(RefreshToken, "create").mockResolvedValue({
        _id: "token-doc-2",
        family: "family-1"
      });
      vi.spyOn(User, "findById").mockResolvedValue(mockUser);

      const res = await request(app)
        .post("/api/v1/users/refresh")
        .set("Origin", "http://localhost:3000")
        .set("X-CommerceFlow-Client", "web")
        .set("Cookie", [`${REFRESH_COOKIE_NAME}=${rawToken}`])
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data?.user?.email).toBe("customer@example.com");

      // Verify Set-Cookie contains rotated tokens
      const setCookie = res.headers["set-cookie"];
      expect(setCookie).toBeDefined();
      const authCookie = setCookie.find((c) => c.startsWith(`${AUTH_COOKIE_NAME}=`));
      const refreshCookie = setCookie.find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`));
      expect(authCookie).toBeDefined();
      expect(refreshCookie).toBeDefined();
    });

    it("B3b. rotates valid refresh token for super_admin and returns user with role 'super_admin'", async () => {
      const rawToken = generateOpaqueToken();
      const tokenHash = hashToken(rawToken);

      const mockSuperAdminUser = {
        _id: "507f1f77bcf86cd799439099",
        name: "Super Admin",
        email: "superadmin@example.com",
        role: "super_admin",
        isActive: true,
        tokenVersion: 0
      };

      const mockExistingToken = {
        _id: "token-doc-super",
        tokenHash,
        userId: mockSuperAdminUser._id,
        family: "family-super",
        audience: "admin",
        tokenVersion: 0,
        isRevoked: false,
        expiresAt: new Date(Date.now() + 500000)
      };

      vi.spyOn(RefreshToken, "findOne").mockResolvedValue(mockExistingToken);
      vi.spyOn(RefreshToken, "findOneAndUpdate").mockResolvedValue(mockExistingToken);
      vi.spyOn(RefreshToken, "create").mockResolvedValue({
        _id: "new-super-token-doc",
        tokenHash: "new-hash-super",
        userId: mockSuperAdminUser._id,
        family: "family-super",
        audience: "admin"
      });
      vi.spyOn(User, "findById").mockResolvedValue(mockSuperAdminUser);

      const res = await request(app)
        .post("/api/v1/users/refresh")
        .set("Origin", "http://localhost:3000")
        .set("X-CommerceFlow-Client", "web")
        .set("Cookie", [`${REFRESH_COOKIE_NAME}=${rawToken}`])
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data?.user?.email).toBe("superadmin@example.com");
      expect(res.body.data?.user?.role).toBe("super_admin");
    });

    it("B4. REUSE DETECTION: replaying already-rotated token returns 401 TOKEN_REUSE_DETECTED and clears cookies", async () => {
      const rawToken = generateOpaqueToken();
      const tokenHash = hashToken(rawToken);

      const mockRevokedToken = {
        _id: "revoked-token-1",
        tokenHash,
        userId: "507f1f77bcf86cd799439011",
        family: "compromised-family-123",
        audience: "customer",
        isRevoked: true,
        expiresAt: new Date(Date.now() + 500000)
      };

      vi.spyOn(RefreshToken, "findOne").mockResolvedValue(mockRevokedToken);
      const updateManySpy = vi.spyOn(RefreshToken, "updateMany").mockResolvedValue({ modifiedCount: 2 });
      const userUpdateSpy = vi.spyOn(User, "findByIdAndUpdate").mockResolvedValue({});

      const res = await request(app)
        .post("/api/v1/users/refresh")
        .set("Origin", "http://localhost:3000")
        .set("X-CommerceFlow-Client", "web")
        .set("Cookie", [`${REFRESH_COOKIE_NAME}=${rawToken}`])
        .send({});

      expect(res.status).toBe(401);
      expect(res.body.error?.code).toBe("TOKEN_REUSE_DETECTED");
      expect(updateManySpy).toHaveBeenCalledWith(
        { family: "compromised-family-123" },
        { $set: { isRevoked: true } }
      );
      expect(userUpdateSpy).toHaveBeenCalledWith(
        "507f1f77bcf86cd799439011",
        { $inc: { tokenVersion: 1 } }
      );

      // Verify cookies are wiped on reuse detection
      const setCookie = res.headers["set-cookie"];
      expect(setCookie).toBeDefined();
      const clearAuth = setCookie.find((c) => c.includes(`${AUTH_COOKIE_NAME}=;`));
      const clearRefresh = setCookie.find((c) => c.includes(`${REFRESH_COOKIE_NAME}=;`));
      expect(clearAuth).toBeDefined();
      expect(clearRefresh).toBeDefined();
    });

    it("B5. rejects refresh if user account was deactivated in MongoDB", async () => {
      const rawToken = generateOpaqueToken();
      const tokenHash = hashToken(rawToken);

      const mockDeactivatedUser = {
        _id: "507f1f77bcf86cd799439011",
        isActive: false
      };

      const mockExistingToken = {
        _id: "token-doc-1",
        tokenHash,
        userId: mockDeactivatedUser._id,
        family: "family-1",
        audience: "customer",
        isRevoked: false,
        expiresAt: new Date(Date.now() + 500000)
      };

      vi.spyOn(RefreshToken, "findOne").mockResolvedValue(mockExistingToken);
      vi.spyOn(RefreshToken, "findOneAndUpdate").mockResolvedValue(mockExistingToken);
      vi.spyOn(RefreshToken, "create").mockResolvedValue({});
      vi.spyOn(User, "findById").mockResolvedValue(mockDeactivatedUser);
      const updateManySpy = vi.spyOn(RefreshToken, "updateMany").mockResolvedValue({});

      const res = await request(app)
        .post("/api/v1/users/refresh")
        .set("Origin", "http://localhost:3000")
        .set("X-CommerceFlow-Client", "web")
        .set("Cookie", [`${REFRESH_COOKIE_NAME}=${rawToken}`])
        .send({});

      expect(res.status).toBe(401);
      expect(res.body.error?.code).toBe("ACCOUNT_DEACTIVATED");
      expect(updateManySpy).toHaveBeenCalledWith(
        { family: "family-1" },
        { $set: { isRevoked: true } }
      );
    });

    it("B6. AUDIENCE ISOLATION: rejects admin refresh if user was demoted to customer", async () => {
      const rawToken = generateOpaqueToken();
      const tokenHash = hashToken(rawToken);

      // User has been demoted to 'customer' in the database
      const mockDemotedUser = {
        _id: "507f1f77bcf86cd799439012",
        role: "customer",
        isActive: true
      };

      const mockAdminToken = {
        _id: "token-doc-admin",
        tokenHash,
        userId: mockDemotedUser._id,
        family: "family-admin",
        audience: "admin", // Token was originally issued for admin portal
        isRevoked: false,
        expiresAt: new Date(Date.now() + 500000)
      };

      vi.spyOn(RefreshToken, "findOne").mockResolvedValue(mockAdminToken);
      vi.spyOn(RefreshToken, "findOneAndUpdate").mockResolvedValue(mockAdminToken);
      vi.spyOn(RefreshToken, "create").mockResolvedValue({});
      vi.spyOn(User, "findById").mockResolvedValue(mockDemotedUser);
      const updateManySpy = vi.spyOn(RefreshToken, "updateMany").mockResolvedValue({});

      const res = await request(app)
        .post("/api/v1/users/refresh")
        .set("Origin", "http://localhost:3000")
        .set("X-CommerceFlow-Client", "web")
        .set("Cookie", [`${REFRESH_COOKIE_NAME}=${rawToken}`])
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.error?.code).toBe("FORBIDDEN");
      expect(updateManySpy).toHaveBeenCalledWith(
        { family: "family-admin" },
        { $set: { isRevoked: true } }
      );
    });

    it("B6b. AUDIENCE ISOLATION: rejects super_admin refresh if user was demoted to customer", async () => {
      const rawToken = generateOpaqueToken();
      const tokenHash = hashToken(rawToken);

      // Super admin has been demoted to 'customer' in the database
      const mockDemotedUser = {
        _id: "507f1f77bcf86cd799439099",
        role: "customer",
        isActive: true
      };

      const mockSuperAdminToken = {
        _id: "token-doc-super-admin",
        tokenHash,
        userId: mockDemotedUser._id,
        family: "family-super-admin",
        audience: "admin",
        isRevoked: false,
        expiresAt: new Date(Date.now() + 500000)
      };

      vi.spyOn(RefreshToken, "findOne").mockResolvedValue(mockSuperAdminToken);
      vi.spyOn(RefreshToken, "findOneAndUpdate").mockResolvedValue(mockSuperAdminToken);
      vi.spyOn(RefreshToken, "create").mockResolvedValue({});
      vi.spyOn(User, "findById").mockResolvedValue(mockDemotedUser);
      const updateManySpy = vi.spyOn(RefreshToken, "updateMany").mockResolvedValue({});

      const res = await request(app)
        .post("/api/v1/users/refresh")
        .set("Origin", "http://localhost:3000")
        .set("X-CommerceFlow-Client", "web")
        .set("Cookie", [`${REFRESH_COOKIE_NAME}=${rawToken}`])
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.error?.code).toBe("FORBIDDEN");
      expect(res.body.error?.message).toMatch(/Administrator privileges have been revoked/);
      expect(updateManySpy).toHaveBeenCalledWith(
        { family: "family-super-admin" },
        { $set: { isRevoked: true } }
      );
    });

    it("B7. AUDIENCE ISOLATION: rejects customer refresh if user was promoted to admin, preventing customer session from minting admin privileges", async () => {
      const rawToken = generateOpaqueToken();
      const tokenHash = hashToken(rawToken);

      // User has been promoted to 'admin' in the database
      const mockPromotedUser = {
        _id: "507f1f77bcf86cd799439011",
        role: "admin",
        isActive: true,
        tokenVersion: 0
      };

      // Refresh token was issued when user was only a customer
      const mockCustomerToken = {
        _id: "token-doc-customer",
        tokenHash,
        userId: mockPromotedUser._id,
        family: "family-customer",
        audience: "customer",
        tokenVersion: 0,
        isRevoked: false,
        expiresAt: new Date(Date.now() + 500000)
      };

      vi.spyOn(RefreshToken, "findOne").mockResolvedValue(mockCustomerToken);
      vi.spyOn(RefreshToken, "findOneAndUpdate").mockResolvedValue(mockCustomerToken);
      vi.spyOn(RefreshToken, "create").mockResolvedValue({});
      vi.spyOn(User, "findById").mockResolvedValue(mockPromotedUser);
      const updateManySpy = vi.spyOn(RefreshToken, "updateMany").mockResolvedValue({});

      const res = await request(app)
        .post("/api/v1/users/refresh")
        .set("Origin", "http://localhost:3000")
        .set("X-CommerceFlow-Client", "web")
        .set("Cookie", [`${REFRESH_COOKIE_NAME}=${rawToken}`])
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.error?.code).toBe("FORBIDDEN");
      expect(res.body.error?.message).toMatch(/Account privileges have changed/);
      // Verify family was revoked to force re-authentication via admin portal
      expect(updateManySpy).toHaveBeenCalledWith(
        { family: "family-customer" },
        { $set: { isRevoked: true } }
      );
    });

    it("B8. CONCURRENT REFRESH: losing concurrent request returns 409 CONCURRENT_REFRESH without revoking winner's session or clearing cookies", async () => {
      const rawToken = generateOpaqueToken();
      const tokenHash = hashToken(rawToken);

      const mockExistingToken = {
        _id: "token-doc-concurrent",
        tokenHash,
        userId: "507f1f77bcf86cd799439011",
        family: "family-active-999",
        audience: "customer",
        tokenVersion: 0,
        isRevoked: false,
        expiresAt: new Date(Date.now() + 500000)
      };

      vi.spyOn(RefreshToken, "findOne").mockResolvedValue(mockExistingToken);
      // Simulate that another concurrent request already claimed the token
      vi.spyOn(RefreshToken, "findOneAndUpdate").mockResolvedValue(null);
      const updateManySpy = vi.spyOn(RefreshToken, "updateMany");
      const userUpdateSpy = vi.spyOn(User, "findByIdAndUpdate");

      const res = await request(app)
        .post("/api/v1/users/refresh")
        .set("Origin", "http://localhost:3000")
        .set("X-CommerceFlow-Client", "web")
        .set("Cookie", [`${REFRESH_COOKIE_NAME}=${rawToken}`])
        .send({});

      expect(res.status).toBe(409);
      expect(res.body.error?.code).toBe("CONCURRENT_REFRESH");

      // Critical assertion: winner's session family must NOT be destroyed!
      expect(updateManySpy).not.toHaveBeenCalled();
      expect(userUpdateSpy).not.toHaveBeenCalled();

      // Critical assertion: winner's cookies must NOT be cleared by loser!
      const setCookie = res.headers["set-cookie"];
      const clearAuth = setCookie?.find((c) => c.includes(`${AUTH_COOKIE_NAME}=;`));
      const clearRefresh = setCookie?.find((c) => c.includes(`${REFRESH_COOKIE_NAME}=;`));
      expect(clearAuth).toBeUndefined();
      expect(clearRefresh).toBeUndefined();
    });

    it("B9. TOKEN VERSION: rejects refresh if tokenVersion in refresh doc does not match user tokenVersion in MongoDB", async () => {
      const rawToken = generateOpaqueToken();
      const tokenHash = hashToken(rawToken);

      // User has had their password changed, tokenVersion incremented to 1
      const mockUser = {
        _id: "507f1f77bcf86cd799439011",
        role: "customer",
        isActive: true,
        tokenVersion: 1
      };

      // Stale refresh token issued under tokenVersion: 0
      const mockStaleToken = {
        _id: "token-doc-stale-version",
        tokenHash,
        userId: mockUser._id,
        family: "family-stale",
        audience: "customer",
        tokenVersion: 0,
        isRevoked: false,
        expiresAt: new Date(Date.now() + 500000)
      };

      vi.spyOn(RefreshToken, "findOne").mockResolvedValue(mockStaleToken);
      vi.spyOn(RefreshToken, "findOneAndUpdate").mockResolvedValue(mockStaleToken);
      vi.spyOn(RefreshToken, "create").mockResolvedValue({});
      vi.spyOn(User, "findById").mockResolvedValue(mockUser);
      const updateManySpy = vi.spyOn(RefreshToken, "updateMany").mockResolvedValue({});

      const res = await request(app)
        .post("/api/v1/users/refresh")
        .set("Origin", "http://localhost:3000")
        .set("X-CommerceFlow-Client", "web")
        .set("Cookie", [`${REFRESH_COOKIE_NAME}=${rawToken}`])
        .send({});

      expect(res.status).toBe(401);
      expect(res.body.error?.code).toBe("AUTH_TOKEN_REVOKED");
      expect(updateManySpy).toHaveBeenCalledWith(
        { family: "family-stale" },
        { $set: { isRevoked: true } }
      );
    });
  });

  describe("C. Logout and Password Change Session Revocation", () => {
    it("C1. POST /api/v1/users/logout revokes refresh token in DB and clears both cookies", async () => {
      const rawToken = generateOpaqueToken();
      const tokenHash = hashToken(rawToken);

      const updateSpy = vi.spyOn(RefreshToken, "updateOne").mockResolvedValue({ modifiedCount: 1 });

      const res = await request(app)
        .post("/api/v1/users/logout")
        .set("Cookie", [`${REFRESH_COOKIE_NAME}=${rawToken}`])
        .send({});

      expect(res.status).toBe(200);
      expect(updateSpy).toHaveBeenCalledWith(
        { tokenHash },
        { $set: { isRevoked: true } }
      );

      const setCookie = res.headers["set-cookie"];
      expect(setCookie).toBeDefined();
      const clearAuth = setCookie.find((c) => c.includes(`${AUTH_COOKIE_NAME}=;`));
      const clearRefresh = setCookie.find((c) => c.includes(`${REFRESH_COOKIE_NAME}=;`));
      expect(clearAuth).toBeDefined();
      expect(clearRefresh).toBeDefined();
      expect(clearRefresh).toContain(`Path=${REFRESH_COOKIE_PATH}`);
    });

    it("C1b. BROWSER COOKIE-PATH ROUTING: verifies /api/v1/users/logout is within REFRESH_COOKIE_PATH (/api/v1/users) scope, unlike /api/v1/products", () => {
      expect(REFRESH_COOKIE_PATH).toBe("/api/v1/users");
      const logoutRoute = "/api/v1/users/logout";
      const logoutAllRoute = "/api/v1/users/logout-all";
      const refreshRoute = "/api/v1/users/refresh";
      const catalogRoute = "/api/v1/products";
      const cartRoute = "/api/v1/cart";
      const ordersRoute = "/api/v1/orders";

      // RFC 6265 cookie-path match: cookie-path is a prefix followed by / or end
      expect(logoutRoute.startsWith(REFRESH_COOKIE_PATH)).toBe(true);
      expect(logoutAllRoute.startsWith(REFRESH_COOKIE_PATH)).toBe(true);
      expect(refreshRoute.startsWith(REFRESH_COOKIE_PATH)).toBe(true);
      expect(catalogRoute.startsWith(REFRESH_COOKIE_PATH)).toBe(false);
      expect(cartRoute.startsWith(REFRESH_COOKIE_PATH)).toBe(false);
      expect(ordersRoute.startsWith(REFRESH_COOKIE_PATH)).toBe(false);
    });

    it("C2. POST /api/v1/users/logout-all increments user tokenVersion and revokes all refresh tokens", async () => {
      const mockUser = {
        _id: "507f1f77bcf86cd799439011",
        email: "customer@example.com",
        role: "customer",
        isActive: true,
        tokenVersion: 0,
        save: vi.fn().mockResolvedValue({})
      };

      const validToken = generateToken({
        userId: mockUser._id,
        email: mockUser.email,
        role: mockUser.role,
        tokenVersion: 0
      });

      vi.spyOn(User, "findById").mockResolvedValue(mockUser);
      const updateManySpy = vi.spyOn(RefreshToken, "updateMany").mockResolvedValue({ modifiedCount: 5 });

      const res = await request(app)
        .post("/api/v1/users/logout-all")
        .set("Authorization", `Bearer ${validToken}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockUser.tokenVersion).toBe(1);
      expect(mockUser.save).toHaveBeenCalled();
      expect(updateManySpy).toHaveBeenCalledWith(
        { userId: mockUser._id, isRevoked: false },
        { $set: { isRevoked: true } }
      );
    });

    it("C3. Password change increments tokenVersion and revokes all active refresh tokens", async () => {
      const mockUser = {
        _id: "507f1f77bcf86cd799439011",
        email: "customer@example.com",
        role: "customer",
        isActive: true,
        tokenVersion: 0,
        password: "old-hashed-password",
        save: vi.fn().mockResolvedValue({})
      };

      const validToken = generateToken({
        userId: mockUser._id,
        email: mockUser.email,
        role: mockUser.role,
        tokenVersion: 0
      });

      vi.spyOn(User, "findById").mockReturnValue({
        select: vi.fn().mockResolvedValue(mockUser)
      });
      vi.spyOn(bcrypt, "compare").mockResolvedValue(true);
      vi.spyOn(bcrypt, "hash").mockResolvedValue("new-hashed-password");
      const updateManySpy = vi.spyOn(RefreshToken, "updateMany").mockResolvedValue({ modifiedCount: 3 });

      const res = await request(app)
        .patch("/api/v1/users/me/password")
        .set("Authorization", `Bearer ${validToken}`)
        .send({
          currentPassword: "OldPassword123!",
          newPassword: "NewSecurePassword123!"
        });

      expect(res.status).toBe(200);
      expect(mockUser.tokenVersion).toBe(1);
      expect(mockUser.save).toHaveBeenCalled();
      expect(updateManySpy).toHaveBeenCalledWith(
        { userId: mockUser._id, isRevoked: false },
        { $set: { isRevoked: true } }
      );
    });

    it("C4. Old access token with outdated tokenVersion is rejected by authMiddleware with 401 AUTH_TOKEN_REVOKED", async () => {
      // User has tokenVersion = 1 after password change
      const mockUser = {
        _id: "507f1f77bcf86cd799439011",
        email: "customer@example.com",
        role: "customer",
        isActive: true,
        tokenVersion: 1
      };

      // Stale token minted prior to password change (tokenVersion = 0)
      const staleToken = generateToken({
        userId: mockUser._id,
        email: mockUser.email,
        role: mockUser.role,
        tokenVersion: 0
      });

      vi.spyOn(User, "findById").mockResolvedValue(mockUser);

      const res = await request(app)
        .get("/api/v1/users/me")
        .set("Authorization", `Bearer ${staleToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error?.code).toBe("AUTH_TOKEN_REVOKED");
    });
  });

  describe("D. Backward Compatibility with Authorization: Bearer", () => {
    it("D1. non-browser API clients using Authorization: Bearer authenticate seamlessly", async () => {
      const mockUser = {
        _id: "507f1f77bcf86cd799439011",
        name: "Test Customer",
        email: "customer@example.com",
        role: "customer",
        isActive: true,
        tokenVersion: 0
      };

      const validToken = generateToken({
        userId: mockUser._id,
        email: mockUser.email,
        role: mockUser.role,
        tokenVersion: 0
      });

      vi.spyOn(User, "findById").mockResolvedValue(mockUser);

      const res = await request(app)
        .get("/api/v1/users/me")
        .set("Authorization", `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data?.user?.email).toBe("customer@example.com");
    });
  });
});
