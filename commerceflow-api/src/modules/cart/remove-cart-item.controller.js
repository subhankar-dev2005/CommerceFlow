import Cart from "./cart.model.js";

import AppError from "../../common/errors/app-error.js";

/**
 * Determines whether a cart item matches the composite identity (productId, variantId).
 *
 * @param {object} item - Cart item subdocument
 * @param {string} productId - Product ID string
 * @param {string|null} variantId - Variant ID or null for simple products
 * @returns {boolean}
 */
function matchesCartLine(item, productId, variantId) {
  const normalizedIncoming = variantId || null;
  const normalizedStored = item.variantId || null;

  return (
    item.product.toString() === productId &&
    normalizedStored === normalizedIncoming
  );
}

async function removeCartItem(
  req,
  res,
  next
) {
  try {
    const {
      productId
    } = req.params;

    // variantId arrives as a validated query parameter (null/undefined = simple product).
    // Guard against req.query being absent in unit test contexts.
    const normalizedVariantId = (req.query && req.query.variantId) || null;

    const cart =
      await Cart.findOne({
        user: req.user._id
      });

    if (!cart) {
      throw new AppError(
        "Cart not found",
        404,
        [],
        "CART_NOT_FOUND"
      );
    }

    // Verify the exact composite identity exists before filtering
    const existingItem =
      cart.items.find(
        (item) => matchesCartLine(item, productId, normalizedVariantId)
      );

    if (!existingItem) {
      throw new AppError(
        "Product not found in cart",
        404,
        [],
        "CART_ITEM_NOT_FOUND"
      );
    }

    // Remove only the single matching composite line
    cart.items =
      cart.items.filter(
        (item) => !matchesCartLine(item, productId, normalizedVariantId)
      );

    await cart.save();

    return res
      .status(200)
      .json({
        success: true,

        message:
          "Product removed from cart successfully",

        data: {
          cart
        },

        requestId:
          req.requestId
      });
  } catch (error) {
    next(error);
  }
}

export default removeCartItem;