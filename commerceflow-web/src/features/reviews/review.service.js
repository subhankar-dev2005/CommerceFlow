import { apiClient, ApiError } from '../../lib/apiClient.js';
import {
  buildReviewQueryParams,
  normalizeReview,
  normalizeReviewList
} from './review.utils.js';

/**
 * Customer Reviews & Ratings API Service
 * Encapsulates all communication with the verified-buyer reviews backend endpoints.
 * All review endpoints require authentication, handled transparently by the shared apiClient.
 */

const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

/**
 * Validates that an ID is a valid 24-character hexadecimal MongoDB ObjectId.
 * Throws a normalized ApiError if invalid.
 *
 * @param {string} id
 * @param {string} fieldName
 * @throws {ApiError}
 */
function validateObjectId(id, fieldName) {
  if (!id || typeof id !== 'string' || !OBJECT_ID_REGEX.test(id.trim())) {
    throw new ApiError({
      message: `A valid 24-character ${fieldName} is required`,
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: fieldName, message: `Invalid ${fieldName}` }],
    });
  }
}

/**
 * Fetches public, published reviews for a product with pagination, filtering, and sorting.
 *
 * @param {string} productId - MongoDB ObjectId string
 * @param {Object} [options={}] - Query options
 * @param {number} [options.page=1] - Page number (>= 1)
 * @param {number} [options.limit=10] - Items per page (1-50)
 * @param {number} [options.rating] - Filter by specific rating (1-5)
 * @param {'createdAt'|'rating'} [options.sortBy='createdAt'] - Sort field
 * @param {'asc'|'desc'} [options.sortOrder='desc'] - Sort direction
 * @returns {Promise<{ reviews: Array<Object>, items: Array<Object>, pagination: Object }>}
 */
export async function getReviews(productId, options = {}) {
  validateObjectId(productId, 'productId');

  const queryString = buildReviewQueryParams(options);
  const endpoint = `products/${encodeURIComponent(productId.trim())}/reviews${queryString}`;
  const response = await apiClient.get(endpoint);

  return normalizeReviewList(response);
}

/**
 * Submits a new customer review for a product with server-side verified buyer enforcement.
 *
 * CONTRACT INVARIANTS:
 * - Server determines verified buyer qualification automatically from past delivered & paid orders.
 * - Client MUST NOT send: user, order, isVerifiedBuyer, status.
 * - The payload is strictly filtered to send ONLY: rating, title, body.
 *
 * @param {string} productId - MongoDB ObjectId string
 * @param {Object} payload - Review content
 * @param {number} payload.rating - Whole number 1-5
 * @param {string} [payload.title] - Optional review headline
 * @param {string} payload.body - Review text (5-2000 characters)
 * @returns {Promise<Object>} Normalized created review document
 */
export async function createReview(productId, payload = {}) {
  validateObjectId(productId, 'productId');

  if (!payload || typeof payload !== 'object') {
    throw new ApiError({
      message: 'Review payload must be an object',
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'body', message: 'Payload is required' }],
    });
  }

  // Strictly filter payload to permitted fields only
  const cleanPayload = {};
  if (payload.rating !== undefined && payload.rating !== null) {
    cleanPayload.rating = Number(payload.rating);
  }
  if (payload.title !== undefined && payload.title !== null) {
    cleanPayload.title = String(payload.title).trim();
  }
  if (payload.body !== undefined && payload.body !== null) {
    cleanPayload.body = String(payload.body).trim();
  }

  const endpoint = `products/${encodeURIComponent(productId.trim())}/reviews`;
  const response = await apiClient.post(endpoint, cleanPayload);

  return normalizeReview(response?.data?.review || response?.data || response);
}

/**
 * Updates an existing review authored by the authenticated user.
 *
 * CONTRACT INVARIANTS:
 * - Only content fields (rating, title, body) can be modified.
 * - Immutable fields (user, product, order, isVerifiedBuyer, status) are never sent.
 *
 * @param {string} productId - MongoDB ObjectId string
 * @param {string} reviewId - MongoDB ObjectId string
 * @param {Object} payload - Fields to update
 * @param {number} [payload.rating] - Whole number 1-5
 * @param {string} [payload.title] - Review headline
 * @param {string} [payload.body] - Review text
 * @returns {Promise<Object>} Normalized updated review document
 */
export async function updateReview(productId, reviewId, payload = {}) {
  validateObjectId(productId, 'productId');
  validateObjectId(reviewId, 'reviewId');

  if (!payload || typeof payload !== 'object') {
    throw new ApiError({
      message: 'Review update payload must be an object',
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'body', message: 'Payload is required' }],
    });
  }

  // Strictly filter payload to editable fields only
  const cleanPayload = {};
  if (payload.rating !== undefined && payload.rating !== null) {
    cleanPayload.rating = Number(payload.rating);
  }
  if (payload.title !== undefined && payload.title !== null) {
    cleanPayload.title = String(payload.title).trim();
  }
  if (payload.body !== undefined && payload.body !== null) {
    cleanPayload.body = String(payload.body).trim();
  }

  const endpoint = `products/${encodeURIComponent(productId.trim())}/reviews/${encodeURIComponent(reviewId.trim())}`;
  const response = await apiClient.patch(endpoint, cleanPayload);

  return normalizeReview(response?.data?.review || response?.data || response);
}

/**
 * Deletes an existing review authored by the authenticated user.
 *
 * @param {string} productId - MongoDB ObjectId string
 * @param {string} reviewId - MongoDB ObjectId string
 * @returns {Promise<{ success: boolean, reviewId: string }>}
 */
export async function deleteReview(productId, reviewId) {
  validateObjectId(productId, 'productId');
  validateObjectId(reviewId, 'reviewId');

  const endpoint = `products/${encodeURIComponent(productId.trim())}/reviews/${encodeURIComponent(reviewId.trim())}`;
  const response = await apiClient.delete(endpoint);

  const returnedReviewId = response?.data?.reviewId || reviewId;

  return {
    success: true,
    reviewId: String(returnedReviewId),
  };
}

export const reviewService = {
  getReviews,
  createReview,
  updateReview,
  deleteReview,
};

export default reviewService;
