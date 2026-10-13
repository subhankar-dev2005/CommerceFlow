import Cart from "./cart.model.js";

import Product from "../products/product.model.js";

import AppError from "../../common/errors/app-error.js";

/**
 * Determines whether two cart items refer to the same composite identity.
 * Identity = (productId, variantId || null).
 *
 * @param {object} item - Mongoose cart item subdocument
 * @param {string} productId - String product ID to match
 * @param {string|null|undefined} variantId - Variant ID to match (null/undefined means no variant)
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

async function addToCart(
  req,
  res,
  next
) {
  try {
    const {
      productId,
      quantity,
      variantId
    } = req.body;

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
    const normalizedVariantId = variantId || null;

    // Simple-product guard: reject variantId when product has no variants
    if (!isVariantProduct && normalizedVariantId !== null) {
      throw new AppError(
        "This product does not have variants",
        400,
        [],
        "PRODUCT_HAS_NO_VARIANTS"
      );
    }

    // Variant-product guard: require variantId when product has variants
    if (isVariantProduct && normalizedVariantId === null) {
      throw new AppError(
        "A variant must be selected for this product",
        400,
        [],
        "VARIANT_REQUIRED"
      );
    }

    let effectiveStock;

    if (isVariantProduct) {
      // Resolve the variant from the embedded array
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
      effectiveStock = product.stock;
    }

    if (effectiveStock < quantity) {
      throw new AppError(
        "Insufficient product stock",
        400,
        [],
        "INSUFFICIENT_STOCK"
      );
    }

    let cart =
      await Cart.findOne({
        user: req.user._id
      });

    if (!cart) {
      const newItem = {
        product: productId,
        quantity
      };

      if (normalizedVariantId !== null) {
        newItem.variantId = normalizedVariantId;
      }

      cart =
        await Cart.create({
          user: req.user._id,
          items: [newItem]
        });
    } else {
      const existingItem =
        cart.items.find(
          (item) => matchesCartLine(item, productId, normalizedVariantId)
        );

      if (existingItem) {
        const newQuantity =
          existingItem.quantity +
          quantity;

        if (
          effectiveStock <
          newQuantity
        ) {
          throw new AppError(
            "Insufficient product stock",
            400,
            [],
            "INSUFFICIENT_STOCK"
          );
        }

        existingItem.quantity =
          newQuantity;
      } else {
        const newItem = {
          product: productId,
          quantity
        };

        if (normalizedVariantId !== null) {
          newItem.variantId = normalizedVariantId;
        }

        cart.items.push(newItem);
      }

      await cart.save();
    }

    return res
      .status(200)
      .json({
        success: true,

        message:
          "Product added to cart successfully",

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
  addToCart
};
