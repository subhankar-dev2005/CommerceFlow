import mongoose from "mongoose";
import { describe, it, expect } from "vitest";
import Campaign, {
  CAMPAIGN_STATUSES,
  CAMPAIGN_BANNER_PLACEMENTS
} from "./campaign.model.js";

function createValidCampaignData(overrides = {}) {
  return {
    name: "Winter Festive Clearance",
    objective: "Drive holiday sales across seasonal inventory",
    couponCode: "WINTER50",
    startDate: new Date("2026-11-01T00:00:00.000Z"),
    endDate: new Date("2026-11-30T23:59:59.000Z"),
    status: "active",
    bannerPlacement: "hero_carousel",
    createdBy: new mongoose.Types.ObjectId(),
    ...overrides
  };
}

describe("Campaign Model Unit Tests", () => {
  describe("Schema Defaults & Valid Instantiation", () => {
    it("instantiates a valid campaign with default values", async () => {
      const campaign = new Campaign({
        name: "Spring Launch",
        startDate: new Date("2026-03-01"),
        endDate: new Date("2026-03-15")
      });

      await campaign.validate();

      expect(campaign.name).toBe("Spring Launch");
      expect(campaign.objective).toBe("");
      expect(campaign.couponCode).toBeNull();
      expect(campaign.status).toBe("active");
      expect(campaign.bannerPlacement).toBe("hero_carousel");
      expect(campaign.createdBy).toBeNull();
    });

    it("uppercases and trims coupon code if supplied", async () => {
      const campaign = new Campaign(
        createValidCampaignData({ couponCode: "  festive20  " })
      );

      await campaign.validate();
      expect(campaign.couponCode).toBe("FESTIVE20");
    });
  });

  describe("Required Field Constraints", () => {
    it("fails validation when name is missing", async () => {
      const campaign = new Campaign(createValidCampaignData({ name: undefined }));

      await expect(campaign.validate()).rejects.toThrow(/Campaign name is required/);
    });

    it("fails validation when name is shorter than 2 characters", async () => {
      const campaign = new Campaign(createValidCampaignData({ name: "A" }));

      await expect(campaign.validate()).rejects.toThrow(/Campaign name must contain at least 2 characters/);
    });

    it("fails validation when name exceeds 150 characters", async () => {
      const campaign = new Campaign(createValidCampaignData({ name: "A".repeat(151) }));

      await expect(campaign.validate()).rejects.toThrow(/Campaign name cannot exceed 150 characters/);
    });

    it("fails validation when startDate is missing", async () => {
      const campaign = new Campaign(createValidCampaignData({ startDate: undefined }));

      await expect(campaign.validate()).rejects.toThrow(/Start date is required/);
    });

    it("fails validation when endDate is missing", async () => {
      const campaign = new Campaign(createValidCampaignData({ endDate: undefined }));

      await expect(campaign.validate()).rejects.toThrow(/End date is required/);
    });
  });

  describe("Enum Validation", () => {
    it("rejects an invalid status value", async () => {
      const campaign = new Campaign(createValidCampaignData({ status: "invalid_status" }));

      await expect(campaign.validate()).rejects.toThrow(/Status must be 'active', 'upcoming', or 'ended'/);
    });

    it("accepts all permitted statuses", async () => {
      for (const status of CAMPAIGN_STATUSES) {
        const campaign = new Campaign(createValidCampaignData({ status }));
        await campaign.validate();
        expect(campaign.status).toBe(status);
      }
    });

    it("rejects an invalid banner placement", async () => {
      const campaign = new Campaign(createValidCampaignData({ bannerPlacement: "sidebar_popup" }));

      await expect(campaign.validate()).rejects.toThrow(/Banner placement must be/);
    });

    it("accepts all permitted banner placements", async () => {
      for (const bannerPlacement of CAMPAIGN_BANNER_PLACEMENTS) {
        const campaign = new Campaign(createValidCampaignData({ bannerPlacement }));
        await campaign.validate();
        expect(campaign.bannerPlacement).toBe(bannerPlacement);
      }
    });
  });

  describe("Date Ordering Constraints (endDate >= startDate)", () => {
    it("fails validation when endDate is earlier than startDate", async () => {
      const campaign = new Campaign(
        createValidCampaignData({
          startDate: new Date("2026-12-01"),
          endDate: new Date("2026-11-01")
        })
      );

      await expect(campaign.validate()).rejects.toThrow(/End date must be at or after start date/);
    });

    it("passes validation when endDate equals startDate (single-day event)", async () => {
      const sameDay = new Date("2026-10-15T12:00:00.000Z");
      const campaign = new Campaign(
        createValidCampaignData({
          startDate: sameDay,
          endDate: sameDay
        })
      );

      await campaign.validate();
      expect(campaign.endDate.getTime()).toBe(campaign.startDate.getTime());
    });
  });

  describe("Index Definitions", () => {
    it("verifies defined schema indexes", () => {
      const indexes = Campaign.schema.indexes();
      const indexFields = indexes.map(([fields]) => Object.keys(fields).join("_"));

      expect(indexFields).toContain("status_startDate_endDate");
      expect(indexFields).toContain("createdAt");
    });
  });
});
