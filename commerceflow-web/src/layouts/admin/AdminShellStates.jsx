/**
 * Reusable Shell-Level State Components
 *
 * Provides standardized Loading, Error, and Empty state surfaces for administrative views.
 */

export function AdminLoadingState({
  title = 'Loading administrative data...',
  subtitle = 'Please wait while records are synchronized from the store.',
}) {
  return (
    <div
      className="bg-white rounded-2xl border border-[#E4E8E5] p-8 sm:p-12 text-center space-y-4 shadow-xs"
      role="status"
      aria-live="polite"
    >
      <div className="w-10 h-10 border-3 border-[#123C32] border-t-transparent rounded-full animate-spin mx-auto" />
      <div className="space-y-1">
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto">{subtitle}</p>
      </div>
    </div>
  );
}

export function AdminErrorState({
  title = 'Failed to load administrative records',
  message = 'An unexpected server error occurred while retrieving this view.',
  onRetry,
}) {
  return (
    <div
      className="bg-white rounded-2xl border border-rose-200 p-8 sm:p-12 text-center space-y-4 shadow-xs"
      role="alert"
    >
      <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center mx-auto">
        <svg className="w-6 h-6 stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
          />
        </svg>
      </div>
      <div className="space-y-1 max-w-md mx-auto">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        <p className="text-xs text-slate-500">{message}</p>
      </div>
      {onRetry && (
        <div className="pt-2">
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#123C32] text-white text-xs font-semibold hover:bg-[#0E332B] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#123C32]"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}

export function AdminEmptyState({
  title = 'No records found',
  description = 'There are currently no items matching your criteria in this section.',
  actionLabel,
  onAction,
  actionHref,
  icon,
}) {
  return (
    <div className="bg-white rounded-2xl border border-[#E4E8E5] p-8 sm:p-12 text-center space-y-4 shadow-xs">
      <div className="w-12 h-12 rounded-xl bg-[#EEF5F1] text-[#123C32] border border-[#123C32]/10 flex items-center justify-center mx-auto">
        {icon || (
          <svg className="w-6 h-6 stroke-[1.8]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3.75h4m-4 3h4m-6.75-9.75h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
            />
          </svg>
        )}
      </div>
      <div className="space-y-1 max-w-md mx-auto">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
      {(actionLabel && (onAction || actionHref)) && (
        <div className="pt-2">
          {actionHref ? (
            <a
              href={actionHref}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#123C32] text-white text-xs font-semibold hover:bg-[#0E332B] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#123C32]"
            >
              {actionLabel}
            </a>
          ) : (
            <button
              type="button"
              onClick={onAction}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#123C32] text-white text-xs font-semibold hover:bg-[#0E332B] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#123C32]"
            >
              {actionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export const AdminShellStates = {
  AdminLoadingState,
  AdminErrorState,
  AdminEmptyState,
};

export default AdminShellStates;
