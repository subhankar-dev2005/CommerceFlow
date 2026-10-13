import { apiClient, ApiError } from '../../lib/apiClient.js';

/**
 * Cart Service
 * Communicates with the CommerceFlow cart backend API via the centralized apiClient.
 * All mutations refresh authoritative state via GET /api/v1/cart.
 */

let inFlightCartPromise = null;

/**
 * Clear in-flight cart promise (primarily for tests).
 */
export function clearInFlightCartCache() {
  inFlightCartPromise = null;
}

/**
 * Fetch the authenticated user's cart and calculated totals.
 * Deduplicates concurrent in-flight requests.
 *
 * @param {Object} [options={}] - Request options
 * @returns {Promise<{ cart: Object, totals: { itemCount: number, totalQuantity: number, subtotal: number } }>}
 */
export async function getCart(options = {}) {
  if (inFlightCartPromise) {
    return inFlightCartPromise;
  }

  inFlightCartPromise = (async () => {
    try {
      const response = await apiClient.get('cart', options);

      return {
        cart: response?.data?.cart || { items: [] },
        totals: response?.data?.totals || {
          itemCount: 0,
          totalQuantity: 0,
          subtotal: 0,
        },
        coupon: response?.data?.coupon || null,
        financials: response?.data?.financials || null,
      };
    } finally {
      inFlightCartPromise = null;
    }
  })();

  return inFlightCartPromise;
}

/**
 * Add a product to the cart or increment its quantity.
 * Automatically fetches and returns the populated authoritative cart after mutation.
 *
 * @param {string} productId - 24-character hexadecimal MongoDB ObjectId
 * @param {number} [quantity=1] - Positive integer >= 1
 * @returns {Promise<{ cart: Object, totals: { itemCount: number, totalQuantity: number, subtotal: number } }>}
 */
export async function addToCart(productId, quantity = 1) {
  if (!productId || typeof productId !== 'string' || !/^[0-9a-fA-F]{24}$/.test(productId.trim())) {
    throw new ApiError({
      message: 'A valid 24-character product ID is required',
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'productId', message: 'Invalid product ID' }],
    });
  }

  const sanitizedQty = Number(quantity);
  if (!Number.isInteger(sanitizedQty) || sanitizedQty < 1) {
    throw new ApiError({
      message: 'Quantity must be an integer of at least 1',
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'quantity', message: 'Quantity must be at least 1' }],
    });
  }

  await apiClient.post('cart/items', {
    productId: productId.trim(),
    quantity: sanitizedQty,
  });

  // Re-fetch authoritative populated cart with real totals and populated product info
  return getCart();
}

/**
 * Update the absolute quantity of an existing cart item.
 * Quantity must strictly be >= 1.
 *
 * @param {string} productId - 24-character hexadecimal MongoDB ObjectId
 * @param {number} quantity - Positive integer >= 1
 * @returns {Promise<{ cart: Object, totals: { itemCount: number, totalQuantity: number, subtotal: number } }>}
 */
export async function updateCartItem(productId, quantity) {
  if (!productId || typeof productId !== 'string' || !/^[0-9a-fA-F]{24}$/.test(productId.trim())) {
    throw new ApiError({
      message: 'A valid 24-character product ID is required',
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'productId', message: 'Invalid product ID' }],
    });
  }

  const sanitizedQty = Number(quantity);
  if (!Number.isInteger(sanitizedQty) || sanitizedQty < 1) {
    throw new ApiError({
      message: 'Quantity must be an integer of at least 1',
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'quantity', message: 'Quantity must be at least 1' }],
    });
  }

  await apiClient.patch(`cart/items/${encodeURIComponent(productId.trim())}`, {
    quantity: sanitizedQty,
  });

  // Re-fetch authoritative populated cart with real totals and populated product info
  return getCart();
}

/**
 * Remove a specific product item from the cart.
 *
 * @param {string} productId - 24-character hexadecimal MongoDB ObjectId
 * @returns {Promise<{ cart: Object, totals: { itemCount: number, totalQuantity: number, subtotal: number } }>}
 */
export async function removeCartItem(productId) {
  if (!productId || typeof productId !== 'string' || !/^[0-9a-fA-F]{24}$/.test(productId.trim())) {
    throw new ApiError({
      message: 'A valid 24-character product ID is required',
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'productId', message: 'Invalid product ID' }],
    });
  }

  await apiClient.delete(`cart/items/${encodeURIComponent(productId.trim())}`, { body: {} });

  // Re-fetch authoritative populated cart with real totals and populated product info
  return getCart();
}

/**
 * Clear all items from the authenticated user's cart.
 *
 * @returns {Promise<{ cart: Object, totals: { itemCount: number, totalQuantity: number, subtotal: number } }>}
 */
export async function clearCart() {
  await apiClient.delete('cart');

  // Re-fetch authoritative populated cart with real totals and populated product info
  return getCart();
}

/**
 * Merge guest cart items into the authenticated user's cart.
 * Server is authoritative for stock, prices, totals, and validation.
 * Request body sends strictly: { items: [{ productId, quantity }] }.
 *
 * @param {Array<{ productId: string, quantity: number }>} items
 * @returns {Promise<{ cart: Object, totals: { itemCount: number, totalQuantity: number, subtotal: number }, mergeReport: Object|null }>}
 */
export async function mergeCart(items) {
  if (!Array.isArray(items)) {
    throw new ApiError({
      message: 'Items must be an array',
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'items', message: 'Items must be an array' }],
    });
  }

  const sanitizedItems = items.map((item) => ({
    productId: String(item.productId).trim(),
    quantity: Number(item.quantity),
  }));

  const response = await apiClient.post('cart/merge', {
    items: sanitizedItems,
  });

  return {
    cart: response?.data?.cart || { items: [] },
    totals: response?.data?.totals || {
      itemCount: 0,
      totalQuantity: 0,
      subtotal: 0,
    },
    coupon: response?.data?.coupon || null,
    financials: response?.data?.financials || null,
    mergeReport: response?.data?.mergeReport || null,
  };
}

/**
 * Apply a promotional coupon to the authenticated user's cart.
 * Server is strictly authoritative for coupon validity, eligibility, and financial calculation.
 *
 * @param {string} code - Coupon code (e.g. "SAVE10")
 * @returns {Promise<{ cart: Object, totals: Object, coupon: Object|null, financials: Object|null }>}
 */
export async function applyCoupon(code) {
  if (!code || typeof code !== 'string' || !code.trim()) {
    throw new ApiError({
      message: 'Coupon code is required',
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'code', message: 'Coupon code cannot be empty' }],
    });
  }

  const response = await apiClient.post('cart/coupon', {
    code: code.trim(),
  });

  return {
    cart: response?.data?.cart || { items: [] },
    totals: response?.data?.totals || {
      itemCount: 0,
      totalQuantity: 0,
      subtotal: 0,
    },
    coupon: response?.data?.coupon || null,
    financials: response?.data?.financials || null,
  };
}

/**
 * Remove any active coupon from the authenticated user's cart.
 *
 * @returns {Promise<{ cart: Object, totals: Object, coupon: null, financials: Object|null }>}
 */
export async function removeCoupon() {
  const response = await apiClient.delete('cart/coupon', { body: {} });

  return {
    cart: response?.data?.cart || { items: [] },
    totals: response?.data?.totals || {
      itemCount: 0,
      totalQuantity: 0,
      subtotal: 0,
    },
    coupon: response?.data?.coupon || null,
    financials: response?.data?.financials || null,
  };
}

export const cartService = {
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
  mergeCart,
  applyCoupon,
  removeCoupon,
  clearInFlightCartCache,
};

export default cartService;
