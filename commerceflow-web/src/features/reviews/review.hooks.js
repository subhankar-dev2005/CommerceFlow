import { useState, useEffect, useCallback, useRef } from 'react';
import { reviewService } from './review.service.js';

const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

/**
 * useProductReviews Hook
 * Manages product-scoped review state, pagination, rating filtering, sorting,
 * and review mutations (create/update/delete).
 *
 * @param {string} productId - 24-character hexadecimal MongoDB ObjectId
 * @param {Object} [initialOptions={}] - Initial query configuration
 * @param {number} [initialOptions.page=1]
 * @param {number} [initialOptions.limit=10]
 * @param {number|null} [initialOptions.rating=null]
 * @param {'createdAt'|'rating'} [initialOptions.sortBy='createdAt']
 * @param {'asc'|'desc'} [initialOptions.sortOrder='desc']
 */
export function useProductReviews(productId, initialOptions = {}) {
  const [reviews, setReviews] = useState([]);
  const [pagination, setPagination] = useState({
    page: initialOptions.page || 1,
    limit: initialOptions.limit || 10,
    totalReviews: 0,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  });

  const [ratingFilter, setRatingFilter] = useState(initialOptions.rating || null);
  const [sortBy, setSortBy] = useState(initialOptions.sortBy || 'createdAt');
  const [sortOrder, setSortOrder] = useState(initialOptions.sortOrder || 'desc');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [mutating, setMutating] = useState(false);
  const [mutationError, setMutationError] = useState(null);

  const isMountedRef = useRef(true);
  const currentRequestIdRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchReviews = useCallback(
    async (pageToFetch = pagination.page, filter = ratingFilter, sortField = sortBy, sortDir = sortOrder) => {
      if (!productId || typeof productId !== 'string' || !OBJECT_ID_REGEX.test(productId.trim())) {
        if (isMountedRef.current) {
          setReviews([]);
          setLoading(false);
          setError(null);
        }
        return;
      }

      const requestId = ++currentRequestIdRef.current;
      setLoading(true);
      setError(null);

      try {
        const options = {
          page: pageToFetch,
          limit: pagination.limit,
          sortBy: sortField,
          sortOrder: sortDir,
        };
        if (filter !== null && filter !== undefined) {
          options.rating = filter;
        }

        const data = await reviewService.getReviews(productId.trim(), options);

        // Discard stale responses if a newer request was dispatched or component unmounted
        if (!isMountedRef.current || requestId !== currentRequestIdRef.current) {
          return;
        }

        const page = data.pagination?.page || pageToFetch;
        const totalPages = data.pagination?.totalPages || 1;

        setReviews(data.reviews || []);
        setPagination({
          page,
          limit: data.pagination?.limit || pagination.limit,
          totalReviews: data.pagination?.totalReviews || 0,
          total: data.pagination?.totalReviews || 0,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        });
      } catch (err) {
        if (isMountedRef.current && requestId === currentRequestIdRef.current) {
          setError(err);
          setReviews([]);
        }
      } finally {
        if (isMountedRef.current && requestId === currentRequestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [productId, pagination.limit, pagination.page, ratingFilter, sortBy, sortOrder]
  );

  // Trigger fetch on parameter changes
  useEffect(() => {
    let ignore = false;

    async function loadReviews() {
      await Promise.resolve();
      if (!ignore) {
        fetchReviews(pagination.page, ratingFilter, sortBy, sortOrder);
      }
    }

    loadReviews();

    return () => {
      ignore = true;
    };
  }, [fetchReviews, pagination.page, ratingFilter, sortBy, sortOrder]);

  const setPage = useCallback((newPage) => {
    setPagination((prev) => ({
      ...prev,
      page: Math.max(1, newPage),
    }));
  }, []);

  const changeRatingFilter = useCallback((rating) => {
    setRatingFilter(rating);
    setPagination((prev) => ({ ...prev, page: 1 }));
  }, []);

  const changeSorting = useCallback((newSortBy, newSortOrder = 'desc') => {
    setSortBy(newSortBy);
    setSortOrder(newSortOrder);
    setPagination((prev) => ({ ...prev, page: 1 }));
  }, []);

  const refreshReviews = useCallback(() => {
    return fetchReviews(pagination.page, ratingFilter, sortBy, sortOrder);
  }, [fetchReviews, pagination.page, ratingFilter, sortBy, sortOrder]);

  const createReview = useCallback(
    async (payload) => {
      setMutating(true);
      setMutationError(null);
      try {
        const created = await reviewService.createReview(productId, payload);
        await refreshReviews();
        return created;
      } catch (err) {
        if (isMountedRef.current) {
          setMutationError(err);
        }
        throw err;
      } finally {
        if (isMountedRef.current) {
          setMutating(false);
        }
      }
    },
    [productId, refreshReviews]
  );

  const updateReview = useCallback(
    async (reviewId, payload) => {
      setMutating(true);
      setMutationError(null);
      try {
        const updated = await reviewService.updateReview(productId, reviewId, payload);
        await refreshReviews();
        return updated;
      } catch (err) {
        if (isMountedRef.current) {
          setMutationError(err);
        }
        throw err;
      } finally {
        if (isMountedRef.current) {
          setMutating(false);
        }
      }
    },
    [productId, refreshReviews]
  );

  const deleteReview = useCallback(
    async (reviewId) => {
      setMutating(true);
      setMutationError(null);
      try {
        const result = await reviewService.deleteReview(productId, reviewId);
        await refreshReviews();
        return result;
      } catch (err) {
        if (isMountedRef.current) {
          setMutationError(err);
        }
        throw err;
      } finally {
        if (isMountedRef.current) {
          setMutating(false);
        }
      }
    },
    [productId, refreshReviews]
  );

  return {
    reviews,
    pagination,
    loading,
    error,
    mutating,
    mutationError,
    ratingFilter,
    sortBy,
    sortOrder,
    setPage,
    setRatingFilter: changeRatingFilter,
    setSorting: changeSorting,
    refreshReviews,
    createReview,
    updateReview,
    deleteReview,
  };
}

export default useProductReviews;
