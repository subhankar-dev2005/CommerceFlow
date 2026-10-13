/**
 * Common utility helpers for CommerceFlow storefront.
 */

/**
 * Merge class names safely
 * @param {...any} classes
 * @returns {string}
 */
export function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}

/**
 * Format numeric amount into Indian Rupee (INR) currency format.
 * Example: 1999 -> ₹1,999
 * @param {number} amount
 * @param {boolean} [showDecimals=false]
 * @returns {string}
 */
export function formatPrice(amount, showDecimals = false) {
  if (amount === undefined || amount === null || isNaN(Number(amount))) {
    return '₹0';
  }

  const num = Number(amount);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: showDecimals ? 2 : 0,
    minimumFractionDigits: showDecimals ? 2 : 0,
  }).format(num);
}

/**
 * Normalize server-side order financial fields for safe frontend display.
 *
 * The backend is authoritative for all financial values. This helper:
 * - Treats missing optional fields as 0 (legacy order compatibility)
 * - Uses server-provided `total` when valid; falls back to `subtotal` only
 *   for legacy orders that predate the financial model upgrade
 * - Never performs arithmetic on amounts (display only)
 *
 * @param {object} order - Raw order object from the API
 * @returns {{ subtotal: number, shippingAmount: number, taxAmount: number, discountAmount: number, total: number }}
 */
export function normalizeOrderFinancials(order = {}) {
  // Guard against null being passed explicitly (default = {} only covers undefined)
  const o = (order !== null && typeof order === 'object') ? order : {};
  const subtotal = Number(o.subtotal ?? 0) || 0;
  const shippingAmount = Number(o.shippingAmount ?? 0) || 0;
  const taxAmount = Number(o.taxAmount ?? 0) || 0;
  const discountAmount = Number(o.discountAmount ?? 0) || 0;
  const rawTotal = Number(o.total ?? NaN);
  const total = isFinite(rawTotal) && rawTotal >= 0 ? rawTotal : subtotal;
  return { subtotal, shippingAmount, taxAmount, discountAmount, total };
}

/**
 * Perform client-side SPA navigation without full browser reload.
 * @param {string} url - Target URL path with optional query string
 * @param {object} [state] - Optional history state
 */
export function navigate(url, state = {}) {
  if (typeof window !== 'undefined' && url) {
    const current = window.location.pathname + (window.location.search || '');
    if (current === url) {
      return;
    }
    window.history.pushState(state, '', url);
    window.dispatchEvent(new window.Event('popstate'));
    if (!url.includes('#')) {
      window.scrollTo(0, 0);
    }
  }
}
