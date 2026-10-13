import { apiClient, ApiError } from '../../lib/apiClient.js';

/**
 * Order Service
 * Communicates with the CommerceFlow Order API endpoints.
 * All order endpoints require authentication.
 */

const VALID_STATUSES = [
  'pending',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
];

/**
 * Validate that an ID is a 24-character hex MongoDB ObjectId.
 * @param {string} id
 * @param {string} fieldName
 * @throws {ApiError}
 */
function validateObjectId(id, fieldName) {
  if (!id || typeof id !== 'string' || !/^[0-9a-fA-F]{24}$/.test(id.trim())) {
    throw new ApiError({
      message: `A valid 24-character ${fieldName} is required`,
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: fieldName, message: `Invalid ${fieldName}` }],
    });
  }
}

/**
 * Create a new order using the authenticated user's active cart and selected shipping address.
 *
 * SERVER-AUTHORITATIVE CONTRACT:
 * The frontend must NOT send cart items, product IDs, quantities, prices, subtotal,
 * total, shipping charges, tax, or payment info.
 * The ONLY business inputs sent to POST /orders are addressId and optional couponCode.
 *
 * @param {string} addressId - 24-character hex address ID
 * @param {string|null} [couponCode] - Optional applied coupon code
 * @returns {Promise<Object>} Created order document
 */
export async function createOrder(addressId, couponCode = null) {
  validateObjectId(addressId, 'addressId');

  const payload = {
    addressId: addressId.trim(),
  };

  if (couponCode && typeof couponCode === 'string' && couponCode.trim()) {
    payload.couponCode = couponCode.trim();
  }

  const response = await apiClient.post('orders', payload);

  return response?.data?.order;
}

/**
 * Fetch paginated orders for the authenticated user.
 *
 * Supported query parameters:
 * - page: integer >= 1 (default 1)
 * - limit: integer 1-100 (default 10)
 * - status: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled'
 * - sortOrder: 'asc' | 'desc' (default 'desc')
 *
 * @param {Object} [params={}]
 * @param {number} [params.page]
 * @param {number} [params.limit]
 * @param {string} [params.status]
 * @param {string} [params.sortOrder]
 * @returns {Promise<{ orders: Array<Object>, pagination: Object }>}
 */
export async function getOrders(params = {}) {
  const queryParts = [];

  if (params && typeof params === 'object') {
    // page
    if (params.page !== undefined && params.page !== null && params.page !== '') {
      const pageNum = parseInt(params.page, 10);
      if (!isNaN(pageNum) && pageNum >= 1) {
        queryParts.push(`page=${pageNum}`);
      }
    }

    // limit
    if (params.limit !== undefined && params.limit !== null && params.limit !== '') {
      const limitNum = parseInt(params.limit, 10);
      if (!isNaN(limitNum) && limitNum >= 1 && limitNum <= 100) {
        queryParts.push(`limit=${limitNum}`);
      }
    }

    // status
    if (params.status && VALID_STATUSES.includes(params.status)) {
      queryParts.push(`status=${encodeURIComponent(params.status)}`);
    }

    // sortOrder
    if (params.sortOrder === 'asc' || params.sortOrder === 'desc') {
      queryParts.push(`sortOrder=${params.sortOrder}`);
    }
  }

  const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
  const response = await apiClient.get(`orders${queryString}`);

  return {
    orders: response?.data?.orders || [],
    pagination: response?.data?.pagination || {
      page: 1,
      limit: 10,
      totalOrders: 0,
      totalPages: 1,
    },
  };
}

/**
 * Fetch a single order by ID with populated items for the authenticated user.
 *
 * @param {string} orderId - 24-character hex order ID
 * @returns {Promise<Object>} Populated order document
 */
export async function getOrderById(orderId) {
  validateObjectId(orderId, 'orderId');

  const cleanId = orderId.trim();
  const response = await apiClient.get(`orders/${encodeURIComponent(cleanId)}`);

  return response?.data?.order;
}

/**
 * Permitted customer cancellation reasons with human-readable labels.
 */
export const CUSTOMER_CANCELLATION_REASONS = Object.freeze([
  { value: 'changed_mind', label: 'Changed my mind' },
  { value: 'ordered_by_mistake', label: 'Ordered by mistake' },
  { value: 'found_better_price', label: 'Found a better price' },
  { value: 'delivery_too_slow', label: 'Delivery is taking too long' },
  { value: 'payment_issue', label: 'Payment issue' },
  { value: 'duplicate_order', label: 'Duplicate order' },
  { value: 'other', label: 'Other' },
]);

/**
 * Human-readable mapping for all system/admin/customer cancellation reasons.
 */
export const CANCELLATION_REASON_LABELS = Object.freeze({
  changed_mind: 'Changed my mind',
  ordered_by_mistake: 'Ordered by mistake',
  found_better_price: 'Found a better price',
  delivery_too_slow: 'Delivery is taking too long',
  payment_issue: 'Payment issue',
  duplicate_order: 'Duplicate order',
  other: 'Other',
  customer_request: 'Customer request',
  item_unavailable: 'Item unavailable',
  fraud_suspected: 'Suspected fraud',
  delivery_address_undeliverable: 'Delivery address is undeliverable',
  payment_dispute: 'Payment dispute',
  system_checkout_failure: 'Checkout could not be completed',
});

/**
 * Get human-readable cancellation reason label with safe fallback to 'Other'.
 * Never returns raw or unknown code.
 * @param {string} reasonCode
 * @returns {string}
 */
export function getCancellationReasonLabel(reasonCode) {
  if (!reasonCode || typeof reasonCode !== 'string') return 'Other';
  return CANCELLATION_REASON_LABELS[reasonCode] || 'Other';
}

/**
 * Human-readable mapping for cancellation actors in customer views.
 */
export const CANCELLATION_ACTOR_LABELS = Object.freeze({
  customer: 'You',
  admin: 'Store',
  system: 'System',
});

/**
 * Get human-readable cancellation actor label.
 * Returns null if missing or unknown (omits actor line).
 * @param {string} actor
 * @returns {string|null}
 */
export function getCancellationActorLabel(actor) {
  if (!actor || typeof actor !== 'string') return null;
  return CANCELLATION_ACTOR_LABELS[actor] || null;
}

/**
 * Cancel an order owned by the authenticated user.
 * The backend verifies ownership, status eligibility (not delivered or cancelled),
 * transitions status to 'cancelled', and automatically restores product inventory stock.
 *
 * SERVER-AUTHORITATIVE CONTRACT:
 * - Customer can supply optional reason and reasonDetail.
 * - Backend defaults reason to 'other' if omitted.
 * - Backend owns cancelledBy ('customer') and cancelledAt (timestamp). Client must NEVER send either.
 *
 * @param {string} orderId - 24-character hex order ID
 * @param {Object} [cancellationData={}]
 * @param {string} [cancellationData.reason] - One of permitted customer cancellation reasons
 * @param {string} [cancellationData.reasonDetail] - Optional detail (max 500 chars)
 * @returns {Promise<Object>} Updated cancelled order document
 */
export async function cancelOrder(orderId, { reason, reasonDetail } = {}) {
  validateObjectId(orderId, 'orderId');

  const cleanId = orderId.trim();
  const payload = {};

  if (reason && typeof reason === 'string' && reason.trim()) {
    payload.reason = reason.trim();
  }

  if (reasonDetail !== undefined && reasonDetail !== null) {
    payload.reasonDetail = typeof reasonDetail === 'string' ? reasonDetail.trim() : '';
  }

  const response = await apiClient.patch(`orders/${encodeURIComponent(cleanId)}/cancel`, payload);

  return response?.data?.order;
}

export const orderService = {
  createOrder,
  getOrders,
  getOrderById,
  cancelOrder,
  CUSTOMER_CANCELLATION_REASONS,
  CANCELLATION_REASON_LABELS,
  CANCELLATION_ACTOR_LABELS,
  getCancellationReasonLabel,
  getCancellationActorLabel,
};

export default orderService;
