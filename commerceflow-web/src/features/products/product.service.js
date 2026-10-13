import { apiClient } from '../../lib/apiClient.js';

/**
 * Product & Catalog API Service
 * Interacts with the CommerceFlow products API via the central apiClient.
 */

// Active in-flight products queries: queryString -> Promise
const inFlightProductsQueries = new Map();

/**
 * Clear in-flight products request cache (primarily for tests).
 */
export function clearInFlightProductsCache() {
  inFlightProductsQueries.clear();
}

/**
 * Retrieve paginated, filtered, and sorted products with concurrent in-flight deduplication.
 *
 * @param {Object} [params={}]
 * @param {number} [params.page]
 * @param {number} [params.limit]
 * @param {string} [params.search]
 * @param {string} [params.category]
 * @param {'true'|'false'} [params.inStock]
 * @param {number} [params.minPrice]
 * @param {number} [params.maxPrice]
 * @param {'price'|'createdAt'|'name'} [params.sortBy]
 * @param {'asc'|'desc'} [params.sortOrder]
 * @returns {Promise<{ products: Array<Object>, pagination: { page: number, limit: number, totalProducts: number, totalPages: number } }>}
 */
export async function getProducts(params = {}, options = {}) {
  const queryParts = [];

  const addParam = (key, value) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      queryParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value).trim())}`);
    }
  };

  if (params.page !== undefined && params.page !== null) {
    addParam('page', params.page);
  }
  if (params.limit !== undefined && params.limit !== null) {
    addParam('limit', params.limit);
  }
  if (params.search) {
    addParam('search', params.search);
  }
  if (params.category) {
    addParam('category', params.category);
  }
  // inStock must strictly be "true" or "false"
  if (params.inStock === 'true' || params.inStock === 'false') {
    addParam('inStock', params.inStock);
  }
  if (params.minPrice !== undefined && params.minPrice !== null && params.minPrice !== '') {
    const num = Number(params.minPrice);
    if (!isNaN(num) && num >= 0) {
      addParam('minPrice', num);
    }
  }
  if (params.maxPrice !== undefined && params.maxPrice !== null && params.maxPrice !== '') {
    const num = Number(params.maxPrice);
    if (!isNaN(num) && num >= 0) {
      addParam('maxPrice', num);
    }
  }
  if (params.sortBy) {
    addParam('sortBy', params.sortBy);
  }
  if (params.sortOrder) {
    addParam('sortOrder', params.sortOrder);
  }

  const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
  const cacheKey = queryString;

  if (options.signal?.aborted) {
    return apiClient.get(`products${queryString}`, options);
  }

  if (inFlightProductsQueries.has(cacheKey)) {
    return inFlightProductsQueries.get(cacheKey);
  }

  const fetchPromise = (async () => {
    try {
      const response = await apiClient.get(`products${queryString}`, options);
      return {
        products: response?.data?.products || [],
        pagination: response?.data?.pagination || {
          page: 1,
          limit: 10,
          totalProducts: 0,
          totalPages: 1,
        },
      };
    } finally {
      inFlightProductsQueries.delete(cacheKey);
    }
  })();

  inFlightProductsQueries.set(cacheKey, fetchPromise);
  return fetchPromise;
}

// Shared in-memory categories cache (5 minutes TTL)
const CATEGORIES_CACHE_TTL_MS = 5 * 60 * 1000;

let categoriesCache = {
  data: null,
  timestamp: 0,
};

let inFlightCategoriesPromise = null;

/**
 * Returns currently cached categories if within valid TTL, otherwise null.
 * Allows components to synchronously initialize without unnecessary loading states or network hits.
 *
 * @returns {Array<string>|null}
 */
export function getCachedCategories() {
  const now = Date.now();
  if (
    categoriesCache.data !== null &&
    now - categoriesCache.timestamp < CATEGORIES_CACHE_TTL_MS
  ) {
    return categoriesCache.data;
  }
  return null;
}

/**
 * Invalidate the in-memory categories cache.
 * Forces the next getCategories() call to fetch fresh data from the backend.
 */
export function invalidateCategoriesCache() {
  categoriesCache = {
    data: null,
    timestamp: 0,
  };
  inFlightCategoriesPromise = null;
}

/**
 * Retrieve distinct active product categories with in-memory caching and request deduplication.
 *
 * @param {Object} [options={}]
 * @param {boolean} [options.forceRefresh=false] - Bypass cache and fetch fresh categories
 * @returns {Promise<Array<string>>}
 */
export async function getCategories({ forceRefresh = false } = {}) {
  const now = Date.now();
  const isCacheValid =
    !forceRefresh &&
    categoriesCache.data !== null &&
    now - categoriesCache.timestamp < CATEGORIES_CACHE_TTL_MS;

  if (isCacheValid) {
    return categoriesCache.data;
  }

  // Deduplicate in-flight requests across concurrent component mounts
  if (inFlightCategoriesPromise) {
    return inFlightCategoriesPromise;
  }

  inFlightCategoriesPromise = (async () => {
    try {
      const response = await apiClient.get('products/categories');
      const categories = Array.isArray(response?.data?.categories)
        ? response.data.categories
        : [];

      categoriesCache = {
        data: categories,
        timestamp: Date.now(),
      };

      return categories;
    } catch (error) {
      // Do not cache failed responses; allow subsequent retries
      categoriesCache = {
        data: null,
        timestamp: 0,
      };
      throw error;
    } finally {
      inFlightCategoriesPromise = null;
    }
  })();

  return inFlightCategoriesPromise;
}

/**
 * Retrieve details for a single active product by ID.
 *
 * @param {string} id - 24-character hexadecimal MongoDB ObjectId
 * @returns {Promise<Object>} The product object
 */
export async function getProductById(id, options = {}) {
  const cleanId = String(id).trim();
  const response = await apiClient.get(`products/${cleanId}`, options);
  return response?.data?.product;
}

export const productService = {
  getProducts,
  getCategories,
  getCachedCategories,
  getProductById,
  invalidateCategoriesCache,
  clearInFlightProductsCache,
};

export default productService;
