import { cn } from '../lib/utils.js';
import Button from './Button.jsx';

/**
 * Reusable error state with retry affordance.
 */
export default function ErrorState({
  title = 'Something went wrong',
  description = 'We encountered an error loading this content. Please try again.',
  onRetry,
  className = '',
}) {
  return (
    <div
      className={cn(
        'w-full py-16 px-4 flex flex-col items-center justify-center text-center max-w-md mx-auto',
        className
      )}
    >
      <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-4 border border-rose-100">
        <svg className="w-7 h-7 stroke-[1.8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      </div>

      <h3 className="text-base font-bold text-slate-900 mb-1.5">{title}</h3>
      <p className="text-sm text-slate-500 leading-relaxed mb-6">{description}</p>

      {onRetry && (
        <Button variant="secondary" size="md" onClick={onRetry}>
          Try Again
        </Button>
      )}
    </div>
  );
}
