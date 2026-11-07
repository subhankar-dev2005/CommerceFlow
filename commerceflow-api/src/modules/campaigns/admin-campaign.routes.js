import { Router } from "express";
import authMiddleware from "../../common/middleware/auth.middleware.js";
import authorize from "../../common/middleware/authorize.middleware.js";
import validate from "../../common/middleware/validate.middleware.js";
import {
  createCampaign,
  getAdminCampaigns,
  getCampaignById,
  updateCampaign,
  updateCampaignStatus,
  deleteCampaign
} from "./admin-campaign.controller.js";
import {
  createCampaignSchema,
  updateCampaignSchema,
  updateCampaignStatusSchema,
  campaignIdParamSchema,
  getAdminCampaignsSchema
} from "./campaign.validator.js";

const router = Router();

// Enforce authentication and administrator authorization
router.use(authMiddleware, authorize("admin"));

// Create a new promotional campaign
router.post("/", validate(createCampaignSchema), createCampaign);

// List campaigns with pagination and filters
router.get("/", validate(getAdminCampaignsSchema), getAdminCampaigns);

// Get specific campaign details
router.get("/:campaignId", validate(campaignIdParamSchema), getCampaignById);

// Update campaign configuration fields
router.patch("/:campaignId", validate(updateCampaignSchema), updateCampaign);

// Update campaign lifecycle status
router.patch("/:campaignId/status", validate(updateCampaignStatusSchema), updateCampaignStatus);

// Delete campaign
router.delete("/:campaignId", validate(campaignIdParamSchema), deleteCampaign);

export default router;
