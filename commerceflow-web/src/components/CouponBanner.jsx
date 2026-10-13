import Container from './Container.jsx';
import { cn } from '../lib/utils.js';

/**
 * Master Coupon Banner System
 * Reusable across Home, Cart, and Account pages.
 */
export default function CouponBanner({
  title = 'Save More with Coupons',
  subtitle = 'Get exclusive discounts and seasonal promotions on your favorite outdoor gear.',
  ctaText = 'View Coupons',
  ctaHref = '/shop?sortBy=price&sortOrder=asc',
  className = '',
}) {
  return (
    <section aria-labelledby="coupon-banner-heading" className={cn('w-full', className)}>
      <Container>
        <div className="relative overflow-hidden rounded-3xl bg-[#123C32] border border-[#17483B] p-6 sm:p-8 lg:p-10 flex flex-col md:flex-row items-center justify-between gap-6 shadow-md">

          {/* Subtle outdoor topographic decorative lines */}
          <div className="absolute inset-0 opacity-10 pointer-events-none" aria-hidden="true">
            <svg className="w-full h-full" viewBox="0 0 800 300" fill="none">
              <path d="M0 100 Q 200 40 400 120 T 800 80" stroke="white" strokeWidth="2" />
              <path d="M0 160 Q 250 80 500 180 T 800 140" stroke="white" strokeWidth="2" />
              <path d="M0 220 Q 150 160 350 240 T 800 200" stroke="white" strokeWidth="2" />
            </svg>
          </div>

          {/* Left: Graphic Coupon Ticket + Text */}
          <div className="flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-4 sm:gap-6 relative z-10">
            {/* Orange Coupon Badge / Ticket Icon */}
            <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-2xl bg-[#F97316] text-white flex flex-col items-center justify-center shrink-0 shadow-lg border-2 border-dashed border-white/60 transform -rotate-3">
              <svg className="w-7 h-7 stroke-[2.2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z" />
              </svg>
              <span className="text-[9px] font-black tracking-widest uppercase mt-0.5">OFFERS</span>
            </div>

            <div>
              <span className="inline-block text-[11px] font-extrabold uppercase tracking-widest text-[#F97316] mb-1">
                SPECIAL SAVINGS
              </span>
              <h2
                id="coupon-banner-heading"
                className="text-xl sm:text-2xl lg:text-3xl font-black text-white tracking-tight leading-tight"
              >
                {title}
              </h2>
              <p className="text-xs sm:text-sm text-[#d5e8dd] mt-1.5 max-w-lg leading-relaxed">
                {subtitle}
              </p>
            </div>
          </div>

          {/* Right: Orange CTA Button */}
          <div className="relative z-10 shrink-0">
            <a
              href={ctaHref}
              className="inline-flex items-center gap-2 px-6 sm:px-7 py-3 sm:py-3.5 bg-[#F97316] hover:bg-[#FF7A1A] text-white text-sm font-bold rounded-2xl shadow-lg transition-all duration-150 transform active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
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
