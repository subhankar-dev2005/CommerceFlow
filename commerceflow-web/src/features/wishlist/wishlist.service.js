import { apiClient } from '../../lib/apiClient.js';

/**
 * Wishlist Service
 * Communicates with the CommerceFlow wishlist backend API via the centralized apiClient.
 * Authentication is handled transparently by apiClient via the stored access token.
 */

let inFlightWishlistPromise = null;

/**
 * Clear in-flight wishlist promise (primarily for tests).
 */
export function clearInFlightWishlistCache() {
  inFlightWishlistPromise = null;
}

/**
 * Fetch the authenticated user's wishlist.
 * Deduplicates concurrent in-flight requests.
 *
 * @param {Object} [options={}] - Request options
 * @returns {Promise<{ items: Array<Object>, totalItems: number }>}
 */
export async function getWishlist(options = {}) {
  if (inFlightWishlistPromise) {
    return inFlightWishlistPromise;
  }

  inFlightWishlistPromise = (async () => {
    try {
      const response = await apiClient.get('wishlist', options);
      const raw = response?.data || response;

      return {
        items: Array.isArray(raw?.items) ? raw.items : [],
        totalItems: typeof raw?.totalItems === 'number' ? raw.totalItems : 0,
      };
    } finally {
      inFlightWishlistPromise = null;
    }
  })();

  return inFlightWishlistPromise;
}

/**
 * Add a product to the authenticated user's wishlist.
 * Sends ONLY { productId } — never userId, price, stock, or image.
 *
 * @param {string} productId - MongoDB ObjectId string
 * @returns {Promise<{ items: Array<Object>, totalItems: number }>}
 */
export async function addToWishlist(productId) {
  inFlightWishlistPromise = null;
  await apiClient.post('wishlist/items', { productId });
  return getWishlist();
}

/**
 * Remove a specific product from the authenticated user's wishlist.
 *
 * @param {string} productId - MongoDB ObjectId string
 * @returns {Promise<{ items: Array<Object>, totalItems: number }>}
 */
export async function removeFromWishlist(productId) {
  inFlightWishlistPromise = null;
  await apiClient.delete(`wishlist/items/${encodeURIComponent(productId)}`);
  return getWishlist();
}

/**
 * Clear all items from the authenticated user's wishlist.
 *
 * @returns {Promise<{ items: Array<Object>, totalItems: number }>}
 */
export async function clearWishlist() {
  inFlightWishlistPromise = null;
  await apiClient.delete('wishlist');
  return { items: [], totalItems: 0 };
}

export const wishlistService = {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  clearWishlist,
  clearInFlightWishlistCache,
};

export default wishlistService;
