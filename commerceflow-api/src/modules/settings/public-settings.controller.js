import fs from "node:fs";
import StoreSettings, { STORE_SETTINGS_SINGLETON_KEY } from "./store-settings.model.js";
import { getLogoFilePathSafe } from "./logo-storage.service.js";

/**
 * GET /api/v1/settings/branding
 * Public storefront endpoint providing safe, non-sensitive site branding metadata.
 * Never leaks internal storage keys, database IDs, or filesystem paths.
 */
export async function getPublicBranding(req, res, next) {
  try {
    const settings = await StoreSettings.findOne({
      singletonKey: STORE_SETTINGS_SINGLETON_KEY
    }).lean();

    return res.status(200).json({
      success: true,
      message: "Public store branding retrieved successfully",
      data: {
        storeName: settings?.storeName || "CommerceFlow",
        logoUrl: settings?.logoUrl || null,
        logoAlt: settings?.logoAlt || "CommerceFlow Logo",
        hasCustomLogo: Boolean(settings?.logoUrl),
        announcementText: settings?.announcementText?.trim() || "🏕️ Free shipping on orders over $50",
        codEnabled: settings?.codEnabled !== false,
        upiEnabled: settings?.upiEnabled !== false,
        updatedAt: settings?.logoUpdatedAt || settings?.updatedAt || null
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/settings/announcement
 * Public endpoint exposing only the storefront announcement text.
 * Falls back to default message if none is configured.
 */
export async function getPublicAnnouncement(req, res, next) {
  try {
    const settings = await StoreSettings.findOne({
      singletonKey: STORE_SETTINGS_SINGLETON_KEY
    }).lean();

    return res.status(200).json({
      success: true,
      message: "Public storefront announcement retrieved successfully",
      data: {
        announcementText: settings?.announcementText?.trim() || "🏕️ Free shipping on orders over $50"
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/settings/logo
 * Public endpoint serving the active custom website logo asset.
 * Emits strict security and caching headers to prevent MIME sniffing, script execution,
 * and unnecessary repeated downloads.
 */
export async function serveStoreLogo(req, res, next) {
  try {
    // Explicitly allow cross-origin resource access for public logo images
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

    const settings = await StoreSettings.findOne({
      singletonKey: STORE_SETTINGS_SINGLETON_KEY
    }).lean();

    if (!settings || !settings.logoStorageKey) {
      return res.status(404).json({
        success: false,
        error: {
          code: "NO_CUSTOM_LOGO",
          message: "No custom logo configured. Default brand mark should be displayed."
        },
        requestId: req.requestId
      });
    }

    const filePath = getLogoFilePathSafe(settings.logoStorageKey);

    if (!filePath) {
      return res.status(404).json({
        success: false,
        error: {
          code: "LOGO_FILE_NOT_FOUND",
          message: "The requested logo asset could not be found."
        },
        requestId: req.requestId
      });
    }

    const mimeType = settings.logoMimeType || "image/png";

    // Security and caching headers
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'");

    const stream = fs.createReadStream(filePath);
    stream.on("error", (err) => {
      next(err);
    });
    return stream.pipe(res);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/settings/payment-methods
 * Public storefront endpoint providing safe, non-sensitive payment method availability.
 * Never exposes credentials, secrets, or internal merchant details.
 */
export async function getPublicPaymentMethods(req, res, next) {
  try {
    const settings = await StoreSettings.findOne({
      singletonKey: STORE_SETTINGS_SINGLETON_KEY
    }).lean();

    return res.status(200).json({
      success: true,
      message: "Public payment methods retrieved successfully",
      data: {
        cod: {
          enabled: settings?.codEnabled !== false,
          name: "Cash on Delivery"
        },
        upi: {
          enabled: settings?.upiEnabled !== false,
          name: "UPI"
        },
        card: {
          enabled: true,
          name: "Credit / Debit Card"
        },
        netbanking: {
          enabled: true,
          name: "Net Banking"
        },
        wallet: {
          enabled: true,
          name: "Wallets"
        }
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}
