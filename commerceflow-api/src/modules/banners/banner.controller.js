import fs from "node:fs";
import Banner from "./banner.model.js";
import AppError from "../../common/errors/app-error.js";
import { logger } from "../../config/logger.js";
import {
  parseBannerImagePayload,
  validateBannerImageBuffer,
  saveBannerImageFile,
  deleteBannerFileSafe,
  getBannerFilePathSafe
} from "./banner-storage.service.js";

function escapeRegex(text) {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

/**
 * Public projection: only return public attributes needed for storefront rendering.
 * Never expose internal audit fields (createdBy, updatedBy) or storage keys.
 */
const PUBLIC_BANNER_FIELDS = [
  "title",
  "heading",
  "subtitle",
  "buttonLabel",
  "placement",
  "imageUrl",
  "desktopImage",
  "mobileImageUrl",
  "mobileImage",
  "altText",
  "targetUrl",
  "destination",
  "destinationType",
  "displayOrder",
  "position",
  "startsAt",
  "endsAt",
  "expiresAt"
].join(" ");

/**
 * GET /api/v1/banners and GET /api/v1/banners/active
 * Public endpoint retrieving active, published banners within schedule window.
 */
export async function getPublicBanners(req, res, next) {
  try {
    const { placement = "hero_carousel", limit = 10 } = req.query;
    const now = new Date();

    const query = {
      placement,
      status: { $in: ["published", "active"] },
      $and: [
        {
          $or: [{ startsAt: null }, { startsAt: { $lte: now } }]
        },
        {
          $or: [
            { expiresAt: null, endsAt: null },
            { expiresAt: { $gte: now } },
            { endsAt: { $gte: now } }
          ]
        }
      ]
    };

    const banners = await Banner.find(query)
      .sort({ displayOrder: 1, position: 1, createdAt: -1 })
      .limit(Number(limit))
      .select(PUBLIC_BANNER_FIELDS)
      .lean();

    return res.status(200).json({
      success: true,
      message: "Public banners retrieved successfully",
      data: {
        banners
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/banners/images/:filename
 * Public endpoint serving uploaded banner imagery.
 */
export async function serveBannerImage(req, res, next) {
  try {
    const { filename } = req.params;
    const filePath = getBannerFilePathSafe(filename);

    if (!filePath) {
      return res.status(404).json({
        success: false,
        error: {
          code: "BANNER_IMAGE_NOT_FOUND",
          message: "The requested banner image could not be found."
        },
        requestId: req.requestId
      });
    }

    const ext = filename.split(".").pop().toLowerCase();
    const mimeMap = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      webp: "image/webp"
    };
    const mimeType = mimeMap[ext] || "application/octet-stream";

    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'");

    const stream = fs.createReadStream(filePath);
    stream.on("error", (err) => next(err));
    return stream.pipe(res);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/admin/banners
 * Admin listing with pagination, placement/status filters, and search.
 */
export async function getAdminBanners(req, res, next) {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const { search, placement = "all", status = "all", sortBy = "displayOrder", sortOrder = "asc" } = req.query;

    const filter = {};

    if (placement !== "all") {
      filter.placement = placement;
    }

    if (status !== "all") {
      filter.status = status;
    }

    if (search && search.trim()) {
      const sanitized = escapeRegex(search.trim());
      filter.$or = [
        { title: { $regex: sanitized, $options: "i" } },
        { heading: { $regex: sanitized, $options: "i" } },
        { subtitle: { $regex: sanitized, $options: "i" } },
        { altText: { $regex: sanitized, $options: "i" } },
        { targetUrl: { $regex: sanitized, $options: "i" } },
        { destination: { $regex: sanitized, $options: "i" } }
      ];
    }

    const sortDirection = sortOrder === "desc" ? -1 : 1;
    const sortField = sortBy === "position" ? "position" : sortBy;
    const sortOptions = { [sortField]: sortDirection, _id: sortDirection };
    const skip = (page - 1) * limit;

    let queryChain = Banner.find(filter).sort(sortOptions).skip(skip).limit(limit);

    if (typeof queryChain.populate === "function") {
      queryChain = queryChain.populate("createdBy", "name email");
      if (typeof queryChain.populate === "function") {
        queryChain = queryChain.populate("updatedBy", "name email");
      }
    }

    const [banners, totalBanners] = await Promise.all([
      queryChain.lean(),
      Banner.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(totalBanners / limit) || 1;

    return res.status(200).json({
      success: true,
      message: "Admin banners retrieved successfully",
      data: {
        banners,
        pagination: {
          page,
          limit,
          totalBanners,
          totalPages
        }
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/admin/banners/:id
 */
export async function getBannerById(req, res, next) {
  try {
    const { id } = req.params;
    let queryChain = Banner.findById(id);

    if (typeof queryChain.populate === "function") {
      queryChain = queryChain.populate("createdBy", "name email");
      if (typeof queryChain.populate === "function") {
        queryChain = queryChain.populate("updatedBy", "name email");
      }
    }

    const banner = await queryChain.lean();

    if (!banner) {
      throw new AppError("Banner not found", 404, [], "BANNER_NOT_FOUND");
    }

    return res.status(200).json({
      success: true,
      message: "Banner retrieved successfully",
      data: { banner },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/admin/banners
 */
export async function createBanner(req, res, next) {
  try {
    const bannerData = {
      ...req.body,
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null
    };

    // If desktop image payload is base64, parse, validate buffer, and save to storage
    if (bannerData.desktopImage && (bannerData.desktopImage.startsWith("data:") || bannerData.desktopImage.length > 1000)) {
      const { buffer } = parseBannerImagePayload(bannerData.desktopImage);
      const { extension } = validateBannerImageBuffer(buffer);
      const { filename, relativeUrl } = await saveBannerImageFile(buffer, extension, "desktop");
      bannerData.imageUrl = relativeUrl;
      bannerData.desktopImage = relativeUrl;
      bannerData.desktopImageStorageKey = filename;
    } else if (bannerData.imageUrl && (bannerData.imageUrl.startsWith("data:") || bannerData.imageUrl.length > 1000)) {
      const { buffer } = parseBannerImagePayload(bannerData.imageUrl);
      const { extension } = validateBannerImageBuffer(buffer);
      const { filename, relativeUrl } = await saveBannerImageFile(buffer, extension, "desktop");
      bannerData.imageUrl = relativeUrl;
      bannerData.desktopImage = relativeUrl;
      bannerData.desktopImageStorageKey = filename;
    } else {
      if (bannerData.desktopImage && !bannerData.imageUrl) {
        bannerData.imageUrl = bannerData.desktopImage;
      } else if (bannerData.imageUrl && !bannerData.desktopImage) {
        bannerData.desktopImage = bannerData.imageUrl;
      }
    }

    // If mobile image payload is base64, parse, validate buffer, and save to storage
    if (bannerData.mobileImage && (bannerData.mobileImage.startsWith("data:") || bannerData.mobileImage.length > 1000)) {
      const { buffer } = parseBannerImagePayload(bannerData.mobileImage);
      const { extension } = validateBannerImageBuffer(buffer);
      const { filename, relativeUrl } = await saveBannerImageFile(buffer, extension, "mobile");
      bannerData.mobileImageUrl = relativeUrl;
      bannerData.mobileImage = relativeUrl;
      bannerData.mobileImageStorageKey = filename;
    } else if (bannerData.mobileImageUrl && (bannerData.mobileImageUrl.startsWith("data:") || bannerData.mobileImageUrl.length > 1000)) {
      const { buffer } = parseBannerImagePayload(bannerData.mobileImageUrl);
      const { extension } = validateBannerImageBuffer(buffer);
      const { filename, relativeUrl } = await saveBannerImageFile(buffer, extension, "mobile");
      bannerData.mobileImageUrl = relativeUrl;
      bannerData.mobileImage = relativeUrl;
      bannerData.mobileImageStorageKey = filename;
    } else {
      if (bannerData.mobileImage && !bannerData.mobileImageUrl) {
        bannerData.mobileImageUrl = bannerData.mobileImage;
      } else if (bannerData.mobileImageUrl && !bannerData.mobileImage) {
        bannerData.mobileImage = bannerData.mobileImageUrl;
      }
    }

    if (bannerData.destination && !bannerData.targetUrl) {
      bannerData.targetUrl = bannerData.destination;
    } else if (bannerData.targetUrl && !bannerData.destination) {
      bannerData.destination = bannerData.targetUrl;
    }

    if (bannerData.position !== undefined && bannerData.displayOrder === undefined) {
      bannerData.displayOrder = bannerData.position;
    } else if (bannerData.displayOrder !== undefined && bannerData.position === undefined) {
      bannerData.position = bannerData.displayOrder;
    }

    if (bannerData.endsAt && !bannerData.expiresAt) {
      bannerData.expiresAt = bannerData.endsAt;
    } else if (bannerData.expiresAt && !bannerData.endsAt) {
      bannerData.endsAt = bannerData.expiresAt;
    }

    const banner = await Banner.create(bannerData);

    logger.info({
      msg: "Admin created banner",
      bannerId: banner._id,
      title: banner.title,
      placement: banner.placement,
      adminId: req.user?._id
    });

    return res.status(201).json({
      success: true,
      message: "Banner created successfully",
      data: { banner },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/v1/admin/banners/:id
 */
export async function updateBanner(req, res, next) {
  try {
    const { id } = req.params;
    const existingBanner = await Banner.findById(id);

    if (!existingBanner) {
      throw new AppError("Banner not found", 404, [], "BANNER_NOT_FOUND");
    }

    const updateData = {
      ...req.body,
      updatedBy: req.user?._id || null
    };

    // If updating desktop image with base64 payload
    if (updateData.desktopImage && (updateData.desktopImage.startsWith("data:") || updateData.desktopImage.length > 1000)) {
      const { buffer } = parseBannerImagePayload(updateData.desktopImage);
      const { extension } = validateBannerImageBuffer(buffer);
      const { filename, relativeUrl } = await saveBannerImageFile(buffer, extension, "desktop");
      const previousKey = existingBanner.desktopImageStorageKey;
      updateData.imageUrl = relativeUrl;
      updateData.desktopImage = relativeUrl;
      updateData.desktopImageStorageKey = filename;
      if (previousKey && previousKey !== filename) {
        await deleteBannerFileSafe(previousKey);
      }
    } else if (updateData.imageUrl && (updateData.imageUrl.startsWith("data:") || updateData.imageUrl.length > 1000)) {
      const { buffer } = parseBannerImagePayload(updateData.imageUrl);
      const { extension } = validateBannerImageBuffer(buffer);
      const { filename, relativeUrl } = await saveBannerImageFile(buffer, extension, "desktop");
      const previousKey = existingBanner.desktopImageStorageKey;
      updateData.imageUrl = relativeUrl;
      updateData.desktopImage = relativeUrl;
      updateData.desktopImageStorageKey = filename;
      if (previousKey && previousKey !== filename) {
        await deleteBannerFileSafe(previousKey);
      }
    } else {
      if (updateData.desktopImage && !updateData.imageUrl) {
        updateData.imageUrl = updateData.desktopImage;
      } else if (updateData.imageUrl && !updateData.desktopImage) {
        updateData.desktopImage = updateData.imageUrl;
      }
    }

    // If updating mobile image with base64 payload
    if (updateData.mobileImage && (updateData.mobileImage.startsWith("data:") || updateData.mobileImage.length > 1000)) {
      const { buffer } = parseBannerImagePayload(updateData.mobileImage);
      const { extension } = validateBannerImageBuffer(buffer);
      const { filename, relativeUrl } = await saveBannerImageFile(buffer, extension, "mobile");
      const previousKey = existingBanner.mobileImageStorageKey;
      updateData.mobileImageUrl = relativeUrl;
      updateData.mobileImage = relativeUrl;
      updateData.mobileImageStorageKey = filename;
      if (previousKey && previousKey !== filename) {
        await deleteBannerFileSafe(previousKey);
      }
    } else if (updateData.mobileImageUrl && (updateData.mobileImageUrl.startsWith("data:") || updateData.mobileImageUrl.length > 1000)) {
      const { buffer } = parseBannerImagePayload(updateData.mobileImageUrl);
      const { extension } = validateBannerImageBuffer(buffer);
      const { filename, relativeUrl } = await saveBannerImageFile(buffer, extension, "mobile");
      const previousKey = existingBanner.mobileImageStorageKey;
      updateData.mobileImageUrl = relativeUrl;
      updateData.mobileImage = relativeUrl;
      updateData.mobileImageStorageKey = filename;
      if (previousKey && previousKey !== filename) {
        await deleteBannerFileSafe(previousKey);
      }
    } else {
      if (updateData.mobileImage && !updateData.mobileImageUrl) {
        updateData.mobileImageUrl = updateData.mobileImage;
      } else if (updateData.mobileImageUrl && !updateData.mobileImage) {
        updateData.mobileImage = updateData.mobileImageUrl;
      }
    }

    if (updateData.destination && !updateData.targetUrl) {
      updateData.targetUrl = updateData.destination;
    } else if (updateData.targetUrl && !updateData.destination) {
      updateData.destination = updateData.targetUrl;
    }

    if (updateData.position !== undefined && updateData.displayOrder === undefined) {
      updateData.displayOrder = updateData.position;
    } else if (updateData.displayOrder !== undefined && updateData.position === undefined) {
      updateData.position = updateData.displayOrder;
    }

    if (updateData.endsAt && !updateData.expiresAt) {
      updateData.expiresAt = updateData.endsAt;
    } else if (updateData.expiresAt && !updateData.endsAt) {
      updateData.endsAt = updateData.expiresAt;
    }

    const banner = await Banner.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    logger.info({
      msg: "Admin updated banner",
      bannerId: banner._id,
      adminId: req.user?._id
    });

    return res.status(200).json({
      success: true,
      message: "Banner updated successfully",
      data: { banner },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/admin/banners/:id/desktop-image
 */
export async function uploadDesktopImage(req, res, next) {
  try {
    const { id } = req.params;
    const banner = await Banner.findById(id);

    if (!banner) {
      throw new AppError("Banner not found", 404, [], "BANNER_NOT_FOUND");
    }

    const { buffer } = parseBannerImagePayload(req.body.image);
    const { extension } = validateBannerImageBuffer(buffer);
    const { filename, relativeUrl } = await saveBannerImageFile(buffer, extension, "desktop");

    const previousStorageKey = banner.desktopImageStorageKey;

    banner.imageUrl = relativeUrl;
    banner.desktopImage = relativeUrl;
    banner.desktopImageStorageKey = filename;
    banner.updatedBy = req.user?._id || null;
    await banner.save();

    if (previousStorageKey && previousStorageKey !== filename) {
      await deleteBannerFileSafe(previousStorageKey);
    }

    logger.info({
      msg: "Admin uploaded desktop banner image",
      bannerId: id,
      filename,
      adminId: req.user?._id
    });

    return res.status(200).json({
      success: true,
      message: "Desktop banner image uploaded successfully",
      data: {
        bannerId: id,
        imageUrl: relativeUrl,
        desktopImage: relativeUrl
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/admin/banners/:id/mobile-image
 */
export async function uploadMobileImage(req, res, next) {
  try {
    const { id } = req.params;
    const banner = await Banner.findById(id);

    if (!banner) {
      throw new AppError("Banner not found", 404, [], "BANNER_NOT_FOUND");
    }

    const { buffer } = parseBannerImagePayload(req.body.image);
    const { extension } = validateBannerImageBuffer(buffer);
    const { filename, relativeUrl } = await saveBannerImageFile(buffer, extension, "mobile");

    const previousStorageKey = banner.mobileImageStorageKey;

    banner.mobileImageUrl = relativeUrl;
    banner.mobileImage = relativeUrl;
    banner.mobileImageStorageKey = filename;
    banner.updatedBy = req.user?._id || null;
    await banner.save();

    if (previousStorageKey && previousStorageKey !== filename) {
      await deleteBannerFileSafe(previousStorageKey);
    }

    logger.info({
      msg: "Admin uploaded mobile banner image",
      bannerId: id,
      filename,
      adminId: req.user?._id
    });

    return res.status(200).json({
      success: true,
      message: "Mobile banner image uploaded successfully",
      data: {
        bannerId: id,
        mobileImageUrl: relativeUrl,
        mobileImage: relativeUrl
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/v1/admin/banners/:id/status
 */
export async function updateBannerStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const banner = await Banner.findByIdAndUpdate(
      id,
      { $set: { status, updatedBy: req.user?._id || null } },
      { new: true, runValidators: true }
    );

    if (!banner) {
      throw new AppError("Banner not found", 404, [], "BANNER_NOT_FOUND");
    }

    logger.info({
      msg: "Admin updated banner status",
      bannerId: banner._id,
      newStatus: status,
      adminId: req.user?._id
    });

    return res.status(200).json({
      success: true,
      message: `Banner status updated to ${status}`,
      data: { banner },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/v1/admin/banners/reorder
 * Atomically updates position and displayOrder for multiple banners.
 */
export async function reorderBanners(req, res, next) {
  try {
    const { banners: orderItems } = req.body;

    const ids = orderItems.map((item) => item.id);
    const uniqueIds = new Set(ids);
    if (uniqueIds.size !== ids.length) {
      throw new AppError("Duplicate banner IDs in reorder payload", 400, [], "DUPLICATE_REORDER_IDS");
    }

    const count = await Banner.countDocuments({ _id: { $in: ids } });
    if (count !== ids.length) {
      throw new AppError("One or more banner IDs were not found", 404, [], "BANNER_NOT_FOUND");
    }

    const bulkOps = orderItems.map((item) => ({
      updateOne: {
        filter: { _id: item.id },
        update: {
          $set: {
            position: item.position,
            displayOrder: item.position,
            updatedBy: req.user?._id || null
          }
        }
      }
    }));

    await Banner.bulkWrite(bulkOps);

    logger.info({
      msg: "Admin reordered banners",
      count: orderItems.length,
      adminId: req.user?._id
    });

    return res.status(200).json({
      success: true,
      message: "Banners reordered successfully",
      data: { reorderedCount: orderItems.length },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/v1/admin/banners/:id
 */
export async function deleteBanner(req, res, next) {
  try {
    const { id } = req.params;

    const banner = await Banner.findByIdAndDelete(id);

    if (!banner) {
      throw new AppError("Banner not found", 404, [], "BANNER_NOT_FOUND");
    }

    if (banner.desktopImageStorageKey) {
      await deleteBannerFileSafe(banner.desktopImageStorageKey);
    }
    if (banner.mobileImageStorageKey) {
      await deleteBannerFileSafe(banner.mobileImageStorageKey);
    }

    logger.info({
      msg: "Admin deleted banner",
      bannerId: id,
      adminId: req.user?._id
    });

    return res.status(200).json({
      success: true,
      message: "Banner deleted successfully",
      data: { bannerId: id },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}
