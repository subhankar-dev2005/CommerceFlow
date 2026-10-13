import { useState, useEffect, useRef, useCallback } from 'react';
import {
  adminOrderService,
  ALLOWED_STATUS_TRANSITIONS,
  ADMIN_CANCELLATION_REASONS,
  ADMIN_CANCELLATION_REASON_LABELS,
  ADMIN_CANCELLATION_ACTOR_LABELS,
  getAdminCancellationReasonLabel,
  getAdminCancellationActorLabel,
} from '../../features/admin/adminOrder.service.js';
import { formatPrice } from '../../lib/utils.js';
import Button from '../../components/Button.jsx';
import Skeleton from '../../components/Skeleton.jsx';
import AdminPageHeader from '../../layouts/admin/AdminPageHeader.jsx';
import { AdminLoadingState, AdminErrorState, AdminEmptyState } from '../../layouts/admin/AdminShellStates.jsx';

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
 * Format cancellation timestamp into human-readable date/time string only if valid.
 * Returns null if missing, invalid, or unparseable.
 * @param {string|Date} dateString
 * @returns {string|null}
 */
function formatCancellationDate(dateString) {
  if (!dateString) return null;
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return null;
    return date.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return null;
  }
}

/**
 * Returns badge styling and label for backend order.status.
 * @param {string} status
 */
function getStatusBadge(status) {
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
 * Authoritative backend enum values (from order.model.js):
 * 'pending', 'paid', 'failed', 'refunded'.
 * @param {string} status
 */
function getPaymentBadge(status) {
  switch (status?.toLowerCase()) {
    case 'paid':
      return { className: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Paid' };
    case 'failed':
      return { className: 'bg-rose-50 text-rose-700 border-rose-200', label: 'Failed' };
    case 'refunded':
      return { className: 'bg-slate-100 text-slate-700 border-slate-200', label: 'Refunded' };
    case 'pending':
      return { className: 'bg-amber-50 text-amber-800 border-amber-200', label: 'Pending' };
    default:
      return { className: 'bg-slate-50 text-slate-600 border-slate-200', label: 'Payment status unavailable' };
  }
}

const SHIPMENT_STATUS_OPTIONS = [
  { value: 'label_created', label: 'Label Created' },
  { value: 'in_transit', label: 'In Transit' },
  { value: 'out_for_delivery', label: 'Out for Delivery' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'exception', label: 'Exception' },
];

function getShipmentStatusBadge(status) {
  switch (status?.toLowerCase()) {
    case 'label_created':
      return { className: 'bg-slate-100 text-slate-700 border-slate-200', label: 'Label Created' };
    case 'in_transit':
      return { className: 'bg-blue-50 text-blue-700 border-blue-200', label: 'In Transit' };
    case 'out_for_delivery':
      return { className: 'bg-amber-50 text-amber-800 border-amber-200', label: 'Out for Delivery' };
    case 'delivered':
      return { className: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Delivered' };
    case 'exception':
      return { className: 'bg-rose-50 text-rose-700 border-rose-200', label: 'Exception' };
    default:
      return { className: 'bg-slate-50 text-slate-600 border-slate-200', label: status || 'Not Shipped' };
  }
}

function toDateInputValue(dateString) {
  if (!dateString) return '';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
  } catch {
    return '';
  }
}

function isValidHttpUrl(url) {
  if (!url || typeof url !== 'string' || !url.trim()) return true;
  try {
    const URLConstructor = typeof window !== 'undefined' && window.URL ? window.URL : globalThis.URL;
    const parsed = new URLConstructor(url.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export default function AdminOrderDetailsPage({ orderId }) {
  const cleanId = (orderId || '').trim();
  const isValidId = Boolean(cleanId && /^[0-9a-fA-F]{24}$/.test(cleanId));

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(isValidId);
  const [notFound, setNotFound] = useState(!isValidId);
  const [fetchError, setFetchError] = useState(null);

  // Status transition mutation state
  const [selectedStatus, setSelectedStatus] = useState('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);

  // Shipment mutation state
  const [carrier, setCarrier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');
  const [shipmentStatus, setShipmentStatus] = useState('in_transit');
  const [estimatedDelivery, setEstimatedDelivery] = useState('');
  const [isSavingShipment, setIsSavingShipment] = useState(false);
  const [shipmentMessage, setShipmentMessage] = useState(null);
  const [shipmentErrors, setShipmentErrors] = useState({});

  // Accessible confirmation dialog state for consequential transitions (e.g. cancellation)
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('other');
  const [cancelReasonDetail, setCancelReasonDetail] = useState('');
  const [cancelDialogError, setCancelDialogError] = useState(null);

  const confirmCancelBtnRef = useRef(null);
  const abortControllerRef = useRef(null);

  const [reloadTrigger, setReloadTrigger] = useState(0);

  // Load order details on mount or reloadTrigger
  useEffect(() => {
    if (!isValidId) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = createAbortController();
    abortControllerRef.current = controller;

    adminOrderService
      .getOrderById(cleanId, { signal: controller?.signal })
      .then((data) => {
        if (!data) {
          setNotFound(true);
        } else {
          setOrder(data);
          setNotFound(false);
          if (data.shipment) {
            setCarrier(data.shipment.carrier || '');
            setTrackingNumber(data.shipment.trackingNumber || '');
            setTrackingUrl(data.shipment.trackingUrl || '');
            setShipmentStatus(data.shipment.status || 'in_transit');
            setEstimatedDelivery(toDateInputValue(data.shipment.estimatedDelivery));
          } else {
            setCarrier('');
            setTrackingNumber('');
            setTrackingUrl('');
            setShipmentStatus('in_transit');
            setEstimatedDelivery('');
          }
        }
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        if (err?.status === 404 || err?.code === 'ORDER_NOT_FOUND') {
          setNotFound(true);
        } else {
          setFetchError(err?.message || 'Failed to load order details.');
        }
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
  }, [cleanId, isValidId, reloadTrigger]);

  const closeConfirmModal = useCallback(() => {
    if (isUpdatingStatus) return;
    setShowConfirmModal(false);
    setCancelReason('other');
    setCancelReasonDetail('');
    setCancelDialogError(null);
  }, [isUpdatingStatus]);

  // Trap Escape key for confirmation dialog
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && showConfirmModal && !isUpdatingStatus) {
        closeConfirmModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showConfirmModal, isUpdatingStatus, closeConfirmModal]);

  // Focus cancel button when confirmation modal opens
  useEffect(() => {
    if (showConfirmModal && confirmCancelBtnRef.current) {
      confirmCancelBtnRef.current.focus();
    }
  }, [showConfirmModal]);

  const handleRetry = () => {
    setLoading(true);
    setFetchError(null);
    setReloadTrigger((prev) => prev + 1);
  };

  // Refetch order from server
  const refetchOrderAuthoritatively = async () => {
    try {
      const refreshed = await adminOrderService.getOrderById(cleanId);
      if (refreshed) {
        setOrder(refreshed);
      }
    } catch {
      // Swallow secondary refetch error
    }
  };

  // Initiate transition from form
  const handleStatusFormSubmit = (e) => {
    e.preventDefault();
    if (!selectedStatus || isUpdatingStatus) return;

    // For cancellation, require explicit confirmation dialog with reason selection
    if (selectedStatus === 'cancelled') {
      setCancelReason('other');
      setCancelReasonDetail('');
      setCancelDialogError(null);
      setShowConfirmModal(true);
      return;
    }

    // For other transitions, execute directly
    executeStatusTransition(selectedStatus);
  };

  // Execute PATCH /api/v1/orders/:orderId/status
  const executeStatusTransition = async (targetStatus, cancellationData = {}) => {
    if (!targetStatus || !cleanId || isUpdatingStatus) return;

    setIsUpdatingStatus(true);
    setStatusMessage(null);
    if (targetStatus === 'cancelled') {
      setCancelDialogError(null);
    }

    try {
      const options = targetStatus === 'cancelled' ? cancellationData : {};
      const updatedOrder = await adminOrderService.updateOrderStatus(cleanId, targetStatus, options);
      setOrder(updatedOrder);
      setSelectedStatus('');
      setStatusMessage({
        type: 'success',
        text: `Order status successfully updated to "${updatedOrder.status}".`,
      });
      setShowConfirmModal(false);
      setCancelReason('other');
      setCancelReasonDetail('');
      setCancelDialogError(null);
    } catch (err) {
      // Handle rejection or network failure
      const isNetworkError = err?.status === 0 || err?.code === 'NETWORK_ERROR';
      let msg = err?.message || 'Failed to update order status.';

      if (isNetworkError) {
        msg = 'Network connection failed while updating status. The server state could not be verified. Please check and retry.';
      } else if (err?.code === 'INVALID_ORDER_STATUS_TRANSITION') {
        msg = err.message || 'Invalid status transition according to backend state machine.';
      }

      if (targetStatus === 'cancelled') {
        // Keep modal open, preserve selected reason and detail
        setCancelDialogError(msg);
      } else {
        setStatusMessage({
          type: 'error',
          text: msg,
        });
      }

      // Always refetch to synchronize authoritative state if transition was rejected or uncertain
      await refetchOrderAuthoritatively();
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Handle shipment form submit
  const handleShipmentFormSubmit = async (e) => {
    e.preventDefault();
    if (isSavingShipment || currentStatus === 'cancelled') return;

    const errors = {};
    const trimmedCarrier = carrier.trim();
    const trimmedTrackingNumber = trackingNumber.trim();
    const trimmedTrackingUrl = trackingUrl.trim();

    if (!trimmedCarrier) {
      errors.carrier = 'Carrier is required';
    } else if (trimmedCarrier.length < 2) {
      errors.carrier = 'Carrier must be at least 2 characters';
    } else if (trimmedCarrier.length > 60) {
      errors.carrier = 'Carrier cannot exceed 60 characters';
    }

    if (!trimmedTrackingNumber) {
      errors.trackingNumber = 'Tracking number is required';
    } else if (trimmedTrackingNumber.length < 3) {
      errors.trackingNumber = 'Tracking number must be at least 3 characters';
    } else if (trimmedTrackingNumber.length > 100) {
      errors.trackingNumber = 'Tracking number cannot exceed 100 characters';
    } else if (!/^[A-Za-z0-9_./-]+$/.test(trimmedTrackingNumber)) {
      errors.trackingNumber = "Tracking number may only contain letters, numbers, and '_', '-', '.', '/'";
    }

    if (trimmedTrackingUrl && !isValidHttpUrl(trimmedTrackingUrl)) {
      errors.trackingUrl = 'Tracking URL must begin with http:// or https://';
    }

    if (Object.keys(errors).length > 0) {
      setShipmentErrors(errors);
      return;
    }

    setShipmentErrors({});
    setIsSavingShipment(true);
    setShipmentMessage(null);

    try {
      const updatedOrder = await adminOrderService.updateShipment(cleanId, {
        carrier: trimmedCarrier,
        trackingNumber: trimmedTrackingNumber,
        trackingUrl: trimmedTrackingUrl,
        status: shipmentStatus,
        estimatedDelivery: estimatedDelivery ? new Date(`${estimatedDelivery}T00:00:00.000Z`).toISOString() : null,
      });

      if (updatedOrder) {
        setOrder(updatedOrder);
      }
      setShipmentMessage({
        type: 'success',
        text: 'Shipment tracking updated successfully.',
      });
    } catch (err) {
      setShipmentMessage({
        type: 'error',
        text: err?.message || 'Failed to update shipment information.',
      });
    } finally {
      setIsSavingShipment(false);
    }
  };

  if (!isValidId || notFound) {
    return (
      <div className="max-w-md mx-auto py-12">
        <AdminEmptyState
          title="Order not found"
          description="The requested order ID does not exist or has an invalid format."
          actionLabel="Back to Orders"
          actionHref="/admin/orders"
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6" role="status" aria-label="Loading order details">
        <AdminLoadingState
          title="Loading order details..."
          subtitle="Retrieving customer fulfillment records and transaction statuses."
        />
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="max-w-md mx-auto py-12">
        <AdminErrorState
          title="Unable to load order"
          message={fetchError}
          onRetry={handleRetry}
        />
      </div>
    );
  }

  const currentStatus = order?.status?.toLowerCase() || 'pending';
  const allowedNext = ALLOWED_STATUS_TRANSITIONS[currentStatus] || [];
  const isTerminal = allowedNext.length === 0;

  const orderBadge = getStatusBadge(order?.status);
  const paymentBadge = getPaymentBadge(order?.payment?.status);
  const items = Array.isArray(order?.items) ? order.items : [];
  const address = order?.shippingAddress || {};
  const payment = order?.payment || {};

  const customerName = order?.user?.name || (typeof order?.user === 'object' && order?.user !== null ? 'Customer' : null);
  const customerEmail = order?.user?.email || (typeof order?.user === 'string' ? order.user : null);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* 1. Shell-Harmonized Page Header */}
      <AdminPageHeader
        title="Order Details"
        subtitle={`Order ID: ${order._id}`}
        badge={orderBadge.label}
        actions={
          <Button as="a" href="/admin/orders" variant="secondary" size="sm" className="font-semibold">
            &larr; Back to Order List
          </Button>
        }
      />

      {/* Status Feedback Notification */}
      {statusMessage && (
        <div
          role="alert"
          className={`p-4 rounded-xl text-xs sm:text-sm flex items-center justify-between gap-3 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <span>{statusMessage.text}</span>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-slate-500 hover:text-slate-800 font-bold p-1"
            aria-label="Dismiss status notification"
          >
            &times;
          </button>
        </div>
      )}

      {/* Operational Lifecycle Management Form */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-xs space-y-4">
        <div>
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
            Operational Lifecycle Management
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Transition order through verified fulfillment states. Only backend-supported next transitions are selectable.
          </p>
        </div>

        {isTerminal ? (
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600">
            This order is currently in a terminal state (<strong className="text-slate-900 uppercase">{currentStatus}</strong>). No further status updates are permitted.
          </div>
        ) : (
          <form onSubmit={handleStatusFormSubmit} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
            <div className="flex-1">
              <label htmlFor="status-select" className="sr-only">
                Transition to Next Status
              </label>
              <select
                id="status-select"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                disabled={isUpdatingStatus}
                className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800 font-medium"
              >
                <option value="">Select next status transition...</option>
                {allowedNext.map((st) => (
                  <option key={st} value={st}>
                    Transition to: {st.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={!selectedStatus || isUpdatingStatus}
              loading={isUpdatingStatus}
              className="shrink-0 font-semibold min-h-[44px]"
            >
              {isUpdatingStatus ? 'Updating...' : 'Update Status'}
            </Button>
          </form>
        )}
      </div>

      {/* Shipment & Tracking Management Panel */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
              Shipment &amp; Tracking Management
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Assign or update carrier tracking details and delivery estimates.
            </p>
          </div>
          {order?.shipment?.status && (
            <span
              className={`self-start sm:self-auto inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                getShipmentStatusBadge(order.shipment.status).className
              }`}
            >
              {getShipmentStatusBadge(order.shipment.status).label}
            </span>
          )}
        </div>

        {/* Existing Shipment Overview (Informational) */}
        {order?.shipment ? (
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Current Shipment Details (Server Managed)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-slate-500 block">Carrier:</span>
                <span className="font-semibold text-slate-900">{order.shipment.carrier}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Tracking Number:</span>
                <span className="font-mono font-semibold text-slate-900 select-all">
                  {order.shipment.trackingNumber}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Shipment Status:</span>
                <span className="font-semibold text-slate-900">
                  {getShipmentStatusBadge(order.shipment.status).label}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Shipped Date:</span>
                <span className="font-semibold text-slate-800">
                  {formatFullDate(order.shipment.shippedAt)}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Estimated Delivery:</span>
                <span className="font-semibold text-slate-800">
                  {formatFullDate(order.shipment.estimatedDelivery)}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Delivered Date:</span>
                <span className="font-semibold text-slate-800">
                  {order.shipment.deliveredAt
                    ? formatFullDate(order.shipment.deliveredAt)
                    : 'Not delivered yet'}
                </span>
              </div>
              <div className="sm:col-span-2 md:col-span-3">
                <span className="text-slate-500 block">Tracking URL:</span>
                {order.shipment.trackingUrl && isValidHttpUrl(order.shipment.trackingUrl) ? (
                  <a
                    href={order.shipment.trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 underline inline-flex items-center gap-1 break-all"
                  >
                    {order.shipment.trackingUrl}
                    <span aria-hidden="true">&rarr;</span>
                  </a>
                ) : (
                  <span className="text-slate-400 italic">Not provided</span>
                )}
              </div>
              <div className="sm:col-span-2 md:col-span-3 text-[11px] text-slate-400">
                Last updated: {formatFullDate(order.shipment.updatedAt)}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500">
            No shipment tracking information has been added to this order yet.
          </div>
        )}

        {/* Cancelled Order Notice */}
        {currentStatus === 'cancelled' && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-medium">
            Shipment information cannot be updated for a cancelled order.
          </div>
        )}

        {/* Shipment Mutation Notification */}
        {shipmentMessage && (
          <div
            role="alert"
            className={`p-4 rounded-xl text-xs sm:text-sm flex items-center justify-between gap-3 ${
              shipmentMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            <span>{shipmentMessage.text}</span>
            <button
              type="button"
              onClick={() => setShipmentMessage(null)}
              className="text-slate-500 hover:text-slate-800 font-bold p-1"
              aria-label="Dismiss shipment notification"
            >
              &times;
            </button>
          </div>
        )}

        {/* Shipment Edit Form */}
        <form onSubmit={handleShipmentFormSubmit} className="space-y-4 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Carrier */}
            <div>
              <label
                htmlFor="shipment-carrier"
                className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1"
              >
                Carrier <span className="text-rose-500">*</span>
              </label>
              <input
                id="shipment-carrier"
                type="text"
                value={carrier}
                onChange={(e) => {
                  setCarrier(e.target.value);
                  if (shipmentErrors.carrier) {
                    setShipmentErrors((prev) => ({ ...prev, carrier: null }));
                  }
                }}
                disabled={isSavingShipment || currentStatus === 'cancelled'}
                placeholder="e.g. Blue Dart, Delhivery, FedEx"
                className={`w-full px-3.5 py-2.5 text-sm bg-slate-50 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-800 ${
                  shipmentErrors.carrier ? 'border-rose-400 focus:border-rose-500' : 'border-slate-200 focus:border-blue-500'
                } disabled:bg-slate-100 disabled:text-slate-400`}
              />
              {shipmentErrors.carrier && (
                <p className="text-xs text-rose-600 mt-1 font-medium">{shipmentErrors.carrier}</p>
              )}
            </div>

            {/* Tracking Number */}
            <div>
              <label
                htmlFor="shipment-tracking-number"
                className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1"
              >
                Tracking Number <span className="text-rose-500">*</span>
              </label>
              <input
                id="shipment-tracking-number"
                type="text"
                value={trackingNumber}
                onChange={(e) => {
                  setTrackingNumber(e.target.value);
                  if (shipmentErrors.trackingNumber) {
                    setShipmentErrors((prev) => ({ ...prev, trackingNumber: null }));
                  }
                }}
                disabled={isSavingShipment || currentStatus === 'cancelled'}
                placeholder="e.g. BD123456789"
                className={`w-full px-3.5 py-2.5 text-sm bg-slate-50 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-mono text-slate-800 ${
                  shipmentErrors.trackingNumber ? 'border-rose-400 focus:border-rose-500' : 'border-slate-200 focus:border-blue-500'
                } disabled:bg-slate-100 disabled:text-slate-400`}
              />
              {shipmentErrors.trackingNumber && (
                <p className="text-xs text-rose-600 mt-1 font-medium">{shipmentErrors.trackingNumber}</p>
              )}
            </div>

            {/* Tracking URL */}
            <div className="sm:col-span-2">
              <label
                htmlFor="shipment-tracking-url"
                className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1"
              >
                Tracking URL (Optional)
              </label>
              <input
                id="shipment-tracking-url"
                type="url"
                value={trackingUrl}
                onChange={(e) => {
                  setTrackingUrl(e.target.value);
                  if (shipmentErrors.trackingUrl) {
                    setShipmentErrors((prev) => ({ ...prev, trackingUrl: null }));
                  }
                }}
                disabled={isSavingShipment || currentStatus === 'cancelled'}
                placeholder="https://example.com/track/..."
                className={`w-full px-3.5 py-2.5 text-sm bg-slate-50 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-800 ${
                  shipmentErrors.trackingUrl ? 'border-rose-400 focus:border-rose-500' : 'border-slate-200 focus:border-blue-500'
                } disabled:bg-slate-100 disabled:text-slate-400`}
              />
              {shipmentErrors.trackingUrl && (
                <p className="text-xs text-rose-600 mt-1 font-medium">{shipmentErrors.trackingUrl}</p>
              )}
            </div>

            {/* Shipment Status */}
            <div>
              <label
                htmlFor="shipment-status"
                className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1"
              >
                Shipment Status
              </label>
              <select
                id="shipment-status"
                value={shipmentStatus}
                onChange={(e) => setShipmentStatus(e.target.value)}
                disabled={isSavingShipment || currentStatus === 'cancelled'}
                className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800 font-medium disabled:bg-slate-100 disabled:text-slate-400"
              >
                {SHIPMENT_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Estimated Delivery */}
            <div>
              <label
                htmlFor="shipment-estimated-delivery"
                className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1"
              >
                Estimated Delivery (Optional)
              </label>
              <input
                id="shipment-estimated-delivery"
                type="date"
                value={estimatedDelivery}
                onChange={(e) => setEstimatedDelivery(e.target.value)}
                disabled={isSavingShipment || currentStatus === 'cancelled'}
                className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800 font-medium disabled:bg-slate-100 disabled:text-slate-400"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={isSavingShipment || currentStatus === 'cancelled'}
              loading={isSavingShipment}
              className="font-semibold min-h-[44px]"
            >
              {isSavingShipment ? 'Saving...' : 'Save Shipment Information'}
            </Button>
          </div>
        </form>
      </div>

      {/* Order Info, Customer & Payment Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Order Information & Customer */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-xs space-y-3">
          <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider pb-2 border-b border-slate-100">
            Order &amp; Customer Information
          </h2>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1">
              <span className="text-slate-500">Order ID:</span>
              <span className="font-mono font-semibold text-slate-900 select-all">{order._id}</span>
            </div>

            {customerName && (
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Customer Name:</span>
                <span className="font-semibold text-slate-900">{customerName}</span>
              </div>
            )}

            {customerEmail && (
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Customer Email:</span>
                <span className="font-semibold text-slate-900 select-all">{customerEmail}</span>
              </div>
            )}

            <div className="flex justify-between py-1">
              <span className="text-slate-500">Placed On:</span>
              <span className="font-semibold text-slate-800">{formatFullDate(order.createdAt)}</span>
            </div>

            {order.updatedAt && (
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Last Updated:</span>
                <span className="font-semibold text-slate-800">{formatFullDate(order.updatedAt)}</span>
              </div>
            )}

            <div className="flex justify-between py-1 items-center">
              <span className="text-slate-500">Fulfillment Status:</span>
              <span className={`font-bold px-2 py-0.5 rounded-full border text-[11px] ${orderBadge.className}`}>
                {orderBadge.label}
              </span>
            </div>

            {order.status === 'cancelled' && (
              <div className="mt-3 pt-3 border-t border-rose-200/80 space-y-2 text-xs bg-rose-50/50 -mx-2 px-2.5 py-2.5 rounded-xl">
                <div className="font-bold text-rose-800 text-[11px] uppercase tracking-wider flex items-center justify-between">
                  <span>Cancellation Details</span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-rose-100 text-rose-800">
                    Terminal State
                  </span>
                </div>
                {order.cancellation?.reason || getAdminCancellationActorLabel(order.cancellation?.cancelledBy) || formatCancellationDate(order.cancellation?.cancelledAt) ? (
                  <>
                    {order.cancellation.reason && (
                      <div className="flex justify-between py-0.5">
                        <span className="text-slate-500">Reason:</span>
                        <span className="font-semibold text-rose-700">
                          {getAdminCancellationReasonLabel(order.cancellation.reason)}
                        </span>
                      </div>
                    )}
                    {Boolean(order.cancellation.reasonDetail && order.cancellation.reasonDetail.trim()) && (
                      <div className="flex justify-between py-0.5 gap-2">
                        <span className="text-slate-500 shrink-0">Reason Detail:</span>
                        <span className="text-slate-700 italic break-words text-right" title={order.cancellation.reasonDetail}>
                          {order.cancellation.reasonDetail}
                        </span>
                      </div>
                    )}
                    {Boolean(getAdminCancellationActorLabel(order.cancellation.cancelledBy)) && (
                      <div className="flex justify-between py-0.5">
                        <span className="text-slate-500">Cancelled By:</span>
                        <span className="font-semibold text-slate-800">
                          {getAdminCancellationActorLabel(order.cancellation.cancelledBy)}
                        </span>
                      </div>
                    )}
                    {Boolean(formatCancellationDate(order.cancellation?.cancelledAt)) && (
                      <div className="flex justify-between py-0.5">
                        <span className="text-slate-500">Cancelled On:</span>
                        <span className="font-semibold text-slate-800">
                          {formatCancellationDate(order.cancellation.cancelledAt)}
                        </span>
                      </div>
                    )}
                    <div className="pt-1.5 border-t border-rose-200/60 text-[11px] text-rose-800">
                      Inventory status: Stock was automatically restored to available inventory upon cancellation.
                    </div>
                  </>
                ) : (
                  <p className="text-slate-500 italic py-0.5">
                    Cancellation details unavailable (Reason not recorded)
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Payment & Transaction Details */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-xs space-y-3">
          <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider pb-2 border-b border-slate-100">
            Payment &amp; Verification
          </h2>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 items-center">
              <span className="text-slate-500">Payment Status:</span>
              <span className={`font-bold px-2 py-0.5 rounded-full border text-[11px] ${paymentBadge.className}`}>
                {paymentBadge.label}
              </span>
            </div>

            {payment.provider && (
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Provider:</span>
                <span className="font-semibold text-slate-800 uppercase text-[11px]">{payment.provider}</span>
              </div>
            )}

            {payment.razorpayOrderId && (
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Razorpay Order ID:</span>
                <span className="font-mono text-slate-800 text-[11px] select-all">{payment.razorpayOrderId}</span>
              </div>
            )}

            {payment.transactionId && (
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Transaction ID:</span>
                <span className="font-mono text-slate-800 text-[11px] select-all">{payment.transactionId}</span>
              </div>
            )}

            <div className="flex justify-between py-1">
              <span className="text-slate-500">Subtotal Amount:</span>
              <span className="font-bold text-slate-900">{formatPrice(order.subtotal ?? 0)}</span>
            </div>

            {payment.status?.toLowerCase() === 'refunded' && (
              <div className="mt-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 text-[11px] flex items-start gap-2">
                <svg className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Payment recorded as refunded. Note: Automated gateway refund processing is not executed from this console.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Shipping Address Snapshot */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-xs space-y-3">
        <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider pb-2 border-b border-slate-100">
          Shipping Address Snapshot
        </h2>

        <div className="text-xs space-y-1 text-slate-700">
          <div className="font-bold text-slate-900 text-sm">
            {address.fullName || address.name || 'Recipient Name'}
          </div>
          <div className="text-slate-600">
            {address.addressLine1 || address.street || 'Address Line 1 not specified'}
          </div>
          {address.addressLine2 && (
            <div className="text-slate-600">{address.addressLine2}</div>
          )}
          <div className="text-slate-600">
            {address.city ? `${address.city}, ` : ''}
            {address.state ? `${address.state} ` : ''}
            {address.postalCode || ''}
          </div>
          {address.country && (
            <div className="text-slate-500">{address.country}</div>
          )}
          {address.phone && (
            <div className="pt-2 text-slate-600">
              Phone: <span className="font-semibold text-slate-900">{address.phone}</span>
            </div>
          )}
        </div>
      </div>

      {/* Order Line Items Table */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
            Line Items ({items.length})
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-slate-500 font-bold uppercase tracking-wider">
                <th scope="col" className="py-2.5 px-4">Item</th>
                <th scope="col" className="py-2.5 px-4 text-center">Qty</th>
                <th scope="col" className="py-2.5 px-4 text-right">Unit Price</th>
                <th scope="col" className="py-2.5 px-4 text-right">Item Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {items.map((item, idx) => {
                const itemTotal = item.subtotal ?? ((item.price || 0) * (item.quantity || 1));
                return (
                  <tr key={item._id || idx} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">
                        {item.name || item.product?.name || 'Product'}
                      </div>
                      {item.variantName && (
                        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#EEF5F1] text-[#123C32] border border-[#123C32]/10">
                            Variant: {item.variantName}
                          </span>
                        </div>
                      )}
                      {item.sku && (
                        <div className="font-mono text-[11px] text-slate-500 mt-0.5">
                          SKU: {item.sku}
                        </div>
                      )}
                      {item.product?._id && (
                        <div className="font-mono text-[10px] text-slate-400 select-all mt-0.5">
                          Product ID: {item.product._id}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center font-semibold text-slate-800">
                      {item.quantity}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-600">
                      {formatPrice(item.price)}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900">
                      {formatPrice(itemTotal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Totals Summary */}
        <div className="p-4 sm:p-5 bg-slate-50/60 border-t border-slate-100 flex flex-col items-end gap-1.5 text-xs">
          <div className="flex justify-between w-56 text-slate-600">
            <span>Total Quantity:</span>
            <span className="font-semibold text-slate-900">
              {order.totalQuantity ?? items.reduce((s, i) => s + (i.quantity || 0), 0)} items
            </span>
          </div>
          <div className="flex justify-between w-56 pt-2 border-t border-slate-200 text-sm font-bold text-slate-900">
            <span>Subtotal:</span>
            <span className="text-blue-600">{formatPrice(order.subtotal ?? 0)}</span>
          </div>
        </div>
      </div>

      {/* Accessible Confirmation Modal for Order Cancellation */}
      {showConfirmModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          aria-describedby="confirm-dialog-description"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isUpdatingStatus) {
              closeConfirmModal();
            }
          }}
        >
          <div
            className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <div className="space-y-1">
                <h3 id="confirm-dialog-title" className="text-base font-bold text-slate-900">
                  Confirm Order Cancellation
                </h3>
                <p id="confirm-dialog-description" className="text-xs text-slate-500 leading-relaxed">
                  Select an administrative cancellation reason and optional details for Order <span className="font-mono font-bold text-slate-800">{cleanId}</span>. Stock will be automatically restored.
                </p>
              </div>
            </div>

            {cancelDialogError && (
              <div role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 text-xs flex items-center justify-between gap-2">
                <span>{cancelDialogError}</span>
                <button
                  type="button"
                  onClick={() => setCancelDialogError(null)}
                  className="font-bold text-rose-700 p-0.5"
                  aria-label="Dismiss error"
                >
                  &times;
                </button>
              </div>
            )}

            {/* Approved Admin Reason Codes */}
            <fieldset className="space-y-2">
              <legend className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                Cancellation Reason <span className="text-rose-600">*</span>
              </legend>
              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                {ADMIN_CANCELLATION_REASONS.map((opt) => (
                  <label
                    key={opt.value}
                    htmlFor={`admin-cancel-reason-${opt.value}`}
                    className={`flex items-center gap-2.5 p-2 rounded-xl border text-xs cursor-pointer transition-colors ${
                      cancelReason === opt.value
                        ? 'border-brand-800 bg-brand-50/50 text-brand-900 font-semibold'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      id={`admin-cancel-reason-${opt.value}`}
                      name="cancellationReason"
                      value={opt.value}
                      checked={cancelReason === opt.value}
                      onChange={(e) => setCancelReason(e.target.value)}
                      disabled={isUpdatingStatus}
                      className="w-4 h-4 text-brand-800 border-slate-300 focus:ring-brand-700 cursor-pointer"
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {/* Optional Reason Detail */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="admin-cancel-reason-detail" className="font-semibold text-slate-700">
                  Additional Details <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <span className="text-[11px] text-slate-500 font-mono">
                  {cancelReasonDetail.length}/500
                </span>
              </div>
              <textarea
                id="admin-cancel-reason-detail"
                name="reasonDetail"
                rows={3}
                maxLength={500}
                value={cancelReasonDetail}
                onChange={(e) => setCancelReasonDetail(e.target.value.slice(0, 500))}
                disabled={isUpdatingStatus}
                placeholder="Provide internal administrative notes..."
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-700/20 focus:border-brand-700 text-slate-800 placeholder:text-slate-400 resize-none disabled:bg-slate-100 disabled:text-slate-400"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                ref={confirmCancelBtnRef}
                onClick={closeConfirmModal}
                disabled={isUpdatingStatus}
                className="font-semibold min-h-[38px]"
              >
                Keep Order
              </Button>

              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={() =>
                  executeStatusTransition('cancelled', {
                    reason: cancelReason,
                    reasonDetail: typeof cancelReasonDetail === 'string' ? cancelReasonDetail.trim() : '',
                  })
                }
                loading={isUpdatingStatus}
                disabled={!cancelReason || isUpdatingStatus}
                className="font-semibold min-h-[38px] bg-rose-600 hover:bg-rose-700 text-white border-rose-600"
              >
                Confirm Cancellation
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
