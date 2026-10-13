import { apiClient } from '../../lib/apiClient.js';

export const VALID_SALES_PERIODS = ['7d', '30d', '90d'];

// Active in-flight admin dashboard requests for deduplication
const inFlightDashboardRequests = new Map();

/**
 * Clear in-flight admin dashboard requests (primarily for testing and reset handlers).
 */
export function clearAdminDashboardInFlightRequests() {
  inFlightDashboardRequests.clear();
}

/**
 * Fetch consolidated server-authoritative admin dashboard summary data.
 * Consumes: GET /api/v1/admin/dashboard/summary
 *
 * @param {Object} [options={}]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{
 *   summary: {
 *     totalProducts: number,
 *     activeProducts: number,
 *     totalOrders: number,
 *     pendingOrders: number,
 *     lowStockProducts: number,
 *     outOfStockProducts: number,
 *     totalCategories: number,
 *     totalRevenue: number
 *   },
 *   sales: {
 *     period: string,
 *     currency: string,
 *     points: Array<{ date: string, revenue: number, orderCount: number }>,
 *     totalRevenue: number
 *   },
 *   recentOrders: Array<Object>,
 *   recentProducts: Array<Object>,
 *   topSellingProducts: Array<Object>
 * }>}
 */
export async function getDashboardSummary({ signal } = {}) {
  const cacheKey = 'admin/dashboard/summary';
  if (inFlightDashboardRequests.has(cacheKey)) {
    return inFlightDashboardRequests.get(cacheKey);
  }

  const promise = (async () => {
    try {
      const response = await apiClient.get('admin/dashboard/summary', { signal });

      const data = response?.data || {};

      return {
        summary: {
          totalProducts: Number(data.summary?.totalProducts) || 0,
          activeProducts: Number(data.summary?.activeProducts) || 0,
          totalOrders: Number(data.summary?.totalOrders) || 0,
          pendingOrders: Number(data.summary?.pendingOrders) || 0,
          lowStockProducts: Number(data.summary?.lowStockProducts) || 0,
          outOfStockProducts: Number(data.summary?.outOfStockProducts) || 0,
          totalCategories: Number(data.summary?.totalCategories) || 0,
          totalRevenue: Number(data.summary?.totalRevenue) || 0,
        },
        sales: {
          period: data.sales?.period || '7d',
          currency: data.sales?.currency || 'INR',
          points: Array.isArray(data.sales?.points) ? data.sales.points : [],
          totalRevenue: Number(data.sales?.totalRevenue) || 0,
        },
        recentOrders: Array.isArray(data.recentOrders) ? data.recentOrders : [],
        recentProducts: Array.isArray(data.recentProducts) ? data.recentProducts : [],
        topSellingProducts: Array.isArray(data.topSellingProducts) ? data.topSellingProducts : [],
      };
    } finally {
      inFlightDashboardRequests.delete(cacheKey);
    }
  })();

  inFlightDashboardRequests.set(cacheKey, promise);
  return promise;
}

/**
 * Fetch authoritative sales aggregation for a specific period.
 * Consumes: GET /api/v1/admin/dashboard/sales?period=7d
 *
 * @param {'7d'|'30d'|'90d'} [period='7d']
 * @param {Object} [options={}]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{
 *   period: string,
 *   currency: string,
 *   points: Array<{ date: string, revenue: number, orderCount: number }>,
 *   totalRevenue: number
 * }>}
 */
export async function getDashboardSales(period = '7d', { signal } = {}) {
  const normalizedPeriod = VALID_SALES_PERIODS.includes(period) ? period : '7d';
  const cacheKey = `admin/dashboard/sales:${normalizedPeriod}`;

  if (inFlightDashboardRequests.has(cacheKey)) {
    return inFlightDashboardRequests.get(cacheKey);
  }

  const promise = (async () => {
    try {
      const response = await apiClient.get(`admin/dashboard/sales?period=${encodeURIComponent(normalizedPeriod)}`, {
        signal,
      });

      const sales = response?.data?.sales || {};

      return {
        period: sales.period || normalizedPeriod,
        currency: sales.currency || 'INR',
        points: Array.isArray(sales.points) ? sales.points : [],
        totalRevenue: Number(sales.totalRevenue) || 0,
      };
    } finally {
      inFlightDashboardRequests.delete(cacheKey);
    }
  })();

  inFlightDashboardRequests.set(cacheKey, promise);
  return promise;
}

/**
 * Fetch top selling products by order line-item history.
 * Consumes: GET /api/v1/admin/dashboard/top-products
 *
 * @param {Object} [options={}]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<Array<Object>>}
 */
export async function getTopSellingProducts({ signal } = {}) {
  const cacheKey = 'admin/dashboard/top-products';

  if (inFlightDashboardRequests.has(cacheKey)) {
    return inFlightDashboardRequests.get(cacheKey);
  }

  const promise = (async () => {
    try {
      const response = await apiClient.get('admin/dashboard/top-products', { signal });
      return Array.isArray(response?.data?.topSellingProducts) ? response.data.topSellingProducts : [];
    } finally {
      inFlightDashboardRequests.delete(cacheKey);
    }
  })();

  inFlightDashboardRequests.set(cacheKey, promise);
  return promise;
}

export const adminDashboardService = {
  getDashboardSummary,
  getDashboardSales,
  getTopSellingProducts,
  clearAdminDashboardInFlightRequests,
};

export default adminDashboardService;
