import { apiClient, ApiError } from '../../lib/apiClient.js';

/**
 * Validate that an ID is a valid 24-character hexadecimal MongoDB ObjectId.
 */
function validateObjectId(id, fieldName = 'brand ID') {
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
 * Fetch paginated brands for administration.
 * Consumes: GET /api/v1/admin/brands
 *
 * @param {Object} [params={}]
 * @param {number} [params.page=1]
 * @param {number} [params.limit=10]
 * @param {string} [params.search]
 * @param {'all'|'active'|'inactive'} [params.status='all']
 * @param {'name'|'createdAt'|'updatedAt'} [params.sortBy='name']
 * @param {'asc'|'desc'} [params.sortOrder='asc']
 * @param {Object} [options={}]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ brands: Array<Object>, pagination: Object }>}
 */
export async function getAdminBrands(params = {}, { signal } = {}) {
  const queryParts = [];

  const addParam = (key, val) => {
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      queryParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(val).trim())}`);
    }
  };

  if (params.page) addParam('page', params.page);
  if (params.limit) addParam('limit', params.limit);
  if (params.search) addParam('search', params.search);
  if (params.status && params.status !== 'all') addParam('status', params.status);
  if (params.sortBy) addParam('sortBy', params.sortBy);
  if (params.sortOrder) addParam('sortOrder', params.sortOrder);

  const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
  const response = await apiClient.get(`admin/brands${queryString}`, { signal });

  const data = response?.data || {};
  return {
    brands: Array.isArray(data.brands) ? data.brands : [],
    pagination: data.pagination || { page: 1, limit: 10, totalBrands: 0, totalPages: 1 },
  };
}

/**
 * Fetch single brand by ID.
 *
 * @param {string} id
 * @param {Object} [options={}]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<Object>}
 */
export async function getAdminBrandById(id, { signal } = {}) {
  validateObjectId(id);
  const cleanId = id.trim();
  const response = await apiClient.get(`admin/brands/${cleanId}`, { signal });
  return response?.data?.brand;
}

/**
 * Create a new brand record.
 * Consumes: POST /api/v1/admin/brands
 *
 * @param {Object} payload
 * @returns {Promise<Object>}
 */
export async function createAdminBrand(payload) {
  if (!payload || !payload.name || !payload.name.trim()) {
    throw new ApiError({
      message: 'Brand name is required',
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'name', message: 'Brand name is required' }],
    });
  }

  const response = await apiClient.post('admin/brands', {
    name: payload.name.trim(),
    slug: payload.slug?.trim() || undefined,
    description: payload.description?.trim() || '',
    website: payload.website?.trim() || null,
    logo: payload.logo?.trim() || null,
    isActive: payload.isActive !== undefined ? Boolean(payload.isActive) : true,
  });

  return response?.data?.brand;
}

/**
 * Update an existing brand.
 * Consumes: PATCH /api/v1/admin/brands/:id
 *
 * @param {string} id
 * @param {Object} payload
 * @returns {Promise<Object>}
 */
export async function updateAdminBrand(id, payload) {
  validateObjectId(id);
  const cleanId = id.trim();

  const sanitized = { ...payload };
  if ('website' in sanitized) {
    sanitized.website = sanitized.website ? sanitized.website.trim() : null;
  }
  if ('logo' in sanitized) {
    sanitized.logo = sanitized.logo ? sanitized.logo.trim() : null;
  }
  if ('name' in sanitized && sanitized.name) {
    sanitized.name = sanitized.name.trim();
  }
  if ('slug' in sanitized && sanitized.slug) {
    sanitized.slug = sanitized.slug.trim();
  }
  if ('description' in sanitized && sanitized.description !== undefined) {
    sanitized.description = sanitized.description.trim();
  }

  const response = await apiClient.patch(`admin/brands/${cleanId}`, sanitized);
  return response?.data?.brand;
}

/**
 * Delete a brand.
 * Consumes: DELETE /api/v1/admin/brands/:id
 *
 * @param {string} id
 * @returns {Promise<Object>}
 */
export async function deleteAdminBrand(id) {
  validateObjectId(id);
  const cleanId = id.trim();
  const response = await apiClient.delete(`admin/brands/${cleanId}`);
  return response?.data || response;
}

export const adminBrandService = {
  getAdminBrands,
  getAdminBrandById,
  createAdminBrand,
  updateAdminBrand,
  deleteAdminBrand,
  validateObjectId,
};

export default adminBrandService;
