import { cn } from '../lib/utils.js';

/**
 * Reusable PromoTile Component
 * Handles large showcase tiles as well as compact category promotional tiles.
 */
export default function PromoTile({
  eyebrow,
  title,
  description,
  cta = 'Shop Now',
  href = '/shop',
  image,
  size = 'standard', // 'large' | 'standard'
  className = '',
}) {
  const isLarge = size === 'large';

  return (
    <a
      href={href}
      className={cn(
        'group relative overflow-hidden rounded-3xl bg-[#0E332B] flex flex-col justify-end transition-all duration-300 shadow-sm hover:shadow-xl hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#123C32]',
        isLarge
          ? 'min-h-[380px] lg:min-h-[440px] p-7 sm:p-9'
          : 'min-h-[190px] sm:min-h-[210px] p-5 sm:p-6',
        className
      )}
    >
      {/* Background image & gradient overlay */}
      {image && (
        <div className="absolute inset-0 z-0 overflow-hidden">
          <img
            src={image}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500 brightness-[0.78]"
          />
        </div>
      )}

      {/* Atmospheric dark green gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0E332B] via-[#0E332B]/60 to-transparent z-1" />

      {/* Content */}
      <div className="relative z-10">
        {eyebrow && (
          <span className="inline-block text-[10px] sm:text-xs font-black tracking-widest text-[#F97316] uppercase mb-1.5 sm:mb-2">
            {eyebrow}
          </span>
        )}

        <h3
          className={cn(
            'font-black text-white leading-tight tracking-tight mb-1 group-hover:text-[#F7F6F1] transition-colors',
            isLarge ? 'text-2xl sm:text-3xl' : 'text-lg sm:text-xl'
          )}
        >
          {title}
        </h3>

        {description && (
          <p className="text-xs sm:text-sm text-[#d5e8dd] max-w-sm mb-4 leading-relaxed line-clamp-2">
            {description}
          </p>
        )}

        {isLarge ? (
          <span className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#F97316] group-hover:bg-[#FF7A1A] text-white font-bold text-xs sm:text-sm rounded-xl shadow-md transition-colors">
            <span>{cta}</span>
            <svg className="w-3.5 h-3.5 stroke-[2.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#F97316] group-hover:text-[#FF7A1A] transition-colors">
            <span>{cta}</span>
            <svg className="w-3.5 h-3.5 stroke-[2.5] transform group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </span>
        )}
      </div>
    </a>
  );
}
