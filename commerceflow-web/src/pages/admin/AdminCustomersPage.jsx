import { useState, useEffect, useRef } from 'react';
import {
  adminCustomerService,
  VALID_CUSTOMER_STATUSES,
  VALID_SORT_FIELDS,
  VALID_SORT_ORDERS,
} from '../../features/admin/adminCustomer.service.js';
import Button from '../../components/Button.jsx';
import Skeleton from '../../components/Skeleton.jsx';
import ErrorState from '../../components/ErrorState.jsx';
import EmptyState from '../../components/EmptyState.jsx';

/**
 * Format timestamp into human-readable date string.
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
 * Parse URL search string into state object.
 */
function parseUrlParams(searchStr) {
  const params = typeof window !== 'undefined' && window.URLSearchParams
    ? new window.URLSearchParams(searchStr || '')
    : { get: () => null };

  const pageVal = parseInt(params.get('page'), 10);
  const statusVal = params.get('status') || 'all';
  const searchVal = params.get('search') || '';
  const sortByVal = params.get('sortBy') || 'createdAt';
  const sortOrderVal = params.get('sortOrder') || 'desc';

  return {
    page: !isNaN(pageVal) && pageVal >= 1 ? pageVal : 1,
    status: VALID_CUSTOMER_STATUSES.includes(statusVal) ? statusVal : 'all',
    search: searchVal.trim().slice(0, 100),
    sortBy: VALID_SORT_FIELDS.includes(sortByVal) ? sortByVal : 'createdAt',
    sortOrder: VALID_SORT_ORDERS.includes(sortOrderVal) ? sortOrderVal : 'desc',
  };
}

/**
 * Build canonical query string from state without unnecessary defaults.
 */
function buildCanonicalQueryString(state) {
  if (typeof window === 'undefined' || !window.URLSearchParams) return '';
  const params = new window.URLSearchParams();
  if (state.page > 1) params.set('page', String(state.page));
  if (state.status && state.status !== 'all') params.set('status', state.status);
  if (state.search) params.set('search', state.search);
  if (state.sortBy !== 'createdAt') params.set('sortBy', state.sortBy);
  if (state.sortOrder !== 'desc') params.set('sortOrder', state.sortOrder);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/**
 * P1.3 Step 79.6 — Production Admin Customer Management Page
 * Route: /admin/customers
 */
export default function AdminCustomersPage({ search: searchProp = '' }) {
  const initialParams = parseUrlParams(
    typeof window !== 'undefined' ? searchProp || window.location.search : ''
  );

  // Filter & Query States
  const [page, setPage] = useState(initialParams.page);
  const [status, setStatus] = useState(initialParams.status);
  const [appliedSearch, setAppliedSearch] = useState(initialParams.search);
  const [searchInput, setSearchInput] = useState(initialParams.search);
  const [sortBy, setSortBy] = useState(initialParams.sortBy);
  const [sortOrder, setSortOrder] = useState(initialParams.sortOrder);

  // Data States
  const [customers, setCustomers] = useState([]);
  const [pagination, setPagination] = useState({
    page: initialParams.page,
    limit: 10,
    totalCustomers: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);

  const [mutationTarget, setMutationTarget] = useState(null);
  const [isMutating, setIsMutating] = useState(false);
  const [mutationError, setMutationError] = useState(null);
  const [reloadTrigger, setReloadTrigger] = useState(0);

  const debounceTimerRef = useRef(null);
  const toastTimerRef = useRef(null);
  const isMountedRef = useRef(true);
  const modalCancelBtnRef = useRef(null);
  const modalContainerRef = useRef(null);

  // Sync state when browser back/forward changes
  useEffect(() => {
    const handlePopState = () => {
      const current = parseUrlParams(window.location.search);
      setPage(current.page);
      setStatus(current.status);
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
      search: appliedSearch,
      sortBy,
      sortOrder,
    });
    const targetUrl = `/admin/customers${qs}`;
    const currentUrl = window.location.pathname + window.location.search;
    if (currentUrl !== targetUrl) {
      window.history.replaceState({}, '', targetUrl);
    }
  }, [page, status, appliedSearch, sortBy, sortOrder]);

  // Clean up debounce timer, toast timer, and track mount status
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  // Fetch customers from backend
  useEffect(() => {
    let isMounted = true;
    const abortController = typeof window !== 'undefined' && window.AbortController
      ? new window.AbortController()
      : null;

    adminCustomerService
      .getAdminCustomers(
        {
          page,
          limit: 10,
          search: appliedSearch || undefined,
          status,
          sortBy,
          sortOrder,
        },
        { signal: abortController?.signal }
      )
      .then((res) => {
        if (!isMounted) return;
        setError(null);
        setCustomers(res.customers || []);
        const paginationData = res.pagination || {
          page: 1,
          limit: 10,
          totalCustomers: 0,
          totalPages: 1,
        };
        setPagination(paginationData);

        // Safe recovery if current page is out of bounds after filtering
        if (paginationData.totalCustomers > 0 && page > paginationData.totalPages) {
          setPage(paginationData.totalPages);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        if (err?.name === 'AbortError') return;
        setError(err?.message || 'Failed to load customers from server.');
      })
      .finally(() => {
        if (isMounted && !abortController?.signal?.aborted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
      if (abortController) {
        abortController.abort();
      }
    };
  }, [page, status, appliedSearch, sortBy, sortOrder, reloadTrigger]);

  // Handle Escape key for accessible modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && mutationTarget && !isMutating) {
        setMutationTarget(null);
        setMutationError(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mutationTarget, isMutating]);

  // Focus cancel button when modal opens
  useEffect(() => {
    if (mutationTarget && modalCancelBtnRef.current) {
      modalCancelBtnRef.current.focus();
    }
  }, [mutationTarget]);

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

  const handleSortChange = (e) => {
    const [newSortBy, newSortOrder] = e.target.value.split('_');
    setLoading(true);
    setSortBy(newSortBy);
    setSortOrder(newSortOrder);
    setPage(1);
  };

  const handleResetFilters = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    setLoading(true);
    setSearchInput('');
    setAppliedSearch('');
    setStatus('all');
    setSortBy('createdAt');
    setSortOrder('desc');
    setPage(1);
  };

  const handleOpenStatusModal = (customer, nextStatus) => {
    setMutationError(null);
    setMutationTarget({ customer, nextStatus });
  };

  const handleConfirmStatusMutation = async () => {
    if (!mutationTarget || isMutating) return;

    const { customer, nextStatus } = mutationTarget;
    const customerId = customer._id || customer.id;

    setIsMutating(true);
    setMutationError(null);

    try {
      const updatedCustomer = await adminCustomerService.updateAdminCustomerStatus(
        customerId,
        nextStatus
      );

      if (!isMountedRef.current) return;

      // Update row in-place
      setCustomers((prev) =>
        prev.map((c) => {
          const cId = c._id || c.id;
          if (cId === customerId) {
            return {
              ...c,
              isActive: updatedCustomer?.isActive ?? nextStatus,
              updatedAt: updatedCustomer?.updatedAt || new Date().toISOString(),
            };
          }
          return c;
        })
      );

      setMutationTarget(null);
      setActionSuccess(
        `Customer "${customer.name}" was successfully ${nextStatus ? 'activated' : 'deactivated'}.`
      );

      // Clear toast after 5s with ref tracking
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
      toastTimerRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          setActionSuccess(null);
        }
      }, 5000);
    } catch (err) {
      if (isMountedRef.current) {
        setMutationError(err?.message || 'Failed to update customer status.');
      }
    } finally {
      if (isMountedRef.current) {
        setIsMutating(false);
      }
    }
  };

  const hasActiveFilters =
    Boolean(appliedSearch) ||
    status !== 'all' ||
    sortBy !== 'createdAt' ||
    sortOrder !== 'desc';

  return (
    <div className="space-y-6">
      {/* 1. Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Customers
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Manage customer accounts, inspect order activity, and activate or deactivate access.
          </p>
        </div>
      </div>

      {/* 2. Success Feedback Toast */}
      {actionSuccess && (
        <div
          role="status"
          className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs sm:text-sm text-emerald-800 flex items-center justify-between gap-3 shadow-2xs"
        >
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>{actionSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionSuccess(null)}
            className="text-emerald-600 hover:text-emerald-800 p-1"
            aria-label="Dismiss message"
          >
            &times;
          </button>
        </div>
      )}

      {/* 3. Search and Filters Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 sm:gap-4 items-end">
          {/* Search Input */}
          <div className="md:col-span-6 space-y-1">
            <label htmlFor="customer-search-input" className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Search Customers
            </label>
            <form onSubmit={handleSearchSubmit} className="relative">
              <input
                id="customer-search-input"
                type="text"
                value={searchInput}
                onChange={handleSearchInputChange}
                placeholder="Search by name or email address..."
                className="w-full pl-9 pr-9 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800 placeholder-slate-400"
              />
              <span className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" aria-hidden="true">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              {searchInput && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full"
                  aria-label="Clear search"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </form>
          </div>

          {/* Status Filter */}
          <div className="md:col-span-3 space-y-1">
            <label htmlFor="customer-status-filter" className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Account Status
            </label>
            <select
              id="customer-status-filter"
              value={status}
              onChange={handleStatusFilterChange}
              className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800"
            >
              <option value="all">All Accounts</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>

          {/* Sort Control */}
          <div className="md:col-span-3 space-y-1">
            <label htmlFor="customer-sort-by" className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Sort By
            </label>
            <select
              id="customer-sort-by"
              value={`${sortBy}_${sortOrder}`}
              onChange={handleSortChange}
              className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800"
            >
              <option value="createdAt_desc">Newest First</option>
              <option value="createdAt_asc">Oldest First</option>
              <option value="name_asc">Name (A &rarr; Z)</option>
              <option value="name_desc">Name (Z &rarr; A)</option>
              <option value="email_asc">Email (A &rarr; Z)</option>
              <option value="email_desc">Email (Z &rarr; A)</option>
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
              {status !== 'all' && (
                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 capitalize">
                  status: {status}
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
        <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs space-y-4" role="status" aria-label="Loading customers">
          <Skeleton className="h-6 w-48" />
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full rounded-xl" />
            ))}
          </div>
        </div>
      ) : error ? (
        <div className="bg-white rounded-2xl border border-slate-200/90 p-8 shadow-xs">
          <ErrorState
            title="Unable to load customers"
            description={error}
            onRetry={() => {
              setLoading(true);
              setError(null);
              setReloadTrigger((prev) => prev + 1);
            }}
          />
        </div>
      ) : customers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/90 p-8 shadow-xs text-center">
          <EmptyState
            title={hasActiveFilters ? 'No customers match your filter criteria' : 'No customer accounts in system'}
            description={
              hasActiveFilters
                ? 'Try adjusting your search terms or status filter to find customer records.'
                : 'There are currently no customer accounts registered in the store.'
            }
            action={
              hasActiveFilters ? (
                <Button type="button" onClick={handleResetFilters} variant="secondary" size="sm">
                  Clear All Filters
                </Button>
              ) : null
            }
          />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Desktop Table View */}
          <div className="hidden md:block bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-slate-500 font-bold uppercase tracking-wider">
                    <th scope="col" className="py-3 px-4">Customer</th>
                    <th scope="col" className="py-3 px-4">Account Status</th>
                    <th scope="col" className="py-3 px-4">Joined Date</th>
                    <th scope="col" className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {customers.map((c) => {
                    const customerId = c._id || c.id;
                    const isActive = c.isActive;

                    return (
                      <tr key={customerId} className="hover:bg-slate-50/60 transition-colors">
                        {/* Customer Column */}
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-900 truncate max-w-[220px]" title={c.name}>
                            {c.name}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate max-w-[220px]" title={c.email}>
                            {c.email}
                          </div>
                        </td>

                        {/* Status Column */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {isActive ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border bg-emerald-50 text-emerald-700 border-emerald-200">
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border bg-slate-100 text-slate-700 border-slate-200">
                              Inactive
                            </span>
                          )}
                        </td>

                        {/* Joined Date */}
                        <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                          {formatFullDate(c.createdAt)}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              as="a"
                              href={`/admin/customers/${customerId}`}
                              variant="secondary"
                              size="sm"
                              className="font-semibold text-xs min-h-[34px]"
                            >
                              View Details &rarr;
                            </Button>

                            {isActive ? (
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => handleOpenStatusModal(c, false)}
                                className="font-semibold text-xs min-h-[34px] text-rose-600 hover:bg-rose-50 hover:border-rose-200 border-slate-200"
                              >
                                Deactivate
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => handleOpenStatusModal(c, true)}
                                className="font-semibold text-xs min-h-[34px] text-emerald-700 hover:bg-emerald-50 hover:border-emerald-200 border-slate-200"
                              >
                                Activate
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-3">
            {customers.map((c) => {
              const customerId = c._id || c.id;
              const isActive = c.isActive;

              return (
                <div
                  key={customerId}
                  className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-slate-900 text-sm truncate" title={c.name}>
                        {c.name}
                      </h3>
                      <p className="text-xs text-slate-400 truncate" title={c.email}>
                        {c.email}
                      </p>
                    </div>

                    <div className="shrink-0">
                      {isActive ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border bg-emerald-50 text-emerald-700 border-emerald-200">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border bg-slate-100 text-slate-700 border-slate-200">
                          Inactive
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 text-xs text-slate-500">
                    <span>Joined: </span>
                    <span className="font-medium text-slate-700">{formatFullDate(c.createdAt)}</span>
                  </div>

                  <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-2">
                    <Button
                      as="a"
                      href={`/admin/customers/${customerId}`}
                      variant="secondary"
                      size="sm"
                      className="justify-center font-semibold text-xs min-h-[40px]"
                    >
                      View Details
                    </Button>

                    {isActive ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => handleOpenStatusModal(c, false)}
                        className="justify-center font-semibold text-xs min-h-[40px] text-rose-600 hover:bg-rose-50"
                      >
                        Deactivate
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => handleOpenStatusModal(c, true)}
                        className="justify-center font-semibold text-xs min-h-[40px] text-emerald-700 hover:bg-emerald-50"
                      >
                        Activate
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 5. Pagination Controls */}
          {pagination.totalPages > 1 && (
            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="text-slate-500 font-medium">
                Showing{' '}
                <strong className="text-slate-800">
                  {(pagination.page - 1) * pagination.limit + 1}
                </strong>
                {' '}to{' '}
                <strong className="text-slate-800">
                  {Math.min(pagination.page * pagination.limit, pagination.totalCustomers)}
                </strong>
                {' '}of{' '}
                <strong className="text-slate-800">{pagination.totalCustomers}</strong> customers
                {' '}(Page {pagination.page} of {pagination.totalPages})
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  disabled={pagination.page <= 1}
                  className="font-semibold min-h-[38px]"
                >
                  &larr; Previous
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(p + 1, pagination.totalPages))}
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

      {/* 6. Accessible Status Mutation Confirmation Dialog */}
      {mutationTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-2xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mutation-dialog-title"
          aria-describedby="mutation-dialog-desc"
          ref={modalContainerRef}
          onClick={(e) => {
            if (e.target === modalContainerRef.current && !isMutating) {
              setMutationTarget(null);
              setMutationError(null);
            }
          }}
        >
          <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-start gap-3.5">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                  mutationTarget.nextStatus
                    ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                    : 'bg-rose-50 text-rose-600 border-rose-100'
                }`}
              >
                {mutationTarget.nextStatus ? (
                  <svg className="w-5 h-5 stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                )}
              </div>

              <div className="min-w-0">
                <h3 id="mutation-dialog-title" className="text-base font-bold text-slate-900">
                  {mutationTarget.nextStatus ? 'Activate Customer Account?' : 'Deactivate Customer Account?'}
                </h3>
                <p id="mutation-dialog-desc" className="text-xs text-slate-600 mt-1">
                  Target Customer: <strong className="text-slate-900 font-semibold">{mutationTarget.customer.name}</strong> ({mutationTarget.customer.email})
                </p>
              </div>
            </div>

            {mutationTarget.nextStatus ? (
              <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-3.5 text-xs text-emerald-950 leading-relaxed space-y-1">
                <p className="font-semibold">Account Reactivation:</p>
                <p>
                  Reactivating this customer restores their ability to sign in to the storefront and place new orders. Historical orders and profile data remain intact.
                </p>
              </div>
            ) : (
              <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3.5 text-xs text-amber-950 leading-relaxed space-y-1">
                <p className="font-semibold">Security & Commerce Impact:</p>
                <p>
                  Deactivating this account prevents the customer from logging in or authenticating future requests. Historical orders, addresses, reviews, and commerce data are <strong>fully preserved</strong>.
                </p>
              </div>
            )}

            {mutationError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
                {mutationError}
              </div>
            )}

            <div className="pt-2 flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="secondary"
                size="md"
                ref={modalCancelBtnRef}
                onClick={() => {
                  setMutationTarget(null);
                  setMutationError(null);
                }}
                disabled={isMutating}
                className="min-h-[44px]"
              >
                Cancel
              </Button>

              <Button
                type="button"
                variant="primary"
                size="md"
                className={
                  mutationTarget.nextStatus
                    ? 'bg-emerald-600 hover:bg-emerald-700 border-emerald-600 text-white min-h-[44px] font-semibold'
                    : 'bg-rose-600 hover:bg-rose-700 border-rose-600 text-white min-h-[44px] font-semibold'
                }
                onClick={handleConfirmStatusMutation}
                disabled={isMutating}
                loading={isMutating}
              >
                {isMutating
                  ? 'Updating...'
                  : mutationTarget.nextStatus
                  ? 'Confirm Activation'
                  : 'Confirm Deactivation'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
