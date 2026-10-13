import WishlistItem from "./wishlist-item.model.js";

/*
 * DELETE /api/v1/wishlist
 *
 * Clear the entire authenticated user's wishlist.
 *
 * Idempotent: clearing an already-empty wishlist returns 200 success.
 *
 * Security: only the authenticated user's items are deleted.
 *   deleteMany({ user: req.user._id }) never touches other users' data.
 */
async function clearWishlist(req, res, next) {
  try {
    await WishlistItem.deleteMany({
      user: req.user._id
    });

    return res.status(200).json({
      success: true,
      message: "Wishlist cleared",
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

export default clearWishlist;
