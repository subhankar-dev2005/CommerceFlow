/* global queueMicrotask */
import { useState, useEffect, useCallback } from 'react';
import {
  returnService as defaultReturnService,
  RETURN_STATUSES,
  RETURN_STATUS_BADGES,
  RETURN_REASON_LABELS,
  ALLOWED_RETURN_TRANSITIONS,
} from '../../features/returns/return.service.js';
import { adminRefundService } from '../../features/admin/adminRefund.service.js';
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
 * Admin Returns Management Page
 * Route: /admin/returns
 */
export default function AdminReturnsPage({ search: initialSearch = '', returnService: propReturnService }) {
  const service = propReturnService || defaultReturnService;
  const [returnsList, setReturnsList] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [statusFilter, setStatusFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Selected return for inspection / action modal
  const [selectedReturn, setSelectedReturn] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);

  // Modals for actions
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);

  // Search debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPagination((prev) => ({ ...prev, page: 1 }));
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchReturns = useCallback(async (page = 1) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await service.adminGetReturns({
        page,
        limit: pagination.limit || 10,
        status: statusFilter || undefined,
        search: debouncedSearch ? debouncedSearch.trim() : undefined,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });
      setReturnsList(data.returns || []);
      setPagination(data.pagination || { page, limit: 10, total: 0, totalPages: 1 });
    } catch (err) {
      setError(err?.message || 'Failed to load returns list.');
    } finally {
      setIsLoading(false);
    }
  }, [pagination.limit, statusFilter, debouncedSearch, service]);

  useEffect(() => {
    let ignore = false;
    queueMicrotask(() => {
      if (!ignore) {
        fetchReturns(pagination.page);
      }
    });
    return () => {
      ignore = true;
    };
  }, [fetchReturns, pagination.page]);

  const handleApprove = async () => {
    if (!selectedReturn) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const updated = await service.adminApproveReturn(selectedReturn._id, adminNote);
      setActionSuccess('Return request approved successfully.');
      setSelectedReturn(updated);
      setAdminNote('');
      fetchReturns(pagination.page);
    } catch (err) {
      setActionError(err?.message || 'Failed to approve return.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selectedReturn || !rejectionReason.trim()) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const updated = await service.adminRejectReturn(selectedReturn._id, rejectionReason, adminNote);
      setActionSuccess('Return request rejected.');
      setSelectedReturn(updated);
      setShowRejectModal(false);
      setRejectionReason('');
      setAdminNote('');
      fetchReturns(pagination.page);
    } catch (err) {
      setActionError(err?.message || 'Failed to reject return.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReceive = async () => {
    if (!selectedReturn) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const updated = await service.adminReceiveReturn(selectedReturn._id, adminNote);
      setActionSuccess('Items marked received at facility.');
      setSelectedReturn(updated);
      setAdminNote('');
      fetchReturns(pagination.page);
    } catch (err) {
      setActionError(err?.message || 'Failed to mark return received.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!selectedReturn) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const updated = await service.adminCompleteReturn(selectedReturn._id, adminNote);
      setActionSuccess('Return completed successfully. Variant inventory has been restocked.');
      setSelectedReturn(updated);
      setShowCompleteConfirm(false);
      setAdminNote('');
      fetchReturns(pagination.page);
    } catch (err) {
      setActionError(err?.message || 'Failed to complete return.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleInitiateRefund = async () => {
    if (!selectedReturn) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await adminRefundService.adminCreateReturnRefund(selectedReturn._id, adminNote);
      setActionSuccess('Gateway refund processed successfully and recorded in financial ledger.');
      if (res?.refund) {
        setSelectedReturn((prev) => ({
          ...prev,
          refundStatus: res.refund.status,
          refundNote: `Gateway refund processed (Refund #${res.refund.refundNumber})`,
        }));
      }
      setAdminNote('');
      fetchReturns(pagination.page);
    } catch (err) {
      setActionError(err?.message || 'Failed to initiate gateway refund.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Returns & RMA Management"
        description="Inspect return requests, approve/reject RMA claims, track incoming packages, and complete inventory restocking."
      />

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center bg-white p-4 rounded-2xl border border-slate-200">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="status-filter" className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Status:
          </label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPagination((p) => ({ ...p, page: 1 }));
            }}
            className="px-3 py-1.5 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Statuses</option>
            {RETURN_STATUSES.map((st) => (
              <option key={st} value={st}>
                {RETURN_STATUS_BADGES[st]?.label || st}
              </option>
            ))}
          </select>
        </div>

        <div className="relative flex-1 max-w-sm">
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search return #, order ID..."
            className="w-full px-3 py-1.5 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <AdminLoadingState title="Loading return requests..." />
      ) : error ? (
        <AdminErrorState
          title="Failed to Load Returns"
          message={error}
          onRetry={() => fetchReturns(pagination.page)}
        />
      ) : returnsList.length === 0 ? (
        <AdminEmptyState
          title="No Return Requests Found"
          description="There are currently no customer returns matching the selected criteria."
        />
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-700 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Return #</th>
                  <th className="px-4 py-3">Order ID</th>
                  <th className="px-4 py-3">Items / Qty</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Refund Status</th>
                  <th className="px-4 py-3">Requested At</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {returnsList.map((ret) => {
                  const badge = RETURN_STATUS_BADGES[ret.status] || {
                    label: ret.status,
                    className: 'bg-slate-100 text-slate-700 border-slate-200',
                  };
                  const totalUnits = (ret.items || []).reduce((acc, i) => acc + (i.requestedQuantity || 0), 0);

                  return (
                    <tr key={ret._id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-slate-900 select-all">
                        {ret.returnNumber || ret._id.slice(-8)}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-700 select-all">
                        {ret.orderId}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-bold text-slate-900">{ret.items?.length || 0} items</span>
                        <span className="text-slate-400 ml-1">({totalUnits} units)</span>
                      </td>
                      <td className="px-4 py-3">
                        {RETURN_REASON_LABELS[ret.reason] || ret.reason}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.className}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                          {ret.refundStatus === 'pending_manual' ? 'Pending Manual' : ret.refundStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {formatFullDate(ret.requestedAt || ret.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="text-xs rounded-xl"
                          onClick={() => {
                            setSelectedReturn(ret);
                            setActionError(null);
                            setActionSuccess(null);
                            setAdminNote('');
                          }}
                        >
                          Inspect &amp; Manage
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-500">
            <span>
              Page {pagination.page} of {pagination.totalPages} ({pagination.total} total returns)
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={pagination.page <= 1}
                onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
                className="text-xs"
              >
                Previous
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
                className="text-xs"
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Return Inspection & Management Modal */}
      {selectedReturn && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn"
          role="dialog"
          aria-modal="true"
          aria-labelledby="return-detail-title"
        >
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 sm:p-7 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between pb-4 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <h2 id="return-detail-title" className="text-lg font-extrabold text-slate-900">
                    Return #{selectedReturn.returnNumber}
                  </h2>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${(RETURN_STATUS_BADGES[selectedReturn.status] || {}).className}`}>
                    {(RETURN_STATUS_BADGES[selectedReturn.status] || {}).label || selectedReturn.status}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Order ID: <strong className="font-mono text-slate-800">{selectedReturn.orderId}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReturn(null)}
                className="text-slate-400 hover:text-slate-700 text-xl font-bold p-1"
                aria-label="Close modal"
              >
                &times;
              </button>
            </div>

            {/* Notifications */}
            {actionSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs">
                {actionSuccess}
              </div>
            )}
            {actionError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs">
                {actionError}
              </div>
            )}

            {/* Return Details Info */}
            <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Reason</span>
                <span className="font-semibold text-slate-800">
                  {RETURN_REASON_LABELS[selectedReturn.reason] || selectedReturn.reason}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Customer ID</span>
                <span className="font-mono text-slate-800 select-all">{selectedReturn.customerId}</span>
              </div>
              {selectedReturn.customerNote && (
                <div className="col-span-2">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Customer Note</span>
                  <span className="text-slate-700 italic">"{selectedReturn.customerNote}"</span>
                </div>
              )}
              {selectedReturn.rejectionReason && (
                <div className="col-span-2 bg-rose-50 p-2.5 rounded-xl border border-rose-200 text-rose-900">
                  <span className="text-[10px] uppercase font-bold text-rose-600 block">Rejection Reason</span>
                  <span>{selectedReturn.rejectionReason}</span>
                </div>
              )}
              {selectedReturn.adminNote && (
                <div className="col-span-2 bg-slate-100 p-2.5 rounded-xl border border-slate-200 text-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Admin Operational Note</span>
                  <span>{selectedReturn.adminNote}</span>
                </div>
              )}
            </div>

            {/* Items Table */}
            <div>
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Returned Line Items
              </h3>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="p-2.5">Item Name &amp; SKU</th>
                      <th className="p-2.5 text-center">Ordered</th>
                      <th className="p-2.5 text-center">Requested</th>
                      <th className="p-2.5 text-center">Approved</th>
                      <th className="p-2.5 text-right">Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(selectedReturn.items || []).map((item, idx) => (
                      <tr key={item.productId + (item.variantId || '') + idx}>
                        <td className="p-2.5">
                          <p className="font-bold text-slate-900">{item.name}</p>
                          {item.variantAttributes && Object.keys(item.variantAttributes).length > 0 && (
                            <p className="text-[10px] text-slate-500">
                              {Object.entries(item.variantAttributes)
                                .map(([k, v]) => `${k}: ${v}`)
                                .join(' | ')}
                            </p>
                          )}
                          <p className="font-mono text-[10px] text-slate-400">SKU: {item.sku || 'N/A'}</p>
                        </td>
                        <td className="p-2.5 text-center font-medium text-slate-600">{item.originalOrderedQuantity}</td>
                        <td className="p-2.5 text-center font-bold text-slate-900">{item.requestedQuantity}</td>
                        <td className="p-2.5 text-center font-semibold text-emerald-700">
                          {item.approvedQuantity !== undefined ? item.approvedQuantity : item.requestedQuantity}
                        </td>
                        <td className="p-2.5 text-right font-bold text-slate-900">
                          {formatPrice(item.price)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Transparent Financial & Refund State Note */}
            <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4 space-y-1.5 text-xs text-amber-900">
              <div className="flex items-center gap-2 font-bold text-amber-950">
                <svg className="w-4 h-4 text-amber-700 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>
                  Financial Refund Status: {selectedReturn.refundStatus === 'succeeded' ? 'Succeeded (Gateway Confirmed)' : selectedReturn.refundStatus === 'failed' ? 'Failed' : selectedReturn.refundStatus === 'pending' ? 'Pending Gateway Execution' : 'Pending Manual Reconciliation'}
                </span>
              </div>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                Calculated return total: <strong>{formatPrice(selectedReturn.totalRefundAmount || 0)}</strong>.
                {selectedReturn.refundStatus === 'succeeded'
                  ? ' Authoritative gateway refund has succeeded and recorded in the financial ledger.'
                  : selectedReturn.refundStatus === 'pending'
                  ? ' Automated gateway refund is currently pending execution.'
                  : selectedReturn.refundStatus === 'failed'
                  ? ' Gateway refund attempt failed. Check the financial refunds console to retry.'
                  : ' Automated payment-gateway refunds are not configured. Financial disbursement must be reconciled manually through the store accounting ledger.'}
              </p>
            </div>

            {/* Operational Admin Note Input */}
            {['requested', 'approved', 'received'].includes(selectedReturn.status) && (
              <div>
                <label htmlFor="admin-note-input" className="block text-xs font-bold text-slate-700 mb-1">
                  Add Operational Note (Optional)
                </label>
                <input
                  id="admin-note-input"
                  type="text"
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="e.g., Package inspected, intact condition"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            {/* Lifecycle Action Buttons */}
            <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-slate-100">
              {selectedReturn.status === 'requested' && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={actionLoading}
                    onClick={() => {
                      setRejectionReason('');
                      setShowRejectModal(true);
                    }}
                    className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold"
                  >
                    Reject Request
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={actionLoading}
                    onClick={handleApprove}
                    className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold"
                  >
                    {actionLoading ? 'Approving...' : 'Approve Return (RMA)'}
                  </Button>
                </>
              )}

              {selectedReturn.status === 'approved' && (
                <Button
                  variant="primary"
                  size="sm"
                  disabled={actionLoading}
                  onClick={handleReceive}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold"
                >
                  {actionLoading ? 'Updating...' : 'Mark Package Received'}
                </Button>
              )}

              {selectedReturn.status === 'received' && (
                <Button
                  variant="primary"
                  size="sm"
                  disabled={actionLoading}
                  onClick={() => setShowCompleteConfirm(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold"
                >
                  Complete Return &amp; Restock Inventory
                </Button>
              )}

              {['completed', 'rejected', 'cancelled'].includes(selectedReturn.status) && (
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-slate-400 italic">
                    This return is in a terminal state ({selectedReturn.status}).
                  </span>
                  {selectedReturn.status === 'completed' && selectedReturn.refundStatus !== 'succeeded' && (
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={actionLoading}
                      onClick={handleInitiateRefund}
                      className="bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold"
                    >
                      {actionLoading ? 'Initiating Refund...' : 'Initiate Gateway Refund'}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reject Confirmation Dialog */}
      {showRejectModal && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">Confirm Return Rejection</h3>
            <p className="text-xs text-slate-600">
              Please provide a structured reason for rejecting this return request. This will be visible in the customer order history.
            </p>
            <div>
              <label htmlFor="rejection-reason-input" className="block text-xs font-bold text-slate-700 mb-1">
                Rejection Reason *
              </label>
              <textarea
                id="rejection-reason-input"
                rows={3}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g. Return window expired / Item damaged by user"
                className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowRejectModal(false)}
                disabled={actionLoading}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={actionLoading || !rejectionReason.trim()}
                onClick={handleReject}
                className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold"
              >
                {actionLoading ? 'Rejecting...' : 'Confirm Rejection'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Complete Return Confirmation Dialog */}
      {showCompleteConfirm && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">Complete Return &amp; Restock Inventory</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to complete this return?
              <br /><br />
              <strong className="text-slate-800">Inventory Restoration:</strong> All accepted items (simple products and specific variants) will be atomically restored to active stock using durable restoration keys.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCompleteConfirm(false)}
                disabled={actionLoading}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={actionLoading}
                onClick={handleComplete}
                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold"
              >
                {actionLoading ? 'Completing...' : 'Confirm Completion & Restock'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
