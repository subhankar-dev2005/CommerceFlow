/**
 * AdminPageHeader Component
 *
 * Consistent page title, subtitle, optional badge, and action button container.
 */

export default function AdminPageHeader({
  title,
  subtitle,
  badge,
  actions,
  children,
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[#E4E8E5] mb-6 sm:mb-8">
      <div className="space-y-1">
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            {title}
          </h1>
          {badge && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#EEF5F1] text-[#123C32] border border-[#123C32]/10">
              {badge}
            </span>
          )}
        </div>
        {subtitle && (
          <p className="text-xs sm:text-sm text-slate-500 max-w-2xl">
            {subtitle}
          </p>
        )}
      </div>

      {(actions || children) && (
        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          {actions}
          {children}
        </div>
      )}
    </div>
  );
}
