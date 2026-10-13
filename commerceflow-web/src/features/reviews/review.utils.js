/**
 * Review Utilities & Data Normalization
 * Pure transformation and query helpers for verified customer reviews.
 */

/**
 * Builds a query string for GET /products/:productId/reviews omitting undefined or null values.
 * Strictly adheres to backend query parameters: page, limit, rating, sortBy, sortOrder.
 *
 * @param {Object} [options={}]
 * @param {number} [options.page] - Integer >= 1
 * @param {number} [options.limit] - Integer 1-50
 * @param {number} [options.rating] - Integer 1-5
 * @param {'createdAt'|'rating'} [options.sortBy]
 * @param {'asc'|'desc'} [options.sortOrder]
 * @returns {string} Formatted query string (e.g. "?page=1&limit=10") or empty string
 */
export function buildReviewQueryParams(options = {}) {
  if (!options || typeof options !== 'object') {
    return '';
  }

  const queryParts = [];

  const addParam = (key, value) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      queryParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value).trim())}`);
    }
  };

  // page: integer >= 1
  if (options.page !== undefined && options.page !== null && options.page !== '') {
    const pageNum = Number(options.page);
    if (Number.isInteger(pageNum) && pageNum >= 1) {
      addParam('page', pageNum);
    }
  }

  // limit: integer 1-50
  if (options.limit !== undefined && options.limit !== null && options.limit !== '') {
    const limitNum = Number(options.limit);
    if (Number.isInteger(limitNum) && limitNum >= 1 && limitNum <= 50) {
      addParam('limit', limitNum);
    }
  }

  // rating: integer 1-5
  if (options.rating !== undefined && options.rating !== null && options.rating !== '') {
    const ratingNum = Number(options.rating);
    if (Number.isInteger(ratingNum) && ratingNum >= 1 && ratingNum <= 5) {
      addParam('rating', ratingNum);
    }
  }

  // sortBy: 'createdAt' | 'rating'
  if (options.sortBy === 'createdAt' || options.sortBy === 'rating') {
    addParam('sortBy', options.sortBy);
  }

  // sortOrder: 'asc' | 'desc'
  if (options.sortOrder === 'asc' || options.sortOrder === 'desc') {
    addParam('sortOrder', options.sortOrder);
  }

  return queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
}

/**
 * Normalizes a single review document from the backend.
 * Guarantees safe reviewer projection and predictable types.
 *
 * @param {Object} rawReview
 * @returns {Object|null} Normalized review object
 */
export function normalizeReview(rawReview) {
  if (!rawReview || typeof rawReview !== 'object') {
    return null;
  }

  const id = rawReview._id || rawReview.id || '';
  const product =
    rawReview.product && typeof rawReview.product === 'object'
      ? rawReview.product._id || rawReview.product.id || ''
      : rawReview.product || '';

  // Safe user projection: only extract id and name.
  // Never assume or expose sensitive fields (email, phone, password, role, addresses).
  let user = { id: '', name: 'Verified Customer' };
  if (rawReview.user && typeof rawReview.user === 'object') {
    user = {
      id: String(rawReview.user._id || rawReview.user.id || ''),
      name: String(rawReview.user.name || 'Verified Customer').trim(),
    };
  } else if (typeof rawReview.user === 'string' && rawReview.user.trim()) {
    user = {
      id: rawReview.user.trim(),
      name: 'Verified Customer',
    };
  }

  const rating =
    typeof rawReview.rating === 'number' && Number.isFinite(rawReview.rating)
      ? rawReview.rating
      : Number(rawReview.rating) || 0;

  const title = typeof rawReview.title === 'string' ? rawReview.title : '';
  const body = typeof rawReview.body === 'string' ? rawReview.body : '';
  const isVerifiedBuyer = Boolean(rawReview.isVerifiedBuyer);
  const status = rawReview.status || 'published';
  const createdAt = rawReview.createdAt || '';
  const updatedAt = rawReview.updatedAt || '';

  return {
    id: String(id),
    _id: String(id),
    product: String(product),
    user,
    rating,
    title,
    body,
    isVerifiedBuyer,
    status,
    createdAt,
    updatedAt,
  };
}

/**
 * Normalizes a paginated review list response from the backend.
 *
 * @param {Object} response
 * @returns {{ reviews: Array<Object>, items: Array<Object>, pagination: { page: number, limit: number, totalReviews: number, total: number, totalPages: number } }}
 */
export function normalizeReviewList(response) {
  const data = response?.data || response || {};
  const rawReviews = Array.isArray(data.reviews)
    ? data.reviews
    : Array.isArray(data.items)
      ? data.items
      : [];

  const normalizedReviews = rawReviews
    .map(normalizeReview)
    .filter(Boolean);

  const rawPagination = data.pagination || {};
  const page = Number(rawPagination.page) || 1;
  const limit = Number(rawPagination.limit) || 10;
  const totalReviews =
    typeof rawPagination.totalReviews === 'number'
      ? rawPagination.totalReviews
      : typeof rawPagination.total === 'number'
        ? rawPagination.total
        : normalizedReviews.length;

  const totalPages =
    typeof rawPagination.totalPages === 'number'
      ? rawPagination.totalPages
      : Math.max(Math.ceil(totalReviews / limit), 1);

  const pagination = {
    page,
    limit,
    totalReviews,
    total: totalReviews,
    totalPages,
  };

  return {
    reviews: normalizedReviews,
    items: normalizedReviews,
    pagination,
  };
}
