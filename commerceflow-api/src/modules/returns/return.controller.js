import Return from "./return.model.js";
import Order from "../orders/order.model.js";
import AppError from "../../common/errors/app-error.js";
import {
  RETURN_WINDOW_DAYS,
  ALLOWED_RETURN_TRANSITIONS
} from "./return.constants.js";
import { restoreReturnInventory } from "./return-inventory.service.js";
import {
  recordAdminAuditEvent,
  AUDIT_EVENT_TYPES
} from "../audit/admin-audit.service.js";
import { logger } from "../../config/logger.js";

/**
 * Customer: Request an RMA return for an eligible delivered order.
 */
export async function createReturn(req, res, next) {
  try {
    const { orderId } = req.params;
    const { reason, customerNote = "", items } = req.body;

    const order = await Order.findById(orderId);
    if (!order) {
      throw new AppError("Order not found", 404, [], "ORDER_NOT_FOUND");
    }

    // Server-authoritative ownership enforcement (Strictly no IDOR)
    if (order.user.toString() !== req.user._id.toString()) {
      throw new AppError(
        "You are not allowed to return this order",
        403,
        [],
        "ORDER_ACCESS_DENIED"
      );
    }

    if (order.status === "cancelled") {
      throw new AppError(
        "Cancelled orders cannot be returned",
        400,
        [],
        "ORDER_ALREADY_CANCELLED"
      );
    }

    if (order.status !== "delivered") {
      throw new AppError(
        `Orders must be delivered before initiating a return; current status is "${order.status}"`,
        400,
        [],
        "ORDER_NOT_DELIVERED"
      );
    }

    // Verify configurable return policy window
    const deliveryDate =
      order.shipment?.deliveredAt || order.updatedAt || order.createdAt;
    const elapsedDays =
      (Date.now() - new Date(deliveryDate).getTime()) / (1000 * 60 * 60 * 24);

    if (elapsedDays > RETURN_WINDOW_DAYS) {
      throw new AppError(
        `Return window of ${RETURN_WINDOW_DAYS} days has expired for this order`,
        400,
        [],
        "RETURN_WINDOW_EXPIRED"
      );
    }

    // Quantity / Concurrency safety: fetch all active non-terminal returns for this order
    const existingActiveReturns = await Return.find({
      orderId,
      status: { $nin: ["cancelled", "rejected"] }
    }).lean();

    // Sum claimed quantities by composite item key (productId + variantId)
    const claimedMap = new Map();
    for (const ret of existingActiveReturns) {
      for (const item of ret.items) {
        const itemKey = `${item.productId.toString()}_${item.variantId || "root"}`;
        const prevClaimed = claimedMap.get(itemKey) || 0;
        claimedMap.set(itemKey, prevClaimed + item.requestedQuantity);
      }
    }

    // Verify duplicate line items within the current request payload
    const payloadKeySet = new Set();
    for (const item of items) {
      const key = `${item.productId}_${item.variantId || "root"}`;
      if (payloadKeySet.has(key)) {
        throw new AppError(
          "Duplicate item in return request payload",
          400,
          [],
          "DUPLICATE_RETURN_ITEM"
        );
      }
      payloadKeySet.add(key);
    }

    // Snapshot server-authoritative order items and calculate totals
    const snapshottedItems = [];
    let totalRefundAmount = 0;

    for (const requestedItem of items) {
      const orderItem = order.items.find(
        (oi) =>
          oi.product.toString() === requestedItem.productId &&
          (oi.variantId || null) === (requestedItem.variantId || null)
      );

      if (!orderItem) {
        throw new AppError(
          `Item with product ID "${requestedItem.productId}" is not part of this order`,
          400,
          [],
          "ITEM_NOT_IN_ORDER"
        );
      }

      const itemKey = `${requestedItem.productId}_${requestedItem.variantId || "root"}`;
      const alreadyClaimed = claimedMap.get(itemKey) || 0;
      const eligibleReturnQuantity = orderItem.quantity - alreadyClaimed;

      if (requestedItem.quantity > eligibleReturnQuantity) {
        throw new AppError(
          `Requested return quantity (${requestedItem.quantity}) exceeds remaining returnable quantity (${eligibleReturnQuantity}) for "${orderItem.name}"`,
          400,
          [],
          "QUANTITY_EXCEEDS_RETURNABLE"
        );
      }

      // Authoritative pricing from order line item snapshot with proportional discount allocation
      const itemSubtotal = orderItem.price * requestedItem.quantity;
      let itemReturnAmount;
      if (order.subtotal > 0 && order.discountAmount > 0) {
        const discountFactor = Math.max(0, (order.subtotal - order.discountAmount) / order.subtotal);
        itemReturnAmount = Math.round(itemSubtotal * discountFactor * 100) / 100;
      } else {
        itemReturnAmount = itemSubtotal;
      }
      totalRefundAmount += itemReturnAmount;

      snapshottedItems.push({
        productId: orderItem.product,
        variantId: orderItem.variantId || null,
        variantName: orderItem.variantName || null,
        sku: orderItem.sku || null,
        name: orderItem.name,
        price: orderItem.price,
        originalQuantity: orderItem.quantity,
        requestedQuantity: requestedItem.quantity,
        approvedQuantity: null,
        receivedQuantity: null,
        returnAmount: itemReturnAmount,
        inventoryRestored: false,
        restorationKey: null
      });
    }

    // Bound total return refund amount to order paid total
    totalRefundAmount = Math.min(order.total, Math.round(totalRefundAmount * 100) / 100);

    // Optimistic Concurrency Control on Order document to prevent simultaneous over-claim races
    const orderOcc = await Order.findOneAndUpdate(
      { _id: orderId, __v: order.__v },
      { $inc: { __v: 1 } }
    );

    if (!orderOcc) {
      throw new AppError(
        "A concurrent modification conflict occurred on this order. Please refresh and try again.",
        409,
        [],
        "CONCURRENT_RETURN_CONFLICT"
      );
    }

    // Generate human-readable uppercase return number
    const returnNumber = `RET-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    const newReturn = await Return.create({
      returnNumber,
      orderId: order._id,
      customerId: req.user._id,
      status: "requested",
      reason,
      customerNote: customerNote.trim(),
      items: snapshottedItems,
      totalRefundAmount,
      refundStatus: "pending_manual",
      refundNote: "Automatic gateway refund not supported; requires manual financial reconciliation",
      createdBy: req.user._id
    });

    return res.status(201).json({
      success: true,
      message: "Return request submitted successfully",
      data: {
        return: newReturn
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Customer: Get return history for an eligible order.
 */
export async function getOrderReturns(req, res, next) {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order) {
      throw new AppError("Order not found", 404, [], "ORDER_NOT_FOUND");
    }

    if (
      order.user.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      throw new AppError(
        "You are not allowed to view returns for this order",
        403,
        [],
        "ORDER_ACCESS_DENIED"
      );
    }

    const returns = await Return.find({ orderId })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        returns
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Customer & Admin: Inspect a specific return record.
 */
export async function getReturnById(req, res, next) {
  try {
    const { returnId } = req.params;

    const returnDoc = await Return.findById(returnId)
      .populate("orderId", "status total totalQuantity shipment payment")
      .populate("customerId", "name email")
      .lean();

    if (!returnDoc) {
      throw new AppError("Return record not found", 404, [], "RETURN_NOT_FOUND");
    }

    const customerIdStr =
      returnDoc.customerId?._id?.toString() || returnDoc.customerId?.toString();

    if (
      customerIdStr !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      throw new AppError(
        "You are not authorized to access this return record",
        403,
        [],
        "RETURN_ACCESS_DENIED"
      );
    }

    return res.status(200).json({
      success: true,
      data: {
        return: returnDoc
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Customer: Cancel a pending return request.
 */
export async function cancelReturn(req, res, next) {
  try {
    const { returnId } = req.params;

    const returnDoc = await Return.findById(returnId);
    if (!returnDoc) {
      throw new AppError("Return record not found", 404, [], "RETURN_NOT_FOUND");
    }

    if (
      returnDoc.customerId.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      throw new AppError(
        "You are not allowed to cancel this return",
        403,
        [],
        "RETURN_ACCESS_DENIED"
      );
    }

    if (returnDoc.status !== "requested") {
      throw new AppError(
        `Cannot cancel return with status "${returnDoc.status}". Only "requested" returns may be cancelled.`,
        400,
        [],
        "INVALID_RETURN_STATUS_TRANSITION"
      );
    }

    // Atomic conditional status update
    const updatedReturn = await Return.findOneAndUpdate(
      { _id: returnId, status: "requested" },
      {
        $set: {
          status: "cancelled",
          cancelledAt: new Date()
        }
      },
      { new: true }
    );

    if (!updatedReturn) {
      throw new AppError(
        "Return is no longer in requested state",
        400,
        [],
        "INVALID_RETURN_STATUS_TRANSITION"
      );
    }

    return res.status(200).json({
      success: true,
      message: "Return request cancelled successfully",
      data: {
        return: updatedReturn
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: List and filter returns with pagination and deterministic sorting.
 */
export async function adminGetReturns(req, res, next) {
  try {
    const rawPage = parseInt(req.query?.page, 10);
    const page = isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;
    const rawLimit = parseInt(req.query?.limit, 10);
    const limit = isNaN(rawLimit) || rawLimit < 1 ? 10 : Math.min(rawLimit, 100);

    const {
      status,
      orderId,
      customerId,
      search,
      sortBy = "createdAt",
      sortOrder = "desc"
    } = req.query || {};

    const query = {};

    if (status) {
      query.status = status;
    }
    if (orderId) {
      query.orderId = orderId;
    }
    if (customerId) {
      query.customerId = customerId;
    }

    if (search && typeof search === "string" && search.trim()) {
      const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [
        { returnNumber: { $regex: escaped, $options: "i" } }
      ];
    }

    const sortObj = {
      [sortBy]: sortOrder === "asc" ? 1 : -1,
      _id: -1
    };

    const skip = (page - 1) * limit;

    const [total, returns] = await Promise.all([
      Return.countDocuments(query),
      Return.find(query)
        .sort(sortObj)
        .skip(skip)
        .limit(limit)
        .populate("customerId", "name email")
        .lean()
    ]);

    return res.status(200).json({
      success: true,
      data: {
        returns,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: Approve a requested return.
 */
export async function adminApproveReturn(req, res, next) {
  try {
    const { returnId } = req.params;
    const { adminNote = "" } = req.body || {};

    const updated = await Return.findOneAndUpdate(
      { _id: returnId, status: "requested" },
      {
        $set: {
          status: "approved",
          approvedAt: new Date(),
          ...(adminNote ? { adminNote: adminNote.trim() } : {})
        }
      },
      { new: true }
    );

    if (!updated) {
      const existing = await Return.findById(returnId);
      if (!existing) {
        throw new AppError("Return record not found", 404, [], "RETURN_NOT_FOUND");
      }
      throw new AppError(
        `Cannot approve return in status "${existing.status}". Only "requested" returns can be approved.`,
        400,
        [],
        "INVALID_RETURN_STATUS_TRANSITION"
      );
    }

    // Persistent audit log: secondary administrative event safely isolated
    // from primary return mutation
    await recordAdminAuditEvent({
      eventType: AUDIT_EVENT_TYPES.RETURN_APPROVED,
      target: { userId: updated.customerId },
      metadata: {
        returnId: updated._id.toString(),
        returnNumber: updated.returnNumber,
        orderId: updated.orderId.toString(),
        totalRefundAmount: updated.totalRefundAmount
      },
      req
    }).catch((auditErr) => {
      logger.error(
        {
          err: auditErr,
          returnId: updated._id.toString(),
          returnNumber: updated.returnNumber,
          orderId: updated.orderId.toString()
        },
        "Failed to record administrative audit log for return approval"
      );
    });

    return res.status(200).json({
      success: true,
      message: "Return request approved successfully",
      data: {
        return: updated
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: Reject a requested return.
 */
export async function adminRejectReturn(req, res, next) {
  try {
    const { returnId } = req.params;
    const { rejectionReason, adminNote = "" } = req.body || {};

    const updated = await Return.findOneAndUpdate(
      { _id: returnId, status: "requested" },
      {
        $set: {
          status: "rejected",
          rejectedAt: new Date(),
          rejectionReason: rejectionReason.trim(),
          ...(adminNote ? { adminNote: adminNote.trim() } : {})
        }
      },
      { new: true }
    );

    if (!updated) {
      const existing = await Return.findById(returnId);
      if (!existing) {
        throw new AppError("Return record not found", 404, [], "RETURN_NOT_FOUND");
      }
      throw new AppError(
        `Cannot reject return in status "${existing.status}". Only "requested" returns can be rejected.`,
        400,
        [],
        "INVALID_RETURN_STATUS_TRANSITION"
      );
    }

    // Persistent audit log: secondary administrative event safely isolated
    // from primary return mutation
    await recordAdminAuditEvent({
      eventType: AUDIT_EVENT_TYPES.RETURN_REJECTED,
      target: { userId: updated.customerId },
      metadata: {
        returnId: updated._id.toString(),
        returnNumber: updated.returnNumber,
        orderId: updated.orderId.toString(),
        rejectionReason: updated.rejectionReason
      },
      req
    }).catch((auditErr) => {
      logger.error(
        {
          err: auditErr,
          returnId: updated._id.toString(),
          returnNumber: updated.returnNumber,
          orderId: updated.orderId.toString()
        },
        "Failed to record administrative audit log for return rejection"
      );
    });

    return res.status(200).json({
      success: true,
      message: "Return request rejected",
      data: {
        return: updated
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: Mark return items as physically received at facility.
 */
export async function adminReceiveReturn(req, res, next) {
  try {
    const { returnId } = req.params;
    const { adminNote = "" } = req.body || {};

    const updated = await Return.findOneAndUpdate(
      { _id: returnId, status: "approved" },
      {
        $set: {
          status: "received",
          receivedAt: new Date(),
          ...(adminNote ? { adminNote: adminNote.trim() } : {})
        }
      },
      { new: true }
    );

    if (!updated) {
      const existing = await Return.findById(returnId);
      if (!existing) {
        throw new AppError("Return record not found", 404, [], "RETURN_NOT_FOUND");
      }
      throw new AppError(
        `Cannot mark return as received in status "${existing.status}". Return must be "approved" first.`,
        400,
        [],
        "INVALID_RETURN_STATUS_TRANSITION"
      );
    }

    // Persistent audit log
    await recordAdminAuditEvent({
      eventType: AUDIT_EVENT_TYPES.RETURN_RECEIVED,
      target: { userId: updated.customerId },
      metadata: {
        returnId: updated._id.toString(),
        returnNumber: updated.returnNumber,
        orderId: updated.orderId.toString()
      },
      req
    });

    return res.status(200).json({
      success: true,
      message: "Return marked as received",
      data: {
        return: updated
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: Complete the return, safely restocking inventory and updating status.
 */
export async function adminCompleteReturn(req, res, next) {
  try {
    const { returnId } = req.params;
    const { adminNote = "" } = req.body || {};

    const returnDoc = await Return.findById(returnId);
    if (!returnDoc) {
      throw new AppError("Return record not found", 404, [], "RETURN_NOT_FOUND");
    }

    if (returnDoc.status === "completed") {
      return res.status(200).json({
        success: true,
        message: "Return completed successfully",
        data: {
          return: returnDoc
        },
        requestId: req.requestId
      });
    }

    if (returnDoc.status !== "received") {
      throw new AppError(
        `Cannot complete return in status "${returnDoc.status}". Return must be "received" before completion.`,
        400,
        [],
        "INVALID_RETURN_STATUS_TRANSITION"
      );
    }

    // Execute atomic variant-aware inventory restoration
    const restockResult = await restoreReturnInventory({
      returnDoc,
      logger: req.log
    });

    if (!restockResult.success) {
      // Return status remains "received" — no false completion state!
      throw (
        restockResult.error ||
        new AppError(
          "Inventory restoration failed; return could not be completed",
          500,
          [],
          "INVENTORY_RESTOCK_FAILED"
        )
      );
    }

    // Atomically transition status to completed with updated items
    const completedReturn = await Return.findOneAndUpdate(
      { _id: returnId, status: "received" },
      {
        $set: {
          status: "completed",
          completedAt: new Date(),
          items: returnDoc.items,
          ...(adminNote ? { adminNote: adminNote.trim() } : {})
        }
      },
      { new: true }
    );

    if (!completedReturn) {
      // Concurrent completion call already succeeded
      const current = await Return.findById(returnId);
      return res.status(200).json({
        success: true,
        message: "Return completed successfully",
        data: {
          return: current
        },
        requestId: req.requestId
      });
    }

    // Persistent audit log
    await recordAdminAuditEvent({
      eventType: AUDIT_EVENT_TYPES.RETURN_COMPLETED,
      target: { userId: completedReturn.customerId },
      metadata: {
        returnId: completedReturn._id.toString(),
        returnNumber: completedReturn.returnNumber,
        orderId: completedReturn.orderId.toString(),
        restoredItemsCount: restockResult.restoredCount,
        totalRefundAmount: completedReturn.totalRefundAmount
      },
      req
    });

    return res.status(200).json({
      success: true,
      message: "Return completed and inventory successfully restocked",
      data: {
        return: completedReturn
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

export const adminGetReturnById = getReturnById;
