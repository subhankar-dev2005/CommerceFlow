/* global queueMicrotask */
import { useState, useEffect, useCallback } from 'react';
import {
  adminRefundService as defaultRefundService,
  REFUND_STATUSES,
  REFUND_STATUS_BADGES,
} from '../../features/admin/adminRefund.service.js';
import { formatPrice } from '../../lib/utils.js';
import Button from '../../components/Button.jsx';
import AdminPageHeader from '../../layouts/admin/AdminPageHeader.jsx';
import { AdminLoadingState, AdminErrorState, AdminEmptyState } from '../../layouts/admin/AdminShellStates.jsx';

/**
 * Format timestamp into human-readable date/time string.
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
 * Admin Refunds & Financial Ledger Reconciliation Console
 * Route: /admin/refunds
 */
export default function AdminRefundsPage({
  search: initialSearch = '',
  refundService: propRefundService,
}) {
  const service = propRefundService || defaultRefundService;

  const [refundsList, setRefundsList] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [statusFilter, setStatusFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Selected refund for detail modal
  const [selectedRefundData, setSelectedRefundData] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [retryLoading, setRetryLoading] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);

  // Search debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPagination((prev) => ({ ...prev, page: 1 }));
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchRefunds = useCallback(
    async (page = 1) => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await service.adminGetRefunds({
          page,
          limit: pagination.limit || 10,
          status: statusFilter || undefined,
          search: debouncedSearch ? debouncedSearch.trim() : undefined,
          sortBy: 'createdAt',
          sortOrder: 'desc',
        });
        setRefundsList(data.refunds || []);
        setPagination(data.pagination || { page, limit: 10, total: 0, totalPages: 1 });
      } catch (err) {
        setError(err?.message || 'Failed to load refunds list.');
      } finally {
        setIsLoading(false);
      }
    },
    [pagination.limit, statusFilter, debouncedSearch, service]
  );

  useEffect(() => {
    let ignore = false;
    queueMicrotask(() => {
      if (!ignore) {
        fetchRefunds(pagination.page);
      }
    });
    return () => {
      ignore = true;
    };
  }, [fetchRefunds, pagination.page]);

  // Open refund detail inspection
  const handleOpenDetail = async (refundId) => {
    setModalLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const detail = await service.adminGetRefundById(refundId);
      setSelectedRefundData(detail);
    } catch (err) {
      setActionError(err?.message || 'Failed to load refund details.');
    } finally {
      setModalLoading(false);
    }
  };

  // Handle retry action
  const handleRetry = async () => {
    if (!selectedRefundData?.refund?._id) return;
    setRetryLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await service.adminRetryRefund(selectedRefundData.refund._id);
      setActionSuccess('Refund retry initiated successfully.');
      // Refresh detail
      const refreshedDetail = await service.adminGetRefundById(selectedRefundData.refund._id);
      setSelectedRefundData(refreshedDetail);
      // Refresh background table
      fetchRefunds(pagination.page);
    } catch (err) {
      setActionError(err?.message || 'Refund retry failed.');
    } finally {
      setRetryLoading(false);
    }
  };

  // Handle reconciliation action
  const handleReconcile = async () => {
    if (!selectedRefundData?.refund?._id) return;
    setRetryLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await service.adminReconcileRefund(selectedRefundData.refund._id);
      setActionSuccess(`Refund reconciliation completed. Outcome: ${res?.outcome || 'processed'}`);
      // Refresh detail
      const refreshedDetail = await service.adminGetRefundById(selectedRefundData.refund._id);
      setSelectedRefundData(refreshedDetail);
      // Refresh background table
      fetchRefunds(pagination.page);
    } catch (err) {
      setActionError(err?.message || 'Refund reconciliation failed.');
    } finally {
      setRetryLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Payment Refunds & Financial Ledger"
        description="Immutable financial ledger, authoritative payment gateway refunds, and reconciliation management."
      />

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="refund-status-filter" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Status:
          </label>
          <select
            id="refund-status-filter"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPagination((prev) => ({ ...prev, page: 1 }));
            }}
            className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">All Statuses</option>
            {REFUND_STATUSES.map((status) => (
              <option key={status} value={status}>
                {REFUND_STATUS_BADGES[status]?.label || status}
              </option>
            ))}
          </select>
        </div>

        <div className="relative flex-1 max-w-sm">
          <input
            type="text"
            placeholder="Search refund #, order, return, or payment ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <svg
            className="w-4 h-4 text-slate-400 absolute left-3 top-2.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* Main Content States */}
      {isLoading ? (
        <AdminLoadingState message="Loading financial refunds and ledger entries..." />
      ) : error ? (
        <AdminErrorState
          title="Failed to Load Refunds"
          message={error}
          onRetry={() => fetchRefunds(pagination.page)}
        />
      ) : refundsList.length === 0 ? (
        <AdminEmptyState
          title="No Refund Records Found"
          description={
            statusFilter || debouncedSearch
              ? 'No refunds matched the selected filters. Try clearing your search parameters.'
              : 'There are currently no processed or pending refund records in the store ledger.'
          }
        />
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="p-3.5">Refund #</th>
                  <th className="p-3.5">Order &amp; Return</th>
                  <th className="p-3.5">Customer</th>
                  <th className="p-3.5 text-right">Amount</th>
                  <th className="p-3.5">Gateway &amp; ID</th>
                  <th className="p-3.5 text-center">Status</th>
                  <th className="p-3.5">Created Date</th>
                  <th className="p-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {refundsList.map((refund) => {
                  const badge = REFUND_STATUS_BADGES[refund.status] || {
                    label: refund.status,
                    className: 'bg-slate-100 text-slate-700 border-slate-300',
                  };

                  return (
                    <tr key={refund._id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="p-3.5">
                        <span className="font-mono font-bold text-slate-900 block">{refund.refundNumber}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{refund._id}</span>
                      </td>

                      <td className="p-3.5">
                        <span className="text-slate-900 font-mono block">
                          Order: {refund.orderId?._id || refund.orderId}
                        </span>
                        {refund.returnId && (
                          <span className="text-slate-500 font-mono text-[10px] block">
                            RMA: {refund.returnId?.returnNumber || refund.returnId}
                          </span>
                        )}
                      </td>

                      <td className="p-3.5">
                        <span className="font-bold text-slate-900 block">
                          {refund.customerId?.name || 'Customer'}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {refund.customerId?.email || 'N/A'}
                        </span>
                      </td>

                      <td className="p-3.5 text-right">
                        <span className="font-bold text-slate-900 block">
                          {formatPrice(refund.amount)}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {refund.amountInPaise} paise ({refund.currency})
                        </span>
                      </td>

                      <td className="p-3.5">
                        <span className="uppercase text-[10px] font-bold text-slate-600 block">
                          {refund.gateway}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono block">
                          Pay: {refund.gatewayPaymentId ? refund.gatewayPaymentId.slice(0, 16) + '...' : 'N/A'}
                        </span>
                        {refund.gatewayRefundId && (
                          <span className="text-[10px] text-emerald-700 font-mono block">
                            Ref: {refund.gatewayRefundId}
                          </span>
                        )}
                      </td>

                      <td className="p-3.5 text-center">
                        <span
                          className={`inline-block px-2.5 py-1 text-[10px] font-bold uppercase rounded-full border ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      </td>

                      <td className="p-3.5 text-slate-500 text-[11px]">
                        {formatFullDate(refund.createdAt)}
                      </td>

                      <td className="p-3.5 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenDetail(refund._id)}
                          className="text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 rounded-xl text-xs font-bold"
                        >
                          Inspect &amp; Reconcile
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Bounded Server Pagination */}
          <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>
              Showing {refundsList.length} of {pagination.total} refunds
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={pagination.page <= 1}
                onClick={() => setPagination((prev) => ({ ...prev, page: prev.page - 1 }))}
                className="text-xs"
              >
                Previous
              </Button>
              <span className="font-medium text-slate-700">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
                className="text-xs"
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Refund Detail & Reconciliation Modal */}
      {(selectedRefundData || modalLoading) && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100 p-6 space-y-6">
            {modalLoading ? (
              <AdminLoadingState message="Loading refund detail & ledger history..." />
            ) : selectedRefundData?.refund ? (
              <>
                <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      Refund Inspection &amp; Ledger Reconciliation
                    </h2>
                    <p className="text-xs font-mono text-slate-500">
                      {selectedRefundData.refund.refundNumber}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedRefundData(null)}
                    className="text-slate-400 hover:text-slate-600 p-1"
                    aria-label="Close dialog"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Status Notice */}
                {actionError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs">
                    {actionError}
                  </div>
                )}
                {actionSuccess && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs">
                    {actionSuccess}
                  </div>
                )}

                {/* Refund Parameters Grid */}
                <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Authoritative Amount</span>
                    <span className="text-base font-bold text-slate-900">
                      {formatPrice(selectedRefundData.refund.amount)}
                    </span>
                    <span className="text-[10px] text-slate-500 block font-mono">
                      {selectedRefundData.refund.amountInPaise} paise ({selectedRefundData.refund.currency})
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Refund Lifecycle Status</span>
                    <span
                      className={`inline-block mt-1 px-3 py-1 text-xs font-bold uppercase rounded-full border ${
                        REFUND_STATUS_BADGES[selectedRefundData.refund.status]?.className || 'bg-slate-100'
                      }`}
                    >
                      {REFUND_STATUS_BADGES[selectedRefundData.refund.status]?.label || selectedRefundData.refund.status}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Gateway &amp; Payment ID</span>
                    <span className="font-mono text-slate-800 block">
                      {selectedRefundData.refund.gateway} : {selectedRefundData.refund.gatewayPaymentId}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Gateway Refund ID</span>
                    <span className="font-mono text-slate-800 block">
                      {selectedRefundData.refund.gatewayRefundId || 'None / Not completed'}
                    </span>
                  </div>

                  <div className="col-span-2">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Idempotency Key</span>
                    <span className="font-mono text-[11px] text-slate-600 block">
                      {selectedRefundData.refund.idempotencyKey}
                    </span>
                  </div>

                  {selectedRefundData.refund.failureReason && (
                    <div className="col-span-2 bg-rose-50 border border-rose-200 rounded-xl p-3 text-rose-900">
                      <span className="text-[10px] uppercase font-bold text-rose-600 block">Gateway Failure Reason</span>
                      <p className="text-xs">{selectedRefundData.refund.failureReason}</p>
                    </div>
                  )}
                </div>

                {/* Immutable Financial Ledger History */}
                <div>
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Immutable Financial Ledger History
                  </h3>
                  <div className="border border-slate-200 rounded-2xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-500 border-b border-slate-200">
                        <tr>
                          <th className="p-2.5">Event Type</th>
                          <th className="p-2.5">Direction</th>
                          <th className="p-2.5 text-right">Amount</th>
                          <th className="p-2.5 text-center">Status</th>
                          <th className="p-2.5">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                        {(selectedRefundData.ledgerEntries || []).map((entry) => (
                          <tr key={entry._id}>
                            <td className="p-2.5 font-bold text-slate-800">{entry.eventType}</td>
                            <td className="p-2.5 uppercase text-slate-600">{entry.direction}</td>
                            <td className="p-2.5 text-right font-bold text-slate-900">{formatPrice(entry.amount)}</td>
                            <td className="p-2.5 text-center font-bold text-slate-700">{entry.status}</td>
                            <td className="p-2.5 text-slate-500">{formatFullDate(entry.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Operational Actions */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedRefundData(null)}
                    className="text-xs font-bold text-slate-600"
                  >
                    Close
                  </Button>

                  {/* Retry Action: ONLY visible and permitted when status === 'failed' */}
                  {selectedRefundData.refund.status === 'failed' && (
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={retryLoading}
                      onClick={handleRetry}
                      className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold"
                    >
                      {retryLoading ? 'Retrying Refund...' : 'Retry Failed Gateway Refund'}
                    </Button>
                  )}

                  {/* Reconcile Action: ONLY visible and permitted when status === 'reconciliation_required' */}
                  {selectedRefundData.refund.status === 'reconciliation_required' && (
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={retryLoading}
                      onClick={handleReconcile}
                      className="bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold"
                    >
                      {retryLoading ? 'Reconciling State...' : 'Reconcile Gateway State'}
                    </Button>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
