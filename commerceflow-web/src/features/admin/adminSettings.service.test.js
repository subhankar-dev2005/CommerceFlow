import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { apiClient, ApiError } from '../../lib/apiClient.js';
import {
  getStoreSettings,
  updateStoreSettings,
  uploadLogo,
  resetLogo,
  getPublicBranding,
  resetAnnouncement,
  getPublicAnnouncement,
  adminSettingsService,
} from './adminSettings.service.js';

describe('Admin Settings Service Tests', () => {
  let originalGet;
  let originalPatch;
  let originalPost;

  beforeEach(() => {
    originalGet = apiClient.get;
    originalPatch = apiClient.patch;
    originalPost = apiClient.post;
  });

  afterEach(() => {
    apiClient.get = originalGet;
    apiClient.patch = originalPatch;
    apiClient.post = originalPost;
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

  describe('uploadLogo', () => {
    it('rejects empty image payload with ApiError', async () => {
      await assert.rejects(
        () => adminSettingsService.uploadLogo({ image: '' }),
        (err) => err instanceof ApiError && err.code === 'VALIDATION_ERROR'
      );
    });

    it('sends POST to admin/settings/logo with image and altText', async () => {
      let calledUrl = null;
      let sentBody = null;
      apiClient.post = async (url, body) => {
        calledUrl = url;
        sentBody = body;
        return {
          success: true,
          data: {
            logoUrl: '/api/v1/settings/logo?v=1730000',
            logoAlt: 'Custom Brand Mark',
            updatedAt: '2026-10-27T12:00:00Z',
          },
        };
      };

      const res = await adminSettingsService.uploadLogo({
        image: 'data:image/png;base64,iVBORw0KGgo...',
        altText: 'Custom Brand Mark',
      });

      assert.equal(calledUrl, 'admin/settings/logo');
      assert.equal(sentBody.altText, 'Custom Brand Mark');
      assert.equal(res.logoUrl, '/api/v1/settings/logo?v=1730000');
    });
  });

  describe('resetLogo', () => {
    it('sends POST to admin/settings/logo/reset', async () => {
      let calledUrl = null;
      apiClient.post = async (url) => {
        calledUrl = url;
        return {
          success: true,
          data: {
            logoUrl: null,
            logoAlt: 'CommerceFlow Logo',
            hasCustomLogo: false,
          },
        };
      };

      const res = await adminSettingsService.resetLogo();
      assert.equal(calledUrl, 'admin/settings/logo/reset');
      assert.equal(res.logoUrl, null);
      assert.equal(res.hasCustomLogo, false);
    });
  });

  describe('getPublicBranding', () => {
    it('calls GET settings/branding and returns public branding data', async () => {
      let calledUrl = null;
      apiClient.get = async (url) => {
        calledUrl = url;
        return {
          success: true,
          data: {
            storeName: 'CommerceFlow Alpine',
            logoUrl: '/api/v1/settings/logo',
            logoAlt: 'Alpine Peak',
            hasCustomLogo: true,
          },
        };
      };

      const res = await adminSettingsService.getPublicBranding();
      assert.equal(calledUrl, 'settings/branding');
      assert.equal(res.storeName, 'CommerceFlow Alpine');
      assert.equal(res.hasCustomLogo, true);
    });
  });

  describe('resetAnnouncement', () => {
    it('sends POST to admin/settings/announcement/reset', async () => {
      let calledUrl = null;
      apiClient.post = async (url) => {
        calledUrl = url;
        return {
          success: true,
          data: {
            announcementText: '🏕️ Free shipping on orders over $50',
          },
        };
      };

      const res = await resetAnnouncement();
      assert.equal(calledUrl, 'admin/settings/announcement/reset');
      assert.equal(res.announcementText, '🏕️ Free shipping on orders over $50');
    });
  });

  describe('getPublicAnnouncement', () => {
    it('calls GET settings/announcement and returns announcement text', async () => {
      let calledUrl = null;
      apiClient.get = async (url) => {
        calledUrl = url;
        return {
          success: true,
          data: {
            announcementText: '⚡ Flash Sale — 20% Off Everything Today!',
          },
        };
      };

      const res = await getPublicAnnouncement();
      assert.equal(calledUrl, 'settings/announcement');
      assert.equal(res.announcementText, '⚡ Flash Sale — 20% Off Everything Today!');
    });
  });
});
