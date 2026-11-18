import { describe, it, expect, vi, beforeEach } from "vitest";
import Campaign from "./campaign.model.js";
import {
  createCampaign,
  getAdminCampaigns,
  getCampaignById,
  updateCampaign,
  updateCampaignStatus,
  deleteCampaign
} from "./admin-campaign.controller.js";
import * as auditService from "../audit/admin-audit.service.js";

describe("Admin Campaign Controller Unit Tests", () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    vi.restoreAllMocks();

    req = {
      params: {},
      query: {},
      body: {},
      user: { _id: "507f1f77bcf86cd799439001", email: "admin@example.com", role: "admin" },
      requestId: "req-camp-test-123"
    };

    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };

    next = vi.fn();
  });

  describe("createCampaign", () => {
    it("creates a new campaign, triggers audit event, and returns 201", async () => {
      const mockCreated = {
        _id: "camp_id_101",
        name: "Spring Carnival",
        objective: "Seasonal discount campaign",
        couponCode: "CARNIVAL20",
        startDate: new Date("2026-03-01T00:00:00.000Z"),
        endDate: new Date("2026-03-15T23:59:59.000Z"),
        status: "active",
        bannerPlacement: "hero_carousel",
        createdBy: "507f1f77bcf86cd799439001"
      };

      vi.spyOn(Campaign, "create").mockResolvedValue(mockCreated);
      const auditSpy = vi.spyOn(auditService, "recordAdminAuditEvent").mockResolvedValue({});

      req.body = {
        name: "  Spring Carnival  ",
        objective: "Seasonal discount campaign",
        couponCode: "carnival20",
        startDate: "2026-03-01T00:00:00.000Z",
        endDate: "2026-03-15T23:59:59.000Z",
        status: "active",
        bannerPlacement: "hero_carousel"
      };

      await createCampaign(req, res, next);

      expect(Campaign.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Spring Carnival",
          couponCode: "CARNIVAL20",
          status: "active",
          bannerPlacement: "hero_carousel",
          createdBy: "507f1f77bcf86cd799439001"
        })
      );

      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "CAMPAIGN_CREATED",
          resourceType: "campaign",
          resourceId: "camp_id_101"
        })
      );

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Campaign created successfully",
        data: { campaign: mockCreated },
        requestId: "req-camp-test-123"
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("succeeds even if audit logging fails (non-blocking audit failure resilience)", async () => {
      const mockCreated = {
        _id: "camp_id_102",
        name: "Autumn Clearance",
        startDate: new Date("2026-10-01"),
        endDate: new Date("2026-10-15")
      };

      vi.spyOn(Campaign, "create").mockResolvedValue(mockCreated);
      vi.spyOn(auditService, "recordAdminAuditEvent").mockRejectedValue(new Error("Audit DB down"));

      req.body = {
        name: "Autumn Clearance",
        startDate: "2026-10-01",
        endDate: "2026-10-15"
      };

      await createCampaign(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(next).not.toHaveBeenCalled();
    });

    it("passes unexpected creation errors to next middleware", async () => {
      vi.spyOn(Campaign, "create").mockRejectedValue(new Error("MongoDB timeout"));

      req.body = {
        name: "Faulty Campaign",
        startDate: "2026-10-01",
        endDate: "2026-10-15"
      };

      await createCampaign(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe("getAdminCampaigns", () => {
    it("returns paginated campaigns with computed pagination metadata", async () => {
      const mockCampaigns = [
        { _id: "c1", name: "Campaign 1", status: "active" },
        { _id: "c2", name: "Campaign 2", status: "upcoming" }
      ];

      const leanMock = vi.fn().mockResolvedValue(mockCampaigns);
      const limitMock = vi.fn().mockReturnValue({ lean: leanMock });
      const skipMock = vi.fn().mockReturnValue({ limit: limitMock });
      const sortMock = vi.fn().mockReturnValue({ skip: skipMock });

      vi.spyOn(Campaign, "find").mockReturnValue({ sort: sortMock });
      vi.spyOn(Campaign, "countDocuments").mockResolvedValue(15);

      req.query = { page: "2", limit: "10" };

      await getAdminCampaigns(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Admin campaigns retrieved successfully",
        data: {
          campaigns: mockCampaigns,
          pagination: {
            page: 2,
            limit: 10,
            totalCampaigns: 15,
            totalPages: 2,
            hasNextPage: false,
            hasPrevPage: true
          }
        },
        requestId: "req-camp-test-123"
      });
    });

    it("applies status, bannerPlacement, and search filters correctly", async () => {
      const leanMock = vi.fn().mockResolvedValue([]);
      const limitMock = vi.fn().mockReturnValue({ lean: leanMock });
      const skipMock = vi.fn().mockReturnValue({ limit: limitMock });
      const sortMock = vi.fn().mockReturnValue({ skip: skipMock });

      const findSpy = vi.spyOn(Campaign, "find").mockReturnValue({ sort: sortMock });
      vi.spyOn(Campaign, "countDocuments").mockResolvedValue(0);

      req.query = {
        status: "upcoming",
        bannerPlacement: "category_top",
        search: "winter festive"
      };

      await getAdminCampaigns(req, res, next);

      expect(findSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "upcoming",
          bannerPlacement: "category_top",
          $or: expect.arrayContaining([
            { name: { $regex: "winter festive", $options: "i" } },
            { objective: { $regex: "winter festive", $options: "i" } },
            { couponCode: { $regex: "winter festive", $options: "i" } }
          ])
        })
      );
    });
  });

  describe("getCampaignById", () => {
    it("returns campaign when record exists", async () => {
      const mockCampaign = { _id: "camp_123", name: "Existing Campaign" };
      vi.spyOn(Campaign, "findById").mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockCampaign)
      });

      req.params = { campaignId: "507f1f77bcf86cd799439011" };

      await getCampaignById(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Campaign retrieved successfully",
        data: { campaign: mockCampaign },
        requestId: "req-camp-test-123"
      });
    });

    it("calls next with 404 AppError when campaign is not found", async () => {
      vi.spyOn(Campaign, "findById").mockReturnValue({
        lean: vi.fn().mockResolvedValue(null)
      });

      req.params = { campaignId: "507f1f77bcf86cd799439099" };

      await getCampaignById(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404,
          code: "CAMPAIGN_NOT_FOUND"
        })
      );
    });
  });

  describe("updateCampaign", () => {
    it("updates campaign fields and records audit event", async () => {
      const mockDoc = {
        _id: "camp_123",
        name: "Old Name",
        startDate: new Date("2026-11-01"),
        endDate: new Date("2026-11-30"),
        status: "active",
        save: vi.fn().mockResolvedValue(true)
      };

      vi.spyOn(Campaign, "findById").mockResolvedValue(mockDoc);
      const auditSpy = vi.spyOn(auditService, "recordAdminAuditEvent").mockResolvedValue({});

      req.params = { campaignId: "camp_123" };
      req.body = {
        name: "Updated Campaign Name",
        status: "ended"
      };

      await updateCampaign(req, res, next);

      expect(mockDoc.name).toBe("Updated Campaign Name");
      expect(mockDoc.status).toBe("ended");
      expect(mockDoc.save).toHaveBeenCalled();
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "CAMPAIGN_UPDATED",
          resourceId: "camp_123"
        })
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("throws 400 VALIDATION_ERROR if single date update causes endDate < startDate", async () => {
      const mockDoc = {
        _id: "camp_123",
        name: "Dated Campaign",
        startDate: new Date("2026-11-10"),
        endDate: new Date("2026-11-20"),
        save: vi.fn()
      };

      vi.spyOn(Campaign, "findById").mockResolvedValue(mockDoc);

      req.params = { campaignId: "camp_123" };
      // Attempting to move startDate to after current endDate (2026-11-25 > 2026-11-20)
      req.body = {
        startDate: "2026-11-25"
      };

      await updateCampaign(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          code: "VALIDATION_ERROR"
        })
      );
      expect(mockDoc.save).not.toHaveBeenCalled();
    });

    it("throws 404 when updating non-existent campaign", async () => {
      vi.spyOn(Campaign, "findById").mockResolvedValue(null);

      req.params = { campaignId: "non_existent_id" };
      req.body = { name: "New Name" };

      await updateCampaign(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404,
          code: "CAMPAIGN_NOT_FOUND"
        })
      );
    });
  });

  describe("updateCampaignStatus", () => {
    it("updates status via findByIdAndUpdate and audits event", async () => {
      const updatedCampaign = { _id: "camp_123", status: "ended" };
      vi.spyOn(Campaign, "findByIdAndUpdate").mockResolvedValue(updatedCampaign);
      const auditSpy = vi.spyOn(auditService, "recordAdminAuditEvent").mockResolvedValue({});

      req.params = { campaignId: "camp_123" };
      req.body = { status: "ended" };

      await updateCampaignStatus(req, res, next);

      expect(Campaign.findByIdAndUpdate).toHaveBeenCalledWith(
        "camp_123",
        { $set: { status: "ended" } },
        { new: true, runValidators: true }
      );
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "CAMPAIGN_STATUS_UPDATED",
          resourceId: "camp_123"
        })
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: "Campaign status updated to 'ended' successfully"
        })
      );
    });

    it("returns 404 if campaign to update status is not found", async () => {
      vi.spyOn(Campaign, "findByIdAndUpdate").mockResolvedValue(null);

      req.params = { campaignId: "camp_missing" };
      req.body = { status: "ended" };

      await updateCampaignStatus(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404,
          code: "CAMPAIGN_NOT_FOUND"
        })
      );
    });
  });

  describe("deleteCampaign", () => {
    it("deletes campaign and triggers audit event", async () => {
      const mockCampaign = { _id: "camp_123", name: "Obsolete Campaign" };
      vi.spyOn(Campaign, "findById").mockResolvedValue(mockCampaign);
      vi.spyOn(Campaign, "findByIdAndDelete").mockResolvedValue(mockCampaign);
      const auditSpy = vi.spyOn(auditService, "recordAdminAuditEvent").mockResolvedValue({});

      req.params = { campaignId: "camp_123" };

      await deleteCampaign(req, res, next);

      expect(Campaign.findByIdAndDelete).toHaveBeenCalledWith("camp_123");
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "CAMPAIGN_DELETED",
          resourceId: "camp_123"
        })
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Campaign 'Obsolete Campaign' deleted successfully",
        data: { id: "camp_123" },
        requestId: "req-camp-test-123"
      });
    });

    it("returns 404 if campaign to delete is not found", async () => {
      vi.spyOn(Campaign, "findById").mockResolvedValue(null);

      req.params = { campaignId: "camp_missing" };

      await deleteCampaign(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404,
          code: "CAMPAIGN_NOT_FOUND"
        })
      );
    });
  });
});
