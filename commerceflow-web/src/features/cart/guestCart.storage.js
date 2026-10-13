/**
 * Guest Cart Storage Utility
 *
 * Manages localStorage persistence for unauthenticated guest cart items.
 *
 * Storage shape:
 * [
 *   { "productId": "507f1f77bcf86cd799439011", "quantity": 2 }
 * ]
 *
 * Defensive rules:
 * - Only stores productId and quantity.
 * - Never persists prices, totals, stock, product names, or auth tokens.
 * - Product ID must be a 24-character hexadecimal MongoDB ObjectId string.
 * - Quantity must be an integer between 1 and 99.
 * - Additive operations clamp total item quantity to 99.
 * - Duplicate entries are consolidated by summing quantities (clamped to 99).
 * - Malformed storage data safely recovers to [] and cleans up corruption.
 * - All returned collections and objects are defensively cloned (immutable).
 */

export const GUEST_CART_STORAGE_KEY = 'commerceflow_guest_cart';
export const GUEST_CART_KEY = GUEST_CART_STORAGE_KEY;

export const MIN_GUEST_CART_QUANTITY = 1;
export const MAX_GUEST_CART_QUANTITY = 99;

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
 * Validate quantity is an integer >= 1.
 *
 * @param {unknown} quantity
 * @returns {boolean}
 */
export function isValidQuantity(quantity) {
  return typeof quantity === 'number' && Number.isInteger(quantity) && quantity >= MIN_GUEST_CART_QUANTITY;
}

/**
 * Clamp quantity within supported guest cart bounds [1, 99].
 *
 * @param {number} quantity
 * @returns {number}
 */
export function clampQuantity(quantity) {
  if (quantity > MAX_GUEST_CART_QUANTITY) {
    return MAX_GUEST_CART_QUANTITY;
  }
  if (quantity < MIN_GUEST_CART_QUANTITY) {
    return MIN_GUEST_CART_QUANTITY;
  }
  return quantity;
}

/**
 * Deep-clone an array of cart items for immutability.
 *
 * @param {Array<{ productId: string, quantity: number }>} items
 * @returns {Array<{ productId: string, quantity: number }>}
 */
function cloneItems(items) {
  return items.map((item) => ({
    productId: item.productId,
    quantity: item.quantity,
  }));
}

/**
 * Normalize and validate a list of guest cart items.
 * Discards invalid entries, strips unknown fields, clamps quantities,
 * and consolidates duplicate product IDs by summing their quantities (up to 99).
 *
 * @param {unknown} rawItems
 * @returns {Array<{ productId: string, quantity: number }>}
 */
function normalizeItems(rawItems) {
  if (!Array.isArray(rawItems)) {
    return [];
  }

  const itemMap = new Map();

  for (const item of rawItems) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue;
    }

    const { productId, quantity } = item;
    if (!isValidProductId(productId) || !isValidQuantity(quantity)) {
      continue;
    }

    const clampedQty = clampQuantity(quantity);

    if (itemMap.has(productId)) {
      const existing = itemMap.get(productId);
      existing.quantity = clampQuantity(existing.quantity + clampedQty);
    } else {
      itemMap.set(productId, {
        productId,
        quantity: clampedQty,
      });
    }
  }

  return Array.from(itemMap.values()).map((entry) => ({
    productId: entry.productId,
    quantity: entry.quantity,
  }));
}

/**
 * Retrieve and normalize the current guest cart from localStorage.
 * Safely recovers to [] if storage is missing, inaccessible, or corrupted.
 *
 * @returns {Array<{ productId: string, quantity: number }>}
 */
export function getGuestCart() {
  const storage = getStorage();
  if (!storage) {
    return [];
  }

  let raw;
  try {
    raw = storage.getItem(GUEST_CART_STORAGE_KEY);
  } catch {
    return [];
  }

  if (raw === null || raw === undefined) {
    return [];
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Malformed JSON: clear corrupted storage to prevent repeated failures
    try {
      storage.removeItem(GUEST_CART_STORAGE_KEY);
    } catch {
      // Ignore storage removal errors
    }
    return [];
  }

  if (!Array.isArray(parsed)) {
    // Non-array JSON (primitive, object): clear corrupted storage
    try {
      storage.removeItem(GUEST_CART_STORAGE_KEY);
    } catch {
      // Ignore storage removal errors
    }
    return [];
  }

  return normalizeItems(parsed);
}

/**
 * Persist guest cart items to localStorage.
 * Validates, normalizes, and strips invalid data prior to persisting.
 *
 * @param {Array<{ productId: string, quantity: number }>} items
 * @returns {Array<{ productId: string, quantity: number }>}
 */
export function setGuestCart(items) {
  const normalized = normalizeItems(items);
  const storage = getStorage();

  if (storage) {
    try {
      storage.setItem(GUEST_CART_STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // Gracefully handle storage write errors (quota exceeded, private browsing)
    }
  }

  return cloneItems(normalized);
}

/**
 * Clear all guest cart items from localStorage.
 *
 * @returns {Array<{ productId: string, quantity: number }>}
 */
export function clearGuestCart() {
  const storage = getStorage();
  if (storage) {
    try {
      storage.removeItem(GUEST_CART_STORAGE_KEY);
    } catch {
      // Gracefully handle storage errors
    }
  }
  return [];
}

/**
 * Add an item to the guest cart.
 * If the product exists, adds quantities together (clamped to 99).
 * If the product is new, appends it with the requested quantity (clamped to 99).
 * Invalid product IDs or quantities are rejected without modifying storage.
 *
 * @param {string} productId
 * @param {number} quantity
 * @returns {Array<{ productId: string, quantity: number }>}
 */
export function addGuestCartItem(productId, quantity = 1) {
  if (!isValidProductId(productId) || !isValidQuantity(quantity)) {
    return getGuestCart();
  }

  const items = getGuestCart();
  const existing = items.find((item) => item.productId === productId);

  if (existing) {
    existing.quantity = clampQuantity(existing.quantity + quantity);
  } else {
    items.push({
      productId,
      quantity: clampQuantity(quantity),
    });
  }

  return setGuestCart(items);
}

/**
 * Update the quantity of an existing item in the guest cart.
 * If the product is not in the cart, does nothing.
 * If quantity <= 0, the item is removed from the cart.
 * If quantity is not an integer or is NaN, the update is safely rejected.
 *
 * @param {string} productId
 * @param {number} quantity
 * @returns {Array<{ productId: string, quantity: number }>}
 */
export function updateGuestCartItem(productId, quantity) {
  if (!isValidProductId(productId)) {
    return getGuestCart();
  }

  // Reject non-integer / NaN quantities
  if (typeof quantity !== 'number' || !Number.isInteger(quantity)) {
    return getGuestCart();
  }

  const items = getGuestCart();
  const index = items.findIndex((item) => item.productId === productId);

  if (index === -1) {
    // Updating non-existent product does not create an item
    return items;
  }

  if (quantity <= 0) {
    // Non-positive quantity removes the item
    items.splice(index, 1);
  } else {
    items[index].quantity = clampQuantity(quantity);
  }

  return setGuestCart(items);
}

/**
 * Remove an item from the guest cart.
 * Safely no-ops if the product does not exist in the cart.
 *
 * @param {string} productId
 * @returns {Array<{ productId: string, quantity: number }>}
 */
export function removeGuestCartItem(productId) {
  if (typeof productId !== 'string') {
    return getGuestCart();
  }

  const items = getGuestCart();
  const filtered = items.filter((item) => item.productId !== productId);

  return setGuestCart(filtered);
}
