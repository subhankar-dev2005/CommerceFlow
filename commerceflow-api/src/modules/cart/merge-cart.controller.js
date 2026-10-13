import Cart from "./cart.model.js";
import Product from "../products/product.model.js";

/**
 * Determines whether a cart item matches the incoming composite identity:
 * (productId, variantId || null).
 *
 * @param {object} item - Cart item document or plain object
 * @param {string} productId - Product ID string
 * @param {string|null|undefined} variantId - Variant ID string or null
 * @returns {boolean}
 */
function matchesCartLine(item, productId, variantId) {
  if (!item || !item.product) return false;
  const normalizedIncoming = variantId || null;
  const normalizedStored = item.variantId || null;
  const itemProductId = (item.product?._id || item.product).toString();

  return itemProductId === productId && normalizedStored === normalizedIncoming;
}

/**
 * Resolves the unit price for a cart item:
 * Variant price if set, falling back to base product price.
 *
 * @param {object} item - Cart item
 * @param {object} product - Populated product document
 * @returns {number}
 */
function resolveUnitPrice(item, product) {
  if (!product || typeof product.price !== "number") {
    return 0;
  }

  if (!item.variantId) {
    return product.price;
  }

  const variant = Array.isArray(product.variants)
    ? product.variants.find((v) => v.variantId === item.variantId)
    : null;

  if (!variant) {
    return product.price;
  }

  return variant.price !== null && variant.price !== undefined
    ? variant.price
    : product.price;
}

async function mergeCart(req, res, next) {
  try {
    const { items } = req.body;

    let cart = await Cart.findOne({
      user: req.user._id
    });

    if (!cart) {
      cart = await Cart.create({
        user: req.user._id,
        items: []
      });
    }

    const requestedProductIds = items.map((item) => item.productId);

    const products = await Product.find({
      _id: { $in: requestedProductIds }
    });

    const productMap = new Map(
      products.map((p) => [p._id.toString(), p])
    );

    const mergeReport = {
      added: [],
      updated: [],
      clamped: [],
      omitted: []
    };

    for (const requestedItem of items) {
      const { productId, quantity, variantId = null } = requestedItem;
      const normalizedVariantId = variantId || null;
      const product = productMap.get(productId);

      if (!product) {
        const omittedEntry = {
          productId,
          reason: "PRODUCT_NOT_FOUND"
        };
        if (normalizedVariantId) {
          omittedEntry.variantId = normalizedVariantId;
        }
        mergeReport.omitted.push(omittedEntry);
        continue;
      }

      if (!product.isActive) {
        const omittedEntry = {
          productId,
          reason: "PRODUCT_INACTIVE"
        };
        if (normalizedVariantId) {
          omittedEntry.variantId = normalizedVariantId;
        }
        mergeReport.omitted.push(omittedEntry);
        continue;
      }

      const isVariantProduct = Array.isArray(product.variants) && product.variants.length > 0;
      let availableStock = 0;

      if (!isVariantProduct) {
        // Simple product guard: reject variantId on non-variant products
        if (normalizedVariantId !== null) {
          mergeReport.omitted.push({
            productId,
            variantId: normalizedVariantId,
            reason: "PRODUCT_HAS_NO_VARIANTS"
          });
          continue;
        }

        if (product.stock <= 0) {
          mergeReport.omitted.push({
            productId,
            reason: "OUT_OF_STOCK"
          });
          continue;
        }

        availableStock = product.stock;
      } else {
        // Variant product guard: require variantId on variant products
        if (normalizedVariantId === null) {
          mergeReport.omitted.push({
            productId,
            reason: "VARIANT_REQUIRED"
          });
          continue;
        }

        const variant = product.variants.find((v) => v.variantId === normalizedVariantId);

        if (!variant) {
          mergeReport.omitted.push({
            productId,
            variantId: normalizedVariantId,
            reason: "VARIANT_NOT_FOUND"
          });
          continue;
        }

        if (variant.isActive === false) {
          mergeReport.omitted.push({
            productId,
            variantId: normalizedVariantId,
            reason: "VARIANT_INACTIVE"
          });
          continue;
        }

        if (variant.stock <= 0) {
          mergeReport.omitted.push({
            productId,
            variantId: normalizedVariantId,
            reason: "OUT_OF_STOCK"
          });
          continue;
        }

        availableStock = variant.stock;
      }

      const existingItemIndex = cart.items.findIndex((item) =>
        matchesCartLine(item, productId, normalizedVariantId)
      );

      if (existingItemIndex > -1) {
        const existingItem = cart.items[existingItemIndex];
        const previousQuantity = existingItem.quantity;
        const targetQuantity = previousQuantity + quantity;

        if (targetQuantity <= availableStock) {
          existingItem.quantity = targetQuantity;
          const updatedEntry = {
            productId,
            previousQuantity,
            finalQuantity: targetQuantity
          };
          if (normalizedVariantId) {
            updatedEntry.variantId = normalizedVariantId;
          }
          mergeReport.updated.push(updatedEntry);
        } else {
          const clampedQuantity = availableStock;
          existingItem.quantity = clampedQuantity;
          const clampedEntry = {
            productId,
            requested: targetQuantity,
            finalQuantity: clampedQuantity,
            availableStock
          };
          const updatedEntry = {
            productId,
            previousQuantity,
            finalQuantity: clampedQuantity
          };
          if (normalizedVariantId) {
            clampedEntry.variantId = normalizedVariantId;
            updatedEntry.variantId = normalizedVariantId;
          }
          mergeReport.clamped.push(clampedEntry);
          mergeReport.updated.push(updatedEntry);
        }
      } else {
        if (quantity <= availableStock) {
          cart.items.push({
            product: product._id,
            variantId: normalizedVariantId,
            quantity
          });
          const addedEntry = {
            productId,
            quantity
          };
          if (normalizedVariantId) {
            addedEntry.variantId = normalizedVariantId;
          }
          mergeReport.added.push(addedEntry);
        } else {
          const clampedQuantity = availableStock;
          cart.items.push({
            product: product._id,
            variantId: normalizedVariantId,
            quantity: clampedQuantity
          });
          const clampedEntry = {
            productId,
            requested: quantity,
            finalQuantity: clampedQuantity,
            availableStock
          };
          const addedEntry = {
            productId,
            quantity: clampedQuantity
          };
          if (normalizedVariantId) {
            clampedEntry.variantId = normalizedVariantId;
            addedEntry.variantId = normalizedVariantId;
          }
          mergeReport.clamped.push(clampedEntry);
          mergeReport.added.push(addedEntry);
        }
      }
    }

    await cart.save();

    await cart.populate(
      "items.product",
      "name price stock category image isActive variants"
    );

    const itemCount = cart.items.length;

    const totalQuantity = cart.items.reduce(
      (total, item) => total + item.quantity,
      0
    );

    const subtotal = cart.items.reduce((total, item) => {
      if (!item.product) {
        return total;
      }
      const unitPrice = resolveUnitPrice(item, item.product);
      return total + unitPrice * item.quantity;
    }, 0);

    return res.status(200).json({
      success: true,
      message: "Cart merged successfully",
      data: {
        cart,
        totals: {
          itemCount,
          totalQuantity,
          subtotal
        },
        mergeReport
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

export default mergeCart;
