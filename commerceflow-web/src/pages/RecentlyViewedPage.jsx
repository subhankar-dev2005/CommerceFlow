import { useState, useMemo, useEffect } from 'react';
import { useRecentlyViewed } from '../features/recentlyViewed/useRecentlyViewed.js';
import Container from '../components/Container.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import ProductCard from '../components/ProductCard.jsx';
import Skeleton from '../components/Skeleton.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Button from '../components/Button.jsx';
import WidePromoBanner from '../components/WidePromoBanner.jsx';

export default function RecentlyViewedPage() {
  const { recentlyViewed, isLoading, error, clearRecentlyViewed } = useRecentlyViewed();
  const [isClearing, setIsClearing] = useState(false);
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [actionError, setActionError] = useState(null);

  useEffect(() => {
    if (!showConfirmClear) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isClearing) {
        setShowConfirmClear(false);
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [showConfirmClear, isClearing]);

  const validProducts = useMemo(() => {
    if (!Array.isArray(recentlyViewed)) return [];
    return recentlyViewed
      .map((item) => (item?.product ? item.product : item))
      .filter(
        (product) =>
          product &&
          typeof product === 'object' &&
          (product._id || product.id) &&
          product.isActive !== false
      );
  }, [recentlyViewed]);

  const handleConfirmClear = async () => {
    if (isClearing) return;
    setActionError(null);
    setIsClearing(true);
    try {
      await clearRecentlyViewed();
      setShowConfirmClear(false);
    } catch (err) {
      setActionError(err?.message || 'Failed to clear recently viewed history. Please try again.');
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="py-6 sm:py-10 bg-white min-h-[85vh]">
      <Container>
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Breadcrumbs */}
          <Breadcrumbs
            items={[
              { label: 'Home', href: '/' },
              { label: 'Recently Viewed' },
            ]}
          />

          {/* Page Header Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E5E9E6]">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#F97316]">
                BROWSING HISTORY
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-[#17201D] tracking-tight">
                Recently Viewed Products
              </h1>
              <p className="text-xs sm:text-sm text-[#66736D] mt-1">
                Outdoor gear, camping essentials, and trail equipment you recently explored.
              </p>
            </div>

            {validProducts.length > 0 && !showConfirmClear && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setActionError(null);
                  setShowConfirmClear(true);
                }}
                disabled={isClearing}
                className="rounded-xl text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 self-start sm:self-auto cursor-pointer"
                aria-label="Clear all recently viewed products"
              >
                <svg
                  className="w-4 h-4 mr-1.5 stroke-[2]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                  />
                </svg>
                Clear History
              </Button>
            )}
          </div>

          {/* Action / Mutation Error Notification */}
          {actionError && (
            <div
              role="alert"
              className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs sm:text-sm font-semibold text-rose-800 flex items-center justify-between gap-3 animate-fadeIn"
            >
              <div className="flex items-center gap-2">
                <svg
                  className="w-4 h-4 text-rose-600 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <span>{actionError}</span>
              </div>
              <button
                type="button"
                onClick={() => setActionError(null)}
                className="text-rose-500 hover:text-rose-800 font-bold p-1 text-sm focus:outline-none"
                aria-label="Dismiss error notification"
              >
                &times;
              </button>
            </div>
          )}

          {/* Confirmation Panel for Clear History */}
          {showConfirmClear && (
            <div
              role="alertdialog"
              aria-labelledby="clear-confirm-title"
              aria-describedby="clear-confirm-desc"
              className="p-4 sm:p-5 bg-[#F7F6F1] border border-[#E5E9E6] rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fadeIn"
            >
              <div>
                <h2 id="clear-confirm-title" className="text-sm font-extrabold text-[#17201D]">
                  Clear Browsing History?
                </h2>
                <p id="clear-confirm-desc" className="text-xs text-[#66736D] mt-0.5">
                  This will remove all {validProducts.length} items from your recently viewed history.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowConfirmClear(false)}
                  disabled={isClearing}
                  className="rounded-xl text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleConfirmClear}
                  disabled={isClearing}
                  className="rounded-xl text-xs bg-rose-600 hover:bg-rose-700 text-white border-transparent"
                  aria-label="Confirm clear all browsing history"
                >
                  {isClearing ? 'Clearing...' : 'Confirm Clear'}
                </Button>
              </div>
            </div>
          )}

          {/* Content States */}
          {isLoading && validProducts.length === 0 ? (
            /* Loading Skeleton Grid */
            <div
              className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6"
              role="status"
              aria-label="Loading recently viewed products"
            >
              {Array.from({ length: 8 }).map((_, idx) => (
                <div
                  key={idx}
                  className="rounded-2xl border border-[#E5E9E6] bg-white p-4 space-y-3"
                >
                  <Skeleton className="w-full aspect-[4/3] rounded-xl" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/3" />
                </div>
              ))}
            </div>
          ) : !isLoading && validProducts.length === 0 ? (
            /* Empty State */
            <div className="bg-[#F7F6F1] border border-[#E5E9E6] rounded-3xl p-8 sm:p-12 text-center">
              <EmptyState
                title="No recently viewed products"
                description="You haven't browsed any gear yet. Explore our catalog to find camping, hiking, and outdoor essentials."
                action={
                  <Button
                    as="a"
                    href="/shop"
                    variant="primary"
                    size="sm"
                    className="rounded-xl mt-3 inline-flex"
                  >
                    Explore Catalog
                  </Button>
                }
              />
            </div>
          ) : (
            /* Product Grid */
            <div>
              {error && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                  Some items could not be refreshed from the server. Showing available history.
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
                {validProducts.map((product) => (
                  <ProductCard key={product._id || product.id} product={product} />
                ))}
              </div>
            </div>
          )}

          {/* Bottom Promotional Banner */}
          <div className="mt-12 sm:mt-16">
            <WidePromoBanner
              eyebrow="GEAR UP FOR BETTER DAYS"
              headline="Find Something You'll Love"
              subtext="Explore top-rated camping tents, technical packs, and trail accessories."
              ctaText="Explore Collection"
              ctaLink="/shop"
            />
          </div>
        </div>
      </Container>
    </div>
  );
}
