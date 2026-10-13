import Cart from "./cart.model.js";

import Product from "../products/product.model.js";

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

async function updateCartItem(
  req,
  res,
  next
) {
  try {
    const {
      productId
    } = req.params;

    const {
      quantity,
      variantId
    } = req.body;

    const normalizedVariantId = variantId || null;

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

    // Match exactly the composite identity — never affect a different variant of the same product
    const cartItem =
      cart.items.find(
        (item) => matchesCartLine(item, productId, normalizedVariantId)
      );

    if (!cartItem) {
      throw new AppError(
        "Product not found in cart",
        404,
        [],
        "CART_ITEM_NOT_FOUND"
      );
    }

    const product =
      await Product.findOne({
        _id: productId,
        isActive: true
      });

    if (!product) {
      throw new AppError(
        "Product not found",
        404,
        [],
        "PRODUCT_NOT_FOUND"
      );
    }

    const isVariantProduct = Array.isArray(product.variants) && product.variants.length > 0;

    let effectiveStock;

    if (isVariantProduct && normalizedVariantId !== null) {
      // Resolve variant and check stock against variant.stock
      const variant = product.variants.find(
        (v) => v.variantId === normalizedVariantId
      );

      if (!variant) {
        throw new AppError(
          "Variant not found",
          404,
          [],
          "VARIANT_NOT_FOUND"
        );
      }

      if (variant.isActive === false) {
        throw new AppError(
          "Variant is not available",
          400,
          [],
          "VARIANT_INACTIVE"
        );
      }

      effectiveStock = variant.stock;
    } else {
      // Simple product — use root stock
      effectiveStock = product.stock;
    }

    if (
      effectiveStock <
      quantity
    ) {
      throw new AppError(
        "Insufficient product stock",
        400,
        [],
        "INSUFFICIENT_STOCK"
      );
    }

    cartItem.quantity =
      quantity;

    await cart.save();

    return res
      .status(200)
      .json({
        success: true,

        message:
          "Cart item updated successfully",

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

export {
  updateCartItem
};