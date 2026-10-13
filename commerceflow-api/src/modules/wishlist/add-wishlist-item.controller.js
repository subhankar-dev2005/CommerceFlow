import WishlistItem from "./wishlist-item.model.js";
import Product from "../products/product.model.js";
import AppError from "../../common/errors/app-error.js";

/*
 * POST /api/v1/wishlist/items
 *
 * Add an active product to the authenticated user's wishlist.
 *
 * Business rules:
 *  - Product must exist and be isActive: true.
 *  - Stock is NOT required; out-of-stock products may be wishlisted.
 *  - Duplicate user+product combinations are rejected by the database unique
 *    index. The controller catches the resulting 11000 error and returns a
 *    meaningful WISHLIST_ITEM_EXISTS response.
 *  - User ID is taken exclusively from req.user (set by authMiddleware).
 *    A userId supplied by the client is never trusted or accepted.
 */
async function addWishlistItem(req, res, next) {
  try {
    const { productId } = req.body;

    const product = await Product.findOne({
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

    const item = await WishlistItem.create({
      user: req.user._id,
      product: productId
    });

    return res.status(201).json({
      success: true,
      message: "Product added to wishlist",
      data: {
        item: {
          product: productId,
          addedAt: item.addedAt
        }
      },
      requestId: req.requestId
    });
  } catch (error) {
    /*
     * MongoDB duplicate key error (code 11000) indicates the unique compound
     * index { user, product } rejected a duplicate entry. Return a clear
     * business error instead of the generic DUPLICATE_RESOURCE from
     * errorMiddleware.
     */
    if (error.code === 11000) {
      return next(
        new AppError(
          "Product is already in your wishlist",
          409,
          [],
          "WISHLIST_ITEM_EXISTS"
        )
      );
    }

    next(error);
  }
}

export default addWishlistItem;
