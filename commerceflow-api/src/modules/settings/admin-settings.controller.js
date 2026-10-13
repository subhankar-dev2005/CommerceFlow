import StoreSettings, { STORE_SETTINGS_SINGLETON_KEY } from "./store-settings.model.js";
import { env } from "../../config/env.js";
import { getMongoDBStatus } from "../../database/mongodb.js";
import { recordAdminAuditEvent, AUDIT_EVENT_TYPES } from "../audit/admin-audit.service.js";

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
