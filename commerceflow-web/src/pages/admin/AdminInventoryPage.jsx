import { useState, useEffect, useCallback } from 'react';
import {
  adminInventoryService,
  INVENTORY_ADJUSTMENT_REASONS
} from '../../features/admin/adminInventory.service.js';
import AdminPageHeader from '../../layouts/admin/AdminPageHeader.jsx';
import { AdminLoadingState, AdminErrorState, AdminEmptyState } from '../../layouts/admin/AdminShellStates.jsx';

/**
 * Product thumbnail image with error fallback.
 */
function InventoryThumbnail({ src, alt, className = 'w-10 h-10' }) {
  const [hasError, setHasError] = useState(!src);

  if (hasError || !src) {
    return (
      <div
        className={`${className} rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 text-slate-400`}
        aria-hidden="true"
      >
        <svg className="w-5 h-5 stroke-[1.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
        </svg>
      </div>
    );
  }

  return (
    <div className={`${className} rounded-xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden shrink-0`}>
      <img
        src={src}
        alt={alt || 'Product'}
        onError={() => setHasError(true)}
        className="w-full h-full object-contain p-0.5"
      />
    </div>
  );
}

/**
 * Stock State Badge Helper.
 */
function StockStateBadge({ stockState, stock }) {
  if (stockState === 'outOfStock' || stock <= 0) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
        Out of Stock (0)
      </span>
    );
  }
  if (stockState === 'lowStock' || stock <= 5) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
        Low Stock ({stock})
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
      In Stock ({stock})
    </span>
  );
}

export default function AdminInventoryPage({ search: searchProp = '' }) {
  const queryParams = typeof window !== 'undefined' && window.URLSearchParams
    ? new window.URLSearchParams(searchProp || window.location.search)
    : { get: () => null };

  const initialSearch = queryParams.get('search') || '';
  const initialStock = queryParams.get('stock') || 'all';
  const initialType = queryParams.get('type') || 'all';
  const initialStatus = queryParams.get('status') || 'all';
  const initialPage = parseInt(queryParams.get('page'), 10) || 1;

  // Query parameters state
  const [page, setPage] = useState(initialPage);
  const [search, setSearch] = useState(initialSearch);
  const [appliedSearch, setAppliedSearch] = useState(initialSearch);
  const [stockFilter, setStockFilter] = useState(initialStock);
  const [typeFilter, setTypeFilter] = useState(initialType);
  const [statusFilter, setStatusFilter] = useState(initialStatus);

  // Data states
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({
    totalProducts: 0,
    totalStock: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
    lowStockThreshold: 5
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    totalProducts: 0,
    totalItems: 0,
    totalPages: 1
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Adjustment Modal State
  const [selectedItem, setSelectedItem] = useState(null);
  const [adjustmentAmount, setAdjustmentAmount] = useState(0);
  const [adjustmentReason, setAdjustmentReason] = useState('stock_correction');
  const [adjustmentNote, setAdjustmentNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);

  // Fetch inventory data
  const fetchInventory = useCallback(async (signal) => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await adminInventoryService.getAdminInventory(
        {
          page,
          limit: 10,
          search: appliedSearch,
          stock: stockFilter,
          type: typeFilter,
          status: statusFilter,
          sortBy: 'createdAt',
          sortOrder: 'desc'
        },
        { signal }
      );

      setItems(data.items || []);
      setSummary(data.summary || {});
      setPagination(data.pagination || { page: 1, limit: 10, totalPages: 1 });
    } catch (err) {
      if (err?.name === 'AbortError') return;
      if (err?.status === 429) {
        const retrySecs = err?.retryAfter;
        setError(
          retrySecs
            ? `Too many requests. Rate limit cooldown active. Please retry in ${retrySecs} seconds.`
            : 'Too many requests. Please try again shortly.'
        );
      } else {
        setError(err?.message || 'Failed to load inventory records.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [page, appliedSearch, stockFilter, typeFilter, statusFilter]);

  useEffect(() => {
    let ignore = false;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!ignore) {
        fetchInventory(controller.signal);
      }
    });

    return () => {
      ignore = true;
      controller.abort();
    };
  }, [fetchInventory]);

  // Handle Search Input with Enter / Button
  const handleSearchSubmit = (e) => {
    e?.preventDefault();
    setPage(1);
    setAppliedSearch(search);
  };

  const handleClearSearch = () => {
    setSearch('');
    setAppliedSearch('');
    setPage(1);
  };

  // Open adjustment modal for a specific line item
  const handleOpenAdjustModal = (item) => {
    setSelectedItem(item);
    setAdjustmentAmount(0);
    setAdjustmentReason('stock_correction');
    setAdjustmentNote('');
    setModalError(null);
  };

  const handleCloseAdjustModal = () => {
    setSelectedItem(null);
    setAdjustmentAmount(0);
    setModalError(null);
  };

  // Submit manual adjustment
  const handleConfirmAdjustment = async (e) => {
    e.preventDefault();
    if (!selectedItem) return;

    if (adjustmentAmount === 0) {
      setModalError('Adjustment amount cannot be zero.');
      return;
    }

    const resultingStock = selectedItem.stock + adjustmentAmount;
    if (resultingStock < 0) {
      setModalError(`Cannot reduce stock below zero. Current stock is ${selectedItem.stock}.`);
      return;
    }

    setIsSubmitting(true);
    setModalError(null);

    try {
      const res = await adminInventoryService.adjustInventoryStock({
        productId: selectedItem.productId,
        variantId: selectedItem.variantId || undefined,
        adjustment: adjustmentAmount,
        reason: adjustmentReason,
        note: adjustmentNote
      });

      const updatedStock = res.adjustment?.resultingStock ?? resultingStock;
      setActionSuccess(
        `Successfully adjusted stock for ${selectedItem.productName}${
          selectedItem.variantName ? ` (${selectedItem.variantName})` : ''
        }. New stock: ${updatedStock}.`
      );

      handleCloseAdjustModal();
      // Refresh inventory directory
      fetchInventory();

      // Clear success notification after 5 seconds
      setTimeout(() => setActionSuccess(null), 5000);
    } catch (err) {
      setModalError(err?.message || 'Failed to apply inventory adjustment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <AdminPageHeader
        title="Inventory Management"
        subtitle="Monitor current stock levels, track individual variant quantities, and execute server-authoritative manual stock adjustments."
        badge="P1.6.6+ Core"
      />

      {/* Action Success Toast */}
      {actionSuccess && (
        <div
          role="status"
          className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm font-semibold flex items-center justify-between shadow-xs animate-fadeIn"
        >
          <div className="flex items-center gap-2.5">
            <svg className="w-5 h-5 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>{actionSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionSuccess(null)}
            className="text-emerald-700 hover:text-emerald-900 p-1"
            aria-label="Dismiss message"
          >
            &times;
          </button>
        </div>
      )}

      {/* KPI Metric Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="bg-white rounded-2xl border border-[#E4E8E5] p-5 sm:p-6 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Catalog Products</span>
            <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900">
            {summary.totalProducts ?? 0}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Total managed catalog entries</p>
        </div>

        <div className="bg-white rounded-2xl border border-[#E4E8E5] p-5 sm:p-6 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Stock Units</span>
            <div className="w-8 h-8 rounded-xl bg-[#EEF5F1] text-[#123C32] flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-[#123C32]">
            {summary.totalStock ?? 0}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Aggregate physical items in warehouse</p>
        </div>

        <div className="bg-white rounded-2xl border border-[#E4E8E5] p-5 sm:p-6 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Low Stock (&le; 5)</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-amber-600">
            {summary.lowStockCount ?? 0}
          </div>
          <p className="text-[11px] text-amber-700/80 mt-1">Items requiring replenishment</p>
        </div>

        <div className="bg-white rounded-2xl border border-[#E4E8E5] p-5 sm:p-6 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Out of Stock (0)</span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-rose-600">
            {summary.outOfStockCount ?? 0}
          </div>
          <p className="text-[11px] text-rose-700/80 mt-1">Depleted items unable to checkout</p>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-white rounded-2xl border border-[#E4E8E5] p-4 sm:p-5 shadow-2xs space-y-4">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Search Form */}
          <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by product name, SKU, or variant SKU..."
                className="w-full pl-10 pr-10 py-2.5 text-xs sm:text-sm bg-[#F7F6F1] border border-[#E4E8E5] rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#123C32]/30 focus:border-[#123C32]"
              />
              {search && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                  aria-label="Clear search"
                >
                  &times;
                </button>
              )}
            </div>
            <button
              type="submit"
              className="px-4 py-2.5 bg-[#123C32] text-white text-xs sm:text-sm font-semibold rounded-xl hover:bg-[#0E332B] transition-colors shrink-0"
            >
              Search
            </button>
          </form>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Stock Level Filter */}
            <select
              value={stockFilter}
              onChange={(e) => {
                setStockFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 text-xs bg-[#F7F6F1] border border-[#E4E8E5] rounded-xl text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-[#123C32]"
              aria-label="Filter by Stock Level"
            >
              <option value="all">Stock: All</option>
              <option value="inStock">Stock: In Stock (&gt;0)</option>
              <option value="lowStock">Stock: Low (&le; 5)</option>
              <option value="outOfStock">Stock: Out of Stock (0)</option>
            </select>

            {/* Product Type Filter */}
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 text-xs bg-[#F7F6F1] border border-[#E4E8E5] rounded-xl text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-[#123C32]"
              aria-label="Filter by Product Type"
            >
              <option value="all">Type: All</option>
              <option value="simple">Type: Simple Products</option>
              <option value="variant">Type: Variant Products</option>
            </select>

            {/* Active Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 text-xs bg-[#F7F6F1] border border-[#E4E8E5] rounded-xl text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-[#123C32]"
              aria-label="Filter by Storefront Status"
            >
              <option value="all">Status: All</option>
              <option value="active">Status: Active</option>
              <option value="inactive">Status: Inactive</option>
            </select>

            {/* Refresh Button */}
            <button
              type="button"
              onClick={() => fetchInventory()}
              className="p-2 text-slate-600 hover:text-slate-900 rounded-xl border border-[#E4E8E5] hover:bg-slate-50 transition-colors"
              title="Refresh Inventory"
              aria-label="Refresh inventory list"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <AdminLoadingState
          title="Loading inventory records..."
          subtitle="Synchronizing product variants, SKUs, and stock quantities..."
        />
      ) : error ? (
        <AdminErrorState
          title="Unable to load inventory records"
          message={error}
          onRetry={() => fetchInventory()}
        />
      ) : items.length === 0 ? (
        <AdminEmptyState
          title="No inventory records found"
          message={
            appliedSearch || stockFilter !== 'all' || typeFilter !== 'all' || statusFilter !== 'all'
              ? 'No products or variants match your active filter criteria. Try clearing search or adjusting filters.'
              : 'Your store catalog has no product records yet.'
          }
          actionLabel={appliedSearch ? 'Clear Search' : 'Reset Filters'}
          onAction={() => {
            setSearch('');
            setAppliedSearch('');
            setStockFilter('all');
            setTypeFilter('all');
            setStatusFilter('all');
            setPage(1);
          }}
        />
      ) : (
        <div className="bg-white rounded-2xl border border-[#E4E8E5] shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-[#F7F6F1] border-b border-[#E4E8E5] text-slate-600 font-bold uppercase text-[10px] sm:text-[11px] tracking-wider">
                  <th scope="col" className="py-3.5 px-4 sm:px-6">Product Item</th>
                  <th scope="col" className="py-3.5 px-4">SKU / Identifier</th>
                  <th scope="col" className="py-3.5 px-3">Type</th>
                  <th scope="col" className="py-3.5 px-4">Variant Specification</th>
                  <th scope="col" className="py-3.5 px-4 text-center">Current Stock</th>
                  <th scope="col" className="py-3.5 px-3 text-center">Status</th>
                  <th scope="col" className="py-3.5 px-4 sm:px-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/75 transition-colors">
                    {/* Product Name & Thumbnail */}
                    <td className="py-3 px-4 sm:px-6">
                      <div className="flex items-center gap-3">
                        <InventoryThumbnail src={item.productImage} alt={item.productName} />
                        <div className="min-w-0">
                          <span className="font-bold text-slate-900 block truncate max-w-[200px] sm:max-w-xs">
                            {item.productName}
                          </span>
                          <span className="text-[11px] text-slate-400 block truncate">
                            {item.category || 'General'}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* SKU */}
                    <td className="py-3 px-4">
                      <span className="font-mono text-xs text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                        {item.sku || '—'}
                      </span>
                    </td>

                    {/* Type Badge */}
                    <td className="py-3 px-3">
                      {item.type === 'variant' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-purple-50 text-purple-700 border border-purple-200">
                          Variant
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-slate-100 text-slate-700 border border-slate-200">
                          Simple
                        </span>
                      )}
                    </td>

                    {/* Variant Specification */}
                    <td className="py-3 px-4">
                      {item.type === 'variant' ? (
                        <div className="space-y-0.5">
                          <span className="text-xs font-semibold text-slate-900 block">
                            {item.variantName || '—'}
                          </span>
                          {item.attributes && Object.keys(item.attributes).length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-0.5" data-testid="inventory-variant-attributes">
                              {Object.entries(item.attributes).map(([key, val]) => (
                                <span
                                  key={key}
                                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-800 border border-slate-200"
                                >
                                  <span className="text-slate-500 font-normal mr-0.5">{key}:</span>
                                  {String(val)}
                                </span>
                              ))}
                            </div>
                          )}
                          <span className="text-[10px] text-slate-400 font-mono block">
                            ID: {item.variantId}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">No variant (Standard item)</span>
                      )}
                    </td>

                    {/* Current Stock & Badge */}
                    <td className="py-3 px-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-base font-black text-slate-900 font-mono">
                          {item.stock}
                        </span>
                        <StockStateBadge stockState={item.stockState} stock={item.stock} />
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-3 px-3 text-center">
                      {item.isActive ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                          Inactive
                        </span>
                      )}
                    </td>

                    {/* Action: Adjust Stock */}
                    <td className="py-3 px-4 sm:px-6 text-right">
                      <button
                        type="button"
                        onClick={() => handleOpenAdjustModal(item)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#EEF5F1] text-[#123C32] hover:bg-[#123C32] hover:text-white text-xs font-bold transition-all shadow-2xs border border-[#123C32]/10"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        Adjust
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {pagination.totalPages > 1 && (
            <div className="p-4 sm:p-5 border-t border-[#E4E8E5] bg-[#F7F6F1] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
              <div>
                Showing page <span className="font-bold text-slate-900">{pagination.page}</span> of{' '}
                <span className="font-bold text-slate-900">{pagination.totalPages}</span> (
                {pagination.totalProducts} catalog products)
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={pagination.page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-xl border border-[#E4E8E5] bg-white text-slate-700 font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
                >
                  &larr; Previous
                </button>
                <button
                  type="button"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  className="px-3 py-1.5 rounded-xl border border-[#E4E8E5] bg-white text-slate-700 font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
                >
                  Next &rarr;
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Manual Stock Adjustment Modal */}
      {selectedItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-2xs animate-fadeIn"
          role="dialog"
          aria-modal="true"
          aria-labelledby="adjust-modal-title"
        >
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-200 animate-slideUp space-y-6">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h2 id="adjust-modal-title" className="text-lg font-black text-slate-900">
                  Manual Stock Adjustment
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Record an authoritative inventory delta for this item.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseAdjustModal}
                disabled={isSubmitting}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg text-lg font-bold"
                aria-label="Close modal"
              >
                &times;
              </button>
            </div>

            {/* Error in modal */}
            {modalError && (
              <div
                role="alert"
                className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold"
              >
                {modalError}
              </div>
            )}

            {/* Target Item Summary Box */}
            <div className="p-4 rounded-2xl bg-[#F7F6F1] border border-[#E4E8E5] space-y-2">
              <div className="text-xs font-bold text-slate-900">
                {selectedItem.productName}
              </div>
              {selectedItem.type === 'variant' && (
                <div className="text-xs text-[#123C32] font-semibold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#123C32]" />
                  Variant: {selectedItem.variantName}
                </div>
              )}
              <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-xs text-slate-600">
                <span>SKU: <span className="font-mono text-slate-900 font-bold">{selectedItem.sku || '—'}</span></span>
                <span>Current Stock: <span className="font-mono text-slate-900 font-black text-sm">{selectedItem.stock}</span></span>
              </div>
            </div>

            {/* Adjustment Form */}
            <form onSubmit={handleConfirmAdjustment} className="space-y-4">
              {/* Adjustment Quantity Input */}
              <div className="space-y-1.5">
                <label htmlFor="adjust-quantity" className="block text-xs font-bold text-slate-700">
                  Adjustment Delta (Positive to Add, Negative to Remove)
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjustmentAmount((val) => val - 1)}
                    className="w-10 h-10 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-base flex items-center justify-center shrink-0"
                    title="Subtract 1"
                  >
                    -
                  </button>
                  <input
                    id="adjust-quantity"
                    type="number"
                    step="1"
                    value={adjustmentAmount}
                    onChange={(e) => setAdjustmentAmount(parseInt(e.target.value, 10) || 0)}
                    className="flex-1 px-4 py-2 text-center text-base font-black font-mono bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#123C32]/30 focus:border-[#123C32]"
                    placeholder="e.g. 5 or -2"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setAdjustmentAmount((val) => val + 1)}
                    className="w-10 h-10 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-base flex items-center justify-center shrink-0"
                    title="Add 1"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Real-time Calculation Result Preview Box */}
              <div className={`p-3.5 rounded-xl border text-xs flex items-center justify-between font-semibold ${
                selectedItem.stock + adjustmentAmount < 0
                  ? 'bg-rose-50 border-rose-200 text-rose-700'
                  : selectedItem.stock + adjustmentAmount <= 5
                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-800'
              }`}>
                <span>Resulting Stock:</span>
                <span className="text-base font-black font-mono">
                  {selectedItem.stock + adjustmentAmount < 0 ? (
                    <span className="text-rose-600">Invalid ({selectedItem.stock + adjustmentAmount})</span>
                  ) : (
                    selectedItem.stock + adjustmentAmount
                  )}
                </span>
              </div>

              {/* Adjustment Reason Dropdown */}
              <div className="space-y-1.5">
                <label htmlFor="adjust-reason" className="block text-xs font-bold text-slate-700">
                  Adjustment Reason <span className="text-rose-500">*</span>
                </label>
                <select
                  id="adjust-reason"
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-[#F7F6F1] border border-slate-200 rounded-xl text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-[#123C32]/30 focus:border-[#123C32]"
                  required
                >
                  {INVENTORY_ADJUSTMENT_REASONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Optional Note Textarea */}
              <div className="space-y-1.5">
                <label htmlFor="adjust-note" className="block text-xs font-bold text-slate-700">
                  Internal Operational Note (Optional)
                </label>
                <textarea
                  id="adjust-note"
                  rows={2}
                  value={adjustmentNote}
                  onChange={(e) => setAdjustmentNote(e.target.value.slice(0, 500))}
                  placeholder="Additional context (e.g. pallet ID, invoice #, or damaged condition detail)..."
                  className="w-full px-3.5 py-2 text-xs sm:text-sm bg-[#F7F6F1] border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#123C32]/30 focus:border-[#123C32] resize-none"
                />
                <span className="text-[10px] text-slate-400 block text-right">
                  {adjustmentNote.length}/500 characters
                </span>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleCloseAdjustModal}
                  disabled={isSubmitting}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || adjustmentAmount === 0 || selectedItem.stock + adjustmentAmount < 0}
                  className="px-5 py-2.5 rounded-xl bg-[#123C32] text-white text-xs font-bold hover:bg-[#0E332B] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-xs"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Applying...
                    </>
                  ) : (
                    'Confirm Adjustment'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
