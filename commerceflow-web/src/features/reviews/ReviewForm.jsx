import { useState } from 'react';
import ratingStarsModule from './RatingStars.jsx';
import buttonModule from '../../components/Button.jsx';
import { reviewService } from './review.service.js';
import { cn } from '../../lib/utils.js';

const RatingStars = ratingStarsModule?.default || ratingStarsModule;
const Button = buttonModule?.default || buttonModule;

/**
 * ReviewForm Component
 * Supports both creating a new verified buyer review and editing an existing review.
 * Enforces field length limits, client-side validation UX, server error preservation,
 * and strict payload isolation (submitting ONLY rating, title, body).
 *
 * @param {Object} props
 * @param {string} props.productId - Target product MongoDB ObjectId
 * @param {Object} [props.review] - Existing review to edit (if in edit mode)
 * @param {boolean} [props.isAuthenticated=true] - Whether user is logged in
 * @param {Function} [props.onSuccess] - Callback on successful submission
 * @param {Function} [props.onCancel] - Optional callback to cancel editing
 * @param {Function} [props.onRequireAuth] - Callback invoked when guest attempts to review
 * @param {string} [props.className=''] - Additional styling classes
 */
export default function ReviewForm({
  productId,
  review,
  isAuthenticated = true,
  onSuccess,
  onCancel,
  onRequireAuth,
  className = '',
}) {
  const isEditMode = Boolean(review && (review.id || review._id));

  const [rating, setRating] = useState(review?.rating || 0);
  const [title, setTitle] = useState(review?.title || '');
  const [body, setBody] = useState(review?.body || '');

  // Sync internal form fields if a different review prop is passed
  const [prevReview, setPrevReview] = useState(review);
  if (review !== prevReview) {
    setPrevReview(review);
    setRating(review?.rating || 0);
    setTitle(review?.title || '');
    setBody(review?.body || '');
  }

  const [clientErrors, setClientErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Guest view
  if (!isAuthenticated) {
    return (
      <div
        className={cn(
          'bg-surface-card rounded-2xl border border-border-subtle p-6 text-center shadow-xs',
          className
        )}
      >
        <div className="w-12 h-12 rounded-full bg-brand-50 text-brand-800 flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
        </div>
        <h4 className="text-base font-bold text-text-primary mb-1">
          Sign In to Leave a Review
        </h4>
        <p className="text-xs text-text-muted mb-4 max-w-sm mx-auto">
          Reviews are reserved for verified buyers with delivered orders. Please log in to share your experience.
        </p>
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            if (typeof onRequireAuth === 'function') {
              onRequireAuth();
            }
          }}
        >
          Sign In
        </Button>
      </div>
    );
  }

  const validate = () => {
    const errors = {};
    if (!rating || rating < 1 || rating > 5) {
      errors.rating = 'Please select a rating from 1 to 5 stars';
    }
    if (title && title.length > 100) {
      errors.title = 'Headline cannot exceed 100 characters';
    }
    const trimmedBody = body.trim();
    if (!trimmedBody || trimmedBody.length < 5) {
      errors.body = 'Review body must be at least 5 characters';
    } else if (trimmedBody.length > 2000) {
      errors.body = 'Review body cannot exceed 2000 characters';
    }
    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError('');
    setIsSuccess(false);

    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setClientErrors(validationErrors);
      return;
    }
    setClientErrors({});

    // STRICT SECURITY: Payload contains ONLY rating, title, body
    const payload = {
      rating: Number(rating),
      title: title.trim(),
      body: body.trim(),
    };

    setIsSubmitting(true);
    try {
      let result;
      if (isEditMode) {
        const reviewId = review.id || review._id;
        result = await reviewService.updateReview(productId, reviewId, payload);
      } else {
        result = await reviewService.createReview(productId, payload);
        // Reset fields only on fresh creation
        setRating(0);
        setTitle('');
        setBody('');
      }

      setIsSuccess(true);
      if (typeof onSuccess === 'function') {
        onSuccess(result);
      }
    } catch (err) {
      // Map domain error codes to user-friendly messages while preserving specifics
      let friendlyMessage = err?.message || 'Failed to submit review. Please try again.';

      if (err?.code === 'REVIEW_PURCHASE_REQUIRED') {
        friendlyMessage = 'Only verified buyers who have received this product can leave a review.';
      } else if (err?.code === 'REVIEW_ALREADY_EXISTS') {
        friendlyMessage = 'You have already submitted a review for this product.';
      } else if (err?.code === 'REVIEW_ACCESS_DENIED') {
        friendlyMessage = 'You are not authorized to update this review.';
      } else if (err?.code === 'REVIEW_NOT_FOUND') {
        friendlyMessage = 'This review could not be found.';
      } else if (err?.code === 'VALIDATION_ERROR') {
        friendlyMessage = err?.details?.[0]?.message || 'Please check your inputs and try again.';
      }

      setServerError(friendlyMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        'bg-surface-card rounded-2xl border border-border-subtle p-6 md:p-8 shadow-xs flex flex-col gap-5',
        className
      )}
      noValidate
      aria-label={isEditMode ? 'Edit your review' : 'Write a customer review'}
    >
      <div className="flex items-center justify-between border-b border-border-subtle pb-4">
        <div>
          <h3 className="text-lg font-bold text-text-primary tracking-tight">
            {isEditMode ? 'Edit Your Review' : 'Write a Review'}
          </h3>
          <p className="text-xs text-text-muted mt-0.5">
            Share your experience with fellow outdoor enthusiasts
          </p>
        </div>

        {isEditMode && typeof onCancel === 'function' && (
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-semibold text-text-muted hover:text-text-primary transition-colors cursor-pointer"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Success banner */}
      {isSuccess && (
        <div
          role="status"
          className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2"
        >
          <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          {isEditMode ? 'Review updated successfully!' : 'Thank you! Your verified review has been published.'}
        </div>
      )}

      {/* Server error banner */}
      {serverError && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center gap-2"
        >
          <svg className="w-4 h-4 text-rose-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {serverError}
        </div>
      )}

      {/* Rating Picker */}
      <div>
        <label className="block text-xs font-bold text-text-primary uppercase tracking-wider mb-2">
          Overall Rating <span className="text-accent-500">*</span>
        </label>
        <div className="flex items-center gap-3">
          <RatingStars
            rating={rating}
            readOnly={false}
            onChange={(val) => {
              setRating(val);
              if (clientErrors.rating) {
                setClientErrors((prev) => ({ ...prev, rating: '' }));
              }
            }}
            size="lg"
          />
          {rating > 0 && (
            <span className="text-xs font-semibold text-text-secondary">
              {rating} of 5 stars
            </span>
          )}
        </div>
        {clientErrors.rating && (
          <p className="text-xs text-rose-600 font-medium mt-1.5" role="alert">
            {clientErrors.rating}
          </p>
        )}
      </div>

      {/* Review Headline (Title) */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label htmlFor="review-title" className="text-xs font-bold text-text-primary uppercase tracking-wider">
            Review Title <span className="text-text-muted font-normal lowercase">(optional)</span>
          </label>
          <span className="text-[11px] text-text-muted">
            {title.length}/100
          </span>
        </div>
        <input
          id="review-title"
          type="text"
          maxLength={100}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (clientErrors.title) {
              setClientErrors((prev) => ({ ...prev, title: '' }));
            }
          }}
          placeholder="e.g. Best expedition tent for harsh winters"
          className={cn(
            'w-full px-3.5 py-2.5 rounded-xl border bg-surface-bg text-sm text-text-primary placeholder:text-text-muted/60 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-700 focus:bg-white',
            clientErrors.title ? 'border-rose-400' : 'border-border-subtle'
          )}
        />
        {clientErrors.title && (
          <p className="text-xs text-rose-600 font-medium mt-1" role="alert">
            {clientErrors.title}
          </p>
        )}
      </div>

      {/* Review Body */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label htmlFor="review-body" className="text-xs font-bold text-text-primary uppercase tracking-wider">
            Review Details <span className="text-accent-500">*</span>
          </label>
          <span className="text-[11px] text-text-muted">
            {body.length}/2000
          </span>
        </div>
        <textarea
          id="review-body"
          rows={4}
          maxLength={2000}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            if (clientErrors.body) {
              setClientErrors((prev) => ({ ...prev, body: '' }));
            }
          }}
          placeholder="What did you like or dislike? How did it hold up in the field?"
          className={cn(
            'w-full px-3.5 py-2.5 rounded-xl border bg-surface-bg text-sm text-text-primary placeholder:text-text-muted/60 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-700 focus:bg-white resize-y',
            clientErrors.body ? 'border-rose-400' : 'border-border-subtle'
          )}
        />
        {clientErrors.body && (
          <p className="text-xs text-rose-600 font-medium mt-1" role="alert">
            {clientErrors.body}
          </p>
        )}
      </div>

      {/* Form Action Buttons */}
      <div className="flex items-center justify-end gap-3 pt-2">
        {isEditMode && typeof onCancel === 'function' && (
          <Button
            variant="secondary"
            size="md"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
        )}

        <Button
          type="submit"
          variant="primary"
          size="md"
          loading={isSubmitting}
          disabled={isSubmitting}
        >
          {isEditMode ? 'Update Review' : 'Submit Review'}
        </Button>
      </div>
    </form>
  );
}
