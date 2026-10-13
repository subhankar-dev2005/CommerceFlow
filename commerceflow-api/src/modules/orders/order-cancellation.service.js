import mongoose from "mongoose";
import Order from "./order.model.js";
import Product from "../products/product.model.js";
import AppError from "../../common/errors/app-error.js";

export const CANCELLABLE_STATUSES = Object.freeze([
  "pending",
  "confirmed",
  "processing"
]);

/**
 * Checks whether an error signifies an ambiguous transaction commit outcome
 * where the commit state on the database cluster cannot be deterministically known
 * without reconciliation against persisted state.
 *
 * @param {Error} error
 * @returns {boolean}
 */
export function isUnknownCommitError(error) {
  if (!error) return false;
  if (typeof error.hasErrorLabel === "function") {
    if (error.hasErrorLabel("UnknownTransactionCommitResult")) return true;
  }
  const name = error.name || "";
  const message = error.message || "";
  if (
    name === "MongoNetworkTimeoutError" ||
    name === "MongoServerSelectionError" ||
    name === "MongoOperationTimeoutError" ||
    message.includes("timed out") ||
    message.includes("connection reset") ||
    message.includes("ECONNRESET")
  ) {
    return true;
  }
  return false;
}

/**
 * Reconciles an ambiguous commit result by performing a fresh out-of-transaction read
 * against persisted order and restoration manifest state.
 *
 * @param {Object} params
 * @param {string} params.orderId
 * @param {string} params.actor
 * @param {string|null} params.userId
 * @param {Object|null} params.logger
 * @returns {Promise<Object|null>}
 */
export async function reconcileAmbiguousCancellation({
  orderId,
  actor,
  userId = null,
  logger = null
}) {
  try {
    const order = await Order.findById(orderId).select("+cancellationRestoration");
    if (!order) return null;

    if (actor === "customer" && userId && order.user.toString() !== userId.toString()) {
      return null;
    }

    if (
      order.status === "cancelled" &&
      order.cancellationRestoration?.status === "completed" &&
      Array.isArray(order.cancellationRestoration?.items) &&
      order.cancellationRestoration.items.length > 0 &&
      order.cancellationRestoration.items.every((it) => it.status === "restored")
    ) {
      logger?.info?.(
        { orderId },
        "Ambiguous transaction commit reconciled successfully via persisted manifest"
      );
      return order;
    }
    return null;
  } catch (err) {
    logger?.error?.(
      { err, orderId },
      "Failed during ambiguous cancellation reconciliation read"
    );
    return null;
  }
}

/**
 * Executes transactional cancellation with atomic line-by-line inventory restoration
 * and restoration manifest tracking.
 *
 * Guarantees:
 * 1. ACID atomicity across order status transition and all product stock increments.
 * 2. Explicit rollback if any product or variant is missing or update fails.
 * 3. Atomic CAS transition preventing duplicate stock restorations under concurrency.
 * 4. Reconciliation of ambiguous commit errors without speculative fallback increments.
 * 5. Strict preservation of existing error codes and ownership guards.
 *
 * @param {Object} params
 * @param {string} params.orderId
 * @param {"customer"|"admin"} params.actor
 * @param {string} [params.reason="other"]
 * @param {string} [params.reasonDetail=""]
 * @param {string|null} [params.userId=null]
 * @param {Object|null} [params.session=null]
 * @param {Object|null} [params.logger=null]
 * @returns {Promise<Object>} The cancelled order document
 */
export async function cancelOrderWithInventoryRestoration({
  orderId,
  actor,
  reason = "other",
  reasonDetail = "",
  userId = null,
  session: existingSession = null,
  logger = null
}) {
  if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
    throw new AppError("Invalid order ID format", 400, [], "VALIDATION_ERROR");
  }

  if (actor !== "customer" && actor !== "admin") {
    throw new AppError(`Invalid cancellation actor: ${actor}`, 400, [], "VALIDATION_ERROR");
  }

  let session = existingSession;
  let isExternalSession = Boolean(existingSession);

  if (!session) {
    if (mongoose.connection.readyState !== 1) {
      throw new AppError(
        "Database is unavailable. Cannot execute transactional cancellation.",
        503,
        [],
        "DATABASE_UNAVAILABLE"
      );
    }
    session = await mongoose.startSession();
  } else {
    if (typeof session.withTransaction !== "function") {
      throw new AppError(
        "Invalid transaction session supplied",
        500,
        [],
        "INVALID_TRANSACTION_SESSION"
      );
    }
  }

  let committedOrder = null;

  try {
    try {
      await session.withTransaction(async () => {
        let order = null;

        if (actor === "admin") {
          const updateDoc = {
            $set: {
              status: "cancelled",
              cancellation: {
                reason,
                reasonDetail: reasonDetail || "",
                cancelledBy: "admin",
                cancelledAt: new Date()
              }
            }
          };

          const transitionedOrder = await Order.findOneAndUpdate(
            {
              _id: orderId,
              status: { $in: CANCELLABLE_STATUSES }
            },
            updateDoc,
            { new: true, session }
          );

          if (!transitionedOrder) {
            const existingOrder = await Order.findById(orderId);
            if (!existingOrder) {
              throw new AppError("Order not found", 404, [], "ORDER_NOT_FOUND");
            }
            throw new AppError(
              `Cannot change order status from ${existingOrder.status} to cancelled`,
              400,
              [],
              "INVALID_ORDER_STATUS_TRANSITION"
            );
          }

          order = transitionedOrder;
        } else {
          // actor === "customer"
          const findQuery = Order.findById(orderId);
          let existingOrder = null;
          if (typeof findQuery?.session === "function") {
            existingOrder = await findQuery.session(session).select("+cancellationRestoration");
          } else if (typeof findQuery?.select === "function") {
            existingOrder = await findQuery.select("+cancellationRestoration");
          } else {
            existingOrder = await findQuery;
          }

          if (!existingOrder) {
            throw new AppError("Order not found", 404, [], "ORDER_NOT_FOUND");
          }

          if (userId && existingOrder.user.toString() !== userId.toString()) {
            throw new AppError(
              "You are not allowed to cancel this order",
              403,
              [],
              "ORDER_ACCESS_DENIED"
            );
          }

          if (existingOrder.status === "delivered") {
            throw new AppError(
              "Delivered orders cannot be cancelled",
              400,
              [],
              "ORDER_CANNOT_BE_CANCELLED"
            );
          }

          if (existingOrder.status === "cancelled") {
            throw new AppError(
              "Order is already cancelled",
              400,
              [],
              "ORDER_ALREADY_CANCELLED"
            );
          }

          if (existingOrder.checkoutState === "in_progress") {
            throw new AppError(
              "Cannot cancel an order with checkout in progress",
              400,
              [],
              "ORDER_CHECKOUT_IN_PROGRESS"
            );
          }

          if (existingOrder.checkoutState === "compensation_pending") {
            throw new AppError(
              "Cannot cancel an order requiring reconciliation",
              400,
              [],
              "ORDER_COMPENSATION_PENDING"
            );
          }

          const updateDoc = {
            $set: {
              status: "cancelled",
              cancellation: {
                reason,
                reasonDetail: reasonDetail || "",
                cancelledBy: "customer",
                cancelledAt: new Date()
              }
            }
          };

          const transitionedOrder = await Order.findOneAndUpdate(
            {
              _id: orderId,
              user: userId,
              status: { $nin: ["delivered", "cancelled"] }
            },
            updateDoc,
            { new: true, session }
          );

          if (!transitionedOrder) {
            throw new AppError(
              "Order is already cancelled",
              400,
              [],
              "ORDER_ALREADY_CANCELLED"
            );
          }

          order = transitionedOrder;
        }

        // Validate items & restore inventory line-by-line
        const items = Array.isArray(order.items) ? order.items : [];
        const manifestItems = items.map((item, idx) => ({
          product: item.product?._id || item.product,
          variantId: item.variantId ? item.variantId.trim() : null,
          quantity: item.quantity,
          lineIndex: idx,
          status: "pending",
          restoredAt: null
        }));

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const productId = item.product?._id || item.product;
          const quantity = item.quantity;
          const variantId = item.variantId ? item.variantId.trim() : null;

          if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
            throw new AppError(
              `Invalid product ID at line index ${i}`,
              400,
              [],
              "INVALID_LINE_ITEM"
            );
          }
          if (!Number.isInteger(quantity) || quantity < 1) {
            throw new AppError(
              `Quantity must be a positive integer at line index ${i}`,
              400,
              [],
              "INVALID_LINE_ITEM"
            );
          }
          if (item.variantId !== null && item.variantId !== undefined) {
            if (typeof item.variantId !== "string" || item.variantId.trim().length === 0) {
              throw new AppError(
                `Variant ID must be a non-empty string at line index ${i}`,
                400,
                [],
                "INVALID_LINE_ITEM"
              );
            }
          }

          let stockUpdateResult = null;

          if (variantId) {
            stockUpdateResult = await Product.findOneAndUpdate(
              {
                _id: productId,
                variants: {
                  $elemMatch: {
                    variantId
                  }
                }
              },
              {
                $inc: {
                  "variants.$.stock": quantity
                }
              },
              { session, new: true }
            );

            if (!stockUpdateResult) {
              throw new AppError(
                `Product or variant not found for restoration: ${variantId}`,
                404,
                [],
                "PRODUCT_NOT_FOUND"
              );
            }
          } else {
            stockUpdateResult = await Product.findByIdAndUpdate(
              productId,
              {
                $inc: {
                  stock: quantity
                }
              },
              { session }
            );

            if (!stockUpdateResult) {
              throw new AppError(
                `Product not found for restoration: ${productId}`,
                404,
                [],
                "PRODUCT_NOT_FOUND"
              );
            }
          }

          // Mark specific line index as restored
          manifestItems[i].status = "restored";
          manifestItems[i].restoredAt = new Date();
        }

        // Finalize restoration manifest as completed inside the transaction
        const completedManifest = {
          status: "completed",
          items: manifestItems,
          completedAt: new Date()
        };

        const finalizedOrder = await Order.findOneAndUpdate(
          { _id: orderId, status: "cancelled" },
          {
            $set: {
              cancellationRestoration: completedManifest
            }
          },
          { session, new: true }
        );

        committedOrder = finalizedOrder || order;
      });
    } catch (txError) {
      if (isUnknownCommitError(txError)) {
        logger?.warn?.(
          { err: txError, orderId },
          "Ambiguous transaction commit outcome; initiating reconciliation"
        );

        const reconciled = await reconcileAmbiguousCancellation({
          orderId,
          actor,
          userId,
          logger
        });

        if (reconciled) {
          return reconciled;
        }

        logger?.error?.(
          { orderId },
          "Ambiguous transaction commit reconciliation inconclusive; manual investigation required"
        );

        throw new AppError(
          "Transaction commit outcome was ambiguous and could not be verified. Please retry or contact support.",
          503,
          [],
          "TRANSACTION_COMMIT_AMBIGUOUS"
        );
      }

      // Normal application or transient error caught; rethrow
      throw txError;
    }

    return committedOrder;
  } finally {
    if (!isExternalSession) {
      await session.endSession();
    }
  }
}
