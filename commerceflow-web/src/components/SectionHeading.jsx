import { cn } from '../lib/utils.js';

export default function SectionHeading({
  badge,
  title,
  description,
  align = 'left',
  action,
  className = '',
  id,
}) {
  const isCentered = align === 'center';

  return (
    <div
      className={cn(
        'flex flex-col md:flex-row md:items-end justify-between gap-3 sm:gap-4 mb-6 sm:mb-8',
        isCentered && 'text-center md:flex-col md:items-center',
        className
      )}
    >
      <div className={cn('space-y-1.5 sm:space-y-2', isCentered ? 'max-w-2xl mx-auto' : 'max-w-xl')}>
        {badge && (
          <div
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-50 border border-brand-100 text-brand-700 text-xs font-semibold tracking-wide uppercase',
              isCentered ? 'mx-auto' : ''
            )}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-brand-600" />
            {badge}
          </div>
        )}
        <h2 id={id} className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-text-primary">
          {title}
        </h2>
        {description && (
          <p className="text-xs sm:text-sm text-text-muted leading-relaxed">
            {description}
          </p>
        )}
      </div>

      {action && (
        <div
          className={cn(
            'shrink-0',
            isCentered ? 'mt-2 mx-auto' : 'self-start md:self-auto pt-1 sm:pt-0'
          )}
        >
          {action}
        </div>
      )}
    </div>
  );
}
