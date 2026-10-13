import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { apiClient, ApiError } from '../../lib/apiClient.js';
import {
  getAdminCategories,
  renameAdminCategory,
  deleteAdminCategory,
} from './adminCategory.service.js';

describe('Admin Category Service Tests', () => {
  let originalGet;
  let originalPatch;
  let originalDelete;

  beforeEach(() => {
    originalGet = apiClient.get;
    originalPatch = apiClient.patch;
    originalDelete = apiClient.delete;
  });

  afterEach(() => {
    apiClient.get = originalGet;
    apiClient.patch = originalPatch;
    apiClient.delete = originalDelete;
  });

  describe('getAdminCategories', () => {
    it('calls GET admin/categories with query params and returns categories', async () => {
      let requestedUrl = null;
      apiClient.get = async (url) => {
        requestedUrl = url;
        return {
          success: true,
          data: {
            categories: [
              { name: 'Apparel', totalProducts: 10, activeProducts: 9, inStockProducts: 8, outOfStockProducts: 2, totalStock: 50 },
            ],
            totalCategories: 1,
          },
        };
      };

      const result = await getAdminCategories({ search: 'App', sortBy: 'name', sortOrder: 'asc' });

      assert.ok(requestedUrl.includes('search=App'));
      assert.ok(requestedUrl.includes('sortBy=name'));
      assert.ok(requestedUrl.includes('sortOrder=asc'));
      assert.equal(result.categories.length, 1);
      assert.equal(result.categories[0].name, 'Apparel');
      assert.equal(result.totalCategories, 1);
    });

    it('deduplicates concurrent in-flight requests for identical parameters', async () => {
      let callCount = 0;
      apiClient.get = async () => {
        callCount += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return {
          success: true,
          data: {
            categories: [{ name: 'Electronics', totalProducts: 5 }],
            totalCategories: 1,
          },
        };
      };

      const [res1, res2] = await Promise.all([
        getAdminCategories({ sortBy: 'name', sortOrder: 'asc' }),
        getAdminCategories({ sortBy: 'name', sortOrder: 'asc' }),
      ]);

      assert.strictEqual(callCount, 1, 'Concurrent calls with identical params must share one network request');
      assert.deepStrictEqual(res1, res2);
    });
  });

  describe('renameAdminCategory', () => {
    it('validates non-empty current and new names', async () => {
      await assert.rejects(
        () => renameAdminCategory('', 'Shoes'),
        (err) => err instanceof ApiError && err.code === 'VALIDATION_ERROR'
      );

      await assert.rejects(
        () => renameAdminCategory('Footwear', '  '),
        (err) => err instanceof ApiError && err.code === 'VALIDATION_ERROR'
      );
    });

    it('sends PATCH to admin/categories/:name with encoded parameter', async () => {
      let calledUrl = null;
      let sentBody = null;

      apiClient.patch = async (url, body) => {
        calledUrl = url;
        sentBody = body;
        return { success: true, message: 'Renamed' };
      };

      const result = await renameAdminCategory('Foot & Gear', 'Footwear');
      assert.equal(calledUrl, 'admin/categories/Foot%20%26%20Gear');
      assert.deepEqual(sentBody, { newName: 'Footwear' });
      assert.equal(result.success, true);
    });
  });

  describe('deleteAdminCategory', () => {
    it('validates category name and calls DELETE admin/categories/:name', async () => {
      await assert.rejects(
        () => deleteAdminCategory(''),
        (err) => err instanceof ApiError && err.code === 'VALIDATION_ERROR'
      );

      let calledUrl = null;
      apiClient.delete = async (url) => {
        calledUrl = url;
        return { success: true };
      };

      const res = await deleteAdminCategory('EmptyCat');
      assert.equal(calledUrl, 'admin/categories/EmptyCat');
      assert.equal(res.success, true);
    });

    it('appends ?cascade=true when cascade option is enabled', async () => {
      let calledUrl = null;
      apiClient.delete = async (url) => {
        calledUrl = url;
        return { success: true };
      };

      await deleteAdminCategory('UsedCat', { cascade: true });
      assert.equal(calledUrl, 'admin/categories/UsedCat?cascade=true');
    });
  });
});
