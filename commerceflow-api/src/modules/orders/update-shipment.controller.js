import Order from "./order.model.js";
import AppError from "../../common/errors/app-error.js";
import { recordAdminAuditEvent, AUDIT_EVENT_TYPES } from "../audit/admin-audit.service.js";

async function updateShipment(req, res, next) {
  try {
    if (!req.user || req.user.role !== "admin") {
      throw new AppError(
        "Admin access required",
        403,
        [],
        "ADMIN_ACCESS_REQUIRED"
      );
    }

    const { orderId } = req.params;

    const {
      carrier,
      trackingNumber,
      trackingUrl = "",
      status = "in_transit",
      estimatedDelivery = null
    } = req.body || {};

    const order = await Order.findById(orderId);

    if (!order) {
      throw new AppError(
        "Order not found",
        404,
        [],
        "ORDER_NOT_FOUND"
      );
    }

    if (order.status === "cancelled") {
      throw new AppError(
        "Cannot update shipment for a cancelled order",
        400,
        [],
        "ORDER_CANCELLED"
      );
    }

    const now = new Date();
    const isFirstShipment = !order.shipment;

    const shippedAt = isFirstShipment
      ? now
      : (order.shipment.shippedAt || now);

    let deliveredAt = isFirstShipment ? null : (order.shipment.deliveredAt || null);
    if (status === "delivered" && !deliveredAt) {
      deliveredAt = now;
    }

    let parsedEstimatedDelivery = null;
    if (estimatedDelivery) {
      parsedEstimatedDelivery = new Date(estimatedDelivery);
    }

    order.shipment = {
      carrier,
      trackingNumber,
      trackingUrl: trackingUrl || "",
      status,
      shippedAt,
      estimatedDelivery: parsedEstimatedDelivery,
      deliveredAt,
      updatedAt: now
    };

    await order.save();

    if (req.user) {
      await recordAdminAuditEvent({
        eventType: AUDIT_EVENT_TYPES.SHIPMENT_TRACKING_UPDATED,
        resourceType: "order",
        resourceId: orderId,
        metadata: {
          orderId,
          carrier,
          trackingNumber,
          status
        },
        req
      }).catch((auditErr) => {
        req.log?.error?.({ err: auditErr }, "Failed to record shipment audit log");
      });
    }

    return res.status(200).json({
      success: true,
      message: "Shipment tracking updated successfully",
      data: {
        order
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

export default updateShipment;
