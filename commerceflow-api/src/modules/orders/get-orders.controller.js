
import Order from "./order.model.js";

async function getOrders(
  req,
  res,
  next
) {
  try {
    const page =
      Math.max(
        parseInt(req.query.page, 10) || 1,
        1
      );

    const limit =
      Math.min(
        Math.max(
          parseInt(req.query.limit, 10) || 10,
          1
        ),
        100
      );

    const skip =
      (page - 1) * limit;

    const filter = {
      user: req.user._id
    };

    if (req.query.status) {
      filter.status = req.query.status;
    }

    const totalOrders =
      await Order.countDocuments(filter);

    const sortOrder =
      req.query.sortOrder === "asc"
        ? 1
        : -1;

    const orders =
      await Order.find(filter)
        .sort({
          createdAt: sortOrder
        })
        .skip(skip)
        .limit(limit);

    const totalPages =
      Math.max(
        Math.ceil(
          totalOrders / limit
        ),
        1
      );

    return res
      .status(200)
      .json({
        success: true,

        message:
          "Orders retrieved successfully",

        data: {
          orders,

          pagination: {
            page,
            limit,
            totalOrders,
            totalPages
          }
        },

        requestId:
          req.requestId
      });
  } catch (error) {
    next(error);
  }
}

export default getOrders;
