import { apiClient, ApiError } from '../../lib/apiClient.js';

export const VALID_CUSTOMER_STATUSES = ['active', 'inactive', 'all'];

export const VALID_SORT_FIELDS = ['createdAt', 'name', 'email'];

export const VALID_SORT_ORDERS = ['asc', 'desc'];

/**
 * Validate that an ID is a strict 24-character hexadecimal MongoDB ObjectId.
 * @param {string} id
 * @param {string} [fieldName='customerId']
 * @throws {ApiError}
 */
export function validateObjectId(id, fieldName = 'customerId') {
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
 * Fetch paginated customers for administrators.
 * Consumes: GET /api/v1/admin/customers
 *
 * @param {Object} [params={}]
 * @param {number} [params.page=1]
 * @param {number} [params.limit=10]
 * @param {'active'|'inactive'|'all'} [params.status='all']
 * @param {string} [params.search] - Search by customer name or email
 * @param {'createdAt'|'name'|'email'} [params.sortBy='createdAt']
 * @param {'asc'|'desc'} [params.sortOrder='desc']
 * @param {Object} [options={}]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ customers: Array<Object>, pagination: { page: number, limit: number, totalCustomers: number, totalPages: number, hasNextPage: boolean, hasPrevPage: boolean } }>}
 */
export async function getAdminCustomers(params = {}, { signal } = {}) {
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

    if (params.status && VALID_CUSTOMER_STATUSES.includes(params.status)) {
      queryParts.push(`status=${encodeURIComponent(params.status)}`);
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

    if (params.sortOrder && VALID_SORT_ORDERS.includes(params.sortOrder)) {
      queryParts.push(`sortOrder=${params.sortOrder}`);
    }
  }

  const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
  const response = await apiClient.get(`admin/customers${queryString}`, { signal });

  return {
    customers: response?.data?.customers || [],
    pagination: response?.data?.pagination || {
      page: 1,
      limit: 10,
      totalCustomers: 0,
      total: 0,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false,
    },
  };
}

/**
 * Fetch a single customer's details (profile, addresses, orderStats, recentOrders) for administrative inspection.
 * Consumes: GET /api/v1/admin/customers/:customerId
 *
 * @param {string} customerId - 24-character hexadecimal MongoDB ObjectId
 * @param {Object} [options={}]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ customer: Object, addresses: Array<Object>, orderStats: Object, recentOrders: Array<Object> }>}
 */
export async function getAdminCustomer(customerId, { signal } = {}) {
  validateObjectId(customerId, 'customer ID');
  const cleanId = customerId.trim();
  const response = await apiClient.get(`admin/customers/${encodeURIComponent(cleanId)}`, { signal });

  return (
    response?.data || {
      customer: null,
      addresses: [],
      orderStats: { totalOrders: 0, totalSpent: 0, lastOrderDate: null },
      recentOrders: [],
    }
  );
}

/**
 * Atomically activate or deactivate a customer account.
 * Consumes: PATCH /api/v1/admin/customers/:customerId/status
 *
 * @param {string} customerId - 24-character hexadecimal MongoDB ObjectId
 * @param {boolean} isActive - Desired active state
 * @returns {Promise<Object>} Updated customer record
 */
export async function updateAdminCustomerStatus(customerId, isActive, { signal } = {}) {
  validateObjectId(customerId, 'customer ID');

  if (typeof isActive !== 'boolean') {
    throw new ApiError({
      message: 'isActive must be a boolean',
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'isActive', message: 'isActive must be a boolean' }],
    });
  }

  const cleanId = customerId.trim();
  // Strict body payload containing ONLY isActive
  const response = await apiClient.patch(
    `admin/customers/${encodeURIComponent(cleanId)}/status`,
    { isActive },
    { signal }
  );

  return response?.data?.customer;
}

export const adminCustomerService = {
  getAdminCustomers,
  getAdminCustomer,
  updateAdminCustomerStatus,
  validateObjectId,
  VALID_CUSTOMER_STATUSES,
  VALID_SORT_FIELDS,
  VALID_SORT_ORDERS,
};

export default adminCustomerService;
