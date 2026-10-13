import React from 'react';
import { formatPrice, normalizeOrderFinancials } from '../lib/utils.js';
import {
  getCancellationReasonLabel,
} from '../features/orders/order.service.js';
import Button from './Button.jsx';

function formatOrderDate(dateString) {
  if (!dateString) return 'Not available';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Not available';
    return date.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return 'Not available';
  }
}

function getOrderStatusBadge(status) {
  switch (status?.toLowerCase()) {
    case 'confirmed':
      return { className: 'bg-[#EEF5F1] text-[#123C32] border-[#123C32]/30', label: 'Confirmed' };
    case 'processing':
      return { className: 'bg-[#EEF5F1] text-[#123C32] border-[#123C32]/30', label: 'Processing' };
    case 'shipped':
      return { className: 'bg-emerald-50 text-emerald-800 border-emerald-300', label: 'Shipped' };
    case 'delivered':
      return { className: 'bg-emerald-50 text-emerald-800 border-emerald-300', label: 'Delivered' };
    case 'cancelled':
      return { className: 'bg-rose-50 text-rose-700 border-rose-200', label: 'Cancelled' };
    case 'pending':
    default:
      return { className: 'bg-amber-50 text-amber-800 border-amber-200', label: 'Pending' };
  }
}

function getPaymentStatusBadge(status) {
  switch (status?.toLowerCase()) {
    case 'paid':
      return { className: 'bg-[#EEF5F1] text-[#123C32] border-[#123C32]/30', label: 'Paid' };
    case 'failed':
      return { className: 'bg-rose-50 text-rose-700 border-rose-200', label: 'Failed' };
    case 'refunded':
      return { className: 'bg-[#F7F6F1] text-[#17201D] border-[#E5E9E6]', label: 'Refunded' };
    case 'pending':
    default:
      return { className: 'bg-amber-50 text-amber-800 border-amber-200', label: 'Payment Pending' };
  }
}

export default function OrderCard({ order }) {
  if (!order || !order._id) return null;

  const items = Array.isArray(order.items) ? order.items : [];
  const itemCount = items.length;
  const totalQuantity =
    order.totalQuantity ?? items.reduce((acc, i) => acc + (i.quantity || 0), 0);

  const orderBadge = getOrderStatusBadge(order.status);
  const paymentBadge = getPaymentStatusBadge(order.payment?.status);
  const shippingAddress = order.shippingAddress;

  return (
    <article
      aria-labelledby={`order-title-${order._id}`}
      className="bg-white rounded-3xl border border-[#E5E9E6] shadow-xs hover:border-[#123C32]/40 transition-all p-5 sm:p-6 space-y-4"
    >
      {/* Top Meta Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E5E9E6]">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#66736D]">Order</span>
            <span
              id={`order-title-${order._id}`}
              className="font-mono text-xs sm:text-sm font-bold text-[#17201D] break-all select-all"
            >
              #{order._id.slice(-9).toUpperCase()}
            </span>
          </div>
          <p className="text-xs text-[#66736D]">
            Placed on {formatOrderDate(order.createdAt)}
          </p>
        </div>

        {/* Status Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${orderBadge.className}`}
            title={`Order status: ${orderBadge.label}`}
          >
            {orderBadge.label}
          </span>
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${paymentBadge.className}`}
            title={`Payment status: ${paymentBadge.label}`}
          >
            {paymentBadge.label}
          </span>
        </div>
      </div>

      {/* Items Preview */}
      <div className="space-y-2">
        <p className="text-xs text-[#66736D] font-bold">
          {itemCount} {itemCount === 1 ? 'item' : 'items'} ({totalQuantity} total units)
        </p>

        <div className="flex flex-wrap gap-2 text-xs">
          {items.slice(0, 3).map((item, idx) => (
            <span
              key={idx}
              className="inline-flex items-center px-2.5 py-1 rounded-xl bg-[#F7F6F1] border border-[#E5E9E6] text-[#17201D] font-medium max-w-xs truncate"
              title={item.name}
            >
              {item.name} &times; {item.quantity}
            </span>
          ))}
          {items.length > 3 && (
            <span className="inline-flex items-center px-2 py-1 text-xs text-[#66736D] font-bold">
              +{items.length - 3} more
            </span>
          )}
        </div>
      </div>

      {/* Delivery Address Summary */}
      {shippingAddress && (shippingAddress.city || shippingAddress.fullName) && (
        <div className="flex items-center gap-2 text-xs text-[#66736D] bg-[#F7F6F1] rounded-2xl px-3.5 py-2 border border-[#E5E9E6]">
          <span className="truncate">
            Deliver to: <strong className="text-[#17201D] font-bold">{shippingAddress.fullName ? `${shippingAddress.fullName} — ` : ''}{shippingAddress.city}{shippingAddress.state ? `, ${shippingAddress.state}` : ''}</strong>
          </span>
        </div>
      )}

      {/* Compact Shipment Indicator */}
      {order.shipment && (() => {
        const SHIPMENT_LABELS = {
          label_created: 'Label Created',
          in_transit: 'In Transit',
          out_for_delivery: 'Out for Delivery',
          delivered: 'Delivered',
          exception: 'Exception',
        };
        const statusKey = order.shipment.status?.toLowerCase();
        const shipmentLabel = SHIPMENT_LABELS[statusKey] || order.shipment.status || 'Shipped';
        return (
          <div className="flex items-center gap-1.5 text-xs text-[#123C32] bg-[#EEF5F1] rounded-2xl px-3.5 py-2 border border-[#123C32]/20 font-semibold">
            <span>Shipment Status: <strong>{shipmentLabel}</strong></span>
          </div>
        );
      })()}

      {/* Cancellation Indicator */}
      {order.status === 'cancelled' && (
        order.cancellation?.reason ? (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-rose-800 bg-rose-50 rounded-2xl px-3.5 py-2 border border-rose-200">
            <span>Cancelled: <strong>{getCancellationReasonLabel(order.cancellation.reason)}</strong></span>
            {Boolean(order.cancellation.reasonDetail && order.cancellation.reasonDetail.trim()) && (
              <span className="text-rose-700 italic">
                &mdash; {order.cancellation.reasonDetail.trim()}
              </span>
            )}
          </div>
        ) : (
          <div className="text-xs text-rose-700 italic bg-rose-50/70 rounded-2xl px-3.5 py-2 border border-rose-200/60">
            Cancellation details unavailable.
          </div>
        )
      )}

      {/* Footer / Total & Action */}
      <div className="pt-4 border-t border-[#E5E9E6] flex items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-bold text-[#66736D] block uppercase tracking-wider">
            Order Total
          </span>
          <span className="text-base sm:text-lg font-extrabold text-[#123C32] tracking-tight">
            {formatPrice(normalizeOrderFinancials(order).total)}
          </span>
        </div>

        <div>
          <Button
            as="a"
            href={`/account/orders/${order._id}`}
            variant="secondary"
            size="sm"
            className="rounded-xl font-bold text-xs"
          >
            Order Details &rarr;
          </Button>
        </div>
      </div>
    </article>
  );
}
