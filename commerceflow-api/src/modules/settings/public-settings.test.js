import { describe, it, expect, vi, beforeEach } from "vitest";
import StoreSettings, { STORE_SETTINGS_SINGLETON_KEY } from "./store-settings.model.js";
import {
  getPublicBranding,
  getPublicAnnouncement,
  serveStoreLogo
} from "./public-settings.controller.js";
import * as logoStorage from "./logo-storage.service.js";

describe("Public Settings & Branding Controller Tests", () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    vi.restoreAllMocks();

    req = {
      params: {},
      query: {},
      body: {},
      requestId: "req-pub-test-456"
    };

    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn()
    };

    next = vi.fn();
  });

  describe("getPublicBranding", () => {
    it("returns default branding metadata when no custom logo is uploaded", async () => {
      vi.spyOn(StoreSettings, "findOne").mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          singletonKey: STORE_SETTINGS_SINGLETON_KEY,
          storeName: "CommerceFlow",
          logoUrl: null,
          logoAlt: "CommerceFlow Logo",
          announcementText: "🏕️ Free shipping on orders over $50"
        })
      });

      await getPublicBranding(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            storeName: "CommerceFlow",
            logoUrl: null,
            logoAlt: "CommerceFlow Logo",
            hasCustomLogo: false,
            announcementText: "🏕️ Free shipping on orders over $50",
            updatedAt: null
          })
        })
      );
    });

    it("returns active custom logo metadata without leaking internal storage keys or database secrets", async () => {
      const mockSettings = {
        _id: "507f1f77bcf86cd799439011",
        singletonKey: STORE_SETTINGS_SINGLETON_KEY,
        storeName: "CommerceFlow Flagship",
        logoUrl: "/api/v1/settings/logo?v=1730000000",
        logoAlt: "Flagship Custom Logo",
        logoStorageKey: "logo-secret-filename-12345.png",
        logoMimeType: "image/png",
        logoFileSize: 12040,
        logoUpdatedAt: new Date("2026-10-27T10:00:00Z")
      };

      vi.spyOn(StoreSettings, "findOne").mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockSettings)
      });

      await getPublicBranding(req, res, next);

      const jsonCall = res.json.mock.calls[0][0];
      expect(jsonCall.data.logoUrl).toBe("/api/v1/settings/logo?v=1730000000");
      expect(jsonCall.data.hasCustomLogo).toBe(true);
      expect(jsonCall.data.logoStorageKey).toBeUndefined();
      expect(jsonCall.data._id).toBeUndefined();
      expect(jsonCall.data.singletonKey).toBeUndefined();
    });
  });

  describe("serveStoreLogo", () => {
    it("returns 404 when no custom logo is configured", async () => {
      vi.spyOn(StoreSettings, "findOne").mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          singletonKey: STORE_SETTINGS_SINGLETON_KEY,
          logoStorageKey: null
        })
      });

      await serveStoreLogo(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith("Cross-Origin-Resource-Policy", "cross-origin");
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: "NO_CUSTOM_LOGO"
          })
        })
      );
    });

    it("returns 404 when logoStorageKey points to a missing file", async () => {
      vi.spyOn(StoreSettings, "findOne").mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          singletonKey: STORE_SETTINGS_SINGLETON_KEY,
          logoStorageKey: "missing-file.png"
        })
      });

      vi.spyOn(logoStorage, "getLogoFilePathSafe").mockReturnValue(null);

      await serveStoreLogo(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: "LOGO_FILE_NOT_FOUND"
          })
        })
      );
    });
  });

  describe("getPublicAnnouncement", () => {
    it("returns default announcement when none has been configured", async () => {
      vi.spyOn(StoreSettings, "findOne").mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          singletonKey: STORE_SETTINGS_SINGLETON_KEY,
          announcementText: null
        })
      });

      await getPublicAnnouncement(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Public storefront announcement retrieved successfully",
        data: {
          announcementText: "🏕️ Free shipping on orders over $50"
        },
        requestId: "req-pub-test-456"
      });
    });

    it("returns configured announcement message", async () => {
      vi.spyOn(StoreSettings, "findOne").mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          singletonKey: STORE_SETTINGS_SINGLETON_KEY,
          announcementText: "⚡ Flash Sale: 20% off all tents this weekend!"
        })
      });

      await getPublicAnnouncement(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Public storefront announcement retrieved successfully",
        data: {
          announcementText: "⚡ Flash Sale: 20% off all tents this weekend!"
        },
        requestId: "req-pub-test-456"
      });
    });
  });
});
