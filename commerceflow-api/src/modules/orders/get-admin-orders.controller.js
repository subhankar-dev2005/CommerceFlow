import Order from "./order.model.js";

/**
 * GET /api/v1/admin/orders
 * Admin-only cross-customer order listing with server-side pagination,
 * deterministic sorting, operational status filtering, and exact identifier search.
 */
async function getAdminOrders(req, res, next) {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 10, 1),
      100
    );
    const skip = (page - 1) * limit;

    const filter = {};

    // 1. Fulfillment status filter
    if (req.query.status) {
      filter.status = req.query.status;
    }

    // 2. Payment status filter
    if (req.query.paymentStatus) {
      filter["payment.status"] = req.query.paymentStatus;
    }

    // 3. Exact identifier search (safely avoids uncontrolled regex scan across database)
    if (req.query.search && typeof req.query.search === "string") {
      const search = req.query.search.trim();
      if (search) {
        const isObjectId = /^[0-9a-fA-F]{24}$/.test(search);
        if (isObjectId) {
          filter.$or = [
            { _id: search },
            { "payment.razorpayOrderId": search },
            { "payment.transactionId": search }
          ];
        } else {
          filter.$or = [
            { "payment.razorpayOrderId": search },
            { "payment.transactionId": search }
          ];
        }
      }
    }

    const totalOrders = await Order.countDocuments(filter);

    const sortField = req.query.sortBy || "createdAt";
    const sortDirection = req.query.sortOrder === "asc" ? 1 : -1;
    const sortQuery = {
      [sortField]: sortDirection,
      _id: sortDirection // Deterministic tiebreaker for equal timestamps/values
    };

    const orders = await Order.find(filter)
      .select("-__v")
      .populate("user", "name email")
      .sort(sortQuery)
      .skip(skip)
      .limit(limit)
      .lean();

    const totalPages = Math.max(Math.ceil(totalOrders / limit), 1);

    return res.status(200).json({
      success: true,
      message: "Admin orders retrieved successfully",
      data: {
        orders,
        pagination: {
          page,
          limit,
          totalOrders,
          totalPages
        }
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

export default getAdminOrders;
