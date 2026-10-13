/* global URLSearchParams */
import { apiClient, ApiError } from '../../lib/apiClient.js';

export const REFUND_STATUSES = [
  'requested',
  'pending',
  'succeeded',
  'failed',
  'reconciliation_required',
];

export const REFUND_STATUS_BADGES = {
  requested: {
    label: 'Refund Requested',
    className: 'bg-amber-50 text-amber-800 border-amber-300',
  },
  pending: {
    label: 'Refund Pending',
    className: 'bg-blue-50 text-blue-800 border-blue-300',
  },
  succeeded: {
    label: 'Refund Succeeded',
    className: 'bg-emerald-50 text-emerald-800 border-emerald-300',
  },
  failed: {
    label: 'Refund Failed',
    className: 'bg-rose-50 text-rose-800 border-rose-300',
  },
  reconciliation_required: {
    label: 'Reconciliation Required',
    className: 'bg-purple-50 text-purple-800 border-purple-300',
  },
};

/**
 * Validate that an ID is a 24-character hexadecimal MongoDB ObjectId.
 */
function validateObjectId(id, fieldName = 'refundId') {
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
 * Fetch paginated refunds list for admin.
 * Consumes: GET /api/v1/admin/refunds
 */
export async function adminGetRefunds(params = {}) {
  const query = new URLSearchParams();

  if (params.page !== undefined && params.page !== null) query.set('page', String(params.page));
  if (params.limit !== undefined && params.limit !== null) query.set('limit', String(params.limit));
  if (params.status && params.status !== 'all') query.set('status', params.status);
  if (params.search && params.search.trim()) query.set('search', params.search.trim());
  if (params.orderId) query.set('orderId', params.orderId.trim());
  if (params.returnId) query.set('returnId', params.returnId.trim());
  if (params.sortBy) query.set('sortBy', params.sortBy);
  if (params.sortOrder) query.set('sortOrder', params.sortOrder);

  const qs = query.toString();
  const url = `/api/v1/admin/refunds${qs ? `?${qs}` : ''}`;
  const response = await apiClient.get(url);
  return response?.data || { refunds: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 1 } };
}

/**
 * Fetch a single refund record by ID including immutable financial ledger entries.
 * Consumes: GET /api/v1/admin/refunds/:refundId
 */
export async function adminGetRefundById(refundId) {
  validateObjectId(refundId, 'refundId');
  const response = await apiClient.get(`/api/v1/admin/refunds/${refundId}`);
  return response?.data || null;
}

/**
 * Server-authorized retry of a previously failed refund.
 * Consumes: POST /api/v1/admin/refunds/:refundId/retry
 */
export async function adminRetryRefund(refundId) {
  validateObjectId(refundId, 'refundId');
  const response = await apiClient.post(`/api/v1/admin/refunds/${refundId}/retry`, {});
  return response?.data || null;
}

/**
 * Authoritative reconciliation of an ambiguous or post-crash refund with the gateway.
 * Consumes: POST /api/v1/admin/refunds/:refundId/reconcile
 */
export async function adminReconcileRefund(refundId) {
  validateObjectId(refundId, 'refundId');
  const response = await apiClient.post(`/api/v1/admin/refunds/${refundId}/reconcile`, {});
  return response?.data || null;
}

/**
 * Initiate an authoritative refund for a completed return.
 * Consumes: POST /api/v1/admin/refunds/returns/:returnId
 */
export async function adminCreateReturnRefund(returnId, reasonDetail = '') {
  validateObjectId(returnId, 'returnId');
  const payload = reasonDetail ? { reasonDetail: String(reasonDetail).trim() } : {};
  const response = await apiClient.post(`/api/v1/admin/refunds/returns/${returnId}`, payload);
  return response?.data || null;
}

export const adminRefundService = {
  adminGetRefunds,
  adminGetRefundById,
  adminRetryRefund,
  adminReconcileRefund,
  adminCreateReturnRefund,
};
