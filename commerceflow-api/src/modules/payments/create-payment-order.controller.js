import Order from "../orders/order.model.js";
import razorpay from "./razorpay.service.js";
import { env } from "../../config/env.js";
import AppError from "../../common/errors/app-error.js";
import { getOrderPayableAmount, toPaise } from "../../utils/pricing.js";

async function createPaymentOrder(req, res, next) {
  try {
    const { orderId } = req.params;

    const order = await Order.findOne({
      _id: orderId,
      user: req.user._id
    });

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
        "Cannot create payment for a cancelled order",
        400,
        [],
        "ORDER_CANCELLED"
      );
    }

    if (order.checkoutState === "in_progress") {
      throw new AppError(
        "Cannot create payment for an order with checkout in progress",
        400,
        [],
        "ORDER_CHECKOUT_IN_PROGRESS"
      );
    }

    if (order.checkoutState === "compensation_pending") {
      throw new AppError(
        "Cannot create payment for an order requiring reconciliation",
        400,
        [],
        "ORDER_COMPENSATION_PENDING"
      );
    }

    if (order.payment.status === "paid") {
      throw new AppError(
        "Order has already been paid",
        400,
        [],
        "ORDER_ALREADY_PAID"
      );
    }

    if (order.payment.status === "refunded") {
      throw new AppError(
        "Cannot create payment for a refunded order",
        400,
        [],
        "ORDER_ALREADY_REFUNDED"
      );
    }

    const payableAmount = getOrderPayableAmount(order);
    const amountInPaise = toPaise(payableAmount);

    if (order.payment.razorpayOrderId) {
      return res.status(200).json({
        success: true,
        message: "Payment order already exists",
        data: {
          razorpayOrderId: order.payment.razorpayOrderId,
          amount: amountInPaise,
          currency: "INR",
          keyId: env.RAZORPAY_KEY_ID
        },
        requestId: req.requestId
      });
    }

    const razorpayOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: order._id.toString()
    });

    order.payment.razorpayOrderId = razorpayOrder.id;

    await order.save();

    return res.status(201).json({
      success: true,
      message: "Payment order created successfully",
      data: {
        razorpayOrderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        keyId: env.RAZORPAY_KEY_ID
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

export default createPaymentOrder;