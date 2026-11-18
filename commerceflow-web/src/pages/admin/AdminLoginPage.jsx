import React, { useState, useId, useEffect, useRef } from 'react';
import { useAuth } from '../../features/auth/useAuth.js';
import { useBranding } from '../../features/branding/useBranding.js';
import Button from '../../components/Button.jsx';
import { navigate } from '../../lib/utils.js';
import { getSafeAdminRedirect } from '../../lib/redirect.js';

/**
 * AdminLoginPage Component
 *
 * Dedicated administrative login portal with direct email + password authentication.
 * In accordance with the Owner Governance Amendment (DEC-01 / DEC-03 Option 3B):
 * - Direct authentication via email and password only.
 * - Zero MFA challenge prompts, TOTP inputs, or forced enrollment setup screens.
 * - Navigates directly to the administrative dashboard upon credential validation.
 */
export default function AdminLoginPage() {
  const auth = useAuth();
  const { user, isAuthenticated, isLoading, loginAdmin, error: authError, clearError } = auth;
  const { branding, resolvedLogoUrl } = useBranding();
  const [logoError, setLogoError] = useState(false);

  useEffect(() => {
    setLogoError(false);
  }, [resolvedLogoUrl]);

  // Form states
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);

  const emailId = useId();
  const passwordId = useId();

  const getRedirectUrl = () => {
    if (typeof window === 'undefined') return '/admin/dashboard';
    const search = window.location.search || '';
    const match = search.match(/[?&]redirect=([^&]+)/);
    const rawRedirect = match ? decodeURIComponent(match[1]) : '/admin/dashboard';
    return getSafeAdminRedirect(rawRedirect, '/admin/dashboard');
  };

  // If already authenticated as an administrator, automatically navigate to dashboard
  useEffect(() => {
    if (!isLoading && isAuthenticated && (user?.role === 'admin' || user?.role === 'super_admin') && typeof window !== 'undefined') {
      const destination = getRedirectUrl();
      navigate(destination);
    }
  }, [isLoading, isAuthenticated, user]);

  // Password Login Handler
  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (isSubmittingRef.current || isSubmitting) {
      return;
    }

    setServerError('');

    const errors = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!formData.email.trim()) {
      errors.email = 'Administrator email address is required.';
    } else if (!emailRegex.test(formData.email.trim())) {
      errors.email = 'Please enter a valid email address.';
    }

    if (!formData.password) {
      errors.password = 'Password is required.';
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      const result = await loginAdmin({
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
      });

      if (result?.user) {
        const destination = getRedirectUrl();
        navigate(destination);
      }
    } catch (err) {
      if (err?.code === 'INVALID_CREDENTIALS') {
        setServerError('Invalid administrator email or password.');
      } else if (err?.code === 'AUTH_RATE_LIMIT_EXCEEDED') {
        setServerError('Too many authentication attempts. Please try again later.');
      } else if (err?.code === 'ACCOUNT_DEACTIVATED') {
        setServerError('This administrator account has been deactivated.');
      } else if (err?.code === 'VALIDATION_ERROR' && Array.isArray(err?.details)) {
        const backendFieldErrors = {};
        err.details.forEach((detail) => {
          if (detail.field) {
            backendFieldErrors[detail.field] = detail.message;
          }
        });
        setFieldErrors(backendFieldErrors);
        setServerError(err.message || 'Please check the errors below.');
      } else if (err?.code === 'NETWORK_ERROR' || err?.status === 0) {
        setServerError('Unable to connect to CommerceFlow API server. Please check your network connection or verify the backend server is running on port 4000.');
      } else {
        setServerError(err?.message || 'Unable to sign in. Please try again.');
      }
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const isCustomerLoggedIn = isAuthenticated && user?.role === 'customer';

  return (
    <div className="min-h-screen bg-[#F4F6F4] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        {/* Brand Shield Badge / Custom Logo */}
        {resolvedLogoUrl && !logoError ? (
          <img
            src={resolvedLogoUrl}
            alt={branding?.logoAlt || 'CommerceFlow Admin'}
            className="inline-block w-14 h-14 rounded-2xl object-contain bg-[#0B2820] p-1 shadow-md mb-4 border border-[#164032]"
            onError={() => setLogoError(true)}
          />
        ) : (
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#0B2820] text-emerald-400 shadow-md mb-4 border border-[#164032]">
            <svg className="w-7 h-7 stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
        )}

        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {branding?.storeName ? `${branding.storeName} Admin` : 'CommerceFlow Admin'}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Administrator Sign In
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-sm border border-slate-200/80 rounded-2xl sm:px-10">
          {/* Active Customer Notification Banner */}
          {isCustomerLoggedIn && (
            <div className="mb-6 rounded-xl bg-amber-50 border border-amber-200 p-4 text-xs text-amber-800 flex items-start gap-3">
              <svg className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="font-semibold text-amber-900">Signed in as Customer</p>
                <p className="mt-0.5 text-amber-700">
                  You are currently authenticated as <strong className="font-medium text-amber-900">{user.email}</strong>. Enter administrator credentials below to access the administrative console.
                </p>
              </div>
            </div>
          )}

          {/* Server Error Alert */}
          {serverError && (
            <div
              className="mb-6 rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700 flex items-start gap-3"
              role="alert"
              aria-live="assertive"
            >
              <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{serverError}</span>
            </div>
          )}

          {/* Direct Password Login Form */}
          <form onSubmit={handlePasswordSubmit} className="space-y-5" noValidate>
            <div>
              <label htmlFor={emailId} className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Admin Email
              </label>
              <div className="mt-1.5">
                <input
                  id={emailId}
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  value={formData.email}
                  onChange={(e) => {
                    setFormData((p) => ({ ...p, email: e.target.value }));
                    if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: '' }));
                    if (serverError) setServerError('');
                    if (authError) clearError();
                  }}
                  disabled={isSubmitting}
                  className={`block w-full px-3.5 py-2.5 rounded-xl border text-sm transition-colors focus:outline-none ${
                    fieldErrors.email
                      ? 'border-red-300 focus:border-red-500 focus:ring-1 focus:ring-red-500 bg-red-50/20'
                      : 'border-slate-300 focus:border-[#123C32] focus:ring-1 focus:ring-[#123C32]'
                  }`}
                  placeholder="admin@example.com"
                />
                {fieldErrors.email && (
                  <p className="mt-1 text-xs text-red-600" id={`${emailId}-error`}>
                    {fieldErrors.email}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor={passwordId} className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Password
              </label>
              <div className="mt-1.5">
                <input
                  id={passwordId}
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={formData.password}
                  onChange={(e) => {
                    setFormData((p) => ({ ...p, password: e.target.value }));
                    if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: '' }));
                    if (serverError) setServerError('');
                    if (authError) clearError();
                  }}
                  disabled={isSubmitting}
                  className={`block w-full px-3.5 py-2.5 rounded-xl border text-sm transition-colors focus:outline-none ${
                    fieldErrors.password
                      ? 'border-red-300 focus:border-red-500 focus:ring-1 focus:ring-red-500 bg-red-50/20'
                      : 'border-slate-300 focus:border-[#123C32] focus:ring-1 focus:ring-[#123C32]'
                  }`}
                  placeholder="••••••••••••"
                />
                {fieldErrors.password && (
                  <p className="mt-1 text-xs text-red-600" id={`${passwordId}-error`}>
                    {fieldErrors.password}
                  </p>
                )}
              </div>
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                disabled={isSubmitting}
                className="w-full justify-center !bg-[#0B2820] hover:!bg-[#123C32] !text-white !py-2.5 !rounded-xl !font-semibold shadow-sm text-sm"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Authenticating...
                  </span>
                ) : (
                  'Sign In to Admin Console'
                )}
              </Button>
            </div>
          </form>

          {/* Footer Back Link */}
          <div className="mt-6 pt-6 border-t border-slate-100 text-center">
            <a
              href="/"
              className="text-xs text-slate-500 hover:text-slate-800 transition-colors inline-flex items-center gap-1.5 font-medium"
            >
              <span>←</span> Return to Storefront
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
