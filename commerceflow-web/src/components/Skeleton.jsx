import { cn } from '../lib/utils.js';

/**
 * Reusable animated skeleton placeholder for loading states.
 */
export default function Skeleton({
  className = '',
  variant = 'rectangular',
  ...props
}) {
  const variantStyles = {
    rectangular: 'rounded-xl',
    circular: 'rounded-full',
    text: 'rounded-md h-4',
  };

  return (
    <div
      className={cn(
        'bg-slate-200/70 animate-pulse',
        variantStyles[variant] || variantStyles.rectangular,
        className
      )}
      aria-hidden="true"
      {...props}
    />
  );
}
