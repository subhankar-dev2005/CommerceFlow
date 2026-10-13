import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getProducts } from './product.service.js';

function createAbortController() {
  if (typeof window !== 'undefined' && window.AbortController) {
    return new window.AbortController();
  }
  return null;
}

/**
 * Lightweight React hook for fetching and managing catalog state.
 * Prevents duplicate fetches and race conditions via stabilized params,
 * request lifecycle effect, AbortController, and latest-request tracking.
 *
 * @param {Object} [params={}]
 * @returns {{
 *   products: Array<Object>,
 *   pagination: { page: number, limit: number, totalProducts: number, totalPages: number },
 *   loading: boolean,
 *   error: Error|null,
 *   refetch: () => Promise<void>
 * }}
 */
export function useProducts(params = {}) {
  const [products, setProducts] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    totalProducts: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Stable serialization of params to prevent unnecessary re-triggers
  const serializedParams = useMemo(() => {
    return JSON.stringify({
      page: params.page !== undefined && params.page !== null ? Number(params.page) : 1,
      limit: params.limit !== undefined && params.limit !== null ? Number(params.limit) : 10,
      search: params.search && String(params.search).trim() !== '' ? String(params.search).trim() : undefined,
      category: params.category && String(params.category).trim() !== '' ? String(params.category).trim() : undefined,
      inStock: params.inStock === 'true' || params.inStock === 'false' ? params.inStock : undefined,
      minPrice: params.minPrice !== undefined && params.minPrice !== null && params.minPrice !== '' && !isNaN(Number(params.minPrice)) ? Number(params.minPrice) : undefined,
      maxPrice: params.maxPrice !== undefined && params.maxPrice !== null && params.maxPrice !== '' && !isNaN(Number(params.maxPrice)) ? Number(params.maxPrice) : undefined,
      sortBy: params.sortBy || 'createdAt',
      sortOrder: params.sortOrder || 'desc',
    });
  }, [
    params.page,
    params.limit,
    params.search,
    params.category,
    params.inStock,
    params.minPrice,
    params.maxPrice,
    params.sortBy,
    params.sortOrder,
  ]);

  // Track active AbortController ref across renders and unmount
  const activeControllerRef = useRef(null);
  // Track the latest requestId to prevent stale responses from overwriting newer ones
  const activeRequestIdRef = useRef(0);

  // Effect-driven catalog request lifecycle
  useEffect(() => {
    // Abort previous in-flight request if one exists
    if (activeControllerRef.current) {
      activeControllerRef.current.abort();
    }

    const controller = createAbortController();
    activeControllerRef.current = controller;
    const requestId = ++activeRequestIdRef.current;

    async function loadCatalog() {
      setLoading(true);

      try {
        const parsedParams = JSON.parse(serializedParams);
        const data = await getProducts(parsedParams, { signal: controller?.signal });

        // Guard against race conditions and stale responses
        if (requestId === activeRequestIdRef.current && (!controller || !controller.signal.aborted)) {
          setProducts(data.products);
          setPagination(data.pagination);
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        // Ignore expected abort errors
        if (controller?.signal.aborted || err?.name === 'AbortError' || err?.code === 'ABORT_ERROR') {
          return;
        }

        // Only commit error if this request is still the active one
        if (requestId === activeRequestIdRef.current) {
          setError(err);
          setProducts([]);
          setLoading(false);
        }
      }
    }

    loadCatalog();

    return () => {
      // Abort in-flight request on query change or unmount
      if (controller) {
        controller.abort();
      }
    };
  }, [serializedParams]);

  // Refetch function preserving manual refresh capability
  const refetch = useCallback(async () => {
    if (activeControllerRef.current) {
      activeControllerRef.current.abort();
    }

    const controller = createAbortController();
    activeControllerRef.current = controller;
    const requestId = ++activeRequestIdRef.current;

    setLoading(true);
    setError(null);

    try {
      const parsedParams = JSON.parse(serializedParams);
      const data = await getProducts(parsedParams, { signal: controller?.signal });

      if (requestId === activeRequestIdRef.current && (!controller || !controller.signal.aborted)) {
        setProducts(data.products);
        setPagination(data.pagination);
        setError(null);
      }
    } catch (err) {
      if (controller?.signal.aborted || err?.name === 'AbortError' || err?.code === 'ABORT_ERROR') {
        return;
      }
      if (requestId === activeRequestIdRef.current) {
        setError(err);
        setProducts([]);
      }
    } finally {
      if (requestId === activeRequestIdRef.current && (!controller || !controller.signal.aborted)) {
        setLoading(false);
      }
    }
  }, [serializedParams]);

  return {
    products,
    pagination,
    loading,
    error,
    refetch,
  };
}

export default useProducts;
