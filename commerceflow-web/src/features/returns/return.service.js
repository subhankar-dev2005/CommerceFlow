/* global URLSearchParams */
import { apiClient, ApiError } from '../../lib/apiClient.js';

export const RETURN_STATUSES = [
  'requested',
  'approved',
  'rejected',
  'received',
  'completed',
  'cancelled',
];

export const RETURN_REASONS = [
  'damaged',
  'defective',
  'wrong_item',
  'size_fit',
  'not_as_described',
  'changed_mind',
  'other',
];

export const RETURN_REASON_LABELS = {
  damaged: 'Item Damaged in Transit',
  defective: 'Item Defective / Malfunctioning',
  wrong_item: 'Received Wrong Item',
  size_fit: 'Size / Fit Issue',
  not_as_described: 'Item Not as Described',
  changed_mind: 'Changed Mind / No Longer Needed',
  other: 'Other Reason',
};

export const RETURN_STATUS_BADGES = {
  requested: {
    label: 'Return Requested',
    className: 'bg-amber-50 text-amber-800 border-amber-300',
  },
  approved: {
    label: 'Return Approved',
    className: 'bg-blue-50 text-blue-800 border-blue-300',
  },
  rejected: {
    label: 'Return Rejected',
    className: 'bg-rose-50 text-rose-800 border-rose-300',
  },
  received: {
    label: 'Items Received',
    className: 'bg-indigo-50 text-indigo-800 border-indigo-300',
  },
  completed: {
    label: 'Return Completed',
    className: 'bg-emerald-50 text-emerald-800 border-emerald-300',
  },
  cancelled: {
    label: 'Return Cancelled',
    className: 'bg-zinc-100 text-zinc-700 border-zinc-300',
  },
};

export const ALLOWED_RETURN_TRANSITIONS = {
  requested: ['approved', 'rejected', 'cancelled'],
  approved: ['received'],
  received: ['completed'],
  rejected: [],
  completed: [],
  cancelled: [],
};

function validateObjectId(id, fieldName = 'id') {
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
 * Customer: Submit a return request for a delivered order.
 */
export async function requestReturn({ orderId, reason, customerNote = '', items }) {
  validateObjectId(orderId, 'orderId');
  if (!reason || !RETURN_REASONS.includes(reason)) {
    throw new ApiError({
      message: 'A valid return reason is required',
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw new ApiError({
      message: 'At least one item must be selected for return',
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  }

  const response = await apiClient.post(`/orders/${orderId}/returns`, {
    reason,
    customerNote: customerNote.trim(),
    items: items.map((i) => ({
      productId: i.productId,
      variantId: i.variantId || null,
      quantity: Number(i.quantity),
    })),
  });

  return response?.data?.return || response?.data || response;
}

/**
 * Customer & Admin: Fetch returns associated with a specific order.
 */
export async function getOrderReturns(orderId) {
  validateObjectId(orderId, 'orderId');
  const response = await apiClient.get(`/orders/${orderId}/returns`);
  return response?.data?.returns || response?.data || [];
}

/**
 * Customer & Admin: Inspect a specific return record.
 */
export async function getReturnById(returnId) {
  validateObjectId(returnId, 'returnId');
  const response = await apiClient.get(`/returns/${returnId}`);
  return response?.data?.return || response?.data || response;
}

/**
 * Customer: Cancel a pending return request.
 */
export async function cancelReturn(returnId) {
  validateObjectId(returnId, 'returnId');
  const response = await apiClient.post(`/returns/${returnId}/cancel`, {});
  return response?.data?.return || response?.data || response;
}

/**
 * Admin: List all returns with filtering and pagination.
 */
export async function adminGetReturns(params = {}) {
  const query = new URLSearchParams();
  if (params.page) query.append('page', params.page);
  if (params.limit) query.append('limit', params.limit);
  if (params.status) query.append('status', params.status);
  if (params.search) query.append('search', params.search);
  if (params.sortBy) query.append('sortBy', params.sortBy);
  if (params.sortOrder) query.append('sortOrder', params.sortOrder);

  const qs = query.toString();
  const url = qs ? `/admin/returns?${qs}` : '/admin/returns';
  const response = await apiClient.get(url);
  return {
    returns: response?.data?.returns || [],
    pagination: response?.data?.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 },
  };
}

/**
 * Admin: Approve a return request.
 */
export async function adminApproveReturn(returnId, adminNote = '') {
  validateObjectId(returnId, 'returnId');
  const response = await apiClient.patch(`/admin/returns/${returnId}/approve`, {
    adminNote: adminNote.trim(),
  });
  return response?.data?.return || response?.data;
}

/**
 * Admin: Reject a return request.
 */
export async function adminRejectReturn(returnId, rejectionReason, adminNote = '') {
  validateObjectId(returnId, 'returnId');
  if (!rejectionReason || !rejectionReason.trim()) {
    throw new ApiError({
      message: 'A rejection reason is required',
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  }
  const response = await apiClient.patch(`/admin/returns/${returnId}/reject`, {
    rejectionReason: rejectionReason.trim(),
    adminNote: adminNote.trim(),
  });
  return response?.data?.return || response?.data;
}

/**
 * Admin: Mark return items received at facility.
 */
export async function adminReceiveReturn(returnId, adminNote = '') {
  validateObjectId(returnId, 'returnId');
  const response = await apiClient.patch(`/admin/returns/${returnId}/receive`, {
    adminNote: adminNote.trim(),
  });
  return response?.data?.return || response?.data;
}

/**
 * Admin: Complete return and trigger variant-aware inventory restock.
 */
export async function adminCompleteReturn(returnId, adminNote = '') {
  validateObjectId(returnId, 'returnId');
  const response = await apiClient.patch(`/admin/returns/${returnId}/complete`, {
    adminNote: adminNote.trim(),
  });
  return response?.data?.return || response?.data;
}

export const returnService = {
  requestReturn,
  getOrderReturns,
  getReturnById,
  cancelReturn,
  adminGetReturns,
  adminApproveReturn,
  adminRejectReturn,
  adminReceiveReturn,
  adminCompleteReturn,
  RETURN_STATUSES,
  RETURN_REASONS,
  RETURN_REASON_LABELS,
  RETURN_STATUS_BADGES,
  ALLOWED_RETURN_TRANSITIONS,
};

export default returnService;
