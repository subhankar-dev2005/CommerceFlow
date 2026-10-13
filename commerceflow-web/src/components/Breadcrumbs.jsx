import { cn } from '../lib/utils.js';

/**
 * CommerceFlow Master Breadcrumbs Component
 * Renders an accessible, consistent breadcrumb navigation hierarchy.
 * @param {{ items: Array<{ label: string, href?: string }>, className?: string }} props
 */
export default function Breadcrumbs({ items = [], className = '' }) {
  if (!items || items.length === 0) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn('flex items-center text-xs font-medium text-[#66736D] overflow-x-auto scrollbar-hide py-2', className)}
    >
      <ol className="flex items-center gap-1.5 whitespace-nowrap">
        {/* Home icon item */}
        <li className="flex items-center">
          <a
            href="/"
            className="flex items-center gap-1 hover:text-[#123C32] transition-colors focus:outline-none focus-visible:underline"
            aria-label="Home"
          >
            <svg
              className="w-3.5 h-3.5 stroke-[2]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
              />
            </svg>
            <span className="hidden sm:inline">Home</span>
          </a>
        </li>

        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li key={item.label + index} className="flex items-center gap-1.5">
              <svg
                className="w-3 h-3 text-[#CDD5CF] stroke-[2.2] shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>

              {item.href && !isLast ? (
                <a
                  href={item.href}
                  className="hover:text-[#123C32] transition-colors focus:outline-none focus-visible:underline"
                >
                  {item.label}
                </a>
              ) : (
                <span
                  className={cn(
                    'truncate max-w-[200px] sm:max-w-xs',
                    isLast ? 'text-[#17201D] font-bold' : ''
                  )}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
