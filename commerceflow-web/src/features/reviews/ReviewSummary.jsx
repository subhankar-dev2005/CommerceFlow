import ratingStarsModule from './RatingStars.jsx';
import badgeModule from '../../components/Badge.jsx';
import { cn } from '../../lib/utils.js';

const RatingStars = ratingStarsModule?.default || ratingStarsModule;
const Badge = badgeModule?.default || badgeModule;

/**
 * ReviewSummary Component
 * Presentation-only component displaying server-authoritative product rating metrics.
 * Strictly avoids client-side rating recalculations or array reductions.
 *
 * @param {Object} props
 * @param {number} [props.ratingAverage=0] - Persisted Product ratingAverage from backend (0–5)
 * @param {number} [props.ratingCount=0] - Persisted Product ratingCount from backend (>= 0)
 * @param {string} [props.className=''] - Additional styling classes
 */
export default function ReviewSummary({
  ratingAverage = 0,
  ratingCount = 0,
  className = '',
}) {
  const avg = typeof ratingAverage === 'number' && Number.isFinite(ratingAverage)
    ? Math.max(0, Math.min(5, ratingAverage))
    : 0;

  const count = typeof ratingCount === 'number' && Number.isFinite(ratingCount)
    ? Math.max(0, Math.floor(ratingCount))
    : 0;

  const hasReviews = count > 0;

  return (
    <div
      className={cn(
        'bg-surface-card rounded-2xl border border-border-subtle p-6 md:p-8 flex flex-col md:flex-row items-center md:items-start gap-6 md:gap-10 shadow-xs',
        className
      )}
      aria-label="Customer ratings summary"
    >
      {/* Big Rating Metric */}
      <div className="flex flex-col items-center md:items-start text-center md:text-left shrink-0">
        <div className="flex items-baseline gap-2 mb-1.5">
          <span className="text-4xl md:text-5xl font-black text-text-primary tracking-tight font-serif">
            {avg.toFixed(1)}
          </span>
          <span className="text-base font-semibold text-text-muted">/ 5.0</span>
        </div>

        <div className="mb-2">
          <RatingStars rating={avg} size="lg" readOnly />
        </div>

        <p className="text-sm font-medium text-text-secondary">
          {hasReviews ? (
            <span>
              Based on{' '}
              <strong className="text-text-primary font-bold">
                {count} {count === 1 ? 'verified review' : 'verified reviews'}
              </strong>
            </span>
          ) : (
            <span>No customer reviews yet</span>
          )}
        </p>
      </div>

      {/* Trust & Verification Pillar */}
      <div className="w-full md:w-auto md:flex-1 border-t md:border-t-0 md:border-l border-border-subtle pt-6 md:pt-0 md:pl-10 flex flex-col justify-center">
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="brand" size="md">
            <svg
              className="w-3.5 h-3.5 text-brand-600 shrink-0"
              fill="currentColor"
              viewBox="0 0 20 20"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
            100% Verified Buyers
          </Badge>
        </div>

        <h4 className="text-sm font-bold text-text-primary mb-1">
          Authentic Customer Feedback
        </h4>
        <p className="text-xs text-text-muted leading-relaxed max-w-md">
          {hasReviews
            ? 'Only customers with delivered and paid purchases can review this gear. Every rating directly impacts the product score.'
            : 'Reviews are exclusively unlocked for buyers with delivered orders to maintain complete integrity and trust.'}
        </p>
      </div>
    </div>
  );
}
