import { describe, it, expect } from "vitest";
import {
  createCampaignSchema,
  updateCampaignSchema,
  updateCampaignStatusSchema,
  campaignIdParamSchema,
  getAdminCampaignsSchema
} from "./campaign.validator.js";

describe("Campaign Validator Unit Tests", () => {
  describe("createCampaignSchema", () => {
    it("validates a fully populated valid create payload", () => {
      const result = createCampaignSchema.safeParse({
        body: {
          name: "Diwali Mega Sale",
          objective: "High volume holiday promotion",
          couponCode: "FESTIVE25",
          startDate: "2026-10-15T00:00:00.000Z",
          endDate: "2026-10-31T23:59:59.000Z",
          status: "active",
          bannerPlacement: "hero_carousel"
        }
      });

      expect(result.success).toBe(true);
    });

    it("accepts YYYY-MM-DD date format strings", () => {
      const result = createCampaignSchema.safeParse({
        body: {
          name: "Weekend Flash Sale",
          startDate: "2026-11-06",
          endDate: "2026-11-08"
        }
      });

      expect(result.success).toBe(true);
      expect(result.data.body.status).toBe("active");
      expect(result.data.body.bannerPlacement).toBe("hero_carousel");
    });

    it("rejects missing campaign name", () => {
      const result = createCampaignSchema.safeParse({
        body: {
          startDate: "2026-11-06",
          endDate: "2026-11-08"
        }
      });

      expect(result.success).toBe(false);
      expect(result.error.issues.some((i) => i.path.join(".") === "body.name")).toBe(true);
    });

    it("rejects campaign name shorter than 2 characters", () => {
      const result = createCampaignSchema.safeParse({
        body: {
          name: "A",
          startDate: "2026-11-06",
          endDate: "2026-11-08"
        }
      });

      expect(result.success).toBe(false);
      expect(result.error.issues.some((i) => i.message.includes("at least 2 characters"))).toBe(true);
    });

    it("rejects endDate earlier than startDate", () => {
      const result = createCampaignSchema.safeParse({
        body: {
          name: "Time Travel Sale",
          startDate: "2026-11-10",
          endDate: "2026-11-05"
        }
      });

      expect(result.success).toBe(false);
      const issue = result.error.issues.find((i) => i.path.includes("endDate"));
      expect(issue?.message).toBe("End date must be at or after start date");
    });

    it("rejects unsupported strict extra fields in payload", () => {
      const result = createCampaignSchema.safeParse({
        body: {
          name: "Winter Sale",
          startDate: "2026-11-06",
          endDate: "2026-11-08",
          unsupportedCustomField: "malicious_payload"
        }
      });

      expect(result.success).toBe(false);
      expect(result.error.issues.some((i) => i.code === "unrecognized_keys")).toBe(true);
    });

    it("rejects invalid status", () => {
      const result = createCampaignSchema.safeParse({
        body: {
          name: "Winter Sale",
          startDate: "2026-11-06",
          endDate: "2026-11-08",
          status: "not_a_status"
        }
      });

      expect(result.success).toBe(false);
      expect(result.error.issues.some((i) => i.path.join(".") === "body.status")).toBe(true);
    });

    it("rejects invalid banner placement", () => {
      const result = createCampaignSchema.safeParse({
        body: {
          name: "Winter Sale",
          startDate: "2026-11-06",
          endDate: "2026-11-08",
          bannerPlacement: "invalid_placement"
        }
      });

      expect(result.success).toBe(false);
      expect(result.error.issues.some((i) => i.path.join(".") === "body.bannerPlacement")).toBe(true);
    });
  });

  describe("updateCampaignSchema", () => {
    it("validates a valid partial update payload", () => {
      const result = updateCampaignSchema.safeParse({
        params: { campaignId: "507f1f77bcf86cd799439011" },
        body: {
          name: "Renamed Campaign"
        }
      });

      expect(result.success).toBe(true);
    });

    it("rejects empty update body", () => {
      const result = updateCampaignSchema.safeParse({
        params: { campaignId: "507f1f77bcf86cd799439011" },
        body: {}
      });

      expect(result.success).toBe(false);
      const issue = result.error.issues.find((i) => i.message.includes("At least one field must be provided"));
      expect(issue).toBeDefined();
    });

    it("rejects invalid campaignId hex parameter", () => {
      const result = updateCampaignSchema.safeParse({
        params: { campaignId: "invalid-id-format" },
        body: { name: "New Name" }
      });

      expect(result.success).toBe(false);
      expect(result.error.issues.some((i) => i.path.join(".") === "params.campaignId")).toBe(true);
    });

    it("rejects endDate earlier than startDate when both are provided in update", () => {
      const result = updateCampaignSchema.safeParse({
        params: { campaignId: "507f1f77bcf86cd799439011" },
        body: {
          startDate: "2026-12-01",
          endDate: "2026-11-01"
        }
      });

      expect(result.success).toBe(false);
      const issue = result.error.issues.find((i) => i.path.includes("endDate"));
      expect(issue?.message).toBe("End date must be at or after start date");
    });
  });

  describe("updateCampaignStatusSchema", () => {
    it("validates permitted status values", () => {
      for (const status of ["active", "upcoming", "ended"]) {
        const result = updateCampaignStatusSchema.safeParse({
          params: { campaignId: "507f1f77bcf86cd799439011" },
          body: { status }
        });
        expect(result.success).toBe(true);
      }
    });

    it("rejects extra fields in status update payload", () => {
      const result = updateCampaignStatusSchema.safeParse({
        params: { campaignId: "507f1f77bcf86cd799439011" },
        body: {
          status: "ended",
          name: "Attempted Name Modification"
        }
      });

      expect(result.success).toBe(false);
      expect(result.error.issues.some((i) => i.code === "unrecognized_keys")).toBe(true);
    });
  });

  describe("campaignIdParamSchema", () => {
    it("accepts a 24-character hexadecimal ObjectId", () => {
      const result = campaignIdParamSchema.safeParse({
        params: { campaignId: "507f1f77bcf86cd799439011" }
      });
      expect(result.success).toBe(true);
    });

    it("rejects an invalid format ID", () => {
      const result = campaignIdParamSchema.safeParse({
        params: { campaignId: "not-an-object-id" }
      });
      expect(result.success).toBe(false);
    });
  });

  describe("getAdminCampaignsSchema", () => {
    it("applies pagination and sorting defaults", () => {
      const result = getAdminCampaignsSchema.safeParse({
        query: {}
      });

      expect(result.success).toBe(true);
      expect(result.data.query.page).toBe(1);
      expect(result.data.query.limit).toBe(10);
      expect(result.data.query.sortBy).toBe("createdAt");
      expect(result.data.query.sortOrder).toBe("desc");
    });

    it("coerces string page and limit parameters to integers", () => {
      const result = getAdminCampaignsSchema.safeParse({
        query: {
          page: "3",
          limit: "25",
          status: "upcoming",
          bannerPlacement: "category_top",
          search: "festive",
          sortBy: "startDate",
          sortOrder: "asc"
        }
      });

      expect(result.success).toBe(true);
      expect(result.data.query.page).toBe(3);
      expect(result.data.query.limit).toBe(25);
      expect(result.data.query.status).toBe("upcoming");
      expect(result.data.query.bannerPlacement).toBe("category_top");
      expect(result.data.query.search).toBe("festive");
      expect(result.data.query.sortBy).toBe("startDate");
      expect(result.data.query.sortOrder).toBe("asc");
    });

    it("rejects limit greater than 100", () => {
      const result = getAdminCampaignsSchema.safeParse({
        query: { limit: "101" }
      });

      expect(result.success).toBe(false);
      expect(result.error.issues.some((i) => i.path.join(".") === "query.limit")).toBe(true);
    });
  });
});
