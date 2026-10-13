import Container from './Container.jsx';
import { cn } from '../lib/utils.js';

/**
 * Reusable Wide Outdoor Banner
 * Used at the bottom of Shop, Product, Cart, Wishlist, and Account pages.
 */
export default function WidePromoBanner({
  title = "Find Something You'll Love",
  subtitle = 'Explore more outdoor gear and essentials crafted for every trail and camp.',
  ctaText = 'Shop Now',
  ctaHref = '/shop',
  bgImage = 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1600&q=80',
  badgeText = 'OUTDOOR GEAR',
  className = '',
}) {
  return (
    <section aria-label="Promotional collection" className={cn('w-full', className)}>
      <Container>
        <div className="relative overflow-hidden rounded-3xl bg-[#0E332B] min-h-[180px] sm:min-h-[220px] flex items-center justify-between p-6 sm:p-10 lg:p-12 shadow-md">

          {/* Background image & gradient overlay */}
          <div className="absolute inset-0 z-0">
            <img
              src={bgImage}
              alt=""
              className="w-full h-full object-cover object-center brightness-[0.70]"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0E332B]/95 via-[#0E332B]/75 to-transparent" />
          </div>

          {/* Left Content */}
          <div className="relative z-10 max-w-lg">
            {badgeText && (
              <span className="inline-block text-[10px] sm:text-xs font-black uppercase tracking-widest text-[#F97316] mb-1.5 sm:mb-2">
                {badgeText}
              </span>
            )}
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-black text-white tracking-tight leading-tight">
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs sm:text-sm text-[#d5e8dd] mt-1.5 leading-relaxed max-w-md">
                {subtitle}
              </p>
            )}
          </div>

          {/* Right Action */}
          <div className="relative z-10 shrink-0 hidden sm:block">
            <a
              href={ctaHref}
              className="inline-flex items-center gap-2 px-6 py-3.5 bg-[#F97316] hover:bg-[#FF7A1A] text-white text-sm font-bold rounded-2xl shadow-lg transition-all duration-150 transform active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <span>{ctaText}</span>
              <svg className="w-4 h-4 stroke-[2.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </a>
          </div>

        </div>
      </Container>
    </section>
  );
}
