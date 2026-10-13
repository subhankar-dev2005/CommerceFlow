import { useState, useRef } from 'react';
import { useCart } from '../features/cart/useCart.js';
import { useAddress } from '../features/address/useAddress.js';
import { useOrder } from '../features/orders/useOrder.js';
import { usePayment } from '../features/payments/usePayment.js';
import { formatPrice, normalizeOrderFinancials } from '../lib/utils.js';
import Container from '../components/Container.jsx';
import Button from '../components/Button.jsx';
import Badge from '../components/Badge.jsx';
import Skeleton from '../components/Skeleton.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ErrorState from '../components/ErrorState.jsx';
import AddressForm from '../components/AddressForm.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import TrustStrip from '../components/TrustStrip.jsx';

/**
 * CheckoutPage Component
 * Route: /checkout
 * Unified CommerceFlow Master Reference Theme.
 */
export default function CheckoutPage() {
  const { cart, totals, coupon, financials, isLoading: cartLoading, error: cartError, refreshCart } = useCart();
  const {
    addresses,
    isLoading: addressLoading,
    isMutating: addressMutating,
    createAddress,
  } = useAddress();
  const { createOrder, isMutating: orderMutating } = useOrder();
  const {
    openCheckout,
    isCreatingPaymentOrder,
    isVerifyingPayment,
    isCheckoutOpen,
    isVerificationUncertain,
    resetPaymentState,
  } = usePayment();

  const [userSelectedAddressId, setUserSelectedAddressId] = useState(null);
  const [showAddAddressForm, setShowAddAddressForm] = useState(false);
  const [addressSuccessMessage, setAddressSuccessMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [isStockConflict, setIsStockConflict] = useState(false);
  const [ambiguousNetworkError, setAmbiguousNetworkError] = useState(false);

  // State machine: 'idle' | 'creating_order' | 'preparing_payment' | 'awaiting_payment' | 'verifying_payment' | 'payment_confirmed' | 'payment_cancelled' | 'payment_failed'
  const [checkoutState, setCheckoutState] = useState('idle');

  // Retain placed order document once created so subsequent retries never recreate order
  const [placedOrder, setPlacedOrder] = useState(null);

  // Synchronous mutex ref to reliably prevent duplicate submissions
  const isSubmittingRef = useRef(false);

  const items = cart?.items || [];
  const isCartEmpty = !cartLoading && items.length === 0 && !placedOrder;

  // Pre-check for detectable stock conflicts from authoritative cart response
  const conflictItems = items.filter((item) => {
    const p = item.product;
    if (!p || !p.isActive) return true;
    return p.stock < item.quantity || p.stock <= 0;
  });
  const hasStockConflicts = conflictItems.length > 0;

  const defaultAddress = addresses.find((addr) => addr.isDefault);
  const isUserSelectionValid = Boolean(
    userSelectedAddressId && addresses.some((addr) => addr._id === userSelectedAddressId)
  );
  const selectedAddressId = isUserSelectionValid
    ? userSelectedAddressId
    : defaultAddress
    ? defaultAddress._id
    : addresses.length > 0
    ? addresses[0]._id
    : null;

  const selectedAddressObj = addresses.find((addr) => addr._id === selectedAddressId);

  // Handle adding a new address inline from checkout
  const handleCreateAddressSubmit = async (formData) => {
    setErrorMessage(null);
    setAddressSuccessMessage(null);
    try {
      const newAddress = await createAddress(formData);
      if (newAddress?._id) {
        setUserSelectedAddressId(newAddress._id);
        setAddressSuccessMessage('Delivery address saved and selected.');
      }
      setShowAddAddressForm(false);
    } catch (err) {
      let msg = 'Failed to save address. Please check all required fields.';
      if (err?.code === 'VALIDATION_ERROR') {
        msg = err.message || 'Please check that all address fields are valid.';
      } else if (err?.message) {
        msg = err.message;
      }
      setErrorMessage(msg);
    }
  };

  // Place order and coordinate payment flow
  const handlePlaceOrderAndPay = async () => {
    if (
      !selectedAddressId ||
      isSubmittingRef.current ||
      orderMutating ||
      cartLoading ||
      addressLoading ||
      hasStockConflicts
    ) {
      return;
    }

    isSubmittingRef.current = true;
    setErrorMessage(null);
    setIsStockConflict(false);
    setAmbiguousNetworkError(false);
    resetPaymentState();

    let targetOrder = placedOrder;

    if (!targetOrder?._id) {
      setCheckoutState('creating_order');

      try {
        const activeCouponCode = (coupon && coupon.isValid && coupon.code) ? coupon.code : null;
        targetOrder = await createOrder(selectedAddressId, activeCouponCode);
        setPlacedOrder(targetOrder);
        refreshCart().catch(() => {});
      } catch (err) {
        isSubmittingRef.current = false;
        setCheckoutState('idle');
        refreshCart().catch(() => {});

        if (err?.code === 'NETWORK_ERROR' || err?.status === 0) {
          setAmbiguousNetworkError(true);
          setErrorMessage(
            'Connection interrupted: We could not confirm if your order was created on the server. Please check your Orders page or refresh to verify before trying again.'
          );
          return;
        }

        if (
          err?.code === 'COUPON_NOT_FOUND' ||
          err?.code === 'COUPON_EXPIRED' ||
          err?.code === 'COUPON_INACTIVE' ||
          err?.code === 'COUPON_NOT_STARTED' ||
          err?.code === 'COUPON_MAX_USES_REACHED' ||
          err?.code === 'COUPON_USER_USAGE_LIMIT_EXCEEDED' ||
          err?.code === 'COUPON_MIN_SUBTOTAL_NOT_MET' ||
          err?.code === 'COUPON_RESTRICTED_PRODUCTS' ||
          err?.code === 'COUPON_RESTRICTED_CATEGORIES'
        ) {
          setErrorMessage(
            err.message || 'The coupon is no longer eligible. Your cart has been refreshed; please review before retrying.'
          );
          return;
        }

        if (err?.code === 'INSUFFICIENT_STOCK') {
          setIsStockConflict(true);
          setErrorMessage(
            'One or more items in your cart have insufficient warehouse inventory. Please review your cart to adjust quantities.'
          );
        } else if (err?.code === 'CART_EMPTY') {
          setErrorMessage('Your cart is empty. Please add items before checking out.');
        } else if (err?.code === 'PRODUCT_NOT_FOUND') {
          setErrorMessage('A product in your cart is no longer active in our catalog.');
        } else if (err?.code === 'ADDRESS_NOT_FOUND') {
          setErrorMessage('The selected delivery address could not be found.');
        } else if (err?.code === 'ORDER_MUTATION_IN_PROGRESS') {
          setErrorMessage('An order operation is already in progress.');
        } else if (err?.code === 'AUTH_REQUIRED' || err?.status === 401) {
          setErrorMessage('Your session has expired. Please sign in again.');
        } else if (err?.message) {
          setErrorMessage(err.message);
        } else {
          setErrorMessage('Failed to place order. Please try again.');
        }
        return;
      }
    }

    setCheckoutState('preparing_payment');

    try {
      await openCheckout(targetOrder, {
        onSuccess: (verifiedData) => {
          isSubmittingRef.current = false;
          setCheckoutState('payment_confirmed');

          if (typeof window !== 'undefined') {
            const target = `/order-confirmation?orderId=${encodeURIComponent(targetOrder._id)}`;
            window.history.pushState({ order: targetOrder, verifiedData }, '', target);
            window.dispatchEvent(new window.Event('popstate'));
          }
        },
        onDismiss: () => {
          isSubmittingRef.current = false;
          setCheckoutState('payment_cancelled');
        },
        onError: (pErr) => {
          isSubmittingRef.current = false;
          if (pErr?.code === 'NETWORK_ERROR' || pErr?.status === 0) {
            setAmbiguousNetworkError(true);
          }
          setCheckoutState('payment_failed');
          setErrorMessage(
            pErr?.message || 'Payment was not completed by the provider. You can retry payment for this order.'
          );
        },
      });
    } catch (err) {
      isSubmittingRef.current = false;
      setCheckoutState('payment_failed');
      setErrorMessage(
        err?.message || 'Payment initiation failed. Your order has been saved and can be paid below.'
      );
    }
  };

  // Initial Skeleton Loading State
  if (cartLoading && !cart && !placedOrder) {
    return (
      <div className="py-8 sm:py-12 bg-white min-h-[60vh]">
        <Container>
          <div className="space-y-6">
            <Skeleton className="h-8 w-44 rounded-xl" />
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              <div className="lg:col-span-7 space-y-5">
                <Skeleton className="h-48 rounded-3xl" />
                <Skeleton className="h-48 rounded-3xl" />
              </div>
              <div className="lg:col-span-5">
                <Skeleton className="h-96 rounded-3xl" />
              </div>
            </div>
          </div>
        </Container>
      </div>
    );
  }

  // Cart Fetch Failure State
  if (cartError && !cart && !placedOrder) {
    return (
      <div className="py-16 sm:py-24 bg-[#F7F6F1]">
        <Container>
          <div className="max-w-md mx-auto bg-white p-8 rounded-3xl border border-[#E5E9E6] text-center shadow-sm">
            <ErrorState
              title="Unable to load checkout"
              description="We encountered an issue retrieving your cart. Please check your connection and try again."
              onRetry={refreshCart}
            />
          </div>
        </Container>
      </div>
    );
  }

  // Empty Cart Guard
  if (isCartEmpty) {
    return (
      <div className="py-12 sm:py-20 bg-[#F7F6F1] min-h-[60vh]">
        <Container>
          <div className="mb-6">
            <Breadcrumbs items={[{ label: 'Cart', href: '/cart' }, { label: 'Checkout' }]} />
          </div>

          <div className="max-w-md mx-auto bg-white p-8 rounded-3xl border border-[#E5E9E6] text-center shadow-xs">
            <EmptyState
              title="Your pack is empty"
              description="You don't have any items in your cart to checkout. Please explore our outdoor gear catalog to add products."
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

  const isProcessing =
    checkoutState === 'creating_order' ||
    checkoutState === 'preparing_payment' ||
    checkoutState === 'awaiting_payment' ||
    checkoutState === 'verifying_payment' ||
    isCreatingPaymentOrder ||
    isVerifyingPayment ||
    isCheckoutOpen;

  const isActionDisabled =
    !selectedAddressId ||
    isProcessing ||
    orderMutating ||
    cartLoading ||
    addressLoading ||
    hasStockConflicts;

  return (
    <div className="py-6 sm:py-10 bg-white min-h-[80vh]">
      <Container>
        {/* Breadcrumb Navigation */}
        <div className="mb-4">
          <Breadcrumbs items={[{ label: 'Cart', href: '/cart' }, { label: 'Checkout' }]} />
        </div>

        {/* Master Stepper Indicator */}
        <div className="mb-8 py-3 px-6 bg-[#F7F6F1] rounded-2xl border border-[#E5E9E6] flex items-center justify-center gap-4 sm:gap-8 text-xs font-bold text-[#66736D]">
          <div className="flex items-center gap-2 text-[#123C32]">
            <span className="w-5 h-5 rounded-full bg-[#123C32] text-white flex items-center justify-center text-[11px]">✓</span>
            <span>Cart</span>
          </div>
          <span className="text-[#CDD5CF]">&rarr;</span>
          <div className="flex items-center gap-2 text-[#123C32]">
            <span className="w-5 h-5 rounded-full bg-[#123C32] text-white flex items-center justify-center text-[11px]">2</span>
            <span>Shipping & Payment</span>
          </div>
          <span className="text-[#CDD5CF]">&rarr;</span>
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-[#E5E9E6] text-[#66736D] flex items-center justify-center text-[11px]">3</span>
            <span>Confirmation</span>
          </div>
        </div>

        {/* Page Heading */}
        <div className="pb-4 border-b border-[#E5E9E6] mb-8">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#17201D] tracking-tight">
            Checkout &amp; Destination
          </h1>
          <p className="text-xs sm:text-sm text-[#66736D] mt-1">
            Confirm your delivery address, inspect pack items, and complete secure payment.
          </p>
        </div>

        {/* Ambiguous Network Error Banner */}
        {(ambiguousNetworkError || isVerificationUncertain) && (
          <div
            role="alert"
            className="mb-8 p-4 sm:p-5 bg-amber-50 border border-amber-300 rounded-2xl text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fadeIn shadow-2xs"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700 shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold text-amber-950">Connection Interrupted</p>
                <p className="text-xs sm:text-sm text-amber-900 mt-0.5 leading-relaxed">
                  We could not immediately verify the response from the server due to a network interruption. To prevent duplicate orders, please inspect your Orders history before attempting again.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
              <Button as="a" href="/account/orders" variant="primary" size="sm" className="rounded-xl text-xs">
                Check My Orders
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setAmbiguousNetworkError(false);
                  resetPaymentState();
                }}
                className="rounded-xl text-xs"
              >
                Dismiss
              </Button>
            </div>
          </div>
        )}

        {/* Stock Conflict Warning Banner */}
        {hasStockConflicts && (
          <div
            role="alert"
            className="mb-8 p-4 sm:p-5 bg-amber-50 border border-amber-300 rounded-2xl text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fadeIn"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700 shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold text-amber-950">Inventory Conflict in Cart</p>
                <p className="text-xs sm:text-sm text-amber-900 mt-0.5 leading-relaxed">
                  One or more items in your cart exceed available warehouse inventory. Please adjust items in your cart before placing your order.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
              <Button as="a" href="/cart" variant="primary" size="sm" className="rounded-xl text-xs">
                Review &amp; Edit Cart
              </Button>
            </div>
          </div>
        )}

        {/* Payment Cancelled Notice */}
        {checkoutState === 'payment_cancelled' && placedOrder && (
          <div
            role="alert"
            className="mb-8 p-4 sm:p-5 bg-[#EEF5F1] border border-[#123C32]/30 rounded-2xl text-[#123C32] flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fadeIn"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#123C32] text-white flex items-center justify-center shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold text-[#123C32]">
                  Order #{placedOrder._id} Created &bull; Payment Pending
                </p>
                <p className="text-xs sm:text-sm text-[#123C32]/80 mt-0.5 leading-relaxed">
                  Razorpay checkout was dismissed. Your order is safely preserved in our system. You can complete payment now without creating a duplicate order.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handlePlaceOrderAndPay}
                disabled={isProcessing}
                className="rounded-xl text-xs"
              >
                Retry Payment Now
              </Button>
              <Button
                as="a"
                href={`/account/orders/${placedOrder._id}`}
                variant="secondary"
                size="sm"
                className="rounded-xl text-xs"
              >
                View Order
              </Button>
            </div>
          </div>
        )}

        {/* General Error Banner */}
        {errorMessage && !ambiguousNetworkError && (
          <div
            role="alert"
            className="mb-8 p-4 sm:p-5 bg-rose-50 border border-rose-200 rounded-2xl text-rose-900 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fadeIn"
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold text-rose-950">
                  {isStockConflict ? 'Inventory Conflict' : 'Unable to complete checkout'}
                </p>
                <p className="text-xs sm:text-sm text-rose-800 mt-0.5 leading-relaxed">
                  {errorMessage}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
              {isStockConflict && (
                <Button as="a" href="/cart" variant="secondary" size="sm" className="rounded-xl text-xs">
                  Review Cart
                </Button>
              )}
              <button
                type="button"
                onClick={() => {
                  setErrorMessage(null);
                  setIsStockConflict(false);
                }}
                className="text-rose-500 hover:text-rose-800 font-bold p-1 text-sm focus:outline-none"
                aria-label="Dismiss error"
              >
                &times;
              </button>
            </div>
          </div>
        )}

        {/* Main Two-Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

          {/* Left Column: Address, Review, Payment */}
          <div className="lg:col-span-7 space-y-6">

            {/* Section 1: Delivery Destination */}
            <section aria-labelledby="shipping-address-heading" className="bg-white rounded-3xl border border-[#E5E9E6] p-6 sm:p-7 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-[#E5E9E6] mb-5">
                <div>
                  <h2 id="shipping-address-heading" className="text-lg font-extrabold text-[#17201D] tracking-tight flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-[#123C32] text-white text-xs flex items-center justify-center font-bold">1</span>
                    Shipping Destination
                  </h2>
                  <p className="text-xs text-[#66736D] mt-1">
                    Select where our logistics partners should deliver your gear.
                  </p>
                </div>

                <div className="flex items-center gap-2.5 self-start sm:self-auto">
                  <a
                    href="/account/addresses"
                    className="text-xs font-bold text-[#123C32] hover:text-[#F97316] transition-colors"
                  >
                    Manage Addresses
                  </a>

                  {!showAddAddressForm && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAddAddressForm(true)}
                      disabled={addressMutating || isProcessing}
                      className="text-[#123C32] hover:bg-[#EEF5F1] border border-[#123C32]/30 font-bold text-xs rounded-xl"
                    >
                      <svg className="w-3.5 h-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                      Add Address
                    </Button>
                  )}
                </div>
              </div>

              {/* Inline Add Address Form */}
              {showAddAddressForm && (
                <div className="p-5 bg-[#F7F6F1] border border-[#123C32]/20 rounded-2xl mb-5 animate-fadeIn">
                  <div className="flex items-center justify-between pb-3 border-b border-[#E5E9E6] mb-4">
                    <h3 className="text-sm font-bold text-[#17201D]">Add New Delivery Address</h3>
                    <button
                      type="button"
                      onClick={() => setShowAddAddressForm(false)}
                      disabled={addressMutating}
                      className="text-[#66736D] hover:text-[#17201D] p-1 text-sm"
                      aria-label="Cancel"
                    >
                      &times;
                    </button>
                  </div>
                  <AddressForm
                    mode="create"
                    onSubmit={handleCreateAddressSubmit}
                    onCancel={() => setShowAddAddressForm(false)}
                    isSubmitting={addressMutating}
                  />
                </div>
              )}

              {/* Inline Address Creation Success */}
              {addressSuccessMessage && (
                <div className="mb-5 p-3.5 bg-[#EEF5F1] border border-[#123C32]/20 rounded-xl text-xs font-semibold text-[#123C32] flex items-center justify-between">
                  <span>{addressSuccessMessage}</span>
                  <button type="button" onClick={() => setAddressSuccessMessage(null)} className="font-bold">
                    &times;
                  </button>
                </div>
              )}

              {/* Address List State */}
              {addressLoading && addresses.length === 0 ? (
                <div className="space-y-3">
                  <Skeleton className="h-28 rounded-2xl" />
                  <Skeleton className="h-28 rounded-2xl" />
                </div>
              ) : addresses.length === 0 && !showAddAddressForm ? (
                <div className="text-center py-8 px-4 border-2 border-dashed border-[#E5E9E6] rounded-2xl bg-[#F7F6F1]">
                  <h3 className="text-sm font-bold text-[#17201D] mb-1">No saved addresses</h3>
                  <p className="text-xs text-[#66736D] mb-4 max-w-sm mx-auto">
                    Please provide an address to deliver your expedition equipment.
                  </p>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    className="rounded-xl"
                    onClick={() => setShowAddAddressForm(true)}
                  >
                    Add Delivery Address
                  </Button>
                </div>
              ) : (
                <div className="space-y-3" role="radiogroup" aria-label="Select delivery address">
                  {addresses.map((address) => {
                    const isSelected = selectedAddressId === address._id;
                    return (
                      <label
                        key={address._id}
                        htmlFor={`address-${address._id}`}
                        className={`block cursor-pointer p-4 sm:p-5 rounded-2xl border transition-all select-none relative ${
                          isSelected
                            ? 'border-[#123C32] bg-[#EEF5F1]/40 ring-2 ring-[#123C32]/10 shadow-xs'
                            : 'border-[#E5E9E6] bg-white hover:border-[#66736D]/40 hover:bg-[#F7F6F1]'
                        }`}
                      >
                        <div className="flex items-start gap-3.5">
                          <div className="pt-0.5 shrink-0">
                            <input
                              type="radio"
                              id={`address-${address._id}`}
                              name="checkoutAddress"
                              value={address._id}
                              checked={isSelected}
                              disabled={isProcessing}
                              onChange={() => {
                                setUserSelectedAddressId(address._id);
                                setErrorMessage(null);
                              }}
                              className="w-4 h-4 text-[#123C32] border-[#E5E9E6] focus:ring-[#123C32] cursor-pointer"
                            />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-[#17201D]">
                                  {address.fullName}
                                </span>
                                {address.isDefault && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#F7F6F1] text-[#17201D] border border-[#E5E9E6]">
                                    Default
                                  </span>
                                )}
                              </div>
                              {isSelected && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#123C32] bg-[#EEF5F1] px-2.5 py-0.5 rounded-full border border-[#123C32]/20">
                                  Deliver Here
                                </span>
                              )}
                            </div>

                            <p className="text-xs text-[#66736D] font-medium">
                              Phone: <span className="text-[#17201D]">{address.phone}</span>
                            </p>

                            <div className="text-xs text-[#66736D] leading-relaxed mt-1">
                              <p>{address.addressLine1}</p>
                              {address.addressLine2 && <p>{address.addressLine2}</p>}
                              <p>
                                {address.city}, {address.state} &ndash; <span className="font-semibold text-[#17201D]">{address.postalCode}</span>
                              </p>
                              <p className="text-[11px] text-[#66736D] font-medium">{address.country || 'India'}</p>
                            </div>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Section 2: Review Order Items */}
            <section aria-labelledby="order-items-heading" className="bg-white rounded-3xl border border-[#E5E9E6] p-6 sm:p-7 shadow-xs">
              <div className="flex items-center justify-between pb-4 border-b border-[#E5E9E6] mb-4">
                <div>
                  <h2 id="order-items-heading" className="text-lg font-extrabold text-[#17201D] tracking-tight flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-[#123C32] text-white text-xs flex items-center justify-center font-bold">2</span>
                    Review Pack Items
                  </h2>
                  <p className="text-xs text-[#66736D] mt-1">
                    {totals.itemCount} distinct {totals.itemCount === 1 ? 'item' : 'items'} &bull; {totals.totalQuantity} total units
                  </p>
                </div>

                <a
                  href="/cart"
                  className="text-xs font-bold text-[#123C32] hover:text-[#F97316] transition-colors"
                >
                  Edit Pack &rarr;
                </a>
              </div>

              <div className="divide-y divide-[#E5E9E6]">
                {items.map((item) => {
                  const product = item.product;
                  const productId = product?._id || item._id;
                  const lineSubtotal = (product?.price ?? 0) * item.quantity;
                  const isConflict = !product || !product.isActive || (product.stock < item.quantity);

                  return (
                    <div key={productId} className="py-3.5 flex items-center gap-3.5">
                      <div className="w-16 h-16 rounded-xl bg-[#F7F6F1] border border-[#E5E9E6] flex items-center justify-center overflow-hidden shrink-0">
                        {product?.image ? (
                          <img
                            src={product.image}
                            alt={product.name || 'Product'}
                            className="w-full h-full object-contain p-1.5"
                            loading="lazy"
                          />
                        ) : (
                          <span className="text-xs text-[#66736D]">Gear</span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-0.5">
                          {product?.category && (
                            <span className="text-[10px] font-bold text-[#F97316] uppercase tracking-wider">
                              {product.category}
                            </span>
                          )}
                          {isConflict && (
                            <Badge variant="warning" size="sm">Stock Conflict</Badge>
                          )}
                        </div>

                        <h3 className="text-xs sm:text-sm font-bold text-[#17201D] truncate">
                          {product?.name || 'Outdoor Item'}
                        </h3>

                        <p className="text-xs text-[#66736D] mt-0.5">
                          Qty: <span className="font-semibold text-[#17201D]">{item.quantity}</span> &times; {formatPrice(product?.price ?? 0)}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-xs sm:text-sm font-extrabold text-[#123C32]">
                          {formatPrice(lineSubtotal)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Section 3: Secure Payment */}
            <section aria-labelledby="payment-method-heading" className="bg-white rounded-3xl border border-[#E5E9E6] p-6 sm:p-7 shadow-xs">
              <div className="flex items-center justify-between pb-4 border-b border-[#E5E9E6] mb-4">
                <div>
                  <h2 id="payment-method-heading" className="text-lg font-extrabold text-[#17201D] tracking-tight flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-[#123C32] text-white text-xs flex items-center justify-center font-bold">3</span>
                    Secure Payment Gateway
                  </h2>
                  <p className="text-xs text-[#66736D] mt-1">
                    End-to-end encrypted checkout via Razorpay official gateway.
                  </p>
                </div>

                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#EEF5F1] border border-[#123C32]/20 rounded-full text-[#123C32] text-xs font-bold">
                  Razorpay Verified
                </span>
              </div>

              <div className="p-4 rounded-2xl border border-[#E5E9E6] bg-[#F7F6F1] space-y-2">
                <p className="text-sm font-bold text-[#17201D]">Supported Payment Modes:</p>
                <p className="text-xs text-[#66736D]">
                  UPI (Google Pay, PhonePe, Paytm, BHIM), NetBanking across 50+ major banks, and all Credit/Debit cards.
                </p>
              </div>
            </section>

          </div>

          {/* Right Column: Authoritative Financial Summary */}
          <aside aria-labelledby="order-summary-heading" className="lg:col-span-5 lg:sticky lg:top-24 space-y-4">
            <div className="bg-white rounded-3xl border border-[#E5E9E6] p-6 shadow-xs space-y-5">
              <h2 id="order-summary-heading" className="text-lg font-extrabold text-[#17201D] pb-3 border-b border-[#E5E9E6] flex items-center justify-between">
                <span>Order Summary</span>
                <span className="text-xs font-semibold text-[#66736D]">
                  {totals.totalQuantity} units
                </span>
              </h2>

              {selectedAddressObj && (
                <div className="p-3.5 bg-[#F7F6F1] border border-[#E5E9E6] rounded-2xl space-y-1 text-xs">
                  <div className="flex items-center justify-between font-bold text-[#17201D]">
                    <span>Delivering to:</span>
                    <span>{selectedAddressObj.fullName}</span>
                  </div>
                  <p className="text-[#66736D] truncate">
                    {selectedAddressObj.city}, {selectedAddressObj.state} - {selectedAddressObj.postalCode}
                  </p>
                </div>
              )}

              {/* Server-Authoritative Totals */}
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between text-[#66736D]">
                  <span>Items Subtotal</span>
                  <span className="font-semibold text-[#17201D]">{formatPrice(totals.subtotal)}</span>
                </div>

                {(() => {
                  const fin = placedOrder
                    ? normalizeOrderFinancials(placedOrder)
                    : {
                        subtotal: financials?.subtotal ?? totals.subtotal,
                        shippingAmount: financials?.shippingAmount ?? 0,
                        taxAmount: financials?.taxAmount ?? 0,
                        discountAmount: coupon?.isValid ? (financials?.discountAmount ?? 0) : 0,
                        total: financials?.total ?? totals.total ?? totals.subtotal,
                      };
                  return (
                    <>
                      {fin.shippingAmount > 0 ? (
                        <div className="flex items-center justify-between text-[#66736D]">
                          <span>Shipping</span>
                          <span className="font-semibold text-[#17201D]">{formatPrice(fin.shippingAmount)}</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between text-[#66736D]">
                          <span>Shipping</span>
                          <span className="font-semibold text-emerald-700">Free Expedited</span>
                        </div>
                      )}

                      {fin.taxAmount > 0 && (
                        <div className="flex items-center justify-between text-[#66736D]">
                          <span>Tax</span>
                          <span className="font-semibold text-[#17201D]">{formatPrice(fin.taxAmount)}</span>
                        </div>
                      )}

                      {fin.discountAmount > 0 && (
                        <div className="flex items-center justify-between text-emerald-700">
                          <span>Discount Applied {coupon?.code ? `(${coupon.code})` : ''}</span>
                          <span className="font-bold">−{formatPrice(fin.discountAmount)}</span>
                        </div>
                      )}

                      <div className="pt-3 border-t border-[#E5E9E6] flex items-center justify-between">
                        <span className="font-extrabold text-[#17201D] text-base">Authoritative Total</span>
                        <span className="text-2xl font-extrabold text-[#123C32] tracking-tight">
                          {formatPrice(fin.total)}
                        </span>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Action Button */}
              <div className="space-y-2 pt-2">
                <Button
                  type="button"
                  variant="primary"
                  size="lg"
                  disabled={isActionDisabled}
                  onClick={handlePlaceOrderAndPay}
                  aria-busy={isProcessing}
                  className="w-full justify-center rounded-2xl bg-[#F97316] hover:bg-[#FF7A1A] border-[#F97316] text-white font-bold py-3.5 shadow-xs"
                >
                  {checkoutState === 'creating_order' ? (
                    <span className="flex items-center gap-2">
                      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Creating Order...
                    </span>
                  ) : checkoutState === 'preparing_payment' ? (
                    <span className="flex items-center gap-2">
                      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Launching Razorpay...
                    </span>
                  ) : checkoutState === 'awaiting_payment' ? (
                    'Awaiting Payment...'
                  ) : checkoutState === 'verifying_payment' ? (
                    'Verifying Payment...'
                  ) : checkoutState === 'payment_cancelled' && placedOrder ? (
                    `Retry Payment • ${formatPrice(normalizeOrderFinancials(placedOrder).total)}`
                  ) : checkoutState === 'payment_failed' && placedOrder ? (
                    `Retry Payment • ${formatPrice(normalizeOrderFinancials(placedOrder).total)}`
                  ) : (
                    `Place Order & Pay • ${formatPrice(financials?.total ?? totals.total ?? totals.subtotal)}`
                  )}
                </Button>

                {!selectedAddressId && addresses.length > 0 && (
                  <p className="text-center text-xs text-amber-700 font-medium">
                    Please select a delivery address to place your order.
                  </p>
                )}

                {hasStockConflicts && (
                  <p className="text-center text-xs text-amber-700 font-medium">
                    Resolve stock conflicts before placing order.
                  </p>
                )}

                <Button
                  as="a"
                  href="/cart"
                  variant="secondary"
                  size="md"
                  className="w-full justify-center rounded-2xl"
                >
                  Return to Cart
                </Button>
              </div>
            </div>
          </aside>

        </div>

        {/* Section 19/34: Checkout Trust Strip */}
        <div className="mt-12 sm:mt-16">
          <TrustStrip />
        </div>

      </Container>
    </div>
  );
}
