import mongoose from "mongoose";
import {
  RETURN_STATUSES,
  RETURN_REASONS,
  REFUND_STATUSES
} from "./return.constants.js";

const returnItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true
    },
    variantId: {
      type: String,
      trim: true,
      default: null
    },
    variantName: {
      type: String,
      trim: true,
      default: null
    },
    sku: {
      type: String,
      trim: true,
      default: null
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    price: {
      type: Number,
      required: true,
      min: 0
    },
    originalQuantity: {
      type: Number,
      required: true,
      min: 1
    },
    requestedQuantity: {
      type: Number,
      required: true,
      min: 1
    },
    approvedQuantity: {
      type: Number,
      default: null
    },
    receivedQuantity: {
      type: Number,
      default: null
    },
    returnAmount: {
      type: Number,
      required: true,
      min: 0
    },
    inventoryRestored: {
      type: Boolean,
      default: false
    },
    restorationKey: {
      type: String,
      trim: true,
      default: null
    }
  },
  { _id: false }
);

const returnSchema = new mongoose.Schema(
  {
    returnNumber: {
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
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    status: {
      type: String,
      enum: RETURN_STATUSES,
      default: "requested",
      required: true
    },
    reason: {
      type: String,
      enum: RETURN_REASONS,
      required: true
    },
    customerNote: {
      type: String,
      trim: true,
      maxlength: 500,
      default: ""
    },
    adminNote: {
      type: String,
      trim: true,
      maxlength: 500,
      default: ""
    },
    rejectionReason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: ""
    },
    items: {
      type: [returnItemSchema],
      required: true,
      validate: {
        validator: function (items) {
          return Array.isArray(items) && items.length > 0;
        },
        message: "Return must contain at least one item"
      }
    },
    totalRefundAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },
    refundStatus: {
      type: String,
      enum: REFUND_STATUSES,
      default: "pending_manual"
    },
    refundNote: {
      type: String,
      trim: true,
      default: "Gateway refund not automated; requires manual ledger reconciliation"
    },
    requestedAt: {
      type: Date,
      default: Date.now
    },
    approvedAt: {
      type: Date,
      default: null
    },
    rejectedAt: {
      type: Date,
      default: null
    },
    receivedAt: {
      type: Date,
      default: null
    },
    completedAt: {
      type: Date,
      default: null
    },
    cancelledAt: {
      type: Date,
      default: null
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    }
  },
  {
    timestamps: true
  }
);

// Targeted indexes for high-throughput query patterns
returnSchema.index({ customerId: 1, createdAt: -1 });
returnSchema.index({ orderId: 1, createdAt: -1 });
returnSchema.index({ status: 1, createdAt: -1 });
returnSchema.index({ customerId: 1, status: 1, createdAt: -1 });

returnSchema.set("toJSON", {
  transform: function (doc, ret) {
    delete ret.__v;
    return ret;
  }
});

const Return = mongoose.model("Return", returnSchema);

export default Return;
