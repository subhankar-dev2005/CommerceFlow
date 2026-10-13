import crypto from "crypto";
import Refund from "./refund.model.js";
import FinancialLedger from "./financial-ledger.model.js";
import Order from "../orders/order.model.js";
import Return from "../returns/return.model.js";
import razorpay from "../payments/razorpay.service.js";
import AppError from "../../common/errors/app-error.js";
import { toPaise } from "../../utils/pricing.js";
import { logger } from "../../config/logger.js";
import {
  REFUND_STATUSES,
  ALLOWED_REFUND_TRANSITIONS,
  LEDGER_EVENT_TYPES,
  LEDGER_DIRECTIONS
} from "./refund.constants.js";
import {
  recordAdminAuditEvent,
  AUDIT_EVENT_TYPES
} from "../audit/admin-audit.service.js";

/**
 * Generates an authoritative, sequential/timestamped refund number.
 * Format: RFND-YYYYMMDD-XXXXXX
 */
function generateRefundNumber() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomSuffix = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `RFND-${dateStr}-${randomSuffix}`;
}

/**
 * Verifies whether a status transition is legally permitted by the refund state machine.
 */
export function isValidRefundTransition(currentStatus, targetStatus) {
  if (!currentStatus || !targetStatus) return false;
  const allowed = ALLOWED_REFUND_TRANSITIONS[currentStatus];
  return Array.isArray(allowed) && allowed.includes(targetStatus);
}

/**
 * Distinguishes ambiguous gateway network outcomes (timeouts, socket disconnects)
 * from definite gateway rejections (bad request, invalid state, etc.).
 */
export function isAmbiguousGatewayError(err) {
  if (!err) return false;
  const code = err.code || "";
  const message = err.message || "";
  const ambiguousCodes = [
    "ETIMEDOUT",
    "ESOCKETTIMEDOUT",
    "ECONNRESET",
    "ECONNREFUSED",
    "EHOSTUNREACH",
    "EAI_AGAIN",
    "EPIPE"
  ];
  if (ambiguousCodes.includes(code)) return true;
  if (/timeout|socket hang up|network error|connection reset|client network socket disconnected/i.test(message)) {
    return true;
  }
  const statusCode = err.statusCode || err.status;
  if ([502, 503, 504].includes(statusCode)) return true;
  return false;
}

/**
 * Initiates an authoritative payment refund for an eligible, completed RMA Return.
 *
 * Invariants:
 * 1. Server-authoritative refund amount derived directly from Return.totalRefundAmount.
 * 2. Strict idempotency enforcement via unique database constraints.
 * 3. Atomic state management preventing concurrent double-refunds.
 * 4. Immutable financial ledger entries recording every state transition.
 * 5. Full gateway reconciliation with failure/timeout recovery.
 *
 * @param {Object} params
 * @param {string} params.returnId - Target completed Return ID
 * @param {string} [params.reasonDetail] - Optional operational explanation
 * @param {Object} params.adminUser - Authenticated admin user initiating the refund
 * @param {Object} [params.req] - Express request object for audit logging
 * @returns {Promise<Object>} Processed Refund document
 */
export async function initiateReturnRefund({
  returnId,
  reasonDetail = "",
  adminUser,
  req
}) {
  if (!adminUser || !adminUser._id) {
    throw new AppError("Authoritative admin user is required to initiate a refund", 401, [], "UNAUTHORIZED");
  }

  // 1. Fetch return record
  const returnDoc = await Return.findById(returnId);
  if (!returnDoc) {
    throw new AppError("Return record not found", 404, [], "RETURN_NOT_FOUND");
  }

  if (returnDoc.status !== "completed") {
    throw new AppError(
      `Cannot initiate refund for return with status "${returnDoc.status}". Return must be "completed" first.`,
      400,
      [],
      "INVALID_RETURN_STATUS_FOR_REFUND"
    );
  }

  // 2. Fetch associated order
  const order = await Order.findById(returnDoc.orderId);
  if (!order) {
    throw new AppError("Associated order not found", 404, [], "ORDER_NOT_FOUND");
  }

  if (order.payment.status !== "paid" && order.payment.status !== "refunded") {
    throw new AppError(
      `Cannot refund an order with payment status "${order.payment.status}". Payment must be "paid".`,
      400,
      [],
      "PAYMENT_NOT_ELIGIBLE_FOR_REFUND"
    );
  }

  const gatewayPaymentId = order.payment.transactionId;
  if (!gatewayPaymentId || typeof gatewayPaymentId !== "string" || !gatewayPaymentId.trim()) {
    throw new AppError(
      "Authoritative gateway payment transaction ID is missing from order",
      400,
      [],
      "GATEWAY_PAYMENT_ID_MISSING"
    );
  }

  // 3. Server-authoritative amount validation
  const amount = returnDoc.totalRefundAmount;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    throw new AppError(
      `Invalid authoritative refund amount (${amount}) for return ${returnDoc.returnNumber}`,
      400,
      [],
      "INVALID_REFUND_AMOUNT"
    );
  }

  const amountInPaise = toPaise(amount);
  if (!Number.isInteger(amountInPaise) || amountInPaise <= 0) {
    throw new AppError("Computed refund amount in smallest unit (paise) must be a positive integer", 400, [], "INVALID_PAISE_AMOUNT");
  }

  // 4. Idempotency Check: deterministic key per RMA return
  const idempotencyKey = `rma-refund:${returnDoc._id.toString()}`;

  // Check if refund already exists for this return
  const existingRefund = await Refund.findOne({ idempotencyKey });
  if (existingRefund) {
    if (existingRefund.status === "succeeded") {
      return existingRefund;
    }
    if (existingRefund.status === "pending") {
      throw new AppError(
        "A refund for this return is already in progress with the payment gateway",
        409,
        [],
        "REFUND_ALREADY_IN_PROGRESS"
      );
    }
    if (existingRefund.status === "reconciliation_required") {
      throw new AppError(
        "A previous refund attempt for this return requires authoritative reconciliation before proceeding",
        409,
        [{ refundId: existingRefund._id.toString(), status: existingRefund.status }],
        "REFUND_RECONCILIATION_REQUIRED"
      );
    }
    if (existingRefund.status === "failed") {
      throw new AppError(
        `Previous refund attempt failed (${existingRefund.failureReason || "unknown error"}). Please use the retry endpoint.`,
        409,
        [{ refundId: existingRefund._id.toString() }],
        "REFUND_PREVIOUSLY_FAILED"
      );
    }
  }

  // 5. Check remaining refundable balance against committed / in-flight refunds
  const committedRefundsAgg = await Refund.aggregate([
    {
      $match: {
        orderId: order._id,
        returnId: { $ne: returnDoc._id },
        status: { $in: ["requested", "pending", "succeeded", "reconciliation_required"] }
      }
    },
    { $group: { _id: null, total: { $sum: "$amount" } } }
  ]);
  const committedRefundsTotal = committedRefundsAgg[0]?.total || 0;
  const capturedCeilingPaise =
    order.payment?.capturedAmountPaise ||
    (order.payment?.capturedAmount ? toPaise(order.payment.capturedAmount) : toPaise(order.total));
  const capturedCeiling = capturedCeilingPaise / 100;

  const currentRefundedPlusReserved = Math.max(
    committedRefundsTotal,
    ((order.refundSummary?.totalRefundedPaise || 0) + (order.refundSummary?.totalReservedPaise || 0)) / 100
  );
  const remainingRefundable = Math.max(0, Math.round((capturedCeiling - currentRefundedPlusReserved) * 100) / 100);

  if (amount > remainingRefundable) {
    throw new AppError(
      `Refund amount (₹${amount}) exceeds remaining refundable balance (₹${remainingRefundable}) for order #${order._id}`,
      400,
      [{ amount, remainingRefundable, capturedCeiling }],
      "REFUND_EXCEEDS_REMAINING_BALANCE"
    );
  }

  // 6. Concurrency-Safe Atomic Durable Reservation of Refund Amount on Order
  const reservedOrder = await Order.findOneAndUpdate(
    {
      _id: order._id,
      refundReservations: {
        $not: {
          $elemMatch: {
            returnId: returnDoc._id,
            status: "active"
          }
        }
      },
      $expr: {
        $lte: [
          {
            $add: [
              { $ifNull: ["$refundSummary.totalRefundedPaise", 0] },
              { $ifNull: ["$refundSummary.totalReservedPaise", 0] },
              amountInPaise
            ]
          },
          capturedCeilingPaise
        ]
      }
    },
    {
      $inc: {
        "refundSummary.totalReserved": amount,
        "refundSummary.totalReservedPaise": amountInPaise,
        __v: 1
      },
      $push: {
        refundReservations: {
          reservationId: idempotencyKey,
          returnId: returnDoc._id,
          amount,
          amountInPaise,
          status: "active",
          createdAt: new Date()
        }
      }
    },
    { new: true }
  );

  if (!reservedOrder) {
    throw new AppError(
      "A concurrent financial modification conflict occurred on this order. Please retry.",
      409,
      [],
      "CONCURRENT_FINANCIAL_OPERATION_CONFLICT"
    );
  }

  // 6. Create initial Refund record in "requested" state
  let refund;
  const refundNumber = generateRefundNumber();
  try {
    refund = await Refund.create({
      refundNumber,
      orderId: order._id,
      returnId: returnDoc._id,
      customerId: order.user,
      amount,
      amountInPaise,
      currency: "INR",
      reason: `rma_return_${returnDoc.reason}`,
      reasonDetail: reasonDetail.trim(),
      gateway: "razorpay",
      gatewayPaymentId,
      gatewayRefundId: null,
      idempotencyKey,
      status: "requested",
      createdBy: adminUser._id,
      metadata: {
        returnNumber: returnDoc.returnNumber,
        orderId: order._id.toString()
      }
    });
  } catch (err) {
    if (err?.code === 11000) {
      // Concurrency race: another request claimed the idempotency key simultaneously
      const racedRefund = await Refund.findOne({ idempotencyKey });
      if (racedRefund && racedRefund.status === "succeeded") {
        return racedRefund;
      }
      throw new AppError("Concurrent refund attempt detected for this return", 409, [], "REFUND_CONCURRENCY_CONFLICT");
    }
    throw err;
  }

  // 6. Record persistent Audit Log for refund request
  await recordAdminAuditEvent({
    eventType: AUDIT_EVENT_TYPES.REFUND_REQUESTED,
    target: { userId: order.user },
    metadata: {
      refundId: refund._id.toString(),
      refundNumber: refund.refundNumber,
      orderId: order._id.toString(),
      returnId: returnDoc._id.toString(),
      amount: refund.amount,
      currency: refund.currency
    },
    req
  });

  // 7. Write immutable Financial Ledger entry for PAYMENT_REFUND_REQUESTED
  await FinancialLedger.create({
    orderId: order._id,
    returnId: returnDoc._id,
    refundId: refund._id,
    customerId: order.user,
    eventType: LEDGER_EVENT_TYPES.PAYMENT_REFUND_REQUESTED,
    direction: LEDGER_DIRECTIONS.DEBIT,
    amount: refund.amount,
    amountInPaise: refund.amountInPaise,
    currency: "INR",
    gateway: "razorpay",
    gatewayPaymentId,
    gatewayRefundId: null,
    idempotencyKey: `ledger:refund-requested:${refund._id.toString()}`,
    status: "pending",
    actorType: "admin",
    actorId: adminUser._id,
    metadata: {
      refundNumber: refund.refundNumber,
      returnNumber: returnDoc.returnNumber
    }
  });

  // 8. Execute gateway refund workflow
  return await executeGatewayRefund({
    refund,
    returnDoc,
    order,
    adminUser,
    req
  });
}

/**
 * Authoritatively executes the gateway refund call and reconciles state.
 */
async function executeGatewayRefund({
  refund,
  returnDoc,
  order,
  adminUser,
  req
}) {
  // Atomically transition refund to "pending"
  refund.status = "pending";
  await refund.save();

  // Update return status to pending
  await Return.findByIdAndUpdate(returnDoc._id, {
    refundStatus: "pending",
    refundNote: `Automated refund initiated (Refund #${refund.refundNumber})`
  });

  let gatewayResponse = null;

  try {
    // Check if the payment was already refunded before dispatching to gateway
    // Strictly match on unique deterministic references (receipt or notes) — NEVER on amount alone!
    let alreadyRefundedMatch = null;
    try {
      if (typeof razorpay.payments?.fetchMultipleRefund === "function") {
        const existingGatewayRefunds = await razorpay.payments.fetchMultipleRefund(refund.gatewayPaymentId);
        if (existingGatewayRefunds && Array.isArray(existingGatewayRefunds.items)) {
          alreadyRefundedMatch = existingGatewayRefunds.items.find(
            (r) =>
              (r.receipt && r.receipt === refund.refundNumber) ||
              (r.receipt && r.receipt === refund.idempotencyKey) ||
              (r.notes?.refundNumber && r.notes.refundNumber === refund.refundNumber) ||
              (r.notes?.idempotencyKey && r.notes.idempotencyKey === refund.idempotencyKey)
          );
        }
      }
    } catch (checkErr) {
      logger.warn({ err: checkErr }, "Could not check existing gateway refunds before refund dispatch");
    }

    if (alreadyRefundedMatch) {
      gatewayResponse = alreadyRefundedMatch;
    } else {
      // Authoritative Razorpay API refund call
      gatewayResponse = await razorpay.payments.refund(refund.gatewayPaymentId, {
        amount: refund.amountInPaise,
        receipt: refund.refundNumber,
        notes: {
          refundNumber: refund.refundNumber,
          idempotencyKey: refund.idempotencyKey,
          orderId: order._id.toString(),
          returnId: returnDoc._id.toString()
        }
      });
    }

    if (!gatewayResponse || !gatewayResponse.id) {
      throw new Error("Invalid or empty response received from payment gateway");
    }

    // Atomically commit reservation on Order
    await Order.findOneAndUpdate(
      {
        _id: order._id,
        "refundReservations.returnId": returnDoc._id,
        "refundReservations.status": "active"
      },
      {
        $inc: {
          "refundSummary.totalReserved": -refund.amount,
          "refundSummary.totalReservedPaise": -refund.amountInPaise,
          "refundSummary.totalRefunded": refund.amount,
          "refundSummary.totalRefundedPaise": refund.amountInPaise
        },
        $set: {
          "refundReservations.$.status": "committed"
        }
      }
    );

    // Persist Gateway Success
    refund.status = "succeeded";
    refund.gatewayRefundId = gatewayResponse.id;
    refund.failureReason = null;
    refund.reconciliationReason = null;
    refund.metadata = {
      gatewayStatus: gatewayResponse.status || "processed",
      speedProcessed: gatewayResponse.speed_processed || "normal",
      createdAt: gatewayResponse.created_at || Date.now()
    };
    await refund.save();

    // Update Return refundStatus to "succeeded"
    await Return.findByIdAndUpdate(returnDoc._id, {
      refundStatus: "succeeded",
      refundNote: `Gateway refund processed successfully. Gateway Refund ID: ${gatewayResponse.id}`
    });

    // Check if order payment should be updated to "refunded"
    const capturedCeiling =
      order.payment?.capturedAmountPaise ||
      (order.payment?.capturedAmount ? toPaise(order.payment.capturedAmount) : toPaise(order.total));

    const totalRefundedAgg = await Refund.aggregate([
      { $match: { orderId: order._id, status: "succeeded" } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);
    const totalRefundedSoFar = totalRefundedAgg[0]?.total || 0;
    if (toPaise(totalRefundedSoFar) >= capturedCeiling) {
      order.payment.status = "refunded";
      await order.save();
    }

    // Write immutable Financial Ledger entry for PAYMENT_REFUNDED (succeeded)
    await FinancialLedger.create({
      orderId: order._id,
      returnId: returnDoc._id,
      refundId: refund._id,
      customerId: order.user,
      eventType: LEDGER_EVENT_TYPES.PAYMENT_REFUNDED,
      direction: LEDGER_DIRECTIONS.DEBIT,
      amount: refund.amount,
      amountInPaise: refund.amountInPaise,
      currency: "INR",
      gateway: "razorpay",
      gatewayPaymentId: refund.gatewayPaymentId,
      gatewayRefundId: gatewayResponse.id,
      idempotencyKey: `ledger:refund-succeeded:${refund._id.toString()}`,
      status: "succeeded",
      actorType: "admin",
      actorId: adminUser._id,
      metadata: {
        refundNumber: refund.refundNumber,
        gatewayStatus: gatewayResponse.status
      }
    });

    // Persistent audit log: secondary administrative event safely isolated
    // from primary financial ledger and gateway success
    await recordAdminAuditEvent({
      eventType: AUDIT_EVENT_TYPES.REFUND_SUCCEEDED,
      target: { userId: order.user },
      metadata: {
        refundId: refund._id.toString(),
        refundNumber: refund.refundNumber,
        gatewayRefundId: gatewayResponse.id,
        orderId: order._id.toString(),
        returnId: returnDoc._id.toString(),
        amount: refund.amount
      },
      req
    }).catch((auditErr) => {
      logger.error(
        {
          err: auditErr,
          refundId: refund._id,
          refundNumber: refund.refundNumber,
          gatewayRefundId: gatewayResponse.id
        },
        "Failed to record administrative audit log for successful refund"
      );
    });

    return refund;
  } catch (gatewayErr) {
    logger.error(
      {
        err: gatewayErr,
        refundId: refund._id,
        returnId: returnDoc._id,
        gatewayPaymentId: refund.gatewayPaymentId
      },
      "Gateway refund call failed or encountered exception"
    );

    // 1. Post-Gateway Success Database Failure Recovery (P0-4)
    if (gatewayResponse && gatewayResponse.id) {
      logger.fatal(
        {
          refundId: refund._id,
          gatewayRefundId: gatewayResponse.id,
          err: gatewayErr
        },
        "CRITICAL: Gateway refund succeeded on Razorpay but subsequent local processing encountered an error. Transitioning to reconciliation_required."
      );

      try {
        await Refund.findByIdAndUpdate(refund._id, {
          $set: {
            status: "reconciliation_required",
            gatewayRefundId: gatewayResponse.id,
            failureReason: `RECONCILIATION_REQUIRED: Gateway succeeded with ID ${gatewayResponse.id} but local ledger processing encountered error: ${gatewayErr.message}`.slice(0, 500),
            reconciliationReason: "Gateway succeeded but local database update failed. Ready for authoritative reconciliation."
          }
        });
      } catch (saveErr) {
        logger.fatal({ err: saveErr, gatewayRefundId: gatewayResponse.id, refundId: refund._id }, "CRITICAL: Could not persist gatewayRefundId after gateway success");
      }

      throw new AppError(
        "Gateway refund succeeded but local ledger update requires reconciliation",
        500,
        [{ gatewayRefundId: gatewayResponse.id, status: "reconciliation_required" }],
        "REFUND_RECONCILIATION_REQUIRED"
      );
    }

    // 2. Ambiguous Gateway Outcome: Network Timeout or Connection Drop (P0-1)
    if (isAmbiguousGatewayError(gatewayErr)) {
      const ambiguousMessage = gatewayErr.message || "Network timeout or connection drop occurred";
      refund.status = "reconciliation_required";
      refund.failureReason = `AMBIGUOUS_GATEWAY_OUTCOME: ${ambiguousMessage}`.slice(0, 500);
      refund.reconciliationReason = "Network timeout or connection drop occurred during gateway dispatch. Authoritative gateway state unknown.";
      await refund.save();

      await Return.findByIdAndUpdate(returnDoc._id, {
        refundStatus: "reconciliation_required",
        refundNote: "Automated refund outcome ambiguous due to gateway timeout. Operator reconciliation required."
      });

      await FinancialLedger.create({
        orderId: order._id,
        returnId: returnDoc._id,
        refundId: refund._id,
        customerId: order.user,
        eventType: LEDGER_EVENT_TYPES.PAYMENT_REFUND_RECONCILIATION_REQUIRED,
        direction: LEDGER_DIRECTIONS.DEBIT,
        amount: refund.amount,
        amountInPaise: refund.amountInPaise,
        currency: "INR",
        gateway: "razorpay",
        gatewayPaymentId: refund.gatewayPaymentId,
        gatewayRefundId: null,
        idempotencyKey: `ledger:refund-reconcile:${refund._id.toString()}:${refund.retryCount}`,
        status: "reconciliation_required",
        actorType: "admin",
        actorId: adminUser._id,
        metadata: {
          error: ambiguousMessage,
          retryCount: refund.retryCount
        }
      });

      await recordAdminAuditEvent({
        eventType: AUDIT_EVENT_TYPES.REFUND_RECONCILIATION_REQUIRED,
        target: { userId: order.user },
        metadata: {
          refundId: refund._id.toString(),
          refundNumber: refund.refundNumber,
          orderId: order._id.toString(),
          returnId: returnDoc._id.toString(),
          reason: ambiguousMessage
        },
        req
      });

      throw new AppError(
        "Gateway outcome ambiguous due to network timeout or connection reset. Refund marked reconciliation_required to prevent duplicate refunds.",
        504,
        [{ refundId: refund._id.toString(), status: "reconciliation_required" }],
        "GATEWAY_TIMEOUT_RECONCILIATION_REQUIRED"
      );
    }

    // 3. Definite Gateway Rejection / Client Error
    const failureMessage =
      gatewayErr.error?.description ||
      gatewayErr.message ||
      "Payment gateway refund request failed";

    refund.status = "failed";
    refund.failureReason = failureMessage.slice(0, 500);
    await refund.save();

    // Atomically release reservation on Order
    try {
      await Order.findOneAndUpdate(
        {
          _id: order._id,
          "refundReservations.returnId": returnDoc._id,
          "refundReservations.status": "active"
        },
        {
          $inc: {
            "refundSummary.totalReserved": -refund.amount,
            "refundSummary.totalReservedPaise": -refund.amountInPaise
          },
          $set: {
            "refundReservations.$.status": "released"
          }
        }
      );
    } catch (relErr) {
      logger.error({ err: relErr }, "Failed to release refund reservation on definite gateway failure");
    }

    // Update Return refundStatus to "failed" (inventory remains restored and intact!)
    await Return.findByIdAndUpdate(returnDoc._id, {
      refundStatus: "failed",
      refundNote: `Automated gateway refund failed: ${failureMessage.slice(0, 200)}`
    });

    // Record immutable ledger entry for failed refund
    await FinancialLedger.create({
      orderId: order._id,
      returnId: returnDoc._id,
      refundId: refund._id,
      customerId: order.user,
      eventType: LEDGER_EVENT_TYPES.PAYMENT_REFUND_FAILED,
      direction: LEDGER_DIRECTIONS.DEBIT,
      amount: refund.amount,
      amountInPaise: refund.amountInPaise,
      currency: "INR",
      gateway: "razorpay",
      gatewayPaymentId: refund.gatewayPaymentId,
      gatewayRefundId: null,
      idempotencyKey: `ledger:refund-failed:${refund._id.toString()}:${refund.retryCount}`,
      status: "failed",
      actorType: "admin",
      actorId: adminUser._id,
      metadata: {
        error: failureMessage,
        retryCount: refund.retryCount
      }
    });

    // Persistent audit log for failure
    await recordAdminAuditEvent({
      eventType: AUDIT_EVENT_TYPES.REFUND_FAILED,
      target: { userId: order.user },
      metadata: {
        refundId: refund._id.toString(),
        refundNumber: refund.refundNumber,
        orderId: order._id.toString(),
        returnId: returnDoc._id.toString(),
        failureReason: failureMessage
      },
      req
    });

    throw new AppError(
      `Gateway refund processing failed: ${failureMessage}`,
      502,
      [{ failureReason: failureMessage }],
      "GATEWAY_REFUND_FAILED"
    );
  }
}

/**
 * Server-authorized retry of a previously failed refund.
 * Succeeded refunds are terminal and strictly non-retryable.
 * Reconciliation required refunds must be authoritatively reconciled first.
 *
 * @param {Object} params
 * @param {string} params.refundId
 * @param {Object} params.adminUser
 * @param {Object} [params.req]
 * @returns {Promise<Object>} Retried Refund document
 */
export async function retryRefund({ refundId, adminUser, req }) {
  if (!adminUser || !adminUser._id) {
    throw new AppError("Authoritative admin user is required to retry a refund", 401, [], "UNAUTHORIZED");
  }

  const existingRefund = await Refund.findById(refundId);
  if (!existingRefund) {
    throw new AppError("Refund record not found", 404, [], "REFUND_NOT_FOUND");
  }

  if (existingRefund.status === "succeeded") {
    throw new AppError(
      "Cannot retry a refund that has already succeeded. Succeeded refunds are terminal.",
      400,
      [],
      "REFUND_ALREADY_SUCCEEDED"
    );
  }

  if (existingRefund.status === "pending") {
    throw new AppError(
      "Cannot retry a refund that is currently in progress",
      409,
      [],
      "REFUND_IN_PROGRESS"
    );
  }

  if (existingRefund.status === "reconciliation_required") {
    throw new AppError(
      "Cannot retry a refund that requires reconciliation. Please reconcile the gateway state first.",
      409,
      [{ refundId: existingRefund._id.toString(), status: existingRefund.status }],
      "REFUND_RECONCILIATION_REQUIRED"
    );
  }

  if (existingRefund.status !== "failed") {
    throw new AppError(
      `Only failed refunds can be retried; current status is "${existingRefund.status}"`,
      400,
      [],
      "INVALID_REFUND_STATUS_FOR_RETRY"
    );
  }

  const order = await Order.findById(existingRefund.orderId);
  if (!order) {
    throw new AppError("Associated order not found", 404, [], "ORDER_NOT_FOUND");
  }

  const capturedCeilingPaise =
    order.payment?.capturedAmountPaise ||
    (order.payment?.capturedAmount ? toPaise(order.payment.capturedAmount) : toPaise(order.total));

  // Re-reserve atomically on Order
  const reReserved = await Order.findOneAndUpdate(
    {
      _id: order._id,
      refundReservations: {
        $not: {
          $elemMatch: {
            returnId: existingRefund.returnId,
            status: "active"
          }
        }
      },
      $expr: {
        $lte: [
          {
            $add: [
              { $ifNull: ["$refundSummary.totalRefundedPaise", 0] },
              { $ifNull: ["$refundSummary.totalReservedPaise", 0] },
              existingRefund.amountInPaise
            ]
          },
          capturedCeilingPaise
        ]
      }
    },
    {
      $inc: {
        "refundSummary.totalReserved": existingRefund.amount,
        "refundSummary.totalReservedPaise": existingRefund.amountInPaise,
        __v: 1
      },
      $push: {
        refundReservations: {
          reservationId: `${existingRefund.idempotencyKey}:retry:${existingRefund.retryCount + 1}`,
          returnId: existingRefund.returnId,
          amount: existingRefund.amount,
          amountInPaise: existingRefund.amountInPaise,
          status: "active",
          createdAt: new Date()
        }
      }
    },
    { new: true }
  );

  if (!reReserved) {
    throw new AppError(
      "Cannot retry refund: balance exceeded or active reservation already in progress",
      409,
      [],
      "REFUND_RESERVATION_CONFLICT"
    );
  }

  // Atomically claim retry transition: failed -> pending
  const claimedRefund = await Refund.findOneAndUpdate(
    { _id: refundId, status: "failed" },
    {
      $set: {
        status: "pending",
        lastRetriedAt: new Date()
      },
      $inc: { retryCount: 1 }
    },
    { new: true }
  );

  if (!claimedRefund) {
    throw new AppError("Concurrent retry attempt detected for this refund", 409, [], "REFUND_CONCURRENCY_CONFLICT");
  }

  // Persistent audit log for retry request
  await recordAdminAuditEvent({
    eventType: AUDIT_EVENT_TYPES.REFUND_RETRY_REQUESTED,
    target: { userId: claimedRefund.customerId },
    metadata: {
      refundId: claimedRefund._id.toString(),
      refundNumber: claimedRefund.refundNumber,
      retryCount: claimedRefund.retryCount
    },
    req
  });

  const returnDoc = claimedRefund.returnId ? await Return.findById(claimedRefund.returnId) : null;

  return await executeGatewayRefund({
    refund: claimedRefund,
    returnDoc: returnDoc || { _id: claimedRefund.returnId, refundNumber: claimedRefund.refundNumber },
    order,
    adminUser,
    req
  });
}

/**
 * Authoritative operator reconciliation of ambiguous or failed refunds.
 * Queries Razorpay using deterministic unique refund references (receipt / notes).
 */
export async function reconcileRefund({ refundId, adminUser, req }) {
  if (!adminUser || !adminUser._id) {
    throw new AppError("Authoritative admin user is required to reconcile a refund", 401, [], "UNAUTHORIZED");
  }

  const existingRefund = await Refund.findById(refundId);
  if (!existingRefund) {
    throw new AppError("Refund record not found", 404, [], "REFUND_NOT_FOUND");
  }

  if (existingRefund.status === "succeeded") {
    return { refund: existingRefund, reconciled: true, outcome: "succeeded" };
  }

  if (existingRefund.status !== "reconciliation_required" && existingRefund.status !== "pending") {
    throw new AppError(
      `Refund with status "${existingRefund.status}" does not require reconciliation`,
      400,
      [],
      "REFUND_NOT_ELIGIBLE_FOR_RECONCILIATION"
    );
  }

  // Atomically claim refund for reconciliation to prevent concurrent operator runs
  const claimedRefund = await Refund.findOneAndUpdate(
    {
      _id: refundId,
      status: { $in: ["reconciliation_required", "pending"] },
      isReconciling: { $ne: true }
    },
    {
      $set: { isReconciling: true }
    },
    { new: true }
  );

  if (!claimedRefund) {
    const existing = await Refund.findById(refundId);
    if (existing?.status === "succeeded") {
      return { refund: existing, reconciled: true, outcome: "succeeded" };
    }
    throw new AppError(
      "A reconciliation operation is already in progress for this refund or it does not require reconciliation.",
      409,
      [],
      "RECONCILIATION_IN_PROGRESS"
    );
  }

  // Load authoritative document with Mongoose methods
  const refund = (await Refund.findById(refundId)) || claimedRefund;
  const order = await Order.findById(refund.orderId);
  const returnDoc = refund.returnId ? await Return.findById(refund.returnId) : null;

  try {
    let matchedGatewayRefund = null;
    let gatewayRefunds = null;
    if (typeof razorpay.payments?.fetchMultipleRefund === "function") {
      gatewayRefunds = await razorpay.payments.fetchMultipleRefund(refund.gatewayPaymentId);
      if (gatewayRefunds && Array.isArray(gatewayRefunds.items)) {
        matchedGatewayRefund = gatewayRefunds.items.find(
          (r) =>
            (refund.gatewayRefundId && r.id === refund.gatewayRefundId) ||
            (r.receipt && r.receipt === refund.refundNumber) ||
            (r.receipt && r.receipt === refund.idempotencyKey) ||
            (r.notes?.refundNumber && r.notes.refundNumber === refund.refundNumber) ||
            (r.notes?.idempotencyKey && r.notes.idempotencyKey === refund.idempotencyKey)
        );
      }
    }

    if (matchedGatewayRefund) {
      // Authoritatively confirmed on gateway: commit reservation on Order
      if (order) {
        await Order.findOneAndUpdate(
          {
            _id: order._id,
            "refundReservations.returnId": refund.returnId,
            "refundReservations.status": "active"
          },
          {
            $inc: {
              "refundSummary.totalReserved": -refund.amount,
              "refundSummary.totalReservedPaise": -refund.amountInPaise,
              "refundSummary.totalRefunded": refund.amount,
              "refundSummary.totalRefundedPaise": refund.amountInPaise
            },
            $set: {
              "refundReservations.$.status": "committed"
            }
          }
        );
      }

      refund.status = "succeeded";
      refund.gatewayRefundId = matchedGatewayRefund.id;
      refund.failureReason = null;
      refund.reconciliationReason = "Authoritatively reconciled: Confirmed successful on payment gateway.";
      refund.reconciledAt = new Date();
      refund.isReconciling = false;
      refund.metadata = {
        ...refund.metadata,
        gatewayStatus: matchedGatewayRefund.status || "processed",
        reconciled: true
      };
      await refund.save();

      if (returnDoc) {
        await Return.findByIdAndUpdate(returnDoc._id, {
          refundStatus: "succeeded",
          refundNote: `Authoritatively reconciled with Gateway Refund ID: ${matchedGatewayRefund.id}`
        });
      }

      if (order) {
        const capturedCeiling =
          order.payment?.capturedAmountPaise ||
          (order.payment?.capturedAmount ? toPaise(order.payment.capturedAmount) : toPaise(order.total));

        const totalRefundedAgg = await Refund.aggregate([
          { $match: { orderId: order._id, status: "succeeded" } },
          { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);
        const totalRefundedSoFar = totalRefundedAgg[0]?.total || 0;
        if (toPaise(totalRefundedSoFar) >= capturedCeiling) {
          order.payment.status = "refunded";
          await order.save();
        }
      }

      // Idempotent ledger key based strictly on refundId
      try {
        await FinancialLedger.create({
          orderId: refund.orderId,
          returnId: refund.returnId,
          refundId: refund._id,
          customerId: refund.customerId,
          eventType: LEDGER_EVENT_TYPES.PAYMENT_REFUND_RECONCILED,
          direction: LEDGER_DIRECTIONS.DEBIT,
          amount: refund.amount,
          amountInPaise: refund.amountInPaise,
          currency: refund.currency,
          gateway: "razorpay",
          gatewayPaymentId: refund.gatewayPaymentId,
          gatewayRefundId: matchedGatewayRefund.id,
          idempotencyKey: `ledger:refund-reconciled:${refund._id.toString()}`,
          status: "succeeded",
          actorType: "admin",
          actorId: adminUser._id,
          metadata: {
            refundNumber: refund.refundNumber,
            reconciled: true,
            gatewayStatus: matchedGatewayRefund.status
          }
        });
      } catch (ledgerErr) {
        if (ledgerErr?.code !== 11000) throw ledgerErr;
      }

      await recordAdminAuditEvent({
        eventType: AUDIT_EVENT_TYPES.REFUND_RECONCILED,
        target: { userId: refund.customerId },
        metadata: {
          refundId: refund._id.toString(),
          refundNumber: refund.refundNumber,
          gatewayRefundId: matchedGatewayRefund.id,
          outcome: "succeeded"
        },
        req
      });

      return { refund, reconciled: true, outcome: "succeeded" };
    } else {
      // Incomplete list check
      if (gatewayRefunds && gatewayRefunds.count > (gatewayRefunds.items?.length || 0)) {
        refund.isReconciling = false;
        await refund.save();
        throw new AppError(
          "Authoritative gateway refund list is incomplete/paginated. Operator manual verification required.",
          502,
          [],
          "RECONCILIATION_INCOMPLETE"
        );
      }

      // Authoritatively confirmed NOT on gateway: release reservation on Order
      if (order) {
        await Order.findOneAndUpdate(
          {
            _id: order._id,
            "refundReservations.returnId": refund.returnId,
            "refundReservations.status": "active"
          },
          {
            $inc: {
              "refundSummary.totalReserved": -refund.amount,
              "refundSummary.totalReservedPaise": -refund.amountInPaise
            },
            $set: {
              "refundReservations.$.status": "released"
            }
          }
        );
      }

      refund.status = "failed";
      refund.failureReason = "Authoritative reconciliation: Gateway confirmed refund was not processed.";
      refund.reconciliationReason = "Reconciled against gateway: No record found. Safe for admin retry.";
      refund.reconciledAt = new Date();
      refund.isReconciling = false;
      await refund.save();

      if (returnDoc) {
        await Return.findByIdAndUpdate(returnDoc._id, {
          refundStatus: "failed",
          refundNote: "Reconciliation complete: Gateway confirmed no refund was processed. Ready for retry."
        });
      }

      try {
        await FinancialLedger.create({
          orderId: refund.orderId,
          returnId: refund.returnId,
          refundId: refund._id,
          customerId: refund.customerId,
          eventType: LEDGER_EVENT_TYPES.PAYMENT_REFUND_FAILED,
          direction: LEDGER_DIRECTIONS.DEBIT,
          amount: refund.amount,
          amountInPaise: refund.amountInPaise,
          currency: refund.currency,
          gateway: "razorpay",
          gatewayPaymentId: refund.gatewayPaymentId,
          gatewayRefundId: null,
          idempotencyKey: `ledger:refund-reconciled-failed:${refund._id.toString()}`,
          status: "failed",
          actorType: "admin",
          actorId: adminUser._id,
          metadata: {
            refundNumber: refund.refundNumber,
            reconciled: true,
            outcome: "not_found"
          }
        });
      } catch (ledgerErr) {
        if (ledgerErr?.code !== 11000) throw ledgerErr;
      }

      await recordAdminAuditEvent({
        eventType: AUDIT_EVENT_TYPES.REFUND_RECONCILED,
        target: { userId: refund.customerId },
        metadata: {
          refundId: refund._id.toString(),
          refundNumber: refund.refundNumber,
          outcome: "failed"
        },
        req
      });

      return { refund, reconciled: true, outcome: "failed" };
    }
  } catch (err) {
    // Ensure lock is cleared if unexpected error occurs
    await Refund.findByIdAndUpdate(refundId, { $set: { isReconciling: false } });
    throw err;
  }
}

/**
 * Admin: List refunds with bounded pagination and filtering.
 */
export async function listAdminRefunds({
  page = 1,
  limit = 10,
  status,
  orderId,
  returnId,
  customerId,
  gateway,
  search,
  sortBy = "createdAt",
  sortOrder = "desc",
  dateFrom,
  dateTo
}) {
  const boundedPage = Math.max(1, parseInt(page, 10) || 1);
  const boundedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
  const skip = (boundedPage - 1) * boundedLimit;

  const filter = {};

  if (status && REFUND_STATUSES.includes(status)) {
    filter.status = status;
  }

  if (orderId) {
    filter.orderId = orderId;
  }

  if (returnId) {
    filter.returnId = returnId;
  }

  if (customerId) {
    filter.customerId = customerId;
  }

  if (gateway) {
    filter.gateway = gateway;
  }

  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
    if (dateTo) filter.createdAt.$lte = new Date(dateTo);
  }

  if (search && typeof search === "string" && search.trim()) {
    const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const s = escapeRegex(search.trim());
    filter.$or = [
      { refundNumber: { $regex: s, $options: "i" } },
      { gatewayPaymentId: { $regex: s, $options: "i" } },
      { gatewayRefundId: { $regex: s, $options: "i" } }
    ];
  }

  const sortDirections = { asc: 1, desc: -1 };
  const sortDirection = sortDirections[sortOrder] || -1;
  const validSortFields = ["createdAt", "amount", "status", "refundNumber"];
  const sortField = validSortFields.includes(sortBy) ? sortBy : "createdAt";

  const [total, refunds] = await Promise.all([
    Refund.countDocuments(filter),
    Refund.find(filter)
      .sort({ [sortField]: sortDirection })
      .skip(skip)
      .limit(boundedLimit)
      .populate("customerId", "name email")
      .populate("orderId", "_id status total payment.status")
      .populate("returnId", "_id returnNumber status")
      .lean()
  ]);

  return {
    refunds,
    pagination: {
      page: boundedPage,
      limit: boundedLimit,
      total,
      totalPages: Math.ceil(total / boundedLimit) || 1
    }
  };
}

/**
 * Admin: Get refund details by ID including associated financial ledger entries.
 */
export async function getAdminRefundById(refundId) {
  const refund = await Refund.findById(refundId)
    .populate("customerId", "name email")
    .populate("orderId", "_id status total payment.status payment.transactionId")
    .populate("returnId", "_id returnNumber status totalRefundAmount")
    .populate("createdBy", "name email role")
    .lean();

  if (!refund) {
    throw new AppError("Refund record not found", 404, [], "REFUND_NOT_FOUND");
  }

  // Fetch immutable ledger entries for full reconciliation history
  const ledgerEntries = await FinancialLedger.find({
    $or: [{ refundId: refund._id }, { orderId: refund.orderId?._id || refund.orderId }]
  })
    .sort({ createdAt: 1 })
    .lean();

  return {
    refund,
    ledgerEntries
  };
}
