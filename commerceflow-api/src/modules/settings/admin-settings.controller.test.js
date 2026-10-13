import { describe, it, expect, vi, beforeEach } from "vitest";
import StoreSettings from "./store-settings.model.js";
import {
  getStoreSettings,
  updateStoreSettings
} from "./admin-settings.controller.js";

describe("Admin Settings Controller Unit Tests", () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    vi.restoreAllMocks();

    req = {
      params: {},
      query: {},
      body: {},
      user: { _id: "507f1f77bcf86cd799439011", role: "admin" },
      requestId: "req-settings-test-123"
    };

    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };

    next = vi.fn();
  });

  describe("getStoreSettings", () => {
    it("returns existing settings and safe system diagnostics without secrets using atomic upsert", async () => {
      const mockSettings = {
        _id: "settings123",
        singletonKey: "default_store_settings",
        storeName: "CommerceFlow",
        supportEmail: "support@commerceflow.com",
        currency: "INR",
        freeShippingThreshold: 999,
        isMaintenanceMode: false
      };

      const findOneAndUpdateSpy = vi.spyOn(StoreSettings, "findOneAndUpdate").mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockSettings)
      });

      await getStoreSettings(req, res, next);

      expect(findOneAndUpdateSpy).toHaveBeenCalledWith(
        { singletonKey: "default_store_settings" },
        { $setOnInsert: { singletonKey: "default_store_settings" } },
        {
          new: true,
          upsert: true,
          setDefaultsOnInsert: true,
          runValidators: true
        }
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            settings: mockSettings,
            systemInfo: expect.objectContaining({
              environment: expect.any(String),
              apiVersion: "v1"
            })
          })
        })
      );

      // Verify no secrets or sensitive keys leaked in systemInfo
      const jsonCall = res.json.mock.calls[0][0];
      const { systemInfo } = jsonCall.data;
      expect(systemInfo.JWT_SECRET).toBeUndefined();
      expect(systemInfo.RAZORPAY_KEY_SECRET).toBeUndefined();
      expect(systemInfo.MONGODB_URI).toBeUndefined();
    });

    it("initializes settings atomically without race conditions on first access", async () => {
      const defaultSettings = {
        _id: "newSettings123",
        singletonKey: "default_store_settings",
        storeName: "CommerceFlow",
        supportEmail: "support@commerceflow.com",
        currency: "INR",
        isMaintenanceMode: false
      };

      vi.spyOn(StoreSettings, "findOneAndUpdate").mockReturnValue({
        lean: vi.fn().mockResolvedValue(defaultSettings)
      });

      await getStoreSettings(req, res, next);

      expect(StoreSettings.findOneAndUpdate).toHaveBeenCalledWith(
        { singletonKey: "default_store_settings" },
        { $setOnInsert: { singletonKey: "default_store_settings" } },
        expect.objectContaining({
          upsert: true,
          setDefaultsOnInsert: true
        })
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            settings: defaultSettings
          })
        })
      );
    });
  });

  describe("updateStoreSettings", () => {
    it("updates and returns persisted settings targeted by singletonKey", async () => {
      req.body = {
        storeName: "CommerceFlow Outdoors",
        freeShippingThreshold: 1499
      };

      const updatedSettings = {
        _id: "settings123",
        singletonKey: "default_store_settings",
        storeName: "CommerceFlow Outdoors",
        freeShippingThreshold: 1499,
        supportEmail: "support@commerceflow.com"
      };

      const updateSpy = vi.spyOn(StoreSettings, "findOneAndUpdate").mockReturnValue({
        lean: vi.fn().mockResolvedValue(updatedSettings)
      });

      await updateStoreSettings(req, res, next);

      expect(updateSpy).toHaveBeenCalledWith(
        { singletonKey: "default_store_settings" },
        {
          $set: {
            storeName: "CommerceFlow Outdoors",
            freeShippingThreshold: 1499
          },
          $setOnInsert: { singletonKey: "default_store_settings" }
        },
        {
          new: true,
          upsert: true,
          setDefaultsOnInsert: true,
          runValidators: true
        }
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            settings: updatedSettings
          })
        })
      );
    });

    it("strips singletonKey from body if maliciously provided in update payload", async () => {
      req.body = {
        storeName: "CommerceFlow Tech",
        singletonKey: "malicious_override"
      };

      const updatedSettings = {
        _id: "settings123",
        singletonKey: "default_store_settings",
        storeName: "CommerceFlow Tech"
      };

      const updateSpy = vi.spyOn(StoreSettings, "findOneAndUpdate").mockReturnValue({
        lean: vi.fn().mockResolvedValue(updatedSettings)
      });

      await updateStoreSettings(req, res, next);

      expect(updateSpy).toHaveBeenCalledWith(
        { singletonKey: "default_store_settings" },
        {
          $set: {
            storeName: "CommerceFlow Tech"
          },
          $setOnInsert: { singletonKey: "default_store_settings" }
        },
        expect.any(Object)
      );
    });
  });
});
