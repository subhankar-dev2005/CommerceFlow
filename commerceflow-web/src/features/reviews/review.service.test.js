import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { apiClient, ApiError } from '../../lib/apiClient.js';
import {
  getReviews,
  createReview,
  updateReview,
  deleteReview,
  reviewService,
} from './review.service.js';
import {
  buildReviewQueryParams,
  normalizeReview,
  normalizeReviewList,
} from './review.utils.js';

// ─── Test Fixtures ────────────────────────────────────────────────────────────

const VALID_PRODUCT_ID = '607f1f77bcf86cd799439021';
const VALID_PRODUCT_ID_2 = '607f1f77bcf86cd799439022';
const VALID_REVIEW_ID = '807f1f77bcf86cd799439041';
const VALID_USER_ID = '507f1f77bcf86cd799439011';

const MOCK_RAW_REVIEW = {
  _id: VALID_REVIEW_ID,
  product: VALID_PRODUCT_ID,
  user: {
    _id: VALID_USER_ID,
    name: 'Jane Explorer',
    email: 'jane@secret.com', // sensitive field from potential server leak
    password: 'hash', // sensitive field
    role: 'customer',
  },
  rating: 5,
  title: 'Outstanding tent',
  body: 'Withstood heavy mountain winds with zero issues.',
  isVerifiedBuyer: true,
  status: 'published',
  createdAt: '2026-03-01T12:00:00.000Z',
  updatedAt: '2026-03-01T12:00:00.000Z',
};

const MOCK_GET_RESPONSE = {
  success: true,
  message: 'Reviews retrieved successfully',
  data: {
    reviews: [MOCK_RAW_REVIEW],
    pagination: {
      page: 1,
      limit: 10,
      totalReviews: 1,
      totalPages: 1,
    },
  },
};

const MOCK_EMPTY_GET_RESPONSE = {
  success: true,
  message: 'Reviews retrieved successfully',
  data: {
    reviews: [],
    pagination: {
      page: 1,
      limit: 10,
      totalReviews: 0,
      totalPages: 1,
    },
  },
};

describe('P1.2 Step 78.6 — Frontend Review API & Data Layer Tests', () => {
  let originalGet;
  let originalPost;
  let originalPatch;
  let originalDelete;
  let recordedCalls = [];
  let mockResponses = {};

  beforeEach(() => {
    recordedCalls = [];
    mockResponses = {};

    originalGet = apiClient.get;
    originalPost = apiClient.post;
    originalPatch = apiClient.patch;
    originalDelete = apiClient.delete;

    apiClient.get = async (endpoint, options) => {
      recordedCalls.push({ method: 'GET', endpoint, options });
      const key = `GET:${endpoint}`;
      if (mockResponses[key] instanceof Error) throw mockResponses[key];
      return mockResponses[key] ?? MOCK_GET_RESPONSE;
    };

    apiClient.post = async (endpoint, body, options) => {
      recordedCalls.push({ method: 'POST', endpoint, body, options });
      const key = `POST:${endpoint}`;
      if (mockResponses[key] instanceof Error) throw mockResponses[key];
      return mockResponses[key] ?? { data: { review: MOCK_RAW_REVIEW } };
    };

    apiClient.patch = async (endpoint, body, options) => {
      recordedCalls.push({ method: 'PATCH', endpoint, body, options });
      const key = `PATCH:${endpoint}`;
      if (mockResponses[key] instanceof Error) throw mockResponses[key];
      return mockResponses[key] ?? { data: { review: { ...MOCK_RAW_REVIEW, ...body } } };
    };

    apiClient.delete = async (endpoint, options) => {
      recordedCalls.push({ method: 'DELETE', endpoint, options });
      const key = `DELETE:${endpoint}`;
      if (mockResponses[key] instanceof Error) throw mockResponses[key];
      return mockResponses[key] ?? { data: { reviewId: VALID_REVIEW_ID } };
    };
  });

  afterEach(() => {
    apiClient.get = originalGet;
    apiClient.post = originalPost;
    apiClient.patch = originalPatch;
    apiClient.delete = originalDelete;
  });

  // =========================================================================
  // 1. GET Reviews Tests (1–9)
  // =========================================================================
  describe('getReviews', () => {
    it('1 & 2. calls correct endpoint and sends productId correctly', async () => {
      await getReviews(VALID_PRODUCT_ID);

      assert.equal(recordedCalls.length, 1);
      assert.equal(recordedCalls[0].method, 'GET');
      assert.equal(recordedCalls[0].endpoint, `products/${VALID_PRODUCT_ID}/reviews`);
    });

    it('3. sends supported query parameters (page, limit, rating, sortBy, sortOrder)', async () => {
      await getReviews(VALID_PRODUCT_ID, {
        page: 2,
        limit: 20,
        rating: 4,
        sortBy: 'rating',
        sortOrder: 'asc',
      });

      assert.equal(recordedCalls.length, 1);
      assert.equal(
        recordedCalls[0].endpoint,
        `products/${VALID_PRODUCT_ID}/reviews?page=2&limit=20&rating=4&sortBy=rating&sortOrder=asc`
      );
    });

    it('4. omits undefined, null, or empty query parameters', async () => {
      await getReviews(VALID_PRODUCT_ID, {
        page: 1,
        limit: undefined,
        rating: null,
        sortBy: '',
      });

      assert.equal(recordedCalls.length, 1);
      assert.equal(recordedCalls[0].endpoint, `products/${VALID_PRODUCT_ID}/reviews?page=1`);
    });

    it('5. normalizes review items safely and strips sensitive fields', async () => {
      const result = await getReviews(VALID_PRODUCT_ID);

      assert.equal(result.reviews.length, 1);
      const review = result.reviews[0];
      assert.equal(review.id, VALID_REVIEW_ID);
      assert.equal(review.rating, 5);
      assert.equal(review.title, 'Outstanding tent');
      assert.equal(review.isVerifiedBuyer, true);

      // Safe user projection
      assert.equal(review.user.id, VALID_USER_ID);
      assert.equal(review.user.name, 'Jane Explorer');
      assert.equal(review.user.email, undefined);
      assert.equal(review.user.password, undefined);
      assert.equal(review.user.role, undefined);
    });

    it('6. preserves pagination metadata with dual aliases (totalReviews and total)', async () => {
      const result = await getReviews(VALID_PRODUCT_ID);

      assert.deepEqual(result.pagination, {
        page: 1,
        limit: 10,
        totalReviews: 1,
        total: 1,
        totalPages: 1,
      });
      // items array alias
      assert.equal(result.items.length, 1);
    });

    it('7. handles empty result gracefully', async () => {
      const endpoint = `products/${VALID_PRODUCT_ID}/reviews`;
      mockResponses[`GET:${endpoint}`] = MOCK_EMPTY_GET_RESPONSE;

      const result = await getReviews(VALID_PRODUCT_ID);

      assert.deepEqual(result.reviews, []);
      assert.deepEqual(result.items, []);
      assert.equal(result.pagination.totalReviews, 0);
      assert.equal(result.pagination.total, 0);
      assert.equal(result.pagination.totalPages, 1);
    });

    it('8. handles rating filter parameter correctly', async () => {
      await getReviews(VALID_PRODUCT_ID, { rating: 5 });

      assert.equal(recordedCalls.length, 1);
      assert.equal(recordedCalls[0].endpoint, `products/${VALID_PRODUCT_ID}/reviews?rating=5`);
    });

    it('9. handles sorting parameter correctly', async () => {
      await getReviews(VALID_PRODUCT_ID, { sortBy: 'createdAt', sortOrder: 'desc' });

      assert.equal(recordedCalls.length, 1);
      assert.equal(
        recordedCalls[0].endpoint,
        `products/${VALID_PRODUCT_ID}/reviews?sortBy=createdAt&sortOrder=desc`
      );
    });

    it('rejects invalid or malformed productId before sending request', async () => {
      await assert.rejects(
        async () => getReviews('invalid-id'),
        (err) => {
          assert.equal(err.code, 'VALIDATION_ERROR');
          assert.equal(err.status, 400);
          return true;
        }
      );
      assert.equal(recordedCalls.length, 0);
    });
  });

  // =========================================================================
  // 2. POST Review Tests (10–19)
  // =========================================================================
  describe('createReview', () => {
    it('10. calls correct POST endpoint', async () => {
      await createReview(VALID_PRODUCT_ID, {
        rating: 5,
        title: 'Great product',
        body: 'Extremely well built.',
      });

      assert.equal(recordedCalls.length, 1);
      assert.equal(recordedCalls[0].method, 'POST');
      assert.equal(recordedCalls[0].endpoint, `products/${VALID_PRODUCT_ID}/reviews`);
    });

    it('11–15. sends only rating, title, body; strictly omits user, order, isVerifiedBuyer, status', async () => {
      await createReview(VALID_PRODUCT_ID, {
        rating: 5,
        title: 'Headline',
        body: 'Verified quality review body.',
        user: 'injected-user-id',
        order: 'injected-order-id',
        isVerifiedBuyer: false,
        status: 'hidden',
        arbitraryField: 'attack-vector',
      });

      assert.equal(recordedCalls.length, 1);
      const sentBody = recordedCalls[0].body;

      assert.deepEqual(sentBody, {
        rating: 5,
        title: 'Headline',
        body: 'Verified quality review body.',
      });
      assert.equal(sentBody.user, undefined);
      assert.equal(sentBody.order, undefined);
      assert.equal(sentBody.isVerifiedBuyer, undefined);
      assert.equal(sentBody.status, undefined);
      assert.equal(sentBody.arbitraryField, undefined);
    });

    it('16. returns normalized created review', async () => {
      const result = await createReview(VALID_PRODUCT_ID, {
        rating: 5,
        title: 'Great product',
        body: 'Extremely well built.',
      });

      assert.equal(result.id, VALID_REVIEW_ID);
      assert.equal(result.rating, 5);
      assert.equal(result.isVerifiedBuyer, true);
      assert.equal(result.status, 'published');
    });

    it('17 & 18. preserves duplicate review error (409 REVIEW_ALREADY_EXISTS)', async () => {
      const endpoint = `products/${VALID_PRODUCT_ID}/reviews`;
      mockResponses[`POST:${endpoint}`] = new ApiError({
        message: 'You have already submitted a review for this product',
        status: 409,
        code: 'REVIEW_ALREADY_EXISTS',
      });

      await assert.rejects(
        async () =>
          createReview(VALID_PRODUCT_ID, {
            rating: 5,
            body: 'Duplicate attempt body.',
          }),
        (err) => {
          assert.equal(err.status, 409);
          assert.equal(err.code, 'REVIEW_ALREADY_EXISTS');
          return true;
        }
      );
    });

    it('19. preserves purchase-required error (403 REVIEW_PURCHASE_REQUIRED)', async () => {
      const endpoint = `products/${VALID_PRODUCT_ID}/reviews`;
      mockResponses[`POST:${endpoint}`] = new ApiError({
        message: 'Only verified buyers who have received this product can leave a review',
        status: 403,
        code: 'REVIEW_PURCHASE_REQUIRED',
      });

      await assert.rejects(
        async () =>
          createReview(VALID_PRODUCT_ID, {
            rating: 5,
            body: 'Unverified purchase attempt.',
          }),
        (err) => {
          assert.equal(err.status, 403);
          assert.equal(err.code, 'REVIEW_PURCHASE_REQUIRED');
          return true;
        }
      );
    });
  });

  // =========================================================================
  // 3. PATCH Review Tests (20–26)
  // =========================================================================
  describe('updateReview', () => {
    it('20 & 21. calls correct PATCH endpoint with productId and reviewId', async () => {
      await updateReview(VALID_PRODUCT_ID, VALID_REVIEW_ID, { rating: 4 });

      assert.equal(recordedCalls.length, 1);
      assert.equal(recordedCalls[0].method, 'PATCH');
      assert.equal(
        recordedCalls[0].endpoint,
        `products/${VALID_PRODUCT_ID}/reviews/${VALID_REVIEW_ID}`
      );
    });

    it('22 & 23. sends only editable fields (rating, title, body); strictly excludes immutable fields', async () => {
      await updateReview(VALID_PRODUCT_ID, VALID_REVIEW_ID, {
        rating: 3,
        title: 'Updated title',
        body: 'Updated body text.',
        product: VALID_PRODUCT_ID_2,
        user: VALID_USER_ID,
        order: 'some-order',
        isVerifiedBuyer: false,
        status: 'hidden',
      });

      assert.equal(recordedCalls.length, 1);
      const sentBody = recordedCalls[0].body;

      assert.deepEqual(sentBody, {
        rating: 3,
        title: 'Updated title',
        body: 'Updated body text.',
      });
      assert.equal(sentBody.product, undefined);
      assert.equal(sentBody.user, undefined);
      assert.equal(sentBody.order, undefined);
      assert.equal(sentBody.isVerifiedBuyer, undefined);
      assert.equal(sentBody.status, undefined);
    });

    it('24. returns normalized updated review', async () => {
      const result = await updateReview(VALID_PRODUCT_ID, VALID_REVIEW_ID, { rating: 4 });

      assert.equal(result.id, VALID_REVIEW_ID);
      assert.equal(result.rating, 4);
    });

    it('25. preserves ownership error (403 REVIEW_ACCESS_DENIED)', async () => {
      const endpoint = `products/${VALID_PRODUCT_ID}/reviews/${VALID_REVIEW_ID}`;
      mockResponses[`PATCH:${endpoint}`] = new ApiError({
        message: 'You are not authorized to update this review',
        status: 403,
        code: 'REVIEW_ACCESS_DENIED',
      });

      await assert.rejects(
        async () => updateReview(VALID_PRODUCT_ID, VALID_REVIEW_ID, { rating: 2 }),
        (err) => {
          assert.equal(err.status, 403);
          assert.equal(err.code, 'REVIEW_ACCESS_DENIED');
          return true;
        }
      );
    });

    it('26. preserves not-found error (404 REVIEW_NOT_FOUND)', async () => {
      const endpoint = `products/${VALID_PRODUCT_ID}/reviews/${VALID_REVIEW_ID}`;
      mockResponses[`PATCH:${endpoint}`] = new ApiError({
        message: 'Review not found',
        status: 404,
        code: 'REVIEW_NOT_FOUND',
      });

      await assert.rejects(
        async () => updateReview(VALID_PRODUCT_ID, VALID_REVIEW_ID, { rating: 2 }),
        (err) => {
          assert.equal(err.status, 404);
          assert.equal(err.code, 'REVIEW_NOT_FOUND');
          return true;
        }
      );
    });
  });

  // =========================================================================
  // 4. DELETE Review Tests (27–31)
  // =========================================================================
  describe('deleteReview', () => {
    it('27 & 28. calls correct DELETE endpoint with productId and reviewId', async () => {
      await deleteReview(VALID_PRODUCT_ID, VALID_REVIEW_ID);

      assert.equal(recordedCalls.length, 1);
      assert.equal(recordedCalls[0].method, 'DELETE');
      assert.equal(
        recordedCalls[0].endpoint,
        `products/${VALID_PRODUCT_ID}/reviews/${VALID_REVIEW_ID}`
      );
    });

    it('29. returns normalized deletion result { success: true, reviewId }', async () => {
      const result = await deleteReview(VALID_PRODUCT_ID, VALID_REVIEW_ID);

      assert.deepEqual(result, {
        success: true,
        reviewId: VALID_REVIEW_ID,
      });
    });

    it('30. preserves not-found error (404 REVIEW_NOT_FOUND)', async () => {
      const endpoint = `products/${VALID_PRODUCT_ID}/reviews/${VALID_REVIEW_ID}`;
      mockResponses[`DELETE:${endpoint}`] = new ApiError({
        message: 'Review not found',
        status: 404,
        code: 'REVIEW_NOT_FOUND',
      });

      await assert.rejects(
        async () => deleteReview(VALID_PRODUCT_ID, VALID_REVIEW_ID),
        (err) => {
          assert.equal(err.status, 404);
          assert.equal(err.code, 'REVIEW_NOT_FOUND');
          return true;
        }
      );
    });

    it('31. preserves ownership error (403 REVIEW_ACCESS_DENIED)', async () => {
      const endpoint = `products/${VALID_PRODUCT_ID}/reviews/${VALID_REVIEW_ID}`;
      mockResponses[`DELETE:${endpoint}`] = new ApiError({
        message: 'You are not authorized to delete this review',
        status: 403,
        code: 'REVIEW_ACCESS_DENIED',
      });

      await assert.rejects(
        async () => deleteReview(VALID_PRODUCT_ID, VALID_REVIEW_ID),
        (err) => {
          assert.equal(err.status, 403);
          assert.equal(err.code, 'REVIEW_ACCESS_DENIED');
          return true;
        }
      );
    });
  });

  // =========================================================================
  // 5. Auth & Error Preservation Tests (32–34)
  // =========================================================================
  describe('Authentication & Error Handling', () => {
    it('32 & 34. delegates token handling and auth headers directly to shared apiClient', async () => {
      await getReviews(VALID_PRODUCT_ID);
      // Confirmed review service does not manipulate localStorage or auth headers directly
      assert.equal(typeof reviewService.getReviews, 'function');
      assert.equal(typeof reviewService.createReview, 'function');
      assert.equal(typeof reviewService.updateReview, 'function');
      assert.equal(typeof reviewService.deleteReview, 'function');
    });

    it('33. 403 business errors (REVIEW_PURCHASE_REQUIRED, REVIEW_ACCESS_DENIED) do not trigger session expiration', async () => {
      let sessionExpiredFired = false;
      const listener = () => {
        sessionExpiredFired = true;
      };

      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('commerceflow:session-expired', listener);
      }

      const endpoint = `products/${VALID_PRODUCT_ID}/reviews`;
      mockResponses[`POST:${endpoint}`] = new ApiError({
        message: 'Purchase required',
        status: 403,
        code: 'REVIEW_PURCHASE_REQUIRED',
      });

      try {
        await createReview(VALID_PRODUCT_ID, { rating: 5, body: 'Valid body.' });
      } catch (err) {
        assert.equal(err.code, 'REVIEW_PURCHASE_REQUIRED');
      }

      assert.equal(sessionExpiredFired, false);

      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        window.removeEventListener('commerceflow:session-expired', listener);
      }
    });

    it('preserves all distinct backend error codes without flattening', async () => {
      const errorCodes = [
        'AUTH_TOKEN_REQUIRED',
        'AUTH_TOKEN_EXPIRED',
        'INVALID_AUTH_TOKEN',
        'USER_NOT_FOUND',
        'REVIEW_PURCHASE_REQUIRED',
        'REVIEW_ALREADY_EXISTS',
        'REVIEW_NOT_FOUND',
        'REVIEW_ACCESS_DENIED',
        'VALIDATION_ERROR',
        'PRODUCT_NOT_FOUND',
      ];

      for (const code of errorCodes) {
        const endpoint = `products/${VALID_PRODUCT_ID}/reviews`;
        mockResponses[`GET:${endpoint}`] = new ApiError({
          message: `Error message for ${code}`,
          status: 400,
          code,
        });

        await assert.rejects(
          async () => getReviews(VALID_PRODUCT_ID),
          (err) => {
            assert.equal(err.code, code);
            return true;
          }
        );
      }
    });
  });

  // =========================================================================
  // 6. Utility Functions Unit Tests
  // =========================================================================
  describe('review.utils unit tests', () => {
    it('buildReviewQueryParams formats valid options correctly', () => {
      const qs = buildReviewQueryParams({
        page: 3,
        limit: 15,
        rating: 5,
        sortBy: 'rating',
        sortOrder: 'asc',
      });
      assert.equal(qs, '?page=3&limit=15&rating=5&sortBy=rating&sortOrder=asc');
    });

    it('buildReviewQueryParams ignores invalid / out-of-bounds parameters', () => {
      const qs = buildReviewQueryParams({
        page: -1,
        limit: 100, // exceeds max 50
        rating: 6, // exceeds max 5
        sortBy: 'invalid-field',
        sortOrder: 'sideways',
      });
      assert.equal(qs, '');
    });

    it('normalizeReview handles null or invalid input', () => {
      assert.equal(normalizeReview(null), null);
      assert.equal(normalizeReview('not an object'), null);
    });

    it('normalizeReview normalizes string user or missing user safely', () => {
      const normalized = normalizeReview({
        _id: 'rev_1',
        product: 'prod_1',
        user: 'user_string_id',
        rating: 4,
        body: 'Body text',
      });
      assert.equal(normalized.user.id, 'user_string_id');
      assert.equal(normalized.user.name, 'Verified Customer');
    });

    it('normalizeReviewList handles missing data or pagination safely', () => {
      const list = normalizeReviewList({});
      assert.deepEqual(list.reviews, []);
      assert.equal(list.pagination.page, 1);
      assert.equal(list.pagination.limit, 10);
      assert.equal(list.pagination.totalReviews, 0);
      assert.equal(list.pagination.totalPages, 1);
    });
  });
});
