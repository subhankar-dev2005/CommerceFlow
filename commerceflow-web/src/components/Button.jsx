import { cn } from '../lib/utils.js';

/**
 * CommerceFlow Button — Forest Green + Orange brand.
 * Variants: primary (green), accent (orange), secondary, outline, ghost, soft
 */
export default function Button({
  as: Component = 'button',
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  type = 'button',
  loading = false,
  disabled = false,
  ...props
}) {
  const base =
    'inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98] select-none';

  const variants = {
    primary:
      'bg-brand-800 hover:bg-brand-900 text-white shadow-sm hover:shadow-md focus-visible:ring-brand-700 border border-brand-800',
    accent:
      'bg-accent-500 hover:bg-accent-600 text-white shadow-sm hover:shadow-md focus-visible:ring-accent-400 border border-accent-500',
    secondary:
      'bg-white hover:bg-surface-muted text-text-primary border border-border-subtle shadow-xs hover:border-border-strong focus-visible:ring-brand-700',
    outline:
      'border border-brand-700 text-brand-800 hover:bg-brand-50 bg-transparent focus-visible:ring-brand-700',
    ghost:
      'text-text-secondary hover:text-text-primary hover:bg-surface-muted bg-transparent focus-visible:ring-brand-700',
    soft:
      'bg-brand-50 hover:bg-brand-100 text-brand-800 border border-brand-100 focus-visible:ring-brand-700',
  };

  const sizes = {
    sm:  'text-xs px-3.5 py-1.5 gap-1.5',
    md:  'text-sm px-5 py-2.5 gap-2',
    lg:  'text-base px-7 py-3.5 gap-2.5',
    xl:  'text-base px-8 py-4 gap-3',
  };

  const isDisabled = disabled || Boolean(loading);
  const buttonProps =
    Component === 'button'
      ? { type, disabled: isDisabled, ...props }
      : { ...props };

  return (
    <Component
      className={cn(base, variants[variant] || variants.primary, sizes[size] || sizes.md, className)}
      {...buttonProps}
    >
      {Boolean(loading) && (
        <span
          className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0"
          aria-hidden="true"
        />
      )}
      {children}
    </Component>
  );
}
