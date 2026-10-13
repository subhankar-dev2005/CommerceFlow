import { useState, useEffect, useRef } from 'react';
import {
  adminCustomerService,
} from '../../features/admin/adminCustomer.service.js';
import { formatPrice } from '../../lib/utils.js';
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
 * Returns badge styling and label for backend order.status.
 */
function getOrderStatusBadge(status) {
  switch (status?.toLowerCase()) {
    case 'confirmed':
      return { className: 'bg-blue-50 text-blue-700 border-blue-200', label: 'Confirmed' };
    case 'processing':
      return { className: 'bg-indigo-50 text-indigo-700 border-indigo-200', label: 'Processing' };
    case 'shipped':
      return { className: 'bg-purple-50 text-purple-700 border-purple-200', label: 'Shipped' };
    case 'delivered':
      return { className: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Delivered' };
    case 'cancelled':
      return { className: 'bg-rose-50 text-rose-700 border-rose-200', label: 'Cancelled' };
    case 'pending':
    default:
      return { className: 'bg-amber-50 text-amber-800 border-amber-200', label: 'Pending' };
  }
}

/**
 * Returns badge styling and label for backend payment.status.
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
      return { className: 'bg-slate-50 text-slate-600 border-slate-200', label: 'Pending' };
  }
}

/**
 * P1.3 Step 79.6 — Admin Customer Detail Page
 * Route: /admin/customers/:customerId
 */
export default function AdminCustomerDetailsPage({ customerId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isNotFound, setIsNotFound] = useState(false);
  const [actionSuccess, setActionSuccess] = useState(null);

  // Status Mutation Modal State: { nextStatus: boolean }
  const [mutationModalOpen, setMutationModalOpen] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [mutationError, setMutationError] = useState(null);
  const [reloadTrigger, setReloadTrigger] = useState(0);

  const toastTimerRef = useRef(null);
  const isMountedRef = useRef(true);
  const modalCancelBtnRef = useRef(null);
  const modalContainerRef = useRef(null);

  // Track mount status and cleanup timers
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  // Fetch customer details
  useEffect(() => {
    let isMounted = true;
    const abortController = typeof window !== 'undefined' && window.AbortController
      ? new window.AbortController()
      : null;

    adminCustomerService
      .getAdminCustomer(customerId, { signal: abortController?.signal })
      .then((res) => {
        if (!isMounted) return;
        setError(null);
        setIsNotFound(false);
        setData(res);
      })
      .catch((err) => {
        if (!isMounted) return;
        if (err?.name === 'AbortError') return;
        if (err?.status === 404 || err?.code === 'CUSTOMER_NOT_FOUND') {
          setIsNotFound(true);
          setError(null);
        } else {
          setError(err?.message || 'Failed to load customer details.');
        }
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
  }, [customerId, reloadTrigger]);

  // Handle Escape key for accessible modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && mutationModalOpen && !isMutating) {
        setMutationModalOpen(false);
        setMutationError(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mutationModalOpen, isMutating]);

  // Focus cancel button when modal opens
  useEffect(() => {
    if (mutationModalOpen && modalCancelBtnRef.current) {
      modalCancelBtnRef.current.focus();
    }
  }, [mutationModalOpen]);

  const handleOpenStatusModal = () => {
    setMutationError(null);
    setMutationModalOpen(true);
  };

  const handleConfirmStatusMutation = async () => {
    if (!data?.customer || isMutating) return;

    const nextStatus = !data.customer.isActive;
    setIsMutating(true);
    setMutationError(null);

    try {
      const updatedCustomer = await adminCustomerService.updateAdminCustomerStatus(
        customerId,
        nextStatus
      );

      if (!isMountedRef.current) return;

      setData((prev) => ({
        ...prev,
        customer: {
          ...prev.customer,
          isActive: updatedCustomer?.isActive ?? nextStatus,
          updatedAt: updatedCustomer?.updatedAt || new Date().toISOString(),
        },
      }));

      setMutationModalOpen(false);
      setActionSuccess(
        `Customer account was successfully ${nextStatus ? 'activated' : 'deactivated'}.`
      );

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

  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading customer profile">
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (isNotFound) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/90 p-8 shadow-xs text-center space-y-4 max-w-lg mx-auto my-12">
        <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-100">
          <svg className="w-6 h-6 stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-slate-900">Customer Not Found</h1>
        <p className="text-sm text-slate-500">
          The requested customer record does not exist or may have been removed.
        </p>
        <div className="pt-2">
          <Button as="a" href="/admin/customers" variant="primary" size="md">
            &larr; Return to Customers
          </Button>
        </div>
      </div>
    );
  }

  if (error || !data?.customer) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/90 p-8 shadow-xs">
        <ErrorState
          title="Unable to load customer profile"
          description={error || 'An unexpected error occurred while fetching customer details.'}
          onRetry={() => {
            setLoading(true);
            setError(null);
            setReloadTrigger((prev) => prev + 1);
          }}
        />
      </div>
    );
  }

  const { customer, addresses = [], orderStats = {}, recentOrders = [] } = data;
  const isActive = customer.isActive;
  const nextStatus = !isActive;

  return (
    <div className="space-y-6">
      {/* 1. Breadcrumb and Back Navigation */}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <a href="/admin/customers" className="hover:text-blue-600 flex items-center gap-1 font-medium">
          &larr; Back to Customers
        </a>
        <span aria-hidden="true">/</span>
        <span className="text-slate-800 font-semibold truncate max-w-[200px]">
          {customer.name}
        </span>
      </div>

      {/* 2. Success Toast */}
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

      {/* 3. Customer Identity Card */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-5">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              {customer.name}
            </h1>
            {isActive ? (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border bg-emerald-50 text-emerald-700 border-emerald-200">
                Active Account
              </span>
            ) : (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border bg-slate-100 text-slate-700 border-slate-200">
                Inactive Account
              </span>
            )}
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
              Customer
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            <span className="text-slate-700 font-medium">Email: {customer.email}</span>
            <span aria-hidden="true">&bull;</span>
            <span className="font-mono text-[11px]">ID: {customer._id || customer.id}</span>
            <span aria-hidden="true">&bull;</span>
            <span>Joined: {formatFullDate(customer.createdAt)}</span>
          </div>
        </div>

        {/* Action Button */}
        <div className="shrink-0 flex items-center gap-2">
          {isActive ? (
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={handleOpenStatusModal}
              className="font-semibold text-xs text-rose-600 hover:bg-rose-50 border-slate-200 min-h-[40px]"
            >
              Deactivate Account
            </Button>
          ) : (
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={handleOpenStatusModal}
              className="font-semibold text-xs text-emerald-700 hover:bg-emerald-50 border-slate-200 min-h-[40px]"
            >
              Activate Account
            </Button>
          )}
        </div>
      </div>

      {/* 4. Order Summary / Financial Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Orders */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-1">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
            Total Orders Placed
          </span>
          <p className="text-2xl font-black text-slate-900 tracking-tight">
            {orderStats.totalOrders ?? 0}
          </p>
          <span className="text-[11px] text-slate-400 block">
            All order statuses included
          </span>
        </div>

        {/* Total Spent */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-1">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
            Total Spend
          </span>
          <p className="text-2xl font-black text-slate-900 tracking-tight">
            {formatPrice(orderStats.totalSpent ?? 0)}
          </p>
          <span className="text-[11px] text-slate-400 block">
            Paid, non-cancelled orders only
          </span>
        </div>

        {/* Last Order Date */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-1">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
            Most Recent Order
          </span>
          <p className="text-sm font-bold text-slate-800 pt-1">
            {orderStats.lastOrderDate ? formatFullDate(orderStats.lastOrderDate) : 'No orders recorded'}
          </p>
          <span className="text-[11px] text-slate-400 block">
            Last checkout timestamp
          </span>
        </div>
      </div>

      {/* 5. Delivery Addresses Section */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">
            Saved Delivery Addresses
          </h2>
          <span className="text-xs text-slate-400">
            {addresses.length} {addresses.length === 1 ? 'address' : 'addresses'}
          </span>
        </div>

        {addresses.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-slate-100">
            No saved delivery addresses found for this customer.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {addresses.map((addr) => (
              <div
                key={addr._id || addr.id}
                className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/50 space-y-2 text-xs text-slate-700"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-900 text-sm">{addr.fullName}</span>
                  {addr.isDefault && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                      Default Address
                    </span>
                  )}
                </div>

                <div className="space-y-0.5 text-slate-600">
                  <p>{addr.addressLine1}</p>
                  {addr.addressLine2 && <p>{addr.addressLine2}</p>}
                  <p>
                    {addr.city}, {addr.state} {addr.postalCode}
                  </p>
                  <p>{addr.country || 'India'}</p>
                </div>

                {addr.phone && (
                  <p className="text-[11px] text-slate-500 pt-1 border-t border-slate-200/60">
                    Phone: {addr.phone}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 6. Recent Orders Section */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">
            Recent Orders
          </h2>
          <span className="text-xs text-slate-400">
            Showing up to 5 recent orders
          </span>
        </div>

        {recentOrders.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-slate-100">
            No orders placed by this customer yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-slate-500 font-bold uppercase tracking-wider">
                  <th scope="col" className="py-3 px-4">Order ID</th>
                  <th scope="col" className="py-3 px-4">Date Placed</th>
                  <th scope="col" className="py-3 px-4">Fulfillment</th>
                  <th scope="col" className="py-3 px-4">Payment</th>
                  <th scope="col" className="py-3 px-4 text-center">Items</th>
                  <th scope="col" className="py-3 px-4 text-right">Total</th>
                  <th scope="col" className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {recentOrders.map((order) => {
                  const orderId = order._id || order.id;
                  const orderBadge = getOrderStatusBadge(order.status);
                  const paymentBadge = getPaymentStatusBadge(order.paymentStatus);

                  return (
                    <tr key={orderId} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900 select-all">
                        <a
                          href={`/admin/orders/${orderId}`}
                          className="text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          {orderId}
                        </a>
                      </td>

                      <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                        {formatFullDate(order.createdAt)}
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${orderBadge.className}`}>
                          {orderBadge.label}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${paymentBadge.className}`}>
                          {paymentBadge.label}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-center font-semibold text-slate-800">
                        {order.itemCount ?? 0}
                      </td>

                      <td className="py-3.5 px-4 text-right font-bold text-slate-900 whitespace-nowrap">
                        {formatPrice(order.total ?? 0)}
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <Button
                          as="a"
                          href={`/admin/orders/${orderId}`}
                          variant="secondary"
                          size="sm"
                          className="font-semibold text-xs"
                        >
                          View Order &rarr;
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 7. Status Mutation Confirmation Modal */}
      {mutationModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-2xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="detail-mutation-dialog-title"
          aria-describedby="detail-mutation-dialog-desc"
          ref={modalContainerRef}
          onClick={(e) => {
            if (e.target === modalContainerRef.current && !isMutating) {
              setMutationModalOpen(false);
              setMutationError(null);
            }
          }}
        >
          <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-start gap-3.5">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                  nextStatus
                    ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                    : 'bg-rose-50 text-rose-600 border-rose-100'
                }`}
              >
                {nextStatus ? (
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
                <h3 id="detail-mutation-dialog-title" className="text-base font-bold text-slate-900">
                  {nextStatus ? 'Activate Customer Account?' : 'Deactivate Customer Account?'}
                </h3>
                <p id="detail-mutation-dialog-desc" className="text-xs text-slate-600 mt-1">
                  Target Customer: <strong className="text-slate-900 font-semibold">{customer.name}</strong> ({customer.email})
                </p>
              </div>
            </div>

            {nextStatus ? (
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
                  setMutationModalOpen(false);
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
                  nextStatus
                    ? 'bg-emerald-600 hover:bg-emerald-700 border-emerald-600 text-white min-h-[44px] font-semibold'
                    : 'bg-rose-600 hover:bg-rose-700 border-rose-600 text-white min-h-[44px] font-semibold'
                }
                onClick={handleConfirmStatusMutation}
                disabled={isMutating}
                loading={isMutating}
              >
                {isMutating
                  ? 'Updating...'
                  : nextStatus
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
