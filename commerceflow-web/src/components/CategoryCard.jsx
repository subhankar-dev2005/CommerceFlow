import { cn } from '../lib/utils.js';

/**
 * Category quick-link card — compact icon + label.
 * Used in the horizontal category quick-links strip on HomePage.
 */

/* ── Outdoor Category Icons ──────────────────────────────────────────────── */
function CategoryIcon({ name }) {
  const base = { className: 'w-6 h-6 stroke-[1.6]', fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor', 'aria-hidden': 'true' };

  const lower = (name || '').toLowerCase();

  if (lower.includes('tent') || lower.includes('shelter')) {
    return <svg {...base}><path strokeLinecap="round" strokeLinejoin="round" d="M3 18l9-13 9 13H3z" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 5v13M7 18l5-7 5 7" /></svg>;
  }
  if (lower.includes('backpack') || lower.includes('bag')) {
    return <svg {...base}><path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>;
  }
  if (lower.includes('sleep') || lower.includes('sleeping')) {
    return <svg {...base}><path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>;
  }
  if (lower.includes('shoe') || lower.includes('boot') || lower.includes('hik')) {
    return <svg {...base}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016 2.993 2.993 0 002.25-1.016 3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z" /></svg>;
  }
  if (lower.includes('cook') || lower.includes('stove') || lower.includes('kitchen')) {
    return <svg {...base}><path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1A3.75 3.75 0 0012 18z" /></svg>;
  }
  if (lower.includes('lantern') || lower.includes('light') || lower.includes('lamp')) {
    return <svg {...base}><path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" /></svg>;
  }
  if (lower.includes('furniture') || lower.includes('chair') || lower.includes('camp')) {
    return <svg {...base}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" /></svg>;
  }
  if (lower.includes('apparel') || lower.includes('cloth') || lower.includes('jacket')) {
    return <svg {...base}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" /></svg>;
  }
  if (lower.includes('access') || lower.includes('gear') || lower.includes('tool')) {
    return <svg {...base}><path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" /></svg>;
  }
  if (lower.includes('deal') || lower.includes('sale') || lower.includes('offer')) {
    return <svg {...base}><path strokeLinecap="round" strokeLinejoin="round" d="M9 14.25l6-6m4.5-3.493V21.75l-4.125-1.688a4.5 4.5 0 00-3.375 0L8.25 21.75V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" /></svg>;
  }
  // Default mountain/outdoor icon
  return (
    <svg {...base}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 18l5-9 4 7 2-4 5 6H3z" />
    </svg>
  );
}

export default function CategoryCard({ category, className = '' }) {
  const name = typeof category === 'string' ? category : category?.name || '';
  const categoryUrl = `/shop?category=${encodeURIComponent(name.trim())}`;

  return (
    <a
      href={categoryUrl}
      aria-label={`Browse ${name}`}
      className={cn(
        'group flex flex-col items-center gap-2.5 p-4 bg-white rounded-2xl border border-border-subtle shadow-xs hover:border-brand-300 hover:shadow-md card-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 text-center',
        className
      )}
    >
      <div className="w-14 h-14 rounded-2xl bg-surface-green text-brand-700 flex items-center justify-center group-hover:bg-brand-700 group-hover:text-white transition-all duration-200">
        <CategoryIcon name={name} />
      </div>
      <span className="text-xs font-semibold text-text-primary group-hover:text-brand-700 transition-colors leading-tight">
        {name}
      </span>
    </a>
  );
}
