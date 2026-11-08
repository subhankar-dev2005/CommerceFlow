import StoreSettings, { STORE_SETTINGS_SINGLETON_KEY } from "./store-settings.model.js";
import { env } from "../../config/env.js";
import { getMongoDBStatus } from "../../database/mongodb.js";
import { recordAdminAuditEvent, AUDIT_EVENT_TYPES } from "../audit/admin-audit.service.js";
import { parseImagePayload, validateLogoBuffer } from "./logo-validator.js";
import { saveLogoFile, deleteLogoFileSafe } from "./logo-storage.service.js";

/**
 * Returns safe system diagnostics without ever exposing secrets, credentials, or keys.
 */
function getSafeSystemDiagnostics() {
  const dbStatus = getMongoDBStatus();
  return {
    environment: env.NODE_ENV || "development",
    apiVersion: "v1",
    databaseStatus: dbStatus?.status || "connected",
    paymentGateway: env.RAZORPAY_KEY_ID ? "Razorpay (Configured)" : "Razorpay (Not Configured)",
    rateLimitRequestsPerWindow: 100,
    rateLimitWindowMinutes: 15
  };
}

/**
 * GET /api/v1/admin/settings
 * Retrieves authoritative store configuration and safe operational diagnostics.
 * Uses atomic upsert with singleton key to prevent race conditions during cold-boot initialization.
 */
export async function getStoreSettings(req, res, next) {
  try {
    const settings = await StoreSettings.findOneAndUpdate(
      { singletonKey: STORE_SETTINGS_SINGLETON_KEY },
      { $setOnInsert: { singletonKey: STORE_SETTINGS_SINGLETON_KEY } },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
        runValidators: true
      }
    ).lean();

    const systemInfo = getSafeSystemDiagnostics();

    return res.status(200).json({
      success: true,
      message: "Store settings retrieved successfully",
      data: {
        settings,
        systemInfo
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/v1/admin/settings
 * Updates and persists store settings with server-side validation and audit logging.
 */
export async function updateStoreSettings(req, res, next) {
  try {
    const updateData = { ...req.body };
    delete updateData.singletonKey;

    const updated = await StoreSettings.findOneAndUpdate(
      { singletonKey: STORE_SETTINGS_SINGLETON_KEY },
      {
        $set: updateData,
        $setOnInsert: { singletonKey: STORE_SETTINGS_SINGLETON_KEY }
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
        runValidators: true
      }
    ).lean();

    // Audit logging
    try {
      await recordAdminAuditEvent({
        eventType: AUDIT_EVENT_TYPES.ADMIN_USER_ROLE_UPDATED || "STORE_SETTINGS_UPDATED",
        resourceType: "store_settings",
        resourceId: updated._id ? updated._id.toString() : "store-settings",
        metadata: {
          action: "STORE_SETTINGS_UPDATED",
          updatedFields: Object.keys(updateData)
        },
        req
      });
    } catch {
      // Non-blocking
    }

    const systemInfo = getSafeSystemDiagnostics();

    return res.status(200).json({
      success: true,
      message: "Store settings updated successfully",
      data: {
        settings: updated,
        systemInfo
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/admin/settings/logo
 * Uploads, validates, and persists a custom website logo.
 * Enforces magic-byte file inspection, 2MB size limit, script injection prevention,
 * and safe path containment.
 */
export async function uploadStoreLogo(req, res, next) {
  try {
    const rawImage = req.body?.image;
    const altText = req.body?.altText;

    // 1. Parse and decode payload
    const { buffer } = parseImagePayload(rawImage);

    // 2. Deep content validation (magic bytes, size <= 2MB, safe SVG/PNG/JPEG/WebP)
    const { mimeType, extension, size } = validateLogoBuffer(buffer);

    // 3. Persist file safely to disk
    const { filename, relativeUrl } = await saveLogoFile(buffer, extension);

    // 4. Retrieve current settings to handle prior asset cleanup
    const currentSettings = await StoreSettings.findOne({
      singletonKey: STORE_SETTINGS_SINGLETON_KEY
    }).lean();

    const previousKey = currentSettings?.logoStorageKey;

    // 5. Atomically update StoreSettings document
    const updated = await StoreSettings.findOneAndUpdate(
      { singletonKey: STORE_SETTINGS_SINGLETON_KEY },
      {
        $set: {
          logoUrl: relativeUrl,
          logoAlt: (altText && typeof altText === "string" ? altText.trim() : null) || "CommerceFlow Logo",
          logoStorageKey: filename,
          logoMimeType: mimeType,
          logoFileSize: size,
          logoUpdatedAt: new Date()
        },
        $setOnInsert: { singletonKey: STORE_SETTINGS_SINGLETON_KEY }
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
        runValidators: true
      }
    ).lean();

    // 6. Safely remove obsolete previous asset if different from new file
    if (previousKey && previousKey !== filename) {
      await deleteLogoFileSafe(previousKey);
    }

    // 7. Audit log
    try {
      await recordAdminAuditEvent({
        eventType: AUDIT_EVENT_TYPES.STORE_SETTINGS_LOGO_UPDATED || "STORE_SETTINGS_LOGO_UPDATED",
        resourceType: "store_branding",
        resourceId: updated._id ? updated._id.toString() : "store-branding",
        metadata: {
          action: "LOGO_UPDATED",
          filename,
          mimeType,
          fileSize: size
        },
        req
      });
    } catch {
      // Non-blocking
    }

    return res.status(200).json({
      success: true,
      message: "Website logo updated successfully",
      data: {
        logoUrl: updated.logoUrl,
        logoAlt: updated.logoAlt,
        updatedAt: updated.logoUpdatedAt
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/admin/settings/logo/reset
 * Resets the website logo back to the original default CommerceFlow logo.
 * Safely unlinks obsolete custom file assets without mutating unrelated store settings.
 */
export async function resetStoreLogo(req, res, next) {
  try {
    const currentSettings = await StoreSettings.findOne({
      singletonKey: STORE_SETTINGS_SINGLETON_KEY
    }).lean();

    const previousKey = currentSettings?.logoStorageKey;

    const updated = await StoreSettings.findOneAndUpdate(
      { singletonKey: STORE_SETTINGS_SINGLETON_KEY },
      {
        $set: {
          logoUrl: null,
          logoAlt: "CommerceFlow Logo",
          logoStorageKey: null,
          logoMimeType: null,
          logoFileSize: null,
          logoUpdatedAt: new Date()
        },
        $setOnInsert: { singletonKey: STORE_SETTINGS_SINGLETON_KEY }
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
        runValidators: true
      }
    ).lean();

    // Safely remove obsolete custom asset
    if (previousKey) {
      await deleteLogoFileSafe(previousKey);
    }

    // Audit log
    try {
      await recordAdminAuditEvent({
        eventType: AUDIT_EVENT_TYPES.STORE_SETTINGS_LOGO_RESET || "STORE_SETTINGS_LOGO_RESET",
        resourceType: "store_branding",
        resourceId: updated._id ? updated._id.toString() : "store-branding",
        metadata: {
          action: "LOGO_RESET_TO_DEFAULT",
          previousStorageKey: previousKey || null
        },
        req
      });
    } catch {
      // Non-blocking
    }

    return res.status(200).json({
      success: true,
      message: "Website logo reset to default successfully",
      data: {
        logoUrl: null,
        logoAlt: "CommerceFlow Logo",
        hasCustomLogo: false,
        updatedAt: updated.logoUpdatedAt
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/admin/settings/announcement/reset
 * Resets the storefront announcement text back to the default message.
 */
export async function resetAnnouncement(req, res, next) {
  try {
    const defaultAnnouncement = "🏕️ Free shipping on orders over $50";
    const updated = await StoreSettings.findOneAndUpdate(
      { singletonKey: STORE_SETTINGS_SINGLETON_KEY },
      {
        $set: { announcementText: defaultAnnouncement },
        $setOnInsert: { singletonKey: STORE_SETTINGS_SINGLETON_KEY }
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
        runValidators: true
      }
    ).lean();

    try {
      await recordAdminAuditEvent({
        eventType: AUDIT_EVENT_TYPES.STORE_SETTINGS_UPDATED || "STORE_SETTINGS_UPDATED",
        resourceType: "store_settings",
        resourceId: updated._id ? updated._id.toString() : "store-settings",
        metadata: {
          action: "ANNOUNCEMENT_RESET_TO_DEFAULT",
          announcementText: defaultAnnouncement
        },
        req
      });
    } catch {
      // Non-blocking
    }

    return res.status(200).json({
      success: true,
      message: "Storefront announcement reset to default successfully",
      data: {
        announcementText: defaultAnnouncement,
        settings: updated
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}
