import WishlistItem from "./wishlist-item.model.js";

/*
 * DELETE /api/v1/wishlist/items/:productId
 *
 * Remove a specific product from the authenticated user's wishlist.
 *
 * Idempotent: if the item does not exist, return 200 success.
 *
 * Security: the query is always scoped to req.user._id.
 *   - A user can never delete another user's wishlist item even if
 *     they supply a valid productId, because the user filter prevents it.
 *   - No product existence check is performed; removing by productId is
 *     independent of whether the product document still exists.
 */
async function removeWishlistItem(req, res, next) {
  try {
    const { productId } = req.params;

    await WishlistItem.deleteOne({
      user: req.user._id,
      product: productId
    });

    return res.status(200).json({
      success: true,
      message: "Product removed from wishlist",
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

export default removeWishlistItem;
