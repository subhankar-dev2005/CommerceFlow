import { useState, useEffect, useRef } from 'react';
import {
  adminUserService,
  VALID_USER_ROLES,
  VALID_USER_STATUSES,
  VALID_SORT_FIELDS,
  VALID_SORT_ORDERS,
} from '../../features/admin/adminUser.service.js';
import { useAuth } from '../../features/auth/useAuth.js';
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
  const roleVal = params.get('role') || 'all';
  const searchVal = params.get('search') || '';
  const sortByVal = params.get('sortBy') || 'createdAt';
  const sortOrderVal = params.get('sortOrder') || 'desc';

  return {
    page: !isNaN(pageVal) && pageVal >= 1 ? pageVal : 1,
    status: VALID_USER_STATUSES.includes(statusVal) ? statusVal : 'all',
    role: VALID_USER_ROLES.includes(roleVal) ? roleVal : 'all',
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
  if (state.role && state.role !== 'all') params.set('role', state.role);
  if (state.search) params.set('search', state.search);
  if (state.sortBy !== 'createdAt') params.set('sortBy', state.sortBy);
  if (state.sortOrder !== 'desc') params.set('sortOrder', state.sortOrder);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Admin User Management Page
 * Route: /admin/users
 */
export default function AdminUsersPage({ search: searchProp = '' }) {
  const { user: currentAdmin } = useAuth();
  const currentAdminId = currentAdmin?._id || currentAdmin?.id;

  const initialParams = parseUrlParams(
    typeof window !== 'undefined' ? searchProp || window.location.search : ''
  );

  // Filter & Query States
  const [page, setPage] = useState(initialParams.page);
  const [status, setStatus] = useState(initialParams.status);
  const [role, setRole] = useState(initialParams.role);
  const [appliedSearch, setAppliedSearch] = useState(initialParams.search);
  const [searchInput, setSearchInput] = useState(initialParams.search);
  const [sortBy, setSortBy] = useState(initialParams.sortBy);
  const [sortOrder, setSortOrder] = useState(initialParams.sortOrder);

  // Data States
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({
    page: initialParams.page,
    limit: 10,
    totalUsers: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);
  const [reloadTrigger, setReloadTrigger] = useState(0);

  // Status Mutation Modal
  const [statusTarget, setStatusTarget] = useState(null);
  const [isMutatingStatus, setIsMutatingStatus] = useState(false);
  const [statusError, setStatusError] = useState(null);

  // Role Mutation Modal
  const [roleTarget, setRoleTarget] = useState(null);
  const [isMutatingRole, setIsMutatingRole] = useState(false);
  const [roleError, setRoleError] = useState(null);

  // Create Administrator Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [createErrors, setCreateErrors] = useState({});
  const [isCreating, setIsCreating] = useState(false);

  const debounceTimerRef = useRef(null);
  const toastTimerRef = useRef(null);
  const isMountedRef = useRef(true);

  // Sync state with popstate
  useEffect(() => {
    const handlePopState = () => {
      const current = parseUrlParams(window.location.search);
      setPage(current.page);
      setStatus(current.status);
      setRole(current.role);
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
      role,
      search: appliedSearch,
      sortBy,
      sortOrder,
    });
    const targetUrl = `/admin/users${qs}`;
    const currentUrl = window.location.pathname + window.location.search;
    if (currentUrl !== targetUrl) {
      window.history.replaceState({}, '', targetUrl);
    }
  }, [page, status, role, appliedSearch, sortBy, sortOrder]);

  // Clean up timers
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Fetch users from backend
  useEffect(() => {
    let isMounted = true;
    const abortController = typeof window !== 'undefined' && window.AbortController
      ? new window.AbortController()
      : null;

    adminUserService
      .getAdminUsers(
        {
          page,
          limit: 10,
          search: appliedSearch || undefined,
          status,
          role,
          sortBy,
          sortOrder,
        },
        { signal: abortController?.signal }
      )
      .then((res) => {
        if (!isMounted) return;
        setError(null);
        setUsers(res.users || []);
        const paginationData = res.pagination || {
          page: 1,
          limit: 10,
          totalUsers: 0,
          totalPages: 1,
        };
        setPagination(paginationData);

        if (paginationData.totalUsers > 0 && page > paginationData.totalPages) {
          setPage(paginationData.totalPages);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        if (err?.name === 'AbortError') return;
        setError(err?.message || 'Failed to load user accounts.');
      })
      .finally(() => {
        if (isMounted && !abortController?.signal?.aborted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
      if (abortController) abortController.abort();
    };
  }, [page, status, role, appliedSearch, sortBy, sortOrder, reloadTrigger]);

  const triggerToast = (msg) => {
    setActionSuccess(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) setActionSuccess(null);
    }, 5000);
  };

  // Search input handler with 350ms debounce
  const handleSearchInputChange = (e) => {
    const val = e.target.value;
    setSearchInput(val);

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

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
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    setSearchInput('');
    if (appliedSearch !== '') {
      setLoading(true);
      setAppliedSearch('');
      setPage(1);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    const trimmed = searchInput.trim();
    if (trimmed !== appliedSearch) {
      setLoading(true);
      setAppliedSearch(trimmed);
      setPage(1);
    }
  };

  const handleResetFilters = () => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    setLoading(true);
    setSearchInput('');
    setAppliedSearch('');
    setStatus('all');
    setRole('all');
    setSortBy('createdAt');
    setSortOrder('desc');
    setPage(1);
  };

  // Status Mutation
  const handleConfirmStatus = async () => {
    if (!statusTarget || isMutatingStatus) return;
    const { user, nextStatus } = statusTarget;
    const userId = user._id || user.id;

    setIsMutatingStatus(true);
    setStatusError(null);

    try {
      const updated = await adminUserService.updateAdminUserStatus(userId, nextStatus);
      if (!isMountedRef.current) return;

      setUsers((prev) =>
        prev.map((u) => {
          const uId = u._id || u.id;
          if (uId === userId) {
            return {
              ...u,
              isActive: updated?.isActive ?? nextStatus,
              updatedAt: updated?.updatedAt || new Date().toISOString(),
            };
          }
          return u;
        })
      );

      setStatusTarget(null);
      triggerToast(`Account "${user.name}" was successfully ${nextStatus ? 'activated' : 'deactivated'}.`);
    } catch (err) {
      if (isMountedRef.current) {
        setStatusError(err?.message || 'Failed to update account status.');
      }
    } finally {
      if (isMountedRef.current) {
        setIsMutatingStatus(false);
      }
    }
  };

  // Role Mutation
  const handleConfirmRole = async () => {
    if (!roleTarget || isMutatingRole) return;
    const { user, nextRole } = roleTarget;
    const userId = user._id || user.id;

    setIsMutatingRole(true);
    setRoleError(null);

    try {
      const updated = await adminUserService.updateAdminUserRole(userId, nextRole);
      if (!isMountedRef.current) return;

      setUsers((prev) =>
        prev.map((u) => {
          const uId = u._id || u.id;
          if (uId === userId) {
            return {
              ...u,
              role: updated?.role ?? nextRole,
              updatedAt: updated?.updatedAt || new Date().toISOString(),
            };
          }
          return u;
        })
      );

      setRoleTarget(null);
      triggerToast(`Role for "${user.name}" was successfully updated to ${nextRole}.`);
    } catch (err) {
      if (isMountedRef.current) {
        setRoleError(err?.message || 'Failed to update user role.');
      }
    } finally {
      if (isMountedRef.current) {
        setIsMutatingRole(false);
      }
    }
  };

  // Create Administrator
  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    const errors = {};

    if (!createForm.name.trim()) {
      errors.name = 'Administrator name is required';
    } else if (createForm.name.trim().length < 2) {
      errors.name = 'Name must be at least 2 characters';
    }

    if (!createForm.email.trim()) {
      errors.email = 'Email address is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(createForm.email.trim())) {
      errors.email = 'Please enter a valid email address';
    }

    if (!createForm.password) {
      errors.password = 'Password is required';
    } else if (createForm.password.length < 8) {
      errors.password = 'Password must be at least 8 characters long';
    } else if (!/[A-Z]/.test(createForm.password)) {
      errors.password = 'Password must contain at least one uppercase letter';
    } else if (!/[a-z]/.test(createForm.password)) {
      errors.password = 'Password must contain at least one lowercase letter';
    } else if (!/\d/.test(createForm.password)) {
      errors.password = 'Password must contain at least one number';
    } else if (!/[@$!%*?&#]/.test(createForm.password)) {
      errors.password = 'Password must contain at least one special character (@$!%*?&#)';
    }

    if (createForm.password !== createForm.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    if (Object.keys(errors).length > 0) {
      setCreateErrors(errors);
      return;
    }

    setIsCreating(true);
    setCreateErrors({});

    try {
      await adminUserService.createAdminUser({
        name: createForm.name.trim(),
        email: createForm.email.trim(),
        password: createForm.password,
      });

      if (!isMountedRef.current) return;

      // Clear sensitive password values from state immediately
      setCreateForm({
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
      });
      setIsCreateOpen(false);
      triggerToast('Administrator account created successfully.');
      setReloadTrigger((prev) => prev + 1);
    } catch (err) {
      if (isMountedRef.current) {
        setCreateErrors({ submit: err?.message || 'Failed to create administrator.' });
      }
    } finally {
      if (isMountedRef.current) {
        setIsCreating(false);
      }
    }
  };

  const hasActiveFilters =
    Boolean(appliedSearch) ||
    status !== 'all' ||
    role !== 'all' ||
    sortBy !== 'createdAt' ||
    sortOrder !== 'desc';

  return (
    <div className="space-y-6">
      {/* 1. Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Administrators
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Manage store administrators, privilege levels, and administrative account security.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              setCreateForm({ name: '', email: '', password: '', confirmPassword: '' });
              setCreateErrors({});
              setIsCreateOpen(true);
            }}
            className="bg-[#1B4D3E] hover:bg-[#143E31] text-white font-semibold text-xs sm:text-sm shadow-xs"
          >
            + Create Administrator
          </Button>
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
          <div className="md:col-span-5 space-y-1">
            <label htmlFor="user-search-input" className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Search Users
            </label>
            <form onSubmit={handleSearchSubmit} className="relative">
              <input
                id="user-search-input"
                type="text"
                value={searchInput}
                onChange={handleSearchInputChange}
                placeholder="Search by name or email..."
                className="w-full pl-9 pr-9 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-800 placeholder-slate-400"
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

          {/* Role Filter */}
          <div className="md:col-span-2 space-y-1">
            <label htmlFor="user-role-filter" className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Role
            </label>
            <select
              id="user-role-filter"
              value={role}
              onChange={(e) => {
                setLoading(true);
                setRole(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-800"
            >
              <option value="all">All Roles</option>
              <option value="admin">Admin</option>
              <option value="customer">Customer</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="md:col-span-2 space-y-1">
            <label htmlFor="user-status-filter" className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Status
            </label>
            <select
              id="user-status-filter"
              value={status}
              onChange={(e) => {
                setLoading(true);
                setStatus(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-800"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>

          {/* Sort Control */}
          <div className="md:col-span-3 space-y-1">
            <label htmlFor="user-sort-by" className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Sort By
            </label>
            <select
              id="user-sort-by"
              value={`${sortBy}_${sortOrder}`}
              onChange={(e) => {
                const [newSortBy, newSortOrder] = e.target.value.split('_');
                setLoading(true);
                setSortBy(newSortBy);
                setSortOrder(newSortOrder);
                setPage(1);
              }}
              className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-800"
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

        {/* Active Filters */}
        {hasActiveFilters && (
          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-1.5 text-slate-600">
              <span className="font-semibold text-slate-700">Active Filters:</span>
              {appliedSearch && (
                <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono text-[11px]">
                  search: {appliedSearch}
                </span>
              )}
              {role !== 'all' && (
                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 capitalize">
                  role: {role}
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
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 underline"
            >
              Reset all filters
            </button>
          </div>
        )}
      </div>

      {/* 4. Main Content: Loading, Error, Empty, or Table */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs space-y-4" role="status" aria-label="Loading users">
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
            title="Unable to load user accounts"
            description={error}
            onRetry={() => {
              setLoading(true);
              setError(null);
              setReloadTrigger((prev) => prev + 1);
            }}
          />
        </div>
      ) : users.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/90 p-8 shadow-xs text-center">
          <EmptyState
            title={hasActiveFilters ? 'No accounts match your filter criteria' : 'No user accounts found'}
            description={
              hasActiveFilters
                ? 'Try adjusting your search query, role, or status filter.'
                : 'There are currently no user accounts matching this view.'
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
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-slate-500 font-bold uppercase tracking-wider">
                    <th scope="col" className="py-3 px-4">User</th>
                    <th scope="col" className="py-3 px-4">Role</th>
                    <th scope="col" className="py-3 px-4">Status</th>
                    <th scope="col" className="py-3 px-4">Created Date</th>
                    <th scope="col" className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {users.map((u) => {
                    const userId = u._id || u.id;
                    const isSelf = String(userId) === String(currentAdminId);
                    const isAdmin = u.role === 'admin';
                    const isActive = u.isActive;

                    return (
                      <tr key={userId} className="hover:bg-slate-50/60 transition-colors">
                        {/* User Identity */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900 truncate max-w-[200px]" title={u.name}>
                              {u.name}
                            </span>
                            {isSelf && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                You
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate max-w-[220px]" title={u.email}>
                            {u.email}
                          </div>
                        </td>

                        {/* Role */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {isAdmin ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border bg-[#1B4D3E]/10 text-[#1B4D3E] border-[#1B4D3E]/20">
                              Admin
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border bg-slate-100 text-slate-700 border-slate-200">
                              Customer
                            </span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {isActive ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border bg-emerald-50 text-emerald-700 border-emerald-200">
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border bg-rose-50 text-rose-700 border-rose-200">
                              Inactive
                            </span>
                          )}
                        </td>

                        {/* Created Date */}
                        <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                          {formatFullDate(u.createdAt)}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            {/* Role Toggle Button */}
                            {isAdmin ? (
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                disabled={isSelf}
                                onClick={() => {
                                  setRoleError(null);
                                  setRoleTarget({ user: u, nextRole: 'customer' });
                                }}
                                title={isSelf ? 'You cannot demote your own account' : 'Demote to Customer'}
                                className="font-semibold text-xs min-h-[32px] text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Demote
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                  setRoleError(null);
                                  setRoleTarget({ user: u, nextRole: 'admin' });
                                }}
                                className="font-semibold text-xs min-h-[32px] text-[#1B4D3E] hover:bg-[#1B4D3E]/10"
                              >
                                Promote to Admin
                              </Button>
                            )}

                            {/* Status Toggle Button */}
                            {isActive ? (
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                disabled={isSelf}
                                onClick={() => {
                                  setStatusError(null);
                                  setStatusTarget({ user: u, nextStatus: false });
                                }}
                                title={isSelf ? 'You cannot deactivate your own account' : 'Deactivate account'}
                                className="font-semibold text-xs min-h-[32px] text-rose-600 hover:bg-rose-50 hover:border-rose-200 border-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Deactivate
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                  setStatusError(null);
                                  setStatusTarget({ user: u, nextStatus: true });
                                }}
                                className="font-semibold text-xs min-h-[32px] text-emerald-700 hover:bg-emerald-50 hover:border-emerald-200 border-slate-200"
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

          {/* Pagination Controls */}
          {pagination.totalPages > 1 && (
            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="text-slate-500 font-medium">
                Showing{' '}
                <strong className="text-slate-800">
                  {(pagination.page - 1) * pagination.limit + 1}
                </strong>
                {' '}to{' '}
                <strong className="text-slate-800">
                  {Math.min(pagination.page * pagination.limit, pagination.totalUsers)}
                </strong>
                {' '}of{' '}
                <strong className="text-slate-800">{pagination.totalUsers}</strong> accounts
                {' '}(Page {pagination.page} of {pagination.totalPages})
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  disabled={pagination.page <= 1}
                  className="font-semibold min-h-[36px]"
                >
                  &larr; Previous
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(p + 1, pagination.totalPages))}
                  disabled={pagination.page >= pagination.totalPages}
                  className="font-semibold min-h-[36px]"
                >
                  Next &rarr;
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 5. Create Administrator Modal */}
      {isCreateOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-2xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-admin-title"
        >
          <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-lg w-full shadow-2xl space-y-5">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 id="create-admin-title" className="text-lg font-bold text-slate-900">
                  Create Administrator
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Provision a new administrative account with store management privileges.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!isCreating) {
                    setIsCreateOpen(false);
                    setCreateErrors({});
                  }
                }}
                disabled={isCreating}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg text-lg leading-none"
                aria-label="Close modal"
              >
                &times;
              </button>
            </div>

            {createErrors.submit && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
                {createErrors.submit}
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              {/* Name */}
              <div className="space-y-1">
                <label htmlFor="create-admin-name" className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  id="create-admin-name"
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Jane Doe"
                  className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-800"
                />
                {createErrors.name && (
                  <p className="text-xs text-rose-600 mt-1">{createErrors.name}</p>
                )}
              </div>

              {/* Email */}
              <div className="space-y-1">
                <label htmlFor="create-admin-email" className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Email Address <span className="text-rose-500">*</span>
                </label>
                <input
                  id="create-admin-email"
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="admin@example.com"
                  className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-800"
                />
                {createErrors.email && (
                  <p className="text-xs text-rose-600 mt-1">{createErrors.email}</p>
                )}
              </div>

              {/* Password */}
              <div className="space-y-1">
                <label htmlFor="create-admin-password" className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Password <span className="text-rose-500">*</span>
                </label>
                <input
                  id="create-admin-password"
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="At least 8 chars, uppercase, lowercase, number, special char"
                  className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-800"
                />
                {createErrors.password && (
                  <p className="text-xs text-rose-600 mt-1">{createErrors.password}</p>
                )}
              </div>

              {/* Confirm Password */}
              <div className="space-y-1">
                <label htmlFor="create-admin-confirm" className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Confirm Password <span className="text-rose-500">*</span>
                </label>
                <input
                  id="create-admin-confirm"
                  type="password"
                  value={createForm.confirmPassword}
                  onChange={(e) => setCreateForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                  placeholder="Repeat password"
                  className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-800"
                />
                {createErrors.confirmPassword && (
                  <p className="text-xs text-rose-600 mt-1">{createErrors.confirmPassword}</p>
                )}
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  disabled={isCreating}
                  onClick={() => setIsCreateOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  loading={isCreating}
                  disabled={isCreating}
                  className="bg-[#1B4D3E] hover:bg-[#143E31] text-white font-semibold"
                >
                  {isCreating ? 'Creating...' : 'Create Account'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Status Confirmation Dialog */}
      {statusTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-2xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="status-dialog-title"
        >
          <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-start gap-3.5">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                  statusTarget.nextStatus
                    ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                    : 'bg-rose-50 text-rose-600 border-rose-100'
                }`}
              >
                {statusTarget.nextStatus ? (
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
                <h3 id="status-dialog-title" className="text-base font-bold text-slate-900">
                  {statusTarget.nextStatus ? 'Activate User Account?' : 'Deactivate User Account?'}
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  Target User: <strong className="text-slate-900 font-semibold">{statusTarget.user.name}</strong> ({statusTarget.user.email})
                </p>
              </div>
            </div>

            {statusTarget.nextStatus ? (
              <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-3.5 text-xs text-emerald-950 leading-relaxed space-y-1">
                <p className="font-semibold">Reactivation:</p>
                <p>Restores this account's ability to sign in and interact with the store.</p>
              </div>
            ) : (
              <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3.5 text-xs text-amber-950 leading-relaxed space-y-1">
                <p className="font-semibold">Security Impact:</p>
                <p>
                  Deactivating this account prevents future logins. Active administrator protection guarantees at least one administrator remains active.
                </p>
              </div>
            )}

            {statusError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
                {statusError}
              </div>
            )}

            <div className="pt-2 flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={() => setStatusTarget(null)}
                disabled={isMutatingStatus}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="md"
                className={
                  statusTarget.nextStatus
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white font-semibold'
                    : 'bg-rose-600 hover:bg-rose-700 text-white font-semibold'
                }
                onClick={handleConfirmStatus}
                loading={isMutatingStatus}
                disabled={isMutatingStatus}
              >
                {isMutatingStatus
                  ? 'Updating...'
                  : statusTarget.nextStatus
                  ? 'Confirm Activation'
                  : 'Confirm Deactivation'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Role Confirmation Dialog */}
      {roleTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-2xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="role-dialog-title"
        >
          <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
              </div>

              <div className="min-w-0">
                <h3 id="role-dialog-title" className="text-base font-bold text-slate-900">
                  {roleTarget.nextRole === 'admin' ? 'Promote to Administrator?' : 'Demote to Customer?'}
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  Target User: <strong className="text-slate-900 font-semibold">{roleTarget.user.name}</strong> ({roleTarget.user.email})
                </p>
              </div>
            </div>

            <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3.5 text-xs text-amber-950 leading-relaxed space-y-1">
              <p className="font-semibold">Privilege Change Warning:</p>
              {roleTarget.nextRole === 'admin' ? (
                <p>
                  Granting administrative access gives this user full authority over catalog items, order fulfillment, store settings, and user management.
                </p>
              ) : (
                <p>
                  Revoking administrator access removes their access to the Admin Control Panel. They will become a customer account. The final active administrator cannot be demoted.
                </p>
              )}
            </div>

            {roleError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
                {roleError}
              </div>
            )}

            <div className="pt-2 flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={() => setRoleTarget(null)}
                disabled={isMutatingRole}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="md"
                className="bg-[#1B4D3E] hover:bg-[#143E31] text-white font-semibold"
                onClick={handleConfirmRole}
                loading={isMutatingRole}
                disabled={isMutatingRole}
              >
                {isMutatingRole
                  ? 'Updating...'
                  : roleTarget.nextRole === 'admin'
                  ? 'Confirm Promotion'
                  : 'Confirm Demotion'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
