import Container from '../components/Container.jsx';
import SectionHeading from '../components/SectionHeading.jsx';
import ProductCard from '../components/ProductCard.jsx';
import Skeleton from '../components/Skeleton.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ErrorState from '../components/ErrorState.jsx';
import StorefrontHero from '../components/StorefrontHero.jsx';
import CategoryQuickLinks from '../components/CategoryQuickLinks.jsx';
import TrustStrip from '../components/TrustStrip.jsx';
import PromoGrid from '../components/PromoGrid.jsx';
import CouponBanner from '../components/CouponBanner.jsx';
import WidePromoBanner from '../components/WidePromoBanner.jsx';
import { useProducts } from '../features/products/useProducts.js';
import { useCategories } from '../features/products/useCategories.js';

/* ─── Product Section Component ──────────────────────────────────────────── */
function ProductSection({ title, badge, products, loading, error, onRetry, viewAllHref = '/shop' }) {
  return (
    <section aria-labelledby={`section-${badge || title}`} className="w-full">
      <Container>
        <SectionHeading
          id={`section-${badge || title}`}
          badge={badge}
          title={title}
          action={
            <a
              href={viewAllHref}
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-[#123C32] hover:text-[#0E332B] transition-colors focus:outline-none focus-visible:underline"
            >
              <span>View All</span>
              <svg className="w-4 h-4 stroke-[2.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </a>
          }
        />

        {error ? (
          <ErrorState
            title="Unable to load products"
            description="Please check your connection and try again."
            onRetry={onRetry}
          />
        ) : loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-[#E5E9E6] overflow-hidden">
                <Skeleton className="w-full aspect-[4/3]" />
                <div className="p-4 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-9 w-full mt-3 rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <EmptyState
            title="No products available right now"
            description="Check back soon as we update our outdoor gear catalog."
            action={
              <a
                href="/shop"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#123C32] hover:bg-[#0E332B] text-white font-semibold rounded-xl text-sm transition-colors"
              >
                Browse All Products
              </a>
            }
          />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {products.map((product) => (
              <ProductCard key={product._id} product={product} />
            ))}
          </div>
        )}
      </Container>
    </section>
  );
}

/* ─── HomePage Component ─────────────────────────────────────────────────── */
export default function HomePage() {
  const {
    products: allProducts,
    loading: productsLoading,
    error: productsError,
    refetch: refetchProducts,
  } = useProducts({ limit: 12, sortBy: 'createdAt', sortOrder: 'desc' });

  const {
    categories,
    loading: categoriesLoading,
  } = useCategories();

  const trendingProducts = allProducts.slice(0, 5);
  const featuredProducts = allProducts.slice(5, 10);

  return (
    <div className="flex flex-col gap-10 sm:gap-14 pb-16 sm:pb-24">
      {/* 4. Hero Banner */}
      <StorefrontHero />

      {/* 5. Category Quick Links */}
      <CategoryQuickLinks
        categories={categories}
        loading={categoriesLoading}
      />

      {/* 6. Trust Strip */}
      <TrustStrip />

      {/* 7. Featured Promotional Grid */}
      <PromoGrid categories={categories} />

      {/* 8. Trending Products */}
      <ProductSection
        title="Trending Products"
        badge="POPULAR NOW"
        products={trendingProducts}
        loading={productsLoading}
        error={productsError}
        onRetry={refetchProducts}
      />

      {/* 9. Best Sellers / Featured Products */}
      {featuredProducts.length > 0 && (
        <ProductSection
          title="Featured Gear"
          badge="TOP RATED"
          products={featuredProducts}
          loading={productsLoading}
          error={productsError}
          onRetry={refetchProducts}
        />
      )}

      {/* 10. Coupon Banner */}
      <CouponBanner />

      {/* 11. Additional Wide Promotional Banner */}
      <WidePromoBanner
        title="Ready for Your Next Summit?"
        subtitle="Discover premium weather-sealed gear engineered for peak endurance and outdoor reliability."
        ctaText="Shop Outdoor Gear"
        ctaHref="/shop"
        badgeText="FIELD TESTED"
      />
    </div>
  );
}
