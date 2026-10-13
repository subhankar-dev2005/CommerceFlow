import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { apiClient, ApiError } from '../../lib/apiClient.js';
import {
  getStoreSettings,
  updateStoreSettings,
} from './adminSettings.service.js';

describe('Admin Settings Service Tests', () => {
  let originalGet;
  let originalPatch;

  beforeEach(() => {
    originalGet = apiClient.get;
    originalPatch = apiClient.patch;
  });

  afterEach(() => {
    apiClient.get = originalGet;
    apiClient.patch = originalPatch;
  });

  describe('getStoreSettings', () => {
    it('calls GET admin/settings and returns settings and systemInfo', async () => {
      let calledUrl = null;
      apiClient.get = async (url) => {
        calledUrl = url;
        return {
          success: true,
          data: {
            settings: { storeName: 'CommerceFlow', currency: 'INR' },
            systemInfo: { environment: 'development', apiVersion: 'v1' },
          },
        };
      };

      const res = await getStoreSettings();
      assert.equal(calledUrl, 'admin/settings');
      assert.equal(res.settings.storeName, 'CommerceFlow');
      assert.equal(res.systemInfo.apiVersion, 'v1');
    });
  });

  describe('updateStoreSettings', () => {
    it('rejects empty payloads with ApiError', async () => {
      await assert.rejects(
        () => updateStoreSettings({}),
        (err) => err instanceof ApiError && err.code === 'VALIDATION_ERROR'
      );
    });

    it('sends PATCH to admin/settings with payload', async () => {
      let calledUrl = null;
      let sentBody = null;
      apiClient.patch = async (url, body) => {
        calledUrl = url;
        sentBody = body;
        return {
          success: true,
          data: {
            settings: { storeName: 'CommerceFlow Mountain', freeShippingThreshold: 1499 },
            systemInfo: { environment: 'production' },
          },
        };
      };

      const res = await updateStoreSettings({ storeName: 'CommerceFlow Mountain' });
      assert.equal(calledUrl, 'admin/settings');
      assert.equal(sentBody.storeName, 'CommerceFlow Mountain');
      assert.equal(res.settings.storeName, 'CommerceFlow Mountain');
    });
  });
});
