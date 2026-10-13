import { calculateCouponDiscount } from "../../utils/pricing.js";

/**
 * Evaluates whether a coupon is eligible to be applied to a given cart.
 *
 * Checks in order:
 * 1. Coupon existence
 * 2. isActive flag
 * 3. startsAt promotion start window
 * 4. expiresAt promotion expiration window
 * 5. usageLimit global redemption counter
 * 6. minimumSubtotal hurdle threshold
 * 7. applicableProducts / applicableCategories restrictions with OR semantics
 *
 * @param {object} coupon - The Coupon document or plain object
 * @param {object} params
 * @param {Array} params.cartItems - Cart items with populated or object products
 * @param {number} params.subtotal - Server-calculated active items subtotal
 * @param {Date|number|string} [params.now] - Optional reference timestamp for deterministic evaluation
 * @returns {{ isValid: boolean, error?: { code: string, message: string, statusCode: number }, discountAmount?: number }}
 */
export function evaluateCouponEligibility(coupon, { cartItems = [], subtotal = 0, now = Date.now() } = {}) {
  if (!coupon || typeof coupon !== "object") {
    return {
      isValid: false,
      error: {
        code: "COUPON_NOT_FOUND",
        message: "Coupon not found",
        statusCode: 404
      }
    };
  }

  if (coupon.isActive === false) {
    return {
      isValid: false,
      error: {
        code: "COUPON_INACTIVE",
        message: "Coupon is inactive",
        statusCode: 400
      }
    };
  }

  const currentTime = new Date(now).getTime();

  if (coupon.startsAt) {
    const startTime = new Date(coupon.startsAt).getTime();
    if (Number.isFinite(startTime) && currentTime < startTime) {
      return {
        isValid: false,
        error: {
          code: "COUPON_NOT_STARTED",
          message: "Coupon promotion has not started yet",
          statusCode: 400
        }
      };
    }
  }

  if (coupon.expiresAt) {
    const expiryTime = new Date(coupon.expiresAt).getTime();
    if (Number.isFinite(expiryTime) && currentTime > expiryTime) {
      return {
        isValid: false,
        error: {
          code: "COUPON_EXPIRED",
          message: "Coupon has expired",
          statusCode: 400
        }
      };
    }
  }

  if (
    coupon.usageLimit !== null &&
    coupon.usageLimit !== undefined &&
    typeof coupon.usedCount === "number" &&
    coupon.usedCount >= coupon.usageLimit
  ) {
    return {
      isValid: false,
      error: {
        code: "COUPON_USAGE_LIMIT_REACHED",
        message: "Coupon usage limit has been reached",
        statusCode: 400
      }
    };
  }

  const safeSubtotal = Number.isFinite(Number(subtotal)) ? Math.max(0, Number(subtotal)) : 0;
  const minSubtotal = Number.isFinite(Number(coupon.minimumSubtotal)) ? Number(coupon.minimumSubtotal) : 0;

  if (minSubtotal > 0 && safeSubtotal < minSubtotal) {
    return {
      isValid: false,
      error: {
        code: "COUPON_MINIMUM_SUBTOTAL_NOT_MET",
        message: `Cart subtotal does not meet the minimum requirement of ₹${minSubtotal}`,
        statusCode: 400
      }
    };
  }

  const items = Array.isArray(cartItems) ? cartItems : [];
  const activeItems = items.filter(
    (item) => item && item.product && item.product.isActive !== false
  );

  const hasProductRestrictions =
    Array.isArray(coupon.applicableProducts) &&
    coupon.applicableProducts.length > 0;

  const hasCategoryRestrictions =
    Array.isArray(coupon.applicableCategories) &&
    coupon.applicableCategories.length > 0;

  if (hasProductRestrictions && !hasCategoryRestrictions) {
    const matches = activeItems.some((item) => {
      const pid = (item.product._id || item.product).toString();
      return coupon.applicableProducts.some(
        (ap) => (ap._id || ap).toString() === pid
      );
    });

    if (!matches) {
      return {
        isValid: false,
        error: {
          code: "COUPON_PRODUCT_NOT_APPLICABLE",
          message: "Coupon is not applicable to any products in your cart",
          statusCode: 400
        }
      };
    }
  } else if (!hasProductRestrictions && hasCategoryRestrictions) {
    const matches = activeItems.some((item) => {
      const category = (item.product.category || "").trim().toLowerCase();
      return coupon.applicableCategories.some(
        (ac) => ac.trim().toLowerCase() === category
      );
    });

    if (!matches) {
      return {
        isValid: false,
        error: {
          code: "COUPON_CATEGORY_NOT_APPLICABLE",
          message: "Coupon is not applicable to any categories in your cart",
          statusCode: 400
        }
      };
    }
  } else if (hasProductRestrictions && hasCategoryRestrictions) {
    // OR semantics across restriction dimensions:
    // A coupon is applicable when at least one cart item matches either configured product OR category
    const matches = activeItems.some((item) => {
      const pid = (item.product._id || item.product).toString();
      const category = (item.product.category || "").trim().toLowerCase();
      const matchesProduct = coupon.applicableProducts.some(
        (ap) => (ap._id || ap).toString() === pid
      );
      const matchesCategory = coupon.applicableCategories.some(
        (ac) => ac.trim().toLowerCase() === category
      );
      return matchesProduct || matchesCategory;
    });

    if (!matches) {
      return {
        isValid: false,
        error: {
          code: "COUPON_PRODUCT_NOT_APPLICABLE",
          message: "Coupon is not applicable to any items in your cart",
          statusCode: 400
        }
      };
    }
  }

  const discountAmount = calculateCouponDiscount(coupon, safeSubtotal);

  return {
    isValid: true,
    discountAmount
  };
}
