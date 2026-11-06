import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { createApp } from "../../app.js";
import User from "./user.model.js";
import registerUser from "./user.controller.js";
import loginUser from "./login-user.controller.js";
import getMe from "./get-me.controller.js";
import updateProfile from "./update-profile.controller.js";
import generateToken from "../../utils/generate-token.js";

describe("User Role Authentication & Authorization Security Tests", () => {
  let app;
  const adminId = "507f1f77bcf86cd799439001";
  const customerId = "507f1f77bcf86cd799439002";
  const superAdminId = "507f1f77bcf86cd799439003";
  let adminToken;
  let customerToken;
  let superAdminToken;

  beforeEach(() => {
    vi.restoreAllMocks();
    app = createApp();
    adminToken = generateToken({
      userId: adminId,
      email: "admin@example.com",
      role: "admin"
    });
    customerToken = generateToken({
      userId: customerId,
      email: "customer@example.com",
      role: "customer"
    });
    superAdminToken = generateToken({
      userId: superAdminId,
      email: "superadmin@example.com",
      role: "super_admin"
    });
  });

  describe("A & B. Registration Role Isolation", () => {
    it("A. Customer registration defaults to role: 'customer'", async () => {
      vi.spyOn(User, "findOne").mockResolvedValue(null);
      vi.spyOn(bcrypt, "hash").mockResolvedValue("hashed-password");

      const createdUser = {
        _id: customerId,
        name: "Normal Customer",
        email: "customer@example.com",
        role: "customer",
        createdAt: new Date()
      };
      const createSpy = vi.spyOn(User, "create").mockResolvedValue(createdUser);

      const req = {
        body: {
          name: "Normal Customer",
          email: "customer@example.com",
          password: "Password123!"
        },
        requestId: "test-req-id"
      };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis()
      };
      const next = vi.fn();

      await registerUser(req, res, next);

      expect(createSpy).toHaveBeenCalledWith({
        name: "Normal Customer",
        email: "customer@example.com",
        password: "hashed-password"
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: {
            user: expect.objectContaining({
              role: "customer"
            })
          }
        })
      );
    });

    it("B. Client cannot register as admin (ignores client-supplied role)", async () => {
      vi.spyOn(User, "findOne").mockResolvedValue(null);
      vi.spyOn(bcrypt, "hash").mockResolvedValue("hashed-password");

      const createdUser = {
        _id: customerId,
        name: "Escalation Attacker",
        email: "attacker@example.com",
        role: "customer", // Defaulted by model
        createdAt: new Date()
      };
      const createSpy = vi.spyOn(User, "create").mockResolvedValue(createdUser);

      const req = {
        body: {
          name: "Escalation Attacker",
          email: "attacker@example.com",
          password: "Password123!",
          role: "admin" // Attempt privilege escalation
        },
        requestId: "test-req-id"
      };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis()
      };
      const next = vi.fn();

      await registerUser(req, res, next);

      // Verify server-side create does NOT pass the client-supplied role
      expect(createSpy).toHaveBeenCalledWith({
        name: "Escalation Attacker",
        email: "attacker@example.com",
        password: "hashed-password"
      });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            user: expect.objectContaining({
              role: "customer"
            })
          }
        })
      );
    });

    it("B2. Client cannot register as super_admin (ignores client-supplied role: 'super_admin')", async () => {
      vi.spyOn(User, "findOne").mockResolvedValue(null);
      vi.spyOn(bcrypt, "hash").mockResolvedValue("hashed-password");

      const createdUser = {
        _id: customerId,
        name: "SuperAdmin Attacker",
        email: "superattacker@example.com",
        role: "customer",
        createdAt: new Date()
      };
      const createSpy = vi.spyOn(User, "create").mockResolvedValue(createdUser);

      const req = {
        body: {
          name: "SuperAdmin Attacker",
          email: "superattacker@example.com",
          password: "Password123!",
          role: "super_admin" // Attempt privilege escalation to super_admin
        },
        requestId: "test-req-id"
      };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis()
      };
      const next = vi.fn();

      await registerUser(req, res, next);

      expect(createSpy).toHaveBeenCalledWith({
        name: "SuperAdmin Attacker",
        email: "superattacker@example.com",
        password: "hashed-password"
      });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            user: expect.objectContaining({
              role: "customer"
            })
          }
        })
      );
    });
  });

  describe("C & D. Legitimate Admin Login & Token Role Propagation", () => {
    it("C. Legitimate admin user authenticates as admin and receives role: 'admin'", async () => {
      const adminRecord = {
        _id: adminId,
        name: "Admin Officer",
        email: "admin@example.com",
        role: "admin",
        password: "hashed-admin-password",
        isActive: true
      };

      const selectMock = vi.fn().mockResolvedValue(adminRecord);
      vi.spyOn(User, "findOne").mockReturnValue({ select: selectMock });
      vi.spyOn(bcrypt, "compare").mockResolvedValue(true);

      const req = {
        body: {
          email: "admin@example.com",
          password: "AdminPassword123!"
        },
        requestId: "test-req-id"
      };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
        cookie: vi.fn().mockReturnThis()
      };
      const next = vi.fn();

      await loginUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);

      // Phase 3 security contract: JWT must NOT be in the response body
      const roleTestPayload = res.json.mock.calls[0][0];
      expect(roleTestPayload).toMatchObject(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            user: {
              id: adminId,
              name: "Admin Officer",
              email: "admin@example.com",
              role: "admin"
            }
          })
        })
      );
      expect(roleTestPayload.data.token).toBeUndefined();

      // Auth and refresh tokens must be set as HttpOnly cookies
      expect(res.cookie).toHaveBeenCalledTimes(2);
      expect(res.cookie).toHaveBeenCalledWith("auth_token", expect.any(String), expect.objectContaining({ httpOnly: true }));
      expect(res.cookie).toHaveBeenCalledWith("refresh_token", expect.any(String), expect.objectContaining({ httpOnly: true }));
    });

    it("D. Current user endpoint (/me) preserves authoritative admin role from database", async () => {
      const adminDbUser = {
        _id: adminId,
        name: "Admin Officer",
        email: "admin@example.com",
        role: "admin",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      vi.spyOn(User, "findById").mockResolvedValue(adminDbUser);

      const req = {
        user: { _id: adminId },
        requestId: "test-req-id"
      };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis()
      };
      const next = vi.fn();

      await getMe(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: {
            user: expect.objectContaining({
              id: adminId,
              email: "admin@example.com",
              role: "admin"
            })
          }
        })
      );
    });
  });

  describe("Profile Update Role Escalation Prevention", () => {
    it("Profile update (PATCH /me) cannot change user role even if role is provided", async () => {
      const mockCustomer = {
        _id: customerId,
        name: "Jane Customer",
        email: "jane@example.com",
        role: "customer",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        save: vi.fn().mockResolvedValue(true)
      };

      vi.spyOn(User, "findById").mockResolvedValue(mockCustomer);

      const req = {
        user: { _id: customerId },
        body: {
          name: "Updated Jane",
          role: "admin" // Attempt privilege escalation via profile update
        },
        requestId: "test-req-id"
      };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis()
      };
      const next = vi.fn();

      await updateProfile(req, res, next);

      expect(mockCustomer.role).toBe("customer");
      expect(mockCustomer.name).toBe("Updated Jane");
      expect(mockCustomer.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            user: expect.objectContaining({
              role: "customer"
            })
          }
        })
      );
    });

    it("Profile update (PATCH /me) cannot escalate user role to 'super_admin'", async () => {
      const mockCustomer = {
        _id: customerId,
        name: "Jane Customer",
        email: "jane@example.com",
        role: "customer",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        save: vi.fn().mockResolvedValue(true)
      };

      vi.spyOn(User, "findById").mockResolvedValue(mockCustomer);

      const req = {
        user: { _id: customerId },
        body: {
          name: "Updated Jane",
          role: "super_admin" // Attempt privilege escalation via profile update
        },
        requestId: "test-req-id"
      };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis()
      };
      const next = vi.fn();

      await updateProfile(req, res, next);

      expect(mockCustomer.role).toBe("customer");
      expect(mockCustomer.name).toBe("Updated Jane");
      expect(mockCustomer.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            user: expect.objectContaining({
              role: "customer"
            })
          }
        })
      );
    });
  });

  describe("E & F. Admin vs Customer Route Authorization Gates", () => {
    it("E. Admin authorization accepts legitimate admin on /admin/test", async () => {
      vi.spyOn(User, "findById").mockResolvedValue({
        _id: adminId,
        email: "admin@example.com",
        role: "admin",
        isActive: true
      });

      const res = await request(app)
        .get("/api/v1/admin/test")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe("Welcome Admin");
      expect(res.body.data.user.role).toBe("admin");
    });

    it("F. Admin authorization strictly rejects customer with 403 FORBIDDEN", async () => {
      vi.spyOn(User, "findById").mockResolvedValue({
        _id: customerId,
        email: "customer@example.com",
        role: "customer",
        isActive: true
      });

      const res = await request(app)
        .get("/api/v1/admin/test")
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("G. Admin authorization accepts legitimate super_admin on /admin/test via expansion", async () => {
      vi.spyOn(User, "findById").mockResolvedValue({
        _id: superAdminId,
        email: "superadmin@example.com",
        role: "super_admin",
        isActive: true
      });

      const res = await request(app)
        .get("/api/v1/admin/test")
        .set("Authorization", `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe("Welcome Admin");
      expect(res.body.data.user.role).toBe("super_admin");
    });
  });
});
