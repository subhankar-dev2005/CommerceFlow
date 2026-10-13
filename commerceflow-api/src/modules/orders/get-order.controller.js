import Order from "./order.model.js";
import AppError from "../../common/errors/app-error.js";

async function getOrder(
  req,
  res,
  next
) {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId)
      .populate(
        "items.product",
        "name price image category"
      );

    if (!order) {
      throw new AppError(
        "Order not found",
        404,
        [],
        "ORDER_NOT_FOUND"
      );
    }

    if (
      req.user.role !== "admin" &&
      order.user.toString() !== req.user._id.toString()
    ) {
      throw new AppError(
        "You are not allowed to view this order",
        403,
        [],
        "ORDER_ACCESS_DENIED"
      );
    }

    return res.status(200).json({
      success: true,
      message: "Order retrieved successfully",
      data: {
        order
      },
      requestId: req.requestId
    });

  } catch (error) {
    next(error);
  }
}

export default getOrder;