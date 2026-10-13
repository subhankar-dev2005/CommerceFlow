/**
 * AdminBreadcrumbs Component
 *
 * Provides accessible, responsive breadcrumb navigation for administrative views.
 * Automatically parses administrative path segments into readable trail steps.
 */

const PATH_LABELS = {
  admin: 'Dashboard',
  dashboard: 'Dashboard',
  products: 'Products',
  new: 'Create Product',
  edit: 'Edit Product',
  categories: 'Categories',
  inventory: 'Inventory',
  variants: 'Variants',
  brands: 'Brands',
  orders: 'Orders',
  returns: 'Returns',
  refunds: 'Refunds',
  users: 'Users',
  customers: 'Customers',
  vendors: 'Vendors',
  settings: 'Settings',
  'audit-logs': 'Audit Logs',
  reports: 'Reports',
  setup: 'Admin Setup',
};

export default function AdminBreadcrumbs({ currentPath = '/admin' }) {
  const segments = currentPath
    .split('/')
    .filter(Boolean)
    .filter((seg) => seg !== 'admin');

  const breadcrumbs = [
    { label: 'Admin', href: '/admin', isLast: segments.length === 0 },
  ];

  let accumulatedPath = '/admin';
  segments.forEach((seg, index) => {
    accumulatedPath += `/${seg}`;
    const isLast = index === segments.length - 1;
    const label = PATH_LABELS[seg.toLowerCase()] || (
      // If segment is an ID (hex or numeric), format compactly
      seg.length > 12 ? `#${seg.slice(-6)}` : seg.charAt(0).toUpperCase() + seg.slice(1)
    );

    breadcrumbs.push({
      label,
      href: accumulatedPath,
      isLast,
    });
  });

  return (
    <nav aria-label="Breadcrumbs" className="flex items-center text-xs text-slate-500 mb-4 sm:mb-6">
      <ol className="flex items-center flex-wrap gap-1.5 sm:gap-2">
        {breadcrumbs.map((crumb, idx) => (
          <li key={crumb.href + idx} className="flex items-center gap-1.5 sm:gap-2">
            {idx > 0 && (
              <svg
                className="w-3.5 h-3.5 text-slate-400 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            )}
            {crumb.isLast ? (
              <span
                className="font-semibold text-slate-900"
                aria-current="page"
              >
                {crumb.label}
              </span>
            ) : (
              <a
                href={crumb.href}
                className="hover:text-[#123C32] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#123C32] rounded transition-colors"
              >
                {crumb.label}
              </a>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
