/* eslint-disable react-refresh/only-export-components */
import { createContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../auth/useAuth.js';
import {
  getAddresses as apiGetAddresses,
  createAddress as apiCreateAddress,
  updateAddress as apiUpdateAddress,
  setDefaultAddress as apiSetDefaultAddress,
  deleteAddress as apiDeleteAddress,
} from './address.service.js';
import { ApiError } from '../../lib/apiClient.js';

function createAbortController() {
  if (typeof window !== 'undefined' && typeof window.AbortController !== 'undefined') {
    return new window.AbortController();
  }
  return null;
}

export const AddressContext = createContext(null);

export function AddressProvider({ children }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [addresses, setAddresses] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState(null);

  // Mutex lock to protect against overlapping address mutations
  const isMutatingRef = useRef(false);
  const prevAuthRef = useRef(isAuthenticated);
  const hasLoadedRef = useRef(false);
  const isFetchingRef = useRef(false);
  const abortControllerRef = useRef(null);
  const reqSeqRef = useRef(0);
  const addressesRef = useRef(addresses);

  useEffect(() => {
    addressesRef.current = addresses;
  }, [addresses]);

  // Authentication Lifecycle:
  // When session ends/expires, immediately clear addresses, cancel in-flight requests, and reset flags.
  useEffect(() => {
    if (prevAuthRef.current && !isAuthenticated) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      reqSeqRef.current += 1;
      hasLoadedRef.current = false;
      isFetchingRef.current = false;
      setAddresses([]);
      setError(null);
      setIsLoading(false);
      setIsMutating(false);
      isMutatingRef.current = false;
    }
    prevAuthRef.current = isAuthenticated;
  }, [isAuthenticated]);

  // Refresh addresses from backend on demand
  const refreshAddresses = useCallback(
    async (options = {}) => {
      if (!isAuthenticated) {
        setAddresses([]);
        setError(null);
        return [];
      }

      // If another fetch is already in flight and not explicitly forced, return cached addresses
      if (isFetchingRef.current && !options?.force) {
        return addressesRef.current;
      }

      // Abort any previous query in-flight
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const abortController = createAbortController();
      abortControllerRef.current = abortController;
      const reqId = ++reqSeqRef.current;

      isFetchingRef.current = true;
      setIsLoading(true);
      setError(null);

      try {
        const data = await apiGetAddresses(abortController ? { signal: abortController.signal } : {});
        if (reqId === reqSeqRef.current) {
          setAddresses(data);
          hasLoadedRef.current = true;
          setError(null);
        }
        return data;
      } catch (err) {
        if (err?.name === 'AbortError') {
          return addressesRef.current;
        }
        if (reqId === reqSeqRef.current) {
          setError(err);
        }
        throw err;
      } finally {
        if (reqId === reqSeqRef.current) {
          isFetchingRef.current = false;
          setIsLoading(false);
        }
      }
    },
    [isAuthenticated]
  );

  // Load addresses once when authenticated (with in-flight guard, StrictMode abort safety, and 429 protection)
  useEffect(() => {
    if (!isAuthenticated || authLoading) {
      isMutatingRef.current = false;
      return;
    }

    // Do not re-fetch if already loaded in this session or if a fetch is already in-flight
    if (hasLoadedRef.current || isFetchingRef.current) {
      return;
    }

    const abortController = createAbortController();
    abortControllerRef.current = abortController;
    const reqId = ++reqSeqRef.current;

    isFetchingRef.current = true;
    setIsLoading(true);
    setError(null);

    apiGetAddresses(abortController ? { signal: abortController.signal } : {})
      .then((data) => {
        if (reqId === reqSeqRef.current) {
          setAddresses(data);
          hasLoadedRef.current = true;
          setError(null);
        }
      })
      .catch((err) => {
        if (err?.name === 'AbortError') {
          return;
        }
        if (reqId === reqSeqRef.current) {
          setError(err);
          // If rate limited (429), mark as loaded so effects do not loop
          if (err?.status === 429) {
            hasLoadedRef.current = true;
          }
        }
      })
      .finally(() => {
        if (reqId === reqSeqRef.current) {
          isFetchingRef.current = false;
          setIsLoading(false);
        }
      });

    return () => {
      abortController?.abort();
      isFetchingRef.current = false;
    };
  }, [isAuthenticated, authLoading]);

  // Create address mutation
  const createAddress = useCallback(
    async (data) => {
      if (!isAuthenticated) {
        const authError = new ApiError({
          message: 'Please sign in to manage your addresses',
          status: 401,
          code: 'AUTH_REQUIRED',
        });
        setError(authError);
        throw authError;
      }

      if (isMutatingRef.current) {
        const conflictError = new ApiError({
          message: 'An address operation is already in progress',
          status: 409,
          code: 'ADDRESS_MUTATION_IN_PROGRESS',
        });
        throw conflictError;
      }

      isMutatingRef.current = true;
      setIsMutating(true);
      setError(null);

      try {
        const created = await apiCreateAddress(data);
        // Re-fetch authoritative list so default flags and sorting match backend
        const refreshed = await apiGetAddresses();
        setAddresses(refreshed);
        hasLoadedRef.current = true;
        return created;
      } catch (err) {
        setError(err);
        throw err;
      } finally {
        isMutatingRef.current = false;
        setIsMutating(false);
      }
    },
    [isAuthenticated]
  );

  // Update address mutation
  const updateAddress = useCallback(
    async (addressId, data) => {
      if (!isAuthenticated) {
        const authError = new ApiError({
          message: 'Please sign in to manage your addresses',
          status: 401,
          code: 'AUTH_REQUIRED',
        });
        setError(authError);
        throw authError;
      }

      if (isMutatingRef.current) {
        const conflictError = new ApiError({
          message: 'An address operation is already in progress',
          status: 409,
          code: 'ADDRESS_MUTATION_IN_PROGRESS',
        });
        throw conflictError;
      }

      isMutatingRef.current = true;
      setIsMutating(true);
      setError(null);

      try {
        const updated = await apiUpdateAddress(addressId, data);
        // Re-fetch authoritative list
        const refreshed = await apiGetAddresses();
        setAddresses(refreshed);
        hasLoadedRef.current = true;
        return updated;
      } catch (err) {
        setError(err);
        throw err;
      } finally {
        isMutatingRef.current = false;
        setIsMutating(false);
      }
    },
    [isAuthenticated]
  );

  // Set default address mutation
  const setDefaultAddress = useCallback(
    async (addressId) => {
      if (!isAuthenticated) {
        const authError = new ApiError({
          message: 'Please sign in to manage your addresses',
          status: 401,
          code: 'AUTH_REQUIRED',
        });
        setError(authError);
        throw authError;
      }

      if (isMutatingRef.current) {
        const conflictError = new ApiError({
          message: 'An address operation is already in progress',
          status: 409,
          code: 'ADDRESS_MUTATION_IN_PROGRESS',
        });
        throw conflictError;
      }

      isMutatingRef.current = true;
      setIsMutating(true);
      setError(null);

      try {
        const updated = await apiSetDefaultAddress(addressId);
        // Re-fetch authoritative list with updated default ordering
        const refreshed = await apiGetAddresses();
        setAddresses(refreshed);
        hasLoadedRef.current = true;
        return updated;
      } catch (err) {
        setError(err);
        throw err;
      } finally {
        isMutatingRef.current = false;
        setIsMutating(false);
      }
    },
    [isAuthenticated]
  );

  // Delete address mutation
  const deleteAddress = useCallback(
    async (addressId) => {
      if (!isAuthenticated) {
        const authError = new ApiError({
          message: 'Please sign in to manage your addresses',
          status: 401,
          code: 'AUTH_REQUIRED',
        });
        setError(authError);
        throw authError;
      }

      if (isMutatingRef.current) {
        const conflictError = new ApiError({
          message: 'An address operation is already in progress',
          status: 409,
          code: 'ADDRESS_MUTATION_IN_PROGRESS',
        });
        throw conflictError;
      }

      isMutatingRef.current = true;
      setIsMutating(true);
      setError(null);

      try {
        const result = await apiDeleteAddress(addressId);
        // Re-fetch authoritative list (handles automatic promotion of new default if previous was deleted)
        const refreshed = await apiGetAddresses();
        setAddresses(refreshed);
        hasLoadedRef.current = true;
        return result;
      } catch (err) {
        setError(err);
        throw err;
      } finally {
        isMutatingRef.current = false;
        setIsMutating(false);
      }
    },
    [isAuthenticated]
  );

  const value = useMemo(
    () => ({
      addresses: isAuthenticated ? addresses : [],
      isLoading,
      isMutating,
      error,
      refreshAddresses,
      createAddress,
      updateAddress,
      setDefaultAddress,
      deleteAddress,
    }),
    [
      isAuthenticated,
      addresses,
      isLoading,
      isMutating,
      error,
      refreshAddresses,
      createAddress,
      updateAddress,
      setDefaultAddress,
      deleteAddress,
    ]
  );

  return (
    <AddressContext.Provider value={value}>
      {children}
    </AddressContext.Provider>
  );
}

export default AddressContext;
