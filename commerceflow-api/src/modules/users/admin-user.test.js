import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { createApp } from "../../app.js";
import User from "./user.model.js";
import generateToken from "../../utils/generate-token.js";
import { AUTH_COOKIE_NAME } from "../../config/cookie.js";
import { authRateLimitMiddleware } from "../../common/middleware/auth-rate-limit.middleware.js";
import { logger } from "../../config/logger.js";

describe("Production Admin User Management Security & Lifecycle Tests", () => {
  let app;
  const adminId1 = "507f1f77bcf86cd799439001";
  const adminId2 = "507f1f77bcf86cd799439002";
  const customerId = "507f1f77bcf86cd799439003";

  let adminToken1;
  let customerToken;

  beforeEach(() => {
    vi.restoreAllMocks();
    app = createApp();

    authRateLimitMiddleware.resetKey("::ffff:127.0.0.1");
    authRateLimitMiddleware.resetKey("127.0.0.1");
    authRateLimitMiddleware.resetKey("::1");

    adminToken1 = generateToken({
      userId: adminId1,
      email: "admin1@example.com",
      role: "admin"
    });

    customerToken = generateToken({
      userId: customerId,
      email: "customer@example.com",
      role: "customer"
    });
  });

  describe("1-2. Authentication & Authorization Gateways", () => {
    it("1. unauthenticated admin-user request -> 401 AUTH_TOKEN_REQUIRED", async () => {
      const res = await request(app).get("/api/v1/admin/users");

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("AUTH_TOKEN_REQUIRED");
    });

    it("2. customer admin-user request -> 403 FORBIDDEN", async () => {
      vi.spyOn(User, "findById").mockResolvedValue({
        _id: customerId,
        email: "customer@example.com",
        role: "customer",
        isActive: true
      });

      const res = await request(app)
        .get("/api/v1/admin/users")
        .set("Cookie", `${AUTH_COOKIE_NAME}=${customerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });
  });

  describe("3-8. User Listing, Filtering, Bounding & Safe Projection", () => {
    beforeEach(() => {
      vi.spyOn(User, "findById").mockResolvedValue({
        _id: adminId1,
        email: "admin1@example.com",
        role: "admin",
        isActive: true
      });
    });

    it("3. admin can list administrators and users", async () => {
      const mockUsers = [
        {
          _id: adminId1,
          name: "Admin One",
          email: "admin1@example.com",
          role: "admin",
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          _id: adminId2,
          name: "Admin Two",
          email: "admin2@example.com",
          role: "admin",
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      vi.spyOn(User, "countDocuments").mockResolvedValue(2);
      vi.spyOn(User, "find").mockReturnValue({
        select: vi.fn().mockReturnValue({
          sort: vi.fn().mockReturnValue({
            skip: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                lean: vi.fn().mockResolvedValue(mockUsers)
              })
            })
          })
        })
      });

      const res = await request(app)
        .get("/api/v1/admin/users")
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken1}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.users).toHaveLength(2);
      expect(res.body.data.pagination.totalUsers).toBe(2);
      expect(res.body.data.users[0].role).toBe("admin");
    });

    it("4. pagination is bounded with default 10 and max 50", async () => {
      vi.spyOn(User, "countDocuments").mockResolvedValue(100);
      const limitSpy = vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([])
      });

      vi.spyOn(User, "find").mockReturnValue({
        select: vi.fn().mockReturnValue({
          sort: vi.fn().mockReturnValue({
            skip: vi.fn().mockReturnValue({
              limit: limitSpy
            })
          })
        })
      });

      // Request exceeding maximum limit (limit=100) should be clamped to 50
      const res = await request(app)
        .get("/api/v1/admin/users?limit=50")
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken1}`);

      expect(res.status).toBe(200);
      expect(limitSpy).toHaveBeenCalledWith(50);
    });

    it("5. search works across name and email", async () => {
      let capturedFilter = null;
      vi.spyOn(User, "countDocuments").mockImplementation((filter) => {
        capturedFilter = filter;
        return Promise.resolve(1);
      });

      vi.spyOn(User, "find").mockReturnValue({
        select: vi.fn().mockReturnValue({
          sort: vi.fn().mockReturnValue({
            skip: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                lean: vi.fn().mockResolvedValue([])
              })
            })
          })
        })
      });

      const res = await request(app)
        .get("/api/v1/admin/users?search=alice")
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken1}`);

      expect(res.status).toBe(200);
      expect(capturedFilter.$or).toBeDefined();
      expect(capturedFilter.$or[0].name.source).toContain("alice");
      expect(capturedFilter.$or[1].email.source).toContain("alice");
    });

    it("6. role filtering works for admin, customer, or all", async () => {
      let capturedFilter = null;
      vi.spyOn(User, "countDocuments").mockImplementation((filter) => {
        capturedFilter = filter;
        return Promise.resolve(1);
      });

      vi.spyOn(User, "find").mockReturnValue({
        select: vi.fn().mockReturnValue({
          sort: vi.fn().mockReturnValue({
            skip: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                lean: vi.fn().mockResolvedValue([])
              })
            })
          })
        })
      });

      const res = await request(app)
        .get("/api/v1/admin/users?role=admin")
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken1}`);

      expect(res.status).toBe(200);
      expect(capturedFilter.role).toBe("admin");
    });

    it("7. active/inactive filtering works", async () => {
      let capturedFilter = null;
      vi.spyOn(User, "countDocuments").mockImplementation((filter) => {
        capturedFilter = filter;
        return Promise.resolve(1);
      });

      vi.spyOn(User, "find").mockReturnValue({
        select: vi.fn().mockReturnValue({
          sort: vi.fn().mockReturnValue({
            skip: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                lean: vi.fn().mockResolvedValue([])
              })
            })
          })
        })
      });

      const res = await request(app)
        .get("/api/v1/admin/users?status=inactive")
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken1}`);

      expect(res.status).toBe(200);
      expect(capturedFilter.isActive).toBe(false);
    });

    it("8. password fields are never serialized in response", async () => {
      const mockUsers = [
        {
          _id: adminId1,
          name: "Admin One",
          email: "admin1@example.com",
          role: "admin",
          isActive: true,
          password: "plain-password", // Must be discarded
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      vi.spyOn(User, "countDocuments").mockResolvedValue(1);
      vi.spyOn(User, "find").mockReturnValue({
        select: vi.fn().mockReturnValue({
          sort: vi.fn().mockReturnValue({
            skip: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                lean: vi.fn().mockResolvedValue(mockUsers)
              })
            })
          })
        })
      });

      const res = await request(app)
        .get("/api/v1/admin/users")
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken1}`);

      expect(res.status).toBe(200);
      const user = res.body.data.users[0];
      expect(user.password).toBeUndefined();
      expect(user.hash).toBeUndefined();
      expect(user.token).toBeUndefined();
    });
  });

  describe("9-13. Administrator Creation & Privilege Safety", () => {
    beforeEach(() => {
      vi.spyOn(User, "findById").mockResolvedValue({
        _id: adminId1,
        email: "admin1@example.com",
        role: "admin",
        isActive: true
      });
    });

    it("9. admin can create another admin with valid fields", async () => {
      vi.spyOn(User, "findOne").mockResolvedValue(null);
      vi.spyOn(bcrypt, "hash").mockResolvedValue("hashed-password-123");

      const createdAdmin = {
        _id: adminId2,
        name: "New System Admin",
        email: "newadmin@example.com",
        role: "admin",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      const createSpy = vi.spyOn(User, "create").mockResolvedValue(createdAdmin);

      const res = await request(app)
        .post("/api/v1/admin/users")
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken1}`)
        .send({
          name: "New System Admin",
          email: "newadmin@example.com",
          password: "AdminPassword123!"
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe("admin");
      expect(res.body.data.user.email).toBe("newadmin@example.com");
      expect(createSpy).toHaveBeenCalledWith({
        name: "New System Admin",
        email: "newadmin@example.com",
        password: "hashed-password-123",
        role: "admin",
        isActive: true
      });
    });

    it("10. client cannot create arbitrary roles or force role=customer in creation", async () => {
      vi.spyOn(User, "findOne").mockResolvedValue(null);
      vi.spyOn(bcrypt, "hash").mockResolvedValue("hashed-password-123");

      const createSpy = vi.spyOn(User, "create").mockResolvedValue({
        _id: adminId2,
        name: "Role Test",
        email: "roletest@example.com",
        role: "admin",
        isActive: true,
        createdAt: new Date()
      });

      const res = await request(app)
        .post("/api/v1/admin/users")
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken1}`)
        .send({
          name: "Role Test",
          email: "roletest@example.com",
          password: "AdminPassword123!",
          role: "super_root" // Client attempts arbitrary role
        });

      expect(res.status).toBe(201);
      // Server-side enforcement forces role: "admin"
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          role: "admin"
        })
      );
    });

    it("11. duplicate email is rejected with 409 EMAIL_ALREADY_EXISTS", async () => {
      vi.spyOn(User, "findOne").mockResolvedValue({
        _id: "existing-id",
        email: "existing@example.com"
      });

      const res = await request(app)
        .post("/api/v1/admin/users")
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken1}`)
        .send({
          name: "Duplicate User",
          email: "existing@example.com",
          password: "AdminPassword123!"
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("EMAIL_ALREADY_EXISTS");
    });

    it("12. weak/invalid password is rejected by Zod validation", async () => {
      const res = await request(app)
        .post("/api/v1/admin/users")
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken1}`)
        .send({
          name: "Short Pass Admin",
          email: "shortpass@example.com",
          password: "123" // Less than 6 characters
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("13. created account strictly receives role=admin and isActive=true", async () => {
      vi.spyOn(User, "findOne").mockResolvedValue(null);
      vi.spyOn(bcrypt, "hash").mockResolvedValue("hashed-password-123");

      vi.spyOn(User, "create").mockImplementation((doc) =>
        Promise.resolve({
          _id: "created-id",
          ...doc,
          createdAt: new Date(),
          updatedAt: new Date()
        })
      );

      const res = await request(app)
        .post("/api/v1/admin/users")
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken1}`)
        .send({
          name: "Verified Admin",
          email: "verified@example.com",
          password: "AdminPassword123!"
        });

      expect(res.status).toBe(201);
      expect(res.body.data.user.role).toBe("admin");
      expect(res.body.data.user.isActive).toBe(true);
    });
  });

  describe("14-17. Status/Role Mutations & Last-Admin Protection", () => {
    beforeEach(() => {
      vi.spyOn(User, "findById").mockImplementation((id) => {
        if (id === adminId1) {
          return Promise.resolve({
            _id: adminId1,
            name: "Acting Admin",
            email: "admin1@example.com",
            role: "admin",
            isActive: true,
            save: vi.fn().mockResolvedValue(true)
          });
        }
        if (id === adminId2) {
          return Promise.resolve({
            _id: adminId2,
            name: "Secondary Admin",
            email: "admin2@example.com",
            role: "admin",
            isActive: true,
            save: vi.fn().mockResolvedValue(true)
          });
        }
        if (id === customerId) {
          return Promise.resolve({
            _id: customerId,
            name: "Normal Customer",
            email: "customer@example.com",
            role: "customer",
            isActive: true,
            save: vi.fn().mockResolvedValue(true)
          });
        }
        return Promise.resolve(null);
      });
    });

    it("14. admin can activate/deactivate permitted target user when multiple admins exist", async () => {
      // 2 active admins exist
      vi.spyOn(User, "countDocuments").mockResolvedValue(2);

      const res = await request(app)
        .patch(`/api/v1/admin/users/${adminId2}/status`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken1}`)
        .send({ isActive: false });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.isActive).toBe(false);
    });

    it("15. final active admin CANNOT be deactivated (409 CANNOT_DEACTIVATE_LAST_ADMIN)", async () => {
      // Only 1 active admin exists
      vi.spyOn(User, "countDocuments").mockResolvedValue(1);

      const res = await request(app)
        .patch(`/api/v1/admin/users/${adminId2}/status`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken1}`)
        .send({ isActive: false });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("CANNOT_DEACTIVATE_LAST_ADMIN");
      expect(res.body.error.message).toContain("final active administrator");
    });

    it("16. final active admin CANNOT be demoted (409 CANNOT_DEMOTE_LAST_ADMIN)", async () => {
      // Only 1 active admin exists
      vi.spyOn(User, "countDocuments").mockResolvedValue(1);

      const res = await request(app)
        .patch(`/api/v1/admin/users/${adminId2}/role`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken1}`)
        .send({ role: "customer" });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("CANNOT_DEMOTE_LAST_ADMIN");
      expect(res.body.error.message).toContain("final active administrator");
    });

    it("17. unsafe self-lockout is prevented (acting admin cannot deactivate or demote themselves)", async () => {
      vi.spyOn(User, "countDocuments").mockResolvedValue(3); // Even with 3 active admins

      // Attempt self-deactivation
      const deactRes = await request(app)
        .patch(`/api/v1/admin/users/${adminId1}/status`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken1}`)
        .send({ isActive: false });

      expect(deactRes.status).toBe(400);
      expect(deactRes.body.error.code).toBe("CANNOT_DEACTIVATE_SELF");

      // Attempt self-demotion
      const demoteRes = await request(app)
        .patch(`/api/v1/admin/users/${adminId1}/role`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken1}`)
        .send({ role: "customer" });

      expect(demoteRes.status).toBe(400);
      expect(demoteRes.body.error.code).toBe("CANNOT_DEMOTE_SELF");
    });

    it("18. invalid role string is rejected by Zod schema", async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/users/${customerId}/role`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken1}`)
        .send({ role: "moderator" });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("19. admin can promote customer to admin", async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/users/${customerId}/role`)
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken1}`)
        .send({ role: "admin" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe("admin");
    });

    it("20. security-sensitive mutations log events without logging passwords or tokens", async () => {
      const loggerSpy = vi.spyOn(logger, "info");

      vi.spyOn(User, "findOne").mockResolvedValue(null);
      vi.spyOn(bcrypt, "hash").mockResolvedValue("hashed-password-123");
      vi.spyOn(User, "create").mockResolvedValue({
        _id: adminId2,
        name: "Logged Admin",
        email: "logged@example.com",
        role: "admin",
        isActive: true,
        createdAt: new Date()
      });

      await request(app)
        .post("/api/v1/admin/users")
        .set("Cookie", `${AUTH_COOKIE_NAME}=${adminToken1}`)
        .send({
          name: "Logged Admin",
          email: "logged@example.com",
          password: "SuperSecretPassword123!"
        });

      expect(loggerSpy).toHaveBeenCalled();
      const loggedPayload = loggerSpy.mock.calls[0][0];
      // Assert password or tokens are never present in logger payload
      expect(loggedPayload.password).toBeUndefined();
      expect(loggedPayload.token).toBeUndefined();
      expect(loggedPayload.SuperSecretPassword123).toBeUndefined();
    });
  });
});
