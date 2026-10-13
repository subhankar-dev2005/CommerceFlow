import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  recordRecentlyViewed,
  getRecentlyViewed,
  clearRecentlyViewed,
  mergeRecentlyViewed
} from './recentlyViewed.service.js';
import { apiClient } from '../../lib/apiClient.js';

const PRODUCT_ID_1 = '507f1f77bcf86cd799439011';
const PRODUCT_ID_2 = '607f1f77bcf86cd799439021';

describe('recentlyViewed.service', () => {
  let recordedCalls = [];
  let mockResponses = {};

  beforeEach(() => {
    recordedCalls = [];
    mockResponses = {};

    apiClient.get = async (endpoint, options) => {
      recordedCalls.push({ method: 'GET', endpoint, options });
      const key = `GET:${endpoint}`;
      if (mockResponses[key] instanceof Error) throw mockResponses[key];
      return mockResponses[key] ?? { data: { items: [], totalItems: 0 } };
    };

    apiClient.post = async (endpoint, body, options) => {
      recordedCalls.push({ method: 'POST', endpoint, body, options });
      const key = `POST:${endpoint}`;
      if (mockResponses[key] instanceof Error) throw mockResponses[key];
      return mockResponses[key] ?? {};
    };

    apiClient.delete = async (endpoint, options) => {
      recordedCalls.push({ method: 'DELETE', endpoint, options });
      const key = `DELETE:${endpoint}`;
      if (mockResponses[key] instanceof Error) throw mockResponses[key];
      return mockResponses[key] ?? {};
    };
  });

  describe('recordRecentlyViewed', () => {
    it('sends POST recently-viewed with { productId } body', async () => {
      const nowIso = new Date().toISOString();
      mockResponses['POST:recently-viewed'] = {
        data: { productId: PRODUCT_ID_1, viewedAt: nowIso }
      };

      const result = await recordRecentlyViewed(PRODUCT_ID_1);

      assert.strictEqual(recordedCalls.length, 1);
      assert.strictEqual(recordedCalls[0].method, 'POST');
      assert.strictEqual(recordedCalls[0].endpoint, 'recently-viewed');
      assert.deepStrictEqual(recordedCalls[0].body, { productId: PRODUCT_ID_1 });
      assert.strictEqual(result.productId, PRODUCT_ID_1);
      assert.strictEqual(result.viewedAt, nowIso);
    });

    it('rejects malformed product ID before calling API', async () => {
      await assert.rejects(
        async () => {
          await recordRecentlyViewed('invalid-id');
        },
        { message: 'Invalid product ID' }
      );
      assert.strictEqual(recordedCalls.length, 0);
    });

    it('propagates API client errors', async () => {
      const apiErr = new Error('PRODUCT_NOT_FOUND');
      apiErr.status = 404;
      mockResponses['POST:recently-viewed'] = apiErr;

      await assert.rejects(
        async () => {
          await recordRecentlyViewed(PRODUCT_ID_1);
        },
        /PRODUCT_NOT_FOUND/
      );
    });
  });

  describe('getRecentlyViewed', () => {
    it('calls GET recently-viewed without query when limit is omitted', async () => {
      mockResponses['GET:recently-viewed'] = {
        data: {
          items: [
            {
              viewedAt: '2026-10-01T10:00:00Z',
              product: { _id: PRODUCT_ID_1, name: 'Tent', price: 999 }
            }
          ],
          totalItems: 1
        }
      };

      const result = await getRecentlyViewed();

      assert.strictEqual(recordedCalls.length, 1);
      assert.strictEqual(recordedCalls[0].method, 'GET');
      assert.strictEqual(recordedCalls[0].endpoint, 'recently-viewed');
      assert.strictEqual(result.items.length, 1);
      assert.strictEqual(result.totalItems, 1);
    });

    it('appends ?limit=5 when limit parameter is provided', async () => {
      mockResponses['GET:recently-viewed?limit=5'] = {
        data: { items: [], totalItems: 0 }
      };

      await getRecentlyViewed(5);

      assert.strictEqual(recordedCalls.length, 1);
      assert.strictEqual(recordedCalls[0].endpoint, 'recently-viewed?limit=5');
    });

    it('handles unexpected response shapes gracefully', async () => {
      mockResponses['GET:recently-viewed'] = null;
      const result = await getRecentlyViewed();

      assert.deepStrictEqual(result, { items: [], totalItems: 0 });
    });

    it('propagates API client errors', async () => {
      const apiErr = new Error('AUTH_TOKEN_REQUIRED');
      apiErr.status = 401;
      mockResponses['GET:recently-viewed'] = apiErr;

      await assert.rejects(
        async () => {
          await getRecentlyViewed();
        },
        /AUTH_TOKEN_REQUIRED/
      );
    });
  });

  describe('clearRecentlyViewed', () => {
    it('calls DELETE recently-viewed', async () => {
      mockResponses['DELETE:recently-viewed'] = { success: true };

      const result = await clearRecentlyViewed();

      assert.strictEqual(recordedCalls.length, 1);
      assert.strictEqual(recordedCalls[0].method, 'DELETE');
      assert.strictEqual(recordedCalls[0].endpoint, 'recently-viewed');
      assert.deepStrictEqual(result, { success: true });
    });

    it('propagates DELETE errors', async () => {
      const apiErr = new Error('Network error');
      mockResponses['DELETE:recently-viewed'] = apiErr;

      await assert.rejects(
        async () => {
          await clearRecentlyViewed();
        },
        /Network error/
      );
    });
  });

  describe('mergeRecentlyViewed', () => {
    it('returns { mergedCount: 0 } without network call when productIds is empty or not array', async () => {
      const r1 = await mergeRecentlyViewed([]);
      assert.deepStrictEqual(r1, { mergedCount: 0 });

      const r2 = await mergeRecentlyViewed(null);
      assert.deepStrictEqual(r2, { mergedCount: 0 });

      assert.strictEqual(recordedCalls.length, 0);
    });

    it('filters invalid IDs and calls POST recently-viewed/merge', async () => {
      mockResponses['POST:recently-viewed/merge'] = {
        data: { mergedCount: 2 }
      };

      const result = await mergeRecentlyViewed([
        PRODUCT_ID_1,
        'invalid-id',
        PRODUCT_ID_2
      ]);

      assert.strictEqual(recordedCalls.length, 1);
      assert.strictEqual(recordedCalls[0].method, 'POST');
      assert.strictEqual(recordedCalls[0].endpoint, 'recently-viewed/merge');
      assert.deepStrictEqual(recordedCalls[0].body, {
        productIds: [PRODUCT_ID_1, PRODUCT_ID_2]
      });
      assert.strictEqual(result.mergedCount, 2);
    });

    it('caps sent productIds array at 12 items', async () => {
      const ids = Array.from({ length: 15 }, (_, i) => {
        return `507f1f77bcf86cd7994390${String(i).padStart(2, '0')}`;
      });

      mockResponses['POST:recently-viewed/merge'] = {
        data: { mergedCount: 12 }
      };

      await mergeRecentlyViewed(ids);

      assert.strictEqual(recordedCalls[0].body.productIds.length, 12);
    });

    it('propagates merge API errors', async () => {
      const apiErr = new Error('MERGE_FAILED');
      mockResponses['POST:recently-viewed/merge'] = apiErr;

      await assert.rejects(
        async () => {
          await mergeRecentlyViewed([PRODUCT_ID_1]);
        },
        /MERGE_FAILED/
      );
    });
  });
});
