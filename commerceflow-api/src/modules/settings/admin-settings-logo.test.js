import { describe, it, expect, vi, beforeEach } from "vitest";
import StoreSettings, { STORE_SETTINGS_SINGLETON_KEY } from "./store-settings.model.js";
import { uploadStoreLogo, resetStoreLogo } from "./admin-settings.controller.js";
import * as logoStorage from "./logo-storage.service.js";

describe("Admin Logo Management Controller Tests", () => {
  let req;
  let res;
  let next;

  const validPngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  beforeEach(() => {
    vi.restoreAllMocks();

    req = {
      params: {},
      query: {},
      body: {},
      user: { _id: "507f1f77bcf86cd799439011", role: "admin" },
      requestId: "req-logo-test-123"
    };

    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };

    next = vi.fn();
  });

  describe("uploadStoreLogo", () => {
    it("successfully validates, persists logo file, updates StoreSettings, and returns public logoUrl", async () => {
      req.body = {
        image: `data:image/png;base64,${validPngBase64}`,
        altText: "New Mountain Brand Logo"
      };

      vi.spyOn(StoreSettings, "findOne").mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          singletonKey: STORE_SETTINGS_SINGLETON_KEY,
          logoStorageKey: "old-logo-123.png"
        })
      });

      const mockSavedFile = {
        filename: "logo-new-456.png",
        fullPath: "/abs/path/uploads/branding/logo-new-456.png",
        relativeUrl: "/api/v1/settings/logo?v=1730000000"
      };
      vi.spyOn(logoStorage, "saveLogoFile").mockResolvedValue(mockSavedFile);
      const deleteSpy = vi.spyOn(logoStorage, "deleteLogoFileSafe").mockResolvedValue(true);

      const mockUpdatedDoc = {
        _id: "settings123",
        singletonKey: STORE_SETTINGS_SINGLETON_KEY,
        logoUrl: mockSavedFile.relativeUrl,
        logoAlt: "New Mountain Brand Logo",
        logoStorageKey: mockSavedFile.filename,
        logoMimeType: "image/png",
        logoFileSize: 70,
        logoUpdatedAt: new Date("2026-10-27T12:00:00Z")
      };

      vi.spyOn(StoreSettings, "findOneAndUpdate").mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockUpdatedDoc)
      });

      await uploadStoreLogo(req, res, next);

      expect(logoStorage.saveLogoFile).toHaveBeenCalled();
      expect(deleteSpy).toHaveBeenCalledWith("old-logo-123.png");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: "Website logo updated successfully",
          data: expect.objectContaining({
            logoUrl: mockSavedFile.relativeUrl,
            logoAlt: "New Mountain Brand Logo"
          })
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it("rejects invalid image payload and forwards error to error middleware without updating database", async () => {
      req.body = {
        image: "not-a-valid-base64-image!!!"
      };

      const updateSpy = vi.spyOn(StoreSettings, "findOneAndUpdate");

      await uploadStoreLogo(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          code: "MALFORMED_BASE64_DATA"
        })
      );
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it("rejects malicious SVG containing script tags and leaves existing logo intact", async () => {
      const maliciousSvg = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert('xss')</script></svg>`;
      const maliciousBase64 = Buffer.from(maliciousSvg, "utf8").toString("base64");

      req.body = {
        image: `data:image/svg+xml;base64,${maliciousBase64}`
      };

      const updateSpy = vi.spyOn(StoreSettings, "findOneAndUpdate");
      const saveSpy = vi.spyOn(logoStorage, "saveLogoFile");

      await uploadStoreLogo(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          code: "UNSAFE_SVG_CONTENT"
        })
      );
      expect(saveSpy).not.toHaveBeenCalled();
      expect(updateSpy).not.toHaveBeenCalled();
    });
  });

  describe("resetStoreLogo", () => {
    it("safely resets logo fields to null, deletes prior asset, and returns null logoUrl", async () => {
      vi.spyOn(StoreSettings, "findOne").mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          singletonKey: STORE_SETTINGS_SINGLETON_KEY,
          logoStorageKey: "logo-to-delete.png"
        })
      });

      const deleteSpy = vi.spyOn(logoStorage, "deleteLogoFileSafe").mockResolvedValue(true);

      const mockResetDoc = {
        _id: "settings123",
        singletonKey: STORE_SETTINGS_SINGLETON_KEY,
        logoUrl: null,
        logoAlt: "CommerceFlow Logo",
        logoStorageKey: null,
        logoMimeType: null,
        logoFileSize: null,
        logoUpdatedAt: new Date("2026-10-27T12:05:00Z")
      };

      vi.spyOn(StoreSettings, "findOneAndUpdate").mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockResetDoc)
      });

      await resetStoreLogo(req, res, next);

      expect(deleteSpy).toHaveBeenCalledWith("logo-to-delete.png");
      expect(StoreSettings.findOneAndUpdate).toHaveBeenCalledWith(
        { singletonKey: STORE_SETTINGS_SINGLETON_KEY },
        expect.objectContaining({
          $set: expect.objectContaining({
            logoUrl: null,
            logoAlt: "CommerceFlow Logo",
            logoStorageKey: null
          })
        }),
        expect.any(Object)
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: "Website logo reset to default successfully",
          data: expect.objectContaining({
            logoUrl: null,
            logoAlt: "CommerceFlow Logo",
            hasCustomLogo: false
          })
        })
      );
      expect(next).not.toHaveBeenCalled();
    });
  });
});
