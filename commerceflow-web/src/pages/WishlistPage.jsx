import React, { useState } from 'react';
import { useWishlist } from '../features/wishlist/useWishlist.js';
import { useCart } from '../features/cart/useCart.js';
import { formatPrice } from '../lib/utils.js';
import Container from '../components/Container.jsx';
import Button from '../components/Button.jsx';
import Skeleton from '../components/Skeleton.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Badge from '../components/Badge.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import WidePromoBanner from '../components/WidePromoBanner.jsx';

function extractProduct(item) {
  if (!item) return null;
  if (item.product && typeof item.product === 'object' && item.product._id) {
    return item.product;
  }
  if (item._id) return item;
  return null;
}

function extractProductId(item) {
  const product = extractProduct(item);
  if (product) return String(product._id || '');
  if (typeof item?.product === 'string') return item.product;
  return String(item?.productId || item?._id || '');
}

function WishlistItem({ item }) {
  const { removeFromWishlist, isProductMutating } = useWishlist();
  const { addToCart, isMutating: cartMutating } = useCart();

  const [imageError, setImageError] = useState(false);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [cartSuccess, setCartSuccess] = useState(false);
  const [cartError, setCartError] = useState(null);

  const product = extractProduct(item);
  const productId = extractProductId(item);

  if (!productId) return null;

  const name = product?.name || 'Outdoor Gear';
  const price = typeof product?.price === 'number' ? product.price : null;
  const stock = typeof product?.stock === 'number' ? product.stock : 0;
  const image = product?.image || null;
  const category = product?.category || null;
  const description = product?.description || null;

  const isOutOfStock = stock <= 0;
  const isLowStock = stock > 0 && stock <= 5;
  const isRemoving = isProductMutating(productId);

  const handleAddToCart = async () => {
    if (isOutOfStock || isAddingToCart || cartMutating) return;
    setCartError(null);
    setIsAddingToCart(true);
    try {
      await addToCart(productId, 1);
      setCartSuccess(true);
      setTimeout(() => setCartSuccess(false), 2500);
    } catch (err) {
      let msg = 'Failed to add to cart';
      if (err?.code === 'INSUFFICIENT_STOCK') msg = 'Item is no longer available in that quantity.';
      else if (err?.code === 'PRODUCT_NOT_FOUND') msg = 'This product is no longer available.';
      else if (err?.message) msg = err.message;
      setCartError(msg);
    } finally {
      setIsAddingToCart(false);
    }
  };

  const handleRemove = async () => {
    if (isRemoving) return;
    setCartError(null);
    await removeFromWishlist(productId);
  };

  return (
    <article className="bg-white rounded-3xl border border-[#E5E9E6] p-5 shadow-xs hover:shadow-sm transition-all duration-200 flex flex-col sm:flex-row gap-5 items-center">
      {/* Product Image */}
      <a
        href={`/products/${productId}`}
        className="shrink-0 block w-full sm:w-28 h-28 rounded-2xl bg-[#F7F6F1] border border-[#E5E9E6] flex items-center justify-center overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-[#123C32]"
        aria-label={`View ${name}`}
      >
        {image && !imageError ? (
          <img
            src={image}
            alt=""
            loading="lazy"
            onError={() => setImageError(true)}
            className="w-full h-full object-contain p-2"
          />
        ) : (
          <div className="text-[#66736D]/40">
            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
      </a>

      {/* Product Info & Actions */}
      <div className="flex-1 flex flex-col justify-between min-w-0 gap-3 w-full">
        <div className="space-y-1">
          <div className="flex items-start justify-between gap-2">
            <a
              href={`/products/${productId}`}
              className="text-base font-extrabold text-[#17201D] hover:text-[#123C32] transition-colors leading-tight"
            >
              {name}
            </a>

            <button
              type="button"
              onClick={handleRemove}
              disabled={isRemoving}
              aria-label={`Remove ${name} from wishlist`}
              className="shrink-0 p-2 rounded-xl text-[#66736D] hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-50"
            >
              {isRemoving ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4 stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {category && (
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#F97316]">
                {category}
              </span>
            )}
            {isOutOfStock ? (
              <Badge variant="danger" size="sm">Out of Stock</Badge>
            ) : isLowStock ? (
              <span className="text-[11px] font-semibold text-[#F97316] bg-[#F97316]/10 px-2 py-0.5 rounded-full">
                Only {stock} left
              </span>
            ) : (
              <span className="text-[11px] font-semibold text-[#123C32] bg-[#EEF5F1] px-2 py-0.5 rounded-full">
                In Stock
              </span>
            )}
          </div>

          {description && (
            <p className="text-xs text-[#66736D] line-clamp-1 leading-relaxed">
              {description}
            </p>
          )}
        </div>

        {/* Price + Add to Cart */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#E5E9E6]">
          <span className="text-lg font-extrabold text-[#123C32] tracking-tight">
            {price !== null ? formatPrice(price) : '—'}
          </span>

          <div className="flex items-center gap-2">
            {cartSuccess ? (
              <span className="inline-flex items-center gap-1 text-[#123C32] text-xs font-bold px-3 py-1.5 bg-[#EEF5F1] rounded-xl border border-[#123C32]/20">
                ✓ Added to Pack
              </span>
            ) : (
              <Button
                type="button"
                variant={isOutOfStock ? 'secondary' : 'primary'}
                size="sm"
                disabled={isOutOfStock || isAddingToCart || cartMutating}
                onClick={handleAddToCart}
                className="rounded-xl text-xs"
              >
                {isOutOfStock ? (
                  'Out of Stock'
                ) : isAddingToCart ? (
                  'Adding...'
                ) : (
                  'Add to Cart'
                )}
              </Button>
            )}
          </div>
        </div>

        {cartError && (
          <div className="p-2 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center justify-between">
            <span>{cartError}</span>
            <button type="button" onClick={() => setCartError(null)} className="font-bold">
              &times;
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

export default function WishlistPage() {
  const {
    wishlist,
    isLoading,
    error,
    clearWishlist,
    isMutating,
    refreshWishlist,
  } = useWishlist();

  const [isClearing, setIsClearing] = useState(false);
  const [clearError, setClearError] = useState(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const items = wishlist?.items || [];
  const totalItems = wishlist?.totalItems ?? items.length;

  const handleClearWishlist = async () => {
    setShowClearConfirm(false);
    setClearError(null);
    setIsClearing(true);
    try {
      await clearWishlist();
    } catch (err) {
      setClearError(err?.message || 'Failed to clear wishlist.');
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="py-6 sm:py-10 bg-white min-h-[80vh]">
      <Container>
        <div className="mb-4">
          <Breadcrumbs items={[{ label: 'Saved Wishlist' }]} />
        </div>

        {/* Page Header */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[#E5E9E6]">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#17201D] tracking-tight">
              My Saved Gear
            </h1>
            {!isLoading && !error && (
              <p className="text-xs sm:text-sm text-[#66736D] mt-1">
                {totalItems === 0
                  ? 'Your saved wishlist is empty.'
                  : `${totalItems} ${totalItems === 1 ? 'item' : 'items'} saved for future adventures`}
              </p>
            )}
          </div>

          {!isLoading && !error && items.length > 0 && (
            <div className="flex items-center gap-2">
              {!showClearConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(true)}
                  disabled={isClearing || isMutating}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#66736D] hover:text-rose-600 border border-[#E5E9E6] rounded-xl transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Clear Wishlist
                </button>
              ) : (
                <div className="flex items-center gap-2 p-2 bg-rose-50 border border-rose-200 rounded-xl">
                  <span className="text-xs font-medium text-rose-800">Clear all saved gear?</span>
                  <button
                    type="button"
                    onClick={handleClearWishlist}
                    disabled={isClearing}
                    className="px-2.5 py-1 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg"
                  >
                    {isClearing ? 'Clearing...' : 'Yes, clear'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowClearConfirm(false)}
                    className="px-2.5 py-1 text-xs text-[#66736D]"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Clear error banner */}
        {clearError && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center justify-between">
            <span>{clearError}</span>
            <button type="button" onClick={() => setClearError(null)} className="font-bold">
              &times;
            </button>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white rounded-3xl border border-[#E5E9E6] p-6 flex gap-4">
                <Skeleton className="w-28 h-28 rounded-2xl shrink-0" />
                <div className="flex-1 space-y-3">
                  <Skeleton className="h-5 w-3/4 rounded-xl" />
                  <Skeleton className="h-4 w-1/3 rounded" />
                  <Skeleton className="h-4 w-1/2 rounded" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error State */}
        {!isLoading && error && (
          <div className="py-12 text-center bg-[#F7F6F1] rounded-3xl p-8 border border-[#E5E9E6]">
            <h2 className="text-base font-bold text-[#17201D] mb-1">Unable to load wishlist</h2>
            <p className="text-sm text-[#66736D] mb-4">{error?.message || 'Please check your connection.'}</p>
            <Button type="button" variant="primary" size="sm" onClick={refreshWishlist} className="rounded-xl">
              Retry
            </Button>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && items.length === 0 && (
          <div className="bg-[#F7F6F1] rounded-3xl border border-[#E5E9E6] p-8 sm:p-12 text-center">
            <EmptyState
              title="Your saved gear list is empty"
              description="Save products you love by clicking the heart icon on any outdoor product card."
              action={
                <Button as="a" href="/shop" variant="primary" size="md" className="rounded-2xl mt-4">
                  Browse Outdoor Catalog
                </Button>
              }
            />
          </div>
        )}

        {/* Wishlist Items */}
        {!isLoading && !error && items.length > 0 && (
          <section aria-label="Wishlist items" className="space-y-4">
            {items.map((item, index) => {
              const pid = extractProductId(item);
              return <WishlistItem key={pid || index} item={item} />;
            })}

            <div className="mt-8 pt-6 border-t border-[#E5E9E6] flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-[#66736D]">
                {totalItems} items saved in your collection
              </p>
              <Button as="a" href="/shop" variant="secondary" size="sm" className="rounded-xl">
                Continue Exploring
              </Button>
            </div>
          </section>
        )}

        {/* Master Wishlist Promotional Banner */}
        <div className="mt-12 sm:mt-16">
          <WidePromoBanner
            eyebrow="SAVE IT FOR LATER"
            headline="Keep Your Favorite Gear Within Reach"
            subtext="Track availability and pricing on premium tents, packs, and campsite essentials."
            ctaText="Explore Collection"
            ctaLink="/shop"
          />
        </div>

      </Container>
    </div>
  );
}
