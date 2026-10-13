import { useState } from 'react';
import { useCart } from '../features/cart/useCart.js';
import { useAuth } from '../features/auth/useAuth.js';
import { formatPrice } from '../lib/utils.js';
import Container from '../components/Container.jsx';
import Badge from '../components/Badge.jsx';
import Button from '../components/Button.jsx';
import Skeleton from '../components/Skeleton.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ErrorState from '../components/ErrorState.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import TrustStrip from '../components/TrustStrip.jsx';
import WidePromoBanner from '../components/WidePromoBanner.jsx';

/**
 * CartPage Component
 * Route: /cart
 * Fully redesigned to match CommerceFlow Master Reference System.
 */
export default function CartPage() {
  const {
    cart,
    totals,
    coupon,
    financials,
    isApplyingCoupon,
    isRemovingCoupon,
    applyCoupon,
    removeCoupon,
    isLoading: cartLoading,
    isMutating,
    error: cartContextError,
    refreshCart,
    updateQuantity,
    removeItem,
    clearCart,
  } = useCart();
  const { isAuthenticated } = useAuth();

  const [actionError, setActionError] = useState(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [mutatingItemId, setMutatingItemId] = useState(null);
  const [couponInput, setCouponInput] = useState('');
  const [couponError, setCouponError] = useState(null);
  const [couponFeedback, setCouponFeedback] = useState(null);

  const handleCartError = (err, fallbackMessage) => {
    let message = fallbackMessage;
    if (err?.code === 'INSUFFICIENT_STOCK') {
      message = 'The requested quantity exceeds available stock.';
    } else if (err?.code === 'CART_ITEM_NOT_FOUND') {
      message = 'This gear item is no longer in your cart.';
    } else if (err?.code === 'PRODUCT_NOT_FOUND') {
      message = 'This gear is no longer available in our outdoor catalog.';
    } else if (err?.code === 'CART_MUTATION_IN_PROGRESS') {
      message = 'Cart update in progress. Please wait a moment.';
    } else if (err?.code === 'AUTH_REQUIRED' || err?.status === 401) {
      message = 'Please sign in to update your cart.';
    } else if (err?.message) {
      message = err.message;
    }
    setActionError(message);
  };

  const handleApplyCoupon = async (e) => {
    e.preventDefault();
    const cleanCode = couponInput.trim();
    if (!cleanCode || isApplyingCoupon || isMutating) return;
    setCouponError(null);
    setCouponFeedback(null);

    try {
      const data = await applyCoupon(cleanCode);
      setCouponInput('');
      const appliedCode = data?.coupon?.code || cleanCode.toUpperCase();
      setCouponFeedback(`Coupon "${appliedCode}" applied successfully.`);
    } catch (err) {
      let message = 'Failed to apply coupon. Please check the code and try again.';
      if (err?.code === 'COUPON_NOT_FOUND') {
        message = 'Coupon not found. Please verify the code and try again.';
      } else if (err?.code === 'COUPON_EXPIRED') {
        message = 'This coupon has expired.';
      } else if (err?.code === 'COUPON_NOT_STARTED') {
        message = 'This promotional coupon is not yet active.';
      } else if (err?.code === 'COUPON_INACTIVE') {
        message = 'This coupon is inactive and cannot be used.';
      } else if (err?.code === 'COUPON_MAX_USES_REACHED' || err?.code === 'COUPON_USER_USAGE_LIMIT_EXCEEDED') {
        message = 'This coupon has reached its maximum usage limit.';
      } else if (err?.code === 'COUPON_MIN_SUBTOTAL_NOT_MET') {
        message = err.message || 'Cart minimum subtotal requirement not met for this coupon.';
      } else if (err?.code === 'COUPON_RESTRICTED_PRODUCTS' || err?.code === 'COUPON_RESTRICTED_CATEGORIES') {
        message = err.message || 'This coupon does not apply to the items currently in your cart.';
      } else if (err?.code === 'COUPON_ALREADY_APPLIED') {
        message = 'This coupon is already applied to your cart.';
      } else if (err?.code === 'AUTH_REQUIRED' || err?.status === 401) {
        message = 'Please sign in to apply promotional coupons.';
      } else if (err?.message) {
        message = err.message;
      }
      setCouponError(message);
    }
  };

  const handleRemoveCoupon = async () => {
    if (isRemovingCoupon || isMutating) return;
    setCouponError(null);
    setCouponFeedback(null);

    try {
      await removeCoupon();
      setCouponFeedback('Coupon removed.');
    } catch (err) {
      setCouponError(err?.message || 'Failed to remove coupon. Please try again.');
    }
  };

  // Initial Loading State
  if (cartLoading && !cart) {
    return (
      <div className="py-8 sm:py-12 bg-white min-h-[60vh]">
        <Container>
          <div className="flex items-center gap-2 mb-6">
            <Skeleton className="h-4 w-12 rounded" />
            <span className="text-[#CDD5CF]">/</span>
            <Skeleton className="h-4 w-20 rounded" />
          </div>

          <div className="space-y-6">
            <Skeleton className="h-8 w-48 rounded-xl" />
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              <div className="lg:col-span-8 space-y-4">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="bg-white rounded-3xl border border-[#E5E9E6] p-6 flex gap-4">
                    <Skeleton className="w-24 h-24 rounded-2xl shrink-0" />
                    <div className="flex-1 space-y-3">
                      <Skeleton className="h-5 w-3/4 rounded" />
                      <Skeleton className="h-4 w-1/4 rounded" />
                      <Skeleton className="h-10 w-32 rounded-xl" />
                    </div>
                  </div>
                ))}
              </div>
              <div className="lg:col-span-4">
                <Skeleton className="h-80 rounded-3xl" />
              </div>
            </div>
          </div>
        </Container>
      </div>
    );
  }

  // Error Loading Cart
  if (cartContextError && !cart) {
    return (
      <div className="py-16 sm:py-24 bg-[#F7F6F1]">
        <Container>
          <div className="max-w-md mx-auto bg-white p-8 rounded-3xl border border-[#E5E9E6] text-center shadow-sm">
            <ErrorState
              title="Unable to load your gear cart"
              description="We encountered an issue fetching your cart. Please check your connection and try again."
              onRetry={() => {
                setActionError(null);
                refreshCart();
              }}
            />
          </div>
        </Container>
      </div>
    );
  }

  const items = cart?.items || [];

  // Empty Cart State
  if (items.length === 0) {
    return (
      <div className="py-10 sm:py-16 bg-[#F7F6F1] min-h-[65vh]">
        <Container>
          <div className="mb-6">
            <Breadcrumbs items={[{ label: 'Shopping Cart' }]} />
          </div>

          <div className="max-w-xl mx-auto bg-white rounded-3xl border border-[#E5E9E6] p-8 sm:p-12 text-center shadow-xs">
            <div className="w-20 h-20 rounded-full bg-[#EEF5F1] text-[#123C32] flex items-center justify-center mx-auto mb-5">
              <svg className="w-10 h-10 stroke-[1.8]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119.993z" />
              </svg>
            </div>
            <h1 className="text-2xl font-extrabold text-[#17201D]">
              Your Cart is Empty
            </h1>
            <p className="text-sm text-[#66736D] mt-2 max-w-md mx-auto leading-relaxed">
              Looks like you haven't added any camping gear or outdoor equipment to your pack yet.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button as="a" href="/shop" variant="primary" size="lg" className="rounded-2xl">
                Explore Outdoor Gear
              </Button>
            </div>
          </div>

          <div className="mt-12">
            <WidePromoBanner
              eyebrow="GEAR UP FOR BETTER DAYS"
              headline="Ready for Your Next Adventure?"
              subtext="Discover top-rated tents, sleeping bags, hiking shoes, and camp kitchen gear."
              ctaText="Start Exploring"
              ctaLink="/shop"
            />
          </div>
        </Container>
      </div>
    );
  }

  // Stock Conflict Analysis
  const conflictItems = items.filter((item) => {
    const p = item.product;
    if (!p || !p.isActive) return true;
    return p.stock < item.quantity;
  });
  const hasStockConflicts = conflictItems.length > 0;

  // Handlers for cart mutations
  const handleIncrement = async (productId, currentQuantity, stock) => {
    if (isMutating || currentQuantity >= stock) return;
    setActionError(null);
    setMutatingItemId(productId);

    try {
      await updateQuantity(productId, currentQuantity + 1);
    } catch (err) {
      handleCartError(err, 'Failed to increase item quantity.');
    } finally {
      setMutatingItemId(null);
    }
  };

  const handleDecrement = async (productId, currentQuantity) => {
    if (isMutating || currentQuantity <= 1) return;
    setActionError(null);
    setMutatingItemId(productId);

    try {
      await updateQuantity(productId, currentQuantity - 1);
    } catch (err) {
      handleCartError(err, 'Failed to decrease item quantity.');
    } finally {
      setMutatingItemId(null);
    }
  };

  const handleSetQuantity = async (productId, targetQuantity, stock) => {
    if (isMutating) return;
    const num = Number(targetQuantity);
    if (!Number.isInteger(num) || num < 1 || num > stock) return;

    setActionError(null);
    setMutatingItemId(productId);

    try {
      await updateQuantity(productId, num);
    } catch (err) {
      handleCartError(err, 'Failed to adjust item quantity.');
    } finally {
      setMutatingItemId(null);
    }
  };

  const handleRemove = async (productId) => {
    if (isMutating) return;
    setActionError(null);
    setMutatingItemId(productId);

    try {
      await removeItem(productId);
    } catch (err) {
      handleCartError(err, 'Failed to remove item from cart.');
    } finally {
      setMutatingItemId(null);
    }
  };

  const handleClearCart = async () => {
    if (isMutating) return;
    setActionError(null);

    try {
      await clearCart();
      setShowClearConfirm(false);
    } catch (err) {
      handleCartError(err, 'Failed to clear your cart.');
    }
  };

  return (
    <div className="py-6 sm:py-10 bg-white">
      <Container>
        {/* Breadcrumb Navigation */}
        <div className="mb-4">
          <Breadcrumbs items={[{ label: 'Shop', href: '/shop' }, { label: 'Shopping Cart' }]} />
        </div>

        {/* Master Checkout Stepper (Cart -> Shipping -> Payment) matching reference */}
        <div className="mb-8 py-3 px-6 bg-[#F7F6F1] rounded-2xl border border-[#E5E9E6] flex items-center justify-center gap-4 sm:gap-8 text-xs font-bold text-[#66736D]">
          <div className="flex items-center gap-2 text-[#123C32]">
            <span className="w-5 h-5 rounded-full bg-[#123C32] text-white flex items-center justify-center text-[11px]">1</span>
            <span>Cart</span>
          </div>
          <span className="text-[#CDD5CF]">&rarr;</span>
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-[#E5E9E6] text-[#66736D] flex items-center justify-center text-[11px]">2</span>
            <span>Shipping</span>
          </div>
          <span className="text-[#CDD5CF]">&rarr;</span>
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-[#E5E9E6] text-[#66736D] flex items-center justify-center text-[11px]">3</span>
            <span>Payment</span>
          </div>
        </div>

        {/* Page Title & Clear Cart Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[#E5E9E6] mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#17201D] tracking-tight">
              Your Expedition Pack
            </h1>
            <p className="text-xs sm:text-sm text-[#66736D] mt-1">
              {totals.itemCount} {totals.itemCount === 1 ? 'item' : 'items'} ({totals.totalQuantity} units) ready for checkout
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowClearConfirm(true)}
            disabled={isMutating}
            className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:underline flex items-center gap-1.5 focus:outline-none"
            aria-label="Clear all items from your cart"
          >
            <svg className="w-4 h-4 stroke-[1.8]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
            Clear Pack
          </button>
        </div>

        {/* Action Error Banner */}
        {actionError && (
          <div
            role="alert"
            className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs sm:text-sm text-rose-800 flex items-center justify-between gap-3 animate-fadeIn"
          >
            <div className="flex items-center gap-2.5">
              <svg className="w-5 h-5 text-rose-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{actionError}</span>
            </div>
            <button
              type="button"
              onClick={() => setActionError(null)}
              className="text-rose-500 hover:text-rose-800 font-bold p-1 text-sm focus:outline-none"
              aria-label="Dismiss error"
            >
              &times;
            </button>
          </div>
        )}

        {/* Clear Cart Confirmation Dialog */}
        {showClearConfirm && (
          <div
            role="alertdialog"
            className="mb-6 p-4 sm:p-5 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fadeIn"
          >
            <div>
              <p className="text-sm font-bold text-amber-950">Empty your entire cart?</p>
              <p className="text-xs text-amber-800 mt-0.5">This will remove all {totals.totalQuantity} items from your pack.</p>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-center">
              <Button variant="secondary" size="sm" onClick={() => setShowClearConfirm(false)} disabled={isMutating} className="rounded-xl">
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="bg-rose-600 hover:bg-rose-700 border-rose-600 text-white rounded-xl"
                onClick={handleClearCart}
                disabled={isMutating}
              >
                {isMutating ? 'Clearing...' : 'Yes, Empty Cart'}
              </Button>
            </div>
          </div>
        )}

        {/* Stock Conflict Overall Notice */}
        {hasStockConflicts && (
          <div
            role="alert"
            className="mb-6 p-4 bg-amber-50 border border-amber-300 rounded-2xl text-amber-900 flex items-start gap-3"
          >
            <svg className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="text-xs leading-relaxed">
              <strong className="block text-sm font-bold text-amber-950">Inventory Adjustment Required</strong>
              Some selected gear quantities exceed available warehouse stock. Please adjust or remove before proceeding to checkout.
            </div>
          </div>
        )}

        {/* Main Cart Grid: Item List & Order Summary */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

          {/* Cart Items Column */}
          <section aria-labelledby="cart-items-heading" className="lg:col-span-8 space-y-4">
            <h2 id="cart-items-heading" className="sr-only">
              Cart Items
            </h2>

            {/* Table Header (Desktop) */}
            <div className="hidden sm:grid sm:grid-cols-12 gap-4 pb-2 border-b border-[#E5E9E6] text-xs font-bold uppercase tracking-wider text-[#66736D]">
              <div className="col-span-6">Product</div>
              <div className="col-span-2 text-center">Price</div>
              <div className="col-span-2 text-center">Quantity</div>
              <div className="col-span-2 text-right">Total</div>
            </div>

            {items.map((item) => {
              const product = item.product;
              const productId = product?._id || item._id;
              const isItemMutating = mutatingItemId === productId || isMutating;
              const isInactive = !product || !product.isActive;
              const stock = product?.stock ?? 0;
              const isOutOfStock = !isInactive && stock <= 0;
              const hasItemConflict = !isInactive && stock > 0 && stock < item.quantity;

              return (
                <article
                  key={productId}
                  className={`bg-white rounded-2xl border p-4 sm:p-5 transition-shadow hover:shadow-xs ${
                    hasItemConflict || isOutOfStock || isInactive
                      ? 'border-amber-300 bg-amber-50/20'
                      : 'border-[#E5E9E6]'
                  }`}
                >
                  <div className="flex flex-col sm:grid sm:grid-cols-12 gap-4 items-center">

                    {/* Product Info (Col span 6) */}
                    <div className="col-span-6 flex items-center gap-4 w-full">
                      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-[#F7F6F1] border border-[#E5E9E6] flex items-center justify-center overflow-hidden shrink-0">
                        {product?.image ? (
                          <a href={`/products/${productId}`} className="w-full h-full block">
                            <img
                              src={product.image}
                              alt={product.name || 'Product'}
                              loading="lazy"
                              className="w-full h-full object-contain p-2"
                            />
                          </a>
                        ) : (
                          <svg className="w-6 h-6 text-[#66736D]/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {product?.category && (
                            <span className="text-[10px] font-bold text-[#F97316] uppercase tracking-wider">
                              {product.category}
                            </span>
                          )}
                          {isOutOfStock ? (
                            <Badge variant="danger" size="sm">Out of Stock</Badge>
                          ) : hasItemConflict ? (
                            <Badge variant="warning" size="sm">Only {stock} Left</Badge>
                          ) : null}
                        </div>
                        <h3 className="text-sm font-bold text-[#17201D] truncate">
                          {product ? (
                            <a href={`/products/${productId}`} className="hover:text-[#123C32] transition-colors">
                              {product.name}
                            </a>
                          ) : (
                            <span className="italic text-[#66736D]">Discontinued Item</span>
                          )}
                        </h3>
                        {hasItemConflict && (
                          <button
                            type="button"
                            onClick={() => handleSetQuantity(productId, stock, stock)}
                            disabled={isItemMutating}
                            className="text-xs font-bold text-[#123C32] underline mt-1"
                          >
                            Adjust to {stock} &rarr;
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Unit Price (Col span 2) */}
                    <div className="col-span-2 text-center w-full sm:w-auto flex justify-between sm:block">
                      <span className="sm:hidden text-xs text-[#66736D]">Unit Price:</span>
                      <span className="text-sm font-semibold text-[#17201D]">
                        {formatPrice(product?.price ?? 0)}
                      </span>
                    </div>

                    {/* Quantity Stepper (Col span 2) */}
                    <div className="col-span-2 flex justify-center w-full sm:w-auto">
                      {!isInactive && !isOutOfStock ? (
                        <div className="flex items-center border border-[#E5E9E6] rounded-xl bg-[#F7F6F1] overflow-hidden">
                          <button
                            type="button"
                            onClick={() => handleDecrement(productId, item.quantity)}
                            disabled={isItemMutating || item.quantity <= 1}
                            className="w-8 h-8 flex items-center justify-center text-[#17201D] hover:bg-[#E5E9E6] disabled:opacity-30 transition-colors"
                            aria-label={`Decrease quantity of ${product?.name}`}
                          >
                            -
                          </button>
                          <span className="w-8 text-center text-xs font-bold text-[#17201D]">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleIncrement(productId, item.quantity, stock)}
                            disabled={isItemMutating || item.quantity >= stock}
                            className="w-8 h-8 flex items-center justify-center text-[#17201D] hover:bg-[#E5E9E6] disabled:opacity-30 transition-colors"
                            aria-label={`Increase quantity of ${product?.name}`}
                          >
                            +
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-[#66736D]">{item.quantity}</span>
                      )}
                    </div>

                    {/* Line Total & Remove Button (Col span 2) */}
                    <div className="col-span-2 flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
                      <div className="text-right">
                        <span className="sm:hidden text-xs text-[#66736D] block">Line Total:</span>
                        <span className="text-sm font-bold text-[#123C32]">
                          {formatPrice((product?.price ?? 0) * item.quantity)}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemove(productId)}
                        disabled={isItemMutating}
                        className="p-1.5 text-[#66736D] hover:text-rose-600 transition-colors rounded-lg focus:outline-none"
                        aria-label={`Remove ${product?.name || 'item'} from cart`}
                      >
                        <svg className="w-4 h-4 stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    </div>

                  </div>
                </article>
              );
            })}

            {/* Back link */}
            <div className="pt-2">
              <a
                href="/shop"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-[#123C32] hover:text-[#F97316] transition-colors"
              >
                &larr; Continue Exploring Catalog
              </a>
            </div>
          </section>

          {/* Authoritative Order Summary Panel */}
          <aside aria-labelledby="order-summary-heading" className="lg:col-span-4 lg:sticky lg:top-24 space-y-4">
            <div className="bg-white rounded-3xl border border-[#E5E9E6] p-6 shadow-xs space-y-5">
              <h2 id="order-summary-heading" className="text-lg font-extrabold text-[#17201D] pb-3 border-b border-[#E5E9E6]">
                Order Summary
              </h2>

              {/* Server-Authoritative Totals */}
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between text-[#66736D]">
                  <span>Subtotal ({totals.totalQuantity} {totals.totalQuantity === 1 ? 'item' : 'items'})</span>
                  <span className="font-semibold text-[#17201D]">{formatPrice(financials?.subtotal ?? totals.subtotal)}</span>
                </div>

                {(financials?.shippingAmount ?? 0) > 0 ? (
                  <div className="flex items-center justify-between text-[#66736D]">
                    <span>Shipping</span>
                    <span className="font-semibold text-[#17201D]">{formatPrice(financials.shippingAmount)}</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between text-[#66736D]">
                    <span>Shipping</span>
                    <span className="font-semibold text-emerald-700">Calculated at checkout</span>
                  </div>
                )}

                {(financials?.taxAmount ?? 0) > 0 && (
                  <div className="flex items-center justify-between text-[#66736D]">
                    <span>Estimated Tax</span>
                    <span className="font-semibold text-[#17201D]">{formatPrice(financials.taxAmount)}</span>
                  </div>
                )}

                {coupon?.isValid && (financials?.discountAmount ?? 0) > 0 && (
                  <div className="flex items-center justify-between text-emerald-700">
                    <span>Discount ({coupon.code})</span>
                    <span className="font-bold">−{formatPrice(financials.discountAmount)}</span>
                  </div>
                )}

                <div className="pt-3 border-t border-[#E5E9E6] flex items-center justify-between">
                  <span className="font-bold text-[#17201D]">Total</span>
                  <span className="text-2xl font-extrabold text-[#123C32] tracking-tight">
                    {formatPrice(financials?.total ?? totals.total ?? totals.subtotal)}
                  </span>
                </div>
              </div>

              {/* Stale / Invalid Coupon Warning */}
              {coupon && coupon.isValid === false && (
                <div
                  role="alert"
                  aria-live="polite"
                  className="p-3.5 bg-amber-50 border border-amber-300 rounded-2xl space-y-2 text-xs text-amber-950 animate-fadeIn"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <p className="font-bold flex items-center gap-1.5 text-amber-900">
                        <span className="font-mono bg-amber-100 px-1.5 py-0.5 rounded text-[11px] uppercase">{coupon.code}</span>
                        <span>Coupon no longer valid</span>
                      </p>
                      <p className="text-[11px] text-amber-800 leading-relaxed">
                        {coupon.error?.message || 'This coupon does not meet current cart requirements and was not applied.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveCoupon}
                      disabled={isRemovingCoupon || isMutating}
                      className="shrink-0 text-xs font-semibold text-amber-900 underline hover:text-amber-950 disabled:opacity-50"
                      aria-label={`Remove invalid coupon ${coupon.code}`}
                    >
                      {isRemovingCoupon ? 'Removing...' : 'Remove'}
                    </button>
                  </div>
                </div>
              )}

              {/* Valid Active Applied Coupon State */}
              {coupon && coupon.isValid && (
                <div
                  role="region"
                  aria-label="Applied coupon"
                  className="p-3.5 bg-[#EEF5F1] border border-[#123C32]/30 rounded-2xl flex items-center justify-between gap-3 text-xs text-[#123C32] animate-fadeIn"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#123C32]">Applied:</span>
                      <span className="font-mono font-bold uppercase tracking-wider bg-white px-2 py-0.5 rounded-lg border border-[#123C32]/20">
                        {coupon.code}
                      </span>
                    </div>
                    {(financials?.discountAmount ?? coupon.discountAmount ?? 0) > 0 && (
                      <p className="text-[11px] text-emerald-700 font-semibold">
                        Saved {formatPrice(financials?.discountAmount ?? coupon.discountAmount)}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveCoupon}
                    disabled={isRemovingCoupon || isMutating}
                    className="text-xs font-bold text-rose-600 hover:text-rose-800 hover:underline disabled:opacity-50 px-2 py-1 rounded-lg focus:outline-none"
                    aria-label={`Remove coupon ${coupon.code}`}
                  >
                    {isRemovingCoupon ? 'Removing...' : 'Remove'}
                  </button>
                </div>
              )}

              {/* Coupon Form Input or Guest Prompt (shown when no valid coupon applied) */}
              {(!coupon || !coupon.isValid) && (
                <div className="pt-2">
                  {isAuthenticated ? (
                    <form onSubmit={handleApplyCoupon} aria-label="Apply coupon" className="space-y-2">
                      <label htmlFor="cart-coupon-input" className="block text-xs font-bold text-[#17201D]">
                        Coupon code
                      </label>
                      <div className="flex gap-2">
                        <input
                          id="cart-coupon-input"
                          type="text"
                          value={couponInput}
                          onChange={(e) => {
                            setCouponInput(e.target.value);
                            if (couponError) setCouponError(null);
                          }}
                          disabled={isApplyingCoupon || isMutating}
                          placeholder="e.g. SAVE10"
                          autoCapitalize="characters"
                          autoCorrect="off"
                          spellCheck="false"
                          className="flex-1 px-3 py-2 text-xs bg-[#F7F6F1] border border-[#E5E9E6] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123C32] uppercase placeholder:normal-case font-medium disabled:opacity-50"
                        />
                        <Button
                          type="submit"
                          variant="secondary"
                          size="sm"
                          disabled={!couponInput.trim() || isApplyingCoupon || isMutating}
                          className="rounded-xl text-xs px-4 font-bold shrink-0"
                        >
                          {isApplyingCoupon ? (
                            <span className="flex items-center gap-1.5">
                              <span className="w-3 h-3 border-2 border-[#123C32] border-t-transparent rounded-full animate-spin" />
                              Applying
                            </span>
                          ) : (
                            'Apply'
                          )}
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <div className="p-3 bg-[#F7F6F1] border border-[#E5E9E6] rounded-2xl text-xs text-[#66736D]">
                      <span className="font-bold text-[#17201D] block mb-0.5">Have a coupon code?</span>
                      <span>
                        <a href="/login?redirect=/cart" className="font-bold text-[#123C32] underline hover:text-[#F97316]">
                          Sign in
                        </a>{' '}
                        to apply promotional discounts to your cart.
                      </span>
                    </div>
                  )}

                  {/* Feedback / Error live messages */}
                  <div aria-live="polite" className="mt-2 space-y-1">
                    {couponError && (
                      <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 p-2.5 rounded-xl font-medium">
                        {couponError}
                      </p>
                    )}
                    {couponFeedback && !couponError && (
                      <p className="text-xs text-emerald-800 bg-[#EEF5F1] border border-[#123C32]/20 p-2.5 rounded-xl font-medium">
                        {couponFeedback}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Checkout Action Button */}
              <div className="space-y-3 pt-2">
                <Button
                  as="a"
                  href="/checkout"
                  variant="primary"
                  size="lg"
                  disabled={hasStockConflicts || isMutating}
                  className="w-full justify-center rounded-2xl bg-[#F97316] hover:bg-[#FF7A1A] border-[#F97316] text-white font-bold shadow-xs py-3.5"
                >
                  Proceed to Checkout &rarr;
                </Button>

                {hasStockConflicts && (
                  <p className="text-xs text-amber-700 text-center font-medium">
                    Please resolve stock conflicts before proceeding.
                  </p>
                )}
              </div>
            </div>
          </aside>

        </div>

        {/* Master Trust Strip */}
        <div className="mt-12 sm:mt-16">
          <TrustStrip />
        </div>

        {/* Master Promotional Banner */}
        <div className="mt-10">
          <WidePromoBanner
            eyebrow="READY FOR YOUR NEXT EXPEDITION?"
            headline="Gear Up with Field-Tested Quality"
            subtext="Complete your outdoor checklist with durable essentials designed for the wild."
            ctaText="Continue Shopping"
            ctaLink="/shop"
          />
        </div>

      </Container>
    </div>
  );
}
