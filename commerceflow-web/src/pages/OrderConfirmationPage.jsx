import { useState, useEffect } from 'react';
import { useOrder } from '../features/orders/useOrder.js';
import { usePayment } from '../features/payments/usePayment.js';
import { useCart } from '../features/cart/useCart.js';
import { useProducts } from '../features/products/useProducts.js';
import { formatPrice, normalizeOrderFinancials } from '../lib/utils.js';
import Container from '../components/Container.jsx';
import Button from '../components/Button.jsx';
import Skeleton from '../components/Skeleton.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import ProductCard from '../components/ProductCard.jsx';
import WidePromoBanner from '../components/WidePromoBanner.jsx';

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

function getPaymentStatusBadge(status) {
  switch (status?.toLowerCase()) {
    case 'paid':
      return { className: 'bg-[#EEF5F1] text-[#123C32] border-[#123C32]/30', label: 'Paid' };
    case 'failed':
      return { className: 'bg-rose-50 text-rose-800 border-rose-300', label: 'Failed' };
    case 'refunded':
      return { className: 'bg-slate-100 text-[#17201D] border-[#E5E9E6]', label: 'Refunded' };
    case 'pending':
    default:
      return { className: 'bg-amber-50 text-amber-800 border-amber-300', label: 'Pending' };
  }
}

export default function OrderConfirmationPage() {
  const { getOrderById } = useOrder();
  const {
    openCheckout,
    isCreatingPaymentOrder,
    isVerifyingPayment,
    isCheckoutOpen,
    resetPaymentState,
  } = usePayment();

  const { refreshCart } = useCart();
  const { products: recommendedProducts } = useProducts({ limit: 4, sortBy: 'createdAt', sortOrder: 'desc' });

  useEffect(() => {
    refreshCart().catch(() => {});
  }, [refreshCart]);

  const historyOrder =
    typeof window !== 'undefined' && window.history?.state?.order
      ? window.history.state.order
      : null;

  const urlOrderId =
    typeof window !== 'undefined' && window.location?.search
      ? new window.URLSearchParams(window.location.search).get('orderId')
      : null;

  const shouldFetch =
    !historyOrder && Boolean(urlOrderId && /^[0-9a-fA-F]{24}$/.test(urlOrderId));

  const [fetchedOrder, setFetchedOrder] = useState(null);
  const [currentOrder, setCurrentOrder] = useState(null);
  const [isLoading, setIsLoading] = useState(shouldFetch);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [isRefreshingStatus, setIsRefreshingStatus] = useState(false);
  const [dismissMessage, setDismissMessage] = useState(null);

  useEffect(() => {
    let isMounted = true;

    if (shouldFetch) {
      getOrderById(urlOrderId)
        .then((order) => {
          if (isMounted) {
            setFetchedOrder(order);
            setIsLoading(false);
          }
        })
        .catch(() => {
          if (isMounted) {
            setFetchFailed(true);
            setIsLoading(false);
          }
        });
    }

    return () => {
      isMounted = false;
    };
  }, [shouldFetch, urlOrderId, getOrderById]);

  const activeOrder = currentOrder || historyOrder || fetchedOrder;

  const handlePaymentSuccess = async (verifiedData) => {
    if (!activeOrder?._id) return;
    try {
      const updated = await getOrderById(activeOrder._id);
      if (updated) {
        setCurrentOrder(updated);
        return;
      }
    } catch {
      setCurrentOrder((prev) => {
        const base = prev || activeOrder;
        return {
          ...base,
          status: verifiedData?.orderStatus || 'confirmed',
          payment: {
            ...base.payment,
            status: verifiedData?.paymentStatus || 'paid',
            transactionId: verifiedData?.transactionId || '',
          },
        };
      });
    }
  };

  const handleRefreshStatus = async () => {
    if (!activeOrder?._id || isRefreshingStatus) return;
    setIsRefreshingStatus(true);
    setDismissMessage(null);
    resetPaymentState();

    try {
      const refreshed = await getOrderById(activeOrder._id);
      if (refreshed) {
        setCurrentOrder(refreshed);
      }
    } catch {
      // keep current state
    } finally {
      setIsRefreshingStatus(false);
    }
  };

  const handlePayNow = async () => {
    if (
      !activeOrder?._id ||
      isCreatingPaymentOrder ||
      isVerifyingPayment ||
      isCheckoutOpen
    ) {
      return;
    }

    setDismissMessage(null);
    resetPaymentState();

    await openCheckout(activeOrder, {
      onSuccess: handlePaymentSuccess,
      onDismiss: () => {
        setDismissMessage('Payment was not completed. You can try again.');
      },
      onError: () => {},
    });
  };

  if (isLoading) {
    return (
      <div className="py-12 sm:py-20 bg-white min-h-[60vh]">
        <Container>
          <div className="max-w-3xl mx-auto space-y-6">
            <Skeleton className="w-16 h-16 rounded-full mx-auto" />
            <Skeleton className="h-8 w-64 mx-auto rounded-xl" />
            <Skeleton className="h-4 w-80 mx-auto rounded" />
            <div className="bg-white rounded-3xl border border-[#E5E9E6] p-8 space-y-4">
              <Skeleton className="h-6 w-44 rounded" />
              <Skeleton className="h-28 w-full rounded-2xl" />
            </div>
          </div>
        </Container>
      </div>
    );
  }

  if (!activeOrder || fetchFailed) {
    return (
      <div className="py-16 sm:py-24 bg-[#F7F6F1]">
        <Container>
          <div className="max-w-md mx-auto bg-white p-8 rounded-3xl border border-[#E5E9E6] text-center shadow-xs">
            <EmptyState
              title="Order confirmation unavailable"
              description="We could not find an active order confirmation session. If you recently placed an order, it is recorded under your account."
              action={
                <Button as="a" href="/shop" variant="primary" size="md" className="rounded-2xl mt-4">
                  Explore Outdoor Gear
                </Button>
              }
            />
          </div>
        </Container>
      </div>
    );
  }

  const items = Array.isArray(activeOrder.items) ? activeOrder.items : [];
  const shippingAddress = activeOrder.shippingAddress || {};
  const payment = activeOrder.payment || {};
  const paymentStatus = payment.status?.toLowerCase() || 'pending';
  const isPending = paymentStatus === 'pending';
  const isFailed = paymentStatus === 'failed';

  const orderStatusBadge = getOrderStatusBadge(activeOrder.status);
  const paymentStatusBadge = getPaymentStatusBadge(paymentStatus);
  const isPaymentBusy = isCreatingPaymentOrder || isVerifyingPayment || isCheckoutOpen;
  const fin = normalizeOrderFinancials(activeOrder);

  return (
    <div className="py-6 sm:py-10 bg-white min-h-[80vh]">
      <Container>
        <div className="max-w-3xl mx-auto space-y-8">

          <Breadcrumbs items={[{ label: 'Orders', href: '/account/orders' }, { label: 'Order Confirmation' }]} />

          {/* Master Success Card with Pine Tree Illustration Motif */}
          <div className="relative overflow-hidden rounded-3xl border border-[#E5E9E6] bg-white p-6 sm:p-10 text-center shadow-xs">
            {/* Soft decorative pine background */}
            <div
              className="absolute inset-0 bg-cover bg-bottom opacity-5 pointer-events-none"
              style={{
                backgroundImage: 'url("https://images.unsplash.com/photo-1511497584788-87676104235f?auto=format&fit=crop&w=1200&q=80")',
              }}
            />

            <div className="relative z-10 space-y-4">
              <div className="w-16 h-16 rounded-full bg-[#EEF5F1] text-[#123C32] flex items-center justify-center mx-auto border border-[#123C32]/20">
                <svg className="w-8 h-8 stroke-[2.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>

              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-[#17201D]">
                  Thank You for Your Order!
                </h1>
                <p className="text-sm text-[#66736D] mt-1.5 max-w-md mx-auto">
                  Your order has been placed successfully and dispatched to fulfillment.
                </p>
                <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 bg-[#F7F6F1] rounded-xl text-xs font-mono font-bold text-[#123C32] border border-[#E5E9E6]">
                  Order #{activeOrder._id}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                <Button
                  as="a"
                  href={`/account/orders/${activeOrder._id}`}
                  variant="primary"
                  size="md"
                  className="rounded-2xl bg-[#F97316] hover:bg-[#FF7A1A] border-[#F97316] text-white font-bold px-6 shadow-xs"
                >
                  View Order Details
                </Button>
                <Button
                  as="a"
                  href="/shop"
                  variant="secondary"
                  size="md"
                  className="rounded-2xl px-6"
                >
                  Continue Shopping
                </Button>
              </div>
            </div>
          </div>

          {/* Master Order Timeline Tracker */}
          <div className="bg-[#F7F6F1] rounded-3xl border border-[#E5E9E6] p-6 sm:p-8">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#66736D] mb-6 text-center">
              Fulfillment Journey
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div className="space-y-1.5">
                <span className="w-8 h-8 rounded-full bg-[#123C32] text-white flex items-center justify-center text-xs font-bold mx-auto">
                  ✓
                </span>
                <p className="text-xs font-bold text-[#17201D]">Order Placed</p>
                <p className="text-[11px] text-[#66736D]">{formatOrderDate(activeOrder.createdAt)}</p>
              </div>
              <div className="space-y-1.5">
                <span className="w-8 h-8 rounded-full bg-[#123C32] text-white flex items-center justify-center text-xs font-bold mx-auto">
                  2
                </span>
                <p className="text-xs font-bold text-[#17201D]">Processing</p>
                <p className="text-[11px] text-[#66736D]">Est. 1-2 days</p>
              </div>
              <div className="space-y-1.5">
                <span className="w-8 h-8 rounded-full bg-[#E5E9E6] text-[#66736D] flex items-center justify-center text-xs font-bold mx-auto">
                  3
                </span>
                <p className="text-xs font-bold text-[#66736D]">Shipped</p>
                <p className="text-[11px] text-[#66736D]">Est. 2-5 days</p>
              </div>
              <div className="space-y-1.5">
                <span className="w-8 h-8 rounded-full bg-[#E5E9E6] text-[#66736D] flex items-center justify-center text-xs font-bold mx-auto">
                  4
                </span>
                <p className="text-xs font-bold text-[#66736D]">Delivered</p>
                <p className="text-[11px] text-[#66736D]">Est. 5-7 days</p>
              </div>
            </div>
          </div>

          {/* Payment Status & Retry if needed */}
          {(isPending || isFailed) && (
            <div className="p-5 bg-amber-50 border border-amber-200 rounded-3xl space-y-3">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-left text-xs sm:text-sm text-amber-950">
                  <p className="font-bold">Payment Status: {paymentStatusBadge.label}</p>
                  <p className="text-xs text-amber-800 mt-0.5">Please finalize payment to ensure immediate dispatch.</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleRefreshStatus}
                    disabled={isRefreshingStatus}
                    className="rounded-xl text-xs border-amber-300 text-amber-900 hover:bg-amber-100"
                  >
                    {isRefreshingStatus ? 'Checking...' : 'Refresh Status'}
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={handlePayNow}
                    disabled={isPaymentBusy}
                    className="rounded-xl text-xs bg-[#123C32] hover:bg-[#0E332B] border-[#123C32]"
                  >
                    {isPaymentBusy ? 'Processing...' : `Pay Now • ${formatPrice(fin.total)}`}
                  </Button>
                </div>
              </div>
              {dismissMessage && (
                <p className="text-xs text-amber-700 bg-amber-100/60 p-2 rounded-xl text-center">
                  {dismissMessage}
                </p>
              )}
            </div>
          )}

          {/* Order Details & Summary Breakdown */}
          <div className="bg-white rounded-3xl border border-[#E5E9E6] p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-[#E5E9E6]">
              <span className="text-xs font-bold uppercase tracking-wider text-[#66736D]">Status</span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${orderStatusBadge.className}`}>
                {orderStatusBadge.label}
              </span>
            </div>

            {/* Items */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#66736D]">
                Equipment in this Order ({items.length})
              </h3>
              <div className="divide-y divide-[#E5E9E6]">
                {items.map((item, index) => (
                  <div key={item.product?._id || index} className="py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-[#17201D] truncate">{item.name}</p>
                      <p className="text-xs text-[#66736D]">Qty: {item.quantity} &times; {formatPrice(item.price)}</p>
                    </div>
                    <span className="text-sm font-bold text-[#123C32]">
                      {formatPrice((item.price ?? 0) * (item.quantity ?? 1))}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Authoritative Financial Breakdown */}
            <div className="pt-4 border-t border-[#E5E9E6] space-y-2 text-xs text-[#66736D]">
              <div className="flex items-center justify-between">
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
                  <span>Discount Applied</span>
                  <span className="font-bold">−{formatPrice(fin.discountAmount)}</span>
                </div>
              )}

              <div className="pt-3 border-t border-[#E5E9E6] flex items-center justify-between text-sm">
                <span className="font-extrabold text-[#17201D]">Order Total (All Taxes Included)</span>
                <span className="text-xl font-extrabold text-[#123C32]">
                  {formatPrice(fin.total)}
                </span>
              </div>
            </div>

            {/* Shipping Address */}
            <div className="pt-4 border-t border-[#E5E9E6] text-xs text-[#66736D] space-y-1">
              <p className="font-bold text-[#17201D] uppercase tracking-wider text-[11px]">Delivery Address</p>
              <p className="font-semibold text-[#17201D]">{shippingAddress.fullName}</p>
              <p>{shippingAddress.addressLine1} {shippingAddress.addressLine2 || ''}</p>
              <p>{shippingAddress.city}, {shippingAddress.state} - {shippingAddress.postalCode}</p>
              <p>Phone: {shippingAddress.phone}</p>
            </div>
          </div>

          {/* Recommended Products */}
          {recommendedProducts && recommendedProducts.length > 0 && (
            <div className="pt-6">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-[#F97316]">EXPLORE MORE</span>
                  <h2 className="text-xl font-extrabold text-[#17201D]">Recommended for Your Expedition</h2>
                </div>
                <a href="/shop" className="text-xs font-bold text-[#123C32] hover:text-[#F97316]">
                  View Catalog &rarr;
                </a>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {recommendedProducts.slice(0, 4).map((p) => (
                  <ProductCard key={p._id} product={p} />
                ))}
              </div>
            </div>
          )}

          {/* Bottom Promotional Banner */}
          <div className="pt-4">
            <WidePromoBanner
              eyebrow="CAMPING & HIKING ESSENTIALS"
              headline="Gear Up for Your Next Trail"
              subtext="Discover rugged backpacks, precision GPS compasses, and ultralight cooksets."
              ctaText="Explore Outdoor Store"
              ctaLink="/shop"
            />
          </div>

        </div>
      </Container>
    </div>
  );
}
