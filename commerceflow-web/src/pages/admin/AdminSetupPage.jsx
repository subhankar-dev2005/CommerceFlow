import React, { useState, useId, useRef, useEffect } from 'react';
import { useAuth } from '../../features/auth/useAuth.js';
import { adminUserService } from '../../features/admin/adminUser.service.js';
import AdminLayout from '../../layouts/AdminLayout.jsx';
import Button from '../../components/Button.jsx';
import { navigate } from '../../lib/utils.js';

/**
 * Eye Icon for password visibility toggle
 */
function EyeIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

/**
 * Eye Slash Icon for hiding password
 */
function EyeSlashIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  );
}

/**
 * Shield Icon for security branding
 */
function ShieldIcon({ className = 'w-6 h-6' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

/**
 * Checkmark Icon
 */
function CheckIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  );
}

/**
 * Copy Icon
 */
function CopyIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

/**
 * Password strength evaluation
 */
function evaluatePasswordStrength(password) {
  if (!password) {
    return { score: 0, label: 'None', items: [] };
  }

  const items = [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'Uppercase letter (A-Z)', met: /[A-Z]/.test(password) },
    { label: 'Lowercase letter (a-z)', met: /[a-z]/.test(password) },
    { label: 'Number (0-9)', met: /\d/.test(password) },
    { label: 'Special character (@$!%*?&#)', met: /[@$!%*?&#]/.test(password) },
  ];

  const metCount = items.filter((i) => i.met).length;

  let label = 'Weak';
  let color = 'bg-red-500';
  if (metCount >= 5) {
    label = 'Strong';
    color = 'bg-emerald-500';
  } else if (metCount >= 3) {
    label = 'Medium';
    color = 'bg-amber-500';
  }

  return { score: metCount, label, color, items };
}

/**
 * AdminSetupPage Component
 * Route: /admin/setup
 *
 * Dedicated, secure administrator account setup and provisioning panel.
 *
 * Production Security Rules:
 * - Public admin registration is strictly prohibited.
 * - An active, authenticated administrator session is required to provision accounts.
 * - For unauthenticated or customer users, renders an authorized explanation and local CLI bootstrap instructions.
 * - Passwords are never logged or persisted in browser storage.
 * - Prevents duplicate submissions via synchronous ref guards.
 * - Arbitrary roles cannot be chosen; role is authoritatively forced to 'admin' by the server.
 */
export default function AdminSetupPage() {
  const { user, isAuthenticated, isLoading } = useAuth();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const [fieldErrors, setFieldErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [createdAdmin, setCreatedAdmin] = useState(null);
  const [copiedCli, setCopiedCli] = useState(false);

  const nameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const confirmPasswordId = useId();

  const passwordStrength = evaluatePasswordStrength(formData.password);

  const cliBootstrapCommand = 'node scripts/create-admin.js admin@example.com "<secure-password>" "Admin Name"';

  const handleCopyCli = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(cliBootstrapCommand).then(() => {
        setCopiedCli(true);
        setTimeout(() => setCopiedCli(false), 2500);
      }).catch(() => {});
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: '' }));
    }
    if (serverError) {
      setServerError('');
    }
  };

  const validateForm = () => {
    const errors = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!formData.name.trim()) {
      errors.name = 'Administrator name is required.';
    } else if (formData.name.trim().length < 2) {
      errors.name = 'Name must be at least 2 characters.';
    } else if (formData.name.trim().length > 100) {
      errors.name = 'Name cannot exceed 100 characters.';
    }

    if (!formData.email.trim()) {
      errors.email = 'Administrator email address is required.';
    } else if (!emailRegex.test(formData.email.trim())) {
      errors.email = 'Please enter a valid email address.';
    }

    if (!formData.password) {
      errors.password = 'Password is required.';
    } else if (formData.password.length < 8) {
      errors.password = 'Password must be at least 8 characters long.';
    } else if (!/[A-Z]/.test(formData.password)) {
      errors.password = 'Password must contain at least one uppercase letter.';
    } else if (!/[a-z]/.test(formData.password)) {
      errors.password = 'Password must contain at least one lowercase letter.';
    } else if (!/\d/.test(formData.password)) {
      errors.password = 'Password must contain at least one number.';
    } else if (!/[@$!%*?&#]/.test(formData.password)) {
      errors.password = 'Password must contain at least one special character (@$!%*?&#).';
    }

    if (!formData.confirmPassword) {
      errors.confirmPassword = 'Please confirm the password.';
    } else if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isSubmittingRef.current || isSubmitting) {
      return;
    }

    setServerError('');

    if (!validateForm()) {
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      const responseUser = await adminUserService.createAdminUser({
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
      });

      // Clear sensitive password inputs from state immediately
      setFormData({
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
      });
      setFieldErrors({});
      setShowPassword(false);
      setShowConfirmPassword(false);

      setCreatedAdmin({
        name: responseUser?.name || 'New Administrator',
        email: responseUser?.email || '',
        id: responseUser?.id || responseUser?._id,
      });
    } catch (err) {
      if (err?.code === 'EMAIL_ALREADY_EXISTS') {
        setFieldErrors((prev) => ({
          ...prev,
          email: 'An account with this email address already exists.',
        }));
        setServerError('An account with this email address already exists.');
      } else if (err?.code === 'VALIDATION_ERROR' && Array.isArray(err?.details)) {
        const backendFieldErrors = {};
        err.details.forEach((detail) => {
          if (detail.field) {
            backendFieldErrors[detail.field] = detail.message;
          }
        });
        setFieldErrors(backendFieldErrors);
        setServerError(err.message || 'Please correct the validation errors below.');
      } else if (err?.status === 401 || err?.code === 'UNAUTHORIZED') {
        setServerError('Your administrator session has expired. Please sign in again.');
      } else if (err?.status === 403 || err?.code === 'FORBIDDEN') {
        setServerError('Administrator privileges are required to create administrator accounts.');
      } else {
        setServerError(err?.message || 'Failed to create administrator account. Please try again.');
      }
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleResetForAnother = () => {
    setCreatedAdmin(null);
    setFormData({
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    });
    setFieldErrors({});
    setServerError('');
  };

  // 1. Loading state during auth resolution
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F4F6F4] flex flex-col items-center justify-center p-8 text-slate-500">
        <div className="w-10 h-10 border-3 border-[#123C32] border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium text-slate-700">Verifying administrator authorization...</p>
      </div>
    );
  }

  // 2. Unauthenticated state: explain restricted access and provide local CLI bootstrap
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#F4F6F4] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-lg">
          {/* Header Shield */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#0B2820] text-emerald-400 shadow-md mb-4 border border-[#164032]">
              <ShieldIcon className="w-7 h-7" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Administrator Setup Portal</h1>
            <p className="mt-1 text-sm text-slate-600">Restricted Privileged Provisioning</p>
          </div>

          <div className="mt-8 bg-white py-8 px-6 shadow-sm border border-slate-200/80 rounded-2xl sm:px-10 space-y-6">
            {/* Security Policy Notice */}
            <div
              className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-xs text-amber-900 flex items-start gap-3"
              role="alert"
            >
              <svg className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="font-semibold text-amber-950">Administrator Authentication Required</p>
                <p className="mt-1 text-amber-800 leading-relaxed">
                  In accordance with CommerceFlow production security policies, public registration of administrator accounts is strictly prohibited. Administrator accounts may only be provisioned by an active, authorized administrator.
                </p>
              </div>
            </div>

            {/* Development CLI Bootstrap Section */}
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Local Development Bootstrap
                </span>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-full border border-emerald-200">
                  CLI Safety-Checked
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                To create or reset an administrator account in local development, run the safety-verified bootstrap script directly in your terminal:
              </p>
              <div className="relative">
                <pre className="p-3 bg-[#0B2820] text-emerald-300 rounded-lg text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all pr-12 select-all">
                  {cliBootstrapCommand}
                </pre>
                <button
                  type="button"
                  onClick={handleCopyCli}
                  className="absolute top-2 right-2 p-1.5 rounded-md bg-[#164032] hover:bg-[#1B4D3E] text-emerald-200 transition-colors"
                  aria-label="Copy CLI command"
                  title="Copy command"
                >
                  {copiedCli ? <CheckIcon className="w-4 h-4 text-emerald-400" /> : <CopyIcon className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-slate-500 italic">
                The script checks environment safety flags, connects directly to your verified local MongoDB instance, and safely hashes the password. To reset an existing administrator password, append <code className="text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded">--reset-password</code>.
              </p>
            </div>

            {/* Navigation Actions */}
            <div className="pt-2 flex flex-col sm:flex-row gap-3">
              <Button
                type="button"
                variant="primary"
                onClick={() => navigate('/admin/login?redirect=%2Fadmin%2Fsetup')}
                className="flex-1 justify-center !bg-[#0B2820] hover:!bg-[#123C32] !text-white !py-2.5 !rounded-xl !font-semibold text-xs sm:text-sm shadow-xs"
              >
                Sign In as Administrator
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/')}
                className="flex-1 justify-center border-slate-300 text-slate-700 hover:bg-slate-50 !py-2.5 !rounded-xl !font-medium text-xs sm:text-sm"
              >
                Return to Storefront
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 3. Customer authenticated state: Access Denied
  if (user?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-[#F4F6F4] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-6 shadow-sm border border-slate-200/80 rounded-2xl sm:px-10 text-center space-y-5">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-100">
              <ShieldIcon className="w-6 h-6" />
            </div>

            <div className="space-y-2">
              <h1 className="text-xl font-bold text-slate-900">Access Denied</h1>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                You are currently authenticated as a customer (<strong className="font-medium text-slate-900">{user?.email}</strong>). Customer accounts do not have permission to provision administrator accounts.
              </p>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-3">
              <Button
                type="button"
                variant="primary"
                onClick={() => navigate('/admin/login?redirect=%2Fadmin%2Fsetup')}
                className="flex-1 justify-center !bg-[#0B2820] hover:!bg-[#123C32] !text-white !py-2.5 !rounded-xl text-xs sm:text-sm font-semibold"
              >
                Sign In as Administrator
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/')}
                className="flex-1 justify-center border-slate-300 text-slate-700 hover:bg-slate-50 !py-2.5 !rounded-xl text-xs sm:text-sm font-medium"
              >
                Return to Storefront
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 4. Authorized Administrator View: Setup & Provisioning Form inside AdminLayout
  return (
    <AdminLayout currentPath="/admin/setup">
      <div className="max-w-3xl mx-auto py-4 sm:py-6 px-4 space-y-6">
        {/* Page Title & Breadcrumb header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-[#0B2820] border border-emerald-200">
                <ShieldIcon className="w-3.5 h-3.5 text-emerald-700" />
                Administrative Security
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 mt-1">
              Admin Account Setup
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
              Securely provision a new administrator account with full administrative console access.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/admin/users')}
              className="text-xs sm:text-sm border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              ← View All Admins
            </Button>
          </div>
        </div>

        {/* Success Confirmation State */}
        {createdAdmin ? (
          <div
            className="bg-white rounded-2xl border border-emerald-200 p-6 sm:p-8 shadow-xs space-y-6 animate-fadeIn"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-200">
                <CheckIcon className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-bold text-slate-900">
                  Administrator Account Provisioned Successfully
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  The administrator account for <strong className="font-semibold text-slate-900">{createdAdmin.name}</strong> (<span className="text-[#123C32] font-mono">{createdAdmin.email}</span>) has been securely created.
                </p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs text-slate-700">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-600">Assigned Privilege Role:</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold font-mono text-[11px]">
                  admin
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-600">Audit Trail:</span>
                <span className="text-slate-600 font-mono text-[11px]">ADMIN_USER_CREATED logged</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-600">Initial Status:</span>
                <span className="text-emerald-700 font-semibold text-[11px]">Active</span>
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-3">
              <Button
                type="button"
                variant="primary"
                onClick={handleResetForAnother}
                className="flex-1 justify-center !bg-[#0B2820] hover:!bg-[#123C32] !text-white !py-2.5 !rounded-xl text-xs sm:text-sm font-semibold shadow-xs"
              >
                + Provision Another Administrator
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/admin/users')}
                className="flex-1 justify-center border-slate-300 text-slate-700 hover:bg-slate-50 !py-2.5 !rounded-xl text-xs sm:text-sm font-medium"
              >
                View Administrators List
              </Button>
            </div>
          </div>
        ) : (
          /* Account Provisioning Form */
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-xs space-y-6">
            {/* Security Guard Notice */}
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-xs text-slate-700 flex items-start gap-3">
              <ShieldIcon className="w-5 h-5 text-[#123C32] shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-slate-900">Privileged Account Provisioning</p>
                <p className="mt-0.5 text-slate-600 leading-relaxed">
                  The account provisioned here will receive full administrative access. All administrator account creations are immutably logged with the acting administrator's ID and timestamp.
                </p>
              </div>
            </div>

            {/* Server Error Alert */}
            {serverError && (
              <div
                className="rounded-xl bg-red-50 border border-red-200 p-4 text-xs sm:text-sm text-red-700 flex items-start gap-3"
                role="alert"
                aria-live="assertive"
              >
                <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{serverError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              {/* Full Name */}
              <div>
                <label htmlFor={nameId} className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <div className="mt-1.5">
                  <input
                    id={nameId}
                    name="name"
                    type="text"
                    autoComplete="name"
                    required
                    value={formData.name}
                    onChange={handleChange}
                    disabled={isSubmitting}
                    placeholder="e.g. Eleanor Vance"
                    aria-invalid={Boolean(fieldErrors.name)}
                    aria-describedby={fieldErrors.name ? `${nameId}-error` : undefined}
                    className={`block w-full px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm transition-colors focus:outline-none ${
                      fieldErrors.name
                        ? 'border-red-300 focus:border-red-500 focus:ring-1 focus:ring-red-500 bg-red-50/20'
                        : 'border-slate-300 focus:border-[#123C32] focus:ring-1 focus:ring-[#123C32]'
                    }`}
                  />
                  {fieldErrors.name && (
                    <p className="mt-1 text-xs text-red-600" id={`${nameId}-error`}>
                      {fieldErrors.name}
                    </p>
                  )}
                </div>
              </div>

              {/* Admin Email */}
              <div>
                <label htmlFor={emailId} className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Administrator Email <span className="text-red-500">*</span>
                </label>
                <div className="mt-1.5">
                  <input
                    id={emailId}
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    disabled={isSubmitting}
                    placeholder="e.g. eleanor.vance@commerceflow.internal"
                    aria-invalid={Boolean(fieldErrors.email)}
                    aria-describedby={fieldErrors.email ? `${emailId}-error` : undefined}
                    className={`block w-full px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm transition-colors focus:outline-none ${
                      fieldErrors.email
                        ? 'border-red-300 focus:border-red-500 focus:ring-1 focus:ring-red-500 bg-red-50/20'
                        : 'border-slate-300 focus:border-[#123C32] focus:ring-1 focus:ring-[#123C32]'
                    }`}
                  />
                  {fieldErrors.email && (
                    <p className="mt-1 text-xs text-red-600" id={`${emailId}-error`}>
                      {fieldErrors.email}
                    </p>
                  )}
                </div>
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor={passwordId} className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Password <span className="text-red-500">*</span>
                  </label>
                  {formData.password && (
                    <span className={`text-[11px] font-semibold ${
                      passwordStrength.score >= 5 ? 'text-emerald-700' : passwordStrength.score >= 3 ? 'text-amber-700' : 'text-red-600'
                    }`}>
                      Strength: {passwordStrength.label}
                    </span>
                  )}
                </div>
                <div className="mt-1.5 relative">
                  <input
                    id={passwordId}
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={formData.password}
                    onChange={handleChange}
                    disabled={isSubmitting}
                    placeholder="••••••••••••"
                    aria-invalid={Boolean(fieldErrors.password)}
                    aria-describedby={fieldErrors.password ? `${passwordId}-error` : undefined}
                    className={`block w-full pl-3.5 pr-11 py-2.5 rounded-xl border text-xs sm:text-sm transition-colors focus:outline-none ${
                      fieldErrors.password
                        ? 'border-red-300 focus:border-red-500 focus:ring-1 focus:ring-red-500 bg-red-50/20'
                        : 'border-slate-300 focus:border-[#123C32] focus:ring-1 focus:ring-[#123C32]'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    tabIndex={0}
                  >
                    {showPassword ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                  </button>
                </div>
                {fieldErrors.password && (
                  <p className="mt-1 text-xs text-red-600" id={`${passwordId}-error`}>
                    {fieldErrors.password}
                  </p>
                )}

                {/* Password Strength Checklist */}
                {formData.password && (
                  <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    {/* Visual strength bar */}
                    <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden flex">
                      <div
                        className={`h-full transition-all duration-300 ${passwordStrength.color}`}
                        style={{ width: `${(passwordStrength.score / 5) * 100}%` }}
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                      {passwordStrength.items.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-1.5 text-[11px]">
                          {item.met ? (
                            <CheckIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          ) : (
                            <span className="w-3.5 h-3.5 rounded-full border border-slate-300 flex items-center justify-center shrink-0">
                              <span className="w-1 h-1 rounded-full bg-slate-400" />
                            </span>
                          )}
                          <span className={item.met ? 'text-slate-700 font-medium' : 'text-slate-500'}>
                            {item.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div>
                <label htmlFor={confirmPasswordId} className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Confirm Password <span className="text-red-500">*</span>
                </label>
                <div className="mt-1.5 relative">
                  <input
                    id={confirmPasswordId}
                    name="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    disabled={isSubmitting}
                    placeholder="••••••••••••"
                    aria-invalid={Boolean(fieldErrors.confirmPassword)}
                    aria-describedby={fieldErrors.confirmPassword ? `${confirmPasswordId}-error` : undefined}
                    className={`block w-full pl-3.5 pr-11 py-2.5 rounded-xl border text-xs sm:text-sm transition-colors focus:outline-none ${
                      fieldErrors.confirmPassword
                        ? 'border-red-300 focus:border-red-500 focus:ring-1 focus:ring-red-500 bg-red-50/20'
                        : 'border-slate-300 focus:border-[#123C32] focus:ring-1 focus:ring-[#123C32]'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
                    aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                    tabIndex={0}
                  >
                    {showConfirmPassword ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                  </button>
                </div>
                {fieldErrors.confirmPassword && (
                  <p className="mt-1 text-xs text-red-600" id={`${confirmPasswordId}-error`}>
                    {fieldErrors.confirmPassword}
                  </p>
                )}
              </div>

              {/* Submit Button */}
              <div className="pt-3">
                <Button
                  type="submit"
                  variant="primary"
                  disabled={isSubmitting}
                  className="w-full justify-center !bg-[#0B2820] hover:!bg-[#123C32] !text-white !py-2.5 !rounded-xl !font-semibold shadow-sm text-xs sm:text-sm"
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Provisioning Administrator Account...
                    </span>
                  ) : (
                    'Provision Administrator Account'
                  )}
                </Button>
              </div>
            </form>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
