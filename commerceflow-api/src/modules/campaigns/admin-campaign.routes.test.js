import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import User from "../users/user.model.js";
import Campaign from "./campaign.model.js";
import generateToken from "../../utils/generate-token.js";
import { authRateLimitMiddleware } from "../../common/middleware/auth-rate-limit.middleware.js";

describe("Admin Campaign Routes Security & Integration Tests", () => {
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

    authRateLimitMiddleware.resetKey("::ffff:127.0.0.1");
    authRateLimitMiddleware.resetKey("127.0.0.1");
    authRateLimitMiddleware.resetKey("::1");

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

    vi.spyOn(User, "findById").mockImplementation((id) => {
      const idStr = id?.toString();
      if (idStr === adminId) {
        return Promise.resolve({
          _id: adminId,
          email: "admin@example.com",
          role: "admin",
          isActive: true,
          tokenVersion: 0
        });
      }
      if (idStr === customerId) {
        return Promise.resolve({
          _id: customerId,
          email: "customer@example.com",
          role: "customer",
          isActive: true,
          tokenVersion: 0
        });
      }
      if (idStr === superAdminId) {
        return Promise.resolve({
          _id: superAdminId,
          email: "superadmin@example.com",
          role: "super_admin",
          isActive: true,
          tokenVersion: 0
        });
      }
      return Promise.resolve(null);
    });
  });

  describe("Authentication Gateways", () => {
    it("rejects unauthenticated GET /api/v1/admin/campaigns with 401 AUTH_TOKEN_REQUIRED", async () => {
      const res = await request(app).get("/api/v1/admin/campaigns");

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("AUTH_TOKEN_REQUIRED");
    });

    it("rejects unauthenticated POST /api/v1/admin/campaigns with 401 AUTH_TOKEN_REQUIRED", async () => {
      const res = await request(app)
        .post("/api/v1/admin/campaigns")
        .send({ name: "Promo" });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("AUTH_TOKEN_REQUIRED");
    });
  });

  describe("Authorization Gateways", () => {
    it("rejects customer access with 403 FORBIDDEN", async () => {
      const res = await request(app)
        .get("/api/v1/admin/campaigns")
        .set("Authorization", `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("allows standard administrator access", async () => {
      const leanMock = vi.fn().mockResolvedValue([]);
      const limitMock = vi.fn().mockReturnValue({ lean: leanMock });
      const skipMock = vi.fn().mockReturnValue({ limit: limitMock });
      const sortMock = vi.fn().mockReturnValue({ skip: skipMock });

      vi.spyOn(Campaign, "find").mockReturnValue({ sort: sortMock });
      vi.spyOn(Campaign, "countDocuments").mockResolvedValue(0);

      const res = await request(app)
        .get("/api/v1/admin/campaigns")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.campaigns).toEqual([]);
    });

    it("allows super_admin role access via role expansion", async () => {
      const leanMock = vi.fn().mockResolvedValue([]);
      const limitMock = vi.fn().mockReturnValue({ lean: leanMock });
      const skipMock = vi.fn().mockReturnValue({ limit: limitMock });
      const sortMock = vi.fn().mockReturnValue({ skip: skipMock });

      vi.spyOn(Campaign, "find").mockReturnValue({ sort: sortMock });
      vi.spyOn(Campaign, "countDocuments").mockResolvedValue(0);

      const res = await request(app)
        .get("/api/v1/admin/campaigns")
        .set("Authorization", `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe("Validation Middleware Integration", () => {
    it("rejects malformed POST payload with 400 VALIDATION_ERROR", async () => {
      const res = await request(app)
        .post("/api/v1/admin/campaigns")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "",
          startDate: "not-a-date"
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(res.body.error.details.length).toBeGreaterThan(0);
    });

    it("rejects invalid hex ObjectId in URL parameter with 400 VALIDATION_ERROR", async () => {
      const res = await request(app)
        .get("/api/v1/admin/campaigns/not-a-valid-hex-id")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("CRUD Endpoints Integration", () => {
    it("POST /api/v1/admin/campaigns creates campaign and returns 201", async () => {
      const mockCampaign = {
        _id: "507f1f77bcf86cd799439010",
        name: "Spring Sale",
        objective: "Seasonal discount",
        couponCode: "SPRING20",
        startDate: new Date("2026-03-01"),
        endDate: new Date("2026-03-15"),
        status: "active",
        bannerPlacement: "hero_carousel",
        createdBy: adminId
      };

      vi.spyOn(Campaign, "create").mockResolvedValue(mockCampaign);

      const res = await request(app)
        .post("/api/v1/admin/campaigns")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "Spring Sale",
          objective: "Seasonal discount",
          couponCode: "SPRING20",
          startDate: "2026-03-01",
          endDate: "2026-03-15",
          status: "active",
          bannerPlacement: "hero_carousel"
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.campaign.name).toBe("Spring Sale");
    });

    it("PATCH /api/v1/admin/campaigns/:campaignId/status updates status and returns 200", async () => {
      const validCampaignId = "507f1f77bcf86cd799439010";
      const updatedDoc = {
        _id: validCampaignId,
        name: "Spring Sale",
        status: "ended"
      };

      vi.spyOn(Campaign, "findByIdAndUpdate").mockResolvedValue(updatedDoc);

      const res = await request(app)
        .patch(`/api/v1/admin/campaigns/${validCampaignId}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "ended" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.campaign.status).toBe("ended");
    });

    it("DELETE /api/v1/admin/campaigns/:campaignId deletes record and returns 200", async () => {
      const validCampaignId = "507f1f77bcf86cd799439010";
      const mockDoc = { _id: validCampaignId, name: "Deleted Promo" };

      vi.spyOn(Campaign, "findById").mockResolvedValue(mockDoc);
      vi.spyOn(Campaign, "findByIdAndDelete").mockResolvedValue(mockDoc);

      const res = await request(app)
        .delete(`/api/v1/admin/campaigns/${validCampaignId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(validCampaignId);
    });
  });
});
