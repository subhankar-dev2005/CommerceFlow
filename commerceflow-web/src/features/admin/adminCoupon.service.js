import { apiClient, ApiError } from '../../lib/apiClient.js';

/**
 * Administrative Coupon Management Service
 * Consumes: /api/v1/admin/coupons
 */

const inFlightCouponRequests = new Map();

export function clearAdminCouponInFlightRequests() {
  inFlightCouponRequests.clear();
}

/**
 * Fetch paginated, filtered administrative coupons.
 *
 * @param {Object} [params={}]
 * @param {number} [params.page=1]
 * @param {number} [params.limit=10]
 * @param {string} [params.search]
 * @param {'true'|'false'} [params.isActive]
 * @param {'percentage'|'fixed'} [params.type]
 * @param {'createdAt'|'code'|'usedCount'|'value'|'expiresAt'} [params.sortBy='createdAt']
 * @param {'asc'|'desc'} [params.sortOrder='desc']
 * @param {Object} [options={}]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ coupons: Array<Object>, totalCoupons: number, totalPages: number, page: number, limit: number, pagination: Object }>}
 */
export async function getAdminCoupons(params = {}, { signal } = {}) {
  const queryParts = [];

  if (params.page) queryParts.push(`page=${encodeURIComponent(params.page)}`);
  if (params.limit) queryParts.push(`limit=${encodeURIComponent(params.limit)}`);
  if (params.search && typeof params.search === 'string' && params.search.trim()) {
    queryParts.push(`search=${encodeURIComponent(params.search.trim())}`);
  }
  if (params.isActive !== undefined && params.isActive !== '') {
    queryParts.push(`isActive=${encodeURIComponent(params.isActive)}`);
  }
  if (params.type) {
    queryParts.push(`type=${encodeURIComponent(params.type)}`);
  }
  if (params.sortBy) {
    queryParts.push(`sortBy=${encodeURIComponent(params.sortBy)}`);
  }
  if (params.sortOrder) {
    queryParts.push(`sortOrder=${encodeURIComponent(params.sortOrder)}`);
  }

  const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
  const endpoint = `admin/coupons${queryString}`;

  if (inFlightCouponRequests.has(endpoint)) {
    return inFlightCouponRequests.get(endpoint);
  }

  const promise = (async () => {
    try {
      const response = await apiClient.get(endpoint, { signal });
      const data = response?.data || {};
      const pagination = data.pagination || {};
      const page = Number(pagination.page ?? data.page) || 1;
      const limit = Number(pagination.limit ?? data.limit) || 10;
      const totalCoupons = Number(pagination.totalCoupons ?? data.totalCoupons) || 0;
      const totalPages = Number(pagination.totalPages ?? data.totalPages) || 1;

      return {
        coupons: Array.isArray(data.coupons) ? data.coupons : [],
        totalCoupons,
        totalPages,
        page,
        limit,
        pagination: {
          page,
          limit,
          totalCoupons,
          totalPages,
        },
      };
    } finally {
      inFlightCouponRequests.delete(endpoint);
    }
  })();

  inFlightCouponRequests.set(endpoint, promise);
  return promise;
}

/**
 * Fetch details for a specific coupon.
 *
 * @param {string} couponId
 * @param {Object} [options={}]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<Object>}
 */
export async function getAdminCouponById(couponId, { signal } = {}) {
  if (!couponId) {
    throw new ApiError({
      message: 'Coupon ID is required',
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  }
  const response = await apiClient.get(`admin/coupons/${couponId}`, { signal });
  return response?.data?.coupon || response?.data || {};
}

/**
 * Create a new coupon.
 *
 * @param {Object} payload
 * @returns {Promise<Object>}
 */
export async function createAdminCoupon(payload) {
  const response = await apiClient.post('admin/coupons', payload);
  clearAdminCouponInFlightRequests();
  return response?.data || response;
}

/**
 * Update configuration fields for an existing coupon.
 *
 * @param {string} couponId
 * @param {Object} payload
 * @returns {Promise<Object>}
 */
export async function updateAdminCoupon(couponId, payload) {
  if (!couponId) {
    throw new ApiError({
      message: 'Coupon ID is required',
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  }
  const response = await apiClient.patch(`admin/coupons/${couponId}`, payload);
  clearAdminCouponInFlightRequests();
  return response?.data || response;
}

/**
 * Toggle active status of a coupon.
 *
 * @param {string} couponId
 * @param {boolean} isActive
 * @returns {Promise<Object>}
 */
export async function updateAdminCouponStatus(couponId, isActive) {
  if (!couponId) {
    throw new ApiError({
      message: 'Coupon ID is required',
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  }
  const response = await apiClient.patch(`admin/coupons/${couponId}/status`, { isActive });
  clearAdminCouponInFlightRequests();
  return response?.data || response;
}

export const adminCouponService = {
  getAdminCoupons,
  getAdminCouponById,
  createAdminCoupon,
  updateAdminCoupon,
  updateAdminCouponStatus,
  clearAdminCouponInFlightRequests,
};

export default adminCouponService;
