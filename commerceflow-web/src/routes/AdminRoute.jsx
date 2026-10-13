import { useEffect } from 'react';
import { useAuth } from '../features/auth/useAuth.js';
import { navigate } from '../lib/utils.js';

/**
 * Route guard component for administrator-only routes.
 *
 * - Shows loading state during initial session check.
 * - Redirects unauthenticated users to /login preserving intended destination.
 * - Renders an Access Denied (403) interface if authenticated as a customer (without logging them out).
 * - Renders children when authenticated as an admin.
 */
export default function AdminRoute({ children }) {
  const { user, isAuthenticated, isLoading, error } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !error && typeof window !== 'undefined') {
      const currentPath = window.location.pathname + window.location.search;
      const redirectUrl = `/admin/login?redirect=${encodeURIComponent(currentPath)}`;
      navigate(redirectUrl);
    }
  }, [isLoading, isAuthenticated, error]);

  if (isLoading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-8 text-slate-500">
        <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium">Verifying administrator privileges...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto">
        <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-100 mb-4">
          <svg className="w-6 h-6 stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
        </div>
        <p className="text-slate-800 text-sm font-semibold mb-2">Unable to verify administrator session</p>
        <p className="text-slate-500 text-xs mb-4">{error}</p>
        <button
          type="button"
          onClick={() => {
            if (typeof window !== 'undefined') window.location.reload();
          }}
          className="text-xs bg-slate-900 text-white font-medium px-4 py-2 rounded-xl hover:bg-slate-800 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!isAuthenticated) {
    const redirectUrl = `/admin/login?redirect=${encodeURIComponent(
      typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/admin'
    )}`;

    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-8 text-center">
        <p className="text-slate-600 text-sm mb-3">Redirecting to administrator login...</p>
        <a href={redirectUrl} className="text-blue-600 hover:underline text-xs">
          Click here if not redirected automatically
        </a>
      </div>
    );
  }

  // User is authenticated, but not an admin (strictly aligns with backend role contract)
  const isAdmin = user?.role === 'admin';
  if (!isAdmin) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200/80 p-8 shadow-xs text-center space-y-5">
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-100">
            <svg className="w-6 h-6 stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-bold text-slate-900">Access Denied</h1>
            <p className="text-sm text-slate-500 leading-relaxed">
              You do not have administrative privileges to view this area. You remain signed in as an authenticated customer.
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href="/"
              className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors shadow-xs"
            >
              Return to Storefront
            </a>
            <a
              href="/admin/login"
              className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors shadow-xs"
            >
              Sign In as Administrator
            </a>
          </div>
        </div>
      </div>
    );
  }

  return children;
}
