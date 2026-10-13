/* global queueMicrotask, Blob, URL */
import { useState, useEffect, useCallback } from 'react';
import { adminDashboardService as defaultDashboardService } from '../../features/admin/adminDashboard.service.js';
import { formatPrice } from '../../lib/utils.js';
import AdminPageHeader from '../../layouts/admin/AdminPageHeader.jsx';
import { AdminLoadingState, AdminErrorState, AdminEmptyState } from '../../layouts/admin/AdminShellStates.jsx';

/**
 * Format ISO date string into human-friendly date.
 */
function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const [year, month, day] = dateStr.split('-');
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

/**
 * Sanitize a CSV cell value against spreadsheet formula injection (CWE-1236)
 * while preserving valid numeric data and standard CSV escaping for quotes, commas, and newlines.
 *
 * @param {unknown} val
 * @returns {string}
 */
export function sanitizeCsvCell(val) {
  if (val === null || val === undefined) {
    return '';
  }
  if (typeof val === 'number' && Number.isFinite(val)) {
    return String(val);
  }
  let str = String(val);

  // Check for leading formula execution characters: '=', '+', '-', '@', '\t', '\r'
  // including cases where leading whitespace or control characters precede the formula trigger
  // eslint-disable-next-line no-control-regex
  const trimmed = str.replace(/^[\s\u0000-\u001F]+/, '');
  const isFormula = /^[=+\-@\t\r]/.test(str) || /^[=+\-@]/.test(trimmed);

  if (isFormula) {
    // Prepend single quote to force spreadsheet software to treat value as literal text
    str = `'${str}`;
  }

  // Standard CSV escaping: wrap in quotes if contains comma, quote, or newline, and double any inner quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Trigger authentic CSV file download from structured row data.
 */
export function downloadCsv(filename, headers, rows) {
  const csvContent = [
    headers.map(sanitizeCsvCell).join(','),
    ...rows.map((row) => row.map(sanitizeCsvCell).join(',')),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * AdminReportsPage Component
 * Route: /admin/reports
 *
 * Authoritative financial summaries, daily revenue breakdown, top product rankings,
 * and validated CSV exports based strictly on real backend aggregation endpoints.
 */
export default function AdminReportsPage({
  dashboardService: propDashboardService,
}) {
  const service = propDashboardService || defaultDashboardService;

  const [period, setPeriod] = useState('30d');
  const [salesData, setSalesData] = useState({ points: [], totalRevenue: 0, currency: 'INR' });
  const [summaryData, setSummaryData] = useState({});
  const [topProducts, setTopProducts] = useState([]);
  const [activeTab, setActiveTab] = useState('daily');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exportNotice, setExportNotice] = useState(null);

  const loadReportData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [salesRes, summaryRes, topRes] = await Promise.all([
        service.getDashboardSales(period),
        service.getDashboardSummary(),
        service.getTopSellingProducts(),
      ]);

      setSalesData(salesRes || { points: [], totalRevenue: 0, currency: 'INR' });
      setSummaryData(summaryRes?.summary || {});
      setTopProducts(Array.isArray(topRes) ? topRes : []);
    } catch (err) {
      setError(err?.message || 'Failed to generate store report.');
    } finally {
      setIsLoading(false);
    }
  }, [service, period]);

  useEffect(() => {
    let ignore = false;
    queueMicrotask(() => {
      if (!ignore) {
        loadReportData();
      }
    });
    return () => {
      ignore = true;
    };
  }, [loadReportData]);

  // Derived aggregates
  const totalPeriodOrders = (salesData.points || []).reduce((acc, p) => acc + (p.orderCount || 0), 0);
  const averageOrderValue =
    totalPeriodOrders > 0 ? Math.round(salesData.totalRevenue / totalPeriodOrders) : 0;

  // CSV Export Handlers
  const handleExportDailySales = () => {
    if (!salesData.points || salesData.points.length === 0) return;

    const headers = ['Date', 'Paid Orders', 'Gross Revenue (INR)'];
    const rows = salesData.points.map((pt) => [pt.date, pt.orderCount, pt.revenue]);
    downloadCsv(`commerceflow_daily_sales_${period}.csv`, headers, rows);
    setExportNotice(`Daily sales CSV (${period}) downloaded successfully.`);
    setTimeout(() => setExportNotice(null), 4000);
  };

  const handleExportTopProducts = () => {
    if (!topProducts || topProducts.length === 0) return;

    const headers = ['Rank', 'Product Name', 'SKU', 'Units Sold', 'Total Revenue (INR)'];
    const rows = topProducts.map((p, idx) => [
      idx + 1,
      p.name || 'Untitled',
      p.sku || '—',
      p.unitsSold || 0,
      p.totalRevenue || 0,
    ]);
    downloadCsv(`commerceflow_top_products_${period}.csv`, headers, rows);
    setExportNotice('Top products report CSV downloaded successfully.');
    setTimeout(() => setExportNotice(null), 4000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <AdminPageHeader
          title="Analytics & Reports"
          subtitle="Financial summaries, revenue breakdown, and exportable sales data."
          badge={period === '7d' ? 'Last 7 Days' : period === '30d' ? 'Last 30 Days' : 'Last 90 Days'}
        />

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportDailySales}
            disabled={isLoading || !salesData.points || salesData.points.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-[#123C32] text-xs font-semibold hover:bg-slate-50 transition-colors shadow-2xs disabled:opacity-40 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export Daily CSV
          </button>
          <button
            type="button"
            onClick={handleExportTopProducts}
            disabled={isLoading || topProducts.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#123C32] text-white text-xs font-semibold hover:bg-[#0E332B] transition-colors shadow-2xs disabled:opacity-40 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export Top Products
          </button>
        </div>
      </div>

      {/* Export Toast */}
      {exportNotice && (
        <div
          role="status"
          className="p-3.5 rounded-xl text-xs font-semibold flex items-center justify-between border bg-emerald-50 text-emerald-800 border-emerald-200"
        >
          <span>{exportNotice}</span>
          <button
            type="button"
            onClick={() => setExportNotice(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold ml-4"
          >
            &times;
          </button>
        </div>
      )}

      {/* Period Selection Controls */}
      <div className="bg-white rounded-2xl border border-[#E4E8E5] p-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
          <span>Reporting Period:</span>
        </div>
        <div className="inline-flex p-1 bg-slate-100 rounded-xl gap-1">
          <button
            type="button"
            onClick={() => setPeriod('7d')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              period === '7d' ? 'bg-white text-[#123C32] shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Last 7 Days
          </button>
          <button
            type="button"
            onClick={() => setPeriod('30d')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              period === '30d' ? 'bg-white text-[#123C32] shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Last 30 Days
          </button>
          <button
            type="button"
            onClick={() => setPeriod('90d')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              period === '90d' ? 'bg-white text-[#123C32] shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Last 90 Days
          </button>
        </div>
      </div>

      {isLoading ? (
        <AdminLoadingState title="Generating Analytics Report..." subtitle="Aggregating settled orders and revenue." />
      ) : error ? (
        <AdminErrorState
          title="Could not load reports"
          message={error}
          onRetry={loadReportData}
        />
      ) : (
        <div className="space-y-6">
          {/* Key Metric Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-[#E4E8E5] p-5 shadow-2xs">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Gross Period Revenue</div>
              <div className="text-2xl font-black text-[#102A2A] mt-2">{formatPrice(salesData.totalRevenue)}</div>
              <div className="text-xs text-slate-400 mt-1">Paid settled orders</div>
            </div>
            <div className="bg-white rounded-2xl border border-[#E4E8E5] p-5 shadow-2xs">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Paid Order Count</div>
              <div className="text-2xl font-black text-emerald-700 mt-2">{totalPeriodOrders}</div>
              <div className="text-xs text-slate-400 mt-1">Within selected period</div>
            </div>
            <div className="bg-white rounded-2xl border border-[#E4E8E5] p-5 shadow-2xs">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Average Order Value</div>
              <div className="text-2xl font-black text-[#123C32] mt-2">{formatPrice(averageOrderValue)}</div>
              <div className="text-xs text-slate-400 mt-1">Gross revenue / paid orders</div>
            </div>
            <div className="bg-white rounded-2xl border border-[#E4E8E5] p-5 shadow-2xs">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">All-Time Store Orders</div>
              <div className="text-2xl font-black text-slate-800 mt-2">{summaryData.totalOrders || 0}</div>
              <div className="text-xs text-slate-400 mt-1">Lifetime total orders</div>
            </div>
          </div>

          {/* Sub-Tabs: Daily Breakdown vs Top Products */}
          <div className="border-b border-[#D8ECE7] flex items-center gap-2 overflow-x-auto text-xs font-bold">
            <button
              type="button"
              onClick={() => setActiveTab('daily')}
              className={`px-4 py-3 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'daily'
                  ? 'border-[#123C32] text-[#123C32]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Daily Revenue Breakdown ({salesData.points?.length || 0} Days)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('top-products')}
              className={`px-4 py-3 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'top-products'
                  ? 'border-[#123C32] text-[#123C32]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Top Selling Products ({topProducts.length})
            </button>
          </div>

          {/* Tab 1: Daily Revenue Table */}
          {activeTab === 'daily' && (
            <div className="bg-white rounded-2xl border border-[#E4E8E5] overflow-hidden shadow-xs">
              {salesData.points?.length === 0 ? (
                <AdminEmptyState
                  title="No Sales Records Found"
                  message="There are no paid orders recorded in the selected date window."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-600">
                    <thead className="bg-[#EEF5F1] text-[#123C32] font-bold uppercase tracking-wider border-b border-[#D8ECE7]">
                      <tr>
                        <th scope="col" className="px-5 py-3.5">Date</th>
                        <th scope="col" className="px-5 py-3.5">Paid Orders</th>
                        <th scope="col" className="px-5 py-3.5">Gross Revenue</th>
                        <th scope="col" className="px-5 py-3.5">Revenue Share</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {salesData.points.map((pt) => {
                        const share =
                          salesData.totalRevenue > 0
                            ? Math.round((pt.revenue / salesData.totalRevenue) * 100)
                            : 0;

                        return (
                          <tr key={pt.date} className="hover:bg-slate-50/70 transition-colors">
                            <td className="px-5 py-3.5">
                              <div className="font-bold text-slate-900">{formatDate(pt.date)}</div>
                              <div className="font-mono text-[11px] text-slate-400">{pt.date}</div>
                            </td>
                            <td className="px-5 py-3.5">
                              <span className="font-semibold text-slate-800">{pt.orderCount} orders</span>
                            </td>
                            <td className="px-5 py-3.5">
                              <span className="font-mono font-bold text-slate-900">{formatPrice(pt.revenue)}</span>
                            </td>
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-2 max-w-[140px]">
                                <div className="flex-1 bg-slate-100 h-2 rounded-full overflow-hidden">
                                  <div
                                    className="bg-[#123C32] h-full rounded-full transition-all"
                                    style={{ width: `${Math.min(share, 100)}%` }}
                                  />
                                </div>
                                <span className="text-[11px] font-mono text-slate-500 w-8">{share}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Top Selling Products Table */}
          {activeTab === 'top-products' && (
            <div className="bg-white rounded-2xl border border-[#E4E8E5] overflow-hidden shadow-xs">
              {topProducts.length === 0 ? (
                <AdminEmptyState
                  title="No Product Sales History"
                  message="Order line-item history has not registered settled sales yet."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-600">
                    <thead className="bg-[#EEF5F1] text-[#123C32] font-bold uppercase tracking-wider border-b border-[#D8ECE7]">
                      <tr>
                        <th scope="col" className="px-5 py-3.5">Rank</th>
                        <th scope="col" className="px-5 py-3.5">Product Name</th>
                        <th scope="col" className="px-5 py-3.5">Units Sold</th>
                        <th scope="col" className="px-5 py-3.5">Total Revenue</th>
                        <th scope="col" className="px-5 py-3.5 text-right">Catalog Link</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {topProducts.map((p, idx) => (
                        <tr key={p.productId || idx} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-5 py-3.5 font-mono font-bold text-slate-500">
                            #{idx + 1}
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="font-bold text-slate-900">{p.name || 'Product'}</div>
                            {p.sku && <div className="font-mono text-[11px] text-slate-400">SKU: {p.sku}</div>}
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              {p.unitsSold || 0} units
                            </span>
                          </td>
                          <td className="px-5 py-3.5 font-mono font-bold text-slate-900">
                            {formatPrice(p.totalRevenue || 0)}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            {p.productId ? (
                              <a
                                href={`/admin/products/${p.productId}`}
                                className="text-xs font-semibold text-[#123C32] hover:underline"
                              >
                                View Product &rarr;
                              </a>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
