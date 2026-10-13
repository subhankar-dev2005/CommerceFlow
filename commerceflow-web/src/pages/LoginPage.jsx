import React, { useState, useId, useEffect } from 'react';
import { useAuth } from '../features/auth/useAuth.js';
import Button from '../components/Button.jsx';
import { navigate } from '../lib/utils.js';

export default function LoginPage() {
  const { isAuthenticated, isLoading, login, error: authError, clearError } = useAuth();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const emailId = useId();
  const passwordId = useId();

  const getRedirectUrl = () => {
    if (typeof window === 'undefined') return '/';
    const search = window.location.search || '';
    const match = search.match(/[?&]redirect=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : '/';
  };

  useEffect(() => {
    if (!isLoading && isAuthenticated && typeof window !== 'undefined') {
      const destination = getRedirectUrl();
      navigate(destination);
    }
  }, [isLoading, isAuthenticated]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: '' }));
    }
    if (serverError) {
      setServerError('');
    }
    if (authError) {
      clearError();
    }
  };

  const validateForm = () => {
    const errors = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!formData.email.trim()) {
      errors.email = 'Email address is required.';
    } else if (!emailRegex.test(formData.email.trim())) {
      errors.email = 'Please enter a valid email address.';
    }

    if (!formData.password) {
      errors.password = 'Password is required.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError('');

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      await login({
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
      });

      const destination = getRedirectUrl();
      navigate(destination);
    } catch (err) {
      if (err?.code === 'INVALID_CREDENTIALS') {
        setServerError('Invalid email or password.');
      } else if (err?.code === 'AUTH_RATE_LIMIT_EXCEEDED') {
        setServerError('Too many login attempts. Please wait and try again.');
      } else if (err?.code === 'VALIDATION_ERROR' && Array.isArray(err?.details)) {
        const backendFieldErrors = {};
        err.details.forEach((detail) => {
          if (detail.field) {
            backendFieldErrors[detail.field] = detail.message;
          }
        });
        setFieldErrors(backendFieldErrors);
        setServerError(err.message || 'Please check the errors below.');
      } else {
        setServerError(err?.message || 'Unable to sign in. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeAlert = serverError || authError;

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12 sm:px-6 lg:px-8 bg-[#F7F6F1]">
      <div className="w-full max-w-md space-y-8">

        {/* Header Branding */}
        <div className="text-center space-y-2">
          <a
            href="/"
            className="inline-flex items-center gap-2.5 focus:outline-none"
            aria-label="CommerceFlow Home"
          >
            <div className="h-11 w-11 rounded-2xl bg-[#123C32] flex items-center justify-center text-white shadow-sm">
              <svg className="w-6 h-6 stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 18l9-13 9 13H3z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v13M7 18l5-7 5 7" />
              </svg>
            </div>
            <div className="flex flex-col text-left">
              <span className="text-2xl font-extrabold tracking-tight text-[#17201D] leading-tight">
                Commerce<span className="text-[#F97316]">Flow</span>
              </span>
              <span className="text-[10px] uppercase tracking-widest text-[#66736D] font-bold">
                Gear Up for Better Days
              </span>
            </div>
          </a>
          <h1 className="text-2xl font-extrabold tracking-tight text-[#17201D] pt-4">
            Sign In to Your Account
          </h1>
          <p className="text-xs text-[#66736D]">
            Access your orders, saved gear, and delivery addresses.
          </p>
        </div>

        {/* Card Form */}
        <div className="bg-white rounded-3xl border border-[#E5E9E6] p-8 shadow-xs">

          {/* Server Alert Message */}
          {activeAlert && (
            <div
              role="alert"
              className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-3"
            >
              <svg className="w-5 h-5 text-rose-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="leading-snug">{activeAlert}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {/* Email Field */}
            <div>
              <label htmlFor={emailId} className="block text-xs font-bold text-[#17201D] mb-1.5 uppercase tracking-wider">
                Email Address
              </label>
              <input
                id={emailId}
                name="email"
                type="email"
                autoComplete="email"
                value={formData.email}
                onChange={handleChange}
                disabled={isSubmitting}
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? `${emailId}-error` : undefined}
                className={`w-full px-4 py-3 text-sm bg-[#F7F6F1] border rounded-2xl text-[#17201D] placeholder-[#66736D]/60 focus:outline-none focus:ring-2 transition-all ${
                  fieldErrors.email
                    ? 'border-rose-400 focus:ring-rose-400/20'
                    : 'border-[#E5E9E6] focus:ring-[#123C32]/20 focus:border-[#123C32]'
                }`}
                placeholder="name@example.com"
              />
              {fieldErrors.email && (
                <p id={`${emailId}-error`} className="mt-1.5 text-xs text-rose-600">
                  {fieldErrors.email}
                </p>
              )}
            </div>

            {/* Password Field */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor={passwordId} className="block text-xs font-bold text-[#17201D] uppercase tracking-wider">
                  Password
                </label>
              </div>
              <input
                id={passwordId}
                name="password"
                type="password"
                autoComplete="current-password"
                value={formData.password}
                onChange={handleChange}
                disabled={isSubmitting}
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby={fieldErrors.password ? `${passwordId}-error` : undefined}
                className={`w-full px-4 py-3 text-sm bg-[#F7F6F1] border rounded-2xl text-[#17201D] placeholder-[#66736D]/60 focus:outline-none focus:ring-2 transition-all ${
                  fieldErrors.password
                    ? 'border-rose-400 focus:ring-rose-400/20'
                    : 'border-[#E5E9E6] focus:ring-[#123C32]/20 focus:border-[#123C32]'
                }`}
                placeholder="Enter your password"
              />
              {fieldErrors.password && (
                <p id={`${passwordId}-error`} className="mt-1.5 text-xs text-rose-600">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={isSubmitting}
              className="w-full justify-center rounded-2xl py-3 font-bold text-sm bg-[#123C32] hover:bg-[#0E332B] border-[#123C32] text-white shadow-xs"
            >
              {isSubmitting ? (
                <span className="inline-flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Signing in...
                </span>
              ) : (
                'Sign In &rarr;'
              )}
            </Button>
          </form>

          {/* Footer Navigation Link */}
          <div className="mt-6 pt-6 border-t border-[#E5E9E6] text-center text-xs text-[#66736D]">
            Need an outdoor account?{' '}
            <a
              href={`/register${getRedirectUrl() !== '/' ? `?redirect=${encodeURIComponent(getRedirectUrl())}` : ''}`}
              className="font-bold text-[#123C32] hover:text-[#F97316] transition-colors"
            >
              Create Account
            </a>
          </div>
        </div>

      </div>
    </div>
  );
}
