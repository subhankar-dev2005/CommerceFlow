import { apiClient } from '../../lib/apiClient.js';
import { isValidProductId } from './recentlyViewed.storage.js';

/**
 * Recently Viewed Service
 * Communicates with the CommerceFlow recently viewed backend API via centralized apiClient.
 * Authentication is handled transparently by apiClient via stored access token.
 */

/**
 * Record a product view for the authenticated user.
 *
 * @param {string} productId - 24-character hexadecimal MongoDB ObjectId
 * @param {Object} [options={}] - Optional request options (e.g. signal)
 * @returns {Promise<{ productId: string, viewedAt: string }>}
 */
export async function recordRecentlyViewed(productId, options = {}) {
  if (!isValidProductId(productId)) {
    throw new Error('Invalid product ID');
  }

  const response = await apiClient.post('recently-viewed', { productId }, options);
  const data = response?.data || response;

  return {
    productId: data?.productId || productId,
    viewedAt: data?.viewedAt || new Date().toISOString()
  };
}

const inFlightRecentlyViewedQueries = new Map();

/**
 * Clear in-flight recently viewed queries (primarily for tests).
 */
export function clearInFlightRecentlyViewedCache() {
  inFlightRecentlyViewedQueries.clear();
}

/**
 * Fetch the authenticated user's recently viewed products.
 * Deduplicates concurrent in-flight requests.
 *
 * @param {number} [limit] - Optional limit (1 to 20, default: 10)
 * @param {Object} [options={}] - Optional request options (e.g. signal)
 * @returns {Promise<{ items: Array<Object>, totalItems: number }>}
 */
export async function getRecentlyViewed(limit, options = {}) {
  const query = typeof limit === 'number' && limit > 0
    ? `?limit=${encodeURIComponent(limit)}`
    : '';
  const cacheKey = query;

  if (options.signal?.aborted) {
    return apiClient.get(`recently-viewed${query}`, options);
  }

  if (inFlightRecentlyViewedQueries.has(cacheKey)) {
    return inFlightRecentlyViewedQueries.get(cacheKey);
  }

  const fetchPromise = (async () => {
    try {
      const response = await apiClient.get(`recently-viewed${query}`, options);
      const raw = response?.data || response;

      return {
        items: Array.isArray(raw?.items) ? raw.items : [],
        totalItems: typeof raw?.totalItems === 'number' ? raw.totalItems : (Array.isArray(raw?.items) ? raw.items.length : 0)
      };
    } finally {
      inFlightRecentlyViewedQueries.delete(cacheKey);
    }
  })();

  inFlightRecentlyViewedQueries.set(cacheKey, fetchPromise);
  return fetchPromise;
}

/**
 * Clear the authenticated user's recently viewed history.
 *
 * @param {Object} [options={}] - Optional request options
 * @returns {Promise<{ success: boolean }>}
 */
export async function clearRecentlyViewed(options = {}) {
  inFlightRecentlyViewedQueries.clear();
  await apiClient.delete('recently-viewed', options);
  return { success: true };
}

/**
 * Batch-merge guest browsing history into the authenticated user's account upon login.
 *
 * @param {string[]} productIds - Array of 24-hex MongoDB ObjectIds
 * @param {Object} [options={}] - Optional request options
 * @returns {Promise<{ mergedCount: number }>}
 */
export async function mergeRecentlyViewed(productIds, options = {}) {
  inFlightRecentlyViewedQueries.clear();
  if (!Array.isArray(productIds) || productIds.length === 0) {
    return { mergedCount: 0 };
  }

  const validIds = productIds.filter(isValidProductId).slice(0, 12);
  if (validIds.length === 0) {
    return { mergedCount: 0 };
  }

  const response = await apiClient.post('recently-viewed/merge', { productIds: validIds }, options);
  const data = response?.data || response;

  return {
    mergedCount: typeof data?.mergedCount === 'number' ? data.mergedCount : validIds.length
  };
}

export const recentlyViewedService = {
  recordRecentlyViewed,
  getRecentlyViewed,
  clearRecentlyViewed,
  mergeRecentlyViewed,
  clearInFlightRecentlyViewedCache,
};

export default recentlyViewedService;
