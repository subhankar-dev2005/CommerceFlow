import mongoose from "mongoose";
import {
  LEDGER_EVENT_TYPES,
  LEDGER_DIRECTIONS,
  FINANCIAL_ACTOR_TYPES,
  SUPPORTED_CURRENCIES
} from "./refund.constants.js";

const financialLedgerSchema = new mongoose.Schema(
  {
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
    refundId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Refund",
      default: null
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    eventType: {
      type: String,
      enum: Object.values(LEDGER_EVENT_TYPES),
      required: true
    },
    direction: {
      type: String,
      enum: Object.values(LEDGER_DIRECTIONS),
      required: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    amountInPaise: {
      type: Number,
      required: true,
      min: 0,
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
    gateway: {
      type: String,
      enum: ["razorpay", "manual", "system"],
      default: "razorpay",
      required: true
    },
    gatewayPaymentId: {
      type: String,
      trim: true,
      default: null
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
      enum: ["pending", "succeeded", "failed", "reconciliation_required"],
      required: true
    },
    actorType: {
      type: String,
      enum: FINANCIAL_ACTOR_TYPES,
      required: true
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
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
financialLedgerSchema.index({ idempotencyKey: 1 }, { unique: true });
financialLedgerSchema.index({ orderId: 1, createdAt: -1 });
financialLedgerSchema.index({ returnId: 1, createdAt: -1 });
financialLedgerSchema.index({ refundId: 1, createdAt: -1 });
financialLedgerSchema.index({ customerId: 1, createdAt: -1 });
financialLedgerSchema.index({ status: 1, createdAt: -1 });
financialLedgerSchema.index({ gatewayRefundId: 1 }, { sparse: true });

/**
 * Enforce Application-Level Financial Immutability
 *
 * ARCHITECTURAL NOTICE (Production Audit P1-1):
 * These Mongoose pre-hooks enforce strict append-only immutability within the Node.js/Express
 * application runtime across all document and query mutation methods (save, update, delete).
 *
 * LIMITATION & DATABASE BOUNDARY:
 * Native MongoDB driver operations (e.g. `collection.updateOne`, raw MongoDB driver bulkWrites,
 * or direct administrative mongosh sessions) bypass Mongoose middleware hooks.
 * Database-level immutability in production requires dedicated database engine privileges
 * (e.g. read-only database roles or capped/write-once collections).
 */
financialLedgerSchema.pre("save", function () {
  if (!this.isNew) {
    throw new Error("FinancialLedger records are strictly immutable and cannot be updated after creation.");
  }
});

const immutableUpdateOps = [
  "updateOne",
  "updateMany",
  "findOneAndUpdate",
  "replaceOne",
  "deleteOne",
  "deleteMany",
  "findOneAndDelete",
  "findOneAndReplace",
  "findByIdAndUpdate",
  "findByIdAndDelete"
];

for (const op of immutableUpdateOps) {
  financialLedgerSchema.pre(op, function () {
    throw new Error(`FinancialLedger records are strictly immutable. Operation "${op}" is forbidden.`);
  });
}

financialLedgerSchema.set("toJSON", {
  transform: function (doc, ret) {
    delete ret.__v;
    return ret;
  }
});

const FinancialLedger = mongoose.model("FinancialLedger", financialLedgerSchema);

export default FinancialLedger;
