import Cart from "./cart.model.js";
import Coupon from "../coupons/coupon.model.js";
import { normalizeCouponCode } from "../coupons/coupon.validator.js";
import { evaluateCouponEligibility } from "../coupons/coupon.service.js";
import { calculateOrderFinancials } from "../../utils/pricing.js";
import AppError from "../../common/errors/app-error.js";

async function applyCoupon(req, res, next) {
  try {
    const { couponCode } = req.body;
    const normalizedCode = normalizeCouponCode(couponCode);

    const coupon = await Coupon.findOne({ normalizedCode });
    if (!coupon) {
      throw new AppError(
        "Coupon not found",
        404,
        [],
        "COUPON_NOT_FOUND"
      );
    }

    const cart = await Cart.findOne({
      user: req.user._id
    }).populate(
      "items.product",
      "name price stock category image isActive"
    );

    if (!cart || !cart.items || cart.items.length === 0) {
      throw new AppError(
        "Cart is empty",
        400,
        [],
        "CART_EMPTY"
      );
    }

    const activeItems = cart.items.filter(
      (item) => item.product && item.product.isActive !== false
    );

    if (activeItems.length === 0) {
      throw new AppError(
        "Cart contains no active products",
        400,
        [],
        "CART_EMPTY"
      );
    }

    const subtotal = activeItems.reduce(
      (sum, item) => sum + item.product.price * item.quantity,
      0
    );

    const evalResult = evaluateCouponEligibility(coupon, {
      cartItems: activeItems,
      subtotal
    });

    if (!evalResult.isValid) {
      throw new AppError(
        evalResult.error.message,
        evalResult.error.statusCode,
        [],
        evalResult.error.code
      );
    }

    const discountAmount = evalResult.discountAmount;
    const financials = calculateOrderFinancials(subtotal, {
      shippingAmount: 0,
      taxAmount: 0,
      discountAmount
    });

    cart.coupon = {
      couponId: coupon._id,
      code: coupon.code
    };

    await cart.save();

    const itemCount = cart.items.length;
    const totalQuantity = cart.items.reduce(
      (sum, item) => sum + item.quantity,
      0
    );

    return res.status(200).json({
      success: true,
      message: "Coupon applied successfully",
      data: {
        cart,
        coupon: {
          code: coupon.code,
          couponId: coupon._id,
          type: coupon.type,
          value: coupon.value,
          discountAmount
        },
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

export default applyCoupon;
