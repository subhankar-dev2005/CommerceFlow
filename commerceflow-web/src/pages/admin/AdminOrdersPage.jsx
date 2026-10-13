import { useState, useEffect, useRef, useCallback } from 'react';
import {
  adminOrderService,
  VALID_STATUSES,
  VALID_PAYMENT_STATUSES,
  VALID_SORT_FIELDS,
} from '../../features/admin/adminOrder.service.js';
import { formatPrice } from '../../lib/utils.js';
import Button from '../../components/Button.jsx';
import Skeleton from '../../components/Skeleton.jsx';
import AdminPageHeader from '../../layouts/admin/AdminPageHeader.jsx';
import { AdminLoadingState, AdminErrorState, AdminEmptyState } from '../../layouts/admin/AdminShellStates.jsx';

/**
 * Format timestamp into human-readable date/time string.
 * @param {string|Date} dateString
 * @returns {string}
 */
function formatFullDate(dateString) {
  if (!dateString) return 'Not available';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return 'Not available';
    return d.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Not available';
  }
}

/**
 * Returns badge styling and label for backend order.status.
 * @param {string} status
 */
function getOrderStatusBadge(status) {
  switch (status?.toLowerCase()) {
    case 'confirmed':
      return { className: 'bg-emerald-50 text-emerald-800 border-emerald-200', label: 'Confirmed' };
    case 'processing':
      return { className: 'bg-blue-50 text-blue-700 border-blue-200', label: 'Processing' };
    case 'shipped':
      return { className: 'bg-purple-50 text-purple-700 border-purple-200', label: 'Shipped' };
    case 'delivered':
      return { className: 'bg-emerald-100 text-emerald-900 border-emerald-300', label: 'Delivered' };
    case 'cancelled':
      return { className: 'bg-rose-50 text-rose-700 border-rose-200', label: 'Cancelled' };
    case 'pending':
    default:
      return { className: 'bg-amber-50 text-amber-800 border-amber-200', label: 'Pending' };
  }
}

/**
 * Returns badge styling and label for backend payment.status.
 * @param {string} status
 */
function getPaymentStatusBadge(status) {
  switch (status?.toLowerCase()) {
    case 'pending':
      return { className: 'bg-amber-50 text-amber-800 border-amber-200', label: 'Pending' };
    case 'paid':
      return { className: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Paid' };
    case 'failed':
      return { className: 'bg-rose-50 text-rose-700 border-rose-200', label: 'Failed' };
    case 'refunded':
      return { className: 'bg-slate-100 text-slate-700 border-slate-200', label: 'Refunded' };
    default:
      return { className: 'bg-slate-50 text-slate-600 border-slate-200', label: 'Payment status unavailable' };
  }
}

/**
 * Safely instantiate an AbortController in browser environments.
 */
function createAbortController() {
  if (typeof window !== 'undefined' && window.AbortController) {
    return new window.AbortController();
  }
  return null;
}

/**
 * Parse URL search string into state object.
 */
function parseUrlParams(searchStr) {
  const params = typeof window !== 'undefined' && window.URLSearchParams
    ? new window.URLSearchParams(searchStr || '')
    : { get: () => null };
  const pageVal = parseInt(params.get('page'), 10);
  const statusVal = params.get('status') || '';
  const paymentStatusVal = params.get('paymentStatus') || '';
  const searchVal = params.get('search') || '';
  const sortByVal = params.get('sortBy') || 'createdAt';
  const sortOrderVal = params.get('sortOrder') || 'desc';

  return {
    page: !isNaN(pageVal) && pageVal >= 1 ? pageVal : 1,
    status: VALID_STATUSES.includes(statusVal) ? statusVal : '',
    paymentStatus: VALID_PAYMENT_STATUSES.includes(paymentStatusVal) ? paymentStatusVal : '',
    search: searchVal.trim().slice(0, 100),
    sortBy: VALID_SORT_FIELDS.includes(sortByVal) ? sortByVal : 'createdAt',
    sortOrder: sortOrderVal === 'asc' ? 'asc' : 'desc',
  };
}

/**
 * Build canonical query string from state without unnecessary defaults.
 */
function buildCanonicalQueryString(state) {
  if (typeof window === 'undefined' || !window.URLSearchParams) return '';
  const params = new window.URLSearchParams();
  if (state.page > 1) params.set('page', String(state.page));
  if (state.status) params.set('status', state.status);
  if (state.paymentStatus) params.set('paymentStatus', state.paymentStatus);
  if (state.search) params.set('search', state.search);
  if (state.sortBy !== 'createdAt') params.set('sortBy', state.sortBy);
  if (state.sortOrder !== 'desc') params.set('sortOrder', state.sortOrder);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Step 24 — Frontend Production Admin Order Management
 * Route: /admin/orders
 */
export default function AdminOrdersPage({ search: searchProp = '' }) {
  // Initial state from URL
  const initialParams = parseUrlParams(
    typeof window !== 'undefined' ? searchProp || window.location.search : ''
  );

  // Filter & Query States
  const [page, setPage] = useState(initialParams.page);
  const [status, setStatus] = useState(initialParams.status);
  const [paymentStatus, setPaymentStatus] = useState(initialParams.paymentStatus);
  const [appliedSearch, setAppliedSearch] = useState(initialParams.search);
  const [searchInput, setSearchInput] = useState(initialParams.search);
  const [sortBy, setSortBy] = useState(initialParams.sortBy);
  const [sortOrder, setSortOrder] = useState(initialParams.sortOrder);

  // Data States
  const [orders, setOrders] = useState([]);
  const [pagination, setPagination] = useState({
    page: initialParams.page,
    limit: 10,
    totalOrders: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadTrigger, setReloadTrigger] = useState(0);

  // Direct Order ID Quick Lookup state
  const [directIdInput, setDirectIdInput] = useState('');
  const [directIdError, setDirectIdError] = useState('');

  // Refs for debouncing and request cancellation
  const debounceTimerRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Sync state when browser back/forward or external search prop changes
  useEffect(() => {
    const handlePopState = () => {
      const current = parseUrlParams(window.location.search);
      setPage(current.page);
      setStatus(current.status);
      setPaymentStatus(current.paymentStatus);
      setAppliedSearch(current.search);
      setSearchInput(current.search);
      setSortBy(current.sortBy);
      setSortOrder(current.sortOrder);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Update canonical URL in browser history
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const qs = buildCanonicalQueryString({
      page,
      status,
      paymentStatus,
      search: appliedSearch,
      sortBy,
      sortOrder,
    });
    const targetUrl = `/admin/orders${qs}`;
    const currentUrl = window.location.pathname + window.location.search;
    if (currentUrl !== targetUrl) {
      window.history.replaceState({}, '', targetUrl);
    }
  }, [page, status, paymentStatus, appliedSearch, sortBy, sortOrder]);

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Search input typing handler with 350ms debounce
  const handleSearchInputChange = (e) => {
    const val = e.target.value;
    setSearchInput(val);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const trimmed = val.trim();
    if (trimmed === '') {
      if (appliedSearch !== '') {
        setLoading(true);
        setAppliedSearch('');
        setPage(1);
      }
      return;
    }

    debounceTimerRef.current = setTimeout(() => {
      if (trimmed !== appliedSearch) {
        setLoading(true);
        setAppliedSearch(trimmed);
        setPage(1);
      }
    }, 350);
  };

  const handleClearSearch = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    setSearchInput('');
    if (appliedSearch !== '') {
      setLoading(true);
      setAppliedSearch('');
      setPage(1);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    const trimmed = searchInput.trim();
    if (trimmed !== appliedSearch) {
      setLoading(true);
      setAppliedSearch(trimmed);
      setPage(1);
    }
  };

  const handleStatusFilterChange = (e) => {
    setLoading(true);
    setStatus(e.target.value);
    setPage(1);
  };

  const handlePaymentFilterChange = (e) => {
    setLoading(true);
    setPaymentStatus(e.target.value);
    setPage(1);
  };

  const handleSortChange = (e) => {
    const val = e.target.value;
    const [newSortBy, newSortOrder] = val.split('_');
    setLoading(true);
    setSortBy(newSortBy || 'createdAt');
    setSortOrder(newSortOrder || 'desc');
    setPage(1);
  };

  const handleResetFilters = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    setLoading(true);
    setSearchInput('');
    setAppliedSearch('');
    setStatus('');
    setPaymentStatus('');
    setSortBy('createdAt');
    setSortOrder('desc');
    setPage(1);
  };

  // Main data fetch effect with AbortController
  useEffect(() => {
    // Abort previous in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = createAbortController();
    abortControllerRef.current = controller;

    adminOrderService
      .getOrders(
        {
          page,
          limit: 10,
          status: status || undefined,
          paymentStatus: paymentStatus || undefined,
          search: appliedSearch || undefined,
          sortBy,
          sortOrder,
        },
        { signal: controller?.signal }
      )
      .then((res) => {
        setOrders(res.orders || []);
        const paginationData = res.pagination || {
          page: 1,
          limit: 10,
          totalOrders: 0,
          totalPages: 1,
        };
        setPagination(paginationData);

        // Safe recovery if current page is out of bounds after deletion/filtering
        if (paginationData.totalOrders > 0 && page > paginationData.totalPages) {
          setPage(paginationData.totalPages);
        }
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        setError(err?.message || 'Failed to load orders.');
      })
      .finally(() => {
        if (!controller?.signal?.aborted) {
          setLoading(false);
        }
      });

    return () => {
      if (controller) {
        controller.abort();
      }
    };
  }, [page, status, paymentStatus, appliedSearch, sortBy, sortOrder, reloadTrigger]);

  const handleRetry = useCallback(() => {
    setReloadTrigger((prev) => prev + 1);
  }, []);

  // Quick Order ID lookup submit
  const handleDirectLookupSubmit = (e) => {
    e.preventDefault();
    const clean = directIdInput.trim();
    if (!clean) {
      setDirectIdError('Please enter an Order ID.');
      return;
    }
    if (!/^[0-9a-fA-F]{24}$/.test(clean)) {
      setDirectIdError('Order ID must be a valid 24-character hexadecimal MongoDB ObjectId.');
      return;
    }
    setDirectIdError('');
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', `/admin/orders/${clean}`);
      window.dispatchEvent(new window.Event('popstate'));
    }
  };

  const hasActiveFilters = Boolean(
    status || paymentStatus || appliedSearch || sortBy !== 'createdAt' || sortOrder !== 'desc'
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* 1. Shell-Harmonized Page Header */}
      <AdminPageHeader
        title="Order Management"
        subtitle="Review, filter, and transition cross-store customer orders and fulfillment lifecycles."
        badge={!loading && !error ? `${pagination.totalOrders} ${pagination.totalOrders === 1 ? 'order' : 'orders'}` : null}
        actions={
          <Button as="a" href="/admin" variant="secondary" size="sm" className="font-semibold">
            &larr; Dashboard
          </Button>
        }
      />

      {/* 2. Direct Order ID Quick Jump Form */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs">
        <form onSubmit={handleDirectLookupSubmit} className="space-y-2">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex-1">
              <label htmlFor="quick-order-lookup" className="sr-only">
                Quick Order ID Jump
              </label>
              <input
                id="quick-order-lookup"
                type="text"
                value={directIdInput}
                onChange={(e) => {
                  setDirectIdInput(e.target.value);
                  if (directIdError) setDirectIdError('');
                }}
                placeholder="Direct jump by 24-character Order ID (e.g. 660f1b2c3d4e5f6a7b8c9d0e)"
                className="w-full px-3.5 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono text-slate-900"
              />
            </div>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              className="shrink-0 font-semibold min-h-[38px]"
            >
              Open Order &rarr;
            </Button>
          </div>
          {directIdError && (
            <p className="text-xs text-rose-600 font-medium" role="alert">
              {directIdError}
            </p>
          )}
        </form>
      </div>

      {/* 3. Filters, Exact Search, and Sorting Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3.5 items-end">
          {/* Exact Identifier Search Input */}
          <div className="lg:col-span-4 space-y-1">
            <label htmlFor="order-identifier-search" className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Identifier Search
            </label>
            <form onSubmit={handleSearchSubmit} className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                id="order-identifier-search"
                type="text"
                value={searchInput}
                onChange={handleSearchInputChange}
                placeholder="Search Order ID, Razorpay ID, Transaction ID..."
                className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-900 font-mono placeholder:font-sans"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  aria-label="Clear identifier search"
                  className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </form>
            <p className="text-[11px] text-slate-400">
              Exact search by Order ID, Razorpay Order ID, or Transaction ID.
            </p>
          </div>

          {/* Fulfillment Status Filter */}
          <div className="lg:col-span-3 space-y-1">
            <label htmlFor="order-status-filter" className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Order Status
            </label>
            <select
              id="order-status-filter"
              value={status}
              onChange={handleStatusFilterChange}
              className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800"
            >
              <option value="">All Fulfillment Statuses</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="processing">Processing</option>
              <option value="shipped">Shipped</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* Payment Status Filter */}
          <div className="lg:col-span-2 space-y-1">
            <label htmlFor="payment-status-filter" className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Payment Status
            </label>
            <select
              id="payment-status-filter"
              value={paymentStatus}
              onChange={handlePaymentFilterChange}
              className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800"
            >
              <option value="">All Payments</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
            </select>
          </div>

          {/* Sorting */}
          <div className="lg:col-span-3 space-y-1">
            <label htmlFor="order-sort-by" className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Sort By
            </label>
            <select
              id="order-sort-by"
              value={`${sortBy}_${sortOrder}`}
              onChange={handleSortChange}
              className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800"
            >
              <option value="createdAt_desc">Newest First</option>
              <option value="createdAt_asc">Oldest First</option>
              <option value="updatedAt_desc">Recently Updated</option>
              <option value="updatedAt_asc">Least Recently Updated</option>
              <option value="subtotal_desc">Highest Subtotal</option>
              <option value="subtotal_asc">Lowest Subtotal</option>
              <option value="totalQuantity_desc">Highest Quantity</option>
              <option value="totalQuantity_asc">Lowest Quantity</option>
            </select>
          </div>
        </div>

        {/* Active Filters Bar */}
        {hasActiveFilters && (
          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-1.5 text-slate-600">
              <span className="font-semibold text-slate-700">Active Filters:</span>
              {appliedSearch && (
                <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 font-mono text-[11px]">
                  search: {appliedSearch}
                </span>
              )}
              {status && (
                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 capitalize">
                  status: {status}
                </span>
              )}
              {paymentStatus && (
                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 capitalize">
                  payment: {paymentStatus}
                </span>
              )}
              {(sortBy !== 'createdAt' || sortOrder !== 'desc') && (
                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                  sort: {sortBy} ({sortOrder})
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={handleResetFilters}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 underline"
            >
              Reset all filters
            </button>
          </div>
        )}
      </div>

      {/* 4. Main Content: Loading, Error, Empty, or Table */}
      {loading ? (
        <AdminLoadingState
          title="Loading orders..."
          subtitle="Retrieving customer fulfillment records and transaction statuses."
        />
      ) : error ? (
        <AdminErrorState
          title="Unable to load orders"
          message={error}
          onRetry={handleRetry}
        />
      ) : orders.length === 0 ? (
        <AdminEmptyState
          title={hasActiveFilters ? 'No orders match your filter criteria' : 'No orders in store catalog'}
          description={
            hasActiveFilters
              ? 'Try adjusting your identifier search or filter settings to find orders.'
              : 'There are currently no customer orders recorded in the system.'
          }
          actionLabel={hasActiveFilters ? 'Clear All Filters' : undefined}
          onAction={hasActiveFilters ? handleResetFilters : undefined}
        />
      ) : (
        <div className="space-y-4">
          {/* Desktop Table View (Hidden on mobile) */}
          <div className="hidden md:block bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-slate-500 font-bold uppercase tracking-wider">
                    <th scope="col" className="py-3 px-4">Order ID</th>
                    <th scope="col" className="py-3 px-4">Customer</th>
                    <th scope="col" className="py-3 px-4">Date Placed</th>
                    <th scope="col" className="py-3 px-4">Fulfillment</th>
                    <th scope="col" className="py-3 px-4">Payment</th>
                    <th scope="col" className="py-3 px-4 text-center">Qty</th>
                    <th scope="col" className="py-3 px-4 text-right">Subtotal</th>
                    <th scope="col" className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {orders.map((order) => {
                    const orderBadge = getOrderStatusBadge(order.status);
                    const paymentBadge = getPaymentStatusBadge(order.payment?.status);
                    const customerName = order.user?.name || 'Customer';
                    const customerEmail = order.user?.email || (typeof order.user === 'string' ? order.user : 'No email');

                    return (
                      <tr key={order._id} className="hover:bg-slate-50/60 transition-colors">
                        {/* Order ID */}
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-900 select-all">
                          <a
                            href={`/admin/orders/${order._id}`}
                            className="text-blue-600 hover:text-blue-800 hover:underline"
                            title={`Inspect order ${order._id}`}
                          >
                            {order._id}
                          </a>
                        </td>

                        {/* Customer */}
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-900 truncate max-w-[150px]" title={customerName}>
                            {customerName}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate max-w-[150px]" title={customerEmail}>
                            {customerEmail}
                          </div>
                        </td>

                        {/* Date */}
                        <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                          {formatFullDate(order.createdAt)}
                        </td>

                        {/* Fulfillment Status */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${orderBadge.className}`}>
                            {orderBadge.label}
                          </span>
                        </td>

                        {/* Payment Status */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${paymentBadge.className}`}>
                            {paymentBadge.label}
                          </span>
                        </td>

                        {/* Quantity */}
                        <td className="py-3.5 px-4 text-center font-semibold text-slate-800">
                          {order.totalQuantity ?? (Array.isArray(order.items) ? order.items.reduce((s, i) => s + (i.quantity || 0), 0) : 0)}
                        </td>

                        {/* Subtotal */}
                        <td className="py-3.5 px-4 text-right font-bold text-slate-900 whitespace-nowrap">
                          {formatPrice(order.subtotal ?? 0)}
                        </td>

                        {/* Action */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <Button
                            as="a"
                            href={`/admin/orders/${order._id}`}
                            variant="secondary"
                            size="sm"
                            className="font-semibold text-xs"
                          >
                            View Details &rarr;
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card View (Hidden on desktop) */}
          <div className="md:hidden space-y-3">
            {orders.map((order) => {
              const orderBadge = getOrderStatusBadge(order.status);
              const paymentBadge = getPaymentStatusBadge(order.payment?.status);
              const customerName = order.user?.name || 'Customer';
              const customerEmail = order.user?.email || (typeof order.user === 'string' ? order.user : 'No email');

              return (
                <div
                  key={order._id}
                  className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Order ID
                      </span>
                      <a
                        href={`/admin/orders/${order._id}`}
                        className="font-mono text-xs font-bold text-blue-600 hover:underline break-all"
                      >
                        {order._id}
                      </a>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${orderBadge.className}`}>
                        {orderBadge.label}
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${paymentBadge.className}`}>
                        {paymentBadge.label}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-400 block text-[11px]">Customer</span>
                      <span className="font-semibold text-slate-800 truncate block">{customerName}</span>
                      <span className="text-[10px] text-slate-400 truncate block">{customerEmail}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Placed</span>
                      <span className="text-slate-700">{formatFullDate(order.createdAt)}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Total Quantity</span>
                      <span className="font-semibold text-slate-800">
                        {order.totalQuantity ?? (Array.isArray(order.items) ? order.items.reduce((s, i) => s + (i.quantity || 0), 0) : 0)} items
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Subtotal</span>
                      <span className="font-bold text-slate-900">{formatPrice(order.subtotal ?? 0)}</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100">
                    <Button
                      as="a"
                      href={`/admin/orders/${order._id}`}
                      variant="secondary"
                      size="sm"
                      className="w-full justify-center font-semibold min-h-[44px]"
                    >
                      View Details &rarr;
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 5. Server-Authoritative Pagination Controls */}
          {pagination.totalPages > 1 && (
            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="text-slate-500 font-medium">
                Showing{' '}
                <strong className="text-slate-800">
                  {(pagination.page - 1) * pagination.limit + 1}
                </strong>
                {' '}to{' '}
                <strong className="text-slate-800">
                  {Math.min(pagination.page * pagination.limit, pagination.totalOrders)}
                </strong>
                {' '}of{' '}
                <strong className="text-slate-800">{pagination.totalOrders}</strong> orders
                {' '}(Page {pagination.page} of {pagination.totalPages})
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setLoading(true);
                    setPage((p) => Math.max(p - 1, 1));
                  }}
                  disabled={pagination.page <= 1}
                  className="font-semibold min-h-[38px]"
                >
                  &larr; Previous
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setLoading(true);
                    setPage((p) => Math.min(p + 1, pagination.totalPages));
                  }}
                  disabled={pagination.page >= pagination.totalPages}
                  className="font-semibold min-h-[38px]"
                >
                  Next &rarr;
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
