/* eslint-disable react-refresh/only-export-components */
/* eslint-disable react-hooks/set-state-in-effect */
import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import authContextModule from '../auth/auth.context.jsx';
import {
  getWishlist as apiGetWishlist,
  addToWishlist as apiAddToWishlist,
  removeFromWishlist as apiRemoveFromWishlist,
  clearWishlist as apiClearWishlist,
} from './wishlist.service.js';
import { ApiError } from '../../lib/apiClient.js';
import { navigate } from '../../lib/utils.js';

// Resolve the shared AuthContext exported by the auth module
export const AuthContext = authContextModule?.AuthContext || authContextModule?.default || authContextModule;

const EMPTY_WISHLIST = { items: [], totalItems: 0 };

export const WishlistContext = createContext(null);

/**
 * Normalize the raw API wishlist response into a stable predictable shape.
 * Handles both { items, totalItems } and legacy/unexpected shapes safely.
 *
 * @param {*} raw
 * @returns {{ items: Array<Object>, totalItems: number }}
 */
function normalizeWishlist(raw) {
  if (!raw || typeof raw !== 'object') return EMPTY_WISHLIST;
  const items = Array.isArray(raw.items) ? raw.items : [];
  const totalItems = typeof raw.totalItems === 'number' ? raw.totalItems : items.length;
  return { items, totalItems };
}

/**
 * Extract a safe string product ID from a wishlist item.
 * The backend populates `product` as a full object inside wishlist items.
 *
 * @param {Object} item - Raw wishlist item from backend
 * @returns {string}
 */
function extractProductId(item) {
  if (!item) return '';
  // Populated: item.product._id
  if (item.product && typeof item.product === 'object' && item.product._id) {
    return String(item.product._id);
  }
  // Flat: item.product is a string ID
  if (typeof item.product === 'string') {
    return item.product;
  }
  // Fallback: item.productId or item._id
  return String(item.productId || item._id || '');
}

export function WishlistProvider({ children }) {
  const auth = useContext(AuthContext);
  const isAuthenticated = Boolean(auth?.isAuthenticated);
  const authLoading = Boolean(auth?.isLoading);

  const [wishlist, setWishlist] = useState(EMPTY_WISHLIST);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState(null);

  // Per-product mutation tracking: productId -> boolean
  const mutatingProductsRef = useRef(new Set());
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * Fetch the wishlist from the server and update state.
   * Only runs for authenticated users. Clears wishlist on logout.
   */
  const refreshWishlist = useCallback(async () => {
    if (!isMountedRef.current) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await apiGetWishlist();
      if (isMountedRef.current) {
        setWishlist(normalizeWishlist(data));
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  // Load or clear wishlist when auth state transitions
  useEffect(() => {
    if (authLoading) return;

    if (isAuthenticated) {
      // Trigger async fetch; IIFE avoids directly calling setState in effect body
      void (async () => {
        await refreshWishlist();
      })();
    } else {
      // User logged out — clear wishlist state; no localStorage for guests
      setWishlist(EMPTY_WISHLIST);
      setError(null);
      setIsLoading(false);
    }
  }, [isAuthenticated, authLoading, refreshWishlist]);

  /**
   * Determine whether a product is currently in the wishlist.
   * Safe to call during loading (returns false until confirmed).
   *
   * @param {string} productId
   * @returns {boolean}
   */
  const isWishlisted = useCallback(
    (productId) => {
      if (!productId || !wishlist.items.length) return false;
      const id = String(productId);
      return wishlist.items.some((item) => extractProductId(item) === id);
    },
    [wishlist.items]
  );

  /**
   * Add a product to the wishlist.
   * Requires authentication. Returns false and navigates to login if unauthenticated.
   *
   * @param {string} productId
   * @returns {Promise<void>}
   */
  const addToWishlist = useCallback(
    async (productId) => {
      if (!isAuthenticated) {
        const currentPath = typeof window !== 'undefined'
          ? window.location.pathname + window.location.search
          : '/';
        navigate(`/login?redirect=${encodeURIComponent(currentPath)}`);
        return;
      }

      const id = String(productId);
      if (mutatingProductsRef.current.has(id)) return;

      mutatingProductsRef.current.add(id);
      setIsMutating(true);
      setError(null);

      try {
        const data = await apiAddToWishlist(id);
        if (isMountedRef.current) {
          setWishlist(normalizeWishlist(data));
        }
      } catch (err) {
        if (!isMountedRef.current) return;

        // 409 WISHLIST_ITEM_EXISTS: item already in wishlist — reconcile by refreshing
        if (err?.status === 409 && err?.code === 'WISHLIST_ITEM_EXISTS') {
          await refreshWishlist();
        } else {
          setError(err);
        }
      } finally {
        mutatingProductsRef.current.delete(id);
        if (isMountedRef.current) {
          setIsMutating(mutatingProductsRef.current.size > 0);
        }
      }
    },
    [isAuthenticated, refreshWishlist]
  );

  /**
   * Remove a product from the wishlist.
   * Requires authentication. Returns and navigates to login if unauthenticated.
   *
   * @param {string} productId
   * @returns {Promise<void>}
   */
  const removeFromWishlist = useCallback(
    async (productId) => {
      if (!isAuthenticated) {
        const currentPath = typeof window !== 'undefined'
          ? window.location.pathname + window.location.search
          : '/';
        navigate(`/login?redirect=${encodeURIComponent(currentPath)}`);
        return;
      }

      const id = String(productId);
      if (mutatingProductsRef.current.has(id)) return;

      mutatingProductsRef.current.add(id);
      setIsMutating(true);
      setError(null);

      try {
        const data = await apiRemoveFromWishlist(id);
        if (isMountedRef.current) {
          setWishlist(normalizeWishlist(data));
        }
      } catch (err) {
        if (isMountedRef.current) {
          setError(err);
        }
      } finally {
        mutatingProductsRef.current.delete(id);
        if (isMountedRef.current) {
          setIsMutating(mutatingProductsRef.current.size > 0);
        }
      }
    },
    [isAuthenticated]
  );

  /**
   * Toggle a product in/out of the wishlist.
   * Redirects unauthenticated users to login preserving current path.
   *
   * @param {Object|string} productOrId - Product object (with ._id) or bare string ID
   * @returns {Promise<void>}
   */
  const toggleWishlist = useCallback(
    async (productOrId) => {
      if (!isAuthenticated) {
        const currentPath = typeof window !== 'undefined'
          ? window.location.pathname + window.location.search
          : '/';
        navigate(`/login?redirect=${encodeURIComponent(currentPath)}`);
        return;
      }

      const productId = typeof productOrId === 'object' && productOrId !== null
        ? String(productOrId._id || productOrId.id || '')
        : String(productOrId || '');

      if (!productId) return;

      if (isWishlisted(productId)) {
        await removeFromWishlist(productId);
      } else {
        await addToWishlist(productId);
      }
    },
    [isAuthenticated, isWishlisted, addToWishlist, removeFromWishlist]
  );

  /**
   * Clear all items from the wishlist.
   * Requires authentication.
   *
   * @returns {Promise<void>}
   */
  const clearWishlist = useCallback(async () => {
    if (!isAuthenticated) return;

    setIsMutating(true);
    setError(null);

    try {
      await apiClearWishlist();
      if (isMountedRef.current) {
        setWishlist(EMPTY_WISHLIST);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err);
      }
    } finally {
      if (isMountedRef.current) {
        setIsMutating(false);
      }
    }
  }, [isAuthenticated]);

  /**
   * Check whether a specific product is currently in a mutation state.
   *
   * @param {string} productId
   * @returns {boolean}
   */
  const isProductMutating = useCallback(
    (productId) => mutatingProductsRef.current.has(String(productId)),
    []
  );

  const value = useMemo(
    () => ({
      wishlist,
      isLoading: authLoading || isLoading,
      isMutating,
      error,
      refreshWishlist,
      addToWishlist,
      removeFromWishlist,
      toggleWishlist,
      clearWishlist,
      isWishlisted,
      isProductMutating,
    }),
    [
      wishlist,
      authLoading,
      isLoading,
      isMutating,
      error,
      refreshWishlist,
      addToWishlist,
      removeFromWishlist,
      toggleWishlist,
      clearWishlist,
      isWishlisted,
      isProductMutating,
    ]
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export default WishlistContext;
