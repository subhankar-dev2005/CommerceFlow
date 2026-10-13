import { useState, useEffect, useRef, useCallback, useMemo, useContext } from 'react';
import { getProductById } from '../features/products/product.service.js';
import { useProducts } from '../features/products/useProducts.js';
import { useCart } from '../features/cart/useCart.js';
import { useWishlist } from '../features/wishlist/useWishlist.js';
import authContextModule from '../features/auth/auth.context.jsx';
import reviewSummaryModule from '../features/reviews/ReviewSummary.jsx';
import reviewListModule from '../features/reviews/ReviewList.jsx';
import reviewFormModule from '../features/reviews/ReviewForm.jsx';
import ratingStarsModule from '../features/reviews/RatingStars.jsx';
import recentlyViewedContextModule from '../features/recentlyViewed/RecentlyViewedContext.jsx';
import RecentlyViewedSection from '../features/recentlyViewed/RecentlyViewedSection.jsx';
import { formatPrice } from '../lib/utils.js';
import Container from '../components/Container.jsx';
import Badge from '../components/Badge.jsx';
import Button from '../components/Button.jsx';
import Skeleton from '../components/Skeleton.jsx';
import ErrorState from '../components/ErrorState.jsx';
import ProductCard from '../components/ProductCard.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import TrustStrip from '../components/TrustStrip.jsx';
import WidePromoBanner from '../components/WidePromoBanner.jsx';

const AuthContext = authContextModule?.AuthContext || authContextModule?.default || authContextModule;
const ReviewSummary = reviewSummaryModule?.default || reviewSummaryModule;
const ReviewList = reviewListModule?.default || reviewListModule;
const ReviewForm = reviewFormModule?.default || reviewFormModule;
const RatingStars = ratingStarsModule?.default || ratingStarsModule;
const RecentlyViewedContext =
  recentlyViewedContextModule?.RecentlyViewedContext ||
  recentlyViewedContextModule?.default?.RecentlyViewedContext ||
  recentlyViewedContextModule?.default ||
  recentlyViewedContextModule;

function createAbortController() {
  if (typeof window !== 'undefined' && window.AbortController) {
    return new window.AbortController();
  }
  return null;
}

export default function ProductPage({ productId }) {
  const [product, setProduct] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [failedImages, setFailedImages] = useState({});
  const [isAdding, setIsAdding] = useState(false);
  const [cartSuccess, setCartSuccess] = useState(false);
  const [cartError, setCartError] = useState(null);
  const [activeTab, setActiveTab] = useState('description');
  const [showWriteForm, setShowWriteForm] = useState(false);

  const auth = useContext(AuthContext);
  const currentUser = auth?.user || null;
  const isAuthenticated = Boolean(auth?.isAuthenticated && currentUser);

  const { addToCart, isMutating } = useCart();
  const { isWishlisted, toggleWishlist, isLoading: wishlistLoading, isProductMutating } = useWishlist();
  const recentlyViewedCtx = useContext(RecentlyViewedContext);
  const recordedProductIdRef = useRef(null);

  useEffect(() => {
    if (
      productId &&
      product &&
      String(product._id) === String(productId) &&
      !loading &&
      !error &&
      product.isActive !== false &&
      recentlyViewedCtx?.recordRecentlyViewed
    ) {
      if (recordedProductIdRef.current !== String(productId)) {
        recordedProductIdRef.current = String(productId);
        recentlyViewedCtx.recordRecentlyViewed(productId);
      }
    }
  }, [productId, product, loading, error, recentlyViewedCtx]);

  const handleRequireAuth = useCallback(() => {
    if (typeof window !== 'undefined') {
      const currentPath = window.location.pathname + window.location.search;
      window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}`;
    }
  }, []);

  const refreshProductMetrics = useCallback(async () => {
    if (!productId) return;
    try {
      const data = await getProductById(productId);
      if (data) {
        setProduct((prev) => (prev ? { ...prev, ...data } : data));
      }
    } catch {
      // Non-blocking background metrics refresh
    }
  }, [productId]);

  const galleryList = useMemo(() => {
    if (!product) return [];
    const list = [];
    const seen = new Set();

    if (product.image && typeof product.image === 'string' && product.image.trim()) {
      const primaryTrimmed = product.image.trim();
      list.push(primaryTrimmed);
      seen.add(primaryTrimmed);
    }

    if (Array.isArray(product.images)) {
      for (const img of product.images) {
        if (typeof img === 'string' && img.trim()) {
          const trimmed = img.trim();
          if (!seen.has(trimmed)) {
            list.push(trimmed);
            seen.add(trimmed);
          }
        }
      }
    }

    return list;
  }, [product]);

  const activeControllerRef = useRef(null);
  const activeRequestIdRef = useRef(0);

  const fetchProduct = useCallback(async (signal, reqId) => {
    if (!productId) {
      if (reqId === activeRequestIdRef.current) {
        setError(new Error('No product ID specified.'));
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    setError(null);
    setActiveIndex(0);
    setFailedImages({});

    try {
      const data = await getProductById(productId, { signal });
      if (reqId === activeRequestIdRef.current && (!signal || !signal.aborted)) {
        setProduct(data);
        setQuantity(1);
        setLoading(false);
      }
    } catch (err) {
      if (signal?.aborted || err?.name === 'AbortError' || err?.code === 'ABORT_ERROR') {
        return;
      }
      if (reqId === activeRequestIdRef.current) {
        setError(err);
        setLoading(false);
      }
    }
  }, [productId]);

  useEffect(() => {
    if (activeControllerRef.current) {
      activeControllerRef.current.abort();
    }

    const controller = createAbortController();
    activeControllerRef.current = controller;
    const reqId = ++activeRequestIdRef.current;

    fetchProduct(controller?.signal, reqId);

    return () => {
      if (controller) {
        controller.abort();
      }
    };
  }, [productId, fetchProduct]);

  const handleRetry = useCallback(() => {
    if (activeControllerRef.current) {
      activeControllerRef.current.abort();
    }

    const controller = createAbortController();
    activeControllerRef.current = controller;
    const reqId = ++activeRequestIdRef.current;

    fetchProduct(controller?.signal, reqId);
  }, [fetchProduct]);

  // Loading State
  if (loading) {
    return (
      <div className="py-8 sm:py-12 bg-white min-h-[60vh]">
        <Container>
          <div className="mb-6 flex items-center gap-2" aria-hidden="true">
            <Skeleton className="h-4 w-12" />
            <span className="text-[#CDD5CF] text-xs">&rsaquo;</span>
            <Skeleton className="h-4 w-16" />
            <span className="text-[#CDD5CF] text-xs">&rsaquo;</span>
            <Skeleton className="h-4 w-28" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start bg-white rounded-3xl border border-[#E5E9E6] p-6 sm:p-10 shadow-xs">
            <div className="lg:col-span-6 space-y-4">
              <Skeleton className="w-full aspect-square rounded-2xl" />
              <div className="flex gap-3">
                <Skeleton className="w-20 h-20 rounded-xl" />
                <Skeleton className="w-20 h-20 rounded-xl" />
                <Skeleton className="w-20 h-20 rounded-xl" />
              </div>
            </div>
            <div className="lg:col-span-6 space-y-6">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-3/4" />
              <Skeleton className="h-8 w-36" />
              <Skeleton className="h-24 w-full" />
              <div className="flex gap-4">
                <Skeleton className="h-12 w-32 rounded-xl" />
                <Skeleton className="h-12 flex-1 rounded-xl" />
              </div>
            </div>
          </div>
        </Container>
      </div>
    );
  }

  // Error / Not Found State
  if (error || !product) {
    const isNotFound = error?.status === 404 || error?.code === 'PRODUCT_NOT_FOUND';

    return (
      <div className="py-16 sm:py-24 bg-[#F7F6F1]">
        <Container>
          <div className="max-w-md mx-auto flex flex-col items-center text-center bg-white p-8 sm:p-10 rounded-3xl border border-[#E5E9E6] shadow-sm">
            <ErrorState
              title={isNotFound ? 'Product Not Found' : 'Unable to Load Product'}
              description={
                isNotFound
                  ? 'The gear you are looking for does not exist or may have been removed from the outdoor catalog.'
                  : error?.message || 'Please check your connection and try again.'
              }
              onRetry={isNotFound ? undefined : handleRetry}
            />
            <div className="mt-6">
              <Button as="a" href="/shop" variant={isNotFound ? 'primary' : 'secondary'} size="sm">
                Explore Catalog
              </Button>
            </div>
          </div>
        </Container>
      </div>
    );
  }

  const {
    name,
    description,
    price,
    stock = 0,
    category,
  } = product;

  const safeActiveIndex = activeIndex >= 0 && activeIndex < galleryList.length ? activeIndex : 0;
  const activeImageUrl = galleryList[safeActiveIndex] || null;
  const isActiveImageFailed = Boolean(activeImageUrl && failedImages[activeImageUrl]);

  const isOutOfStock = stock <= 0;
  const isLowStock = stock > 0 && stock <= 5;

  const breadcrumbItems = [
    { label: 'Shop', href: '/shop' },
    ...(category ? [{ label: category, href: `/shop?category=${encodeURIComponent(category.trim())}` }] : []),
    { label: name },
  ];

  return (
    <div className="py-6 sm:py-10 bg-white">
      <Container>

        {/* Master Breadcrumbs */}
        <div className="mb-6">
          <Breadcrumbs items={breadcrumbItems} />
        </div>

        {/* Product Details Card */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start bg-white rounded-3xl border border-[#E5E9E6] p-6 sm:p-8 lg:p-10 shadow-xs">

          {/* Gallery Column (Collage style: Thumbnails + Main image) */}
          <div className="lg:col-span-7 flex flex-col-reverse sm:flex-row gap-4 items-start">
            {/* Thumbnail Strip */}
            {galleryList.length > 1 && (
              <div
                role="group"
                aria-label="Product image gallery"
                className="flex sm:flex-col gap-2.5 overflow-x-auto sm:overflow-y-auto max-h-[460px] pb-2 sm:pb-0 scrollbar-thin shrink-0"
              >
                {galleryList.map((imgUrl, index) => {
                  const isSelected = index === safeActiveIndex;
                  const isThumbFailed = Boolean(failedImages[imgUrl]);

                  return (
                    <button
                      key={`${imgUrl}-${index}`}
                      type="button"
                      onClick={() => setActiveIndex(index)}
                      aria-label={`View product image ${index + 1}`}
                      aria-pressed={isSelected}
                      className={`relative shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden border-2 bg-[#F7F6F1] transition-all p-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#123C32] ${
                        isSelected
                          ? 'border-[#123C32] shadow-sm'
                          : 'border-[#E5E9E6] hover:border-[#66736D]/40'
                      }`}
                    >
                      {!isThumbFailed ? (
                        <img
                          src={imgUrl}
                          alt=""
                          loading="lazy"
                          onError={() => setFailedImages((prev) => ({ ...prev, [imgUrl]: true }))}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[#66736D]/40">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Main Stage Image */}
            <div className="relative flex-1 w-full aspect-square rounded-2xl bg-[#F7F6F1] border border-[#E5E9E6] flex items-center justify-center overflow-hidden">
              {activeImageUrl && !isActiveImageFailed ? (
                <img
                  key={activeImageUrl}
                  src={activeImageUrl}
                  alt={`${name}${galleryList.length > 1 ? ` - view ${safeActiveIndex + 1}` : ''}`}
                  fetchPriority="high"
                  decoding="async"
                  onError={() => {
                    if (activeImageUrl) {
                      setFailedImages((prev) => ({ ...prev, [activeImageUrl]: true }));
                    }
                  }}
                  className="w-full h-full object-contain p-8 transition-transform duration-300 hover:scale-105"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-[#66736D]/40 p-12 text-center">
                  <svg className="w-20 h-20 stroke-[1.2] mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                  </svg>
                  <span className="text-xs font-medium text-[#66736D]">Outdoor Gear Visual</span>
                </div>
              )}

              {/* Status Badge in corner */}
              <div className="absolute top-4 left-4">
                {isOutOfStock ? (
                  <Badge variant="danger" size="md">Out of Stock</Badge>
                ) : isLowStock ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#F97316]/10 text-[#F97316] border border-[#F97316]/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#F97316]" />
                    Only {stock} left
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#EEF5F1] text-[#123C32] border border-[#123C32]/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#123C32]" />
                    In Stock
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Product Info & Actions Column */}
          <div className="lg:col-span-5 space-y-6">

            {/* Category Eyebrow & Title */}
            <div>
              {category && (
                <a
                  href={`/shop?category=${encodeURIComponent(category.trim())}`}
                  className="inline-block text-xs font-bold text-[#F97316] uppercase tracking-wider hover:underline focus:outline-none focus-visible:underline mb-1"
                >
                  {category}
                </a>
              )}
              <h1 className="text-2xl sm:text-3xl font-extrabold text-[#17201D] leading-snug">
                {name}
              </h1>

              {/* Product Rating Header / Quick Metric */}
              <div className="flex items-center gap-2.5 mt-2">
                <RatingStars
                  rating={product.ratingAverage || 0}
                  readOnly={true}
                  size="sm"
                />
                {product.ratingCount > 0 ? (
                  <>
                    <span className="text-xs font-bold text-[#17201D]">
                      {Number(product.ratingAverage || 0).toFixed(1)}
                    </span>
                    <a
                      href="#customer-reviews"
                      className="text-xs font-semibold text-[#66736D] hover:text-[#123C32] hover:underline transition-colors"
                    >
                      ({product.ratingCount} {product.ratingCount === 1 ? 'review' : 'reviews'})
                    </a>
                  </>
                ) : (
                  <a
                    href="#customer-reviews"
                    className="text-xs font-medium text-[#66736D] hover:text-[#123C32] hover:underline transition-colors"
                  >
                    No customer reviews yet
                  </a>
                )}
              </div>
            </div>

            {/* Price Block */}
            <div className="py-4 border-y border-[#E5E9E6]">
              <div className="flex items-baseline gap-3">
                <span className="text-3xl sm:text-4xl font-extrabold text-[#123C32] tracking-tight">
                  {formatPrice(price)}
                </span>
              </div>
              <span className="text-xs text-[#66736D] mt-1 block">Taxes calculated at checkout • Official gear guarantee</span>
            </div>

            {/* Short Description */}
            <div>
              <p className="text-sm text-[#66736D] leading-relaxed">
                {description || 'High-performance outdoor equipment crafted for durability and comfort on every expedition.'}
              </p>
            </div>

            {/* Quantity Selector & Action Buttons */}
            <div className="space-y-4 pt-1">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                {/* Quantity Controls */}
                <div
                  role="group"
                  aria-label="Product quantity"
                  className="flex items-center justify-between sm:justify-start border border-[#E5E9E6] rounded-2xl bg-[#F7F6F1] overflow-hidden shrink-0"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setQuantity((q) => Math.max(1, q - 1));
                      setCartSuccess(false);
                      setCartError(null);
                    }}
                    disabled={isOutOfStock || quantity <= 1 || isAdding || isMutating}
                    aria-label={`Decrease quantity of ${name}`}
                    className="w-11 h-11 flex items-center justify-center text-[#17201D] hover:bg-[#E5E9E6] disabled:opacity-30 transition-colors focus:outline-none text-base font-semibold"
                  >
                    -
                  </button>
                  <span
                    className="px-4 py-2 text-sm font-bold text-[#17201D] select-none text-center min-w-[40px]"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    {quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setQuantity((q) => Math.min(stock, q + 1));
                      setCartSuccess(false);
                      setCartError(null);
                    }}
                    disabled={isOutOfStock || quantity >= stock || isAdding || isMutating}
                    aria-label={`Increase quantity of ${name}`}
                    className="w-11 h-11 flex items-center justify-center text-[#17201D] hover:bg-[#E5E9E6] disabled:opacity-30 transition-colors focus:outline-none text-base font-semibold"
                  >
                    +
                  </button>
                </div>

                {/* Add to Cart Button */}
                <Button
                  type="button"
                  variant={isOutOfStock ? 'secondary' : 'primary'}
                  size="lg"
                  disabled={isOutOfStock || isAdding || isMutating}
                  onClick={async () => {
                    if (isOutOfStock || isAdding || isMutating) return;

                    setCartError(null);
                    setIsAdding(true);

                    try {
                      const qty = Math.min(Math.max(1, quantity), stock);
                      await addToCart(product._id, qty);
                      setCartSuccess(true);
                    } catch (err) {
                      let msg = 'Failed to add item to cart. Please try again.';
                      if (err?.code === 'INSUFFICIENT_STOCK') {
                        msg = 'The requested quantity is no longer available in stock.';
                      } else if (err?.code === 'PRODUCT_NOT_FOUND') {
                        msg = 'This product is no longer available in our catalog.';
                      } else if (err?.message) {
                        msg = err.message;
                      }
                      setCartError(msg);
                    } finally {
                      setIsAdding(false);
                    }
                  }}
                  className="flex-1 justify-center rounded-2xl shadow-sm"
                  aria-label={
                    isOutOfStock
                      ? `${name} is currently out of stock`
                      : isAdding
                      ? `Adding ${quantity} of ${name} to cart`
                      : `Add ${quantity} of ${name} to cart`
                  }
                >
                  {isOutOfStock ? (
                    'Currently Unavailable'
                  ) : isAdding ? (
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Adding to Cart...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4 stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                      </svg>
                      Add to Cart
                    </span>
                  )}
                </Button>

                {/* Wishlist toggle button */}
                {(() => {
                  const pid = product?._id ? String(product._id) : '';
                  const wlisted = pid ? isWishlisted(pid) : false;
                  const wlMutating = pid ? isProductMutating(pid) : false;
                  const wlDisabled = wlMutating || wishlistLoading;
                  return (
                    <button
                      type="button"
                      onClick={async () => {
                        if (wlDisabled || !pid) return;
                        await toggleWishlist(product);
                      }}
                      disabled={wlDisabled}
                      aria-label={wlisted ? `Remove ${name} from wishlist` : `Add ${name} to wishlist`}
                      aria-pressed={wlisted}
                      className={`shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center border-2 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#123C32] ${
                        wlisted
                          ? 'border-[#F97316] bg-[#F97316]/10 text-[#F97316]'
                          : 'border-[#E5E9E6] bg-white text-[#66736D] hover:border-[#123C32] hover:text-[#123C32]'
                      } ${wlDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      {wlMutating ? (
                        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        <svg
                          className="w-5 h-5 stroke-[2]"
                          fill={wlisted ? 'currentColor' : 'none'}
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
                  );
                })()}
              </div>

              {/* Success Notification Banner */}
              {cartSuccess && (
                <div className="p-4 bg-[#EEF5F1] border border-[#123C32]/20 rounded-2xl text-[#123C32] space-y-2 animate-fadeIn">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-[#123C32] text-white flex items-center justify-center shrink-0">
                        <svg className="w-3 h-3 stroke-[3]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      </span>
                      <p className="text-xs font-bold">
                        Added {quantity} {quantity === 1 ? 'item' : 'items'} to your cart!
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCartSuccess(false)}
                      className="text-[#123C32] hover:text-[#0E332B] font-bold p-1 text-sm focus:outline-none"
                      aria-label="Dismiss success message"
                    >
                      &times;
                    </button>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Button as="a" href="/cart" variant="primary" size="sm" className="rounded-xl text-xs py-1.5">
                      View Cart
                    </Button>
                    <Button as="a" href="/shop" variant="secondary" size="sm" className="rounded-xl text-xs py-1.5">
                      Continue Shopping
                    </Button>
                  </div>
                </div>
              )}

              {/* Error Banner */}
              {cartError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-center justify-between gap-3 animate-fadeIn">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-rose-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>{cartError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCartError(null)}
                    className="text-rose-500 hover:text-rose-800 font-bold p-1 shrink-0 focus:outline-none"
                    aria-label="Dismiss error"
                  >
                    &times;
                  </button>
                </div>
              )}
            </div>

            {/* Compact Trust Strip directly below purchase block */}
            <div className="pt-2">
              <TrustStrip compact={true} />
            </div>

          </div>

        </div>

        {/* Tabbed Content & Promotional Banner Section */}
        <div className="mt-12 sm:mt-16 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

          {/* Tabs Container (Description, Specifications, Shipping) */}
          <div className="lg:col-span-8 bg-white rounded-3xl border border-[#E5E9E6] p-6 sm:p-8">
            <div className="border-b border-[#E5E9E6] flex gap-6 sm:gap-8 overflow-x-auto scrollbar-hide">
              <button
                type="button"
                onClick={() => setActiveTab('description')}
                className={`pb-3 text-sm font-bold transition-colors relative whitespace-nowrap ${
                  activeTab === 'description'
                    ? 'text-[#123C32]'
                    : 'text-[#66736D] hover:text-[#17201D]'
                }`}
              >
                Description
                {activeTab === 'description' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#123C32] rounded-full" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('specifications')}
                className={`pb-3 text-sm font-bold transition-colors relative whitespace-nowrap ${
                  activeTab === 'specifications'
                    ? 'text-[#123C32]'
                    : 'text-[#66736D] hover:text-[#17201D]'
                }`}
              >
                Specifications
                {activeTab === 'specifications' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#123C32] rounded-full" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('shipping')}
                className={`pb-3 text-sm font-bold transition-colors relative whitespace-nowrap ${
                  activeTab === 'shipping'
                    ? 'text-[#123C32]'
                    : 'text-[#66736D] hover:text-[#17201D]'
                }`}
              >
                Shipping & Returns
                {activeTab === 'shipping' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#123C32] rounded-full" />
                )}
              </button>
            </div>

            <div className="pt-6">
              {activeTab === 'description' && (
                <div className="space-y-4 text-sm text-[#66736D] leading-relaxed">
                  <p>{description || 'Built for true adventurers who demand durability, lightweight performance, and reliable weather protection. Rigorously tested in diverse outdoor terrains.'}</p>
                  <ul className="space-y-2 pt-2">
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#123C32]" />
                      <span>Waterproof & wind-resistant engineering</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#123C32]" />
                      <span>Lightweight and packable for trail mobility</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#123C32]" />
                      <span>High-tensile hardware and reinforced stitching</span>
                    </li>
                  </ul>
                </div>
              )}

              {activeTab === 'specifications' && (
                <div>
                  {Array.isArray(product.specifications) && product.specifications.length > 0 ? (
                    <dl className="divide-y divide-[#E5E9E6]">
                      {product.specifications.map((spec, index) => (
                        <div key={index} className="grid grid-cols-1 sm:grid-cols-3 gap-1 py-3 text-xs sm:text-sm">
                          <dt className="font-bold text-[#17201D]">{spec.label}</dt>
                          <dd className="text-[#66736D] sm:col-span-2">{spec.value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="text-sm text-[#66736D]">Standard outdoor grade materials and manufacturer specifications apply.</p>
                  )}
                </div>
              )}

              {activeTab === 'shipping' && (
                <div className="space-y-3 text-sm text-[#66736D]">
                  <p className="font-bold text-[#17201D]">Fast Fulfillment & Dispatch</p>
                  <p>All orders are processed and prepared within 24–48 hours from our outdoor distribution centers. Track real-time shipment updates directly in your account.</p>
                  <p className="font-bold text-[#17201D] pt-2">30-Day Hassle-Free Returns</p>
                  <p>If your gear does not meet expectations in the field, return it within 30 days in its original condition for a seamless refund.</p>
                </div>
              )}
            </div>
          </div>

          {/* Master "Built for Real Adventures" Collage Card */}
          <div className="lg:col-span-4 rounded-3xl overflow-hidden relative min-h-[280px] bg-[#123C32] text-white p-6 sm:p-8 flex flex-col justify-between shadow-sm">
            <div
              className="absolute inset-0 bg-cover bg-center opacity-30 mix-blend-overlay"
              style={{
                backgroundImage: 'url("https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=800&q=80")',
              }}
            />
            <div className="relative z-10">
              <span className="text-xs font-bold uppercase tracking-widest text-[#F97316]">
                COMMERCEFLOW LABS
              </span>
              <h3 className="text-xl sm:text-2xl font-extrabold mt-1">
                Built for Real Adventures
              </h3>
              <p className="text-xs text-white/80 mt-2 leading-relaxed">
                Field-tested equipment engineered to endure challenging weather and trail conditions.
              </p>
            </div>

            <div className="relative z-10 pt-6 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-xs flex items-center justify-center text-white">
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
                <span className="text-xs font-bold">Watch Field Test</span>
              </div>
              <a
                href="/shop"
                className="text-xs font-bold text-[#F97316] hover:text-white transition-colors"
              >
                Learn More &rarr;
              </a>
            </div>
          </div>

        </div>

        {/* Customer Reviews & Ratings Section */}
        <section
          id="customer-reviews"
          aria-labelledby="customer-reviews-heading"
          className="mt-12 sm:mt-16 pt-10 sm:pt-12 border-t border-[#E5E9E6]"
        >
          <div className="space-y-8">
            {/* Header & Write Review Action */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#F97316]">
                  COMMUNITY FEEDBACK
                </span>
                <h2
                  id="customer-reviews-heading"
                  className="text-xl sm:text-2xl font-extrabold text-[#17201D]"
                >
                  Customer Reviews
                </h2>
              </div>

              {!showWriteForm && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    if (!isAuthenticated) {
                      handleRequireAuth();
                      return;
                    }
                    setShowWriteForm(true);
                  }}
                  className="rounded-xl font-bold cursor-pointer"
                >
                  Write a Review
                </Button>
              )}
            </div>

            {/* Server-Authoritative Product Rating Summary Card */}
            <ReviewSummary
              ratingAverage={product.ratingAverage}
              ratingCount={product.ratingCount}
            />

            {/* Create Review Form (Collapsible Panel) */}
            {showWriteForm && (
              <div className="bg-[#F7F6F1] border border-[#E5E9E6] rounded-3xl p-6 sm:p-8 animate-in fade-in">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-[#17201D]">Write a Verified Customer Review</h3>
                  <button
                    type="button"
                    onClick={() => setShowWriteForm(false)}
                    className="text-sm font-semibold text-[#66736D] hover:text-[#17201D] p-1 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
                <ReviewForm
                  productId={product._id}
                  isAuthenticated={isAuthenticated}
                  onSuccess={() => {
                    setShowWriteForm(false);
                    refreshProductMetrics();
                  }}
                  onCancel={() => setShowWriteForm(false)}
                  onRequireAuth={handleRequireAuth}
                />
              </div>
            )}

            {/* Review List Orchestrator */}
            <ReviewList
              productId={product._id}
              currentUser={currentUser}
              onRequireAuth={handleRequireAuth}
              onReviewMutated={refreshProductMetrics}
            />
          </div>
        </section>

        {/* You May Also Like / Related Products Section */}
        {category && category.trim() !== '' && (
          <RelatedProducts currentProductId={product._id} category={category.trim()} />
        )}

        {/* Recently Viewed Products Section */}
        <RecentlyViewedSection currentProductId={product._id} />

        {/* Bottom Storefront Wide Promotional Banner */}
        <div className="mt-12 sm:mt-16">
          <WidePromoBanner
            eyebrow="READY FOR THE SUMMIT?"
            headline="Find Something You'll Love"
            subtext="Explore more outdoor gear, camping accessories, and trail essentials."
            ctaText="Explore Collection"
            ctaLink="/shop"
          />
        </div>

      </Container>
    </div>
  );
}

/**
 * Related Products Section
 * Fetches items from the same category, filters out current product, displays up to 4 items in standard ProductCard
 */
function RelatedProducts({ currentProductId, category }) {
  const queryParams = useMemo(() => ({
    category,
    page: 1,
    limit: 5,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  }), [category]);

  const { products, loading, error } = useProducts(queryParams);

  const relatedProducts = useMemo(() => {
    if (!products || !Array.isArray(products)) return [];
    return products
      .filter((p) => String(p._id) !== String(currentProductId))
      .slice(0, 4);
  }, [products, currentProductId]);

  if (error || (!loading && relatedProducts.length === 0)) {
    return null;
  }

  if (loading) {
    return (
      <section
        aria-labelledby="related-products-heading"
        className="mt-12 sm:mt-16 pt-10 sm:pt-12 border-t border-[#E5E9E6]"
      >
        <div className="mb-6 sm:mb-8">
          <h2
            id="related-products-heading"
            className="text-xl sm:text-2xl font-extrabold text-[#17201D]"
          >
            You May Also Like
          </h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className={`rounded-3xl border border-[#E5E9E6] bg-white p-4 space-y-3 ${
                index >= 2 ? 'hidden sm:block' : ''
              }`}
            >
              <Skeleton className="w-full aspect-square rounded-2xl" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="related-products-heading"
      className="mt-12 sm:mt-16 pt-10 sm:pt-12 border-t border-[#E5E9E6]"
    >
      <div className="mb-6 sm:mb-8 flex items-center justify-between">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-[#F97316]">
            RECOMMENDED GEAR
          </span>
          <h2
            id="related-products-heading"
            className="text-xl sm:text-2xl font-extrabold text-[#17201D]"
          >
            You May Also Like
          </h2>
        </div>
        <a
          href={`/shop?category=${encodeURIComponent(category)}`}
          className="text-xs font-bold text-[#123C32] hover:text-[#F97316] transition-colors"
        >
          View Category &rarr;
        </a>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {relatedProducts.map((relProduct) => (
          <ProductCard key={relProduct._id} product={relProduct} />
        ))}
      </div>
    </section>
  );
}

ProductPage.RecentlyViewedContext = RecentlyViewedContext;
