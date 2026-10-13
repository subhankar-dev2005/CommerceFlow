import Cart from "./cart.model.js";
import { calculateOrderFinancials } from "../../utils/pricing.js";

async function removeCoupon(req, res, next) {
  try {
    const cart = await Cart.findOne({
      user: req.user._id
    }).populate(
      "items.product",
      "name price stock category image isActive"
    );

    if (cart && cart.coupon) {
      cart.coupon = null;
      await cart.save();
    }

    const items = cart && Array.isArray(cart.items) ? cart.items : [];
    const activeItems = items.filter(
      (item) => item.product && item.product.isActive !== false
    );

    const subtotal = activeItems.reduce(
      (sum, item) => sum + item.product.price * item.quantity,
      0
    );

    const financials = calculateOrderFinancials(subtotal, {
      shippingAmount: 0,
      taxAmount: 0,
      discountAmount: 0
    });

    const itemCount = items.length;
    const totalQuantity = items.reduce(
      (sum, item) => sum + item.quantity,
      0
    );

    return res.status(200).json({
      success: true,
      message: "Coupon removed successfully",
      data: {
        cart: cart || null,
        coupon: null,
        financials,
        totals: {
          itemCount,
          totalQuantity,
          subtotal: financials.subtotal,
          shippingAmount: financials.shippingAmount,
          taxAmount: financials.taxAmount,
          discountAmount: 0,
          total: financials.total
        }
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

export default removeCoupon;
