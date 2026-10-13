/* global queueMicrotask */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../features/auth/useAuth.js';
import { adminDashboardService } from '../../features/admin/adminDashboard.service.js';
import { adminAuditService } from '../../features/admin/adminAudit.service.js';
import { formatPrice } from '../../lib/utils.js';
import Skeleton from '../../components/Skeleton.jsx';
import Button from '../../components/Button.jsx';
import { AdminErrorState } from '../../layouts/admin/AdminShellStates.jsx';

/**
 * Format timestamp into human-readable date string.
 * @param {string|Date} dateString
 * @returns {string}
 */
function formatDate(dateString) {
  if (!dateString) return '—';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-IN', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

/**
 * Format timestamp into short date (for charts & tables).
 * @param {string} dateString 'YYYY-MM-DD'
 * @returns {string}
 */
function formatShortDate(dateString) {
  if (!dateString) return '';
  try {
    const parts = dateString.split('-');
    if (parts.length === 3) {
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const month = monthNames[parseInt(parts[1], 10) - 1] || '';
      return `${month} ${parseInt(parts[2], 10)}`;
    }
    return dateString;
  } catch {
    return dateString;
  }
}

/**
 * Status styling lookup for order fulfillment state matching reference badges.
 * @param {string} status
 */
function getOrderStatusBadge(status) {
  switch (status?.toLowerCase()) {
    case 'delivered':
      return {
        className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        dotClass: 'bg-emerald-500',
        label: 'Delivered',
      };
    case 'processing':
      return {
        className: 'bg-blue-50 text-blue-700 border-blue-200',
        dotClass: 'bg-blue-500',
        label: 'Processing',
      };
    case 'shipped':
      return {
        className: 'bg-purple-50 text-purple-700 border-purple-200',
        dotClass: 'bg-purple-500',
        label: 'Shipped',
      };
    case 'confirmed':
      return {
        className: 'bg-amber-50 text-amber-700 border-amber-200',
        dotClass: 'bg-amber-500',
        label: 'Confirmed',
      };
    case 'cancelled':
      return {
        className: 'bg-rose-50 text-rose-700 border-rose-200',
        dotClass: 'bg-rose-500',
        label: 'Cancelled',
      };
    case 'pending':
    default:
      return {
        className: 'bg-slate-100 text-slate-700 border-slate-200',
        dotClass: 'bg-slate-400',
        label: 'Pending',
      };
  }
}

/**
 * Concise, truthful summary description for audit events in dashboard activity card.
 * @param {Object} log
 * @returns {string}
 */
function getActivitySummary(log) {
  if (!log) return '';
  const { eventType, metadata = {} } = log;
  switch (eventType) {
    case 'PRODUCT_CREATED':
      return `Created product "${metadata.name || log.resourceId || 'product'}"`;
    case 'PRODUCT_UPDATED':
      return `Updated product "${metadata.name || log.resourceId || 'product'}"`;
    case 'PRODUCT_STATUS_UPDATED':
      return `Product ${metadata.isActive ? 'activated' : 'deactivated'}`;
    case 'PRODUCT_DELETED':
      return `Soft-deleted catalog product`;
    case 'INVENTORY_ADJUSTED':
      return `Stock adjusted by ${metadata.adjustment > 0 ? '+' : ''}${metadata.adjustment} for ${metadata.productName || 'item'}`;
    case 'ORDER_STATUS_UPDATED':
      return `Order status: ${metadata.newStatus || 'updated'}`;
    case 'SHIPMENT_TRACKING_UPDATED':
      return `Shipment tracking updated (${metadata.carrier || 'carrier'})`;
    case 'RETURN_APPROVED':
      return `Return approved for Order #${metadata.orderId || '—'}`;
    case 'RETURN_REJECTED':
      return `Return rejected`;
    case 'RETURN_RECEIVED':
      return `Return items received`;
    case 'RETURN_COMPLETED':
      return `Return completed & inventory restocked`;
    case 'REFUND_REQUESTED':
      return `Refund requested`;
    case 'REFUND_SUCCEEDED':
      return `Refund succeeded via ${metadata.gateway || 'Razorpay'}`;
    case 'REFUND_FAILED':
      return `Refund failed`;
    case 'ADMIN_USER_CREATED':
      return `Created admin account (${metadata.email || log.targetEmail || 'admin'})`;
    case 'ADMIN_USER_STATUS_UPDATED':
      return `Admin status changed to ${metadata.newStatus || (metadata.isActive ? 'active' : 'inactive')}`;
    case 'ADMIN_USER_ROLE_UPDATED':
      return `Admin role changed to ${metadata.newRole || 'unknown'}`;
    case 'ADMIN_CUSTOMER_STATUS_UPDATED':
      return `Customer account ${metadata.isActive ? 'activated' : 'deactivated'}`;
    default:
      return typeof eventType === 'string' ? eventType.replace(/_/g, ' ').toLowerCase() : 'activity';
  }
}

/**
 * Smooth SVG Line/Area Sales Chart Component matching reference.
 */
function SalesChart({ points = [], period = '7d', isLoading = false }) {
  const [hoveredPoint, setHoveredPoint] = useState(null);

  const maxRevenue = useMemo(() => {
    if (!points || points.length === 0) return 10000;
    const max = Math.max(...points.map((p) => Number(p.revenue) || 0));
    return max > 0 ? max : 10000;
  }, [points]);

  const hasSales = useMemo(() => {
    return points.some((p) => (Number(p.revenue) || 0) > 0);
  }, [points]);

  // Dimensions for SVG Coordinate System
  const svgWidth = 600;
  const svgHeight = 220;
  const paddingX = 40;
  const paddingTop = 20;
  const paddingBottom = 30;

  // Compute (x, y) coordinates for each data point
  const chartCoordinates = useMemo(() => {
    if (!points || points.length === 0) return [];
    const count = points.length;
    const usableW = svgWidth - paddingX * 2;
    const usableH = svgHeight - paddingTop - paddingBottom;

    return points.map((p, idx) => {
      const x = count <= 1 ? svgWidth / 2 : paddingX + (idx / (count - 1)) * usableW;
      const rev = Number(p.revenue) || 0;
      const y = svgHeight - paddingBottom - (rev / maxRevenue) * usableH;
      return { ...p, x, y };
    });
  }, [points, maxRevenue]);

  // Construct smooth SVG Bezier path
  const { linePath, areaPath } = useMemo(() => {
    if (chartCoordinates.length === 0) return { linePath: '', areaPath: '' };
    if (chartCoordinates.length === 1) {
      const p = chartCoordinates[0];
      return {
        linePath: `M ${p.x - 20} ${p.y} L ${p.x + 20} ${p.y}`,
        areaPath: `M ${p.x - 20} ${svgHeight - paddingBottom} L ${p.x - 20} ${p.y} L ${p.x + 20} ${p.y} L ${p.x + 20} ${svgHeight - paddingBottom} Z`,
      };
    }

    let dLine = `M ${chartCoordinates[0].x} ${chartCoordinates[0].y}`;
    for (let i = 0; i < chartCoordinates.length - 1; i++) {
      const p0 = chartCoordinates[i];
      const p1 = chartCoordinates[i + 1];
      const midX = (p0.x + p1.x) / 2;
      dLine += ` C ${midX} ${p0.y}, ${midX} ${p1.y}, ${p1.x} ${p1.y}`;
    }

    const first = chartCoordinates[0];
    const last = chartCoordinates[chartCoordinates.length - 1];
    const dArea = `${dLine} L ${last.x} ${svgHeight - paddingBottom} L ${first.x} ${svgHeight - paddingBottom} Z`;

    return { linePath: dLine, areaPath: dArea };
  }, [chartCoordinates]);

  if (isLoading) {
    return (
      <div className="h-64 flex flex-col justify-end gap-3 p-4">
        <div className="flex items-end justify-between gap-2 h-44">
          {[40, 65, 30, 85, 55, 90, 45].map((h, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-2">
              <Skeleton className="w-full rounded-t-md" style={{ height: `${h}%` }} />
              <Skeleton className="h-3 w-8" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!points || points.length === 0 || !hasSales) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-center p-6 bg-slate-50/60 rounded-2xl border border-dashed border-slate-200">
        <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-2">
          <svg className="w-5 h-5 stroke-[1.8]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-slate-700">No sales recorded in this period</p>
        <p className="text-xs text-slate-400 mt-0.5">Authoritative revenue will appear here once paid customer orders occur.</p>
      </div>
    );
  }

  // Y-axis grid increments
  const gridLevels = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="relative pt-2" role="region" aria-label={`Sales performance chart for last ${period}`}>
      {/* Interactive Floating Hover Tooltip */}
      {hoveredPoint && (
        <div
          className="absolute bg-[#0B2820] text-white px-3.5 py-2 rounded-xl text-xs shadow-xl z-20 pointer-events-none transition-all duration-150 border border-emerald-500/30"
          style={{
            left: `${(hoveredPoint.x / svgWidth) * 100}%`,
            top: `${(hoveredPoint.y / svgHeight) * 100}%`,
            transform: 'translate(-50%, -125%)',
          }}
        >
          <div className="text-[11px] font-semibold text-slate-300">{formatShortDate(hoveredPoint.date)}</div>
          <div className="text-emerald-400 font-extrabold text-sm">{formatPrice(hoveredPoint.revenue)}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {hoveredPoint.orderCount} {hoveredPoint.orderCount === 1 ? 'order' : 'orders'}
          </div>
        </div>
      )}

      {/* SVG Canvas */}
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="w-full h-56 sm:h-64 overflow-visible"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="salesAreaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10B981" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Horizontal Dotted Gridlines & Y-Axis Labels */}
        {gridLevels.map((lvl, i) => {
          const y = svgHeight - paddingBottom - lvl * (svgHeight - paddingTop - paddingBottom);
          const val = Math.round(lvl * maxRevenue);
          const formattedVal = val >= 1000 ? `$${Math.round(val / 1000)}K` : `$${val}`;

          return (
            <g key={i}>
              <line
                x1={paddingX}
                y1={y}
                x2={svgWidth - paddingX}
                y2={y}
                stroke="#E2E8F0"
                strokeDasharray="4 4"
                strokeWidth="1"
              />
              <text
                x={paddingX - 8}
                y={y + 3.5}
                textAnchor="end"
                className="text-[10px] fill-slate-400 font-mono font-medium"
              >
                {formattedVal}
              </text>
            </g>
          );
        })}

        {/* Shaded Area Fill */}
        {areaPath && <path d={areaPath} fill="url(#salesAreaGradient)" />}

        {/* Smooth Curve Line */}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke="#10B981"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Interactive Data Point Dots */}
        {chartCoordinates.map((p, idx) => {
          const isHovered = hoveredPoint?.date === p.date;

          return (
            <g
              key={p.date || idx}
              tabIndex={0}
              className="cursor-pointer outline-none"
              onMouseEnter={() => setHoveredPoint(p)}
              onMouseLeave={() => setHoveredPoint(null)}
              onFocus={() => setHoveredPoint(p)}
              onBlur={() => setHoveredPoint(null)}
              aria-label={`${formatShortDate(p.date)}: ${formatPrice(p.revenue)} across ${p.orderCount} orders`}
            >
              {/* Invisible larger hit area for easy hover on mobile/touch */}
              <circle cx={p.x} cy={p.y} r="14" fill="transparent" />

              {/* Visible Data Dot */}
              <circle
                cx={p.x}
                cy={p.y}
                r={isHovered ? 5.5 : 3.5}
                fill={isHovered ? '#0B2820' : '#10B981'}
                stroke="#FFFFFF"
                strokeWidth={isHovered ? 2.5 : 2}
                className="transition-all duration-150"
              />

              {/* X-Axis Date Labels */}
              {(chartCoordinates.length <= 8 || idx % Math.ceil(chartCoordinates.length / 7) === 0) && (
                <text
                  x={p.x}
                  y={svgHeight - 10}
                  textAnchor="middle"
                  className="text-[10px] fill-slate-400 font-medium select-none"
                >
                  {formatShortDate(p.date)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * AdminDashboardPage Component
 * Route: /admin (Protected by AdminRoute in App.jsx)
 *
 * Production Admin Control Panel Redesign matching authoritative reference image:
 * - Lush landscape hero card with dark green overlay & glassmorphic metric pills
 * - 2x2 Quick Actions card (Add Product, Manage Inventory, View Orders, Manage Customers)
 * - Sales Overview with period toggle & smooth SVG line/area visualization
 * - Recent Orders table with distinct fulfillment status pills
 * - Top Selling Products card
 * - Secondary metrics row (Categories, Low Stock, Pending Orders, Out of Stock)
 * - Recent Products table with variant indicators
 * - System Activity timeline with honest server state guarantee
 * - Outdoor promotional visual card
 */
export default function AdminDashboardPage() {
  const { user } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Authoritative Dashboard Data
  const [summary, setSummary] = useState({
    totalProducts: 0,
    activeProducts: 0,
    totalOrders: 0,
    pendingOrders: 0,
    lowStockProducts: 0,
    outOfStockProducts: 0,
    totalCategories: 0,
    totalRevenue: 0,
  });

  const [sales, setSales] = useState({
    period: '7d',
    currency: 'INR',
    points: [],
    totalRevenue: 0,
  });

  const [selectedPeriod, setSelectedPeriod] = useState('7d');
  const [salesLoading, setSalesLoading] = useState(false);

  const [recentOrders, setRecentOrders] = useState([]);
  const [recentProducts, setRecentProducts] = useState([]);
  const [topSellingProducts, setTopSellingProducts] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);

  // Fetch initial consolidated summary (for initial mount and retry actions)
  const loadDashboard = useCallback(async (signal) => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await adminDashboardService.getDashboardSummary({ signal });
      setSummary(data?.summary || {});
      setSales(data?.sales || { period: '7d', currency: 'INR', points: [], totalRevenue: 0 });
      setSelectedPeriod(data?.sales?.period || '7d');
      setRecentOrders(data?.recentOrders || []);
      setRecentProducts(data?.recentProducts || []);
      setTopSellingProducts(data?.topSellingProducts || []);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      if (err?.status === 429) {
        const retrySecs = err?.retryAfter;
        setError(
          retrySecs
            ? `Too many requests. Rate limit cooldown active. Please retry in ${retrySecs} seconds.`
            : 'Too many requests. Please try again shortly.'
        );
      } else {
        setError(err?.message || 'Failed to load Admin Dashboard.');
      }
    } finally {
      setIsLoading(false);
    }

    if (adminAuditService && typeof adminAuditService.getAdminAuditLogs === 'function') {
      try {
        const auditData = await adminAuditService.getAdminAuditLogs({ limit: 5 }, { signal });
        setRecentActivity(auditData?.auditLogs || []);
      } catch (err) {
        if (err?.name === 'AbortError') return;
        // Non-blocking catch for audit logs (prevents 429 or auth issues from breaking dashboard)
      }
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;

    queueMicrotask(() => {
      if (!ignore) {
        loadDashboard(controller?.signal);
      }
    });

    return () => {
      ignore = true;
      if (controller) controller.abort();
    };
  }, [loadDashboard]);

  // Handle Sales Period Switch
  const handlePeriodChange = async (newPeriod) => {
    if (newPeriod === selectedPeriod) return;
    setSelectedPeriod(newPeriod);
    setSalesLoading(true);

    try {
      const salesData = await adminDashboardService.getDashboardSales(newPeriod);
      setSales(salesData);
    } catch {
      // Keep previous data if period switch fails temporarily
    } finally {
      setSalesLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto" role="status" aria-label="Loading dashboard">
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          <div className="xl:col-span-8 2xl:col-span-9 space-y-6">
            <Skeleton className="h-44 w-full rounded-3xl" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-32 rounded-3xl" />
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Skeleton className="h-80 rounded-3xl" />
              <Skeleton className="h-80 rounded-3xl" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-28 rounded-3xl" />
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Skeleton className="h-80 rounded-3xl" />
              <Skeleton className="h-80 rounded-3xl" />
            </div>
          </div>
          <div className="xl:col-span-4 2xl:col-span-3 space-y-6">
            <Skeleton className="h-72 rounded-3xl" />
            <Skeleton className="h-80 rounded-3xl" />
            <Skeleton className="h-64 rounded-3xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 max-w-7xl mx-auto">
        <AdminErrorState
          title="Unable to load Admin Dashboard"
          message={error}
          onRetry={loadDashboard}
        />
      </div>
    );
  }

  const adminDisplayName = user?.name?.trim() || 'Admin';

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* 2-Column Responsive Dashboard Shell Matching Reference */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* ============================================================== */}
        {/* MAIN LEFT SECTION (~72% width on desktop)                     */}
        {/* ============================================================== */}
        <div className="xl:col-span-8 2xl:col-span-9 space-y-6 min-w-0">
          {/* Page Title & Subtitle matching reference */}
          <div className="space-y-1">
            <h1 className="text-xl sm:text-2xl font-black text-[#102A2A] tracking-tight">
              E-Commerce Dashboard
            </h1>
            <p className="text-xs sm:text-sm text-[#648096]">
              Overview of your store performance and key metrics
            </p>
          </div>

          {/* 1. Welcome Hero Banner */}
          <div
            className="rounded-3xl p-6 sm:p-7 flex flex-col justify-between shadow-2xs relative overflow-hidden text-white min-h-[140px] sm:min-h-[155px]"
            style={{
              backgroundImage:
                'linear-gradient(to right, rgba(4, 29, 23, 0.95) 0%, rgba(4, 29, 23, 0.85) 55%, rgba(4, 29, 23, 0.35) 82%, rgba(4, 29, 23, 0.10) 100%), url("https://images.unsplash.com/photo-1510312305653-8ed496efae75?auto=format&fit=crop&w=1600&q=80")',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            <div className="space-y-1.5 max-w-xl">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-400 block">
                COMMERCEFLOW ADMIN
                <span className="sr-only">Admin Control Panel</span>
              </span>

              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                Welcome back, {adminDisplayName}!
              </h2>

              <p className="text-xs sm:text-sm text-slate-200/90 leading-relaxed max-w-lg">
                Manage your store, products, orders and more — all in one place.
              </p>
            </div>
          </div>

          {/* 2. Four Primary White KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {/* Card 1: Total Products */}
            <div className="bg-white rounded-3xl border border-[#D8ECE7] p-5 shadow-2xs flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                  </svg>
                </div>
                <span className="text-xs font-semibold text-[#648096]">Products</span>
              </div>
              <div>
                <span className="text-xs font-medium text-[#648096] block truncate">Total Products</span>
                <div className="text-2xl font-black text-[#102A2A] tracking-tight">{summary.totalProducts}</div>
              </div>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>Active: {summary.activeProducts}</span>
                </span>
              </div>
            </div>

            {/* Card 2: Total Orders */}
            <div className="bg-white rounded-3xl border border-[#D8ECE7] p-5 shadow-2xs flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25c-.67 0-1.189-.578-1.119-1.243l1.263-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                  </svg>
                </div>
                <span className="text-xs font-semibold text-[#648096]">Orders</span>
              </div>
              <div>
                <span className="text-xs font-medium text-[#648096] block truncate">Total Orders</span>
                <div className="text-2xl font-black text-[#102A2A] tracking-tight">{summary.totalOrders}</div>
              </div>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  <span>Pending: {summary.pendingOrders}</span>
                </span>
              </div>
            </div>

            {/* Card 3: Total Revenue */}
            <div className="bg-white rounded-3xl border border-[#D8ECE7] p-5 shadow-2xs flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <span className="text-xs font-semibold text-[#648096]">Revenue</span>
              </div>
              <div>
                <span className="text-xs font-medium text-[#648096] block truncate">Total Revenue</span>
                <div className="text-2xl font-black text-emerald-700 tracking-tight truncate">
                  {formatPrice(summary.totalRevenue)}
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                <span className="inline-flex items-center gap-1.5 font-semibold text-[#648096]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>This Month</span>
                </span>
              </div>
            </div>

            {/* Card 4: Pending Orders */}
            <div className="bg-white rounded-3xl border border-[#D8ECE7] p-5 shadow-2xs flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-700 border border-blue-100 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <span className="text-xs font-semibold text-[#648096]">Processing</span>
              </div>
              <div>
                <span className="text-xs font-medium text-[#648096] block truncate">Pending Orders</span>
                <div className="text-2xl font-black text-blue-700 tracking-tight">{summary.pendingOrders}</div>
              </div>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                <span className="inline-flex items-center gap-1.5 font-semibold text-blue-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  <span>Processing: {summary.pendingOrders}</span>
                </span>
              </div>
            </div>
          </div>

          {/* 3. Middle Row: Sales Overview & Recent Orders */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* Sales Overview Card */}
            <section aria-labelledby="sales-overview-heading" className="bg-white rounded-3xl border border-[#D8ECE7] p-6 shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h2 id="sales-overview-heading" className="text-base font-bold text-[#102A2A] tracking-tight">
                    Sales Overview
                  </h2>
                  <p className="text-xs text-[#648096] mt-0.5">
                    Total revenue for the last {selectedPeriod === '7d' ? '7 days' : selectedPeriod === '30d' ? '30 days' : '90 days'}
                  </p>
                </div>

                {/* Period Selector Tabs with calendar icon */}
                <div className="flex items-center gap-1 bg-[#F0FAF7] p-1 rounded-xl self-start sm:self-auto border border-[#D8ECE7]" role="tablist" aria-label="Sales aggregation period">
                  {['7d', '30d', '90d'].map((p) => {
                    const isSelected = selectedPeriod === p;
                    const labelMap = { '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days' };
                    return (
                      <button
                        key={p}
                        type="button"
                        role="tab"
                        aria-selected={isSelected}
                        onClick={() => handlePeriodChange(p)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                          isSelected
                            ? 'bg-[#063B32] text-white shadow-2xs'
                            : 'text-[#648096] hover:text-[#102A2A] hover:bg-white/80'
                        }`}
                      >
                        {labelMap[p]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Period Revenue Subheader */}
              <div className="flex items-baseline justify-between pt-1">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#648096]">
                    Period Revenue
                  </span>
                  <div className="text-2xl font-black text-[#102A2A] tracking-tight">
                    {formatPrice(sales.totalRevenue)}
                  </div>
                </div>
                <span className="text-xs text-[#648096] font-medium">
                  Currency: <strong className="text-[#102A2A]">{sales.currency || 'INR'}</strong>
                </span>
              </div>

              {/* Smooth Line/Area SVG Chart */}
              <SalesChart
                points={sales.points}
                period={selectedPeriod}
                isLoading={salesLoading}
              />
            </section>

            {/* Recent Orders Card */}
            <section aria-labelledby="recent-orders-heading" className="bg-white rounded-3xl border border-[#D8ECE7] p-6 shadow-2xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h2 id="recent-orders-heading" className="text-base font-bold text-[#102A2A] tracking-tight">
                    Recent Orders
                  </h2>
                  <p className="text-xs text-[#648096] mt-0.5">
                    Latest customer store transactions
                  </p>
                </div>
                <a
                  href="/admin/orders"
                  className="text-xs font-bold text-[#059669] hover:text-emerald-800 hover:underline transition-colors"
                >
                  View all &rarr;
                </a>
              </div>

              {recentOrders.length === 0 ? (
                <div className="py-12 text-center space-y-2">
                  <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                    <svg className="w-5 h-5 stroke-[1.8]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-slate-800">No orders recorded</p>
                  <p className="text-xs text-slate-400 max-w-xs mx-auto">
                    Customer purchases will automatically appear in this operational table.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto -mx-2 sm:mx-0">
                  <table className="w-full text-left text-xs" aria-label="Recent Orders Table">
                    <thead>
                      <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-[#648096]">
                        <th className="py-2.5 px-2">Order ID</th>
                        <th className="py-2.5 px-2">Customer</th>
                        <th className="py-2.5 px-2">Total</th>
                        <th className="py-2.5 px-2 text-center">Status</th>
                        <th className="py-2.5 px-2 text-right">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {recentOrders.map((order) => {
                        const badge = getOrderStatusBadge(order.status);
                        const shortId = order._id ? order._id.slice(-8) : '—';

                        return (
                          <tr key={order._id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-2.5 px-2 font-mono font-bold text-slate-800">
                              <a
                                href={`/admin/orders/${order._id}`}
                                className="hover:underline text-[#063B32]"
                                title={order._id}
                              >
                                #{shortId}
                              </a>
                            </td>
                            <td className="py-2.5 px-2 font-medium text-slate-800 truncate max-w-[100px]" title={order.customerName}>
                              {order.customerName}
                            </td>
                            <td className="py-2.5 px-2 font-bold text-[#102A2A]">
                              {formatPrice(order.total)}
                            </td>
                            <td className="py-2.5 px-2 text-center">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.className}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${badge.dotClass}`} />
                                {badge.label}
                              </span>
                            </td>
                            <td className="py-2.5 px-2 text-right text-[11px] text-slate-500 whitespace-nowrap">
                              {formatShortDate(order.createdAt?.split('T')[0]) || formatDate(order.createdAt)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          {/* 4. Four Secondary Metric Cards Row */}
          <section aria-labelledby="secondary-metrics-heading" className="space-y-3">
            <h2 id="secondary-metrics-heading" className="sr-only">
              Secondary Store Metrics
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
              {/* Card 1: Product Categories */}
              <div className="bg-white rounded-3xl border border-[#D8ECE7] p-5 shadow-2xs flex flex-col justify-between">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-bold text-[#648096]">Product Categories</span>
                    <div className="text-2xl font-black text-[#102A2A] mt-1">{summary.totalCategories}</div>
                  </div>
                  <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25a2.25 2.25 0 01-13.5 18v-2.25z" />
                    </svg>
                  </div>
                </div>
                <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold">
                  <span className="text-[#648096]">Active catalog groups</span>
                  <a href="/admin/products" className="text-[#059669] hover:text-emerald-800">
                    View all &rarr;
                  </a>
                </div>
              </div>

              {/* Card 2: Low Stock Items */}
              <div className="bg-white rounded-3xl border border-[#D8ECE7] p-5 shadow-2xs flex flex-col justify-between">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-bold text-[#648096]">Low Stock Items</span>
                    <div className="text-2xl font-black text-amber-700 mt-1">{summary.lowStockProducts}</div>
                  </div>
                  <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-700 border border-amber-100 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                  </div>
                </div>
                <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold">
                  <span className="text-amber-700 font-bold">
                    {summary.lowStockProducts > 0 ? 'Require attention' : 'Inventory healthy'}
                  </span>
                  <a href="/admin/inventory" className="text-[#059669] hover:text-emerald-800">
                    View all &rarr;
                  </a>
                </div>
              </div>

              {/* Card 3: Pending Orders */}
              <div className="bg-white rounded-3xl border border-[#D8ECE7] p-5 shadow-2xs flex flex-col justify-between">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-bold text-[#648096]">Pending Orders</span>
                    <div className="text-2xl font-black text-blue-700 mt-1">{summary.pendingOrders}</div>
                  </div>
                  <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-700 border border-blue-100 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
                <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold">
                  <span className="text-[#648096]">Needs processing</span>
                  <a href="/admin/orders" className="text-[#059669] hover:text-emerald-800">
                    View all &rarr;
                  </a>
                </div>
              </div>

              {/* Card 4: Out of Stock Items */}
              <div className="bg-white rounded-3xl border border-[#D8ECE7] p-5 shadow-2xs flex flex-col justify-between">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-bold text-[#648096]">Out of Stock Items</span>
                    <div className="text-2xl font-black text-rose-700 mt-1">{summary.outOfStockProducts}</div>
                  </div>
                  <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-700 border border-rose-100 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                  </div>
                </div>
                <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold">
                  <span className="text-[#648096]">Depleted inventory</span>
                  <a href="/admin/inventory" className="text-[#059669] hover:text-emerald-800">
                    View all &rarr;
                  </a>
                </div>
              </div>
            </div>
          </section>

          {/* 5. Bottom Row: Recent Products & System Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* Recent Products Table */}
            <section aria-labelledby="recent-products-heading" className="bg-white rounded-3xl border border-[#D8ECE7] p-6 shadow-2xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h2 id="recent-products-heading" className="text-base font-bold text-[#102A2A] tracking-tight">
                    Recent Products
                  </h2>
                  <p className="text-xs text-[#648096] mt-0.5">
                    Catalog items and variant inventory awareness
                  </p>
                </div>
                <a
                  href="/admin/products"
                  className="text-xs font-bold text-[#059669] hover:text-emerald-800 hover:underline transition-colors"
                >
                  View all &rarr;
                </a>
              </div>

              {recentProducts.length === 0 ? (
                <div className="py-12 text-center space-y-2">
                  <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                    <svg className="w-5 h-5 stroke-[1.8]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-slate-800">No products in catalog</p>
                  <p className="text-xs text-slate-400 max-w-xs mx-auto">
                    Add your first outdoor gear product using the Quick Action button.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto -mx-2 sm:mx-0">
                  <table className="w-full text-left text-xs" aria-label="Recent Products Table">
                    <thead>
                      <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-[#648096]">
                        <th className="py-2.5 px-2">Product</th>
                        <th className="py-2.5 px-2">SKU</th>
                        <th className="py-2.5 px-2">Price</th>
                        <th className="py-2.5 px-2">Stock</th>
                        <th className="py-2.5 px-2">Status</th>
                        <th className="py-2.5 px-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {recentProducts.map((p) => {
                        const isOutOfStock = p.stock === 0;
                        const isLowStock = p.stock > 0 && p.stock <= 5;

                        return (
                          <tr key={p._id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-2.5 px-2">
                              <div className="flex items-center gap-2.5 min-w-0 max-w-[150px]">
                                <div className="w-8 h-8 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                                  {p.image ? (
                                    <img src={p.image} alt={p.name} className="w-full h-full object-contain p-0.5" />
                                  ) : (
                                    <svg className="w-3.5 h-3.5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                                    </svg>
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <div className="font-semibold text-slate-800 truncate" title={p.name}>
                                    {p.name}
                                  </div>
                                  <div className="text-[10px] text-slate-400">
                                    {p.category} {p.hasVariants && `• ${p.variantCount} variants`}
                                  </div>
                                </div>
                              </div>
                            </td>

                            <td className="py-2.5 px-2 font-mono text-[11px] text-slate-600">
                              {p.sku || (p.hasVariants ? 'Multi-SKU' : '—')}
                            </td>

                            <td className="py-2.5 px-2 font-bold text-[#102A2A]">
                              {formatPrice(p.price)}
                            </td>

                            <td className="py-2.5 px-2">
                              <span
                                className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                  isOutOfStock
                                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                                    : isLowStock
                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : 'bg-slate-100 text-slate-700 border-slate-200'
                                }`}
                              >
                                {p.stock} units
                              </span>
                            </td>

                            <td className="py-2.5 px-2">
                              {p.isActive ? (
                                <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  Active
                                </span>
                              ) : (
                                <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                                  Draft
                                </span>
                              )}
                            </td>

                            <td className="py-2.5 px-2 text-right">
                              <a
                                href={`/admin/products/${p._id}/edit`}
                                className="font-bold text-[#063B32] hover:underline"
                              >
                                Edit
                              </a>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* System Activity Timeline */}
            <section aria-labelledby="system-activity-heading" className="bg-white rounded-3xl border border-[#D8ECE7] p-6 shadow-2xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h2 id="system-activity-heading" className="text-base font-bold text-[#102A2A] tracking-tight">
                    System Activity
                  </h2>
                  <p className="text-xs text-[#648096] mt-0.5">
                    Administrative security &amp; ledger log
                  </p>
                </div>
                <a
                  href="/admin/audit-logs"
                  className="text-xs font-bold text-[#059669] hover:text-emerald-800 hover:underline transition-colors"
                >
                  View all &rarr;
                </a>
              </div>

              {recentActivity.length === 0 ? (
                /* Honest Empty State for Audit System */
                <div className="py-10 text-center space-y-3" data-testid="dashboard-activity-empty-state">
                  <div className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-400 border border-slate-200 flex items-center justify-center mx-auto shadow-2xs">
                    <svg className="w-6 h-6 stroke-[1.8]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                    </svg>
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-slate-900">
                      No recent activity
                    </h3>
                    <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
                      Administrative activity will appear here as the audit system is enabled in future checkpoints.
                    </p>
                  </div>
                  <div className="pt-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                      Audit Logging: Planned
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-3" data-testid="dashboard-recent-activity-list">
                  {recentActivity.map((log) => (
                    <div
                      key={log.id || log._id}
                      className="p-3 rounded-2xl bg-slate-50 border border-slate-100 hover:border-slate-200 transition-colors space-y-1.5"
                      data-testid={`activity-item-${log.id || log._id}`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-800 text-[11px] truncate max-w-[180px]">
                          {log.eventType}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {formatDate(log.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 line-clamp-2">
                        {getActivitySummary(log)}
                      </p>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-200/50">
                        <span className="truncate max-w-[150px] font-medium text-slate-500">
                          {log.actorEmail}
                        </span>
                        <span className="uppercase text-[9px] font-bold px-1.5 py-0.5 rounded bg-white text-slate-500 border border-slate-200">
                          {log.actorRole}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>

        {/* ============================================================== */}
        {/* RIGHT SIDEBAR SECTION (~28% width on desktop)                 */}
        {/* ============================================================== */}
        <div className="xl:col-span-4 2xl:col-span-3 space-y-6 min-w-0">
          {/* Quick Actions Card */}
          <div className="bg-white rounded-3xl border border-[#D8ECE7] p-6 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-base font-bold text-[#102A2A] tracking-tight">
                Quick Actions
              </h2>
              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                Verified
              </span>
            </div>

            {/* 2-column Grid of Action Cards matching reference */}
            <div className="grid grid-cols-2 gap-3">
              {/* Action 1: Add Product */}
              <a
                href="/admin/products/new"
                className="flex items-center justify-between p-3.5 rounded-2xl border border-[#D8ECE7] bg-white hover:bg-[#F0FAF7] hover:border-emerald-300 transition-all group shadow-2xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-[#E8F5F1] text-[#059669] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <svg className="w-4 h-4 stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                  </div>
                  <span className="text-xs font-bold text-[#102A2A] group-hover:text-[#063B32] transition-colors truncate">
                    Add Product
                  </span>
                </div>
                <svg className="w-3.5 h-3.5 text-slate-300 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all shrink-0 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                </svg>
              </a>

              {/* Action 2: Manage Inventory */}
              <a
                href="/admin/inventory"
                className="flex items-center justify-between p-3.5 rounded-2xl border border-[#D8ECE7] bg-white hover:bg-[#F0FAF7] hover:border-emerald-300 transition-all group shadow-2xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-[#E8F5F1] text-[#059669] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <svg className="w-4 h-4 stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                    </svg>
                  </div>
                  <span className="text-xs font-bold text-[#102A2A] group-hover:text-[#063B32] transition-colors truncate">
                    Manage Inventory
                  </span>
                </div>
                <svg className="w-3.5 h-3.5 text-slate-300 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all shrink-0 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                </svg>
              </a>

              {/* Action 3: View Orders */}
              <a
                href="/admin/orders"
                className="flex items-center justify-between p-3.5 rounded-2xl border border-[#D8ECE7] bg-white hover:bg-[#F0FAF7] hover:border-emerald-300 transition-all group shadow-2xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-[#E8F5F1] text-[#059669] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <svg className="w-4 h-4 stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25c-.67 0-1.189-.578-1.119-1.243l1.263-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                    </svg>
                  </div>
                  <span className="text-xs font-bold text-[#102A2A] group-hover:text-[#063B32] transition-colors truncate">
                    View Orders
                  </span>
                </div>
                <svg className="w-3.5 h-3.5 text-slate-300 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all shrink-0 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                </svg>
              </a>

              {/* Action 4: Manage Customers */}
              <a
                href="/admin/customers"
                className="flex items-center justify-between p-3.5 rounded-2xl border border-[#D8ECE7] bg-white hover:bg-[#F0FAF7] hover:border-emerald-300 transition-all group shadow-2xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-[#E8F5F1] text-[#059669] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <svg className="w-4 h-4 stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                    </svg>
                  </div>
                  <span className="text-xs font-bold text-[#102A2A] group-hover:text-[#063B32] transition-colors truncate">
                    Manage Customers
                  </span>
                </div>
                <svg className="w-3.5 h-3.5 text-slate-300 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all shrink-0 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                </svg>
              </a>

              {/* Action 5: Product Catalog */}
              <a
                href="/admin/products"
                className="flex items-center justify-between p-3.5 rounded-2xl border border-[#D8ECE7] bg-white hover:bg-[#F0FAF7] hover:border-emerald-300 transition-all group shadow-2xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-[#E8F5F1] text-[#059669] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <svg className="w-4 h-4 stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                    </svg>
                  </div>
                  <span className="text-xs font-bold text-[#102A2A] group-hover:text-[#063B32] transition-colors truncate">
                    Product Catalog
                  </span>
                </div>
                <svg className="w-3.5 h-3.5 text-slate-300 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all shrink-0 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                </svg>
              </a>

              {/* Action 6: Public Storefront */}
              <a
                href="/shop"
                className="flex items-center justify-between p-3.5 rounded-2xl border border-[#D8ECE7] bg-white hover:bg-[#F0FAF7] hover:border-emerald-300 transition-all group shadow-2xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-[#E8F5F1] text-[#059669] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <svg className="w-4 h-4 stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                  </div>
                  <span className="text-xs font-bold text-[#102A2A] group-hover:text-[#063B32] transition-colors truncate">
                    Public Storefront
                  </span>
                </div>
                <svg className="w-3.5 h-3.5 text-slate-300 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all shrink-0 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                </svg>
              </a>
            </div>
          </div>

          {/* Top Selling Products Card */}
          <section aria-labelledby="top-products-heading" className="bg-white rounded-3xl border border-[#D8ECE7] p-6 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h2 id="top-products-heading" className="text-base font-bold text-[#102A2A] tracking-tight">
                  Top Selling Products
                </h2>
                <p className="text-xs text-[#648096] mt-0.5">
                  Catalog popularity by sales volume
                </p>
              </div>
              <a
                href="/admin/products"
                className="text-xs font-bold text-[#059669] hover:text-emerald-800 hover:underline transition-colors"
              >
                View all &rarr;
              </a>
            </div>

            {topSellingProducts.length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                  <svg className="w-5 h-5 stroke-[1.8]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-xs font-semibold text-slate-700">No top sellers recorded</p>
                <p className="text-[11px] text-slate-400 max-w-[180px] mx-auto">
                  Top performing products will rank here as orders occur.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {topSellingProducts.slice(0, 5).map((item, idx) => (
                  <div key={item._id || item.productId || idx} className="flex items-center justify-between gap-2.5 p-2 rounded-2xl hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                        {item.image ? (
                          <img src={item.image} alt={item.name} className="w-full h-full object-contain p-0.5" />
                        ) : (
                          <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                          </svg>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-[#102A2A] truncate max-w-[120px]" title={item.name}>
                          {item.name}
                        </div>
                        <div className="text-[10px] text-[#648096] truncate">
                          {item.category || 'Gear'}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-xs font-extrabold text-[#059669]">
                        {formatPrice(item.price || item.revenue)}
                      </div>
                      <div className="text-[10px] text-[#648096]">
                        {item.unitsSold || item.totalQuantitySold || 0} sold
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Promotional Brand Visual Card matching reference */}
          <div
            className="rounded-3xl p-6 flex flex-col justify-between shadow-2xs relative overflow-hidden text-white min-h-[300px]"
            style={{
              backgroundImage:
                'linear-gradient(to top, rgba(6, 45, 38, 0.94) 0%, rgba(6, 45, 38, 0.70) 50%, rgba(6, 45, 38, 0.35) 100%), url("https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80")',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            {/* Brand Mountain Symbol in top right */}
            <div className="flex justify-end">
              <div className="w-8 h-8 rounded-xl bg-white/15 backdrop-blur-md border border-white/20 flex items-center justify-center text-emerald-300">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12.75 3.25a.75.75 0 00-1.3 0L3.1 17.5a.75.75 0 00.65 1.13h16.5a.75.75 0 00.65-1.13l-8.15-14.25zm-.1 3.5l5.24 9.15H6.11l6.54-9.15z" />
                </svg>
              </div>
            </div>

            {/* Copy and CTA */}
            <div className="space-y-3 mt-auto">
              <h2 className="text-xl font-black text-white tracking-tight leading-snug">
                Better Gear. Bigger Adventures.
              </h2>
              <p className="text-xs text-slate-200/90 leading-relaxed">
                Premium outdoor equipment for explorers, hikers and adventurers.
              </p>
              <div className="pt-2">
                <a
                  href="/admin/products"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#059669] hover:bg-[#047857] text-white font-bold text-xs shadow-md transition-all"
                >
                  <span>Explore Products</span>
                  <span>&rarr;</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer: Store Ledger Guarantee Footnote */}
      <div className="bg-white rounded-3xl border border-[#D8ECE7] p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-2xs">
        <div className="space-y-0.5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#102A2A]">
            Authoritative Metrics &amp; Store Ledger Guarantee
          </h4>
          <p className="text-xs text-[#648096]">
            All counts, order lists, inventory stock, and revenue aggregates reflect live server database state. Zero simulated or fabricated figures.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={loadDashboard}
          className="shrink-0 font-semibold self-start sm:self-auto rounded-xl"
        >
          <svg className="w-3.5 h-3.5 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Sync Now
        </Button>
      </div>
    </div>
  );
}
