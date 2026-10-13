/* global queueMicrotask */
import { useState, useEffect, useRef } from 'react';
import {
  adminAuditService,
  VALID_AUDIT_EVENT_TYPES,
} from '../../features/admin/adminAudit.service.js';
import Button from '../../components/Button.jsx';
import Skeleton from '../../components/Skeleton.jsx';
import ErrorState from '../../components/ErrorState.jsx';
import EmptyState from '../../components/EmptyState.jsx';

/**
 * Format timestamp into human-readable date string.
 * @param {string|Date} dateString
 * @returns {string}
 */
function formatFullDate(dateString) {
  if (!dateString) return 'Not available';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return 'Not available';
    return d.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return 'Not available';
  }
}

/**
 * Parse URL search string into state object.
 */
function parseUrlParams(searchStr) {
  const params = typeof window !== 'undefined' && window.URLSearchParams
    ? new window.URLSearchParams(searchStr || '')
    : { get: () => null };

  const pageVal = parseInt(params.get('page'), 10);
  const eventTypeVal = params.get('eventType') || 'all';

  return {
    page: !isNaN(pageVal) && pageVal >= 1 ? pageVal : 1,
    eventType: VALID_AUDIT_EVENT_TYPES.includes(eventTypeVal) ? eventTypeVal : 'all',
  };
}

/**
 * Build canonical query string from state without unnecessary defaults.
 */
function buildCanonicalQueryString(state) {
  if (typeof window === 'undefined' || !window.URLSearchParams) return '';
  const params = new window.URLSearchParams();
  if (state.page > 1) params.set('page', String(state.page));
  if (state.eventType && state.eventType !== 'all') params.set('eventType', state.eventType);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Renders concise, safe details from audit log metadata.
 */
function formatMetadataSummary(log) {
  const { eventType, metadata } = log;
  if (!metadata || typeof metadata !== 'object') return '—';

  switch (eventType) {
    case 'ADMIN_USER_CREATED':
      return `Created administrator account (${metadata.email || log.targetEmail || 'new admin'})`;
    case 'ADMIN_USER_STATUS_UPDATED':
      return `Status changed: ${metadata.previousStatus || 'unknown'} → ${metadata.newStatus || (metadata.isActive ? 'active' : 'inactive')}`;
    case 'ADMIN_USER_ROLE_UPDATED':
      return `Role changed: ${metadata.previousRole || 'unknown'} → ${metadata.newRole || 'unknown'}`;
    case 'ADMIN_CUSTOMER_STATUS_UPDATED':
      return `Customer account ${metadata.isActive ? 'activated' : 'deactivated'} (${metadata.customerEmail || log.targetEmail || 'customer'})`;
    case 'PRODUCT_CREATED':
      return `Created product "${metadata.name || log.resourceId || 'product'}" (Price: ₹${metadata.price ?? 0}, Stock: ${metadata.stock ?? 0})`;
    case 'PRODUCT_UPDATED':
      return `Updated product "${metadata.name || log.resourceId || 'product'}"`;
    case 'PRODUCT_STATUS_UPDATED':
      return `Product ${metadata.isActive ? 'activated' : 'deactivated'} ("${metadata.productName || log.resourceId || 'product'}")`;
    case 'PRODUCT_DELETED':
      return `Soft-deleted product ("${metadata.productName || log.resourceId || 'product'}")`;
    case 'INVENTORY_ADJUSTED':
      return `Stock adjusted: ${metadata.adjustment > 0 ? '+' : ''}${metadata.adjustment} (${metadata.previousStock} → ${metadata.resultingStock}) for "${metadata.productName || log.resourceId || 'item'}" [${metadata.reason || 'correction'}]`;
    case 'ORDER_STATUS_UPDATED':
      return `Order status: ${metadata.previousStatus ? metadata.previousStatus + ' → ' : ''}${metadata.newStatus || 'updated'} (Order #${metadata.orderId || log.resourceId || '—'})`;
    case 'SHIPMENT_TRACKING_UPDATED':
      return `Shipment tracking updated (${metadata.carrier || 'carrier'}: ${metadata.trackingNumber || 'tracking'}) for Order #${metadata.orderId || log.resourceId || '—'}`;
    case 'RETURN_APPROVED':
      return `Return approved for Order #${metadata.orderId || '—'} (Return #${metadata.returnNumber || '—'})`;
    case 'RETURN_REJECTED':
      return `Return rejected: ${metadata.rejectionReason || '—'} (Return #${metadata.returnNumber || '—'})`;
    case 'RETURN_RECEIVED':
      return `Return items received (Return #${metadata.returnNumber || '—'})`;
    case 'RETURN_COMPLETED':
      return `Return completed & inventory restocked (Return #${metadata.returnNumber || '—'})`;
    case 'REFUND_REQUESTED':
      return `Refund requested: ₹${metadata.totalRefundAmount || metadata.amount || '—'} (Order #${metadata.orderId || '—'})`;
    case 'REFUND_SUCCEEDED':
      return `Refund succeeded: ₹${metadata.amount || '—'} via ${metadata.gateway || 'Razorpay'}`;
    case 'REFUND_FAILED':
      return `Refund failed: ${metadata.reason || 'Payment gateway error'}`;
    default: {
      const keys = Object.keys(metadata);
      if (keys.length === 0) return '—';
      return keys.map((k) => `${k}: ${String(metadata[k])}`).join(', ');
    }
  }
}

/**
 * Event type badge component with distinct colors.
 */
function EventTypeBadge({ eventType }) {
  let badgeClasses = 'bg-neutral-100 text-neutral-800 border-neutral-300';

  if (
    eventType === 'ADMIN_USER_CREATED' ||
    eventType === 'PRODUCT_CREATED' ||
    eventType === 'RETURN_APPROVED' ||
    eventType === 'RETURN_COMPLETED' ||
    eventType === 'REFUND_SUCCEEDED'
  ) {
    badgeClasses = 'bg-emerald-50 text-emerald-700 border-emerald-300';
  } else if (
    eventType === 'ADMIN_USER_STATUS_UPDATED' ||
    eventType === 'PRODUCT_STATUS_UPDATED' ||
    eventType === 'INVENTORY_ADJUSTED' ||
    eventType === 'ORDER_STATUS_UPDATED'
  ) {
    badgeClasses = 'bg-amber-50 text-amber-700 border-amber-300';
  } else if (
    eventType === 'ADMIN_USER_ROLE_UPDATED' ||
    eventType === 'ADMIN_CUSTOMER_STATUS_UPDATED' ||
    eventType === 'SHIPMENT_TRACKING_UPDATED' ||
    eventType === 'RETURN_RECEIVED'
  ) {
    badgeClasses = 'bg-indigo-50 text-indigo-700 border-indigo-300';
  } else if (
    eventType === 'PRODUCT_DELETED' ||
    eventType === 'RETURN_REJECTED' ||
    eventType === 'REFUND_FAILED'
  ) {
    badgeClasses = 'bg-rose-50 text-rose-700 border-rose-300';
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${badgeClasses}`}
      data-testid="event-type-badge"
    >
      {eventType}
    </span>
  );
}

/**
 * Admin Audit Logs Inspection Page
 * Route: /admin/audit-logs
 * Strictly read-only: No delete, edit, or purge operations exist.
 */
export default function AdminAuditLogsPage({ search: searchProp = '' }) {
  const initialParams = parseUrlParams(
    typeof window !== 'undefined' ? searchProp || window.location.search : ''
  );

  const [page, setPage] = useState(initialParams.page);
  const [eventType, setEventType] = useState(initialParams.eventType);

  const [auditLogs, setAuditLogs] = useState([]);
  const [pagination, setPagination] = useState({
    page: initialParams.page,
    limit: 10,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadTrigger, setReloadTrigger] = useState(0);

  const isInitialMount = useRef(true);

  // Sync state to URL in browser
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const qs = buildCanonicalQueryString({ page, eventType });
    const targetUrl = `/admin/audit-logs${qs}`;
    if (typeof window !== 'undefined' && window.location.pathname === '/admin/audit-logs') {
      window.history.replaceState(null, '', targetUrl);
    }
  }, [page, eventType]);

  // Fetch paginated audit logs
  useEffect(() => {
    let ignore = false;
    const controller = typeof window !== 'undefined' && window.AbortController
      ? new window.AbortController()
      : null;

    async function fetchLogs() {
      setLoading(true);
      setError(null);

      try {
        const result = await adminAuditService.getAdminAuditLogs(
          {
            page,
            limit: 10,
            eventType: eventType === 'all' ? undefined : eventType,
          },
          { signal: controller?.signal }
        );

        if (!ignore) {
          setAuditLogs(result.auditLogs || []);
          setPagination(
            result.pagination || {
              page: 1,
              limit: 10,
              total: 0,
              totalPages: 1,
              hasNextPage: false,
              hasPrevPage: false,
            }
          );
        }
      } catch (err) {
        if (!ignore && err?.name !== 'AbortError') {
          if (err?.status === 429) {
            const retrySecs = err?.retryAfter;
            setError(
              retrySecs
                ? `Too many requests. Rate limit cooldown active. Please retry in ${retrySecs} seconds.`
                : 'Too many requests. Please try again shortly.'
            );
          } else {
            setError(err.message || 'Failed to load administrative audit logs.');
          }
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    queueMicrotask(() => {
      if (!ignore) {
        fetchLogs();
      }
    });

    return () => {
      ignore = true;
      if (controller) controller.abort();
    };
  }, [page, eventType, reloadTrigger]);

  const handleEventTypeFilterChange = (e) => {
    setEventType(e.target.value);
    setPage(1);
  };

  const handleRefresh = () => {
    setReloadTrigger((prev) => prev + 1);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" data-testid="admin-audit-logs-page">
      {/* Header & Breadcrumb */}
      <div>
        <nav className="text-xs text-neutral-500 mb-2 flex items-center space-x-1">
          <span>Admin</span>
          <span>/</span>
          <span>System</span>
          <span>/</span>
          <span className="text-neutral-900 font-medium">Audit Logs</span>
        </nav>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">System Audit Logs</h1>
            <p className="text-sm text-neutral-500 mt-1">
              Immutable chronological record of administrative security and user lifecycle operations.
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              data-testid="refresh-audit-logs-button"
            >
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-lg border border-neutral-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <label htmlFor="audit-event-type-filter" className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">
            Event Type:
          </label>
          <select
            id="audit-event-type-filter"
            value={eventType}
            onChange={handleEventTypeFilterChange}
            className="text-sm border border-neutral-300 rounded px-3 py-1.5 bg-white text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
            data-testid="event-type-filter-select"
          >
            <option value="all">All Events</option>
            <optgroup label="Accounts & Security">
              <option value="ADMIN_USER_CREATED">Admin Created (ADMIN_USER_CREATED)</option>
              <option value="ADMIN_USER_STATUS_UPDATED">Admin Status Updated (ADMIN_USER_STATUS_UPDATED)</option>
              <option value="ADMIN_USER_ROLE_UPDATED">Admin Role Updated (ADMIN_USER_ROLE_UPDATED)</option>
              <option value="ADMIN_CUSTOMER_STATUS_UPDATED">Customer Status Updated (ADMIN_CUSTOMER_STATUS_UPDATED)</option>
            </optgroup>
            <optgroup label="Products & Catalog">
              <option value="PRODUCT_CREATED">Product Created (PRODUCT_CREATED)</option>
              <option value="PRODUCT_UPDATED">Product Updated (PRODUCT_UPDATED)</option>
              <option value="PRODUCT_STATUS_UPDATED">Product Status Updated (PRODUCT_STATUS_UPDATED)</option>
              <option value="PRODUCT_DELETED">Product Deleted (PRODUCT_DELETED)</option>
            </optgroup>
            <optgroup label="Inventory">
              <option value="INVENTORY_ADJUSTED">Inventory Adjusted (INVENTORY_ADJUSTED)</option>
            </optgroup>
            <optgroup label="Orders & Fulfillment">
              <option value="ORDER_STATUS_UPDATED">Order Status Updated (ORDER_STATUS_UPDATED)</option>
              <option value="SHIPMENT_TRACKING_UPDATED">Shipment Tracking Updated (SHIPMENT_TRACKING_UPDATED)</option>
            </optgroup>
            <optgroup label="Returns & Refunds">
              <option value="RETURN_APPROVED">Return Approved (RETURN_APPROVED)</option>
              <option value="RETURN_REJECTED">Return Rejected (RETURN_REJECTED)</option>
              <option value="RETURN_RECEIVED">Return Received (RETURN_RECEIVED)</option>
              <option value="RETURN_COMPLETED">Return Completed (RETURN_COMPLETED)</option>
              <option value="REFUND_REQUESTED">Refund Requested (REFUND_REQUESTED)</option>
              <option value="REFUND_SUCCEEDED">Refund Succeeded (REFUND_SUCCEEDED)</option>
              <option value="REFUND_FAILED">Refund Failed (REFUND_FAILED)</option>
            </optgroup>
          </select>
        </div>

        <div className="text-xs text-neutral-500 font-medium">
          Total Recorded Events: {pagination.total ?? 0}
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="space-y-3" data-testid="audit-logs-loading-skeleton">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : error ? (
        <ErrorState
          title="Failed to Load Audit Logs"
          description={error}
          onRetry={handleRefresh}
          data-testid="audit-logs-error-state"
        />
      ) : auditLogs.length === 0 ? (
        <EmptyState
          title="No Audit Logs Found"
          message="No administrative audit events match your selected criteria."
          actionText="Reset Filters"
          onAction={() => {
            setEventType('all');
            setPage(1);
          }}
          data-testid="audit-logs-empty-state"
        />
      ) : (
        <div className="bg-white rounded-lg border border-neutral-200 shadow-sm overflow-hidden" data-testid="audit-logs-table-container">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200 text-left text-sm" data-testid="audit-logs-table">
              <thead className="bg-neutral-50 text-neutral-600 font-medium">
                <tr>
                  <th scope="col" className="px-4 py-3">Timestamp</th>
                  <th scope="col" className="px-4 py-3">Event Type</th>
                  <th scope="col" className="px-4 py-3">Actor</th>
                  <th scope="col" className="px-4 py-3">Target</th>
                  <th scope="col" className="px-4 py-3">Details / Metadata</th>
                  <th scope="col" className="px-4 py-3">Client IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 bg-white">
                {auditLogs.map((log) => (
                  <tr key={log.id || log._id} className="hover:bg-neutral-50 transition-colors" data-testid={`audit-log-row-${log.id || log._id}`}>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-neutral-600">
                      {formatFullDate(log.createdAt)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <EventTypeBadge eventType={log.eventType} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs">
                      <div className="font-medium text-neutral-900">{log.actorEmail}</div>
                      <span className="text-[10px] uppercase font-bold text-neutral-400 bg-neutral-100 px-1 py-0.5 rounded">
                        {log.actorRole}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs">
                      {log.targetEmail ? (
                        <div className="font-medium text-neutral-900">{log.targetEmail}</div>
                      ) : log.targetUserId ? (
                        <div className="text-neutral-500 font-mono text-[11px]">{log.targetUserId}</div>
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-700 max-w-md">
                      {formatMetadataSummary(log)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs font-mono text-neutral-500">
                      {log.ipAddress || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Toolbar */}
          <div className="bg-neutral-50 px-4 py-3 border-t border-neutral-200 flex items-center justify-between">
            <div className="text-xs text-neutral-600">
              Page <span className="font-semibold text-neutral-900">{pagination.page}</span> of{' '}
              <span className="font-semibold text-neutral-900">{pagination.totalPages || 1}</span>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page <= 1}
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                data-testid="audit-pagination-prev"
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page >= (pagination.totalPages || 1)}
                onClick={() => setPage((p) => p + 1)}
                data-testid="audit-pagination-next"
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
