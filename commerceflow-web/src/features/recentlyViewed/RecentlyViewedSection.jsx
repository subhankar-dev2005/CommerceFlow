import { useMemo, useContext } from 'react';
import recentlyViewedContextModule from './RecentlyViewedContext.jsx';
import productCardModule from '../../components/ProductCard.jsx';
import skeletonModule from '../../components/Skeleton.jsx';

const RecentlyViewedContext =
  recentlyViewedContextModule?.RecentlyViewedContext ||
  recentlyViewedContextModule?.default?.RecentlyViewedContext ||
  recentlyViewedContextModule?.default ||
  recentlyViewedContextModule;
const ProductCard = productCardModule?.default || productCardModule;
const Skeleton = skeletonModule?.default || skeletonModule;

/**
 * Reusable Recently Viewed storefront section.
 * Displays a responsive grid of recently viewed products, excluding the current active product.
 * Returns null if empty or on error (non-critical enhancement).
 */
export default function RecentlyViewedSection({
  currentProductId,
  title = 'Recently Viewed',
  limit = 4,
  className = '',
}) {
  const context = useContext(RecentlyViewedContext);

  const recentlyViewed = context?.recentlyViewed;
  const isLoading = Boolean(context?.isLoading);
  const error = context?.error || null;

  // Filter items: exclude current product, inactive products, and limit to row size
  const displayedProducts = useMemo(() => {
    if (!Array.isArray(recentlyViewed)) return [];
    return recentlyViewed
      .map((item) => (item?.product ? item.product : item))
      .filter((product) => {
        if (!product || typeof product !== 'object') return false;
        const pid = String(product._id || product.id || '');
        if (!pid) return false;
        if (currentProductId && pid === String(currentProductId)) return false;
        if (product.isActive === false) return false;
        return true;
      })
      .slice(0, limit);
  }, [recentlyViewed, currentProductId, limit]);

  // Loading skeleton state
  if (isLoading && displayedProducts.length === 0) {
    return (
      <section
        aria-labelledby="recently-viewed-heading"
        className={`mt-12 sm:mt-16 pt-10 sm:pt-12 border-t border-[#E5E9E6] ${className}`}
      >
        <div className="mb-6 sm:mb-8">
          <Skeleton className="h-4 w-32 mb-2" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {Array.from({ length: limit }).map((_, idx) => (
            <div
              key={idx}
              className={`rounded-2xl border border-[#E5E9E6] bg-white p-4 space-y-3 ${
                idx >= 2 ? 'hidden sm:block' : ''
              }`}
            >
              <Skeleton className="w-full aspect-[4/3] rounded-xl" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  // Non-critical: If error occurs or no items remain, render nothing (no empty cards / placeholders)
  if (error || displayedProducts.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="recently-viewed-heading"
      className={`mt-12 sm:mt-16 pt-10 sm:pt-12 border-t border-[#E5E9E6] ${className}`}
    >
      <div className="mb-6 sm:mb-8 flex items-center justify-between">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-[#F97316]">
            YOUR BROWSING HISTORY
          </span>
          <h2
            id="recently-viewed-heading"
            className="text-xl sm:text-2xl font-extrabold text-[#17201D]"
          >
            {title}
          </h2>
        </div>
        <a
          href="/recently-viewed"
          className="text-xs font-bold text-[#123C32] hover:text-[#F97316] transition-colors"
        >
          View All &rarr;
        </a>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {displayedProducts.map((product) => (
          <ProductCard key={product._id || product.id} product={product} />
        ))}
      </div>
    </section>
  );
}

RecentlyViewedSection.RecentlyViewedContext = RecentlyViewedContext;
