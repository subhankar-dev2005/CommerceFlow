/* global queueMicrotask */
import { useState, useEffect, useCallback, useRef } from 'react';
import { adminReviewService } from '../../features/admin/adminReview.service.js';
import AdminPageHeader from '../../layouts/admin/AdminPageHeader.jsx';
import { AdminLoadingState, AdminErrorState, AdminEmptyState } from '../../layouts/admin/AdminShellStates.jsx';

function StatusBadge({ status }) {
  if (status === 'published') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        Published
      </span>
    );
  }
  if (status === 'hidden') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
        Hidden
      </span>
    );
  }
  if (status === 'flagged') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-300">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
        Flagged
      </span>
    );
  }
  return null;
}

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState([]);
  const [pagination, setPagination] = useState({ totalReviews: 0, totalPages: 1, page: 1 });
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [ratingFilter, setRatingFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const activeRequestIdRef = useRef(0);

  const loadReviews = useCallback(async (targetPage = page) => {
    const requestId = ++activeRequestIdRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const data = await adminReviewService.getAdminReviews({
        status: statusFilter,
        rating: ratingFilter,
        search,
        page: targetPage,
        limit: 20
      });
      if (requestId === activeRequestIdRef.current) {
        setReviews(data.reviews || []);
        setPagination(data.pagination || { totalReviews: 0, totalPages: 1, page: targetPage });
      }
    } catch (err) {
      if (requestId === activeRequestIdRef.current) {
        setError(err?.message || 'Failed to load customer reviews from backend.');
      }
    } finally {
      if (requestId === activeRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [statusFilter, ratingFilter, search, page]);

  useEffect(() => {
    let ignore = false;
    queueMicrotask(() => {
      if (!ignore) {
        loadReviews(page);
      }
    });
    return () => {
      ignore = true;
    };
  }, [loadReviews, page]);

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handleStatusFilterChange = (e) => {
    setStatusFilter(e.target.value);
    setPage(1);
  };

  const handleRatingFilterChange = (e) => {
    setRatingFilter(e.target.value);
    setPage(1);
  };

  const handleUpdateStatus = async (reviewId, newStatus) => {
    setActionLoadingId(reviewId);
    try {
      await adminReviewService.updateReviewStatus(reviewId, newStatus);
      await loadReviews(page);
    } catch (err) {
      setError(err?.message || 'Failed to update review status.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDeleteReview = async (reviewId) => {
    if (!window.confirm('Are you sure you want to permanently delete this customer review?')) return;
    setActionLoadingId(reviewId);
    try {
      await adminReviewService.deleteReview(reviewId);
      const targetPage = reviews.length === 1 && page > 1 ? page - 1 : page;
      if (targetPage !== page) {
        setPage(targetPage);
      } else {
        await loadReviews(targetPage);
      }
    } catch (err) {
      setError(err?.message || 'Failed to delete review.');
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <AdminPageHeader
        title="Customer Reviews & Moderation"
        subtitle="Manage product feedback, review statuses, and verified customer testimonials across your store."
        badge="Sales & Customers"
      />

      {/* Filter and Control Bar */}
      <div className="bg-white rounded-2xl border border-[#E4E8E5] p-4 shadow-2xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={search}
            onChange={handleSearchChange}
            placeholder="Search review content or title..."
            className="px-3.5 py-1.5 text-xs bg-[#F7F6F1] border border-[#E4E8E5] rounded-xl text-slate-800 font-medium placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-[#123C32] w-52 sm:w-64"
            aria-label="Search reviews"
          />

          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-500">Status:</span>
            <select
              value={statusFilter}
              onChange={handleStatusFilterChange}
              className="px-3 py-1.5 text-xs bg-[#F7F6F1] border border-[#E4E8E5] rounded-xl font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#123C32]"
              aria-label="Filter by Status"
            >
              <option value="all">All Statuses</option>
              <option value="published">Published</option>
              <option value="hidden">Hidden</option>
              <option value="flagged">Flagged</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-500">Rating:</span>
            <select
              value={ratingFilter}
              onChange={handleRatingFilterChange}
              className="px-3 py-1.5 text-xs bg-[#F7F6F1] border border-[#E4E8E5] rounded-xl font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#123C32]"
              aria-label="Filter by Rating"
            >
              <option value="all">All Stars</option>
              <option value="5">5 Stars</option>
              <option value="4">4 Stars</option>
              <option value="3">3 Stars</option>
              <option value="2">2 Stars</option>
              <option value="1">1 Star</option>
            </select>
          </div>
        </div>

        <button
          type="button"
          onClick={() => loadReviews(page)}
          className="p-2 text-slate-600 hover:text-slate-900 rounded-xl border border-[#E4E8E5] hover:bg-slate-50 transition-colors"
          title="Refresh Reviews"
          aria-label="Refresh reviews"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {isLoading ? (
        <AdminLoadingState title="Loading reviews..." subtitle="Querying verified customer feedback from database..." />
      ) : error ? (
        <AdminErrorState title="Unable to load customer reviews" message={error} onRetry={loadReviews} />
      ) : reviews.length === 0 ? (
        <AdminEmptyState
          title="No reviews found"
          description="No customer reviews match your active filter criteria."
        />
      ) : (
        <div className="space-y-4">
          <div className="text-xs font-semibold text-slate-500">
            Showing {reviews.length} of {pagination.totalReviews} total customer reviews
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {reviews.map((rev) => {
              const reviewId = rev._id || rev.id;
              const isActionBusy = actionLoadingId === reviewId;
              const productName = rev.product?.name || 'Catalog Product';
              const customerName = rev.user?.name || rev.user?.email || 'Customer';

              return (
                <div
                  key={reviewId}
                  className="bg-white rounded-2xl border border-[#E4E8E5] p-5 shadow-2xs space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 line-clamp-1">{productName}</h3>
                        <div className="text-xs text-slate-500">By {customerName}</div>
                      </div>

                      <div className="flex items-center gap-2">
                        <StatusBadge status={rev.status} />
                        <div className="flex items-center gap-1 text-amber-500 font-bold text-xs bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                          <span>★</span>
                          <span>{rev.rating}.0</span>
                        </div>
                      </div>
                    </div>

                    {rev.title && <div className="text-xs font-bold text-slate-800">{rev.title}</div>}
                    <p className="text-xs text-slate-600 leading-relaxed bg-[#F7F6F1] p-3 rounded-xl border border-[#E4E8E5]">
                      {rev.body}
                    </p>
                  </div>

                  {/* Moderation Controls Footer */}
                  <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-[11px] text-slate-400">
                      {rev.createdAt ? new Date(rev.createdAt).toLocaleDateString('en-IN') : '—'}
                    </span>

                    <div className="flex items-center gap-2">
                      {rev.status !== 'published' && (
                        <button
                          type="button"
                          disabled={isActionBusy}
                          onClick={() => handleUpdateStatus(reviewId, 'published')}
                          className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                        >
                          Publish
                        </button>
                      )}

                      {rev.status !== 'hidden' && (
                        <button
                          type="button"
                          disabled={isActionBusy}
                          onClick={() => handleUpdateStatus(reviewId, 'hidden')}
                          className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 transition-colors disabled:opacity-50"
                        >
                          Hide
                        </button>
                      )}

                      {rev.status !== 'flagged' && (
                        <button
                          type="button"
                          disabled={isActionBusy}
                          onClick={() => handleUpdateStatus(reviewId, 'flagged')}
                          className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors disabled:opacity-50"
                        >
                          Flag
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={isActionBusy}
                        onClick={() => handleDeleteReview(reviewId)}
                        className="p-1 text-rose-500 hover:text-rose-700 rounded hover:bg-rose-50 transition-colors disabled:opacity-50"
                        title="Delete Review"
                        aria-label="Delete review"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination Toolbar */}
          <div className="bg-white rounded-2xl border border-[#E4E8E5] p-4 shadow-2xs flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
            <div>
              Page <span className="font-bold text-slate-800">{pagination.page || page}</span> of{' '}
              <span className="font-bold text-slate-800">{pagination.totalPages || 1}</span>{' '}
              <span className="text-slate-400">({pagination.totalReviews || reviews.length} total reviews)</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={(pagination.page || page) <= 1 || isLoading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3.5 py-1.5 rounded-xl border border-[#E4E8E5] bg-[#F7F6F1] hover:bg-slate-100 disabled:opacity-40 font-semibold text-slate-700 transition-colors cursor-pointer disabled:cursor-not-allowed"
                aria-label="Previous page"
                data-testid="reviews-pagination-prev"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={(pagination.page || page) >= (pagination.totalPages || 1) || isLoading}
                onClick={() => setPage((p) => Math.min(pagination.totalPages || 1, p + 1))}
                className="px-3.5 py-1.5 rounded-xl border border-[#E4E8E5] bg-[#F7F6F1] hover:bg-slate-100 disabled:opacity-40 font-semibold text-slate-700 transition-colors cursor-pointer disabled:cursor-not-allowed"
                aria-label="Next page"
                data-testid="reviews-pagination-next"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
