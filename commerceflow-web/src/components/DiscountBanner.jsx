import { cn } from '../lib/utils.js';

/**
 * Reusable DiscountBanner Component
 * Visual presentation matches reference sticker badge / banner system.
 * Only displays truthful discount data when provided, or truthful seasonal callout.
 */
export default function DiscountBanner({
  discountLabel,
  title = 'Seasonal Outdoor Savings',
  subtitle = 'Find quality camping and hiking essentials at special pricing.',
  ctaText = 'Shop Deals',
  ctaHref = '/shop?sortBy=price&sortOrder=asc',
  className = '',
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#123C32] to-[#0E332B] p-4 sm:p-5 border border-[#17483B] flex items-center justify-between gap-4 text-white shadow-xs',
        className
      )}
    >
      <div className="flex items-center gap-3.5">
        {discountLabel ? (
          <span className="shrink-0 px-3 py-1 rounded-xl bg-[#F97316] text-white text-xs font-black uppercase tracking-wider shadow-xs">
            {discountLabel}
          </span>
        ) : (
          <span className="shrink-0 w-8 h-8 rounded-xl bg-[#F97316] text-white flex items-center justify-center font-bold text-xs">
            %
          </span>
        )}

        <div>
          <span className="text-xs sm:text-sm font-bold block">{title}</span>
          {subtitle && <span className="text-[11px] sm:text-xs text-[#aed1bc]">{subtitle}</span>}
        </div>
      </div>

      {ctaText && (
        <a
          href={ctaHref}
          className="shrink-0 text-xs font-bold text-[#F97316] hover:text-[#FF7A1A] flex items-center gap-1 transition-colors"
        >
          <span>{ctaText}</span>
          <svg className="w-3.5 h-3.5 stroke-[2.2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </a>
      )}
    </div>
  );
}
