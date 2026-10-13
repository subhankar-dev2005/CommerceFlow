import { useEffect } from 'react';
import { useAuth } from '../features/auth/useAuth.js';
import { navigate } from '../lib/utils.js';

/**
 * Route guard component for authenticated users.
 *
 * - Shows loading state during initial session check.
 * - Redirects unauthenticated users to /login preserving intended destination in query param.
 * - Renders children when authenticated.
 */
export default function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated && typeof window !== 'undefined') {
      const currentPath = window.location.pathname + window.location.search;
      const redirectUrl = `/login?redirect=${encodeURIComponent(currentPath)}`;
      navigate(redirectUrl);
    }
  }, [isLoading, isAuthenticated]);

  if (isLoading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-8 text-slate-500">
        <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium">Verifying authentication...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    const redirectUrl = `/login?redirect=${encodeURIComponent(
      typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/'
    )}`;

    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-8 text-center">
        <p className="text-slate-600 text-sm mb-3">Redirecting to login...</p>
        <a href={redirectUrl} className="text-blue-600 hover:underline text-xs">
          Click here if not redirected automatically
        </a>
      </div>
    );
  }

  return children;
}
