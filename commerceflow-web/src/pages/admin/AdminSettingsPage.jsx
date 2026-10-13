/* global queueMicrotask */
import { useState, useEffect, useCallback } from 'react';
import { adminSettingsService as defaultSettingsService } from '../../features/admin/adminSettings.service.js';
import AdminPageHeader from '../../layouts/admin/AdminPageHeader.jsx';
import { AdminLoadingState, AdminErrorState } from '../../layouts/admin/AdminShellStates.jsx';

/**
 * AdminSettingsPage Component
 * Route: /admin/settings
 *
 * Full management surface for global storefront configurations and operational parameters.
 */
export default function AdminSettingsPage({
  settingsService: propSettingsService,
}) {
  const service = propSettingsService || defaultSettingsService;

  const [settings, setSettings] = useState({
    storeName: 'CommerceFlow',
    supportEmail: 'support@commerceflow.com',
    supportPhone: '+91 98765 43210',
    currency: 'INR',
    currencySymbol: '₹',
    freeShippingThreshold: 999,
    standardShippingRate: 99,
    lowStockThreshold: 5,
    returnWindowDays: 14,
    isMaintenanceMode: false,
  });

  const [systemInfo, setSystemInfo] = useState({
    environment: 'development',
    apiVersion: 'v1',
    databaseStatus: 'connected',
    paymentGateway: 'Razorpay (Configured)',
    rateLimitRequestsPerWindow: 100,
    rateLimitWindowMinutes: 15,
  });

  const [activeTab, setActiveTab] = useState('general');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(null);
  const [saveError, setSaveError] = useState(null);

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await service.getStoreSettings();
      if (res.settings && Object.keys(res.settings).length > 0) {
        setSettings((prev) => ({ ...prev, ...res.settings }));
      }
      if (res.systemInfo) {
        setSystemInfo(res.systemInfo);
      }
    } catch (err) {
      setError(err?.message || 'Failed to retrieve store settings.');
    } finally {
      setIsLoading(false);
    }
  }, [service]);

  useEffect(() => {
    let ignore = false;
    queueMicrotask(() => {
      if (!ignore) {
        loadSettings();
      }
    });
    return () => {
      ignore = true;
    };
  }, [loadSettings]);

  const handleChange = (field, value) => {
    setSettings((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(null);
    setSaveError(null);

    try {
      const payload = {
        storeName: String(settings.storeName || '').trim(),
        supportEmail: String(settings.supportEmail || '').trim(),
        supportPhone: String(settings.supportPhone || '').trim(),
        currency: String(settings.currency || 'INR').trim().toUpperCase(),
        currencySymbol: String(settings.currencySymbol || '₹').trim(),
        freeShippingThreshold: Number(settings.freeShippingThreshold) || 0,
        standardShippingRate: Number(settings.standardShippingRate) || 0,
        lowStockThreshold: parseInt(settings.lowStockThreshold, 10) || 5,
        returnWindowDays: parseInt(settings.returnWindowDays, 10) || 14,
        isMaintenanceMode: Boolean(settings.isMaintenanceMode),
      };

      const res = await service.updateStoreSettings(payload);
      if (res.settings) {
        setSettings((prev) => ({ ...prev, ...res.settings }));
      }
      setSaveSuccess('Store settings successfully updated and persisted.');
    } catch (err) {
      setSaveError(err?.message || 'Failed to save store configuration.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Store Settings"
        subtitle="Global store profile, fulfillment policies, inventory alerts, and system health."
        badge={settings.isMaintenanceMode ? 'Maintenance Active' : 'Store Online'}
      />

      {/* Success Notification */}
      {saveSuccess && (
        <div
          role="status"
          className="p-4 rounded-xl text-xs font-semibold flex items-center justify-between border bg-emerald-50 text-emerald-800 border-emerald-200"
        >
          <span>{saveSuccess}</span>
          <button
            type="button"
            onClick={() => setSaveSuccess(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold ml-4"
          >
            &times;
          </button>
        </div>
      )}

      {/* Error Notification */}
      {saveError && (
        <div
          role="alert"
          className="p-4 rounded-xl text-xs font-semibold flex items-center justify-between border bg-rose-50 text-rose-800 border-rose-200"
        >
          <span>{saveError}</span>
          <button
            type="button"
            onClick={() => setSaveError(null)}
            className="text-rose-700 hover:text-rose-900 font-bold ml-4"
          >
            &times;
          </button>
        </div>
      )}

      {isLoading ? (
        <AdminLoadingState title="Loading Settings..." subtitle="Retrieving configuration records." />
      ) : error ? (
        <AdminErrorState
          title="Could not load settings"
          message={error}
          onRetry={loadSettings}
        />
      ) : (
        <div className="space-y-6">
          {/* Settings Tabs */}
          <div className="border-b border-[#D8ECE7] flex items-center gap-2 overflow-x-auto text-xs font-bold">
            <button
              type="button"
              onClick={() => setActiveTab('general')}
              className={`px-4 py-3 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'general'
                  ? 'border-[#123C32] text-[#123C32]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Store Profile
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('fulfillment')}
              className={`px-4 py-3 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'fulfillment'
                  ? 'border-[#123C32] text-[#123C32]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Fulfillment & Returns
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('inventory')}
              className={`px-4 py-3 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'inventory'
                  ? 'border-[#123C32] text-[#123C32]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Inventory Alerts
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('system')}
              className={`px-4 py-3 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'system'
                  ? 'border-[#123C32] text-[#123C32]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              System Health & Diagnostics
            </button>
          </div>

          <form onSubmit={handleSave} className="space-y-6">
            {/* General Settings */}
            {activeTab === 'general' && (
              <div className="bg-white rounded-2xl border border-[#E4E8E5] p-6 sm:p-8 space-y-5 shadow-2xs">
                <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
                  Store Identification & Contact
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="store-name" className="block text-xs font-bold text-slate-700 mb-1">
                      Store Brand Name
                    </label>
                    <input
                      id="store-name"
                      type="text"
                      value={settings.storeName}
                      onChange={(e) => handleChange('storeName', e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123C32]/20 focus:border-[#123C32]"
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="support-email" className="block text-xs font-bold text-slate-700 mb-1">
                      Support Email
                    </label>
                    <input
                      id="support-email"
                      type="email"
                      value={settings.supportEmail}
                      onChange={(e) => handleChange('supportEmail', e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123C32]/20 focus:border-[#123C32]"
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="support-phone" className="block text-xs font-bold text-slate-700 mb-1">
                      Support Contact Phone
                    </label>
                    <input
                      id="support-phone"
                      type="text"
                      value={settings.supportPhone}
                      onChange={(e) => handleChange('supportPhone', e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123C32]/20 focus:border-[#123C32]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="currency-code" className="block text-xs font-bold text-slate-700 mb-1">
                        Currency Code
                      </label>
                      <input
                        id="currency-code"
                        type="text"
                        maxLength={3}
                        value={settings.currency}
                        onChange={(e) => handleChange('currency', e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl uppercase font-mono focus:outline-none focus:ring-2 focus:ring-[#123C32]/20 focus:border-[#123C32]"
                        required
                      />
                    </div>
                    <div>
                      <label htmlFor="currency-symbol" className="block text-xs font-bold text-slate-700 mb-1">
                        Symbol
                      </label>
                      <input
                        id="currency-symbol"
                        type="text"
                        maxLength={5}
                        value={settings.currencySymbol}
                        onChange={(e) => handleChange('currencySymbol', e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-mono focus:outline-none focus:ring-2 focus:ring-[#123C32]/20 focus:border-[#123C32]"
                        required
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Fulfillment Settings */}
            {activeTab === 'fulfillment' && (
              <div className="bg-white rounded-2xl border border-[#E4E8E5] p-6 sm:p-8 space-y-5 shadow-2xs">
                <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
                  Shipping Rates & Customer Return Window
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label htmlFor="free-shipping-threshold" className="block text-xs font-bold text-slate-700 mb-1">
                      Free Shipping Threshold ({settings.currencySymbol})
                    </label>
                    <input
                      id="free-shipping-threshold"
                      type="number"
                      min="0"
                      value={settings.freeShippingThreshold}
                      onChange={(e) => handleChange('freeShippingThreshold', e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123C32]/20 focus:border-[#123C32]"
                      required
                    />
                    <div className="text-[11px] text-slate-400 mt-1">Orders above this qualify for free delivery</div>
                  </div>

                  <div>
                    <label htmlFor="standard-shipping-rate" className="block text-xs font-bold text-slate-700 mb-1">
                      Standard Shipping Fee ({settings.currencySymbol})
                    </label>
                    <input
                      id="standard-shipping-rate"
                      type="number"
                      min="0"
                      value={settings.standardShippingRate}
                      onChange={(e) => handleChange('standardShippingRate', e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123C32]/20 focus:border-[#123C32]"
                      required
                    />
                    <div className="text-[11px] text-slate-400 mt-1">Base rate for regular orders</div>
                  </div>

                  <div>
                    <label htmlFor="return-window" className="block text-xs font-bold text-slate-700 mb-1">
                      Return Window (Days)
                    </label>
                    <input
                      id="return-window"
                      type="number"
                      min="1"
                      max="90"
                      value={settings.returnWindowDays}
                      onChange={(e) => handleChange('returnWindowDays', e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123C32]/20 focus:border-[#123C32]"
                      required
                    />
                    <div className="text-[11px] text-slate-400 mt-1">Eligible period for RMA returns</div>
                  </div>
                </div>
              </div>
            )}

            {/* Inventory Settings */}
            {activeTab === 'inventory' && (
              <div className="bg-white rounded-2xl border border-[#E4E8E5] p-6 sm:p-8 space-y-5 shadow-2xs">
                <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
                  Inventory Alerts & Low Stock Threshold
                </h3>

                <div className="max-w-md space-y-4">
                  <div>
                    <label htmlFor="low-stock-threshold" className="block text-xs font-bold text-slate-700 mb-1">
                      Low Stock Threshold (Units)
                    </label>
                    <input
                      id="low-stock-threshold"
                      type="number"
                      min="1"
                      max="100"
                      value={settings.lowStockThreshold}
                      onChange={(e) => handleChange('lowStockThreshold', e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123C32]/20 focus:border-[#123C32]"
                      required
                    />
                    <div className="text-[11px] text-slate-400 mt-1">
                      Items with stock at or below this count will trigger &quot;Low Stock&quot; dashboard badges and warnings.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* System Health & Diagnostics */}
            {activeTab === 'system' && (
              <div className="bg-white rounded-2xl border border-[#E4E8E5] p-6 sm:p-8 space-y-6 shadow-2xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-bold text-slate-900">
                    System Health & Operational Status
                  </h3>
                  <a
                    href="/admin/setup"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#EEF5F1] text-[#123C32] text-xs font-semibold hover:bg-[#d5e8dd] transition-colors"
                  >
                    Manage Administrators &rarr;
                  </a>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-800">Storefront Maintenance Mode</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800 border border-amber-200">
                        Configuration Flag
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Persisted configuration setting. Intended for reverse-proxy, CDN, or maintenance splash gating; does not block customer API endpoints directly.
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.isMaintenanceMode}
                      onChange={(e) => handleChange('isMaintenanceMode', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#123C32]" />
                  </label>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Read-Only Infrastructure Status
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                    <div className="p-3 rounded-xl border border-slate-100 bg-slate-50">
                      <span className="text-slate-400 block text-[11px]">Runtime Environment</span>
                      <span className="font-bold font-mono text-slate-800 capitalize">{systemInfo.environment}</span>
                    </div>
                    <div className="p-3 rounded-xl border border-slate-100 bg-slate-50">
                      <span className="text-slate-400 block text-[11px]">Database Connection</span>
                      <span className="font-bold text-emerald-700 capitalize">● {systemInfo.databaseStatus}</span>
                    </div>
                    <div className="p-3 rounded-xl border border-slate-100 bg-slate-50">
                      <span className="text-slate-400 block text-[11px]">Payment Gateway</span>
                      <span className="font-bold text-slate-800">{systemInfo.paymentGateway}</span>
                    </div>
                    <div className="p-3 rounded-xl border border-slate-100 bg-slate-50">
                      <span className="text-slate-400 block text-[11px]">API Version</span>
                      <span className="font-bold font-mono text-slate-800">{systemInfo.apiVersion}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Save Buttons Bar */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={loadSettings}
                disabled={isSaving}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Reset
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-[#123C32] text-white hover:bg-[#0E332B] transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {isSaving ? 'Saving Settings...' : 'Save Settings'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
