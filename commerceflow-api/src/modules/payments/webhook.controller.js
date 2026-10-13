import crypto from "crypto";

import Order from "../orders/order.model.js";
import WebhookEvent from "./webhook-event.model.js";
import { env } from "../../config/env.js";
import { getOrderPayableAmount, toPaise } from "../../utils/pricing.js";

async function handleRazorpayWebhook(req, res, next) {
  try {
    const signature = req.headers["x-razorpay-signature"];

    if (!signature) {
      return res.status(400).json({
        success: false,
        error: {
          code: "MISSING_WEBHOOK_SIGNATURE",
          message: "Razorpay webhook signature is required",
          details: []
        },
        requestId: req.requestId
      });
    }

    if (!env.RAZORPAY_WEBHOOK_SECRET) {
      return res.status(500).json({
        success: false,
        error: {
          code: "WEBHOOK_SECRET_NOT_CONFIGURED",
          message: "Razorpay webhook secret is not configured",
          details: []
        },
        requestId: req.requestId
      });
    }

    const rawBody = req.rawBody;

if (!rawBody) {
  return res.status(400).json({
    success: false,
    error: {
      code: "MISSING_RAW_BODY",
      message: "Raw webhook body is required",
      details: []
    },
    requestId: req.requestId
  });
}

    const generatedSignature = crypto
      .createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");

    const signatureBuffer = Buffer.from(signature, "utf8");
    const generatedBuffer = Buffer.from(generatedSignature, "utf8");

    if (
      signatureBuffer.length !== generatedBuffer.length ||
      !crypto.timingSafeEqual(
        signatureBuffer,
        generatedBuffer
      )
    ) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_WEBHOOK_SIGNATURE",
          message: "Razorpay webhook signature verification failed",
          details: []
        },
        requestId: req.requestId
      });
    }

    let event;
    try {
      event = JSON.parse(rawBody.toString("utf8"));
    } catch {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_JSON_PAYLOAD",
          message: "Invalid JSON payload in webhook body",
          details: []
        },
        requestId: req.requestId
      });
    }

    const eventId = event?.id;

    if (!eventId) {
      return res.status(400).json({
        success: false,
        error: {
          code: "MISSING_WEBHOOK_EVENT_ID",
          message: "Webhook event ID is required",
          details: []
        },
        requestId: req.requestId
      });
    }

    switch (event.event) {
      case "payment.captured": {
        const paymentEntity =
          event.payload?.payment?.entity;

        const razorpayOrderId =
          paymentEntity?.order_id;

        const paymentId =
          paymentEntity?.id;

        if (!razorpayOrderId || !paymentId) {
          return res.status(400).json({
            success: false,
            error: {
              code: "INVALID_WEBHOOK_PAYLOAD",
              message: "Payment information is missing",
              details: []
            },
            requestId: req.requestId
          });
        }

        const order = await Order.findOne({
          "payment.razorpayOrderId": razorpayOrderId
        });

        if (!order) {
          try {
            await WebhookEvent.create({
              eventId,
              provider: "razorpay",
              event: event.event
            });
          } catch (error) {
            if (error?.code === 11000) {
              return res.status(200).json({
                success: true,
                message: "Webhook already processed"
              });
            }
            throw error;
          }

          return res.status(200).json({
            success: true,
            message: "Webhook received"
          });
        }

        if (order.status === "cancelled") {
          return res.status(400).json({
            success: false,
            error: {
              code: "ORDER_CANCELLED",
              message: "Cannot process payment for a cancelled order",
              details: []
            },
            requestId: req.requestId
          });
        }

        if (order.payment.status === "refunded") {
          return res.status(400).json({
            success: false,
            error: {
              code: "ORDER_ALREADY_REFUNDED",
              message: "Cannot process payment for a refunded order",
              details: []
            },
            requestId: req.requestId
          });
        }

        if (order.checkoutState === "in_progress") {
          return res.status(400).json({
            success: false,
            error: {
              code: "ORDER_CHECKOUT_IN_PROGRESS",
              message: "Cannot process payment for an order with checkout in progress",
              details: []
            },
            requestId: req.requestId
          });
        }

        if (order.checkoutState === "compensation_pending") {
          return res.status(400).json({
            success: false,
            error: {
              code: "ORDER_COMPENSATION_PENDING",
              message: "Cannot process payment for an order requiring reconciliation",
              details: []
            },
            requestId: req.requestId
          });
        }

        const payableAmount = getOrderPayableAmount(order);
        const expectedAmount = toPaise(payableAmount);

        if (
          paymentEntity.amount !== expectedAmount ||
          paymentEntity.currency !== "INR"
        ) {
          return res.status(400).json({
            success: false,
            error: {
              code: "PAYMENT_AMOUNT_MISMATCH",
              message: "Payment amount or currency does not match the order",
              details: []
            },
            requestId: req.requestId
          });
        }

        // Atomically claim eventId BEFORE mutating order to guarantee idempotency and prevent concurrent duplicate mutation races
        let claimedEvent;
        try {
          claimedEvent = await WebhookEvent.create({
            eventId,
            provider: "razorpay",
            event: event.event
          });
        } catch (claimError) {
          if (claimError?.code === 11000) {
            return res.status(200).json({
              success: true,
              message: "Webhook already processed"
            });
          }
          throw claimError;
        }

        try {
          if (order.payment.status !== "paid") {
            order.payment.status = "paid";
            order.payment.transactionId = paymentId;
            order.payment.capturedAmount = paymentEntity.amount / 100;
            order.payment.capturedAmountPaise = paymentEntity.amount;

            if (order.status === "pending") {
              order.status = "confirmed";
            }

            await order.save();
          }
        } catch (mutationError) {
          await WebhookEvent.deleteOne({ _id: claimedEvent._id }).catch(() => {});
          throw mutationError;
        }

        break;
      }

      case "payment.failed": {
        const paymentEntity =
          event.payload?.payment?.entity;

        const razorpayOrderId =
          paymentEntity?.order_id;

        if (razorpayOrderId) {
          const order = await Order.findOne({
            "payment.razorpayOrderId": razorpayOrderId
          });

          if (order && order.payment.status !== "paid") {
            let claimedEvent;
            try {
              claimedEvent = await WebhookEvent.create({
                eventId,
                provider: "razorpay",
                event: event.event
              });
            } catch (claimError) {
              if (claimError?.code === 11000) {
                return res.status(200).json({
                  success: true,
                  message: "Webhook already processed"
                });
              }
              throw claimError;
            }

            try {
              order.payment.status = "failed";
              await order.save();
            } catch (mutationError) {
              await WebhookEvent.deleteOne({ _id: claimedEvent._id }).catch(() => {});
              throw mutationError;
            }

            return res.status(200).json({
              success: true,
              message: "Webhook processed successfully"
            });
          }
        }

        break;
      }

      default: {
        try {
          await WebhookEvent.create({
            eventId,
            provider: "razorpay",
            event: event.event
          });
        } catch (claimError) {
          if (claimError?.code === 11000) {
            return res.status(200).json({
              success: true,
              message: "Webhook already processed"
            });
          }
          throw claimError;
        }
        break;
      }
    }

    return res.status(200).json({
      success: true,
      message: "Webhook processed successfully"
    });
  } catch (error) {
    next(error);
  }
}

export default handleRazorpayWebhook;