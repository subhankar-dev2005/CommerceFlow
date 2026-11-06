/* global queueMicrotask */
import { useState, useEffect, useCallback } from 'react';
import { adminCouponService as defaultCouponService } from '../../features/admin/adminCoupon.service.js';
import AdminPageHeader from '../../layouts/admin/AdminPageHeader.jsx';
import { AdminLoadingState, AdminErrorState, AdminEmptyState } from '../../layouts/admin/AdminShellStates.jsx';
import { formatPrice } from '../../lib/utils.js';

/**
 * Format ISO date string into readable representation.
 */
function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-IN', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

/**
 * Determine lifecycle status badge of coupon based on dates and active flag.
 */
function getCouponStatusBadge(coupon) {
  if (!coupon.isActive) {
    return {
      label: 'Disabled',
      className: 'bg-slate-100 text-slate-700 border-slate-200',
      dotClass: 'bg-slate-400',
    };
  }

  const now = Date.now();
  if (coupon.startsAt && new Date(coupon.startsAt).getTime() > now) {
    return {
      label: 'Scheduled',
      className: 'bg-blue-50 text-blue-700 border-blue-200',
      dotClass: 'bg-blue-500',
    };
  }

  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < now) {
    return {
      label: 'Expired',
      className: 'bg-rose-50 text-rose-700 border-rose-200',
      dotClass: 'bg-rose-500',
    };
  }

  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
    return {
      label: 'Limit Reached',
      className: 'bg-amber-50 text-amber-700 border-amber-200',
      dotClass: 'bg-amber-500',
    };
  }

  return {
    label: 'Active',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dotClass: 'bg-emerald-500',
  };
}

/**
 * AdminCouponsPage Component
 * Route: /admin/coupons
 *
 * Full coupon management console implementing Phase 4 requirements.
 */
export default function AdminCouponsPage({
  couponService: propCouponService,
}) {
  const service = propCouponService || defaultCouponService;

  const [coupons, setCoupons] = useState([]);
  const [totalCoupons, setTotalCoupons] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [limit] = useState(10);

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder] = useState('desc');

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isAccessDenied, setIsAccessDenied] = useState(false);
  const [notification, setNotification] = useState(null);

  // Create Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    code: '',
    type: 'percentage',
    value: '',
    minimumSubtotal: '',
    maximumDiscount: '',
    startsAt: '',
    expiresAt: '',
    usageLimit: '',
    perUserLimit: '1',
    isActive: true,
  });
  const [createError, setCreateError] = useState(null);
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);

  // Status Toggle In-flight map
  const [togglingIds, setTogglingIds] = useState(new Set());

  // Search debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const loadCoupons = useCallback(async (signal) => {
    setIsLoading(true);
    setError(null);
    setIsAccessDenied(false);
    try {
      const res = await service.getAdminCoupons(
        {
          page,
          limit,
          search: debouncedSearch,
          isActive: activeFilter,
          type: typeFilter,
          sortBy,
          sortOrder,
        },
        { signal }
      );
      setCoupons(res.coupons || []);
      setTotalCoupons(res.totalCoupons || 0);
      setTotalPages(res.totalPages || 1);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      if (err?.status === 403) {
        setIsAccessDenied(true);
        setError('Access denied: You do not have permission to view or manage promotional discount coupons.');
      } else if (err?.code === 'NETWORK_ERROR' || err?.status === 0) {
        setError('Unable to connect to CommerceFlow API server. Please check your network connection or verify the backend server is running on port 4000.');
      } else {
        setError(err?.message || 'Failed to load coupon records.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [service, page, limit, debouncedSearch, activeFilter, typeFilter, sortBy, sortOrder]);

  useEffect(() => {
    let ignore = false;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!ignore) {
        loadCoupons(controller.signal);
      }
    });
    return () => {
      ignore = true;
      controller.abort();
    };
  }, [loadCoupons]);

  const handleToggleStatus = async (coupon) => {
    const couponId = coupon._id || coupon.id;
    if (togglingIds.has(couponId)) return;

    setTogglingIds((prev) => new Set(prev).add(couponId));
    try {
      const updatedStatus = !coupon.isActive;
      await service.updateAdminCouponStatus(couponId, updatedStatus);
      setCoupons((prev) =>
        prev.map((c) =>
          (c._id === couponId || c.id === couponId)
            ? { ...c, isActive: updatedStatus }
            : c
        )
      );
      setNotification({
        type: 'success',
        message: `Coupon "${coupon.code}" ${updatedStatus ? 'enabled' : 'disabled'}.`,
      });
    } catch (err) {
      setNotification({
        type: 'error',
        message: err?.message || 'Failed to update coupon status.',
      });
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(couponId);
        return next;
      });
    }
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setCreateError(null);

    const code = createForm.code.trim().toUpperCase();
    if (!code || code.length < 3 || code.length > 20) {
      setCreateError('Coupon code must contain between 3 and 20 characters');
      return;
    }

    const val = Number(createForm.value);
    if (!val || val <= 0) {
      setCreateError('Discount value must be a positive number');
      return;
    }

    if (createForm.type === 'percentage' && val > 100) {
      setCreateError('Percentage discount cannot exceed 100%');
      return;
    }

    const payload = {
      code,
      type: createForm.type,
      value: val,
      isActive: createForm.isActive,
    };

    if (createForm.minimumSubtotal) {
      payload.minimumSubtotal = Number(createForm.minimumSubtotal) || 0;
    }
    if (createForm.maximumDiscount && createForm.type === 'percentage') {
      payload.maximumDiscount = Number(createForm.maximumDiscount) || null;
    }
    if (createForm.startsAt) {
      payload.startsAt = new Date(createForm.startsAt).toISOString();
    }
    if (createForm.expiresAt) {
      payload.expiresAt = new Date(createForm.expiresAt).toISOString();
    }
    if (createForm.usageLimit) {
      payload.usageLimit = parseInt(createForm.usageLimit, 10);
    }
    if (createForm.perUserLimit) {
      payload.perUserLimit = parseInt(createForm.perUserLimit, 10);
    }

    setIsSubmittingCreate(true);
    try {
      await service.createAdminCoupon(payload);
      setNotification({
        type: 'success',
        message: `Coupon "${code}" successfully created!`,
      });
      setIsCreateOpen(false);
      setCreateForm({
        code: '',
        type: 'percentage',
        value: '',
        minimumSubtotal: '',
        maximumDiscount: '',
        startsAt: '',
        expiresAt: '',
        usageLimit: '',
        perUserLimit: '1',
        isActive: true,
      });
      loadCoupons();
    } catch (err) {
      setCreateError(err?.message || 'Failed to create coupon.');
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header with Title and Create Button */}
      <AdminPageHeader
        title="Coupons Management"
        subtitle="Configure discount rules, promotional coupon codes, and redemption limits."
        badge={`${totalCoupons} Coupons`}
        actions={
          <button
            type="button"
            onClick={() => {
              setCreateError(null);
              setIsCreateOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#063B32] text-white text-xs font-bold hover:bg-[#08493E] shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            <svg className="w-4 h-4 stroke-[2.2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <span>Create Coupon</span>
          </button>
        }
      />

      {/* Global Notification Banner */}
      {notification && (
        <div
          role="status"
          className={`p-3.5 rounded-2xl text-xs font-semibold flex items-center justify-between border ${
            notification.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          <span>{notification.message}</span>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="p-1 hover:opacity-75 transition-opacity"
            aria-label="Dismiss notification"
          >
            &times;
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl border border-[#D8ECE7] p-4 shadow-2xs space-y-3 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-4">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by coupon code..."
            className="w-full pl-9 pr-4 py-2 rounded-xl text-xs bg-[#F0FAF7] border border-[#D8ECE7] text-[#102A2A] placeholder-[#648096] focus:outline-none focus:ring-2 focus:ring-emerald-400 transition-all"
            aria-label="Search coupons by code"
          />
          <svg
            className="w-4 h-4 text-[#648096] absolute left-3 top-2.5 pointer-events-none"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
        </div>

        {/* Dropdown Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Status Filter */}
          <select
            value={activeFilter}
            onChange={(e) => {
              setActiveFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-xl text-xs bg-[#F0FAF7] border border-[#D8ECE7] text-[#102A2A] focus:outline-none focus:ring-2 focus:ring-emerald-400"
            aria-label="Filter coupons by status"
          >
            <option value="">All Statuses</option>
            <option value="true">Active Only</option>
            <option value="false">Disabled Only</option>
          </select>

          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-xl text-xs bg-[#F0FAF7] border border-[#D8ECE7] text-[#102A2A] focus:outline-none focus:ring-2 focus:ring-emerald-400"
            aria-label="Filter coupons by discount type"
          >
            <option value="">All Types</option>
            <option value="percentage">Percentage (%)</option>
            <option value="fixed">Fixed Amount (₹)</option>
          </select>

          {/* Sort By */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-2 rounded-xl text-xs bg-[#F0FAF7] border border-[#D8ECE7] text-[#102A2A] focus:outline-none focus:ring-2 focus:ring-emerald-400"
            aria-label="Sort coupons by"
          >
            <option value="createdAt">Date Created</option>
            <option value="code">Coupon Code</option>
            <option value="usedCount">Redemption Count</option>
            <option value="expiresAt">Expiry Date</option>
          </select>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <AdminLoadingState title="Loading coupons..." />
      ) : error ? (
        <AdminErrorState
          title={isAccessDenied ? 'Access Denied' : 'Could not load coupons'}
          message={error}
          onRetry={isAccessDenied ? undefined : loadCoupons}
        />
      ) : coupons.length === 0 ? (
        <AdminEmptyState
          title="No Coupons Found"
          description={
            debouncedSearch || activeFilter || typeFilter
              ? 'No coupons match your filter criteria. Try clearing filters.'
              : 'Create promotional coupon codes to provide discounts for your customers.'
          }
          actionLabel="Create Coupon"
          onAction={() => setIsCreateOpen(true)}
        />
      ) : (
        <div className="bg-white rounded-2xl border border-[#D8ECE7] shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" aria-label="Coupons table">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-bold uppercase tracking-wider text-[#648096]">
                  <th className="py-3 px-4">Coupon Code</th>
                  <th className="py-3 px-4">Discount</th>
                  <th className="py-3 px-4">Order Limits</th>
                  <th className="py-3 px-4">Schedule</th>
                  <th className="py-3 px-4">Redemptions</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {coupons.map((coupon) => {
                  const badge = getCouponStatusBadge(coupon);
                  const isToggling = togglingIds.has(coupon._id || coupon.id);

                  return (
                    <tr key={coupon._id || coupon.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Code */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs bg-[#E8F5F1] text-[#063B32] px-2.5 py-1 rounded-lg border border-[#BDE0D5] tracking-wide select-all">
                            {coupon.code}
                          </span>
                        </div>
                      </td>

                      {/* Discount */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-800">
                          {coupon.type === 'percentage'
                            ? `${coupon.value}% Off`
                            : `${formatPrice(coupon.value)} Flat`}
                        </div>
                        {coupon.type === 'percentage' && coupon.maximumDiscount && (
                          <div className="text-[10px] text-slate-400">
                            Max {formatPrice(coupon.maximumDiscount)}
                          </div>
                        )}
                      </td>

                      {/* Order Limits */}
                      <td className="py-3 px-4 text-slate-600">
                        <div>
                          Min Subtotal:{' '}
                          <strong className="text-slate-800 font-semibold">
                            {coupon.minimumSubtotal ? formatPrice(coupon.minimumSubtotal) : 'None'}
                          </strong>
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Limit per user: {coupon.perUserLimit || 1}
                        </div>
                      </td>

                      {/* Schedule */}
                      <td className="py-3 px-4 text-slate-600">
                        <div>Expires: {formatDate(coupon.expiresAt)}</div>
                        {coupon.startsAt && (
                          <div className="text-[10px] text-slate-400">
                            Starts: {formatDate(coupon.startsAt)}
                          </div>
                        )}
                      </td>

                      {/* Redemptions */}
                      <td className="py-3 px-4 text-slate-700">
                        <div className="font-semibold">
                          {coupon.usedCount || 0} /{' '}
                          {coupon.usageLimit ? `${coupon.usageLimit} uses` : 'Unlimited'}
                        </div>
                        {coupon.usageLimit && (
                          <div className="w-24 bg-slate-100 rounded-full h-1.5 mt-1 overflow-hidden">
                            <div
                              className="bg-emerald-500 h-1.5 rounded-full"
                              style={{
                                width: `${Math.min(
                                  100,
                                  ((coupon.usedCount || 0) / coupon.usageLimit) * 100
                                )}%`,
                              }}
                            />
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${badge.className}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${badge.dotClass}`} />
                          <span>{badge.label}</span>
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          disabled={isToggling}
                          onClick={() => handleToggleStatus(coupon)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                            coupon.isActive
                              ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                          } ${isToggling ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {coupon.isActive ? 'Disable' : 'Enable'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="p-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>
                Page {page} of {totalPages} ({totalCoupons} total)
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 font-semibold"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 font-semibold"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create Coupon Modal */}
      {isCreateOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-coupon-heading"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
        >
          <div className="bg-white rounded-3xl border border-[#D8ECE7] shadow-2xl max-w-xl w-full p-6 sm:p-8 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 id="create-coupon-heading" className="text-lg font-bold text-[#102A2A]">
                  Create Promotional Coupon
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Set authoritative rules, discount amounts, and redemption limits.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
                aria-label="Close dialog"
              >
                &times;
              </button>
            </div>

            {createError && (
              <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              {/* Code */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Coupon Code *
                </label>
                <input
                  type="text"
                  required
                  value={createForm.code}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))
                  }
                  placeholder="e.g. SUMMER2026"
                  className="w-full px-3 py-2 rounded-xl text-xs font-mono font-bold bg-[#F0FAF7] border border-[#D8ECE7] text-[#102A2A] uppercase placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  3–20 alphanumeric characters, hyphens or underscores.
                </span>
              </div>

              {/* Type & Value */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Discount Type *
                  </label>
                  <select
                    value={createForm.type}
                    onChange={(e) =>
                      setCreateForm((prev) => ({ ...prev, type: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-xl text-xs bg-[#F0FAF7] border border-[#D8ECE7] text-[#102A2A] focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  >
                    <option value="percentage">Percentage Discount (%)</option>
                    <option value="fixed">Fixed Amount Discount (₹)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Discount Value * {createForm.type === 'percentage' ? '(1–100%)' : '(₹)'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={createForm.type === 'percentage' ? '100' : undefined}
                    required
                    value={createForm.value}
                    onChange={(e) =>
                      setCreateForm((prev) => ({ ...prev, value: e.target.value }))
                    }
                    placeholder={createForm.type === 'percentage' ? '20' : '500'}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-[#F0FAF7] border border-[#D8ECE7] text-[#102A2A] focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </div>
              </div>

              {/* Minimum Subtotal & Max Discount */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Minimum Order Subtotal (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={createForm.minimumSubtotal}
                    onChange={(e) =>
                      setCreateForm((prev) => ({ ...prev, minimumSubtotal: e.target.value }))
                    }
                    placeholder="0"
                    className="w-full px-3 py-2 rounded-xl text-xs bg-[#F0FAF7] border border-[#D8ECE7] text-[#102A2A] focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </div>

                {createForm.type === 'percentage' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Max Discount Cap (₹, optional)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={createForm.maximumDiscount}
                      onChange={(e) =>
                        setCreateForm((prev) => ({ ...prev, maximumDiscount: e.target.value }))
                      }
                      placeholder="e.g. 1000"
                      className="w-full px-3 py-2 rounded-xl text-xs bg-[#F0FAF7] border border-[#D8ECE7] text-[#102A2A] focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    />
                  </div>
                )}
              </div>

              {/* Start Date & Expiry Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Start Date (Optional)
                  </label>
                  <input
                    type="datetime-local"
                    value={createForm.startsAt}
                    onChange={(e) =>
                      setCreateForm((prev) => ({ ...prev, startsAt: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-xl text-xs bg-[#F0FAF7] border border-[#D8ECE7] text-[#102A2A] focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Expiry Date (Optional)
                  </label>
                  <input
                    type="datetime-local"
                    value={createForm.expiresAt}
                    onChange={(e) =>
                      setCreateForm((prev) => ({ ...prev, expiresAt: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-xl text-xs bg-[#F0FAF7] border border-[#D8ECE7] text-[#102A2A] focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </div>
              </div>

              {/* Usage Limits */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Total Usage Limit (Optional)
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={createForm.usageLimit}
                    onChange={(e) =>
                      setCreateForm((prev) => ({ ...prev, usageLimit: e.target.value }))
                    }
                    placeholder="e.g. 500"
                    className="w-full px-3 py-2 rounded-xl text-xs bg-[#F0FAF7] border border-[#D8ECE7] text-[#102A2A] focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Per-Customer Limit
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={createForm.perUserLimit}
                    onChange={(e) =>
                      setCreateForm((prev) => ({ ...prev, perUserLimit: e.target.value }))
                    }
                    placeholder="1"
                    className="w-full px-3 py-2 rounded-xl text-xs bg-[#F0FAF7] border border-[#D8ECE7] text-[#102A2A] focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </div>
              </div>

              {/* Active Toggle */}
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="create-coupon-active"
                  checked={createForm.isActive}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, isActive: e.target.checked }))
                  }
                  className="rounded border-[#D8ECE7] text-emerald-600 focus:ring-emerald-400"
                />
                <label htmlFor="create-coupon-active" className="text-xs font-bold text-slate-700">
                  Enable coupon immediately upon creation
                </label>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCreate}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-[#063B32] text-white hover:bg-[#08493E] shadow-sm transition-all disabled:opacity-50"
                >
                  {isSubmittingCreate ? 'Creating...' : 'Save Coupon'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
