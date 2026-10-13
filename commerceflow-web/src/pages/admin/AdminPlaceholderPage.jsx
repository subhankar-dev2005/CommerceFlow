import AdminPageHeader from '../../layouts/admin/AdminPageHeader.jsx';

/**
 * AdminPlaceholderPage Component
 *
 * Clean, branded placeholder surface for administrative sections scheduled for subsequent development steps.
 */
export default function AdminPlaceholderPage({ title, moduleName, step = 'Upcoming Step', description }) {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={title || 'Module Configuration'}
        subtitle={`Administrative management surface for ${moduleName || 'this module'}.`}
        badge={step}
      />

      <div className="bg-white rounded-2xl border border-[#E4E8E5] p-8 sm:p-12 text-center space-y-5 shadow-xs max-w-3xl mx-auto">
        <div className="w-14 h-14 rounded-2xl bg-[#EEF5F1] text-[#123C32] border border-[#123C32]/10 flex items-center justify-center mx-auto shadow-2xs">
          <svg className="w-7 h-7 stroke-[1.8]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.67 2.67 0 0021 17.25l-5.83-5.83M11.42 15.17l2.496-3.03c.315-.384.74-.67 1.209-.831a4.978 4.978 0 00-.705-1.077l-1.922-1.923a4.978 4.978 0 00-1.077-.705c-.462-.162-.9-.45-1.21-.832L7.674 2.87a2.67 2.67 0 00-3.774 3.774l3.1 2.564c.383.315.67.74.832 1.21.162.462.45.9.832 1.21l1.923 1.922c.384.315.83.603 1.21.832.462.162.9.45 1.21.832z" />
          </svg>
        </div>

        <div className="space-y-2 max-w-md mx-auto">
          <h2 className="text-lg font-bold text-slate-900">
            {title || moduleName} Module In Development
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
            {description || `The ${moduleName || 'requested'} administrative console is registered in the production navigation architecture and will be fully wired in its dedicated milestone.`}
          </p>
        </div>

        <div className="pt-2 flex items-center justify-center gap-3">
          <a
            href="/admin"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#123C32] text-white text-xs font-semibold hover:bg-[#0E332B] transition-colors shadow-xs"
          >
            &larr; Return to Dashboard
          </a>
          <a
            href="/admin/products"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#EEF5F1] text-[#123C32] text-xs font-semibold hover:bg-[#d5e8dd] transition-colors"
          >
            Manage Products
          </a>
        </div>
      </div>
    </div>
  );
}
