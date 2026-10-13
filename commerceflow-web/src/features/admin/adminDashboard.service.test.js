import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { apiClient } from '../../lib/apiClient.js';
import {
  getDashboardSummary,
  getDashboardSales,
  getTopSellingProducts,
  VALID_SALES_PERIODS,
  clearAdminDashboardInFlightRequests,
} from './adminDashboard.service.js';

describe('adminDashboard.service Unit Tests', () => {
  let originalGet;

  beforeEach(() => {
    originalGet = apiClient.get;
    clearAdminDashboardInFlightRequests();
  });

  afterEach(() => {
    apiClient.get = originalGet;
    clearAdminDashboardInFlightRequests();
  });

  describe('VALID_SALES_PERIODS', () => {
    it('defines supported period filters: 7d, 30d, 90d', () => {
      assert.deepEqual(VALID_SALES_PERIODS, ['7d', '30d', '90d']);
    });
  });

  describe('getDashboardSummary', () => {
    it('fetches and normalizes consolidated summary payload from backend', async () => {
      const mockPayload = {
        data: {
          summary: {
            totalProducts: 18,
            activeProducts: 14,
            totalOrders: 9,
            pendingOrders: 2,
            lowStockProducts: 3,
            outOfStockProducts: 1,
            totalCategories: 4,
            totalRevenue: 45000,
          },
          sales: {
            period: '7d',
            currency: 'INR',
            points: [
              { date: '2026-10-01', revenue: 5000, orderCount: 1 },
              { date: '2026-10-02', revenue: 8000, orderCount: 2 },
            ],
            totalRevenue: 13000,
          },
          recentOrders: [
            { _id: 'ord_1', total: 5000, status: 'confirmed' },
          ],
          recentProducts: [
            { _id: 'prod_1', name: 'Alpine Tent', stock: 10, isActive: true },
          ],
          topSellingProducts: [
            { productId: 'prod_1', name: 'Alpine Tent', unitsSold: 5, revenue: 25000 },
          ],
        },
      };

      apiClient.get = async (url) => {
        assert.equal(url, 'admin/dashboard/summary');
        return mockPayload;
      };

      const result = await getDashboardSummary();

      assert.equal(result.summary.totalProducts, 18);
      assert.equal(result.summary.activeProducts, 14);
      assert.equal(result.summary.totalOrders, 9);
      assert.equal(result.summary.pendingOrders, 2);
      assert.equal(result.summary.lowStockProducts, 3);
      assert.equal(result.summary.outOfStockProducts, 1);
      assert.equal(result.summary.totalCategories, 4);
      assert.equal(result.summary.totalRevenue, 45000);
      assert.equal(result.sales.period, '7d');
      assert.equal(result.sales.currency, 'INR');
      assert.equal(result.sales.points.length, 2);
      assert.equal(result.recentOrders.length, 1);
      assert.equal(result.recentProducts.length, 1);
      assert.equal(result.topSellingProducts.length, 1);
    });

    it('gracefully handles empty/missing fields with safe defaults', async () => {
      apiClient.get = async () => ({ data: {} });

      const result = await getDashboardSummary();

      assert.deepEqual(result.summary, {
        totalProducts: 0,
        activeProducts: 0,
        totalOrders: 0,
        pendingOrders: 0,
        lowStockProducts: 0,
        outOfStockProducts: 0,
        totalCategories: 0,
        totalRevenue: 0,
      });
      assert.equal(result.sales.period, '7d');
      assert.equal(result.sales.currency, 'INR');
      assert.deepEqual(result.sales.points, []);
      assert.deepEqual(result.recentOrders, []);
      assert.deepEqual(result.recentProducts, []);
      assert.deepEqual(result.topSellingProducts, []);
    });

    it('deduplicates concurrent in-flight getDashboardSummary requests', async () => {
      let callCount = 0;
      apiClient.get = async () => {
        callCount++;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { data: { summary: { totalProducts: 5 } } };
      };

      const [res1, res2] = await Promise.all([
        getDashboardSummary(),
        getDashboardSummary(),
      ]);

      assert.equal(callCount, 1, 'Concurrent calls must share single in-flight request');
      assert.equal(res1.summary.totalProducts, 5);
      assert.equal(res2.summary.totalProducts, 5);
    });
  });

  describe('getDashboardSales', () => {
    it('fetches sales with specified period (30d)', async () => {
      apiClient.get = async (url) => {
        assert.equal(url, 'admin/dashboard/sales?period=30d');
        return {
          data: {
            sales: {
              period: '30d',
              currency: 'INR',
              points: [{ date: '2026-10-01', revenue: 2000, orderCount: 1 }],
              totalRevenue: 2000,
            },
          },
        };
      };

      const result = await getDashboardSales('30d');
      assert.equal(result.period, '30d');
      assert.equal(result.points.length, 1);
      assert.equal(result.totalRevenue, 2000);
    });

    it('defaults invalid period to 7d', async () => {
      apiClient.get = async (url) => {
        assert.equal(url, 'admin/dashboard/sales?period=7d');
        return {
          data: {
            sales: {
              period: '7d',
              currency: 'INR',
              points: [],
              totalRevenue: 0,
            },
          },
        };
      };

      const result = await getDashboardSales('invalid');
      assert.equal(result.period, '7d');
    });
  });

  describe('getTopSellingProducts', () => {
    it('fetches top selling products', async () => {
      apiClient.get = async (url) => {
        assert.equal(url, 'admin/dashboard/top-products');
        return {
          data: {
            topSellingProducts: [{ productId: 'p1', name: 'Sleeping Bag', unitsSold: 8, revenue: 16000 }],
          },
        };
      };

      const result = await getTopSellingProducts();
      assert.equal(result.length, 1);
      assert.equal(result[0].name, 'Sleeping Bag');
      assert.equal(result[0].unitsSold, 8);
    });
  });
});
