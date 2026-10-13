import { useState } from 'react';
import { cn } from '../../lib/utils.js';

/**
 * Accessible Star Rating Component
 * Supports both read-only display (with fractional fill) and interactive rating selection (1–5).
 *
 * @param {Object} props
 * @param {number} [props.rating=0] - Numerical rating (0–5, fractional in read-only)
 * @param {number} [props.max=5] - Total number of stars (default 5)
 * @param {boolean} [props.readOnly=true] - If true, displays rating without interactivity
 * @param {Function} [props.onChange] - Callback invoked when a star is selected (passes integer 1–5)
 * @param {'sm'|'md'|'lg'} [props.size='md'] - Visual star sizing
 * @param {string} [props.className=''] - Additional container classes
 * @param {string} [props.name='rating'] - Accessible form field name
 */
export default function RatingStars({
  rating = 0,
  max = 5,
  readOnly = true,
  onChange,
  size = 'md',
  className = '',
  name = 'rating',
}) {
  const [hoverRating, setHoverRating] = useState(0);

  const isInteractive = !readOnly && typeof onChange === 'function';
  const effectiveRating = isInteractive && hoverRating > 0 ? hoverRating : Number(rating) || 0;

  const sizeClasses = {
    sm: 'w-3.5 h-3.5',
    md: 'w-5 h-5',
    lg: 'w-7 h-7',
  };

  const starSize = sizeClasses[size] || sizeClasses.md;

  const handleSelect = (starValue) => {
    if (isInteractive) {
      onChange(starValue);
    }
  };

  const handleKeyDown = (e, starValue) => {
    if (!isInteractive) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onChange(starValue);
    }
  };

  // Render read-only accessible rating group
  if (!isInteractive) {
    return (
      <div
        className={cn('inline-flex items-center gap-1 select-none', className)}
        role="img"
        aria-label={`${Number(rating).toFixed(1)} out of ${max} stars`}
      >
        {Array.from({ length: max }, (_, index) => {
          const fillRatio = Math.max(0, Math.min(1, rating - index));
          const isFullyFilled = fillRatio >= 0.85;
          const isHalfFilled = fillRatio >= 0.25 && fillRatio < 0.85;

          return (
            <span key={index} className="relative inline-flex items-center justify-center shrink-0">
              {/* Background empty star */}
              <svg
                className={cn(starSize, 'text-slate-300 stroke-slate-300 fill-slate-100')}
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
                />
              </svg>

              {/* Filled star overlay */}
              {(isFullyFilled || isHalfFilled) && (
                <span
                  className="absolute inset-0 overflow-hidden"
                  style={{ width: isFullyFilled ? '100%' : '50%' }}
                >
                  <svg
                    className={cn(starSize, 'text-amber-400 stroke-amber-500 fill-amber-400')}
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
                    />
                  </svg>
                </span>
              )}
            </span>
          );
        })}
      </div>
    );
  }

  // Interactive star rating selection mode
  return (
    <div
      className={cn('inline-flex items-center gap-1.5', className)}
      role="radiogroup"
      aria-label="Rating selection"
      onMouseLeave={() => setHoverRating(0)}
    >
      {Array.from({ length: max }, (_, index) => {
        const starValue = index + 1;
        const isFilled = starValue <= effectiveRating;

        return (
          <button
            key={index}
            type="button"
            role="radio"
            name={name}
            aria-checked={starValue === Number(rating)}
            aria-label={`${starValue} ${starValue === 1 ? 'star' : 'stars'}`}
            className={cn(
              'p-1 -m-1 rounded-lg transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 hover:scale-110 active:scale-95 cursor-pointer touch-manipulation'
            )}
            onClick={() => handleSelect(starValue)}
            onMouseEnter={() => setHoverRating(starValue)}
            onKeyDown={(e) => handleKeyDown(e, starValue)}
          >
            <svg
              className={cn(
                starSize,
                'transition-colors duration-150',
                isFilled
                  ? 'text-amber-400 stroke-amber-500 fill-amber-400 drop-shadow-xs'
                  : 'text-slate-300 stroke-slate-300 fill-transparent hover:text-amber-200'
              )}
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
              />
            </svg>
          </button>
        );
      })}
    </div>
  );
}
