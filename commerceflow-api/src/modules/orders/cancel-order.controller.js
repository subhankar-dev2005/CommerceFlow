import { cancelOrderWithInventoryRestoration } from "./order-cancellation.service.js";

async function cancelOrder(req, res, next) {
  try {
    const { orderId } = req.params;
    const { reason = "other", reasonDetail = "" } = req.body || {};

    const updatedOrder = await cancelOrderWithInventoryRestoration({
      orderId,
      actor: "customer",
      reason,
      reasonDetail,
      userId: req.user._id,
      logger: req.log
    });

    return res.status(200).json({
      success: true,
      message: "Order cancelled successfully",
      data: {
        order: updatedOrder
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

export default cancelOrder;
