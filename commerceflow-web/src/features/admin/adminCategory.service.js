import { apiClient, ApiError } from '../../lib/apiClient.js';

/**
 * Administrative Category Management Service
 * Consumes: /api/v1/admin/categories
 */

// Active in-flight admin category requests for deduplication
const inFlightCategoryRequests = new Map();

/**
 * Clear in-flight admin category requests (primarily for testing and mutations)
 */
export function clearAdminCategoryInFlightRequests() {
  inFlightCategoryRequests.clear();
}

/**
 * Fetch aggregated categories for administration.
 * Deduplicates concurrent in-flight calls for identical parameters.
 *
 * @param {Object} [params={}]
 * @param {string} [params.search]
 * @param {'name'|'totalProducts'|'activeProducts'|'totalStock'} [params.sortBy='name']
 * @param {'asc'|'desc'} [params.sortOrder='asc']
 * @param {Object} [options={}]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ categories: Array<Object>, totalCategories: number }>}
 */
export async function getAdminCategories(params = {}, { signal } = {}) {
  const queryParts = [];

  if (params.search && typeof params.search === 'string' && params.search.trim()) {
    queryParts.push(`search=${encodeURIComponent(params.search.trim())}`);
  }
  if (params.sortBy) {
    queryParts.push(`sortBy=${encodeURIComponent(params.sortBy)}`);
  }
  if (params.sortOrder) {
    queryParts.push(`sortOrder=${encodeURIComponent(params.sortOrder)}`);
  }

  const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
  const endpoint = `admin/categories${queryString}`;

  if (inFlightCategoryRequests.has(endpoint)) {
    return inFlightCategoryRequests.get(endpoint);
  }

  const promise = (async () => {
    try {
      const response = await apiClient.get(endpoint, { signal });
      const data = response?.data || {};
      return {
        categories: Array.isArray(data.categories) ? data.categories : [],
        totalCategories: Number(data.totalCategories) || 0,
      };
    } finally {
      inFlightCategoryRequests.delete(endpoint);
    }
  })();

  inFlightCategoryRequests.set(endpoint, promise);
  return promise;
}

/**
 * Rename an existing category across all products in the catalog.
 *
 * @param {string} currentName
 * @param {string} newName
 * @returns {Promise<Object>}
 */
export async function renameAdminCategory(currentName, newName) {
  if (!currentName || !currentName.trim()) {
    throw new ApiError({
      message: 'Current category name is required',
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  }

  if (!newName || !newName.trim()) {
    throw new ApiError({
      message: 'New category name is required',
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  }

  const cleanCurrent = currentName.trim();
  const cleanNew = newName.trim();

  const response = await apiClient.patch(`admin/categories/${encodeURIComponent(cleanCurrent)}`, {
    newName: cleanNew,
  });

  clearAdminCategoryInFlightRequests();
  return response?.data || response;
}

/**
 * Guarded category deletion.
 * Blocks if products are currently assigned to the category.
 *
 * @param {string} categoryName
 * @returns {Promise<Object>}
 */
export async function deleteAdminCategory(categoryName, { cascade = false } = {}) {
  if (!categoryName || !categoryName.trim()) {
    throw new ApiError({
      message: 'Category name is required',
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  }

  const cleanName = categoryName.trim();
  const query = cascade ? '?cascade=true' : '';
  const response = await apiClient.delete(`admin/categories/${encodeURIComponent(cleanName)}${query}`);
  clearAdminCategoryInFlightRequests();
  return response?.data || response;
}

export const adminCategoryService = {
  getAdminCategories,
  renameAdminCategory,
  deleteAdminCategory,
  clearAdminCategoryInFlightRequests,
};

export default adminCategoryService;
