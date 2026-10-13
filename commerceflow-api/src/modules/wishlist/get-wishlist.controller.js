import WishlistItem from "./wishlist-item.model.js";

/*
 * GET /api/v1/wishlist
 *
 * Return the authenticated user's wishlist with populated product data.
 *
 * Behavior:
 *  - Only the authenticated user's own items are returned.
 *  - User ID is taken from req.user (set by authMiddleware).
 *    No userId is accepted from the client.
 *  - Product data is populated with the same public fields used by the storefront.
 *  - Items where the product no longer exists (null after populate) are omitted.
 *  - Items where product.isActive !== true are omitted silently.
 *    The WishlistItem document is NOT deleted during a read.
 *  - Out-of-stock (stock === 0) active products ARE included.
 *  - Items are ordered newest-first by addedAt.
 */
async function getWishlist(req, res, next) {
  try {
    const rawItems = await WishlistItem.find({
      user: req.user._id
    })
      .populate(
        "product",
        "_id name price stock category image images isActive"
      )
      .sort({ addedAt: -1 })
      .lean();

    /*
     * Filter out items where the product was physically removed or is inactive.
     * We do NOT delete WishlistItem records here to keep reads side-effect free.
     */
    const items = rawItems
      .filter(
        (item) =>
          item.product !== null &&
          item.product !== undefined &&
          item.product.isActive === true
      )
      .map((item) => ({
        addedAt: item.addedAt,
        product: item.product
      }));

    return res.status(200).json({
      success: true,
      message: "Wishlist retrieved successfully",
      data: {
        items,
        totalItems: items.length
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

export default getWishlist;
