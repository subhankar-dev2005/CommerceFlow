import { useState, useEffect, useCallback, useRef, useContext } from 'react';
import orderContextModule from '../features/orders/order.context.jsx';
import paymentContextModule from '../features/payments/payment.context.jsx';
import {
  CUSTOMER_CANCELLATION_REASONS,
  getCancellationReasonLabel,
  getCancellationActorLabel,
} from '../features/orders/order.service.js';
import {
  requestReturn,
  getOrderReturns,
  cancelReturn,
  RETURN_REASONS,
  RETURN_REASON_LABELS,
  RETURN_STATUS_BADGES,
} from '../features/returns/return.service.js';
import { formatPrice, normalizeOrderFinancials } from '../lib/utils.js';
import Container from '../components/Container.jsx';
import Button from '../components/Button.jsx';
import Skeleton from '../components/Skeleton.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ErrorState from '../components/ErrorState.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import WidePromoBanner from '../components/WidePromoBanner.jsx';

const OrderContext =
  orderContextModule?.OrderContext ||
  orderContextModule?.default?.OrderContext ||
  orderContextModule?.default ||
  orderContextModule;

const PaymentContext =
  paymentContextModule?.PaymentContext ||
  paymentContextModule?.default?.PaymentContext ||
  paymentContextModule?.default ||
  paymentContextModule;

/**
 * Format timestamp into human-readable date/time string.
 * @param {string|Date} dateString
 * @returns {string}
 */
function formatOrderDate(dateString) {
  if (!dateString) return 'Not available';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Not available';
    return date.toLocaleDateString('en-IN', {
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
function getOrderStatusBadge(status) {
  switch (status?.toLowerCase()) {
    case 'confirmed':
      return { className: 'bg-[#EEF5F1] text-[#123C32] border-[#123C32]/30', label: 'Confirmed' };
    case 'processing':
      return { className: 'bg-[#EEF5F1] text-[#123C32] border-[#123C32]/30', label: 'Processing' };
    case 'shipped':
      return { className: 'bg-emerald-50 text-emerald-800 border-emerald-300', label: 'Shipped' };
    case 'delivered':
      return { className: 'bg-emerald-50 text-emerald-800 border-emerald-300', label: 'Delivered' };
    case 'cancelled':
      return { className: 'bg-rose-50 text-rose-800 border-rose-300', label: 'Cancelled' };
    case 'pending':
    default:
      return { className: 'bg-amber-50 text-amber-800 border-amber-300', label: 'Pending' };
  }
}

/**
 * Returns badge styling and label for backend payment.status.
 * @param {string} status
 */
function getPaymentStatusBadge(status) {
  switch (status?.toLowerCase()) {
    case 'paid':
      return { className: 'bg-[#EEF5F1] text-[#123C32] border-[#123C32]/30', label: 'Paid' };
    case 'failed':
      return { className: 'bg-rose-50 text-rose-800 border-rose-300', label: 'Payment Failed' };
    case 'refunded':
      return { className: 'bg-[#F7F6F1] text-[#17201D] border-[#E5E9E6]', label: 'Refunded' };
    case 'pending':
    default:
      return { className: 'bg-amber-50 text-amber-800 border-amber-300', label: 'Payment Pending' };
  }
}

/**
 * Returns badge styling and customer-friendly label for shipment status.
 * Maps backend enum values to readable display text.
 * @param {string} status
 */
function getShipmentStatusBadge(status) {
  switch (status?.toLowerCase()) {
    case 'label_created':
      return { className: 'bg-[#F7F6F1] text-[#17201D] border-[#E5E9E6]', label: 'Label Created' };
    case 'in_transit':
      return { className: 'bg-[#EEF5F1] text-[#123C32] border-[#123C32]/30', label: 'In Transit' };
    case 'out_for_delivery':
      return { className: 'bg-amber-50 text-amber-800 border-amber-200', label: 'Out for Delivery' };
    case 'delivered':
      return { className: 'bg-emerald-50 text-emerald-800 border-emerald-200', label: 'Delivered' };
    case 'exception':
      return { className: 'bg-rose-50 text-rose-700 border-rose-200', label: 'Exception' };
    default:
      return { className: 'bg-[#F7F6F1] text-[#66736D] border-[#E5E9E6]', label: status || 'Unknown' };
  }
}

/**
 * Format a date string for shipment display, returning null when unavailable.
 * @param {string|Date|null|undefined} dateString
 * @returns {string|null}
 */
function formatShipmentDate(dateString) {
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
 * Authoritative backend order lifecycle progression steps.
 */
const LIFECYCLE_STEPS = [
  { key: 'pending', label: 'Pending', description: 'Order recorded' },
  { key: 'confirmed', label: 'Confirmed', description: 'Order confirmed' },
  { key: 'processing', label: 'Processing', description: 'Gear packed' },
  { key: 'shipped', label: 'Shipped', description: 'En route' },
  { key: 'delivered', label: 'Delivered', description: 'Delivered' },
];

/**
 * Resolve current step index for the lifecycle progression.
 * @param {string} status
 * @returns {number} 0..4 or -1 if cancelled/unknown
 */
function getStepIndex(status) {
  const s = status?.toLowerCase();
  switch (s) {
    case 'pending':
      return 0;
    case 'confirmed':
      return 1;
    case 'processing':
      return 2;
    case 'shipped':
      return 3;
    case 'delivered':
      return 4;
    default:
      return -1;
  }
}

/**
 * OrderDetailsPage Component
 * Route: /account/orders/:orderId (Protected)
 */
export default function OrderDetailsPage({
  orderId,
  orderContext: propOrderContext,
  paymentContext: propPaymentContext,
}) {
  const contextOrder = useContext(OrderContext);
  const contextPayment = useContext(PaymentContext);

  const {
    selectedOrder,
    isLoadingDetail,
    detailError,
    getOrderById,
    cancelOrder,
    isMutating,
  } = propOrderContext || contextOrder || {};

  const {
    openCheckout,
    isCreatingPaymentOrder,
    isVerifyingPayment,
    isCheckoutOpen,
  } = propPaymentContext || contextPayment || {
    openCheckout: () => {},
    isCreatingPaymentOrder: false,
    isVerifyingPayment: false,
    isCheckoutOpen: false,
  };

  const trimmedId = orderId ? orderId.trim() : '';
  const isValidId = Boolean(trimmedId && /^[0-9a-fA-F]{24}$/.test(trimmedId));

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [selectedReason, setSelectedReason] = useState('other');
  const [reasonDetail, setReasonDetail] = useState('');
  const [cancelError, setCancelError] = useState(null);
  const [cancelSuccessMessage, setCancelSuccessMessage] = useState(null);
  const [paymentNotice, setPaymentNotice] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Return & RMA Lifecycle State
  const [orderReturns, setOrderReturns] = useState([]);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnReason, setReturnReason] = useState('defective');
  const [returnCustomerNote, setReturnCustomerNote] = useState('');
  const [selectedReturnItems, setSelectedReturnItems] = useState({});
  const [returnError, setReturnError] = useState(null);
  const [returnSuccessMessage, setReturnSuccessMessage] = useState(null);
  const [isReturnSubmitting, setIsReturnSubmitting] = useState(false);
  const [cancellingReturnId, setCancellingReturnId] = useState(null);

  const cancelTriggerBtnRef = useRef(null);
  const cancelDialogRef = useRef(null);
  const keepOrderBtnRef = useRef(null);
  const prevShowCancelConfirmRef = useRef(showCancelConfirm);

  const isCancelBusy = isMutating || isSubmitting;

  // Manage focus between dialog and triggering Cancel button
  useEffect(() => {
    if (showCancelConfirm) {
      if (keepOrderBtnRef.current) {
        keepOrderBtnRef.current.focus();
      }
    } else if (prevShowCancelConfirmRef.current && !showCancelConfirm) {
      if (cancelTriggerBtnRef.current) {
        cancelTriggerBtnRef.current.focus();
      }
    }
    prevShowCancelConfirmRef.current = showCancelConfirm;
  }, [showCancelConfirm]);

  // Trap Escape key for cancellation confirmation dialog
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && showCancelConfirm && !isCancelBusy) {
        setShowCancelConfirm(false);
        setSelectedReason('other');
        setReasonDetail('');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showCancelConfirm, isCancelBusy]);

  useEffect(() => {
    if (isValidId) {
      getOrderById(trimmedId).catch(() => {});
    }
  }, [isValidId, trimmedId, getOrderById]);

  const order = selectedOrder && selectedOrder._id === trimmedId ? selectedOrder : null;
  const isLoading = isLoadingDetail || (!order && !detailError && isValidId);
  const error = detailError;

  const handleRetry = useCallback(() => {
    if (isValidId) {
      getOrderById(trimmedId).catch(() => {});
    }
  }, [isValidId, trimmedId, getOrderById]);

  // Fetch returns associated with this order
  const fetchOrderReturns = useCallback(async () => {
    if (!isValidId) return;
    try {
      const rets = await getOrderReturns(trimmedId);
      setOrderReturns(Array.isArray(rets) ? rets : []);
    } catch {
      // Non-blocking
    }
  }, [isValidId, trimmedId]);

  useEffect(() => {
    if (isValidId) {
      let ignore = false;
      setTimeout(() => {
        if (!ignore) {
          fetchOrderReturns();
        }
      }, 0);
      return () => {
        ignore = true;
      };
    }
  }, [isValidId, fetchOrderReturns]);

  // Calculate remaining returnable quantity for an item
  const getReturnableQuantity = useCallback((item) => {
    if (!item) return 0;
    const itemQty = item.quantity || 1;
    const prodIdStr = (item.product?._id || item.product || '').toString();
    const varIdStr = item.variantId ? item.variantId.toString() : null;

    let alreadyClaimed = 0;
    for (const ret of orderReturns) {
      if (['requested', 'approved', 'received', 'completed'].includes(ret.status)) {
        for (const retItem of ret.items || []) {
          const retProdIdStr = (retItem.productId?._id || retItem.productId || '').toString();
          const retVarIdStr = retItem.variantId ? retItem.variantId.toString() : null;
          if (retProdIdStr === prodIdStr && retVarIdStr === varIdStr) {
            alreadyClaimed += (retItem.requestedQuantity || 0);
          }
        }
      }
    }
    return Math.max(0, itemQty - alreadyClaimed);
  }, [orderReturns]);

  // Customer submit return request
  const handleSubmitReturn = async () => {
    const rawItems = Array.isArray(order?.items) ? order.items : [];
    const itemsToReturn = [];
    rawItems.forEach((item) => {
      const key = item.variantId
        ? `${item.product?._id || item.product}_${item.variantId}`
        : `${item.product?._id || item.product}`;
      const qty = parseInt(selectedReturnItems[key], 10) || 0;
      if (qty > 0) {
        itemsToReturn.push({
          productId: (item.product?._id || item.product).toString(),
          variantId: item.variantId ? item.variantId.toString() : null,
          quantity: qty,
        });
      }
    });

    if (itemsToReturn.length === 0) {
      setReturnError('Please select at least one item and quantity to return.');
      return;
    }

    setIsReturnSubmitting(true);
    setReturnError(null);
    try {
      await requestReturn({
        orderId: trimmedId,
        reason: returnReason,
        customerNote: returnCustomerNote,
        items: itemsToReturn,
      });
      setShowReturnModal(false);
      setReturnSuccessMessage('Your return request has been submitted successfully for verification.');
      await fetchOrderReturns();
    } catch (err) {
      setReturnError(err?.message || 'Failed to submit return request.');
    } finally {
      setIsReturnSubmitting(false);
    }
  };

  // Customer cancel pending return request
  const handleCancelReturn = async (returnId) => {
    setCancellingReturnId(returnId);
    setReturnError(null);
    try {
      await cancelReturn(returnId);
      setReturnSuccessMessage('Return request has been cancelled.');
      await fetchOrderReturns();
    } catch (err) {
      setReturnError(err?.message || 'Failed to cancel return request.');
    } finally {
      setCancellingReturnId(null);
    }
  };

  const handleConfirmCancel = async () => {
    if (!order?._id || !selectedReason || isCancelBusy) return;
    setIsSubmitting(true);
    setCancelError(null);
    setCancelSuccessMessage(null);

    const trimmedReasonDetail = reasonDetail ? reasonDetail.trim() : '';

    try {
      await cancelOrder(order._id, {
        reason: selectedReason,
        reasonDetail: trimmedReasonDetail,
      });
      setShowCancelConfirm(false);
      setSelectedReason('other');
      setReasonDetail('');
      setCancelSuccessMessage('Order has been cancelled successfully. Inventory quantities have been restored.');
      if (isValidId) {
        await getOrderById(trimmedId).catch(() => {});
      }
    } catch (err) {
      let msg = 'Failed to cancel order. Please refresh and try again.';
      if (err?.code === 'ORDER_CANNOT_BE_CANCELLED') {
        msg = 'Delivered orders cannot be cancelled.';
      } else if (err?.code === 'ORDER_ALREADY_CANCELLED') {
        msg = 'This order has already been cancelled.';
        setShowCancelConfirm(false);
      } else if (err?.code === 'ORDER_ACCESS_DENIED') {
        msg = 'You are not authorized to cancel this order.';
      } else if (err?.message) {
        msg = err.message;
      }
      setCancelError(msg);
      // Keep modal open and preserve entered reason and detail on failure (unless already cancelled remotely)
      if (isValidId) {
        getOrderById(trimmedId).catch(() => {});
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const isPaymentBusy = isCreatingPaymentOrder || isVerifyingPayment || isCheckoutOpen;

  const handleRetryPayment = () => {
    if (!order?._id || isPaymentBusy || isMutating) return;
    setPaymentNotice(null);

    openCheckout(order, {
      onSuccess: async () => {
        setPaymentNotice({
          type: 'success',
          message: 'Payment verified successfully! Order receipt has been updated.',
        });
        if (isValidId) {
          await getOrderById(trimmedId).catch(() => {});
        }
      },
      onDismiss: () => {
        setPaymentNotice({
          type: 'info',
          message: 'Payment checkout was closed. You can retry payment anytime.',
        });
      },
      onError: (err) => {
        setPaymentNotice({
          type: 'error',
          message: err?.message || 'Payment could not be completed. Please try again.',
        });
        if (isValidId) {
          getOrderById(trimmedId).catch(() => {});
        }
      },
    });
  };

  // 1. Invalid Order ID Format Guard (Must NOT crash per test requirement)
  if (!isValidId) {
    return (
      <div className="py-12 sm:py-20 bg-[#F7F6F1] min-h-[60vh]">
        <Container>
          <div className="max-w-md mx-auto bg-white p-8 rounded-3xl border border-[#E5E9E6] text-center shadow-xs">
            <EmptyState
              title="Invalid Order ID"
              description="The requested order ID format is invalid. Please check the URL or return to your order list."
              action={
                <Button as="a" href="/account/orders" variant="primary" size="md" className="rounded-2xl mt-4">
                  Back to Orders
                </Button>
              }
            />
          </div>
        </Container>
      </div>
    );
  }

  // 2. Loading Skeleton State
  if (isLoading) {
    return (
      <div className="py-8 sm:py-14 bg-white min-h-[60vh]">
        <Container>
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex justify-between items-center pb-6 border-b border-[#E5E9E6]">
              <div className="space-y-2">
                <Skeleton className="h-8 w-48 rounded-xl" />
                <Skeleton className="h-4 w-72 rounded" />
              </div>
              <Skeleton className="h-9 w-32 rounded-xl" />
            </div>
            <Skeleton className="h-32 w-full rounded-3xl" />
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-8 space-y-6">
                <Skeleton className="h-48 rounded-3xl" />
                <Skeleton className="h-36 rounded-3xl" />
              </div>
              <div className="lg:col-span-4 space-y-6">
                <Skeleton className="h-44 rounded-3xl" />
              </div>
            </div>
          </div>
        </Container>
      </div>
    );
  }

  // 3. Error State
  if (error && !order) {
    const isAccessDenied = error?.code === 'ORDER_ACCESS_DENIED' || error?.status === 403;
    const isNotFound = error?.code === 'ORDER_NOT_FOUND' || error?.status === 404;

    return (
      <div className="py-12 sm:py-20 bg-[#F7F6F1] min-h-[60vh]">
        <Container>
          <div className="max-w-md mx-auto bg-white p-8 rounded-3xl border border-[#E5E9E6] text-center shadow-xs">
            <ErrorState
              title={
                isAccessDenied
                  ? 'Access Denied'
                  : isNotFound
                  ? 'Order Not Found'
                  : 'Unable to load order details'
              }
              description={
                isAccessDenied
                  ? 'You are not authorized to view this order.'
                  : isNotFound
                  ? 'The requested order could not be found.'
                  : error?.message || 'We could not fetch the order details. Please try again.'
              }
              onRetry={!isAccessDenied && !isNotFound ? handleRetry : undefined}
            />
            <div className="pt-4 text-center">
              <Button as="a" href="/account/orders" variant="secondary" size="sm" className="rounded-xl">
                Back to Orders
              </Button>
            </div>
          </div>
        </Container>
      </div>
    );
  }

  if (!order) return null;

  const items = Array.isArray(order.items) ? order.items : [];
  const shippingAddress = order.shippingAddress || {};
  const payment = order.payment || {};
  const isCancellable = order.status !== 'delivered' && order.status !== 'cancelled';
  const isPaymentPendingOrFailed =
    (payment.status === 'pending' || payment.status === 'failed') &&
    order.status !== 'cancelled';

  const orderBadge = getOrderStatusBadge(order.status);
  const paymentBadge = getPaymentStatusBadge(payment.status);
  const currentStepIndex = getStepIndex(order.status);

  return (
    <div className="py-6 sm:py-10 bg-white min-h-[80vh]">
      <Container>
        <div className="max-w-4xl mx-auto space-y-6">

          <Breadcrumbs
            items={[
              { label: 'My Account', href: '/account' },
              { label: 'Orders', href: '/account/orders' },
              { label: order._id },
            ]}
          />

          {/* Page Heading & Quick Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#E5E9E6]">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-[#17201D] tracking-tight">
                  Order Details
                </h1>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${orderBadge.className}`}>
                  {orderBadge.label}
                </span>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${paymentBadge.className}`}>
                  {paymentBadge.label}
                </span>
              </div>
              <p className="font-mono text-xs text-[#66736D]">
                Order ID: <strong className="text-[#17201D] select-all">{order._id}</strong> &bull; Placed on {formatOrderDate(order.createdAt)}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button as="a" href="/account/orders" variant="secondary" size="sm" className="rounded-xl text-xs">
                &larr; Back to Orders
              </Button>
              <Button as="a" href="/shop" variant="ghost" size="sm" className="text-[#123C32] font-bold text-xs">
                Continue Shopping
              </Button>
            </div>
          </div>

          {/* Feedback & Notice Banners */}
          {cancelSuccessMessage && (
            <div role="alert" className="p-4 bg-[#EEF5F1] border border-[#123C32]/20 rounded-2xl text-[#123C32] text-sm flex items-center justify-between gap-3 animate-fadeIn">
              <div className="flex items-center gap-2.5">
                <svg className="w-5 h-5 text-[#123C32] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>{cancelSuccessMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setCancelSuccessMessage(null)}
                className="font-bold text-[#123C32] p-1"
                aria-label="Dismiss message"
              >
                &times;
              </button>
            </div>
          )}

          {cancelError && (
            <div role="alert" className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-900 text-sm flex items-center justify-between gap-3 animate-fadeIn">
              <div className="flex items-center gap-2.5">
                <svg className="w-5 h-5 text-rose-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>{cancelError}</span>
              </div>
              <button
                type="button"
                onClick={() => setCancelError(null)}
                className="font-bold text-rose-700 p-1"
                aria-label="Dismiss error"
              >
                &times;
              </button>
            </div>
          )}

          {returnSuccessMessage && (
            <div role="alert" className="p-4 bg-[#EEF5F1] border border-[#123C32]/20 rounded-2xl text-[#123C32] text-sm flex items-center justify-between gap-3 animate-fadeIn">
              <div className="flex items-center gap-2.5">
                <svg className="w-5 h-5 text-[#123C32] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>{returnSuccessMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setReturnSuccessMessage(null)}
                className="font-bold text-[#123C32] p-1"
                aria-label="Dismiss message"
              >
                &times;
              </button>
            </div>
          )}

          {returnError && (
            <div role="alert" className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-900 text-sm flex items-center justify-between gap-3 animate-fadeIn">
              <div className="flex items-center gap-2.5">
                <svg className="w-5 h-5 text-rose-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>{returnError}</span>
              </div>
              <button
                type="button"
                onClick={() => setReturnError(null)}
                className="font-bold text-rose-700 p-1"
                aria-label="Dismiss error"
              >
                &times;
              </button>
            </div>
          )}

          {paymentNotice && (
            <div
              role="alert"
              className={`p-4 rounded-2xl text-sm flex items-center justify-between gap-3 animate-fadeIn border ${
                paymentNotice.type === 'success'
                  ? 'bg-[#EEF5F1] border-[#123C32]/30 text-[#123C32]'
                  : paymentNotice.type === 'error'
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : 'bg-[#F7F6F1] border-[#E5E9E6] text-[#17201D]'
              }`}
            >
              <span>{paymentNotice.message}</span>
              <button
                type="button"
                onClick={() => setPaymentNotice(null)}
                className="font-bold opacity-60 hover:opacity-100 p-1"
                aria-label="Dismiss notice"
              >
                &times;
              </button>
            </div>
          )}

          {/* Cancellation Confirmation Modal */}
          {showCancelConfirm && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn"
              role="dialog"
              aria-modal="true"
              aria-labelledby="cancel-dialog-title"
              aria-describedby="cancel-dialog-description"
              onClick={(e) => {
                if (e.target === e.currentTarget && !isCancelBusy) {
                  setShowCancelConfirm(false);
                  setSelectedReason('other');
                  setReasonDetail('');
                }
              }}
            >
              <div
                ref={cancelDialogRef}
                className="bg-white rounded-3xl border border-[#E5E9E6] shadow-2xl max-w-lg w-full p-6 sm:p-7 space-y-5 max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                  </div>
                  <div className="space-y-1">
                    <h2 id="cancel-dialog-title" className="text-base sm:text-lg font-bold text-[#17201D]">
                      Cancel order
                    </h2>
                    <p id="cancel-dialog-description" className="text-xs sm:text-sm text-[#66736D] leading-relaxed">
                      This action cannot be undone. Please select a reason for cancellation. All reserved gear items will be automatically returned to inventory.
                    </p>
                  </div>
                </div>

                {cancelError && (
                  <div role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-rose-900 text-xs flex items-center justify-between gap-2 animate-fadeIn">
                    <span>{cancelError}</span>
                    <button
                      type="button"
                      onClick={() => setCancelError(null)}
                      className="font-bold text-rose-700 p-0.5"
                      aria-label="Dismiss error"
                    >
                      &times;
                    </button>
                  </div>
                )}

                {/* Reason Selector */}
                <div className="space-y-1.5">
                  <label htmlFor="cancel-reason-select" className="block text-xs font-bold text-[#17201D] uppercase tracking-wider">
                    Reason for cancellation <span className="text-rose-600">*</span>
                  </label>
                  <select
                    id="cancel-reason-select"
                    name="cancellationReason"
                    value={selectedReason}
                    onChange={(e) => setSelectedReason(e.target.value)}
                    disabled={isCancelBusy}
                    required
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-[#E5E9E6] focus:border-[#123C32] focus:ring-1 focus:ring-[#123C32] text-xs sm:text-sm text-[#17201D] bg-white outline-none cursor-pointer"
                  >
                    {CUSTOMER_CANCELLATION_REASONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Optional details field (shown for all reasons) */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="cancel-reason-detail" className="font-semibold text-[#17201D]">
                      Additional details <span className="text-[#66736D] font-normal">(optional)</span>
                    </label>
                    <span className="text-[11px] text-[#66736D] font-mono">
                      {reasonDetail.length}/500
                    </span>
                  </div>
                  <textarea
                    id="cancel-reason-detail"
                    name="reasonDetail"
                    rows={3}
                    maxLength={500}
                    value={reasonDetail}
                    onChange={(e) => setReasonDetail(e.target.value.slice(0, 500))}
                    disabled={isCancelBusy}
                    placeholder="Tell us more about why you are cancelling..."
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-[#E5E9E6] focus:border-[#123C32] focus:ring-1 focus:ring-[#123C32] text-xs sm:text-sm text-[#17201D] placeholder:text-[#66736D]/60 resize-none outline-none"
                  />
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E5E9E6]">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    ref={keepOrderBtnRef}
                    onClick={() => {
                      setShowCancelConfirm(false);
                      setSelectedReason('other');
                      setReasonDetail('');
                    }}
                    disabled={isCancelBusy}
                    className="rounded-xl text-xs sm:text-sm font-semibold"
                  >
                    No, Keep Order
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={handleConfirmCancel}
                    disabled={!selectedReason || isCancelBusy}
                    className="bg-rose-600 hover:bg-rose-700 border-rose-600 text-white rounded-xl text-xs sm:text-sm font-semibold"
                  >
                    {isCancelBusy ? 'Cancelling...' : 'Confirm cancellation'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Return Merchandise Authorization (RMA) Request Modal */}
          {showReturnModal && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn"
              role="dialog"
              aria-modal="true"
              aria-labelledby="return-dialog-title"
              onClick={(e) => {
                if (e.target === e.currentTarget && !isReturnSubmitting) {
                  setShowReturnModal(false);
                }
              }}
            >
              <div
                className="bg-white rounded-3xl border border-[#E5E9E6] shadow-2xl max-w-lg w-full p-6 sm:p-7 space-y-5 max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 15v-1a4 4 0 00-4-4H8m0 0l3 3m-3-3l3-3m9 14V5a2 2 0 00-2-2H6a2 2 0 00-2 2v16l4-2 4 2 4-2 4 2z" />
                    </svg>
                  </div>
                  <div className="space-y-1">
                    <h2 id="return-dialog-title" className="text-base sm:text-lg font-bold text-[#17201D]">
                      Request Return (RMA)
                    </h2>
                    <p className="text-xs sm:text-sm text-[#66736D] leading-relaxed">
                      Select the items and quantities you would like to return, and tell us the reason.
                    </p>
                  </div>
                </div>

                {returnError && (
                  <div role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-rose-900 text-xs">
                    {returnError}
                  </div>
                )}

                {/* Items selection */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-[#17201D] uppercase tracking-wider">
                    Select Items to Return
                  </h3>
                  <div className="divide-y divide-[#E5E9E6] border border-[#E5E9E6] rounded-2xl p-3 bg-[#F7F6F1]/50 max-h-56 overflow-y-auto">
                    {items.map((item, idx) => {
                      const key = item.variantId
                        ? `${item.product?._id || item.product}_${item.variantId}`
                        : `${item.product?._id || item.product}`;
                      const returnable = getReturnableQuantity(item);
                      const currentVal = selectedReturnItems[key] || 0;

                      if (returnable <= 0) {
                        return (
                          <div key={key + idx} className="py-2.5 flex items-center justify-between text-xs text-[#66736D] opacity-60">
                            <span>{item.name} {item.sku && `(${item.sku})`}</span>
                            <span className="italic text-[10px]">Already fully returned</span>
                          </div>
                        );
                      }

                      return (
                        <div key={key + idx} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-[#17201D] truncate">{item.name}</p>
                            {item.sku && <p className="font-mono text-[10px] text-[#66736D]">SKU: {item.sku}</p>}
                            <p className="text-[10px] text-[#66736D]">Eligible: {returnable} of {item.quantity}</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <label htmlFor={`qty-${key}`} className="text-[10px] font-bold text-[#66736D]">Qty:</label>
                            <select
                              id={`qty-${key}`}
                              value={currentVal}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                setSelectedReturnItems((prev) => ({
                                  ...prev,
                                  [key]: val,
                                }));
                              }}
                              className="px-2 py-1 text-xs bg-white border border-[#E5E9E6] rounded-lg font-bold"
                            >
                              <option value="0">0 (Do not return)</option>
                              {Array.from({ length: returnable }, (_, i) => i + 1).map((n) => (
                                <option key={n} value={n}>{n}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Reason Selection */}
                <div className="space-y-1.5">
                  <label htmlFor="return-reason-select" className="text-xs font-bold text-[#17201D] block">
                    Reason for Return *
                  </label>
                  <select
                    id="return-reason-select"
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-[#E5E9E6] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123C32]"
                  >
                    {RETURN_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {RETURN_REASON_LABELS[r] || r}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Optional Customer Note */}
                <div className="space-y-1.5">
                  <label htmlFor="return-note-input" className="text-xs font-bold text-[#17201D] block">
                    Additional Comments (Optional)
                  </label>
                  <textarea
                    id="return-note-input"
                    rows={2}
                    value={returnCustomerNote}
                    onChange={(e) => setReturnCustomerNote(e.target.value)}
                    placeholder="Provide details about the issue..."
                    className="w-full px-3 py-2 text-xs bg-white border border-[#E5E9E6] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123C32]"
                  />
                </div>

                <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-3 pt-3 border-t border-[#E5E9E6]">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowReturnModal(false)}
                    disabled={isReturnSubmitting}
                    className="w-full sm:w-auto text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={handleSubmitReturn}
                    disabled={isReturnSubmitting}
                    className="w-full sm:w-auto bg-[#123C32] hover:bg-[#0E332B] text-white rounded-xl text-xs font-bold"
                  >
                    {isReturnSubmitting ? 'Submitting...' : 'Submit Return Request'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ORDER LIFECYCLE PROGRESS PRESENTATION */}
          {order.status === 'cancelled' ? (
            <div className="bg-rose-50 border border-rose-200 rounded-3xl p-6 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center font-bold text-sm shrink-0">
                  ✕
                </div>
                <div>
                  <h2 className="text-base font-bold text-rose-950">Order Cancelled</h2>
                  <p className="text-xs text-rose-800 leading-relaxed">
                    This order has been cancelled and is no longer active. All gear items have been automatically restored to inventory.
                  </p>
                </div>
              </div>

              {order.cancellation && typeof order.cancellation === 'object' && (order.cancellation.reason || formatCancellationDate(order.cancellation.cancelledAt)) ? (
                <div className="mt-3 pt-3 border-t border-rose-200/60 text-xs text-rose-950 space-y-2">
                  <h3 className="font-bold text-rose-950 text-xs uppercase tracking-wider">
                    Cancellation details
                  </h3>
                  <div className="space-y-1">
                    {Boolean(getCancellationActorLabel(order.cancellation.cancelledBy)) && (
                      <div className="flex flex-wrap items-baseline gap-1.5">
                        <span className="font-bold text-rose-900">Cancelled by:</span>
                        <span className="font-semibold text-rose-950">
                          {getCancellationActorLabel(order.cancellation.cancelledBy)}
                        </span>
                      </div>
                    )}
                    <div className="flex flex-wrap items-baseline gap-1.5">
                      <span className="font-bold text-rose-900">Cancellation Reason:</span>
                      <span className="font-semibold text-rose-950">
                        {getCancellationReasonLabel(order.cancellation.reason)}
                      </span>
                    </div>
                    {Boolean(order.cancellation.reasonDetail && order.cancellation.reasonDetail.trim()) && (
                      <div className="flex flex-wrap items-baseline gap-1.5 pt-0.5">
                        <span className="font-bold text-rose-900">Details:</span>
                        <span className="text-rose-800 italic break-words">
                          {order.cancellation.reasonDetail.trim()}
                        </span>
                      </div>
                    )}
                    {Boolean(formatCancellationDate(order.cancellation.cancelledAt)) && (
                      <div className="flex flex-wrap items-baseline gap-1.5 pt-0.5">
                        <span className="font-bold text-rose-900">Cancelled On:</span>
                        <span className="text-rose-800">
                          {formatCancellationDate(order.cancellation.cancelledAt)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-3 pt-3 border-t border-rose-200/60 text-xs text-rose-800 italic">
                  Cancellation details are unavailable for this order.
                </div>
              )}
            </div>
          ) : (
            <div className="bg-[#F7F6F1] rounded-3xl border border-[#E5E9E6] p-6 sm:p-8 space-y-4">
              <h2 className="text-xs font-bold text-[#66736D] uppercase tracking-wider">
                Order Lifecycle Progression
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                {LIFECYCLE_STEPS.map((step, idx) => {
                  const isCompleted = idx < currentStepIndex;
                  const isCurrent = idx === currentStepIndex;

                  return (
                    <div key={step.key} className="flex flex-col items-start sm:items-center text-left sm:text-center space-y-1.5">
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${
                          isCompleted
                            ? 'bg-[#123C32] text-white'
                            : isCurrent
                            ? 'bg-[#F97316] text-white ring-4 ring-[#F97316]/20'
                            : 'bg-[#E5E9E6] text-[#66736D]'
                        }`}
                      >
                        {isCompleted ? '✓' : idx + 1}
                      </div>
                      <p className={`text-xs font-bold ${isCurrent ? 'text-[#F97316]' : isCompleted ? 'text-[#17201D]' : 'text-[#66736D]'}`}>
                        {step.label}
                      </p>
                      <p className="text-[10px] text-[#66736D]">{step.description}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Shipment & Delivery Section */}
          {order.shipment && (() => {
            const shipment = order.shipment;
            const shipmentBadge = getShipmentStatusBadge(shipment.status);
            const shippedDate = formatShipmentDate(shipment.shippedAt);
            const estimatedDate = formatShipmentDate(shipment.estimatedDelivery);
            const deliveredDate = formatShipmentDate(shipment.deliveredAt);
            const updatedDate = formatShipmentDate(shipment.updatedAt);

            let safeTrackingUrl = null;
            if (shipment.trackingUrl && typeof shipment.trackingUrl === 'string') {
              try {
                const URLConstructor = typeof window !== 'undefined' && window.URL ? window.URL : globalThis.URL;
                const parsed = new URLConstructor(shipment.trackingUrl.trim());
                if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                  safeTrackingUrl = shipment.trackingUrl.trim();
                }
              } catch {
                safeTrackingUrl = null;
              }
            }

            return (
              <section
                aria-label="Shipment & Delivery"
                className="bg-white rounded-3xl border border-[#E5E9E6] p-6 shadow-xs space-y-4"
              >
                <div className="flex items-center justify-between pb-3 border-b border-[#E5E9E6]">
                  <h2 className="text-sm font-bold text-[#17201D] uppercase tracking-wider flex items-center gap-2">
                    Shipment &amp; Logistics Tracking
                  </h2>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${shipmentBadge.className}`}>
                    {shipmentBadge.label}
                  </span>
                </div>

                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <dt className="text-[10px] font-bold text-[#66736D] uppercase">Carrier</dt>
                    <dd className="mt-0.5 font-bold text-[#17201D]">{shipment.carrier}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-bold text-[#66736D] uppercase">Tracking Number</dt>
                    <dd className="mt-0.5 font-mono text-xs font-bold text-[#17201D] select-all">{shipment.trackingNumber}</dd>
                  </div>
                  {shippedDate && (
                    <div>
                      <dt className="text-[10px] font-bold text-[#66736D] uppercase">Shipped On</dt>
                      <dd className="mt-0.5 text-[#17201D]">{shippedDate}</dd>
                    </div>
                  )}
                  {estimatedDate && (
                    <div>
                      <dt className="text-[10px] font-bold text-[#66736D] uppercase">Estimated Delivery</dt>
                      <dd className="mt-0.5 text-[#17201D]">{estimatedDate}</dd>
                    </div>
                  )}
                  {deliveredDate && (
                    <div>
                      <dt className="text-[10px] font-bold text-[#66736D] uppercase">Delivered On</dt>
                      <dd className="mt-0.5 text-[#123C32] font-bold">{deliveredDate}</dd>
                    </div>
                  )}
                  {updatedDate && (
                    <div>
                      <dt className="text-[10px] font-bold text-[#66736D] uppercase">Last Updated</dt>
                      <dd className="mt-0.5 text-[#66736D]">{updatedDate}</dd>
                    </div>
                  )}
                </dl>

                {safeTrackingUrl && (
                  <div className="pt-3 border-t border-[#E5E9E6]">
                    <a
                      href={safeTrackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#123C32] text-white text-xs font-bold hover:bg-[#0E332B] transition-colors"
                    >
                      Track Shipment (External Carrier) &rarr;
                    </a>
                  </div>
                )}
              </section>
            );
          })()}

          {/* Main Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

            {/* Left: Items & Delivery Address */}
            <div className="lg:col-span-8 space-y-6">

              <div className="bg-white rounded-3xl border border-[#E5E9E6] p-6 shadow-xs space-y-4">
                <h2 className="text-sm font-bold text-[#17201D] uppercase tracking-wider">
                  Order Items ({order.totalQuantity || items.length})
                </h2>

                <div className="divide-y divide-[#E5E9E6]">
                  {items.map((item, index) => {
                    const itemKey = item.product?._id || item.product || index;
                    const productId = item.product?._id || (typeof item.product === 'string' ? item.product : null);
                    const itemPrice = item.price ?? 0;
                    const itemQuantity = item.quantity ?? 1;
                    const itemSubtotal = item.subtotal ?? (itemPrice * itemQuantity);
                    const itemImage = item.product?.image || null;

                    return (
                      <div key={itemKey} className="py-3.5 flex items-center gap-4">
                        <div className="w-16 h-16 rounded-xl bg-[#F7F6F1] border border-[#E5E9E6] flex items-center justify-center overflow-hidden shrink-0">
                          {itemImage ? (
                            <img src={itemImage} alt={item.name} className="w-full h-full object-contain p-1" />
                          ) : (
                            <span className="text-[10px] text-[#66736D]">Gear</span>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          {productId ? (
                            <a href={`/products/${productId}`} className="text-sm font-bold text-[#17201D] hover:text-[#123C32] truncate block">
                              {item.name}
                            </a>
                          ) : (
                            <h3 className="text-sm font-bold text-[#17201D] truncate">{item.name}</h3>
                          )}
                          <p className="text-xs text-[#66736D] mt-0.5">
                            Qty: <span className="font-semibold text-[#17201D]">{itemQuantity}</span> &times; {formatPrice(itemPrice)}
                          </p>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-sm font-extrabold text-[#123C32]">
                            {formatPrice(itemSubtotal)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Delivery Address (Immutable Snapshot) */}
              <div className="bg-white rounded-3xl border border-[#E5E9E6] p-6 shadow-xs space-y-3">
                <h2 className="text-sm font-bold text-[#17201D] uppercase tracking-wider">
                  Delivery Address (Snapshot)
                </h2>

                <div className="p-4 rounded-2xl border border-[#E5E9E6] bg-[#F7F6F1] text-xs sm:text-sm text-[#17201D] leading-relaxed">
                  <p className="font-bold text-sm">{shippingAddress.fullName || 'Not available'}</p>
                  <p className="text-xs text-[#66736D] mt-0.5">Phone: {shippingAddress.phone || 'Not available'}</p>
                  <div className="mt-1 space-y-0.5 text-xs text-[#66736D]">
                    <p>{shippingAddress.addressLine1 || ''}</p>
                    {shippingAddress.addressLine2 && <p>{shippingAddress.addressLine2}</p>}
                    <p>{shippingAddress.city}, {shippingAddress.state} - {shippingAddress.postalCode}</p>
                    <p>{shippingAddress.country || 'India'}</p>
                  </div>
                </div>
              </div>

              {/* Order Returns & RMA Tracking Section */}
              {orderReturns.length > 0 && (
                <div className="bg-white rounded-3xl border border-[#E5E9E6] p-6 shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-[#E5E9E6]">
                    <h2 className="text-sm font-bold text-[#17201D] uppercase tracking-wider flex items-center gap-2">
                      Returns &amp; RMA Requests ({orderReturns.length})
                    </h2>
                    <span className="text-xs text-[#66736D]">Authoritative History</span>
                  </div>

                  <div className="space-y-4 divide-y divide-[#E5E9E6]">
                    {orderReturns.map((ret) => {
                      const badge = RETURN_STATUS_BADGES[ret.status] || {
                        label: ret.status,
                        className: 'bg-zinc-100 text-zinc-700 border-zinc-200',
                      };

                      return (
                        <div key={ret._id} className="pt-4 first:pt-0 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="space-y-0.5">
                              <span className="font-mono text-xs font-bold text-[#17201D]">
                                Return #{ret.returnNumber}
                              </span>
                              <p className="text-[11px] text-[#66736D]">
                                Requested on {formatOrderDate(ret.requestedAt || ret.createdAt)} &bull; Reason: {RETURN_REASON_LABELS[ret.reason] || ret.reason}
                              </p>
                            </div>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${badge.className}`}>
                              {badge.label}
                            </span>
                          </div>

                          {/* Line items in return */}
                          <div className="bg-[#F7F6F1] rounded-2xl p-3 border border-[#E5E9E6] space-y-1.5">
                            {(ret.items || []).map((ritem, rIdx) => (
                              <div key={rIdx} className="flex justify-between text-xs text-[#17201D]">
                                <span>
                                  <strong className="font-semibold">{ritem.name}</strong>
                                  {ritem.sku && <span className="font-mono text-[#66736D] ml-1">({ritem.sku})</span>}
                                </span>
                                <span className="text-[#66736D]">
                                  Qty: <strong className="text-[#17201D]">{ritem.requestedQuantity}</strong> &times; {formatPrice(ritem.price)}
                                </span>
                              </div>
                            ))}
                          </div>

                          {/* Honest Refund Note */}
                          <div className="flex items-center justify-between text-[11px] text-[#66736D] bg-amber-50/50 p-2.5 rounded-xl border border-amber-200/50">
                            <span>Refund Status: <strong className="text-[#17201D]">Pending Manual Reconciliation</strong></span>
                            <span>Amount: <strong className="text-[#123C32]">{formatPrice(ret.totalRefundAmount || 0)}</strong></span>
                          </div>

                          {ret.rejectionReason && (
                            <div className="text-xs text-rose-800 bg-rose-50 p-2.5 rounded-xl border border-rose-200">
                              <strong>Rejection reason:</strong> {ret.rejectionReason}
                            </div>
                          )}

                          {/* Customer Cancel Return Action (Allowed only when requested) */}
                          {ret.status === 'requested' && (
                            <div className="pt-1 flex justify-end">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleCancelReturn(ret._id)}
                                disabled={cancellingReturnId === ret._id}
                                className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-xl"
                              >
                                {cancellingReturnId === ret._id ? 'Cancelling...' : 'Cancel Return Request'}
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>

            {/* Right: Summary & Payment */}
            <div className="lg:col-span-4 space-y-6">

              <div className="bg-white rounded-3xl border border-[#E5E9E6] p-6 shadow-xs space-y-4">
                <h2 className="text-sm font-bold text-[#17201D] uppercase tracking-wider pb-2 border-b border-[#E5E9E6]">
                  Order Summary
                </h2>

                <div className="space-y-2.5 text-xs sm:text-sm text-[#66736D]">
                  <div className="flex items-center justify-between">
                    <span>Distinct Items</span>
                    <span className="font-semibold text-[#17201D]">{items.length}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span>Total Quantity</span>
                    <span className="font-semibold text-[#17201D]">
                      {order.totalQuantity || items.reduce((s, i) => s + (i.quantity || 0), 0)} units
                    </span>
                  </div>

                  {(() => {
                    const fin = normalizeOrderFinancials(order);
                    return (
                      <>
                        <div className="pt-2 border-t border-[#E5E9E6] flex items-center justify-between">
                          <span>Subtotal</span>
                          <span className="font-semibold text-[#17201D]">{formatPrice(fin.subtotal)}</span>
                        </div>

                        {fin.shippingAmount > 0 && (
                          <div className="flex items-center justify-between">
                            <span>Shipping</span>
                            <span className="font-semibold text-[#17201D]">{formatPrice(fin.shippingAmount)}</span>
                          </div>
                        )}

                        {fin.taxAmount > 0 && (
                          <div className="flex items-center justify-between">
                            <span>Tax</span>
                            <span className="font-semibold text-[#17201D]">{formatPrice(fin.taxAmount)}</span>
                          </div>
                        )}

                        {fin.discountAmount > 0 && (
                          <div className="flex items-center justify-between text-emerald-700">
                            <span>Discount</span>
                            <span className="font-bold">−{formatPrice(fin.discountAmount)}</span>
                          </div>
                        )}

                        <div className="pt-3 border-t border-[#E5E9E6] flex items-center justify-between">
                          <span className="font-bold text-[#17201D] text-sm">Total</span>
                          <span className="text-xl font-extrabold text-[#123C32]">
                            {formatPrice(fin.total)}
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Payment Card */}
              <div className="bg-white rounded-3xl border border-[#E5E9E6] p-6 shadow-xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-[#E5E9E6]">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#17201D]">Payment</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${paymentBadge.className}`}>
                    {paymentBadge.label}
                  </span>
                </div>

                <div className="space-y-2 text-xs text-[#66736D]">
                  <div className="flex justify-between">
                    <span>Provider:</span>
                    <span className="font-bold text-[#17201D] uppercase">{payment.provider || 'razorpay'}</span>
                  </div>
                  {payment.transactionId && (
                    <div className="pt-1">
                      <span className="text-[10px] block font-bold uppercase text-[#66736D]">Transaction ID:</span>
                      <span className="font-mono text-xs text-[#17201D] select-all">{payment.transactionId}</span>
                    </div>
                  )}
                </div>

                {isPaymentPendingOrFailed && (
                  <div className="pt-3 border-t border-[#E5E9E6]">
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={handleRetryPayment}
                      disabled={isPaymentBusy || isMutating}
                      className="w-full justify-center rounded-xl bg-[#F97316] hover:bg-[#FF7A1A] border-[#F97316] text-white font-bold"
                    >
                      {isPaymentBusy ? 'Processing...' : payment.status === 'failed' ? 'Retry Payment' : 'Pay Now'}
                    </Button>
                  </div>
                )}
              </div>

              {/* Cancellation Action */}
              {isCancellable && (
                <div className="bg-white rounded-3xl border border-[#E5E9E6] p-6 shadow-xs space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#17201D]">
                    Cancellation
                  </h3>
                  <p className="text-xs text-[#66736D]">
                    You can cancel this order while it is {order.status}. Stock will be restored.
                  </p>
                  <Button
                    ref={cancelTriggerBtnRef}
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedReason('other');
                      setReasonDetail('');
                      setShowCancelConfirm(true);
                    }}
                    disabled={isMutating || isPaymentBusy}
                    className="w-full text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-xl font-bold text-xs"
                  >
                    Cancel Order
                  </Button>
                </div>
              )}

              {/* Return Merchandise Authorization (RMA) Action */}
              {order.status === 'delivered' && (() => {
                const hasEligibleItems = items.some((item) => getReturnableQuantity(item) > 0);

                return (
                  <div className="bg-white rounded-3xl border border-[#E5E9E6] p-6 shadow-xs space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#17201D]">
                      Returns &amp; RMA
                    </h3>
                    <p className="text-xs text-[#66736D]">
                      Order delivered. If you experienced any issue or damage, you can request an item return within our 30-day return policy.
                    </p>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={!hasEligibleItems || isReturnSubmitting}
                      onClick={() => {
                        const initialSel = {};
                        items.forEach((item) => {
                          const key = item.variantId
                            ? `${item.product?._id || item.product}_${item.variantId}`
                            : `${item.product?._id || item.product}`;
                          const maxQty = getReturnableQuantity(item);
                          if (maxQty > 0) {
                            initialSel[key] = 1; // default to 1 for first eligible
                          }
                        });
                        setSelectedReturnItems(initialSel);
                        setReturnReason('defective');
                        setReturnCustomerNote('');
                        setReturnError(null);
                        setShowReturnModal(true);
                      }}
                      className="w-full rounded-xl text-xs font-bold"
                    >
                      {hasEligibleItems ? 'Request Return (RMA)' : 'All Items Returned'}
                    </Button>
                  </div>
                );
              })()}

            </div>

          </div>

          <div className="pt-6">
            <WidePromoBanner
              eyebrow="CONTINUE EXPLORING"
              headline="Gear Up for Your Next Trail"
              subtext="Explore professional outdoor gear, high-grade tents, and campsite essentials."
              ctaText="Explore Outdoor Catalog"
              ctaLink="/shop"
            />
          </div>

        </div>
      </Container>
    </div>
  );
}
