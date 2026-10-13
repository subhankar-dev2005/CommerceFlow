import { useState, useId } from 'react';
import { changePassword } from '../features/account/account.service.js';
import Button from './Button.jsx';

/**
 * ChangePasswordForm Component
 * Allows authenticated customers to safely update their password.
 *
 * Rules:
 * - All fields are required.
 * - Current password cannot be empty (min 6 chars).
 * - New password must be at least 6 characters and different from current password.
 * - Confirm password is client-side validation only and NEVER submitted to the backend.
 * - Password fields are NEVER logged or cached.
 * - Successful password change clears fields and keeps the current session active.
 */
function EyeIcon() {
  return (
    <svg className="w-4 h-4 stroke-[1.8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function EyeSlashIcon() {
  return (
    <svg className="w-4 h-4 stroke-[1.8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  );
}

export default function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [fieldErrors, setFieldErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null); // { type: 'success' | 'error', text: '' }

  const currentPasswordId = useId();
  const newPasswordId = useId();
  const confirmPasswordId = useId();

  const handleCurrentChange = (e) => {
    setCurrentPassword(e.target.value);
    if (fieldErrors.currentPassword) {
      setFieldErrors((prev) => ({ ...prev, currentPassword: '' }));
    }
    if (statusMessage) setStatusMessage(null);
  };

  const handleNewChange = (e) => {
    setNewPassword(e.target.value);
    if (fieldErrors.newPassword) {
      setFieldErrors((prev) => ({ ...prev, newPassword: '' }));
    }
    if (statusMessage) setStatusMessage(null);
  };

  const handleConfirmChange = (e) => {
    setConfirmPassword(e.target.value);
    if (fieldErrors.confirmPassword) {
      setFieldErrors((prev) => ({ ...prev, confirmPassword: '' }));
    }
    if (statusMessage) setStatusMessage(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatusMessage(null);

    // Frontend validation
    const errors = {};

    if (!currentPassword) {
      errors.currentPassword = 'Current password is required.';
    } else if (currentPassword.length < 6) {
      errors.currentPassword = 'Current password must be at least 6 characters.';
    }

    if (!newPassword) {
      errors.newPassword = 'New password is required.';
    } else if (newPassword.length < 6) {
      errors.newPassword = 'New password must be at least 6 characters.';
    } else if (newPassword.length > 100) {
      errors.newPassword = 'New password must not exceed 100 characters.';
    } else if (currentPassword && newPassword === currentPassword) {
      errors.newPassword = 'New password must be different from current password.';
    }

    if (!confirmPassword) {
      errors.confirmPassword = 'Please confirm your new password.';
    } else if (newPassword !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    try {
      // Submit ONLY currentPassword and newPassword (confirmPassword is strictly client-side)
      await changePassword({
        currentPassword,
        newPassword,
      });

      // Clear all fields on success
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowCurrent(false);
      setShowNew(false);
      setShowConfirm(false);

      setStatusMessage({
        type: 'success',
        text: 'Your password has been changed successfully.',
      });
    } catch (err) {
      let message = 'Failed to change password. Please check your input and try again.';

      if (err?.code === 'INVALID_CURRENT_PASSWORD') {
        message = 'Current password is incorrect.';
      } else if (err?.code === 'VALIDATION_ERROR') {
        message = err?.details?.[0]?.message || err.message || 'Please meet all password requirements.';
      } else if (err?.message) {
        message = err.message;
      }

      setStatusMessage({
        type: 'error',
        text: message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-7 shadow-sm">
      <div className="mb-6 pb-4 border-b border-slate-100">
        <h3 className="text-base font-bold text-slate-900">Security & Password</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Ensure your account stays secure by using a strong, unique password.
        </p>
      </div>

      {/* Status Feedback Banner */}
      {statusMessage && (
        <div
          role={statusMessage.type === 'error' ? 'alert' : 'status'}
          className={`mb-5 p-3.5 rounded-xl text-xs font-medium flex items-center gap-2.5 transition-all ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border border-rose-200 text-rose-800'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <svg className="w-4 h-4 text-emerald-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-rose-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {/* Current Password */}
        <div>
          <label
            htmlFor={currentPasswordId}
            className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wide"
          >
            Current Password <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              id={currentPasswordId}
              type={showCurrent ? 'text' : 'password'}
              autoComplete="current-password"
              value={currentPassword}
              onChange={handleCurrentChange}
              disabled={isSubmitting}
              aria-invalid={Boolean(fieldErrors.currentPassword)}
              aria-describedby={fieldErrors.currentPassword ? `${currentPasswordId}-error` : undefined}
              placeholder="Enter your current password"
              className={`w-full pl-3.5 pr-10 py-2.5 text-sm bg-slate-50 border rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 transition-all ${
                fieldErrors.currentPassword
                  ? 'border-red-300 focus:ring-red-500/20 focus:border-red-500'
                  : 'border-slate-200 focus:ring-blue-500/20 focus:border-blue-500'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowCurrent(!showCurrent)}
              aria-label={showCurrent ? 'Hide current password' : 'Show current password'}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-lg transition-colors"
            >
              {showCurrent ? <EyeSlashIcon /> : <EyeIcon />}
            </button>
          </div>
          {fieldErrors.currentPassword && (
            <p id={`${currentPasswordId}-error`} className="mt-1.5 text-xs text-red-600 font-medium" role="alert">
              {fieldErrors.currentPassword}
            </p>
          )}
        </div>

        {/* New Password */}
        <div>
          <label
            htmlFor={newPasswordId}
            className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wide"
          >
            New Password <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              id={newPasswordId}
              type={showNew ? 'text' : 'password'}
              autoComplete="new-password"
              value={newPassword}
              onChange={handleNewChange}
              disabled={isSubmitting}
              aria-invalid={Boolean(fieldErrors.newPassword)}
              aria-describedby={fieldErrors.newPassword ? `${newPasswordId}-error` : undefined}
              placeholder="Minimum 6 characters"
              maxLength={100}
              className={`w-full pl-3.5 pr-10 py-2.5 text-sm bg-slate-50 border rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 transition-all ${
                fieldErrors.newPassword
                  ? 'border-red-300 focus:ring-red-500/20 focus:border-red-500'
                  : 'border-slate-200 focus:ring-blue-500/20 focus:border-blue-500'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              aria-label={showNew ? 'Hide new password' : 'Show new password'}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-lg transition-colors"
            >
              {showNew ? <EyeSlashIcon /> : <EyeIcon />}
            </button>
          </div>
          {fieldErrors.newPassword && (
            <p id={`${newPasswordId}-error`} className="mt-1.5 text-xs text-red-600 font-medium" role="alert">
              {fieldErrors.newPassword}
            </p>
          )}
        </div>

        {/* Confirm New Password */}
        <div>
          <label
            htmlFor={confirmPasswordId}
            className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wide"
          >
            Confirm New Password <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              id={confirmPasswordId}
              type={showConfirm ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={handleConfirmChange}
              disabled={isSubmitting}
              aria-invalid={Boolean(fieldErrors.confirmPassword)}
              aria-describedby={fieldErrors.confirmPassword ? `${confirmPasswordId}-error` : undefined}
              placeholder="Re-enter your new password"
              maxLength={100}
              className={`w-full pl-3.5 pr-10 py-2.5 text-sm bg-slate-50 border rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 transition-all ${
                fieldErrors.confirmPassword
                  ? 'border-red-300 focus:ring-red-500/20 focus:border-red-500'
                  : 'border-slate-200 focus:ring-blue-500/20 focus:border-blue-500'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-lg transition-colors"
            >
              {showConfirm ? <EyeSlashIcon /> : <EyeIcon />}
            </button>
          </div>
          {fieldErrors.confirmPassword && (
            <p id={`${confirmPasswordId}-error`} className="mt-1.5 text-xs text-red-600 font-medium" role="alert">
              {fieldErrors.confirmPassword}
            </p>
          )}
        </div>

        {/* Action Button */}
        <div className="pt-2 flex items-center justify-end">
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={isSubmitting}
            loading={isSubmitting}
          >
            {isSubmitting ? 'Changing...' : 'Update Password'}
          </Button>
        </div>
      </form>
    </div>
  );
}
