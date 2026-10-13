import { useState } from 'react';
import reviewCardModule from './ReviewCard.jsx';
import reviewFormModule from './ReviewForm.jsx';
import skeletonModule from '../../components/Skeleton.jsx';
import emptyStateModule from '../../components/EmptyState.jsx';
import errorStateModule from '../../components/ErrorState.jsx';
import buttonModule from '../../components/Button.jsx';
import { useProductReviews } from './review.hooks.js';
import { cn } from '../../lib/utils.js';

const ReviewCard = reviewCardModule?.default || reviewCardModule;
const ReviewForm = reviewFormModule?.default || reviewFormModule;
const Skeleton = skeletonModule?.default || skeletonModule;
const EmptyState = emptyStateModule?.default || emptyStateModule;
const ErrorState = errorStateModule?.default || errorStateModule;
const Button = buttonModule?.default || buttonModule;

/**
 * ReviewList Component
 * Orchestrates the review list view, loading skeletons, empty/error states,
 * rating filters, sorting, pagination, and owner edit/delete interaction workflows.
 *
 * @param {Object} props
 * @param {string} props.productId - Target product MongoDB ObjectId
 * @param {Object} [props.currentUser] - Authenticated user object or null
 * @param {Function} [props.onRequireAuth] - Callback invoked when guest action requires login
 * @param {Function} [props.onReviewMutated] - Callback to notify parent (e.g. ProductPage) to refresh product rating metrics
 * @param {string} [props.className=''] - Additional styling classes
 * @param {Object} [props.hookOverrides] - Optional hook state override for tests or external controllers
 */
export default function ReviewList({
  productId,
  currentUser,
  onRequireAuth,
  onReviewMutated,
  className = '',
  hookOverrides,
}) {
  const internalHook = useProductReviews(productId);
  const hookState = hookOverrides || internalHook;

  const {
    reviews = [],
    pagination = { page: 1, totalPages: 1, totalReviews: 0, hasNextPage: false, hasPrevPage: false },
    loading = false,
    error = null,
    mutating = false,
    ratingFilter = null,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    setPage,
    setRatingFilter,
    setSorting,
    refreshReviews,
    deleteReview,
  } = hookState;

  // Local state for modals/drawers
  const [editingReview, setEditingReview] = useState(null);
  const [reviewPendingDelete, setReviewPendingDelete] = useState(null);
  const [deleteError, setDeleteError] = useState('');

  const currentUserId = currentUser?._id || currentUser?.id || '';

  const handleEdit = (review) => {
    setEditingReview(review);
  };

  const handleCancelEdit = () => {
    setEditingReview(null);
  };

  const handleEditSuccess = () => {
    setEditingReview(null);
    if (typeof onReviewMutated === 'function') {
      onReviewMutated();
    }
  };

  const handleDeletePrompt = (review) => {
    setDeleteError('');
    setReviewPendingDelete(review);
  };

  const handleCancelDelete = () => {
    setReviewPendingDelete(null);
    setDeleteError('');
  };

  const handleConfirmDelete = async () => {
    if (!reviewPendingDelete) return;
    const reviewId = reviewPendingDelete.id || reviewPendingDelete._id;

    try {
      await deleteReview(reviewId);
      setReviewPendingDelete(null);
      if (typeof onReviewMutated === 'function') {
        onReviewMutated();
      }
    } catch (err) {
      setDeleteError(err?.message || 'Failed to delete review. Please try again.');
    }
  };

  const ratingOptions = [
    { label: 'All Reviews', value: null },
    { label: '5 Stars', value: 5 },
    { label: '4 Stars', value: 4 },
    { label: '3 Stars', value: 3 },
    { label: '2 Stars', value: 2 },
    { label: '1 Star', value: 1 },
  ];

  return (
    <section className={cn('flex flex-col gap-6', className)} aria-label="Customer Reviews Section">
      {/* Edit Review Modal/Inline Box */}
      {editingReview && (
        <div className="mb-4">
          <ReviewForm
            productId={productId}
            review={editingReview}
            isAuthenticated={Boolean(currentUser)}
            onSuccess={handleEditSuccess}
            onCancel={handleCancelEdit}
            onRequireAuth={onRequireAuth}
          />
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {reviewPendingDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
          className="p-5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-950 flex flex-col gap-3 shadow-xs animate-in fade-in"
        >
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <div>
              <h4 id="delete-dialog-title" className="text-sm font-bold text-rose-950">
                Delete this review?
              </h4>
              <p className="text-xs text-rose-700 mt-0.5">
                This action is permanent and will recalculate the product rating score immediately.
              </p>
            </div>
          </div>

          {deleteError && (
            <p className="text-xs font-semibold text-rose-800" role="alert">
              {deleteError}
            </p>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-1">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCancelDelete}
              disabled={mutating}
            >
              Cancel
            </Button>
            <Button
              variant="accent"
              size="sm"
              onClick={handleConfirmDelete}
              loading={mutating}
              disabled={mutating}
              className="bg-rose-600 hover:bg-rose-700 border-rose-600"
            >
              Delete Review
            </Button>
          </div>
        </div>
      )}

      {/* Filter and Sort Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border-subtle pb-4">
        {/* Rating Pills */}
        <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Filter reviews by rating">
          {ratingOptions.map((opt) => {
            const isActive = ratingFilter === opt.value;
            return (
              <button
                key={opt.label}
                type="button"
                onClick={() => setRatingFilter(opt.value)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer',
                  isActive
                    ? 'bg-brand-800 text-white shadow-xs'
                    : 'bg-surface-card hover:bg-surface-muted text-text-secondary border border-border-subtle'
                )}
                aria-pressed={isActive}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Sort Select */}
        <div className="flex items-center gap-2 shrink-0">
          <label htmlFor="review-sort" className="text-xs font-bold text-text-muted uppercase tracking-wider">
            Sort by:
          </label>
          <select
            id="review-sort"
            value={`${sortBy}-${sortOrder}`}
            onChange={(e) => {
              const [newSortBy, newSortOrder] = e.target.value.split('-');
              setSorting(newSortBy, newSortOrder);
            }}
            className="text-xs font-semibold text-text-primary bg-surface-card border border-border-subtle rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-700 cursor-pointer"
          >
            <option value="createdAt-desc">Newest First</option>
            <option value="createdAt-asc">Oldest First</option>
            <option value="rating-desc">Highest Rating</option>
            <option value="rating-asc">Lowest Rating</option>
          </select>
        </div>
      </div>

      {/* Loading Skeletons */}
      {loading && (
        <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading reviews">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-6 rounded-2xl border border-border-subtle bg-surface-card flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Skeleton variant="circular" className="w-10 h-10" />
                <div className="flex flex-col gap-1.5 flex-1">
                  <Skeleton className="w-32 h-4" />
                  <Skeleton className="w-20 h-3" />
                </div>
              </div>
              <Skeleton className="w-24 h-4 mt-1" />
              <Skeleton className="w-48 h-5" />
              <Skeleton className="w-full h-12" />
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <ErrorState
          title="Could not load reviews"
          description={error?.message || 'We encountered an error loading verified customer reviews.'}
          onRetry={refreshReviews}
        />
      )}

      {/* Empty State */}
      {!loading && !error && reviews.length === 0 && (
        <EmptyState
          title={ratingFilter ? `No ${ratingFilter}-star reviews found` : 'No reviews yet'}
          description={
            ratingFilter
              ? 'Try choosing a different rating filter above to see other buyer reviews.'
              : 'Be the first verified buyer to leave a review once your gear is delivered.'
          }
          icon={
            <svg className="w-7 h-7 stroke-[1.6]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
            </svg>
          }
        />
      )}

      {/* Reviews Cards List */}
      {!loading && !error && reviews.length > 0 && (
        <div className="flex flex-col gap-4">
          {reviews.map((rev) => {
            const revId = rev.id || rev._id;
            return (
              <ReviewCard
                key={revId}
                review={rev}
                currentUserId={currentUserId}
                onEdit={handleEdit}
                onDelete={handleDeletePrompt}
              />
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {!loading && !error && pagination.totalPages > 1 && (
        <nav
          className="flex items-center justify-between border-t border-border-subtle pt-6 mt-2"
          aria-label="Reviews pagination"
        >
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPage(pagination.page - 1)}
            disabled={!pagination.hasPrevPage}
            aria-label="Previous page of reviews"
          >
            Previous
          </Button>

          <span className="text-xs font-semibold text-text-muted">
            Page {pagination.page} of {pagination.totalPages} ({pagination.totalReviews}{' '}
            {pagination.totalReviews === 1 ? 'review' : 'reviews'})
          </span>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPage(pagination.page + 1)}
            disabled={!pagination.hasNextPage}
            aria-label="Next page of reviews"
          >
            Next
          </Button>
        </nav>
      )}
    </section>
  );
}
