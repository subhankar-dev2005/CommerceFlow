/**
 * Order Cancellation Constants
 * Defines permitted cancellation reasons for customers, admins, and system operations,
 * along with allowed cancellation actor types.
 */

export const CUSTOMER_CANCELLATION_REASONS = Object.freeze([
  "changed_mind",
  "ordered_by_mistake",
  "found_better_price",
  "delivery_too_slow",
  "payment_issue",
  "duplicate_order",
  "other"
]);

export const ADMIN_CANCELLATION_REASONS = Object.freeze([
  "customer_request",
  "item_unavailable",
  "fraud_suspected",
  "delivery_address_undeliverable",
  "payment_dispute",
  "duplicate_order",
  "other"
]);

export const SYSTEM_CANCELLATION_REASONS = Object.freeze([
  "system_checkout_failure"
]);

export const CANCELLATION_ACTORS = Object.freeze([
  "customer",
  "admin",
  "system"
]);
