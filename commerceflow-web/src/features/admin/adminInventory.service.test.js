import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { apiClient, ApiError } from '../../lib/apiClient.js';
import {
  getAdminInventory,
  adjustInventoryStock,
  getInventoryAdjustments,
  VALID_STOCK_FILTERS,
  VALID_STATUS_FILTERS,
  VALID_TYPE_FILTERS,
  INVENTORY_ADJUSTMENT_REASONS
} from './adminInventory.service.js';

describe('adminInventory.service Unit Tests', () => {
  let originalGet;
  let originalPost;

  beforeEach(() => {
    originalGet = apiClient.get;
    originalPost = apiClient.post;
  });

  afterEach(() => {
    apiClient.get = originalGet;
    apiClient.post = originalPost;
  });

  describe('getAdminInventory', () => {
    it('constructs correct query parameters for default listing', async () => {
      let capturedEndpoint;
      apiClient.get = async (endpoint) => {
        capturedEndpoint = endpoint;
        return {
          data: {
            items: [],
            pagination: { page: 1, limit: 10 },
            summary: { totalProducts: 0, totalStock: 0 }
          }
        };
      };

      const result = await getAdminInventory({ page: 1, limit: 10 });
      assert.equal(capturedEndpoint, 'admin/inventory?page=1&limit=10');
      assert.deepEqual(result.items, []);
    });

    it('serializes search, stock, status, and type filters', async () => {
      let capturedEndpoint;
      apiClient.get = async (endpoint) => {
        capturedEndpoint = endpoint;
        return { data: { items: [], pagination: {}, summary: {} } };
      };

      await getAdminInventory({
        page: 2,
        limit: 25,
        search: 'Tent Expedition',
        stock: 'lowStock',
        status: 'active',
        type: 'variant',
        sortBy: 'stock',
        sortOrder: 'asc'
      });

      assert.ok(capturedEndpoint.includes('page=2'));
      assert.ok(capturedEndpoint.includes('limit=25'));
      assert.ok(capturedEndpoint.includes('search=Tent+Expedition') || capturedEndpoint.includes('search=Tent%20Expedition'));
      assert.ok(capturedEndpoint.includes('stock=lowStock'));
      assert.ok(capturedEndpoint.includes('status=active'));
      assert.ok(capturedEndpoint.includes('type=variant'));
      assert.ok(capturedEndpoint.includes('sortBy=stock'));
      assert.ok(capturedEndpoint.includes('sortOrder=asc'));
    });

    it('propagates ApiError on failure', async () => {
      apiClient.get = async () => {
        throw new ApiError({
          status: 403,
          code: 'FORBIDDEN',
          message: 'Admin access required'
        });
      };

      await assert.rejects(
        async () => {
          await getAdminInventory();
        },
        (err) => err instanceof ApiError && err.code === 'FORBIDDEN'
      );
    });

    it('deduplicates concurrent in-flight requests for identical parameters', async () => {
      let callCount = 0;
      apiClient.get = async () => {
        callCount += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return {
          data: {
            items: [{ id: 'item-1', stock: 15 }],
            pagination: { page: 1, limit: 10, totalItems: 1 },
            summary: { totalProducts: 1, totalStock: 15 }
          }
        };
      };

      const [res1, res2] = await Promise.all([
        getAdminInventory({ page: 1, limit: 10 }),
        getAdminInventory({ page: 1, limit: 10 })
      ]);

      assert.strictEqual(callCount, 1, 'Concurrent calls with identical params must share one network request');
      assert.deepStrictEqual(res1, res2);
    });
  });

  describe('adjustInventoryStock', () => {
    it('sends correct POST request for simple product adjustment', async () => {
      let capturedEndpoint;
      let capturedBody;

      apiClient.post = async (endpoint, body) => {
        capturedEndpoint = endpoint;
        capturedBody = body;
        return {
          data: {
            adjustment: {
              resultingStock: 25,
              adjustment: 5
            }
          }
        };
      };

      const res = await adjustInventoryStock({
        productId: '507f1f77bcf86cd799439011',
        adjustment: 5,
        reason: 'receiving',
        note: 'Restock shipment'
      });

      assert.equal(capturedEndpoint, 'admin/inventory/adjust');
      assert.equal(capturedBody.productId, '507f1f77bcf86cd799439011');
      assert.equal(capturedBody.variantId, undefined);
      assert.equal(capturedBody.adjustment, 5);
      assert.equal(capturedBody.reason, 'receiving');
      assert.equal(capturedBody.note, 'Restock shipment');
      assert.equal(res.adjustment.resultingStock, 25);
    });

    it('sends variantId when adjusting variant stock', async () => {
      let capturedBody;
      apiClient.post = async (endpoint, body) => {
        capturedBody = body;
        return { data: { adjustment: { resultingStock: 8 } } };
      };

      await adjustInventoryStock({
        productId: '507f1f77bcf86cd799439011',
        variantId: 'var_blue_m',
        adjustment: -2,
        reason: 'damaged_inventory',
        note: 'Damaged item removed'
      });

      assert.equal(capturedBody.productId, '507f1f77bcf86cd799439011');
      assert.equal(capturedBody.variantId, 'var_blue_m');
      assert.equal(capturedBody.adjustment, -2);
      assert.equal(capturedBody.reason, 'damaged_inventory');
    });

    it('propagates 400 validation error from backend', async () => {
      apiClient.post = async () => {
        throw new ApiError({
          status: 400,
          code: 'INSUFFICIENT_STOCK_FOR_ADJUSTMENT',
          message: 'Cannot reduce stock below zero'
        });
      };

      await assert.rejects(
        async () => {
          await adjustInventoryStock({
            productId: '507f1f77bcf86cd799439011',
            adjustment: -100,
            reason: 'stock_correction'
          });
        },
        (err) => err instanceof ApiError && err.code === 'INSUFFICIENT_STOCK_FOR_ADJUSTMENT'
      );
    });
  });

  describe('getInventoryAdjustments', () => {
    it('constructs query for adjustment history', async () => {
      let capturedEndpoint;
      apiClient.get = async (endpoint) => {
        capturedEndpoint = endpoint;
        return { data: { adjustments: [], pagination: {} } };
      };

      await getInventoryAdjustments({
        productId: '507f1f77bcf86cd799439011',
        page: 1,
        limit: 10
      });

      assert.ok(capturedEndpoint.includes('productId=507f1f77bcf86cd799439011'));
      assert.ok(capturedEndpoint.includes('page=1'));
      assert.ok(capturedEndpoint.includes('limit=10'));
    });
  });

  describe('Constants Verification', () => {
    it('verifies filter options and adjustment reasons', () => {
      assert.deepEqual(VALID_STOCK_FILTERS, ['all', 'inStock', 'lowStock', 'outOfStock']);
      assert.deepEqual(VALID_STATUS_FILTERS, ['all', 'active', 'inactive']);
      assert.deepEqual(VALID_TYPE_FILTERS, ['all', 'simple', 'variant']);
      assert.ok(INVENTORY_ADJUSTMENT_REASONS.length >= 6);
      const reasonValues = INVENTORY_ADJUSTMENT_REASONS.map((r) => r.value);
      assert.ok(reasonValues.includes('stock_correction'));
      assert.ok(reasonValues.includes('damaged_inventory'));
      assert.ok(reasonValues.includes('returned_inventory'));
      assert.ok(reasonValues.includes('manual_count'));
      assert.ok(reasonValues.includes('receiving'));
      assert.ok(reasonValues.includes('other'));
    });
  });
});
