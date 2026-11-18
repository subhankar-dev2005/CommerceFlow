import Campaign from "./campaign.model.js";
import AppError from "../../common/errors/app-error.js";
import escapeRegex from "../../utils/escape-regex.js";
import { recordAdminAuditEvent } from "../audit/admin-audit.service.js";

/**
 * POST /api/v1/admin/campaigns
 * Creates a new administrative marketing campaign.
 */
export async function createCampaign(req, res, next) {
  try {
    const {
      name,
      objective,
      couponCode,
      startDate,
      endDate,
      status = "active",
      bannerPlacement = "hero_carousel"
    } = req.body;

    const campaign = await Campaign.create({
      name: name.trim(),
      objective: objective ? objective.trim() : "",
      couponCode: couponCode ? couponCode.trim().toUpperCase() : null,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      status,
      bannerPlacement,
      createdBy: req.user?._id || null
    });

    try {
      await recordAdminAuditEvent({
        eventType: "CAMPAIGN_CREATED",
        resourceType: "campaign",
        resourceId: campaign._id.toString(),
        metadata: {
          action: "CAMPAIGN_CREATED",
          name: campaign.name,
          status: campaign.status,
          startDate: campaign.startDate,
          endDate: campaign.endDate,
          bannerPlacement: campaign.bannerPlacement,
          couponCode: campaign.couponCode
        },
        req
      });
    } catch {
      // Non-blocking per repository audit logging convention
    }

    return res.status(201).json({
      success: true,
      message: "Campaign created successfully",
      data: { campaign },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/admin/campaigns
 * Retrieves a paginated list of campaigns with status and search filters.
 */
export async function getAdminCampaigns(req, res, next) {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const skip = (page - 1) * limit;

    const filter = {};

    if (req.query.status && req.query.status !== "all") {
      filter.status = req.query.status;
    }

    if (req.query.bannerPlacement && req.query.bannerPlacement !== "all") {
      filter.bannerPlacement = req.query.bannerPlacement;
    }

    if (req.query.search && typeof req.query.search === "string") {
      const search = req.query.search.trim();
      if (search) {
        const escaped = escapeRegex(search);
        filter.$or = [
          { name: { $regex: escaped, $options: "i" } },
          { objective: { $regex: escaped, $options: "i" } },
          { couponCode: { $regex: escaped, $options: "i" } }
        ];
      }
    }

    const sortField = req.query.sortBy || "createdAt";
    const sortDirection = req.query.sortOrder === "asc" ? 1 : -1;
    const sortOptions = { [sortField]: sortDirection, _id: sortDirection };

    const [campaigns, totalCampaigns] = await Promise.all([
      Campaign.find(filter).sort(sortOptions).skip(skip).limit(limit).lean(),
      Campaign.countDocuments(filter)
    ]);

    const totalPages = Math.max(Math.ceil(totalCampaigns / limit), 1);

    return res.status(200).json({
      success: true,
      message: "Admin campaigns retrieved successfully",
      data: {
        campaigns,
        pagination: {
          page,
          limit,
          totalCampaigns,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/admin/campaigns/:campaignId
 * Retrieves detailed configuration for a specific campaign.
 */
export async function getCampaignById(req, res, next) {
  try {
    const { campaignId } = req.params;

    const campaign = await Campaign.findById(campaignId).lean();
    if (!campaign) {
      throw new AppError("Campaign not found", 404, [], "CAMPAIGN_NOT_FOUND");
    }

    return res.status(200).json({
      success: true,
      message: "Campaign retrieved successfully",
      data: { campaign },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/v1/admin/campaigns/:campaignId
 * Updates supported configuration fields of an existing campaign.
 */
export async function updateCampaign(req, res, next) {
  try {
    const { campaignId } = req.params;

    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      throw new AppError("Campaign not found", 404, [], "CAMPAIGN_NOT_FOUND");
    }

    // Coherence check if either date is updated
    const targetStartDate = req.body.startDate ? new Date(req.body.startDate) : campaign.startDate;
    const targetEndDate = req.body.endDate ? new Date(req.body.endDate) : campaign.endDate;

    if (targetEndDate.getTime() < targetStartDate.getTime()) {
      throw new AppError(
        "End date must be at or after start date",
        400,
        [{ field: "endDate", message: "End date must be at or after start date" }],
        "VALIDATION_ERROR"
      );
    }

    if (req.body.name !== undefined) campaign.name = req.body.name.trim();
    if (req.body.objective !== undefined) {
      campaign.objective = req.body.objective ? req.body.objective.trim() : "";
    }
    if (req.body.couponCode !== undefined) {
      campaign.couponCode = req.body.couponCode ? req.body.couponCode.trim().toUpperCase() : null;
    }
    if (req.body.startDate !== undefined) campaign.startDate = targetStartDate;
    if (req.body.endDate !== undefined) campaign.endDate = targetEndDate;
    if (req.body.status !== undefined) campaign.status = req.body.status;
    if (req.body.bannerPlacement !== undefined) campaign.bannerPlacement = req.body.bannerPlacement;

    await campaign.save();

    try {
      await recordAdminAuditEvent({
        eventType: "CAMPAIGN_UPDATED",
        resourceType: "campaign",
        resourceId: campaign._id.toString(),
        metadata: {
          action: "CAMPAIGN_UPDATED",
          name: campaign.name,
          status: campaign.status,
          startDate: campaign.startDate,
          endDate: campaign.endDate
        },
        req
      });
    } catch {
      // Non-blocking
    }

    return res.status(200).json({
      success: true,
      message: "Campaign updated successfully",
      data: { campaign },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/v1/admin/campaigns/:campaignId/status
 * Updates only the lifecycle status of a campaign.
 */
export async function updateCampaignStatus(req, res, next) {
  try {
    const { campaignId } = req.params;
    const { status } = req.body;

    const campaign = await Campaign.findByIdAndUpdate(
      campaignId,
      { $set: { status } },
      { new: true, runValidators: true }
    );

    if (!campaign) {
      throw new AppError("Campaign not found", 404, [], "CAMPAIGN_NOT_FOUND");
    }

    try {
      await recordAdminAuditEvent({
        eventType: "CAMPAIGN_STATUS_UPDATED",
        resourceType: "campaign",
        resourceId: campaign._id.toString(),
        metadata: {
          action: "CAMPAIGN_STATUS_UPDATED",
          status: campaign.status
        },
        req
      });
    } catch {
      // Non-blocking
    }

    return res.status(200).json({
      success: true,
      message: `Campaign status updated to '${status}' successfully`,
      data: { campaign },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/v1/admin/campaigns/:campaignId
 * Deletes a promotional campaign record.
 */
export async function deleteCampaign(req, res, next) {
  try {
    const { campaignId } = req.params;

    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      throw new AppError("Campaign not found", 404, [], "CAMPAIGN_NOT_FOUND");
    }

    await Campaign.findByIdAndDelete(campaignId);

    try {
      await recordAdminAuditEvent({
        eventType: "CAMPAIGN_DELETED",
        resourceType: "campaign",
        resourceId: campaignId,
        metadata: {
          action: "CAMPAIGN_DELETED",
          name: campaign.name
        },
        req
      });
    } catch {
      // Non-blocking
    }

    return res.status(200).json({
      success: true,
      message: `Campaign '${campaign.name}' deleted successfully`,
      data: { id: campaignId },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

export default {
  createCampaign,
  getAdminCampaigns,
  getCampaignById,
  updateCampaign,
  updateCampaignStatus,
  deleteCampaign
};
