import { cn } from '../lib/utils.js';

/**
 * Reusable empty state component for empty catalogs, carts, or search results.
 */
export default function EmptyState({
  title = 'No items found',
  description = 'Try adjusting your search query or filters to find what you are looking for.',
  action,
  icon,
  className = '',
}) {
  return (
    <div
      className={cn(
        'w-full py-16 px-4 flex flex-col items-center justify-center text-center max-w-md mx-auto',
        className
      )}
    >
      <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-4">
        {icon || (
          <svg className="w-7 h-7 stroke-[1.6]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
          </svg>
        )}
      </div>

      <h3 className="text-base font-bold text-slate-900 mb-1.5">{title}</h3>
      <p className="text-sm text-slate-500 leading-relaxed mb-6">{description}</p>

      {action && <div>{action}</div>}
    </div>
  );
}
