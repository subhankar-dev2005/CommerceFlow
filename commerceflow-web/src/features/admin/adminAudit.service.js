import { apiClient } from '../../lib/apiClient.js';

export const VALID_AUDIT_EVENT_TYPES = [
  'all',
  'ADMIN_USER_CREATED',
  'ADMIN_USER_STATUS_UPDATED',
  'ADMIN_USER_ROLE_UPDATED',
  'ADMIN_CUSTOMER_STATUS_UPDATED',
  'PRODUCT_CREATED',
  'PRODUCT_UPDATED',
  'PRODUCT_STATUS_UPDATED',
  'PRODUCT_DELETED',
  'INVENTORY_ADJUSTED',
  'ORDER_STATUS_UPDATED',
  'SHIPMENT_TRACKING_UPDATED',
  'RETURN_APPROVED',
  'RETURN_REJECTED',
  'RETURN_RECEIVED',
  'RETURN_COMPLETED',
  'REFUND_REQUESTED',
  'REFUND_SUCCEEDED',
  'REFUND_FAILED',
];

// Active in-flight admin audit requests for deduplication
const inFlightAuditRequests = new Map();

/**
 * Clear in-flight admin audit requests (primarily for testing and reset handlers).
 */
export function clearAdminAuditInFlightRequests() {
  inFlightAuditRequests.clear();
}

/**
 * Fetch paginated administrative audit logs.
 * Consumes: GET /api/v1/admin/audit-logs
 *
 * @param {Object} [params={}]
 * @param {number} [params.page=1]
 * @param {number} [params.limit=10]
 * @param {string} [params.eventType='all']
 * @param {string} [params.actorUserId]
 * @param {string} [params.targetUserId]
 * @param {string} [params.resourceType]
 * @param {string} [params.resourceId]
 * @param {string} [params.startDate]
 * @param {string} [params.endDate]
 * @param {Object} [options={}]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ auditLogs: Array<Object>, pagination: Object }>}
 */
export async function getAdminAuditLogs(params = {}, { signal } = {}) {
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
      if (!isNaN(limitNum) && limitNum >= 1 && limitNum <= 50) {
        queryParts.push(`limit=${limitNum}`);
      }
    }

    if (
      params.eventType &&
      typeof params.eventType === 'string' &&
      params.eventType !== 'all'
    ) {
      queryParts.push(`eventType=${encodeURIComponent(params.eventType.trim())}`);
    }

    if (params.actorUserId && typeof params.actorUserId === 'string') {
      const trimmed = params.actorUserId.trim();
      if (/^[0-9a-fA-F]{24}$/.test(trimmed)) {
        queryParts.push(`actorUserId=${encodeURIComponent(trimmed)}`);
      }
    }

    if (params.targetUserId && typeof params.targetUserId === 'string') {
      const trimmed = params.targetUserId.trim();
      if (/^[0-9a-fA-F]{24}$/.test(trimmed)) {
        queryParts.push(`targetUserId=${encodeURIComponent(trimmed)}`);
      }
    }

    if (params.resourceType && typeof params.resourceType === 'string') {
      const trimmed = params.resourceType.trim();
      if (trimmed) {
        queryParts.push(`resourceType=${encodeURIComponent(trimmed)}`);
      }
    }

    if (params.resourceId && typeof params.resourceId === 'string') {
      const trimmed = params.resourceId.trim();
      if (trimmed) {
        queryParts.push(`resourceId=${encodeURIComponent(trimmed)}`);
      }
    }

    if (params.startDate && typeof params.startDate === 'string') {
      queryParts.push(`startDate=${encodeURIComponent(params.startDate.trim())}`);
    }

    if (params.endDate && typeof params.endDate === 'string') {
      queryParts.push(`endDate=${encodeURIComponent(params.endDate.trim())}`);
    }
  }

  const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
  const endpoint = `admin/audit-logs${queryString}`;

  if (inFlightAuditRequests.has(endpoint)) {
    return inFlightAuditRequests.get(endpoint);
  }

  const promise = (async () => {
    try {
      const response = await apiClient.get(endpoint, { signal });

      return {
        auditLogs: response?.data?.auditLogs || [],
        pagination: response?.data?.pagination || {
          page: 1,
          limit: 10,
          total: 0,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false,
        },
      };
    } finally {
      inFlightAuditRequests.delete(endpoint);
    }
  })();

  inFlightAuditRequests.set(endpoint, promise);
  return promise;
}

export const adminAuditService = {
  getAdminAuditLogs,
  VALID_AUDIT_EVENT_TYPES,
  clearAdminAuditInFlightRequests,
};

export default adminAuditService;
