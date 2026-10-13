import { cn } from '../lib/utils.js';

/**
 * Standard responsive layout container.
 * Max-width: 1280px — matches spec.
 */
export default function Container({
  as: Component = 'div',
  className = '',
  children,
  ...props
}) {
  return (
    <Component
      className={cn('w-full max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8', className)}
      {...props}
    >
      {children}
    </Component>
  );
}
