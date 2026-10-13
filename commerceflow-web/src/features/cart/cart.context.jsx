/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import authModule from '../auth/auth.context.jsx';

export const AuthContext = authModule?.AuthContext || authModule;
import {
  getCart,
  addToCart as apiAddToCart,
  updateCartItem as apiUpdateCartItem,
  removeCartItem as apiRemoveCartItem,
  clearCart as apiClearCart,
  mergeCart as apiMergeCart,
  applyCoupon as apiApplyCoupon,
  removeCoupon as apiRemoveCoupon,
} from './cart.service.js';
import {
  GUEST_CART_STORAGE_KEY,
  getGuestCart,
  clearGuestCart,
  addGuestCartItem,
  updateGuestCartItem,
  removeGuestCartItem,
} from './guestCart.storage.js';
import { getProductById } from '../products/product.service.js';
import { ApiError } from '../../lib/apiClient.js';

const EMPTY_TOTALS = {
  itemCount: 0,
  totalQuantity: 0,
  subtotal: 0,
};

const EMPTY_CART = {
  items: [],
};

export const CartContext = createContext(null);

/**
 * Construct display cart and calculate provisional totals from guest items and product cache.
 * Pricing is strictly provisional/display only; authoritative pricing is determined on the server.
 *
 * @param {Array<{ productId: string, quantity: number }>} rawItems
 * @param {Map<string, Object>} productCache
 * @returns {{ cart: { items: Array<Object> }, totals: { itemCount: number, totalQuantity: number, subtotal: number } }}
 */
function computeGuestCartData(rawItems, productCache) {
  const hydratedItems = rawItems.map((item) => {
    const product = productCache.get(item.productId) || null;
    return {
      _id: item.productId,
      product,
      quantity: item.quantity,
    };
  });

  let totalQuantity = 0;
  let subtotal = 0;

  for (const item of hydratedItems) {
    totalQuantity += item.quantity;
    if (item.product && typeof item.product.price === 'number') {
      subtotal += item.product.price * item.quantity;
    }
  }

  return {
    cart: { items: hydratedItems },
    totals: {
      itemCount: hydratedItems.length,
      totalQuantity,
      subtotal,
    },
  };
}

export function CartProvider({ children }) {
  const auth = useContext(AuthContext);
  const isAuthenticated = Boolean(auth?.isAuthenticated);
  const authLoading = Boolean(auth?.isLoading);

  // Authenticated state (server authoritative)
  const [serverCart, setServerCart] = useState(null);
  const [serverTotals, setServerTotals] = useState(EMPTY_TOTALS);
  const [serverCoupon, setServerCoupon] = useState(null);
  const [serverFinancials, setServerFinancials] = useState(null);
  const [lastMergeReport, setLastMergeReport] = useState(null);

  // Guest state (localStorage + hydrated catalog items)
  const [guestCart, setGuestCart] = useState(EMPTY_CART);
  const [guestTotals, setGuestTotals] = useState(EMPTY_TOTALS);

  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
  const [isRemovingCoupon, setIsRemovingCoupon] = useState(false);
  const [couponError, setCouponError] = useState(null);
  const [error, setError] = useState(null);

  // Mutex lock to serialize and protect against overlapping authenticated mutations
  const isMutatingRef = useRef(false);
  const authRef = useRef(isAuthenticated);
  const guestRequestIdRef = useRef(0);
  const productCacheRef = useRef(new Map());

  // Merge lifecycle & duplicate-call protection guards
  const isMergingRef = useRef(false);
  const activeMergePromiseRef = useRef(null);
  const autoMergeAttemptedRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Synchronize authRef
  useEffect(() => {
    authRef.current = isAuthenticated;
  }, [isAuthenticated]);

  /**
   * Synchronize server-authoritative cart, coupon, and financials state.
   */
  const updateServerCartState = useCallback((data) => {
    if (!data) return;
    if (data.cart !== undefined) setServerCart(data.cart);
    if (data.totals !== undefined) setServerTotals(data.totals);
    setServerCoupon(data.coupon !== undefined ? data.coupon : null);
    setServerFinancials(data.financials !== undefined ? data.financials : null);
  }, []);

  /**
   * Hydrate catalog products for guest items without persisting metadata to storage.
   */
  const hydrateGuestItems = useCallback(async (rawItems, forceHydrate = false) => {
    const itemsToFetch = rawItems.filter((item) => {
      if (forceHydrate) return true;
      return !productCacheRef.current.has(item.productId);
    });

    if (itemsToFetch.length > 0) {
      await Promise.allSettled(
        itemsToFetch.map(async (item) => {
          try {
            const product = await getProductById(item.productId);
            if (product) {
              productCacheRef.current.set(item.productId, product);
            }
          } catch {
            // Temporary fetch or network error: do NOT destroy guest storage.
            // Item will render with product: null until rehydration succeeds.
          }
        })
      );
    }

    return computeGuestCartData(rawItems, productCacheRef.current);
  }, []);

  /**
   * Load and hydrate the guest cart from localStorage.
   */
  const loadGuestCart = useCallback(async (forceHydrate = false) => {
    if (authRef.current) return null;

    const raw = getGuestCart();
    if (raw.length === 0) {
      setGuestCart(EMPTY_CART);
      setGuestTotals(EMPTY_TOTALS);
      setIsLoading(false);
      return { cart: EMPTY_CART, totals: EMPTY_TOTALS };
    }

    const reqId = ++guestRequestIdRef.current;
    setIsLoading(true);

    try {
      const { cart: computedCart, totals: computedTotals } = await hydrateGuestItems(
        raw,
        forceHydrate
      );

      // Guard against stale async responses or auth transitions
      if (reqId === guestRequestIdRef.current && !authRef.current) {
        setGuestCart(computedCart);
        setGuestTotals(computedTotals);
        setError(null);
        return { cart: computedCart, totals: computedTotals };
      }
    } catch (err) {
      if (reqId === guestRequestIdRef.current && !authRef.current) {
        setError(err);
      }
    } finally {
      if (reqId === guestRequestIdRef.current) {
        setIsLoading(false);
      }
    }

    return null;
  }, [hydrateGuestItems]);

  /**
   * Orchestrate post-login/register guest -> authenticated cart merge.
   * - Sends ONLY productId and quantity to POST /api/v1/cart/merge.
   * - Server response is authoritative for cart, totals, and mergeReport.
   * - ONLY AFTER successful merge response and state update, guest storage is cleared.
   * - On failure, guest storage is preserved for retry and user remains authenticated.
   */
  const performMerge = useCallback(async (itemsToMerge) => {
    if (!authRef.current) {
      return null;
    }

    // In-memory guard against concurrent / duplicate merge calls
    if (isMergingRef.current && activeMergePromiseRef.current) {
      return activeMergePromiseRef.current;
    }

    const rawGuestItems = itemsToMerge || getGuestCart();
    if (!rawGuestItems || rawGuestItems.length === 0) {
      setIsLoading(true);
      setError(null);
      try {
        const data = await getCart();
        if (isMountedRef.current && authRef.current) {
          updateServerCartState(data);
        }
        return data;
      } catch (err) {
        if (isMountedRef.current && authRef.current) {
          setError(err);
        }
        throw err;
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    }

    isMergingRef.current = true;
    setIsLoading(true);
    setError(null);

    const mergePromise = (async () => {
      try {
        // Prepare payload: ONLY productId and quantity
        const payloadItems = rawGuestItems.map(({ productId, quantity }) => ({
          productId,
          quantity,
        }));

        const mergeResult = await apiMergeCart(payloadItems);

        if (isMountedRef.current && authRef.current) {
          updateServerCartState(mergeResult);
          if (mergeResult.mergeReport) {
            setLastMergeReport(mergeResult.mergeReport);
          }
          setGuestCart(EMPTY_CART);
          setGuestTotals(EMPTY_TOTALS);
          setError(null);
        }

        // MANDATORY: ONLY AFTER successful HTTP response and state update, clear guest storage
        clearGuestCart();

        return mergeResult;
      } catch (mergeError) {
        // MANDATORY: DO NOT clear guest localStorage on failure
        if (isMountedRef.current && authRef.current) {
          setError(mergeError);
          // Load fallback server cart so user can continue using their cart
          try {
            const serverData = await getCart();
            if (isMountedRef.current && authRef.current) {
              updateServerCartState(serverData);
            }
          } catch {
            // Ignore server cart fetch error
          }
        }
        throw mergeError;
      } finally {
        isMergingRef.current = false;
        activeMergePromiseRef.current = null;
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    })();

    activeMergePromiseRef.current = mergePromise;
    return mergePromise;
  }, [updateServerCartState]);

  /**
   * Explicit retry method for guest cart merge following a prior failure.
   */
  const retryGuestCartMerge = useCallback(async () => {
    if (!authRef.current) {
      const unauthErr = new ApiError({
        message: 'Cannot merge guest cart when unauthenticated',
        status: 401,
        code: 'UNAUTHENTICATED',
      });
      setError(unauthErr);
      throw unauthErr;
    }
    const currentGuestItems = getGuestCart();
    if (currentGuestItems.length === 0) {
      return null;
    }
    autoMergeAttemptedRef.current = false;
    return performMerge(currentGuestItems);
  }, [performMerge]);

  /**
   * Lifecycle & Auth Transitions:
   * - During authLoading: wait to prevent UI flicker.
   * - Transition to authenticated:
   *   - If guest storage has items: orchestrate merge into server cart.
   *   - If guest storage is empty: load server cart normally.
   *   - Guard against duplicate calls from StrictMode or rapid rerenders.
   * - Transition to unauthenticated (logout): switch to guest cart; do NOT copy server items to storage.
   */
  useEffect(() => {
    let isMounted = true;

    if (authLoading) {
      return;
    }

    if (isAuthenticated) {
      async function handleAuthenticatedInit() {
        if (activeMergePromiseRef.current) {
          try {
            await activeMergePromiseRef.current;
          } catch {
            // Handled inside performMerge
          }
          return;
        }

        const guestItems = getGuestCart();
        if (guestItems.length > 0 && !autoMergeAttemptedRef.current) {
          autoMergeAttemptedRef.current = true;
          try {
            await performMerge(guestItems);
          } catch {
            // performMerge sets error and loads server cart fallback
          }
        } else {
          setIsLoading(true);
          setError(null);
          try {
            const data = await getCart();
            if (isMounted && authRef.current) {
              updateServerCartState(data);
            }
          } catch (err) {
            if (isMounted && authRef.current) {
              setError(err);
            }
          } finally {
            if (isMounted) {
              setIsLoading(false);
            }
          }
        }
      }

      handleAuthenticatedInit();
    } else {
      // Switched to unauthenticated
      autoMergeAttemptedRef.current = false;
      isMergingRef.current = false;
      activeMergePromiseRef.current = null;

      async function initGuestCart() {
        setServerCart(null);
        setServerTotals(EMPTY_TOTALS);
        setServerCoupon(null);
        setServerFinancials(null);
        setCouponError(null);
        setLastMergeReport(null);
        await loadGuestCart();
      }

      initGuestCart();
    }

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, authLoading, loadGuestCart, performMerge, updateServerCartState]);

  /**
   * Storage synchronization:
   * Listen for changes to commerceflow_guest_cart made in other tabs/windows while unauthenticated.
   */
  useEffect(() => {
    if (isAuthenticated || authLoading) {
      return;
    }

    function handleStorageChange(event) {
      if (event.key === GUEST_CART_STORAGE_KEY || event.key === null) {
        loadGuestCart();
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handleStorageChange);
      return () => {
        window.removeEventListener('storage', handleStorageChange);
      };
    }
  }, [isAuthenticated, authLoading, loadGuestCart]);

  /**
   * Refresh cart:
   * - Authenticated: re-fetch server cart.
   * - Guest: re-read localStorage and rehydrate products.
   */
  const refreshCart = useCallback(async () => {
    if (isAuthenticated) {
      setIsLoading(true);
      setError(null);

      try {
        const data = await getCart();
        updateServerCartState(data);
        return data;
      } catch (err) {
        setError(err);
        throw err;
      } finally {
        setIsLoading(false);
      }
    } else {
      return loadGuestCart(true);
    }
  }, [isAuthenticated, loadGuestCart, updateServerCartState]);

  /**
   * Add to cart:
   * - Authenticated: calls POST /api/v1/cart/items on backend.
   * - Guest: persists productId + quantity in localStorage, hydrates catalog data, updates state.
   */
  const addToCart = useCallback(async (productId, quantity = 1) => {
    if (isAuthenticated) {
      if (isMutatingRef.current) {
        const conflictError = new ApiError({
          message: 'A cart update is already in progress',
          status: 409,
          code: 'CART_MUTATION_IN_PROGRESS',
        });
        throw conflictError;
      }

      isMutatingRef.current = true;
      setIsMutating(true);
      setError(null);

      try {
        const data = await apiAddToCart(productId, quantity);
        updateServerCartState(data);
        return data;
      } catch (err) {
        setError(err);
        throw err;
      } finally {
        isMutatingRef.current = false;
        setIsMutating(false);
      }
    }

    // Guest mode
    setError(null);
    const updatedRaw = addGuestCartItem(productId, quantity);

    if (!productCacheRef.current.has(productId)) {
      try {
        const product = await getProductById(productId);
        if (product) {
          productCacheRef.current.set(productId, product);
        }
      } catch {
        // Safe: item product remains null if network fetch fails
      }
    }

    const { cart: computedCart, totals: computedTotals } = computeGuestCartData(
      updatedRaw,
      productCacheRef.current
    );

    setGuestCart(computedCart);
    setGuestTotals(computedTotals);

    return { cart: computedCart, totals: computedTotals };
  }, [isAuthenticated, updateServerCartState]);

  /**
   * Update item quantity:
   * - Authenticated: calls PATCH /api/v1/cart/items/:productId.
   * - Guest: updates quantity in localStorage, removes if <= 0, preserves storage bounds.
   */
  const updateQuantity = useCallback(async (productId, quantity) => {
    if (isAuthenticated) {
      const num = Number(quantity);
      if (!Number.isInteger(num) || num < 1) {
        const qtyError = new ApiError({
          message: 'Quantity must be at least 1. To remove this item, use remove item.',
          status: 400,
          code: 'VALIDATION_ERROR',
          details: [{ field: 'quantity', message: 'Quantity must be at least 1' }],
        });
        setError(qtyError);
        throw qtyError;
      }

      if (isMutatingRef.current) {
        const conflictError = new ApiError({
          message: 'A cart update is already in progress',
          status: 409,
          code: 'CART_MUTATION_IN_PROGRESS',
        });
        throw conflictError;
      }

      isMutatingRef.current = true;
      setIsMutating(true);
      setError(null);

      try {
        const data = await apiUpdateCartItem(productId, num);
        updateServerCartState(data);
        return data;
      } catch (err) {
        setError(err);
        throw err;
      } finally {
        isMutatingRef.current = false;
        setIsMutating(false);
      }
    }

    // Guest mode
    setError(null);
    const updatedRaw = updateGuestCartItem(productId, quantity);

    const { cart: computedCart, totals: computedTotals } = computeGuestCartData(
      updatedRaw,
      productCacheRef.current
    );

    setGuestCart(computedCart);
    setGuestTotals(computedTotals);

    return { cart: computedCart, totals: computedTotals };
  }, [isAuthenticated, updateServerCartState]);

  /**
   * Remove item:
   * - Authenticated: calls DELETE /api/v1/cart/items/:productId.
   * - Guest: removes item from localStorage and updates state.
   */
  const removeItem = useCallback(async (productId) => {
    if (isAuthenticated) {
      if (isMutatingRef.current) {
        const conflictError = new ApiError({
          message: 'A cart update is already in progress',
          status: 409,
          code: 'CART_MUTATION_IN_PROGRESS',
        });
        throw conflictError;
      }

      isMutatingRef.current = true;
      setIsMutating(true);
      setError(null);

      try {
        const data = await apiRemoveCartItem(productId);
        updateServerCartState(data);
        return data;
      } catch (err) {
        setError(err);
        throw err;
      } finally {
        isMutatingRef.current = false;
        setIsMutating(false);
      }
    }

    // Guest mode
    setError(null);
    const updatedRaw = removeGuestCartItem(productId);

    const { cart: computedCart, totals: computedTotals } = computeGuestCartData(
      updatedRaw,
      productCacheRef.current
    );

    setGuestCart(computedCart);
    setGuestTotals(computedTotals);

    return { cart: computedCart, totals: computedTotals };
  }, [isAuthenticated, updateServerCartState]);

  /**
   * Clear cart:
   * - Authenticated: calls DELETE /api/v1/cart on backend.
   * - Guest: clears localStorage and resets guest state.
   */
  const clearCart = useCallback(async () => {
    if (isAuthenticated) {
      if (isMutatingRef.current) {
        const conflictError = new ApiError({
          message: 'A cart update is already in progress',
          status: 409,
          code: 'CART_MUTATION_IN_PROGRESS',
        });
        throw conflictError;
      }

      isMutatingRef.current = true;
      setIsMutating(true);
      setError(null);

      try {
        const data = await apiClearCart();
        updateServerCartState(data);
        return data;
      } catch (err) {
        setError(err);
        throw err;
      } finally {
        isMutatingRef.current = false;
        setIsMutating(false);
      }
    }

    // Guest mode
    setError(null);
    clearGuestCart();
    setGuestCart(EMPTY_CART);
    setGuestTotals(EMPTY_TOTALS);

    return { cart: EMPTY_CART, totals: EMPTY_TOTALS };
  }, [isAuthenticated, updateServerCartState]);

  /**
   * Apply a promotional coupon to the authenticated user's cart.
   * Server is strictly authoritative for coupon validity, eligibility, and financial calculation.
   *
   * @param {string} code - Coupon code (e.g. "SAVE10")
   * @returns {Promise<Object>} Server cart response including updated coupon and financials
   */
  const applyCoupon = useCallback(async (code) => {
    if (!authRef.current) {
      const authErr = new ApiError({
        message: 'Please sign in to apply a promotional coupon',
        status: 401,
        code: 'AUTH_REQUIRED',
      });
      setCouponError(authErr);
      throw authErr;
    }

    const cleanCode = typeof code === 'string' ? code.trim() : '';
    if (!cleanCode) {
      const validationErr = new ApiError({
        message: 'Coupon code cannot be empty',
        status: 400,
        code: 'VALIDATION_ERROR',
        details: [{ field: 'code', message: 'Coupon code is required' }],
      });
      setCouponError(validationErr);
      throw validationErr;
    }

    if (isMutatingRef.current) {
      const conflictError = new ApiError({
        message: 'A cart operation is already in progress',
        status: 409,
        code: 'CART_MUTATION_IN_PROGRESS',
      });
      throw conflictError;
    }

    isMutatingRef.current = true;
    setIsMutating(true);
    setIsApplyingCoupon(true);
    setCouponError(null);

    try {
      const data = await apiApplyCoupon(cleanCode);
      if (isMountedRef.current && authRef.current) {
        updateServerCartState(data);
      }
      return data;
    } catch (err) {
      if (isMountedRef.current) {
        setCouponError(err);
      }
      throw err;
    } finally {
      isMutatingRef.current = false;
      if (isMountedRef.current) {
        setIsMutating(false);
        setIsApplyingCoupon(false);
      }
    }
  }, [updateServerCartState]);

  /**
   * Remove any active coupon from the authenticated user's cart.
   *
   * @returns {Promise<Object>} Server cart response with coupon removed and updated financials
   */
  const removeCoupon = useCallback(async () => {
    if (!authRef.current) {
      const authErr = new ApiError({
        message: 'Please sign in to manage coupons',
        status: 401,
        code: 'AUTH_REQUIRED',
      });
      setCouponError(authErr);
      throw authErr;
    }

    if (isMutatingRef.current) {
      const conflictError = new ApiError({
        message: 'A cart operation is already in progress',
        status: 409,
        code: 'CART_MUTATION_IN_PROGRESS',
      });
      throw conflictError;
    }

    isMutatingRef.current = true;
    setIsMutating(true);
    setIsRemovingCoupon(true);
    setCouponError(null);

    try {
      const data = await apiRemoveCoupon();
      if (isMountedRef.current && authRef.current) {
        updateServerCartState(data);
      }
      return data;
    } catch (err) {
      if (isMountedRef.current) {
        setCouponError(err);
      }
      throw err;
    } finally {
      isMutatingRef.current = false;
      if (isMountedRef.current) {
        setIsMutating(false);
        setIsRemovingCoupon(false);
      }
    }
  }, [updateServerCartState]);

  // Active cart, coupon, and financials selection based on current authentication mode
  const activeCart = isAuthenticated ? serverCart : (authLoading ? null : guestCart);
  const activeTotals = isAuthenticated ? serverTotals : (authLoading ? EMPTY_TOTALS : guestTotals);
  const activeCoupon = isAuthenticated ? serverCoupon : null;
  const activeFinancials = isAuthenticated
    ? (serverFinancials || {
        subtotal: serverTotals.subtotal,
        shippingAmount: serverTotals.shippingAmount || 0,
        taxAmount: serverTotals.taxAmount || 0,
        discountAmount: serverTotals.discountAmount || 0,
        total: serverTotals.total || serverTotals.subtotal,
      })
    : {
        subtotal: guestTotals.subtotal,
        shippingAmount: 0,
        taxAmount: 0,
        discountAmount: 0,
        total: guestTotals.subtotal,
      };

  const value = {
    cart: activeCart,
    totals: activeTotals,
    coupon: activeCoupon,
    financials: activeFinancials,
    isApplyingCoupon,
    isRemovingCoupon,
    couponError,
    applyCoupon,
    removeCoupon,
    isLoading: authLoading || isLoading,
    isMutating,
    error,
    lastMergeReport,
    retryGuestCartMerge,
    refreshCart,
    addToCart,
    updateQuantity,
    removeItem,
    clearCart,
  };

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
}

export default CartContext;
