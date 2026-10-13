import ratingStarsModule from './RatingStars.jsx';
import badgeModule from '../../components/Badge.jsx';
import { cn } from '../../lib/utils.js';

const RatingStars = ratingStarsModule?.default || ratingStarsModule;
const Badge = badgeModule?.default || badgeModule;

/**
 * ReviewCard Component
 * Displays a single customer review with safe projection, verified buyer badge,
 * and owner edit/delete actions.
 *
 * @param {Object} props
 * @param {Object} props.review - Normalized review document
 * @param {string|Object} [props.currentUser] - Authenticated user object or ID
 * @param {string} [props.currentUserId] - Optional explicit user ID override
 * @param {Function} [props.onEdit] - Callback invoked when owner clicks Edit
 * @param {Function} [props.onDelete] - Callback invoked when owner clicks Delete
 * @param {string} [props.className=''] - Additional styling classes
 */
export default function ReviewCard({
  review,
  currentUser,
  currentUserId,
  onEdit,
  onDelete,
  className = '',
}) {
  if (!review) return null;

  // Resolve current user ID for ownership check
  const resolvedCurrentUserId =
    currentUserId ||
    (currentUser && typeof currentUser === 'object'
      ? currentUser._id || currentUser.id
      : currentUser) ||
    '';

  // Resolve review author ID
  const reviewAuthorId =
    review.user && typeof review.user === 'object'
      ? review.user.id || review.user._id
      : review.user || '';

  const isOwner = Boolean(
    resolvedCurrentUserId &&
    reviewAuthorId &&
    String(resolvedCurrentUserId) === String(reviewAuthorId)
  );

  const reviewerName = review.user?.name || 'Verified Customer';
  const initial = reviewerName.charAt(0).toUpperCase() || 'V';

  const formattedDate = review.createdAt
    ? new Date(review.createdAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : '';

  return (
    <article
      className={cn(
        'bg-surface-card rounded-2xl border border-border-subtle p-5 md:p-6 transition-all duration-150 hover:border-border-strong hover:shadow-xs flex flex-col gap-3',
        className
      )}
      aria-label={`Review by ${reviewerName}`}
    >
      {/* Header: Reviewer Info + Actions */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {/* Avatar Icon */}
          <div
            className="w-10 h-10 rounded-full bg-brand-50 border border-brand-200/70 text-brand-800 font-bold text-sm flex items-center justify-center shrink-0 select-none"
            aria-hidden="true"
          >
            {initial}
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sm text-text-primary tracking-tight">
                {reviewerName}
              </span>

              {review.isVerifiedBuyer && (
                <Badge variant="success" size="sm">
                  <svg
                    className="w-3 h-3 text-emerald-600 shrink-0"
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
                  Verified Buyer
                </Badge>
              )}
            </div>

            {formattedDate && (
              <time
                dateTime={review.createdAt}
                className="text-xs text-text-muted mt-0.5 block"
              >
                {formattedDate}
              </time>
            )}
          </div>
        </div>

        {/* Owner Action Buttons */}
        {isOwner && (
          <div className="flex items-center gap-2 shrink-0">
            {typeof onEdit === 'function' && (
              <button
                type="button"
                onClick={() => onEdit(review)}
                className="text-xs font-semibold text-brand-700 hover:text-brand-900 bg-brand-50 hover:bg-brand-100 px-2.5 py-1 rounded-lg border border-brand-200/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 cursor-pointer"
                aria-label="Edit this review"
              >
                Edit
              </button>
            )}

            {typeof onDelete === 'function' && (
              <button
                type="button"
                onClick={() => onDelete(review)}
                className="text-xs font-semibold text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 px-2.5 py-1 rounded-lg border border-rose-200/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 cursor-pointer"
                aria-label="Delete this review"
              >
                Delete
              </button>
            )}
          </div>
        )}
      </div>

      {/* Star Rating */}
      <div className="mt-0.5">
        <RatingStars rating={review.rating} size="sm" readOnly />
      </div>

      {/* Review Title */}
      {review.title && (
        <h4 className="font-bold text-sm md:text-base text-text-primary mt-1 break-words">
          {review.title}
        </h4>
      )}

      {/* Review Body */}
      <p className="text-sm text-text-secondary leading-relaxed break-words whitespace-pre-line">
        {review.body}
      </p>
    </article>
  );
}
