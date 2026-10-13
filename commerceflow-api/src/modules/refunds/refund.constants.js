/**
 * Payment Refunds & Financial Ledger Lifecycle Constants
 */

export const REFUND_STATUSES = Object.freeze([
  "requested",
  "pending",
  "succeeded",
  "failed",
  "reconciliation_required"
]);

/**
 * Authoritative Server-Side State Machine Transitions
 * Succeeded refunds are strictly terminal.
 * Failed refunds may be retried only through the server-authorized retry path.
 * Reconciliation required indicates an ambiguous outcome requiring authoritative reconciliation.
 */
export const ALLOWED_REFUND_TRANSITIONS = Object.freeze({
  requested: Object.freeze(["pending", "failed", "reconciliation_required"]),
  pending: Object.freeze(["succeeded", "failed", "reconciliation_required"]),
  reconciliation_required: Object.freeze(["succeeded", "failed"]),
  failed: Object.freeze(["pending"]),
  succeeded: Object.freeze([])
});

export const LEDGER_EVENT_TYPES = Object.freeze({
  PAYMENT_CAPTURED: "PAYMENT_CAPTURED",
  PAYMENT_FAILED: "PAYMENT_FAILED",
  PAYMENT_REFUND_REQUESTED: "PAYMENT_REFUND_REQUESTED",
  PAYMENT_REFUNDED: "PAYMENT_REFUNDED",
  PAYMENT_REFUND_FAILED: "PAYMENT_REFUND_FAILED",
  PAYMENT_REFUND_PENDING: "PAYMENT_REFUND_PENDING",
  PAYMENT_REFUND_RECONCILIATION_REQUIRED: "PAYMENT_REFUND_RECONCILIATION_REQUIRED",
  PAYMENT_REFUND_RECONCILED: "PAYMENT_REFUND_RECONCILED"
});

export const LEDGER_DIRECTIONS = Object.freeze({
  CREDIT: "credit", // Inflow to merchant (e.g. payment captured)
  DEBIT: "debit"    // Outflow from merchant (e.g. refund)
});

export const FINANCIAL_ACTOR_TYPES = Object.freeze([
  "customer",
  "admin",
  "system",
  "gateway_webhook"
]);

export const SUPPORTED_CURRENCIES = Object.freeze(["INR"]);
