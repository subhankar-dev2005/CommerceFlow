import { useState, useRef, useEffect, useCallback } from 'react';
import { cn, formatPrice } from '../lib/utils.js';
import { useCart } from '../features/cart/useCart.js';
import { useWishlist } from '../features/wishlist/useWishlist.js';

/**
 * CommerceFlow ProductCard — Outdoor premium design.
 * Backend contract: { _id, name, description, price, stock, category, image, isActive }
 */
export default function ProductCard({ product, onAddToCart, className = '' }) {
  const [imageError, setImageError] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [cardError, setCardError] = useState(null);

  const { addToCart } = useCart();
  const { isWishlisted, toggleWishlist, isLoading: wishlistLoading, isProductMutating } = useWishlist();
  const successTimerRef = useRef(null);

  useEffect(() => {
    return () => { if (successTimerRef.current) clearTimeout(successTimerRef.current); };
  }, []);

  const {
    _id, id,
    name = 'Unnamed Product',
    price = 0,
    stock = 0,
    category,
    image,
  } = product || {};

  const productId = _id || id || '';
  const isOutOfStock = stock <= 0;
  const isLowStock = stock > 0 && stock <= 5;
  const isDisabled = isOutOfStock || isAdding || isSuccess;

  const wishlisted = productId ? isWishlisted(productId) : false;
  const isWishlistMutating = productId ? isProductMutating(productId) : false;

  const handleAddToCart = async () => {
    if (isDisabled) return;
    setCardError(null);
    setIsAdding(true);
    try {
      await addToCart(productId, 1);
      setIsSuccess(true);
      onAddToCart?.(product);
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => setIsSuccess(false), 2000);
    } catch (err) {
      let msg = 'Failed to add item to cart';
      if (err?.code === 'INSUFFICIENT_STOCK') msg = 'Requested quantity exceeds available stock';
      else if (err?.code === 'PRODUCT_NOT_FOUND') msg = 'This product is no longer available';
      else if (err?.message) msg = err.message;
      setCardError(msg);
    } finally {
      setIsAdding(false);
    }
  };

  const handleWishlistToggle = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!productId || isWishlistMutating || wishlistLoading) return;
    await toggleWishlist(product);
  }, [productId, isWishlistMutating, wishlistLoading, toggleWishlist, product]);

  return (
    <article
      className={cn(
        'group bg-white rounded-2xl border border-[#E5E9E6] shadow-2xs flex flex-col card-hover hover:border-[#aed1bc] hover:shadow-md overflow-hidden transition-all duration-200',
        className
      )}
    >
      {/* ── Image Area ────────────────────────────────────────────────── */}
      <a
        href={productId ? `/products/${productId}` : '#'}
        className="block relative overflow-hidden bg-[#F7F6F1] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#123C32] focus-visible:ring-inset"
        tabIndex={productId ? 0 : -1}
      >
        <div className="aspect-[4/3] w-full overflow-hidden flex items-center justify-center p-3">
          {image && !imageError ? (
            <img
              src={image}
              alt={name}
              loading="lazy"
              onError={() => setImageError(true)}
              className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-[#EEF5F1]">
              <svg className="w-12 h-12 text-[#aed1bc] stroke-[1.2]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
            </div>
          )}
        </div>

        {/* Stock / Sale Badge — top-left */}
        <div className="absolute top-2.5 left-2.5 flex flex-col gap-1">
          {isOutOfStock ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">
              Out of Stock
            </span>
          ) : isLowStock ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
              Only {stock} left
            </span>
          ) : null}
        </div>

        {/* Wishlist Button — top-right */}
        {productId && (
          <button
            type="button"
            onClick={handleWishlistToggle}
            disabled={isWishlistMutating || wishlistLoading}
            aria-label={wishlisted ? `Remove ${name} from wishlist` : `Add ${name} to wishlist`}
            aria-pressed={wishlisted}
            className={cn(
              'absolute top-2.5 right-2.5 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 shadow-xs',
              wishlisted
                ? 'bg-rose-500 text-white hover:bg-rose-600'
                : 'bg-white/90 backdrop-blur-xs text-[#66736D] hover:text-rose-600 hover:bg-white border border-[#E5E9E6]',
              (isWishlistMutating || wishlistLoading) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
            )}
          >
            {isWishlistMutating ? (
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg
                className="w-4 h-4 stroke-[2]"
                fill={wishlisted ? 'currentColor' : 'none'}
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
                />
              </svg>
            )}
          </button>
        )}
      </a>

      {/* ── Product Information & Action ──────────────────────────────── */}
      <div className="flex flex-col flex-1 p-4">
        {/* Category Chip */}
        {category && (
          <span className="text-[10px] font-bold text-[#123C32] uppercase tracking-wider mb-1">
            {category}
          </span>
        )}

        {/* Product Name */}
        <a
          href={productId ? `/products/${productId}` : '#'}
          className="focus:outline-none focus-visible:underline focus-visible:decoration-[#123C32]"
          tabIndex={-1}
        >
          <h3 className="text-sm font-bold text-[#17201D] line-clamp-2 mb-1.5 group-hover:text-[#123C32] transition-colors leading-snug">
            {name}
          </h3>
        </a>

        {/* Price & Stock */}
        <div className="mt-auto pt-2">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-base sm:text-lg font-black text-[#17201D] tracking-tight">
              {formatPrice(price)}
            </span>
            {isLowStock && !isOutOfStock && (
              <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                Low stock
              </span>
            )}
          </div>

          {/* Add to Cart Button (Primary Forest Green #123C32) */}
          <button
            type="button"
            disabled={isDisabled}
            onClick={handleAddToCart}
            aria-label={
              isOutOfStock
                ? `${name} is out of stock`
                : isAdding
                ? `Adding ${name} to cart`
                : isSuccess
                ? `${name} added to cart`
                : `Add ${name} to cart`
            }
            className={cn(
              'w-full py-2.5 px-3 text-xs sm:text-sm font-bold rounded-xl transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[#123C32] active:scale-[0.98] disabled:cursor-not-allowed',
              isSuccess
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 cursor-default'
                : isOutOfStock
                ? 'bg-[#F2F1EC] text-[#66736D] border border-[#E5E9E6] opacity-60'
                : 'bg-[#123C32] hover:bg-[#0E332B] text-white shadow-xs hover:shadow-md'
            )}
          >
            {isOutOfStock ? (
              'Out of Stock'
            ) : isAdding ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Adding...
              </span>
            ) : isSuccess ? (
              <span className="flex items-center justify-center gap-1.5">
                <svg className="w-4 h-4 stroke-[2.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Added!
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4 stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                </svg>
                Add to Cart
              </span>
            )}
          </button>

          {/* Inline Card Error Notification */}
          {cardError && (
            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center justify-between gap-1.5">
              <span className="truncate">{cardError}</span>
              <button
                type="button"
                onClick={() => setCardError(null)}
                className="text-red-400 hover:text-red-700 font-bold shrink-0"
                aria-label="Dismiss error"
              >
                ×
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
