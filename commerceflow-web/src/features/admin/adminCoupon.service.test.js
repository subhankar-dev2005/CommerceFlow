import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { apiClient, ApiError } from '../../lib/apiClient.js';
import {
  getAdminCoupons,
  getAdminCouponById,
  createAdminCoupon,
  updateAdminCoupon,
  updateAdminCouponStatus,
  clearAdminCouponInFlightRequests,
  adminCouponService,
} from './adminCoupon.service.js';

describe('Admin Coupon Service Unit & Regression Tests', () => {
  let originalGet;
  let originalPost;
  let originalPatch;

  beforeEach(() => {
    originalGet = apiClient.get;
    originalPost = apiClient.post;
    originalPatch = apiClient.patch;
    clearAdminCouponInFlightRequests();
  });

  afterEach(() => {
    apiClient.get = originalGet;
    apiClient.post = originalPost;
    apiClient.patch = originalPatch;
    clearAdminCouponInFlightRequests();
  });

  describe('getAdminCoupons pagination contract mapping', () => {
    it('maps authoritative nested data.pagination contract correctly', async () => {
      let calledUrl = null;
      let capturedOptions = null;

      apiClient.get = async (url, options) => {
        calledUrl = url;
        capturedOptions = options;
        return {
          success: true,
          message: 'Admin coupons retrieved successfully',
          data: {
            coupons: [
              {
                _id: '507f1f77bcf86cd799439011',
                code: 'FESTIVE25',
                type: 'percentage',
                value: 25,
                isActive: true,
              },
            ],
            pagination: {
              page: 2,
              limit: 10,
              totalCoupons: 35,
              totalPages: 4,
            },
          },
          requestId: 'test-req-001',
        };
      };

      const testSignal = new AbortController().signal;
      const result = await getAdminCoupons(
        {
          page: 2,
          limit: 10,
          search: 'FESTIVE',
          isActive: 'true',
          type: 'percentage',
          sortBy: 'createdAt',
          sortOrder: 'desc',
        },
        { signal: testSignal }
      );

      assert.equal(calledUrl, 'admin/coupons?page=2&limit=10&search=FESTIVE&isActive=true&type=percentage&sortBy=createdAt&sortOrder=desc');
      assert.equal(capturedOptions.signal, testSignal);
      assert.equal(result.coupons.length, 1);
      assert.equal(result.coupons[0].code, 'FESTIVE25');

      // Top-level mapped pagination fields consumed by AdminCouponsPage
      assert.equal(result.totalCoupons, 35);
      assert.equal(result.totalPages, 4);
      assert.equal(result.page, 2);
      assert.equal(result.limit, 10);

      // Nested pagination envelope for broader admin service contract symmetry
      assert.deepEqual(result.pagination, {
        page: 2,
        limit: 10,
        totalCoupons: 35,
        totalPages: 4,
      });
    });

    it('falls back gracefully to top-level fields when pagination object is absent (flat fallback)', async () => {
      apiClient.get = async () => ({
        success: true,
        data: {
          coupons: [{ _id: '507f1f77bcf86cd799439012', code: 'FLAT10' }],
          totalCoupons: 18,
          totalPages: 2,
          page: 1,
          limit: 10,
        },
      });

      const result = await getAdminCoupons({ page: 1, limit: 10 });
      assert.equal(result.coupons.length, 1);
      assert.equal(result.totalCoupons, 18);
      assert.equal(result.totalPages, 2);
      assert.equal(result.page, 1);
      assert.equal(result.limit, 10);
      assert.equal(result.pagination.totalCoupons, 18);
    });

    it('returns safe default pagination when response data is empty or malformed', async () => {
      apiClient.get = async () => ({
        success: true,
        data: {},
      });

      const result = await getAdminCoupons();
      assert.deepEqual(result.coupons, []);
      assert.equal(result.totalCoupons, 0);
      assert.equal(result.totalPages, 1);
      assert.equal(result.page, 1);
      assert.equal(result.limit, 10);
      assert.deepEqual(result.pagination, {
        page: 1,
        limit: 10,
        totalCoupons: 0,
        totalPages: 1,
      });
    });

    it('handles null response safely without throwing TypeError', async () => {
      apiClient.get = async () => null;

      const result = await getAdminCoupons();
      assert.deepEqual(result.coupons, []);
      assert.equal(result.totalCoupons, 0);
      assert.equal(result.totalPages, 1);
      assert.equal(result.page, 1);
      assert.equal(result.limit, 10);
    });

    it('omits empty or whitespace-only search and empty isActive filter from query string', async () => {
      let calledUrl = null;
      apiClient.get = async (url) => {
        calledUrl = url;
        return { data: { coupons: [], pagination: { totalCoupons: 0, totalPages: 1 } } };
      };

      await getAdminCoupons({ search: '   ', isActive: '' });
      assert.equal(calledUrl, 'admin/coupons');
    });

    it('deduplicates concurrent in-flight requests for the identical endpoint', async () => {
      let callCount = 0;
      let resolvePromise;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      apiClient.get = async () => {
        callCount++;
        return pendingPromise;
      };

      const p1 = getAdminCoupons({ page: 1, limit: 10 });
      const p2 = getAdminCoupons({ page: 1, limit: 10 });

      assert.equal(callCount, 1, 'apiClient.get should be called only once for identical concurrent requests');

      resolvePromise({
        data: {
          coupons: [{ code: 'CONCURRENT' }],
          pagination: { totalCoupons: 1, totalPages: 1, page: 1, limit: 10 },
        },
      });

      const [res1, res2] = await Promise.all([p1, p2]);
      assert.equal(res1.coupons[0].code, 'CONCURRENT');
      assert.equal(res2.coupons[0].code, 'CONCURRENT');

      // Once resolved, subsequent call should initiate a new network request
      await getAdminCoupons({ page: 1, limit: 10 });
      assert.equal(callCount, 2, 'New request should execute after previous completed');
    });
  });

  describe('getAdminCouponById', () => {
    it('throws VALIDATION_ERROR when couponId is missing or empty', async () => {
      await assert.rejects(
        () => getAdminCouponById(''),
        (err) => err instanceof ApiError && err.status === 400 && err.code === 'VALIDATION_ERROR'
      );
      await assert.rejects(
        () => getAdminCouponById(null),
        (err) => err instanceof ApiError && err.status === 400 && err.code === 'VALIDATION_ERROR'
      );
    });

    it('fetches coupon by id from admin/coupons/:couponId', async () => {
      let calledUrl = null;
      apiClient.get = async (url) => {
        calledUrl = url;
        return {
          success: true,
          data: {
            coupon: {
              _id: '507f1f77bcf86cd799439011',
              code: 'SPECIAL50',
            },
          },
        };
      };

      const result = await getAdminCouponById('507f1f77bcf86cd799439011');
      assert.equal(calledUrl, 'admin/coupons/507f1f77bcf86cd799439011');
      assert.equal(result._id, '507f1f77bcf86cd799439011');
      assert.equal(result.code, 'SPECIAL50');
    });
  });

  describe('createAdminCoupon', () => {
    it('dispatches POST to admin/coupons and clears in-flight cache', async () => {
      let calledUrl = null;
      let sentPayload = null;

      apiClient.post = async (url, payload) => {
        calledUrl = url;
        sentPayload = payload;
        return {
          success: true,
          data: {
            coupon: {
              _id: '507f1f77bcf86cd799439099',
              ...payload,
            },
          },
        };
      };

      const payload = {
        code: 'NEWCOUPON',
        type: 'fixed',
        value: 150,
        isActive: true,
      };

      const res = await createAdminCoupon(payload);
      assert.equal(calledUrl, 'admin/coupons');
      assert.deepEqual(sentPayload, payload);
      assert.equal(res.coupon.code, 'NEWCOUPON');
    });
  });

  describe('updateAdminCoupon', () => {
    it('throws VALIDATION_ERROR when couponId is missing', async () => {
      await assert.rejects(
        () => updateAdminCoupon('', { value: 20 }),
        (err) => err instanceof ApiError && err.status === 400 && err.code === 'VALIDATION_ERROR'
      );
    });

    it('dispatches PATCH to admin/coupons/:couponId', async () => {
      let calledUrl = null;
      let sentPayload = null;

      apiClient.patch = async (url, payload) => {
        calledUrl = url;
        sentPayload = payload;
        return {
          success: true,
          data: {
            coupon: {
              _id: '507f1f77bcf86cd799439011',
              ...payload,
            },
          },
        };
      };

      const res = await updateAdminCoupon('507f1f77bcf86cd799439011', { value: 30 });
      assert.equal(calledUrl, 'admin/coupons/507f1f77bcf86cd799439011');
      assert.deepEqual(sentPayload, { value: 30 });
      assert.equal(res.coupon.value, 30);
    });
  });

  describe('updateAdminCouponStatus', () => {
    it('throws VALIDATION_ERROR when couponId is missing', async () => {
      await assert.rejects(
        () => updateAdminCouponStatus('', true),
        (err) => err instanceof ApiError && err.status === 400 && err.code === 'VALIDATION_ERROR'
      );
    });

    it('dispatches PATCH to admin/coupons/:couponId/status', async () => {
      let calledUrl = null;
      let sentPayload = null;

      apiClient.patch = async (url, payload) => {
        calledUrl = url;
        sentPayload = payload;
        return {
          success: true,
          data: {
            coupon: {
              _id: '507f1f77bcf86cd799439011',
              isActive: payload.isActive,
            },
          },
        };
      };

      const res = await updateAdminCouponStatus('507f1f77bcf86cd799439011', false);
      assert.equal(calledUrl, 'admin/coupons/507f1f77bcf86cd799439011/status');
      assert.deepEqual(sentPayload, { isActive: false });
      assert.equal(res.coupon.isActive, false);
    });
  });

  describe('error handling and service export symmetry', () => {
    it('propagates ApiError directly without masking', async () => {
      apiClient.get = async () => {
        throw new ApiError({
          message: 'Forbidden admin access',
          status: 403,
          code: 'FORBIDDEN',
        });
      };

      await assert.rejects(
        () => getAdminCoupons(),
        (err) => err instanceof ApiError && err.status === 403 && err.code === 'FORBIDDEN'
      );
    });

    it('exports adminCouponService object containing all functions', () => {
      assert.equal(typeof adminCouponService.getAdminCoupons, 'function');
      assert.equal(typeof adminCouponService.getAdminCouponById, 'function');
      assert.equal(typeof adminCouponService.createAdminCoupon, 'function');
      assert.equal(typeof adminCouponService.updateAdminCoupon, 'function');
      assert.equal(typeof adminCouponService.updateAdminCouponStatus, 'function');
      assert.equal(typeof adminCouponService.clearAdminCouponInFlightRequests, 'function');
    });
  });
});
