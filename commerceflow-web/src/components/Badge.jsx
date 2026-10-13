import { cn } from '../lib/utils.js';

/**
 * Reusable badge indicator for stock, status, or categories.
 */
export default function Badge({
  variant = 'neutral',
  size = 'md',
  className = '',
  children,
  ...props
}) {
  const baseStyles = 'inline-flex items-center font-medium rounded-full tracking-wide select-none';

  const variants = {
    neutral: 'bg-slate-100 text-slate-700 border border-slate-200/80',
    brand: 'bg-brand-50 text-brand-700 border border-brand-200/80',
    accent: 'bg-accent-50 text-accent-700 border border-accent-200/80',
    success: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    warning: 'bg-amber-50 text-amber-800 border border-amber-200',
    danger: 'bg-rose-50 text-rose-700 border border-rose-200',
  };

  const sizes = {
    sm: 'text-[11px] px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5',
  };

  return (
    <span
      className={cn(baseStyles, variants[variant] || variants.neutral, sizes[size] || sizes.md, className)}
      {...props}
    >
      {children}
    </span>
  );
}
