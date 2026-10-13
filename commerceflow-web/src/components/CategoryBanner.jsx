import Container from './Container.jsx';
import { cn } from '../lib/utils.js';

/**
 * CategoryBanner / SectionBanner Component
 * Renders consistent, cinematic outdoor banners for Shop, Category, and Search pages.
 */
export default function CategoryBanner({
  title = 'Shop Outdoor Gear',
  subtitle = 'Explore premium equipment for your next adventure.',
  eyebrow = 'COMMERCEFLOW COLLECTION',
  ctaText = 'Explore Collection',
  ctaHref = '/shop',
  bgImage = 'https://images.unsplash.com/photo-1478131143081-80f7f84ca84d?auto=format&fit=crop&w=1600&q=80',
  compact = false,
  className = '',
}) {
  return (
    <div className={cn('w-full relative', className)}>
      <Container>
        <div
          className={cn(
            'relative overflow-hidden rounded-3xl bg-[#0E332B] flex items-center shadow-md',
            compact ? 'min-h-[160px] sm:min-h-[190px]' : 'min-h-[220px] sm:min-h-[260px]'
          )}
        >
          {/* Background image & cinematic overlay */}
          <div className="absolute inset-0 z-0">
            <img
              src={bgImage}
              alt=""
              className="w-full h-full object-cover object-center brightness-[0.75]"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0E332B]/95 via-[#0E332B]/75 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0E332B]/60 to-transparent" />
          </div>

          {/* Banner content */}
          <div className="relative z-10 p-6 sm:p-10 lg:p-12 max-w-xl">
            {eyebrow && (
              <span className="text-[10px] sm:text-xs font-bold text-[#F97316] tracking-widest uppercase block mb-1.5 sm:mb-2">
                {eyebrow}
              </span>
            )}
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight leading-tight mb-2">
              {title}
            </h1>
            {subtitle && (
              <p className="text-xs sm:text-sm text-[#d5e8dd] max-w-md leading-relaxed mb-4">
                {subtitle}
              </p>
            )}
            {ctaText && ctaHref && !compact && (
              <a
                href={ctaHref}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#F97316] hover:bg-[#FF7A1A] text-white text-xs sm:text-sm font-bold rounded-xl shadow-md transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-white active:scale-[0.98]"
              >
                <span>{ctaText}</span>
                <svg className="w-3.5 h-3.5 stroke-[2.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </a>
            )}
          </div>
        </div>
      </Container>
    </div>
  );
}

export { CategoryBanner as SectionBanner };
