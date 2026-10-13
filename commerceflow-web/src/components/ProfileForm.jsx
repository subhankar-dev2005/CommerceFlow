import { useState, useId } from 'react';
import { useAuth } from '../features/auth/useAuth.js';
import { updateProfile } from '../features/account/account.service.js';
import Button from './Button.jsx';

/**
 * ProfileForm Component
 * Displays authenticated user information and allows editing the name.
 *
 * Rules:
 * - Only name is editable.
 * - Email, role, isActive, and _id remain read-only.
 * - If no changes were made, suppresses network request with a neutral message.
 * - Calls refreshUser() upon success to immediately synchronize header and app state.
 */
export default function ProfileForm() {
  const { user, refreshUser } = useAuth();

  const [name, setName] = useState(() => user?.name || '');
  const [fieldError, setFieldError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null); // { type: 'success' | 'info' | 'error', text: '' }

  const nameInputId = useId();
  const emailInputId = useId();

  const handleChange = (e) => {
    setName(e.target.value);
    if (fieldError) setFieldError('');
    if (statusMessage) setStatusMessage(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFieldError('');
    setStatusMessage(null);

    const trimmedName = name.trim();

    // 1. Validation
    if (!trimmedName) {
      setFieldError('Name is required.');
      return;
    }
    if (trimmedName.length < 2) {
      setFieldError('Name must be at least 2 characters long.');
      return;
    }
    if (trimmedName.length > 100) {
      setFieldError('Name must not exceed 100 characters.');
      return;
    }

    // 2. Check if name was actually changed
    if (trimmedName === user?.name) {
      setStatusMessage({
        type: 'info',
        text: 'No changes to save.',
      });
      return;
    }

    // 3. Submit to backend
    setIsSubmitting(true);
    try {
      await updateProfile({ name: trimmedName });

      // Refresh authoritative auth user state
      if (refreshUser) {
        await refreshUser();
      }

      setStatusMessage({
        type: 'success',
        text: 'Your profile has been updated successfully.',
      });
    } catch (err) {
      let message = 'Failed to update profile. Please try again.';
      if (err?.code === 'VALIDATION_ERROR') {
        message = err?.details?.[0]?.message || err.message || 'Please provide a valid name.';
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
      <div className="mb-6 pb-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-slate-900">Personal Information</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Update your account details and display name.
          </p>
        </div>
        {user?.isActive !== undefined && (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {user.isActive ? 'Active Account' : 'Inactive'}
            </span>
            {user?.role && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-600 uppercase tracking-wider">
                {user.role}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Status Feedback Banner */}
      {statusMessage && (
        <div
          role={statusMessage.type === 'error' ? 'alert' : 'status'}
          className={`mb-5 p-3.5 rounded-xl text-xs font-medium flex items-center gap-2.5 transition-all ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : statusMessage.type === 'info'
              ? 'bg-slate-50 border border-slate-200 text-slate-700'
              : 'bg-rose-50 border border-rose-200 text-rose-800'
          }`}
        >
          {statusMessage.type === 'success' && (
            <svg className="w-4 h-4 text-emerald-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
          {statusMessage.type === 'info' && (
            <svg className="w-4 h-4 text-slate-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          {statusMessage.type === 'error' && (
            <svg className="w-4 h-4 text-rose-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {/* Full Name */}
        <div>
          <label
            htmlFor={nameInputId}
            className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wide"
          >
            Full Name <span className="text-red-500">*</span>
          </label>
          <input
            id={nameInputId}
            type="text"
            value={name}
            onChange={handleChange}
            disabled={isSubmitting}
            aria-invalid={Boolean(fieldError)}
            aria-describedby={fieldError ? `${nameInputId}-error` : undefined}
            placeholder="Enter your full name"
            maxLength={100}
            className={`w-full px-3.5 py-2.5 text-sm bg-slate-50 border rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 transition-all ${
              fieldError
                ? 'border-red-300 focus:ring-red-500/20 focus:border-red-500'
                : 'border-slate-200 focus:ring-blue-500/20 focus:border-blue-500'
            }`}
          />
          {fieldError && (
            <p id={`${nameInputId}-error`} className="mt-1.5 text-xs text-red-600 font-medium" role="alert">
              {fieldError}
            </p>
          )}
        </div>

        {/* Email (Read-Only) */}
        <div>
          <label
            htmlFor={emailInputId}
            className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wide"
          >
            Email Address <span className="text-slate-400 font-normal lowercase">(read-only)</span>
          </label>
          <input
            id={emailInputId}
            type="email"
            value={user?.email || ''}
            readOnly
            disabled
            className="w-full px-3.5 py-2.5 text-sm bg-slate-100 border border-slate-200 rounded-xl text-slate-500 cursor-not-allowed select-none"
          />
          <p className="mt-1.5 text-[11px] text-slate-500">
            Email cannot be changed here.
          </p>
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
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </div>
  );
}
