import { useState, useEffect, useCallback } from 'react';
import { getCategories, getCachedCategories } from './product.service.js';

/**
 * Lightweight React hook for fetching distinct product categories.
 * Reuses in-memory cached categories synchronously across components
 * to prevent redundant network requests and UI flickering.
 *
 * @returns {{
 *   categories: Array<string>,
 *   loading: boolean,
 *   error: Error|null,
 *   refetch: () => Promise<void>
 * }}
 */
export function useCategories() {
  const cached = getCachedCategories();
  const [categories, setCategories] = useState(() => cached || []);
  const [loading, setLoading] = useState(() => !cached);
  const [error, setError] = useState(null);

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getCategories({ forceRefresh: true });
      setCategories(data);
    } catch (err) {
      setError(err);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    // If cache is already valid, do not dispatch redundant network request
    if (getCachedCategories()) {
      return;
    }

    async function load() {
      try {
        const data = await getCategories();
        if (isMounted) {
          setCategories(data);
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          setError(err);
          setCategories([]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, []);

  return {
    categories,
    loading,
    error,
    refetch: fetchCategories,
  };
}

export default useCategories;
