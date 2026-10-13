import { apiClient, ApiError } from '../../lib/apiClient.js';

export const VALID_USER_ROLES = ['admin', 'customer', 'all'];
export const VALID_USER_STATUSES = ['active', 'inactive', 'all'];
export const VALID_SORT_FIELDS = ['createdAt', 'name', 'email', 'role'];
export const VALID_SORT_ORDERS = ['asc', 'desc'];

/**
 * Validate that an ID is a strict 24-character hexadecimal MongoDB ObjectId.
 * @param {string} id
 * @param {string} [fieldName='userId']
 * @throws {ApiError}
 */
export function validateObjectId(id, fieldName = 'userId') {
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
 * Fetch paginated users for administrators.
 * Consumes: GET /api/v1/admin/users
 *
 * @param {Object} [params={}]
 * @param {number} [params.page=1]
 * @param {number} [params.limit=10]
 * @param {'active'|'inactive'|'all'} [params.status='all']
 * @param {'admin'|'customer'|'all'} [params.role='all']
 * @param {string} [params.search]
 * @param {'createdAt'|'name'|'email'|'role'} [params.sortBy='createdAt']
 * @param {'asc'|'desc'} [params.sortOrder='desc']
 * @param {Object} [options={}]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ users: Array<Object>, pagination: Object }>}
 */
export async function getAdminUsers(params = {}, { signal } = {}) {
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

    if (params.status && VALID_USER_STATUSES.includes(params.status)) {
      queryParts.push(`status=${encodeURIComponent(params.status)}`);
    }

    if (params.role && VALID_USER_ROLES.includes(params.role)) {
      queryParts.push(`role=${encodeURIComponent(params.role)}`);
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
  const response = await apiClient.get(`admin/users${queryString}`, { signal });

  return {
    users: response?.data?.users || [],
    pagination: response?.data?.pagination || {
      page: 1,
      limit: 10,
      totalUsers: 0,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false,
    },
  };
}

/**
 * Create a new administrator account.
 * Consumes: POST /api/v1/admin/users
 *
 * @param {Object} data
 * @param {string} data.name
 * @param {string} data.email
 * @param {string} data.password
 * @param {Object} [options={}]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<Object>} Created user record
 */
export async function createAdminUser(data = {}, { signal } = {}) {
  const { name, email, password } = data;

  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    throw new ApiError({
      message: 'Name must be at least 2 characters long',
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'name', message: 'Name must be at least 2 characters' }],
    });
  }

  if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    throw new ApiError({
      message: 'A valid email address is required',
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'email', message: 'Invalid email address' }],
    });
  }

  if (!password || typeof password !== 'string' || password.length < 8) {
    throw new ApiError({
      message: 'Password must be at least 8 characters long',
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'password', message: 'Password must be at least 8 characters' }],
    });
  }

  const response = await apiClient.post(
    'admin/users',
    {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
    },
    { signal }
  );

  return response?.data?.user;
}

/**
 * Update user status (active/inactive).
 * Consumes: PATCH /api/v1/admin/users/:userId/status
 *
 * @param {string} userId
 * @param {boolean} isActive
 * @param {Object} [options={}]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<Object>}
 */
export async function updateAdminUserStatus(userId, isActive, { signal } = {}) {
  validateObjectId(userId, 'user ID');

  if (typeof isActive !== 'boolean') {
    throw new ApiError({
      message: 'isActive must be a boolean',
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'isActive', message: 'isActive must be a boolean' }],
    });
  }

  const cleanId = userId.trim();
  const response = await apiClient.patch(
    `admin/users/${encodeURIComponent(cleanId)}/status`,
    { isActive },
    { signal }
  );

  return response?.data?.user;
}

/**
 * Update user role ('admin' | 'customer').
 * Consumes: PATCH /api/v1/admin/users/:userId/role
 *
 * @param {string} userId
 * @param {'admin'|'customer'} role
 * @param {Object} [options={}]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<Object>}
 */
export async function updateAdminUserRole(userId, role, { signal } = {}) {
  validateObjectId(userId, 'user ID');

  if (role !== 'admin' && role !== 'customer') {
    throw new ApiError({
      message: 'Role must be either "admin" or "customer"',
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'role', message: 'Invalid role' }],
    });
  }

  const cleanId = userId.trim();
  const response = await apiClient.patch(
    `admin/users/${encodeURIComponent(cleanId)}/role`,
    { role },
    { signal }
  );

  return response?.data?.user;
}

export const adminUserService = {
  getAdminUsers,
  createAdminUser,
  updateAdminUserStatus,
  updateAdminUserRole,
  validateObjectId,
  VALID_USER_ROLES,
  VALID_USER_STATUSES,
  VALID_SORT_FIELDS,
  VALID_SORT_ORDERS,
};

export default adminUserService;
