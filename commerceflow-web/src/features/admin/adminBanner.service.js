/* global URL */
import { apiClient } from '../../lib/apiClient.js';

export const BANNER_PLACEMENTS = [
  { value: 'hero_carousel', label: 'Storefront Hero Carousel' },
  { value: 'category_top', label: 'Category Page Banner' },
  { value: 'promotional_strip', label: 'Top Promotional Strip' },
  { value: 'storefront_footer', label: 'Footer Promo Banner' }
];

export const BANNER_STATUSES = ['all', 'published', 'scheduled', 'draft', 'archived'];

export const BANNER_DESTINATION_TYPES = [
  { value: 'custom_internal', label: 'Internal Route (e.g. /shop)' },
  { value: 'category', label: 'Category Page' },
  { value: 'product', label: 'Product Details Page' },
  { value: 'sale', label: 'Sale Collection' },
  { value: 'external', label: 'External Link (https://...)' }
];

/**
 * Validates destination URL or internal route safely.
 */
export function validateBannerDestination(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > 500) return false;

  // Reject control characters, whitespace, backslashes, angle brackets, quotes, backticks
  if (/[\s\0-\x1F\x7F\\<>|"'`]/.test(trimmed)) {
    return false;
  }

  if (trimmed.startsWith('/')) {
    if (trimmed.startsWith('//')) return false;
    if (/(?:javascript|data|file|blob|vbscript|ftp):/i.test(trimmed)) return false;
    return true;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (parsed.username || parsed.password) return false;
    if (!parsed.hostname || parsed.hostname.length === 0) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates image asset reference URL or safe relative storage path.
 */
export function validateImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;

  if (trimmed.startsWith('/')) {
    if (trimmed.startsWith('//')) return false;
    if (/(?:javascript|data|file|blob|vbscript):/i.test(trimmed)) return false;
    return true;
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Calculates display status of a banner accounting for scheduled date window.
 */
export function getEffectiveBannerStatus(banner) {
  if (!banner) return 'draft';
  if (banner.status === 'archived') return 'archived';
  if (banner.status === 'draft') return 'draft';

  const now = Date.now();
  if (banner.startsAt && new Date(banner.startsAt).getTime() > now) {
    return 'scheduled';
  }
  const effectiveEnd = banner.endsAt || banner.expiresAt;
  if (effectiveEnd && new Date(effectiveEnd).getTime() < now) {
    return 'expired';
  }
  return banner.status || 'published';
}

const inFlightPublicBanners = new Map();
const publicBannersCache = new Map();
const BANNER_CACHE_TTL_MS = 30000;

/**
 * Clear in-flight banner queries and cache (primarily for tests and mutation invalidation).
 */
export function clearBannerInFlightRequests() {
  inFlightPublicBanners.clear();
  publicBannersCache.clear();
}

/**
 * Admin Banner Management Service communicating with backend /api/v1/admin/banners
 */
export const adminBannerService = {
  /**
   * List banners for admin console with filters and pagination
   */
  async getAdminBanners({ placement = 'all', status = 'all', search = '', page = 1, limit = 20 } = {}) {
    const params = new URLSearchParams();
    if (placement && placement !== 'all') params.append('placement', placement);
    if (status && status !== 'all') params.append('status', status);
    if (search && search.trim()) params.append('search', search.trim());
    params.append('page', String(page));
    params.append('limit', String(limit));

    const response = await apiClient.get(`admin/banners?${params.toString()}`);
    return response?.data || { banners: [], pagination: { totalBanners: 0, totalPages: 1 } };
  },

  /**
   * Get public published banners within active schedule
   */
  async getPublicBanners({ placement = 'hero_carousel', limit = 10, force = false } = {}) {
    const params = new URLSearchParams();
    if (placement) params.append('placement', placement);
    if (limit) params.append('limit', String(limit));
    const endpoint = `banners?${params.toString()}`;

    if (!force && publicBannersCache.has(endpoint)) {
      const entry = publicBannersCache.get(endpoint);
      if (Date.now() - entry.time < BANNER_CACHE_TTL_MS) {
        return entry.data;
      }
      publicBannersCache.delete(endpoint);
    }

    if (inFlightPublicBanners.has(endpoint)) {
      return inFlightPublicBanners.get(endpoint);
    }

    const promise = (async () => {
      try {
        const response = await apiClient.get(endpoint);
        const result = response?.data?.banners || [];
        publicBannersCache.set(endpoint, { data: result, time: Date.now() });
        return result;
      } finally {
        inFlightPublicBanners.delete(endpoint);
      }
    })();

    inFlightPublicBanners.set(endpoint, promise);
    return promise;
  },

  /**
   * Create a new banner
   */
  async createAdminBanner(bannerData) {
    clearBannerInFlightRequests();
    const response = await apiClient.post('admin/banners', bannerData);
    return response?.data?.banner;
  },

  /**
   * Update an existing banner
   */
  async updateAdminBanner(bannerId, bannerData) {
    clearBannerInFlightRequests();
    const response = await apiClient.patch(`admin/banners/${bannerId}`, bannerData);
    return response?.data?.banner;
  },

  /**
   * Upload desktop banner image
   */
  async uploadDesktopImage(bannerId, base64Image) {
    clearBannerInFlightRequests();
    const response = await apiClient.post(`admin/banners/${bannerId}/desktop-image`, {
      image: base64Image
    });
    return response?.data;
  },

  /**
   * Upload mobile banner image
   */
  async uploadMobileImage(bannerId, base64Image) {
    clearBannerInFlightRequests();
    const response = await apiClient.post(`admin/banners/${bannerId}/mobile-image`, {
      image: base64Image
    });
    return response?.data;
  },

  /**
   * Atomically reorder banners
   */
  async reorderBanners(orderedBanners) {
    clearBannerInFlightRequests();
    const response = await apiClient.patch('admin/banners/reorder', {
      banners: orderedBanners
    });
    return response?.data;
  },

  /**
   * Toggle or update banner status
   */
  async toggleBannerStatus(bannerId, nextStatus) {
    clearBannerInFlightRequests();
    const response = await apiClient.patch(`admin/banners/${bannerId}/status`, { status: nextStatus });
    return response?.data?.banner;
  },

  /**
   * Delete a banner
   */
  async deleteAdminBanner(bannerId) {
    clearBannerInFlightRequests();
    const response = await apiClient.delete(`admin/banners/${bannerId}`);
    return response?.data;
  }
};

export default adminBannerService;
