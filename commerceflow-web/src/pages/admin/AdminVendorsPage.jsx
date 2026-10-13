import AdminPageHeader from '../../layouts/admin/AdminPageHeader.jsx';

/**
 * AdminVendorsPage Component
 * Route: /admin/vendors
 *
 * Authoritative Single-Merchant Architecture & Multi-Tenant Migration Console.
 * Accurately represents CommerceFlow's single-merchant operating model without
 * fabricating marketplace records.
 */
export default function AdminVendorsPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Vendors Directory"
        subtitle="Store tenancy model, merchant architecture, and multi-vendor marketplace governance."
        badge="Single-Merchant Active"
      />

      {/* Tenancy Overview Banner */}
      <div className="bg-white rounded-2xl border border-[#D8ECE7] p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[#EEF5F1] text-[#123C32] border border-[#123C32]/10 flex items-center justify-center shrink-0 shadow-2xs">
              <svg className="w-6 h-6 stroke-[1.8]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.25A2.25 2.25 0 010 18.75V3.75A2.25 2.25 0 012.25 1.5h19.5A2.25 2.25 0 0124 3.75v15a2.25 2.25 0 01-2.25 2.25H13.5m-4.5 0v-7.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Direct Single-Merchant Architecture</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                CommerceFlow operates as a direct first-party retailer. All catalog products, inventory, and order fulfillment are managed under a unified merchant entity.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 shrink-0">
            ● 1st-Party Store
          </span>
        </div>

        {/* Operating Architecture Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Tenancy Architecture</div>
            <div className="text-sm font-bold text-slate-900">Single-Tenant Store</div>
            <div className="text-[11px] text-slate-400">Unified catalog & database</div>
          </div>
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Merchant Entity</div>
            <div className="text-sm font-bold text-slate-900">CommerceFlow Retail</div>
            <div className="text-[11px] text-slate-400">Primary legal merchant of record</div>
          </div>
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Settlement Routing</div>
            <div className="text-sm font-bold text-slate-900">Direct Merchant Gateway</div>
            <div className="text-[11px] text-slate-400">Direct Razorpay payout channel</div>
          </div>
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Fulfillment Protocol</div>
            <div className="text-sm font-bold text-slate-900">Centralized Dispatch</div>
            <div className="text-[11px] text-slate-400">Single-source order handling</div>
          </div>
        </div>
      </div>

      {/* Multi-Tenant Marketplace Roadmap & Requirements */}
      <div className="bg-white rounded-2xl border border-[#E4E8E5] p-6 sm:p-8 shadow-xs space-y-5">
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            Multi-Vendor Marketplace Transition Requirements
          </h3>
          <p className="text-xs text-slate-500">
            To prevent data integrity issues and preserve backward compatibility, multi-vendor functionality requires explicit architectural approvals and the following backend components:
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-[#EEF5F1] text-[#123C32] font-mono font-bold text-xs flex items-center justify-center">1</span>
              <h4 className="text-xs font-bold text-slate-800">Multi-Tenant Vendor Model & KYC</h4>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Requires a dedicated <code>Vendor</code> Mongoose collection supporting business registration, GSTIN/tax verification, bank payout credentials, and merchant agreements.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-[#EEF5F1] text-[#123C32] font-mono font-bold text-xs flex items-center justify-center">2</span>
              <h4 className="text-xs font-bold text-slate-800">Role-Based Access Control (RBAC)</h4>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Requires an extension of the current <code>admin | customer</code> role architecture to include <code>vendor</code>, with vendor-scoped authorization middleware.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-[#EEF5F1] text-[#123C32] font-mono font-bold text-xs flex items-center justify-center">3</span>
              <h4 className="text-xs font-bold text-slate-800">Catalog Scoping & Isolation</h4>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Requires adding <code>vendorId</code> indexing to <code>Product</code> and <code>Inventory</code> models to prevent cross-vendor catalog modification or data leaks.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-[#EEF5F1] text-[#123C32] font-mono font-bold text-xs flex items-center justify-center">4</span>
              <h4 className="text-xs font-bold text-slate-800">Order Splitting & Commission Ledger</h4>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Requires splitting checkout orders across multiple vendors, individual shipment tracking numbers, commission fee deduction, and payout reconciliation.
            </p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center gap-3">
          <a
            href="/admin/products"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#123C32] text-white text-xs font-semibold hover:bg-[#0E332B] transition-colors shadow-xs"
          >
            Manage First-Party Products &rarr;
          </a>
          <a
            href="/admin/settings"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold hover:bg-slate-200 transition-colors"
          >
            Store Settings
          </a>
        </div>
      </div>
    </div>
  );
}
