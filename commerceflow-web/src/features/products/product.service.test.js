import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getProducts,
  getCategories,
  getCachedCategories,
  invalidateCategoriesCache,
  clearInFlightProductsCache,
} from './product.service.js';
import { apiClient } from '../../lib/apiClient.js';

describe('product.service — In-Flight Request Deduplication & Categories Caching', () => {
  let originalGet;

  beforeEach(() => {
    originalGet = apiClient.get;
    invalidateCategoriesCache();
    clearInFlightProductsCache();
  });

  afterEach(() => {
    apiClient.get = originalGet;
    invalidateCategoriesCache();
    clearInFlightProductsCache();
  });

  it('1. getProducts deduplicates concurrent in-flight requests for identical queries', async () => {
    let callCount = 0;
    apiClient.get = async () => {
      callCount += 1;
      await new Promise((r) => setTimeout(r, 20));
      return {
        data: {
          products: [{ _id: 'prod1', name: 'Shoes' }],
          pagination: { page: 1, limit: 12, totalProducts: 1, totalPages: 1 },
        },
      };
    };

    const p1 = getProducts({ limit: 12, sortBy: 'createdAt', sortOrder: 'desc' });
    const p2 = getProducts({ limit: 12, sortBy: 'createdAt', sortOrder: 'desc' });

    const [res1, res2] = await Promise.all([p1, p2]);

    assert.strictEqual(callCount, 1, 'Only one network call must occur for identical concurrent queries');
    assert.deepStrictEqual(res1.products, [{ _id: 'prod1', name: 'Shoes' }]);
    assert.deepStrictEqual(res2.products, [{ _id: 'prod1', name: 'Shoes' }]);
  });

  it('2. getProducts issues a separate network call for different queries', async () => {
    let callCount = 0;
    apiClient.get = async () => {
      callCount += 1;
      return {
        data: {
          products: [],
          pagination: { page: 1, limit: 10, totalProducts: 0, totalPages: 0 },
        },
      };
    };

    await getProducts({ page: 1, limit: 12 });
    await getProducts({ page: 2, limit: 12 });

    assert.strictEqual(callCount, 2, 'Distinct queries must make separate network calls');
  });

  it('3. getCategories caches results and deduplicates in-flight calls', async () => {
    let callCount = 0;
    apiClient.get = async () => {
      callCount += 1;
      await new Promise((r) => setTimeout(r, 20));
      return {
        data: {
          categories: ['Apparel', 'Footwear', 'Gear'],
        },
      };
    };

    assert.strictEqual(getCachedCategories(), null, 'Initially cached categories must be null');

    // Concurrent initial calls
    const [cats1, cats2] = await Promise.all([getCategories(), getCategories()]);

    assert.strictEqual(callCount, 1, 'Only one network call for concurrent getCategories');
    assert.deepStrictEqual(cats1, ['Apparel', 'Footwear', 'Gear']);
    assert.deepStrictEqual(cats2, ['Apparel', 'Footwear', 'Gear']);

    // Subsequent call uses in-memory cache
    const cats3 = await getCategories();
    assert.strictEqual(callCount, 1, 'Subsequent call must use in-memory cache');
    assert.deepStrictEqual(cats3, ['Apparel', 'Footwear', 'Gear']);

    // Synchronous helper also returns cached data
    assert.deepStrictEqual(getCachedCategories(), ['Apparel', 'Footwear', 'Gear']);
  });

  it('4. invalidateCategoriesCache clears cached categories and triggers new fetch', async () => {
    let callCount = 0;
    apiClient.get = async () => {
      callCount += 1;
      return {
        data: {
          categories: [`Category_${callCount}`],
        },
      };
    };

    const first = await getCategories();
    assert.strictEqual(first[0], 'Category_1');
    assert.strictEqual(callCount, 1);

    invalidateCategoriesCache();
    assert.strictEqual(getCachedCategories(), null);

    const second = await getCategories();
    assert.strictEqual(second[0], 'Category_2');
    assert.strictEqual(callCount, 2);
  });
});
