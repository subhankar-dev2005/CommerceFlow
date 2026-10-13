import { apiClient } from '../../lib/apiClient.js';

export const VALID_STOCK_FILTERS = ['all', 'inStock', 'lowStock', 'outOfStock'];
export const VALID_STATUS_FILTERS = ['all', 'active', 'inactive'];
export const VALID_TYPE_FILTERS = ['all', 'simple', 'variant'];

export const INVENTORY_ADJUSTMENT_REASONS = [
  { value: 'stock_correction', label: 'Stock Correction (Recount)' },
  { value: 'damaged_inventory', label: 'Damaged / Defective Goods' },
  { value: 'returned_inventory', label: 'Returned Inventory Restock' },
  { value: 'manual_count', label: 'Cycle / Annual Count Discrepancy' },
  { value: 'receiving', label: 'New Shipment Received' },
  { value: 'other', label: 'Other Operational Adjustment' }
];

// Active in-flight admin inventory requests for deduplication
const inFlightInventoryRequests = new Map();

/**
 * Clear in-flight admin inventory requests (primarily for testing and mutations)
 */
export function clearAdminInventoryInFlightRequests() {
  inFlightInventoryRequests.clear();
}

/**
 * Fetch paginated inventory list with search and filters.
 * Consumes: GET /api/v1/admin/inventory
 * Deduplicates concurrent in-flight calls for identical parameters.
 *
 * @param {Object} [params={}]
 * @param {number} [params.page=1]
 * @param {number} [params.limit=10]
 * @param {string} [params.search]
 * @param {'all'|'inStock'|'lowStock'|'outOfStock'} [params.stock='all']
 * @param {'all'|'active'|'inactive'} [params.status='all']
 * @param {'all'|'simple'|'variant'} [params.type='all']
 * @param {'name'|'stock'|'createdAt'|'updatedAt'} [params.sortBy='createdAt']
 * @param {'asc'|'desc'} [params.sortOrder='desc']
 * @param {Object} [options={}]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<Object>}
 */
export async function getAdminInventory(params = {}, { signal } = {}) {
  const query = new URLSearchParams();

  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.search && params.search.trim()) query.set('search', params.search.trim());
  if (params.stock && params.stock !== 'all') query.set('stock', params.stock);
  if (params.status && params.status !== 'all') query.set('status', params.status);
  if (params.type && params.type !== 'all') query.set('type', params.type);
  if (params.sortBy) query.set('sortBy', params.sortBy);
  if (params.sortOrder) query.set('sortOrder', params.sortOrder);

  const queryString = query.toString();
  const endpoint = queryString ? `admin/inventory?${queryString}` : 'admin/inventory';

  if (inFlightInventoryRequests.has(endpoint)) {
    return inFlightInventoryRequests.get(endpoint);
  }

  const promise = (async () => {
    try {
      const response = await apiClient.get(endpoint, { signal });
      return response?.data || { items: [], pagination: {}, summary: {} };
    } finally {
      inFlightInventoryRequests.delete(endpoint);
    }
  })();

  inFlightInventoryRequests.set(endpoint, promise);
  return promise;
}

/**
 * Perform manual stock adjustment for a simple product or variant.
 * Consumes: POST /api/v1/admin/inventory/adjust
 *
 * @param {Object} payload
 * @param {string} payload.productId
 * @param {string|null} [payload.variantId]
 * @param {number} payload.adjustment
 * @param {string} payload.reason
 * @param {string} [payload.note]
 * @param {Object} [options={}]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<Object>}
 */
export async function adjustInventoryStock(payload, { signal } = {}) {
  const body = {
    productId: payload.productId,
    adjustment: Number(payload.adjustment),
    reason: payload.reason,
    note: payload.note ? payload.note.trim() : ''
  };

  if (payload.variantId) {
    body.variantId = payload.variantId;
  }

  const response = await apiClient.post('admin/inventory/adjust', body, { signal });
  clearAdminInventoryInFlightRequests();
  return response?.data || {};
}

/**
 * Fetch inventory adjustment history records.
 * Consumes: GET /api/v1/admin/inventory/adjustments
 *
 * @param {Object} [params={}]
 * @param {string} [params.productId]
 * @param {number} [params.page=1]
 * @param {number} [params.limit=20]
 * @param {Object} [options={}]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<Object>}
 */
export async function getInventoryAdjustments(params = {}, { signal } = {}) {
  const query = new URLSearchParams();
  if (params.productId) query.set('productId', params.productId);
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));

  const queryString = query.toString();
  const endpoint = queryString ? `admin/inventory/adjustments?${queryString}` : 'admin/inventory/adjustments';

  const response = await apiClient.get(endpoint, { signal });
  return response?.data || { adjustments: [], pagination: {} };
}

export const adminInventoryService = {
  getAdminInventory,
  adjustInventoryStock,
  getInventoryAdjustments,
  clearAdminInventoryInFlightRequests
};

export default adminInventoryService;
