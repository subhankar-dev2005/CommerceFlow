import Order from "./order.model.js";
import Product from "../products/product.model.js";
import AppError from "../../common/errors/app-error.js";
import { recordAdminAuditEvent, AUDIT_EVENT_TYPES } from "../audit/admin-audit.service.js";
import { cancelOrderWithInventoryRestoration } from "./order-cancellation.service.js";

const CANCELLABLE_STATUSES = [
  "pending",
  "confirmed",
  "processing"
];

const ALLOWED_TRANSITIONS = {
  pending: [
    "processing",
    "cancelled"
  ],
  confirmed: [
    "processing",
    "cancelled"
  ],
  processing: [
    "shipped",
    "cancelled"
  ],
  shipped: [
    "delivered"
  ],
  delivered: [],
  cancelled: []
};

async function updateOrderStatus(
  req,
  res,
  next
) {
  try {
    const {
      orderId
    } = req.params;

    const {
      status,
      reason = "other",
      reasonDetail = ""
    } = req.body || {};

    // Hardened cancellation path: transactional cancellation with inventory restoration
    if (status === "cancelled") {
      const updatedOrder = await cancelOrderWithInventoryRestoration({
        orderId,
        actor: "admin",
        reason,
        reasonDetail,
        userId: req.user?._id,
        logger: req.log
      });

      if (req.user) {
        await recordAdminAuditEvent({
          eventType: AUDIT_EVENT_TYPES.ORDER_STATUS_UPDATED,
          resourceType: "order",
          resourceId: orderId,
          metadata: {
            orderId,
            previousStatus: "cancellable",
            newStatus: "cancelled",
            reason,
            reasonDetail: reasonDetail || null
          },
          req
        }).catch((auditErr) => {
          req.log?.error?.({ err: auditErr }, "Failed to record order cancellation audit log");
        });
      }

      return res
        .status(200)
        .json({
          success: true,
          message:
            "Order status updated successfully",
          data: {
            order: updatedOrder
          },
          requestId:
            req.requestId
        });
    }

    // Non-cancellation status transitions
    const order =
      await Order.findById(
        orderId
      );

    if (!order) {
      throw new AppError(
        "Order not found",
        404,
        [],
        "ORDER_NOT_FOUND"
      );
    }

    const currentStatus =
      order.status;

    const allowedStatuses =
      ALLOWED_TRANSITIONS[
        currentStatus
      ] || [];

    if (
      !allowedStatuses.includes(
        status
      )
    ) {
      throw new AppError(
        `Cannot change order status from ${currentStatus} to ${status}`,
        400,
        [],
        "INVALID_ORDER_STATUS_TRANSITION"
      );
    }

    order.status =
      status;

    await order.save();

    if (req.user) {
      await recordAdminAuditEvent({
        eventType: AUDIT_EVENT_TYPES.ORDER_STATUS_UPDATED,
        resourceType: "order",
        resourceId: orderId,
        metadata: {
          orderId,
          previousStatus: currentStatus,
          newStatus: status
        },
        req
      }).catch((auditErr) => {
        req.log?.error?.({ err: auditErr }, "Failed to record order status audit log");
      });
    }

    return res
      .status(200)
      .json({
        success: true,
        message:
          "Order status updated successfully",
        data: {
          order
        },
        requestId:
          req.requestId
      });
  } catch (error) {
    next(error);
  }
}

export default updateOrderStatus;