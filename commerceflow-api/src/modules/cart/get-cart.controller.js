import Cart from "./cart.model.js";
import Coupon from "../coupons/coupon.model.js";
import { normalizeCouponCode } from "../coupons/coupon.validator.js";
import { evaluateCouponEligibility } from "../coupons/coupon.service.js";
import { calculateOrderFinancials } from "../../utils/pricing.js";

/**
 * Resolves the live unit price for a cart item using server-authoritative data.
 *
 * For variant products: variant.price if set, otherwise product.price.
 * For simple products: product.price.
 *
 * @param {object} item  - Populated cart item
 * @param {object} product - Populated product document
 * @returns {number}
 */
function resolveUnitPrice(item, product) {
  if (!item.variantId) {
    return product.price;
  }

  const variant = Array.isArray(product.variants)
    ? product.variants.find((v) => v.variantId === item.variantId)
    : null;

  if (!variant) {
    // Variant deleted/deactivated after item was added — return base product price as fallback
    return product.price;
  }

  // variant.price === null means inherit the base product price
  return variant.price !== null && variant.price !== undefined
    ? variant.price
    : product.price;
}

/**
 * Resolves the display images for a cart item.
 *
 * Returns variant images when present, otherwise falls back to product images.
 *
 * @param {object} item - Populated cart item
 * @param {object} product - Populated product document
 * @returns {string[]}
 */
function resolveItemImages(item, product) {
  if (!item.variantId) {
    return product.images || [];
  }

  const variant = Array.isArray(product.variants)
    ? product.variants.find((v) => v.variantId === item.variantId)
    : null;

  if (variant && Array.isArray(variant.images) && variant.images.length > 0) {
    return variant.images;
  }

  return product.images || [];
}

/**
 * Checks whether a cart item's variant is still live.
 *
 * A simple-product item (variantId null) defers to product.isActive.
 * A variant item is considered live only if the variant still exists in the embedded
 * array AND its isActive flag is not false.
 *
 * @param {object} item - Populated cart item
 * @param {object} product - Populated product document
 * @returns {{ isLive: boolean, reason?: string }}
 */
function checkItemLiveness(item, product) {
  if (!product || product.isActive === false) {
    return { isLive: false, reason: "product_inactive" };
  }

  if (!item.variantId) {
    // Simple product line
    return { isLive: true };
  }

  const variant = Array.isArray(product.variants)
    ? product.variants.find((v) => v.variantId === item.variantId)
    : null;

  if (!variant) {
    return { isLive: false, reason: "variant_deleted" };
  }

  if (variant.isActive === false) {
    return { isLive: false, reason: "variant_inactive" };
  }

  return { isLive: true };
}

async function getCart(req, res, next) {
  try {
    // Populate product fields including the variants array so we can resolve
    // per-variant price, images, and liveness without a second round-trip.
    let cart = await Cart.findOne({
      user: req.user._id
    }).populate(
      "items.product",
      "name price stock category image images isActive variants"
    );

    if (!cart) {
      cart = {
        user: req.user._id,
        items: []
      };
    }

    const items = Array.isArray(cart.items) ? cart.items : [];
    const itemCount = items.length;
    const totalQuantity = items.reduce(
      (total, item) => total + item.quantity,
      0
    );

    // Enrich each item with resolved price, images, and liveness metadata.
    // Do NOT mutate stored documents — compute enriched view data in memory only.
    const enrichedItems = items.map((item) => {
      const product = item.product;

      if (!product) {
        // Orphaned item (product deleted); mark as inactive for client awareness
        return {
          ...item.toObject ? item.toObject() : item,
          _liveness: { isLive: false, reason: "product_deleted" },
          resolvedPrice: 0,
          resolvedImages: []
        };
      }

      const liveness = checkItemLiveness(item, product);
      const resolvedPrice = resolveUnitPrice(item, product);
      const resolvedImages = resolveItemImages(item, product);

      const rawItem = item.toObject ? item.toObject() : { ...item };

      return {
        ...rawItem,
        _liveness: liveness,
        resolvedPrice,
        resolvedImages
      };
    });

    // Only items whose product is active AND whose variant (if any) is live
    // contribute to the subtotal.
    const activeEnrichedItems = enrichedItems.filter((item) => item._liveness.isLive);

    // Use server-resolved prices for all financial calculations.
    const subtotal = activeEnrichedItems.reduce(
      (total, item) => total + item.resolvedPrice * item.quantity,
      0
    );

    let couponPreview = null;
    let discountAmount = 0;

    if (cart.coupon && (cart.coupon.couponId || cart.coupon.code)) {
      let couponDoc = null;
      if (cart.coupon.couponId) {
        couponDoc = await Coupon.findById(cart.coupon.couponId);
      } else if (cart.coupon.code) {
        couponDoc = await Coupon.findOne({
          normalizedCode: normalizeCouponCode(cart.coupon.code)
        });
      }

      // Pass activeEnrichedItems as cartItems so coupon eligibility evaluates
      // the same active set used for the subtotal. The populated item.product
      // field is preserved in the enriched view.
      const evalResult = evaluateCouponEligibility(couponDoc, {
        cartItems: activeEnrichedItems,
        subtotal
      });

      if (evalResult.isValid) {
        discountAmount = evalResult.discountAmount;
        couponPreview = {
          code: couponDoc.code,
          couponId: couponDoc._id,
          type: couponDoc.type,
          value: couponDoc.value,
          discountAmount,
          isValid: true
        };
      } else {
        // Stale / invalid coupon: report as invalid without applying discount
        discountAmount = 0;
        couponPreview = {
          code: cart.coupon.code,
          couponId: cart.coupon.couponId,
          isValid: false,
          error: {
            code: evalResult.error.code,
            message: evalResult.error.message
          }
        };
      }
    }

    const financials = calculateOrderFinancials(subtotal, {
      shippingAmount: 0,
      taxAmount: 0,
      discountAmount
    });

    return res.status(200).json({
      success: true,
      message: "Cart retrieved successfully",
      data: {
        cart,
        items: enrichedItems,
        coupon: couponPreview,
        financials,
        totals: {
          itemCount,
          totalQuantity,
          subtotal: financials.subtotal,
          shippingAmount: financials.shippingAmount,
          taxAmount: financials.taxAmount,
          discountAmount: financials.discountAmount,
          total: financials.total
        }
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

export default getCart;
