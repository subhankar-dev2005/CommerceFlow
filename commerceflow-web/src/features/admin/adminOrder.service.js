import { apiClient, ApiError } from '../../lib/apiClient.js';

export const VALID_STATUSES = [
  'pending',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
];

export const VALID_PAYMENT_STATUSES = [
  'pending',
  'paid',
  'failed',
  'refunded',
];

export const VALID_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'subtotal',
  'totalQuantity',
];

/**
 * Valid transitions map aligned with backend updateOrderStatus controller and state machine
 */
export const ALLOWED_STATUS_TRANSITIONS = {
  pending: ['processing', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

/**
 * Validate that an ID is a 24-character hexadecimal MongoDB ObjectId.
 * @param {string} id
 * @param {string} fieldName
 * @throws {ApiError}
 */
function validateObjectId(id, fieldName = 'orderId') {
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
 * Fetch paginated cross-store orders for administrators.
 * Consumes: GET /api/v1/admin/orders
 *
 * @param {Object} [params={}]
 * @param {number} [params.page=1]
 * @param {number} [params.limit=10]
 * @param {'pending'|'confirmed'|'processing'|'shipped'|'delivered'|'cancelled'} [params.status]
 * @param {'pending'|'paid'|'failed'|'refunded'} [params.paymentStatus]
 * @param {string} [params.search] - Exact identifier search (ObjectId, Razorpay Order ID, Transaction ID)
 * @param {'createdAt'|'updatedAt'|'subtotal'|'totalQuantity'} [params.sortBy='createdAt']
 * @param {'asc'|'desc'} [params.sortOrder='desc']
 * @param {Object} [options={}]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ orders: Array<Object>, pagination: { page: number, limit: number, totalOrders: number, totalPages: number } }>}
 */
export async function getOrders(params = {}, { signal } = {}) {
  const queryParts = [];

  if (params && typeof params === 'object') {
    if (params.page !== undefined && params.page !== null && params.page !== '') {
      const pageNum = parseInt(params.page, 10);
      if (!isNaN(pageNum) && pageNum >= 1) {
        queryParts.push(`page=${pageNum}`);
      }
    }

    if (params.limit !== undefined && params.limit !== null && params.limit !== '') {
      const limitNum = parseInt(params.limit, 10);
      if (!isNaN(limitNum) && limitNum >= 1 && limitNum <= 100) {
        queryParts.push(`limit=${limitNum}`);
      }
    }

    if (params.status && VALID_STATUSES.includes(params.status)) {
      queryParts.push(`status=${encodeURIComponent(params.status)}`);
    }

    if (params.paymentStatus && VALID_PAYMENT_STATUSES.includes(params.paymentStatus)) {
      queryParts.push(`paymentStatus=${encodeURIComponent(params.paymentStatus)}`);
    }

    if (typeof params.search === 'string') {
      const trimmedSearch = params.search.trim();
      if (trimmedSearch.length > 0) {
        queryParts.push(`search=${encodeURIComponent(trimmedSearch.slice(0, 100))}`);
      }
    }

    if (params.sortBy && VALID_SORT_FIELDS.includes(params.sortBy)) {
      queryParts.push(`sortBy=${encodeURIComponent(params.sortBy)}`);
    }

    if (params.sortOrder === 'asc' || params.sortOrder === 'desc') {
      queryParts.push(`sortOrder=${params.sortOrder}`);
    }
  }

  const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
  const response = await apiClient.get(`admin/orders${queryString}`, { signal });

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
 * Fetch a single order by ID with populated items for administrative inspection.
 * Consumes: GET /api/v1/orders/:orderId (admin authorization allows viewing any customer's order)
 *
 * @param {string} orderId - 24-character hex order ID
 * @param {Object} [options={}]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<Object>} Populated order document
 */
export async function getOrderById(orderId, { signal } = {}) {
  validateObjectId(orderId, 'order ID');
  const cleanId = orderId.trim();
  const response = await apiClient.get(`orders/${encodeURIComponent(cleanId)}`, { signal });
  return response?.data?.order;
}

/**
 * Approved administrative cancellation reason codes and human-readable labels.
 */
export const ADMIN_CANCELLATION_REASONS = Object.freeze([
  { value: 'customer_request', label: 'Customer request' },
  { value: 'item_unavailable', label: 'Item unavailable' },
  { value: 'fraud_suspected', label: 'Suspected fraud' },
  { value: 'delivery_address_undeliverable', label: 'Delivery address is undeliverable' },
  { value: 'payment_dispute', label: 'Payment dispute' },
  { value: 'duplicate_order', label: 'Duplicate order' },
  { value: 'other', label: 'Other' },
]);

export const ADMIN_CANCELLATION_REASON_LABELS = Object.freeze({
  customer_request: 'Customer request',
  item_unavailable: 'Item unavailable',
  fraud_suspected: 'Suspected fraud',
  delivery_address_undeliverable: 'Delivery address is undeliverable',
  payment_dispute: 'Payment dispute',
  duplicate_order: 'Duplicate order',
  other: 'Other',
  changed_mind: 'Changed my mind',
  ordered_by_mistake: 'Ordered by mistake',
  found_better_price: 'Found a better price',
  delivery_too_slow: 'Delivery is taking too long',
  payment_issue: 'Payment issue',
  system_checkout_failure: 'System checkout failure',
});

/**
 * Human-readable mapping for cancellation actors in admin views.
 */
export const ADMIN_CANCELLATION_ACTOR_LABELS = Object.freeze({
  customer: 'Customer',
  admin: 'Admin',
  system: 'System',
});

/**
 * Get human-readable cancellation reason label with safe fallback to 'Other'.
 * Never returns raw or unknown code.
 * @param {string} reasonCode
 * @returns {string}
 */
export function getAdminCancellationReasonLabel(reasonCode) {
  if (!reasonCode || typeof reasonCode !== 'string') return 'Other';
  return ADMIN_CANCELLATION_REASON_LABELS[reasonCode] || 'Other';
}

/**
 * Get human-readable cancellation actor label in admin views.
 * Returns null if missing or unknown (omits actor line).
 * @param {string} actor
 * @returns {string|null}
 */
export function getAdminCancellationActorLabel(actor) {
  if (!actor || typeof actor !== 'string') return null;
  return ADMIN_CANCELLATION_ACTOR_LABELS[actor] || null;
}

/**
 * Update the operational status of an order.
 * Consumes: PATCH /api/v1/orders/:orderId/status
 *
 * SERVER-AUTHORITATIVE CONTRACT:
 * - When status is 'cancelled', optional reason and reasonDetail may be provided.
 * - Reason defaults to 'other' if omitted.
 * - reasonDetail is trimmed and limited to 500 characters.
 * - Backend owns cancelledBy ('admin') and cancelledAt (timestamp). Client must NEVER send either.
 * - Non-cancellation status updates must send ONLY { status }.
 *
 * @param {string} orderId - 24-character hex order ID
 * @param {string} status - Target order status
 * @param {Object} [cancellationData={}] - Optional cancellation metadata
 * @param {string} [cancellationData.reason] - One of ADMIN_CANCELLATION_REASONS
 * @param {string} [cancellationData.reasonDetail] - Optional detail (max 500 chars)
 * @returns {Promise<Object>} Updated order document
 */
export async function updateOrderStatus(orderId, status, { reason, reasonDetail } = {}) {
  validateObjectId(orderId, 'order ID');

  const cleanStatus = typeof status === 'string' ? status.trim().toLowerCase() : '';
  if (!VALID_STATUSES.includes(cleanStatus)) {
    throw new ApiError({
      message: `Invalid order status: ${status}`,
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'status', message: `Must be one of: ${VALID_STATUSES.join(', ')}` }],
    });
  }

  const cleanId = orderId.trim();
  const payload = {
    status: cleanStatus,
  };

  // Attach cancellation metadata strictly when transitioning to 'cancelled'
  // Backend forbids reason / reasonDetail on non-cancelled status transitions
  if (cleanStatus === 'cancelled') {
    payload.reason = typeof reason === 'string' && reason.trim() ? reason.trim() : 'other';
    if (reasonDetail !== undefined && reasonDetail !== null) {
      payload.reasonDetail = typeof reasonDetail === 'string' ? reasonDetail.trim().slice(0, 500) : '';
    } else {
      payload.reasonDetail = '';
    }
  }

  const response = await apiClient.patch(`orders/${encodeURIComponent(cleanId)}/status`, payload);

  return response?.data?.order;
}

export const VALID_SHIPMENT_STATUSES = [
  'label_created',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'exception',
];

/**
 * Update shipment and tracking information for an order.
 * Consumes: PUT /api/v1/orders/:orderId/shipment
 *
 * @param {string} orderId - 24-character hex order ID
 * @param {Object} shipmentData - Shipment fields (carrier, trackingNumber, trackingUrl, status, estimatedDelivery)
 * @returns {Promise<Object>} Updated order document
 */
export async function updateShipment(orderId, shipmentData) {
  validateObjectId(orderId, 'order ID');

  const cleanId = orderId.trim();
  const payload = {};

  if (shipmentData && typeof shipmentData === 'object') {
    if (typeof shipmentData.carrier === 'string') {
      payload.carrier = shipmentData.carrier.trim();
    }
    if (typeof shipmentData.trackingNumber === 'string') {
      payload.trackingNumber = shipmentData.trackingNumber.trim();
    }
    if (typeof shipmentData.trackingUrl === 'string') {
      payload.trackingUrl = shipmentData.trackingUrl.trim();
    }
    if (typeof shipmentData.status === 'string') {
      payload.status = shipmentData.status.trim();
    }
    if (shipmentData.estimatedDelivery !== undefined) {
      payload.estimatedDelivery = shipmentData.estimatedDelivery
        ? new Date(shipmentData.estimatedDelivery).toISOString()
        : null;
    }
  }

  const response = await apiClient.put(
    `orders/${encodeURIComponent(cleanId)}/shipment`,
    payload
  );

  return response?.data?.order;
}

export const adminOrderService = {
  getOrders,
  getOrderById,
  updateOrderStatus,
  updateShipment,
  ALLOWED_STATUS_TRANSITIONS,
  ADMIN_CANCELLATION_REASONS,
  ADMIN_CANCELLATION_REASON_LABELS,
  ADMIN_CANCELLATION_ACTOR_LABELS,
  getAdminCancellationReasonLabel,
  getAdminCancellationActorLabel,
  VALID_STATUSES,
  VALID_SHIPMENT_STATUSES,
  VALID_PAYMENT_STATUSES,
  VALID_SORT_FIELDS,
};

export default adminOrderService;
