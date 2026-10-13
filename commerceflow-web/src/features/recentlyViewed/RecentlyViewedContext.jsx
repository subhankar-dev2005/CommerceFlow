/* eslint-disable react-refresh/only-export-components */
/* eslint-disable react-hooks/set-state-in-effect */
import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import authContextModule from '../auth/auth.context.jsx';
import {
  recordRecentlyViewed as apiRecordRecentlyViewed,
  getRecentlyViewed as apiGetRecentlyViewed,
  clearRecentlyViewed as apiClearRecentlyViewed,
  mergeRecentlyViewed as apiMergeRecentlyViewed
} from './recentlyViewed.service.js';
import {
  getGuestRecentlyViewed,
  addGuestRecentlyViewed,
  clearGuestRecentlyViewed,
  isValidProductId
} from './recentlyViewed.storage.js';
import { getProductById } from '../products/product.service.js';

// Resolve shared AuthContext
export const AuthContext = authContextModule?.AuthContext || authContextModule?.default || authContextModule;

export const RecentlyViewedContext = createContext(null);

/**
 * Deduplication dwell window (milliseconds) to prevent rapid duplicate network writes.
 */
const RECORD_DWELL_MS = 2000;

export function RecentlyViewedProvider({ children }) {
  const auth = useContext(AuthContext);
  const isAuthenticated = Boolean(auth?.isAuthenticated);
  const authLoading = Boolean(auth?.isLoading);
  const currentUserId = auth?.user?._id || auth?.user?.id || null;

  const [recentlyViewed, setRecentlyViewed] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState(null);

  const isMountedRef = useRef(true);
  const authRef = useRef(isAuthenticated);
  const userIdRef = useRef(currentUserId);
  const activeRequestIdRef = useRef(0);
  const isMergingRef = useRef(false);

  // In-memory cache for guest hydrated product details to avoid redundant network lookups
  const productCacheRef = useRef(new Map());

  // Deduplication tracker: productId -> timestamp
  const lastRecordedMapRef = useRef(new Map());
  const inFlightRecordSetRef = useRef(new Set());

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    authRef.current = isAuthenticated;
    userIdRef.current = currentUserId;
  }, [isAuthenticated, currentUserId]);

  /**
   * Hydrates guest product IDs into full storefront product representations.
   */
  const hydrateGuestProducts = useCallback(async (productIds) => {
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return [];
    }

    const items = await Promise.all(
      productIds.map(async (id) => {
        if (productCacheRef.current.has(id)) {
          const cached = productCacheRef.current.get(id);
          return cached ? { viewedAt: null, product: cached } : null;
        }

        try {
          const product = await getProductById(id);
          if (product && product.isActive) {
            productCacheRef.current.set(id, product);
            return { viewedAt: null, product };
          }
          // Product inactive or 404
          productCacheRef.current.set(id, null);
          return null;
        } catch {
          // Network or temporary error: preserve without crashing
          return null;
        }
      })
    );

    return items.filter(Boolean);
  }, []);

  /**
   * Refreshes recently viewed items from the appropriate source (server or guest storage).
   */
  const refreshRecentlyViewed = useCallback(async () => {
    if (!isMountedRef.current) return;

    const reqId = ++activeRequestIdRef.current;
    const capturedUserId = userIdRef.current;
    const capturedIsAuth = authRef.current;
    setIsLoading(true);
    setError(null);

    try {
      if (capturedIsAuth) {
        const data = await apiGetRecentlyViewed();
        if (
          isMountedRef.current &&
          reqId === activeRequestIdRef.current &&
          authRef.current &&
          userIdRef.current === capturedUserId
        ) {
          setRecentlyViewed(Array.isArray(data?.items) ? data.items : []);
        }
      } else {
        const guestIds = getGuestRecentlyViewed();
        const hydrated = await hydrateGuestProducts(guestIds);
        if (
          isMountedRef.current &&
          reqId === activeRequestIdRef.current &&
          !authRef.current &&
          userIdRef.current === null
        ) {
          setRecentlyViewed(hydrated);
        }
      }
    } catch (err) {
      if (
        isMountedRef.current &&
        reqId === activeRequestIdRef.current &&
        userIdRef.current === capturedUserId
      ) {
        setError(err);
      }
    } finally {
      if (
        isMountedRef.current &&
        reqId === activeRequestIdRef.current &&
        userIdRef.current === capturedUserId
      ) {
        setIsLoading(false);
      }
    }
  }, [hydrateGuestProducts]);

  /**
   * Synchronize guest history on login and handle auth state transitions.
   */
  useEffect(() => {
    if (authLoading) return;

    const reqId = ++activeRequestIdRef.current;
    const capturedUserId = currentUserId;
    setIsLoading(true);
    setError(null);

    if (isAuthenticated) {
      void (async () => {
        const guestIds = getGuestRecentlyViewed();

        if (guestIds.length > 0 && !isMergingRef.current) {
          isMergingRef.current = true;
          try {
            await apiMergeRecentlyViewed(guestIds);
            // Clear guest localStorage ONLY after successful server merge
            clearGuestRecentlyViewed();
          } catch (mergeErr) {
            // Failure-isolated: preserve guest localStorage for retry; do NOT log out or block user
            if (
              isMountedRef.current &&
              reqId === activeRequestIdRef.current &&
              userIdRef.current === capturedUserId
            ) {
              setError(mergeErr);
            }
          } finally {
            isMergingRef.current = false;
          }
        }

        // Fetch authoritative server history
        try {
          const serverData = await apiGetRecentlyViewed();
          if (
            isMountedRef.current &&
            reqId === activeRequestIdRef.current &&
            authRef.current &&
            userIdRef.current === capturedUserId
          ) {
            setRecentlyViewed(Array.isArray(serverData?.items) ? serverData.items : []);
          }
        } catch (fetchErr) {
          if (
            isMountedRef.current &&
            reqId === activeRequestIdRef.current &&
            authRef.current &&
            userIdRef.current === capturedUserId
          ) {
            setError(fetchErr);
          }
        } finally {
          if (
            isMountedRef.current &&
            reqId === activeRequestIdRef.current &&
            userIdRef.current === capturedUserId
          ) {
            setIsLoading(false);
          }
        }
      })();
    } else {
      // User logged out: clear server data from memory immediately; load guest storage without leakage
      setRecentlyViewed([]);
      void (async () => {
        try {
          const guestIds = getGuestRecentlyViewed();
          const hydrated = await hydrateGuestProducts(guestIds);
          if (
            isMountedRef.current &&
            reqId === activeRequestIdRef.current &&
            !authRef.current &&
            userIdRef.current === null
          ) {
            setRecentlyViewed(hydrated);
          }
        } catch {
          if (
            isMountedRef.current &&
            reqId === activeRequestIdRef.current &&
            !authRef.current &&
            userIdRef.current === null
          ) {
            setRecentlyViewed([]);
          }
        } finally {
          if (
            isMountedRef.current &&
            reqId === activeRequestIdRef.current &&
            userIdRef.current === null
          ) {
            setIsLoading(false);
          }
        }
      })();
    }
  }, [isAuthenticated, authLoading, currentUserId, hydrateGuestProducts]);

  /**
   * Record a viewed product with guard against duplicate render triggers.
   */
  const recordRecentlyViewed = useCallback(async (productId) => {
    if (!isValidProductId(productId)) return;

    const now = Date.now();
    const lastRecorded = lastRecordedMapRef.current.get(productId) || 0;

    // Deduplication guard: ignore calls if currently in flight or recorded within dwell window
    if (inFlightRecordSetRef.current.has(productId) || (now - lastRecorded < RECORD_DWELL_MS)) {
      return;
    }

    const capturedUserId = userIdRef.current;
    const capturedIsAuth = authRef.current;
    inFlightRecordSetRef.current.add(productId);
    lastRecordedMapRef.current.set(productId, now);
    setIsRecording(true);

    try {
      if (capturedIsAuth) {
        await apiRecordRecentlyViewed(productId);
        // Refresh authenticated history in background only if identity is unchanged
        if (
          isMountedRef.current &&
          authRef.current &&
          userIdRef.current === capturedUserId
        ) {
          const data = await apiGetRecentlyViewed();
          if (
            isMountedRef.current &&
            authRef.current &&
            userIdRef.current === capturedUserId
          ) {
            setRecentlyViewed(Array.isArray(data?.items) ? data.items : []);
          }
        }
      } else {
        const updatedIds = addGuestRecentlyViewed(productId);
        const hydrated = await hydrateGuestProducts(updatedIds);
        if (
          isMountedRef.current &&
          !authRef.current &&
          userIdRef.current === null
        ) {
          setRecentlyViewed(hydrated);
        }
      }
    } catch (err) {
      // Non-critical enhancement: silently track error without crashing ProductPage
      if (
        isMountedRef.current &&
        (capturedIsAuth ? userIdRef.current === capturedUserId : !authRef.current)
      ) {
        setError(err);
      }
    } finally {
      inFlightRecordSetRef.current.delete(productId);
      if (isMountedRef.current) {
        setIsRecording(inFlightRecordSetRef.current.size > 0);
      }
    }
  }, [hydrateGuestProducts]);

  /**
   * Clear all recently viewed history.
   */
  const clearRecentlyViewed = useCallback(async () => {
    const capturedUserId = userIdRef.current;
    const capturedIsAuth = authRef.current;
    setIsLoading(true);
    setError(null);

    try {
      if (capturedIsAuth) {
        await apiClearRecentlyViewed();
      } else {
        clearGuestRecentlyViewed();
      }
      if (
        isMountedRef.current &&
        (capturedIsAuth ? userIdRef.current === capturedUserId : !authRef.current)
      ) {
        setRecentlyViewed([]);
      }
    } catch (err) {
      if (
        isMountedRef.current &&
        (capturedIsAuth ? userIdRef.current === capturedUserId : !authRef.current)
      ) {
        setError(err);
      }
      throw err;
    } finally {
      if (
        isMountedRef.current &&
        (capturedIsAuth ? userIdRef.current === capturedUserId : !authRef.current)
      ) {
        setIsLoading(false);
      }
    }
  }, []);

  const value = useMemo(() => ({
    recentlyViewed,
    isLoading,
    isRecording,
    error,
    recordRecentlyViewed,
    refreshRecentlyViewed,
    clearRecentlyViewed
  }), [
    recentlyViewed,
    isLoading,
    isRecording,
    error,
    recordRecentlyViewed,
    refreshRecentlyViewed,
    clearRecentlyViewed
  ]);

  return (
    <RecentlyViewedContext.Provider value={value}>
      {children}
    </RecentlyViewedContext.Provider>
  );
}

RecentlyViewedProvider.RecentlyViewedContext = RecentlyViewedContext;
RecentlyViewedContext.RecentlyViewedContext = RecentlyViewedContext;
RecentlyViewedContext.RecentlyViewedProvider = RecentlyViewedProvider;

export default RecentlyViewedContext;
