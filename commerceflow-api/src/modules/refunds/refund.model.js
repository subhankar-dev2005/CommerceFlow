import mongoose from "mongoose";
import {
  REFUND_STATUSES,
  SUPPORTED_CURRENCIES
} from "./refund.constants.js";

const refundSchema = new mongoose.Schema(
  {
    refundNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true
    },
    returnId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Return",
      default: null
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01
    },
    amountInPaise: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: "amountInPaise must be an integer"
      }
    },
    currency: {
      type: String,
      enum: SUPPORTED_CURRENCIES,
      default: "INR",
      required: true
    },
    reason: {
      type: String,
      required: true,
      trim: true
    },
    reasonDetail: {
      type: String,
      trim: true,
      default: ""
    },
    gateway: {
      type: String,
      enum: ["razorpay", "manual"],
      default: "razorpay",
      required: true
    },
    gatewayPaymentId: {
      type: String,
      required: true,
      trim: true
    },
    gatewayRefundId: {
      type: String,
      trim: true,
      default: null
    },
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    status: {
      type: String,
      enum: REFUND_STATUSES,
      default: "requested",
      required: true
    },
    failureReason: {
      type: String,
      trim: true,
      default: null
    },
    reconciliationReason: {
      type: String,
      trim: true,
      default: null
    },
    reconciledAt: {
      type: Date,
      default: null
    },
    reservationId: {
      type: String,
      trim: true,
      default: null
    },
    isReconciling: {
      type: Boolean,
      default: false
    },
    retryCount: {
      type: Number,
      default: 0,
      min: 0
    },
    lastRetriedAt: {
      type: Date,
      default: null
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({})
    }
  },
  {
    timestamps: true
  }
);

// Indexes for evidence-backed query patterns and reconciliation
refundSchema.index({ idempotencyKey: 1 }, { unique: true });
refundSchema.index({ refundNumber: 1 }, { unique: true });
refundSchema.index({ orderId: 1, createdAt: -1 });
refundSchema.index({ returnId: 1, createdAt: -1 });
refundSchema.index({ customerId: 1, createdAt: -1 });
refundSchema.index({ status: 1, createdAt: -1 });
refundSchema.index({ gatewayRefundId: 1 }, { sparse: true });

refundSchema.set("toJSON", {
  transform: function (doc, ret) {
    delete ret.__v;
    return ret;
  }
});

const Refund = mongoose.model("Refund", refundSchema);

export default Refund;
