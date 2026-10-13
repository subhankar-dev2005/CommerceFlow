/**
 * Guest Recently Viewed Storage Utility
 *
 * Manages localStorage persistence for unauthenticated guest browsing history.
 *
 * Storage shape:
 * [
 *   "507f1f77bcf86cd799439011",
 *   "607f1f77bcf86cd799439021"
 * ]
 *
 * Defensive rules:
 * - Only stores 24-character hexadecimal MongoDB ObjectId strings.
 * - Never persists prices, names, images, stock, ratings, product objects, or auth tokens.
 * - Most recently viewed item is placed at index 0.
 * - Duplicate views reposition the product to index 0 rather than creating duplicate entries.
 * - Strictly capped at 12 product IDs.
 * - Malformed storage data safely self-heals and recovers to [].
 * - Never throws during normal browsing even if localStorage is restricted, disabled, or corrupt.
 */

export const GUEST_RECENTLY_VIEWED_KEY = 'commerceflow_guest_recently_viewed';
export const MAX_GUEST_RECENTLY_VIEWED = 12;

const MONGO_OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

/**
 * Safely access the available Web Storage instance.
 * Handles environments where window or localStorage is undefined, null, or restricted.
 *
 * @returns {Storage|null}
 */
function getStorage() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      return globalThis.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Validate MongoDB ObjectId format (24-character hex string).
 *
 * @param {unknown} productId
 * @returns {boolean}
 */
export function isValidProductId(productId) {
  return typeof productId === 'string' && MONGO_OBJECT_ID_REGEX.test(productId);
}

/**
 * Retrieve the current guest recently viewed product IDs from localStorage.
 * Self-heals corrupted, non-array, or invalid entries.
 *
 * @returns {string[]} Array of valid 24-character hex product IDs (newest first).
 */
export function getGuestRecentlyViewed() {
  const storage = getStorage();
  if (!storage) {
    return [];
  }

  try {
    const raw = storage.getItem(GUEST_RECENTLY_VIEWED_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      // Corrupted structure; self-heal by clearing
      storage.removeItem(GUEST_RECENTLY_VIEWED_KEY);
      return [];
    }

    // Filter strictly valid 24-character ObjectId strings and enforce max bounds
    const validIds = parsed.filter(isValidProductId).slice(0, MAX_GUEST_RECENTLY_VIEWED);

    // If invalid items were pruned, persist cleaned representation
    if (validIds.length !== parsed.length) {
      storage.setItem(GUEST_RECENTLY_VIEWED_KEY, JSON.stringify(validIds));
    }

    return [...validIds];
  } catch {
    // Malformed JSON or storage access error; self-heal safely
    try {
      storage.removeItem(GUEST_RECENTLY_VIEWED_KEY);
    } catch {
      // Ignore removal failure in heavily restricted environments
    }
    return [];
  }
}

/**
 * Record a product ID into guest browsing history.
 * - Prepends to index 0 (newest first).
 * - Repositions existing product ID if already viewed.
 * - Deduplicates entries.
 * - Caps total list at MAX_GUEST_RECENTLY_VIEWED (12 items).
 *
 * @param {string} productId
 * @returns {string[]} Updated array of product IDs.
 */
export function addGuestRecentlyViewed(productId) {
  if (!isValidProductId(productId)) {
    return getGuestRecentlyViewed();
  }

  const storage = getStorage();
  const current = getGuestRecentlyViewed();

  // Deduplicate and move to index 0 (most recent)
  const filtered = current.filter((id) => id !== productId);
  const updated = [productId, ...filtered].slice(0, MAX_GUEST_RECENTLY_VIEWED);

  if (storage) {
    try {
      storage.setItem(GUEST_RECENTLY_VIEWED_KEY, JSON.stringify(updated));
    } catch {
      // Gracefully handle storage quota or private-browsing security errors
    }
  }

  return updated;
}

/**
 * Clear guest recently viewed browsing history from localStorage.
 *
 * @returns {string[]} Empty array.
 */
export function clearGuestRecentlyViewed() {
  const storage = getStorage();
  if (storage) {
    try {
      storage.removeItem(GUEST_RECENTLY_VIEWED_KEY);
    } catch {
      // Handle storage removal errors safely
    }
  }
  return [];
}

export default {
  GUEST_RECENTLY_VIEWED_KEY,
  MAX_GUEST_RECENTLY_VIEWED,
  isValidProductId,
  getGuestRecentlyViewed,
  addGuestRecentlyViewed,
  clearGuestRecentlyViewed
};
