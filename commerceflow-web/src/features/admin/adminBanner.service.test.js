import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  adminBannerService,
  validateBannerDestination,
  validateImageUrl,
  getEffectiveBannerStatus,
  resolveBannerImageUrl
} from './adminBanner.service.js';
import { apiClient } from '../../lib/apiClient.js';

describe('adminBannerService Unit Tests', () => {
  it('calls admin/banners with placement and status filters', async () => {
    let capturedUrl = null;
    const originalGet = apiClient.get;
    apiClient.get = async (url) => {
      capturedUrl = url;
      return {
        data: {
          banners: [
            { _id: 'ban_1', title: 'Winter Hero', placement: 'hero_carousel', status: 'published' }
          ],
          pagination: { totalBanners: 1, totalPages: 1 }
        }
      };
    };

    try {
      const result = await adminBannerService.getAdminBanners({
        placement: 'hero_carousel',
        status: 'published',
        search: 'Winter'
      });

      assert.ok(capturedUrl.startsWith('admin/banners?'));
      assert.ok(capturedUrl.includes('placement=hero_carousel'));
      assert.ok(capturedUrl.includes('status=published'));
      assert.ok(capturedUrl.includes('search=Winter'));
      assert.equal(result.banners.length, 1);
    } finally {
      apiClient.get = originalGet;
    }
  });

  it('calls public banners endpoint', async () => {
    let capturedUrl = null;
    const originalGet = apiClient.get;
    apiClient.get = async (url) => {
      capturedUrl = url;
      return {
        data: {
          banners: [
            { _id: 'ban_1', title: 'Public Hero', placement: 'hero_carousel' }
          ]
        }
      };
    };

    try {
      const banners = await adminBannerService.getPublicBanners({ placement: 'hero_carousel', limit: 5 });

      assert.ok(capturedUrl.startsWith('banners?'));
      assert.ok(capturedUrl.includes('placement=hero_carousel'));
      assert.equal(banners.length, 1);
    } finally {
      apiClient.get = originalGet;
    }
  });

  it('dispatches desktop image upload endpoint', async () => {
    let capturedUrl = null;
    let capturedPayload = null;
    const originalPost = apiClient.post;
    apiClient.post = async (url, payload) => {
      capturedUrl = url;
      capturedPayload = payload;
      return {
        data: {
          imageUrl: '/api/v1/banners/images/desktop.jpg'
        }
      };
    };

    try {
      const result = await adminBannerService.uploadDesktopImage('ban_123', 'data:image/png;base64,abc');
      assert.equal(capturedUrl, 'admin/banners/ban_123/desktop-image');
      assert.equal(capturedPayload.image, 'data:image/png;base64,abc');
      assert.equal(result.imageUrl, '/api/v1/banners/images/desktop.jpg');
    } finally {
      apiClient.post = originalPost;
    }
  });

  it('dispatches mobile image upload endpoint', async () => {
    let capturedUrl = null;
    let capturedPayload = null;
    const originalPost = apiClient.post;
    apiClient.post = async (url, payload) => {
      capturedUrl = url;
      capturedPayload = payload;
      return {
        data: {
          mobileImageUrl: '/api/v1/banners/images/mobile.webp'
        }
      };
    };

    try {
      const result = await adminBannerService.uploadMobileImage('ban_123', 'data:image/webp;base64,xyz');
      assert.equal(capturedUrl, 'admin/banners/ban_123/mobile-image');
      assert.equal(capturedPayload.image, 'data:image/webp;base64,xyz');
      assert.equal(result.mobileImageUrl, '/api/v1/banners/images/mobile.webp');
    } finally {
      apiClient.post = originalPost;
    }
  });

  it('dispatches bulk banner reorder endpoint', async () => {
    let capturedUrl = null;
    let capturedPayload = null;
    const originalPatch = apiClient.patch;
    apiClient.patch = async (url, payload) => {
      capturedUrl = url;
      capturedPayload = payload;
      return {
        data: { reorderedCount: 2 }
      };
    };

    try {
      const reorderList = [
        { id: 'ban_1', position: 1 },
        { id: 'ban_2', position: 2 }
      ];
      const result = await adminBannerService.reorderBanners(reorderList);
      assert.equal(capturedUrl, 'admin/banners/reorder');
      assert.deepEqual(capturedPayload.banners, reorderList);
      assert.equal(result.reorderedCount, 2);
    } finally {
      apiClient.patch = originalPatch;
    }
  });

  it('validates safe internal routes and http/https destinations', () => {
    assert.equal(validateBannerDestination('/shop'), true);
    assert.equal(validateBannerDestination('/products/example'), true);
    assert.equal(validateBannerDestination('/shop?category=Pantry'), true);
    assert.equal(validateBannerDestination('https://trusted.example/path'), true);
    assert.equal(validateBannerDestination('http://trusted.example/path'), true);
    assert.equal(validateBannerDestination('https://user:pass@evil.example/path'), false);
    assert.equal(validateBannerDestination('https://user@evil.example/path'), false);
    assert.equal(validateBannerDestination('//evil.example/path'), false);
    assert.equal(validateBannerDestination('javascript:alert(1)'), false);
    assert.equal(validateBannerDestination('data:text/html,...'), false);
    assert.equal(validateBannerDestination('ftp://example.com'), false);
  });

  it('validates image URLs and relative storage paths', () => {
    assert.equal(validateImageUrl('https://images.unsplash.com/photo-1'), true);
    assert.equal(validateImageUrl('/api/v1/banners/images/banner-123.jpg'), true);
    assert.equal(validateImageUrl('ftp://invalid.com/img.jpg'), false);
    assert.equal(validateImageUrl(''), false);
  });

  it('resolves relative storage paths to absolute API URLs while preserving external and data URLs', () => {
    // Relative storage path starting with /
    const relative = '/api/v1/banners/images/banner-desktop-123.png';
    const resolved = resolveBannerImageUrl(relative);
    assert.ok(resolved.endsWith('/api/v1/banners/images/banner-desktop-123.png'));
    assert.ok(resolved.startsWith('http'));

    // Relative storage path without leading /
    const noLeading = 'banners/images/banner-desktop-123.png';
    const resolvedNoLeading = resolveBannerImageUrl(noLeading);
    assert.ok(resolvedNoLeading.endsWith('/banners/images/banner-desktop-123.png'));
    assert.ok(resolvedNoLeading.startsWith('http'));

    // Admin banner image path normalized to public endpoint
    const adminPath = '/api/v1/admin/banners/images/banner-desktop-123.png';
    const resolvedAdmin = resolveBannerImageUrl(adminPath);
    assert.ok(resolvedAdmin.endsWith('/api/v1/banners/images/banner-desktop-123.png'));
    assert.ok(!resolvedAdmin.includes('/admin/banners/images/'));

    const adminPathNoLeading = 'admin/banners/images/banner-desktop-123.png';
    const resolvedAdminNoLeading = resolveBannerImageUrl(adminPathNoLeading);
    assert.ok(resolvedAdminNoLeading.endsWith('/banners/images/banner-desktop-123.png'));
    assert.ok(!resolvedAdminNoLeading.includes('/admin/banners/images/'));

    // External absolute URL
    const external = 'https://images.unsplash.com/photo-1510312305653-8ed496efae75';
    assert.equal(resolveBannerImageUrl(external), external);

    // Data URL
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA';
    assert.equal(resolveBannerImageUrl(dataUrl), dataUrl);

    // Empty, null, undefined, invalid
    assert.equal(resolveBannerImageUrl(''), '');
    assert.equal(resolveBannerImageUrl(null), '');
    assert.equal(resolveBannerImageUrl(undefined), '');
    assert.equal(resolveBannerImageUrl(123), '');
  });

  it('calculates effective banner status based on schedule dates', () => {
    const published = { status: 'published', startsAt: null, expiresAt: null };
    assert.equal(getEffectiveBannerStatus(published), 'published');

    const scheduled = {
      status: 'published',
      startsAt: new Date(Date.now() + 86400000).toISOString(),
      expiresAt: null
    };
    assert.equal(getEffectiveBannerStatus(scheduled), 'scheduled');

    const expired = {
      status: 'published',
      startsAt: null,
      expiresAt: new Date(Date.now() - 86400000).toISOString()
    };
    assert.equal(getEffectiveBannerStatus(expired), 'expired');

    const draft = { status: 'draft' };
    assert.equal(getEffectiveBannerStatus(draft), 'draft');
  });
});
