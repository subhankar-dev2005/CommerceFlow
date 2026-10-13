/**
 * RMA and Order Return Lifecycle Constants
 */

export const RETURN_STATUSES = Object.freeze([
  "requested",
  "approved",
  "rejected",
  "received",
  "completed",
  "cancelled"
]);

export const RETURN_REASONS = Object.freeze([
  "damaged",
  "defective",
  "wrong_item",
  "size_fit",
  "not_as_described",
  "changed_mind",
  "other"
]);

export const RETURN_REASON_LABELS = Object.freeze({
  damaged: "Item Damaged in Transit",
  defective: "Item Defective / Not Working",
  wrong_item: "Received Wrong Item",
  size_fit: "Size / Fit Issue",
  not_as_described: "Item Not as Described",
  changed_mind: "Changed Mind / No Longer Needed",
  other: "Other Reason"
});

/**
 * Authoritative Server-Side State Machine Transitions
 * Transitions not explicitly listed here are strictly forbidden.
 */
export const ALLOWED_RETURN_TRANSITIONS = Object.freeze({
  requested: Object.freeze(["approved", "rejected", "cancelled"]),
  approved: Object.freeze(["received"]),
  received: Object.freeze(["completed"]),
  rejected: Object.freeze([]),
  completed: Object.freeze([]),
  cancelled: Object.freeze([])
});

/**
 * Standard return eligibility window (in days) starting from order delivery date.
 */
export const RETURN_WINDOW_DAYS = 30;

export const REFUND_STATUSES = Object.freeze([
  "not_applicable",
  "pending_manual",
  "requested",
  "pending",
  "succeeded",
  "failed",
  "reconciliation_required",
  "completed"
]);
