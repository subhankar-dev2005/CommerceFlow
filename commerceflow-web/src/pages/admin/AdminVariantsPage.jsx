/* global queueMicrotask */
import { useState, useEffect, useCallback } from 'react';
import {
  adminInventoryService as defaultInventoryService,
  INVENTORY_ADJUSTMENT_REASONS,
} from '../../features/admin/adminInventory.service.js';
import { formatPrice } from '../../lib/utils.js';
import AdminPageHeader from '../../layouts/admin/AdminPageHeader.jsx';
import { AdminLoadingState, AdminErrorState, AdminEmptyState } from '../../layouts/admin/AdminShellStates.jsx';

/**
 * AdminVariantsPage Component
 * Route: /admin/variants
 *
 * Dedicated administrative overview for product variants across the entire catalog.
 * Reuses existing variant data models and inventory adjustment capabilities.
 */
export default function AdminVariantsPage({
  search: initialSearch = '',
  inventoryService: propInventoryService,
}) {
  const service = propInventoryService || defaultInventoryService;

  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 15, totalItems: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
  const [stockFilter, setStockFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Stock Adjustment Modal
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [adjustmentAmount, setAdjustmentAmount] = useState(0);
  const [adjustmentReason, setAdjustmentReason] = useState('stock_correction');
  const [adjustmentNote, setAdjustmentNote] = useState('');
  const [isSubmittingAdjust, setIsSubmittingAdjust] = useState(false);
  const [adjustError, setAdjustError] = useState(null);
  const [notification, setNotification] = useState(null);

  // Search debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const loadVariants = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await service.getAdminInventory({
        page,
        limit: 15,
        type: 'variant',
        search: debouncedSearch,
        stock: stockFilter,
        status: statusFilter,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });

      // Filter to variant type
      const variantItems = (res.items || []).filter((i) => i.type === 'variant');
      setItems(variantItems);
      setPagination(
        res.pagination || {
          page: 1,
          limit: 15,
          totalItems: variantItems.length,
          totalPages: 1,
        }
      );
    } catch (err) {
      setError(err?.message || 'Failed to load catalog variants.');
    } finally {
      setIsLoading(false);
    }
  }, [service, page, debouncedSearch, stockFilter, statusFilter]);

  useEffect(() => {
    let ignore = false;
    queueMicrotask(() => {
      if (!ignore) {
        loadVariants();
      }
    });
    return () => {
      ignore = true;
    };
  }, [loadVariants]);

  // Handle Adjustment Modal Open
  const handleOpenAdjust = (variantItem) => {
    setSelectedVariant(variantItem);
    setAdjustmentAmount(0);
    setAdjustmentReason('stock_correction');
    setAdjustmentNote('');
    setAdjustError(null);
  };

  const handleCloseAdjust = () => {
    setSelectedVariant(null);
    setAdjustmentAmount(0);
    setAdjustError(null);
    setIsSubmittingAdjust(false);
  };

  const handleSubmitAdjust = async (e) => {
    e.preventDefault();
    if (!selectedVariant) return;

    if (adjustmentAmount === 0) {
      setAdjustError('Adjustment amount cannot be zero.');
      return;
    }

    const nextStock = selectedVariant.stock + Number(adjustmentAmount);
    if (nextStock < 0) {
      setAdjustError(`Adjustment cannot reduce stock below zero (current: ${selectedVariant.stock}).`);
      return;
    }

    setIsSubmittingAdjust(true);
    setAdjustError(null);

    try {
      await service.adjustInventoryStock({
        productId: selectedVariant.productId,
        variantId: selectedVariant.variantId,
        adjustment: Number(adjustmentAmount),
        reason: adjustmentReason,
        note: adjustmentNote.trim(),
      });

      setNotification({
        type: 'success',
        message: `Stock for variant SKU "${selectedVariant.sku}" adjusted by ${adjustmentAmount > 0 ? '+' : ''}${adjustmentAmount}. New stock: ${nextStock}.`,
      });

      handleCloseAdjust();
      loadVariants();
    } catch (err) {
      setAdjustError(err?.message || 'Failed to submit stock adjustment.');
    } finally {
      setIsSubmittingAdjust(false);
    }
  };

  // Metric counts from current view
  const inStockCount = items.filter((i) => i.stockState === 'inStock').length;
  const lowStockCount = items.filter((i) => i.stockState === 'lowStock').length;
  const outOfStockCount = items.filter((i) => i.stockState === 'outOfStock').length;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Product Variants"
        subtitle="Catalog-wide variant overview, SKU mappings, attributes, and stock controls."
        badge={`${pagination.totalItems || items.length} Variants`}
      />

      {/* Notification Toast */}
      {notification && (
        <div
          role="status"
          className="p-4 rounded-xl text-xs font-semibold flex items-center justify-between border bg-emerald-50 text-emerald-800 border-emerald-200"
        >
          <span>{notification.message}</span>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold ml-4"
          >
            &times;
          </button>
        </div>
      )}

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-[#E4E8E5] p-5 shadow-2xs">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Variants</div>
          <div className="text-2xl font-black text-[#102A2A] mt-2">{pagination.totalItems || items.length}</div>
          <div className="text-xs text-slate-400 mt-1">Catalog SKUs</div>
        </div>
        <div className="bg-white rounded-2xl border border-[#E4E8E5] p-5 shadow-2xs">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">In Stock</div>
          <div className="text-2xl font-black text-emerald-700 mt-2">{inStockCount}</div>
          <div className="text-xs text-slate-400 mt-1">Healthy inventory</div>
        </div>
        <div className="bg-white rounded-2xl border border-[#E4E8E5] p-5 shadow-2xs">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Low Stock (&le;5)</div>
          <div className="text-2xl font-black text-amber-600 mt-2">{lowStockCount}</div>
          <div className="text-xs text-slate-400 mt-1">Reorder suggested</div>
        </div>
        <div className="bg-white rounded-2xl border border-[#E4E8E5] p-5 shadow-2xs">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Out of Stock</div>
          <div className="text-2xl font-black text-rose-600 mt-2">{outOfStockCount}</div>
          <div className="text-xs text-slate-400 mt-1">Zero units available</div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-2xl border border-[#E4E8E5] p-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between shadow-2xs">
        <div className="relative flex-1 max-w-md">
          <svg
            className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="search"
            placeholder="Search by variant SKU or product name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123C32]/20 focus:border-[#123C32]"
            aria-label="Search variants"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={stockFilter}
            onChange={(e) => {
              setStockFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123C32]/20 focus:border-[#123C32]"
            aria-label="Filter by stock state"
          >
            <option value="all">All Stock Levels</option>
            <option value="inStock">In Stock</option>
            <option value="lowStock">Low Stock (&le;5)</option>
            <option value="outOfStock">Out of Stock</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123C32]/20 focus:border-[#123C32]"
            aria-label="Filter by status"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
        </div>
      </div>

      {/* Main Table Area */}
      {isLoading ? (
        <AdminLoadingState title="Loading Catalog Variants..." subtitle="Fetching catalog variant entries." />
      ) : error ? (
        <AdminErrorState
          title="Could not load variants"
          message={error}
          onRetry={loadVariants}
        />
      ) : items.length === 0 ? (
        <AdminEmptyState
          title="No Product Variants Found"
          message={
            debouncedSearch || stockFilter !== 'all' || statusFilter !== 'all'
              ? 'No variants match your current filters. Try resetting search or stock filters.'
              : 'There are currently no multi-variant products registered in your catalog.'
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-[#E4E8E5] overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-[#EEF5F1] text-[#123C32] font-bold uppercase tracking-wider border-b border-[#D8ECE7]">
                  <tr>
                    <th scope="col" className="px-5 py-3.5">Variant SKU</th>
                    <th scope="col" className="px-5 py-3.5">Parent Product</th>
                    <th scope="col" className="px-5 py-3.5">Attributes</th>
                    <th scope="col" className="px-5 py-3.5">Price</th>
                    <th scope="col" className="px-5 py-3.5">Stock</th>
                    <th scope="col" className="px-5 py-3.5">Status</th>
                    <th scope="col" className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-4">
                        <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-md text-xs border border-slate-200">
                          {item.sku}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div>
                          <a
                            href={`/admin/products/${item.productId}`}
                            className="font-bold text-slate-900 hover:text-[#123C32] hover:underline"
                          >
                            {item.productName}
                          </a>
                          <div className="text-[11px] text-slate-400 mt-0.5">{item.category}</div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        {item.attributes && Object.keys(item.attributes).length > 0 ? (
                          <div className="flex flex-wrap gap-1.5" data-testid="variant-attributes-list">
                            {Object.entries(item.attributes).map(([key, val]) => (
                              <span
                                key={key}
                                className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-800 border border-slate-200"
                              >
                                <span className="text-slate-500 font-normal mr-1">{key}:</span>
                                {String(val)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-[#123C32] border border-emerald-200">
                            {item.variantName || 'Standard Variant'}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 font-mono font-bold text-slate-800">
                        {formatPrice(item.price)}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${
                            item.stockState === 'outOfStock'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : item.stockState === 'lowStock'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}
                        >
                          {item.stock} in stock
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                            item.isActive
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          {item.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenAdjust(item)}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                          >
                            Adjust Stock
                          </button>
                          <a
                            href={`/admin/products/${item.productId}/edit`}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[#EEF5F1] text-[#123C32] hover:bg-[#d5e8dd] transition-colors"
                          >
                            Edit
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination Controls */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-slate-500 pt-2">
              <div>
                Page {pagination.page} of {pagination.totalPages} ({pagination.totalItems} variants)
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 font-semibold disabled:opacity-40 hover:bg-slate-50 transition-colors"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => Math.min(p + 1, pagination.totalPages))}
                  className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 font-semibold disabled:opacity-40 hover:bg-slate-50 transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stock Adjustment Modal */}
      {selectedVariant && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="adjust-stock-title"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-100">
            <h2 id="adjust-stock-title" className="text-base font-bold text-slate-900">
              Adjust Variant Stock
            </h2>
            <div className="p-3 bg-slate-50 rounded-xl text-xs space-y-1 border border-slate-100">
              <div className="font-bold text-slate-800">{selectedVariant.productName}</div>
              <div className="text-slate-500 font-mono">SKU: {selectedVariant.sku}</div>
              <div className="text-slate-600">Current Stock: <strong>{selectedVariant.stock}</strong></div>
              {selectedVariant.attributes && Object.keys(selectedVariant.attributes).length > 0 && (
                <div className="flex flex-wrap gap-1 text-[11px] pt-1">
                  {Object.entries(selectedVariant.attributes).map(([k, v]) => (
                    <span key={k} className="px-1.5 py-0.5 rounded bg-slate-200/70 text-slate-700">
                      {k}: {String(v)}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {adjustError && (
              <div role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-semibold">
                {adjustError}
              </div>
            )}

            <form onSubmit={handleSubmitAdjust} className="space-y-4">
              <div>
                <label htmlFor="adjust-amount-input" className="block text-xs font-bold text-slate-700 mb-1">
                  Stock Adjustment (+ to add, - to reduce)
                </label>
                <input
                  id="adjust-amount-input"
                  type="number"
                  step="1"
                  value={adjustmentAmount}
                  onChange={(e) => setAdjustmentAmount(parseInt(e.target.value, 10) || 0)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123C32]/20 focus:border-[#123C32]"
                  required
                  disabled={isSubmittingAdjust}
                />
                <div className="text-[11px] text-slate-400 mt-1">
                  Resulting Stock: <strong>{selectedVariant.stock + Number(adjustmentAmount)}</strong>
                </div>
              </div>

              <div>
                <label htmlFor="adjust-reason-select" className="block text-xs font-bold text-slate-700 mb-1">
                  Adjustment Reason
                </label>
                <select
                  id="adjust-reason-select"
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123C32]/20 focus:border-[#123C32]"
                  disabled={isSubmittingAdjust}
                >
                  {INVENTORY_ADJUSTMENT_REASONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="adjust-note-input" className="block text-xs font-bold text-slate-700 mb-1">
                  Optional Note / Reference
                </label>
                <input
                  id="adjust-note-input"
                  type="text"
                  placeholder="e.g. PO-89241 recount"
                  value={adjustmentNote}
                  onChange={(e) => setAdjustmentNote(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123C32]/20 focus:border-[#123C32]"
                  disabled={isSubmittingAdjust}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleCloseAdjust}
                  disabled={isSubmittingAdjust}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAdjust}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#123C32] text-white hover:bg-[#0E332B] transition-colors disabled:opacity-50"
                >
                  {isSubmittingAdjust ? 'Adjusting...' : 'Save Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
