/* eslint-disable react-refresh/only-export-components */
import { createContext, useState, useEffect, useCallback, useMemo } from 'react';
import { loginUser as apiLoginUser, loginAdmin as apiLoginAdmin, registerUser as apiRegisterUser, getCurrentUser as apiGetCurrentUser, logoutUser as apiLogoutUser } from './auth.service.js';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Clear any existing auth error message
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Logout handler — calls backend to clear the HttpOnly cookie
  const logout = useCallback(async () => {
    try {
      await apiLogoutUser();
    } catch {
      // Swallow network errors on logout; the local state cleanup still runs
    }
    setUser(null);
    setIsAuthenticated(false);
    setError(null);
  }, []);

  // Initialize session on mount by asking the server whether the cookie is valid
  useEffect(() => {
    let isMounted = true;

    async function initializeAuth() {
      try {
        const { user: currentUser } = await apiGetCurrentUser();
        if (isMounted) {
          if (currentUser) {
            setUser(currentUser);
            setIsAuthenticated(true);
            setError(null);
          } else {
            setUser(null);
            setIsAuthenticated(false);
          }
        }
      } catch (err) {
        if (!isMounted) return;

        if (err?.status === 429) {
          // Rate limited: do NOT invalidate user session or trigger login redirects; record error
          setError(err?.message || 'Too many requests. Please try again later.');
        } else if (err?.status === 401) {
          // 401 = no valid session (expired/absent cookie) — clean local state
          setUser(null);
          setIsAuthenticated(false);
          setError(null);
        } else {
          // Network or server error: treat as unauthenticated for safety
          setUser(null);
          setIsAuthenticated(false);
          setError(err?.message || null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    initializeAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  // Listen for session expiration events emitted by apiClient
  useEffect(() => {
    function handleSessionExpired(event) {
      setUser(null);
      setIsAuthenticated(false);
      setError(event?.detail?.message || 'Your session has expired. Please sign in again.');
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('commerceflow:session-expired', handleSessionExpired);
      return () => {
        window.removeEventListener('commerceflow:session-expired', handleSessionExpired);
      };
    }
  }, []);

  // Login action — cookie is set by the backend; we only store user identity in state
  const login = useCallback(async ({ email, password }) => {
    setError(null);
    const result = await apiLoginUser({ email, password });
    const { user: loggedInUser } = result;

    setUser(loggedInUser);
    setIsAuthenticated(true);
    setError(null);

    return result;
  }, []);

  // Admin login action
  const loginAdmin = useCallback(async ({ email, password }) => {
    setError(null);
    const result = await apiLoginAdmin({ email, password });
    const { user: loggedInUser } = result;

    setUser(loggedInUser);
    setIsAuthenticated(true);
    setError(null);

    return result;
  }, []);

  // Register action
  const register = useCallback(async ({ name, email, password }) => {
    setError(null);
    // 1. Create account on backend (returns { user })
    await apiRegisterUser({ name, email, password });

    // 2. Since backend does NOT return a token on register, immediately log in
    const loginResult = await apiLoginUser({ email, password });
    const { user: loggedInUser } = loginResult;

    setUser(loggedInUser);
    setIsAuthenticated(true);
    setError(null);

    return loginResult;
  }, []);

  // Refresh current user profile from server
  const refreshUser = useCallback(async () => {
    const { user: currentUser } = await apiGetCurrentUser();
    setUser(currentUser);
    return currentUser;
  }, []);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated,
      isLoading,
      error,
      login,
      loginAdmin,
      register,
      logout,
      clearError,
      refreshUser,
    }),
    [user, isAuthenticated, isLoading, error, login, loginAdmin, register, logout, clearError, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default AuthContext;
