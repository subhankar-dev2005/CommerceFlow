/**
 * Pricing and financial calculation utilities for CommerceFlow orders.
 *
 * Current business rules (Initial implementation):
 * - shippingAmount: 0
 * - taxAmount: 0
 * - discountAmount: 0
 * - total = subtotal + shippingAmount + taxAmount - discountAmount = subtotal
 */

/**
 * Calculates authoritative order financials according to CommerceFlow business rules.
 *
 * @param {number} subtotal - The line items subtotal
 * @param {object} [options] - Optional financial adjustments (defaults to 0)
 * @returns {{ subtotal: number, shippingAmount: number, taxAmount: number, discountAmount: number, total: number }}
 */
export function calculateOrderFinancials(subtotal, options = {}) {
  const opts = options && typeof options === "object" ? options : {};
  const parseAmount = (val) => {
    const num = Number(val);
    return Number.isFinite(num) ? Math.max(0, num) : 0;
  };

  const safeSubtotal = parseAmount(subtotal);
  const shippingAmount = parseAmount(opts.shippingAmount);
  const taxAmount = parseAmount(opts.taxAmount);
  const discountAmount = parseAmount(opts.discountAmount);

  // Invariant: total = subtotal + shippingAmount + taxAmount - discountAmount
  const total = Math.max(0, safeSubtotal + shippingAmount + taxAmount - discountAmount);

  return {
    subtotal: safeSubtotal,
    shippingAmount,
    taxAmount,
    discountAmount,
    total
  };
}

/**
 * Resolves the authoritative payable amount for an order.
 * Returns order.total when it exists, otherwise falls back to order.subtotal for legacy orders.
 *
 * @param {object} order - The order document or plain object
 * @returns {number} The authoritative payable amount
 */
export function getOrderPayableAmount(order) {
  if (!order || typeof order !== "object") return 0;

  if (typeof order.total === "number" && Number.isFinite(order.total)) {
    // If order.total is > 0, return it directly
    if (order.total > 0) {
      return order.total;
    }

    // If order.total is 0, but subtotal > 0 and no discount was applied,
    // this handles hydrated legacy documents where Mongoose default: 0 populated total.
    if ((order.subtotal || 0) > 0 && !(order.discountAmount > 0)) {
      return Math.max(0, order.subtotal);
    }

    return Math.max(0, order.total);
  }

  // Legacy fallback: total is absent/undefined
  if (typeof order.subtotal === "number" && Number.isFinite(order.subtotal)) {
    return Math.max(0, order.subtotal);
  }

  return 0;
}

/**
 * Converts a monetary amount in INR (Rupees) to paise (minor currency unit) for Razorpay API.
 * Uses standard deterministic rounding.
 *
 * @param {number} amount - Amount in INR
 * @returns {number} Amount in paise (always non-negative integer)
 */
export function toPaise(amount) {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return 0;
  }
  return Math.round(numericAmount * 100);
}

/**
 * Calculates authoritative coupon discount according to CommerceFlow business rules.
 *
 * Rules:
 * - Percentage: discount = Math.round(subtotal * percentage / 100)
 *   - Capped by maximumDiscount if configured (> 0)
 *   - Capped by subtotal (discount <= subtotal)
 * - Fixed: discount = Math.min(Math.round(value), subtotal)
 * - Safe floor: discount >= 0
 * - Invariant: 0 <= discount <= subtotal
 *
 * @param {object} coupon - The coupon document or plain object ({ type, value, maximumDiscount })
 * @param {number} subtotal - The eligible merchandise subtotal
 * @returns {number} Deterministic integer discount amount in INR
 */
export function calculateCouponDiscount(coupon, subtotal) {
  const safeSubtotal = Number.isFinite(Number(subtotal)) ? Math.max(0, Number(subtotal)) : 0;
  if (!coupon || typeof coupon !== "object" || safeSubtotal === 0) {
    return 0;
  }

  let discount = 0;

  if (coupon.type === "percentage") {
    const percentage = Number(coupon.value);
    if (Number.isFinite(percentage) && percentage > 0) {
      discount = Math.round((safeSubtotal * percentage) / 100);
      if (coupon.maximumDiscount !== null && coupon.maximumDiscount !== undefined) {
        const maxDiscount = Number(coupon.maximumDiscount);
        if (Number.isFinite(maxDiscount) && maxDiscount > 0) {
          discount = Math.min(discount, maxDiscount);
        }
      }
    }
  } else if (coupon.type === "fixed") {
    const fixedValue = Number(coupon.value);
    if (Number.isFinite(fixedValue) && fixedValue > 0) {
      discount = Math.min(Math.round(fixedValue), safeSubtotal);
    }
  }

  discount = Math.min(discount, safeSubtotal);
  discount = Math.max(0, discount);

  return Number.isFinite(discount) ? discount : 0;
}
