import * as recentlyViewedService from "./recently-viewed.service.js";

/**
 * POST /api/v1/recently-viewed
 * Records a customer view for an active product.
 */
export async function recordProductView(req, res, next) {
  try {
    const { productId } = req.body;
    const userId = req.user._id;

    const result = await recentlyViewedService.recordProductView(userId, productId);

    return res.status(200).json({
      success: true,
      message: "Product view recorded successfully",
      data: result,
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/recently-viewed
 * Retrieves the authenticated user's recently viewed products.
 */
export async function getRecentlyViewed(req, res, next) {
  try {
    const userId = req.user._id;
    const limit = Number(req.query.limit) || 10;

    const result = await recentlyViewedService.getRecentlyViewed(userId, limit);

    return res.status(200).json({
      success: true,
      message: "Recently viewed products retrieved successfully",
      data: result,
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/v1/recently-viewed
 * Clears the authenticated user's recently viewed history.
 */
export async function clearRecentlyViewed(req, res, next) {
  try {
    const userId = req.user._id;

    await recentlyViewedService.clearRecentlyViewed(userId);

    return res.status(200).json({
      success: true,
      message: "Recently viewed history cleared successfully",
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/recently-viewed/merge
 * Merges guest browsing history into the authenticated user's account.
 */
export async function mergeRecentlyViewed(req, res, next) {
  try {
    const { productIds } = req.body;
    const userId = req.user._id;

    const result = await recentlyViewedService.mergeRecentlyViewed(userId, productIds);

    return res.status(200).json({
      success: true,
      message: "Recently viewed products merged successfully",
      data: result,
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

export default {
  recordProductView,
  getRecentlyViewed,
  clearRecentlyViewed,
  mergeRecentlyViewed
};
