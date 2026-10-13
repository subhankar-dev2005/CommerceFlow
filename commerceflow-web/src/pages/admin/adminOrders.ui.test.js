import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import AdminOrdersPageModule from './AdminOrdersPage.jsx';
import AdminOrderDetailsPageModule from './AdminOrderDetailsPage.jsx';
import { adminOrderService } from '../../features/admin/adminOrder.service.js';

const AdminOrdersPage = AdminOrdersPageModule?.default || AdminOrdersPageModule;
const AdminOrderDetailsPage = AdminOrderDetailsPageModule?.default || AdminOrderDetailsPageModule;

// Configure React 19 testing environment for act(...)
globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Mock DOM Environment for Node.js
class Node {}
class Element extends Node {}
class HTMLElement extends Element {}
class HTMLIFrameElement extends HTMLElement {}

function createMockElement(tag, doc) {
  const el = new HTMLElement();
  const children = [];
  const attributes = {};
  const listeners = {};
  const isSelect = tag.toUpperCase() === 'SELECT';

  Object.assign(el, {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    nodeName: tag.toUpperCase(),
    ownerDocument: doc,
    style: {},
    childNodes: children,
    options: isSelect ? [] : undefined,
    focus: () => {},
    setAttribute: (name, val) => {
      const sVal = String(val);
      attributes[name] = sVal;
      if (name === 'aria-label') el.ariaLabel = sVal;
      if (name === 'aria-selected') el.ariaSelected = sVal;
      if (name === 'role') el.role = sVal;
      if (name === 'type') el.type = sVal;
      if (name === 'href') el.href = sVal;
      if (name === 'value') el.value = sVal;
    },
    getAttribute: (name) => {
      if (name in attributes) return attributes[name];
      return null;
    },
    hasAttribute: (name) => name in attributes,
    removeAttribute: (name) => {
      delete attributes[name];
    },
    addEventListener: (type, handler) => {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(handler);
    },
    removeEventListener: (type, handler) => {
      if (listeners[type]) {
        listeners[type] = listeners[type].filter((h) => h !== handler);
      }
    },
    dispatchEvent: (event) => {
      const type = event?.type;
      const evt = { ...event, target: el };
      for (let curr = el; curr; curr = curr.parentNode) {
        evt.currentTarget = curr;
        if (curr._listeners && curr._listeners[type]) {
          for (const h of curr._listeners[type]) {
            h(evt);
          }
        }
      }
      return true;
    },
    appendChild: (c) => {
      c.parentNode = el;
      children.push(c);
      if (el.options && (c.tagName === 'OPTION' || c.nodeName === 'OPTION')) {
        el.options.push(c);
      }
      return c;
    },
    removeChild: (c) => {
      const idx = children.indexOf(c);
      if (idx !== -1) children.splice(idx, 1);
      if (el.options) {
        const oIdx = el.options.indexOf(c);
        if (oIdx !== -1) el.options.splice(oIdx, 1);
      }
      return c;
    },
    insertBefore: (c, ref) => {
      c.parentNode = el;
      const idx = children.indexOf(ref);
      if (idx !== -1) {
        children.splice(idx, 0, c);
      } else {
        children.push(c);
      }
      if (el.options && (c.tagName === 'OPTION' || c.nodeName === 'OPTION')) {
        el.options.push(c);
      }
      return c;
    },
    _listeners: listeners,
  });

  Object.defineProperty(el, 'firstChild', {
    get: () => children[0] || null,
  });
  Object.defineProperty(el, 'lastChild', {
    get: () => children[children.length - 1] || null,
  });
  Object.defineProperty(el, 'children', {
    get: () => children.filter((c) => c.nodeType === 1),
  });
  Object.defineProperty(el, 'textContent', {
    get: () => children.map((c) => c.textContent || c.nodeValue || '').join(''),
    set: (val) => {
      children.length = 0;
      if (val !== undefined && val !== null && val !== '') {
        const tn = doc.createTextNode(String(val));
        tn.parentNode = el;
        children.push(tn);
      }
    },
  });

  return el;
}

function createMockDocument() {
  const doc = {
    nodeType: 9,
    createElement: (tag) => createMockElement(tag, doc),
    createElementNS: (_ns, tag) => createMockElement(tag, doc),
    createTextNode: (text) => {
      const t = new Node();
      t.nodeType = 3;
      t.nodeValue = String(text);
      t.ownerDocument = doc;
      Object.defineProperty(t, 'textContent', {
        get: () => t.nodeValue,
        set: (v) => {
          t.nodeValue = String(v);
        },
      });
      return t;
    },
    createComment: () => ({ nodeType: 8, ownerDocument: doc }),
    addEventListener: () => {},
    removeEventListener: () => {},
    getElementById: () => null,
  };
  return doc;
}

const mockDoc = createMockDocument();
const mockWin = {
  document: mockDoc,
  Node,
  Element,
  HTMLElement,
  HTMLIFrameElement,
  location: { pathname: '/admin/orders', search: '' },
  history: { pushState: () => {}, replaceState: () => {} },
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
  URLSearchParams: globalThis.URLSearchParams,
  AbortController: globalThis.AbortController,
};
mockDoc.defaultView = mockWin;

globalThis.window = mockWin;
globalThis.document = mockDoc;
globalThis.Node = Node;
globalThis.Element = Element;
globalThis.HTMLElement = HTMLElement;
globalThis.HTMLIFrameElement = HTMLIFrameElement;

async function renderComponent(ui) {
  const rootEl = mockDoc.createElement('div');
  const root = createRoot(rootEl);
  await act(async () => {
    root.render(ui);
  });
  return {
    container: rootEl,
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
    },
  };
}

describe('Admin Orders Console UI Integration Tests (Step 4)', () => {
  let originalGetOrders;
  let originalGetOrderById;
  let originalUpdateOrderStatus;
  let originalUpdateShipment;

  beforeEach(() => {
    originalGetOrders = adminOrderService.getOrders;
    originalGetOrderById = adminOrderService.getOrderById;
    originalUpdateOrderStatus = adminOrderService.updateOrderStatus;
    originalUpdateShipment = adminOrderService.updateShipment;
  });

  afterEach(() => {
    adminOrderService.getOrders = originalGetOrders;
    adminOrderService.getOrderById = originalGetOrderById;
    adminOrderService.updateOrderStatus = originalUpdateOrderStatus;
    adminOrderService.updateShipment = originalUpdateShipment;
  });

  describe('AdminOrdersPage Component', () => {
    const mockOrderList = [
      {
        _id: '507f1f77bcf86cd799439011',
        user: { name: 'Sarah Connor', email: 'sarah@example.com' },
        status: 'processing',
        payment: { status: 'paid', provider: 'razorpay' },
        totalQuantity: 2,
        subtotal: 5998,
        createdAt: '2026-10-01T10:00:00.000Z',
      },
      {
        _id: '507f1f77bcf86cd799439022',
        user: { name: 'John Doe', email: 'john@example.com' },
        status: 'delivered',
        payment: { status: 'paid', provider: 'razorpay' },
        totalQuantity: 1,
        subtotal: 1999,
        createdAt: '2026-10-02T12:00:00.000Z',
      },
      {
        _id: '507f1f77bcf86cd799439033',
        user: { name: 'Kyle Reese', email: 'kyle@example.com' },
        status: 'cancelled',
        payment: { status: 'refunded', provider: 'razorpay' },
        totalQuantity: 3,
        subtotal: 7500,
        createdAt: '2026-10-03T14:00:00.000Z',
      },
    ];

    it('renders Step 1 AdminPageHeader and page title', async () => {
      adminOrderService.getOrders = async () => ({
        orders: mockOrderList,
        pagination: { page: 1, limit: 10, totalOrders: 3, totalPages: 1 },
      });

      const { container, unmount } = await renderComponent(React.createElement(AdminOrdersPage));
      const text = container.textContent;

      assert.match(text, /Order Management/i);
      assert.match(text, /Review, filter, and transition cross-store customer orders/i);
      assert.match(text, /3 orders/i);
      assert.match(text, /Sarah Connor/);
      assert.match(text, /John Doe/);
      assert.match(text, /Kyle Reese/);

      await unmount();
    });

    it('renders error state when adminOrderService.getOrders fails', async () => {
      adminOrderService.getOrders = async () => {
        throw new Error('Database connection timeout');
      };

      const { container, unmount } = await renderComponent(React.createElement(AdminOrdersPage));
      const text = container.textContent;

      assert.match(text, /Unable to load orders/i);
      assert.match(text, /Database connection timeout/i);

      await unmount();
    });

    it('renders empty state when no orders exist', async () => {
      adminOrderService.getOrders = async () => ({
        orders: [],
        pagination: { page: 1, limit: 10, totalOrders: 0, totalPages: 1 },
      });

      const { container, unmount } = await renderComponent(React.createElement(AdminOrdersPage));
      const text = container.textContent;

      assert.match(text, /No orders in store catalog/i);
      assert.match(text, /There are currently no customer orders recorded in the system/i);

      await unmount();
    });

    it('renders fulfillment and payment status badges correctly', async () => {
      adminOrderService.getOrders = async () => ({
        orders: mockOrderList,
        pagination: { page: 1, limit: 10, totalOrders: 3, totalPages: 1 },
      });

      const { container, unmount } = await renderComponent(React.createElement(AdminOrdersPage));
      const text = container.textContent;

      assert.match(text, /Processing/i);
      assert.match(text, /Delivered/i);
      assert.match(text, /Cancelled/i);
      assert.match(text, /Refunded/i);

      await unmount();
    });
  });

  describe('AdminOrderDetailsPage Component — Variant & Inspection Tests', () => {
    const ORDER_ID = '507f1f77bcf86cd799439099';

    const mockVariantOrder = {
      _id: ORDER_ID,
      user: { _id: 'u123', name: 'Ellen Ripley', email: 'ripley@weyland.com' },
      status: 'confirmed',
      payment: {
        provider: 'razorpay',
        status: 'paid',
        razorpayOrderId: 'order_rzp_123456',
        transactionId: 'pay_rzp_987654',
      },
      shippingAddress: {
        fullName: 'Ellen Ripley',
        addressLine1: 'Nostromo Deck A',
        city: 'Gateway Station',
        state: 'Earth Orbit',
        postalCode: '000000',
        country: 'Sol',
        phone: '+919876543210',
      },
      totalQuantity: 2,
      subtotal: 6998,
      items: [
        {
          _id: 'item1',
          name: 'Thermal Flight Jacket',
          variantId: 'var_jkt_blk_m',
          variantName: 'Medium / Matte Black',
          sku: 'JKT-BLK-M',
          price: 3499,
          quantity: 2,
          subtotal: 6998,
          product: {
            _id: '507f1f77bcf86cd799439001',
            name: 'Thermal Flight Jacket',
          },
        },
      ],
      createdAt: '2026-10-01T12:00:00.000Z',
      updatedAt: '2026-10-01T12:05:00.000Z',
    };

    it('renders Step 1 AdminPageHeader on order detail view', async () => {
      adminOrderService.getOrderById = async () => mockVariantOrder;

      const { container, unmount } = await renderComponent(
        React.createElement(AdminOrderDetailsPage, { orderId: ORDER_ID })
      );
      const text = container.textContent;

      assert.match(text, /Order Details/i);
      assert.match(text, new RegExp(ORDER_ID));
      assert.match(text, /Back to Order List/i);
      assert.match(text, /Ellen Ripley/);
      assert.match(text, /Nostromo Deck A/);

      await unmount();
    });

    it('renders variant attributes and SKU on order line items when present', async () => {
      adminOrderService.getOrderById = async () => mockVariantOrder;

      const { container, unmount } = await renderComponent(
        React.createElement(AdminOrderDetailsPage, { orderId: ORDER_ID })
      );
      const text = container.textContent;

      // Variant snapshot display
      assert.match(text, /Variant: Medium \/ Matte Black/i);
      assert.match(text, /SKU: JKT-BLK-M/i);
      assert.match(text, /Thermal Flight Jacket/);

      await unmount();
    });

    it('renders simple product cleanly without fabricated variant tags', async () => {
      const mockSimpleOrder = {
        ...mockVariantOrder,
        items: [
          {
            _id: 'item2',
            name: 'Basic Survival Knife',
            variantId: null,
            variantName: null,
            sku: null,
            price: 999,
            quantity: 1,
            subtotal: 999,
            product: { _id: '507f1f77bcf86cd799439002', name: 'Basic Survival Knife' },
          },
        ],
      };

      adminOrderService.getOrderById = async () => mockSimpleOrder;

      const { container, unmount } = await renderComponent(
        React.createElement(AdminOrderDetailsPage, { orderId: ORDER_ID })
      );
      const text = container.textContent;

      assert.match(text, /Basic Survival Knife/);
      assert.doesNotMatch(text, /Variant:/);
      assert.doesNotMatch(text, /SKU:/);

      await unmount();
    });

    it('renders terminal cancelled order with stock restoration status', async () => {
      const mockCancelledOrder = {
        ...mockVariantOrder,
        status: 'cancelled',
        cancellation: {
          reason: 'customer_request',
          reasonDetail: 'Customer requested cancellation prior to dispatch',
          cancelledBy: 'admin',
          cancelledAt: '2026-10-02T10:00:00.000Z',
        },
      };

      adminOrderService.getOrderById = async () => mockCancelledOrder;

      const { container, unmount } = await renderComponent(
        React.createElement(AdminOrderDetailsPage, { orderId: ORDER_ID })
      );
      const text = container.textContent;

      assert.match(text, /Cancellation Details/i);
      assert.match(text, /Customer request/i);
      assert.match(text, /Customer requested cancellation prior to dispatch/i);
      assert.match(text, /Admin/);
      assert.match(text, /Inventory status: Stock was automatically restored to available inventory/i);
      assert.match(text, /Shipment information cannot be updated for a cancelled order/i);

      await unmount();
    });

    it('renders read-only refunded payment inspection notification', async () => {
      const mockRefundedOrder = {
        ...mockVariantOrder,
        payment: {
          ...mockVariantOrder.payment,
          status: 'refunded',
        },
      };

      adminOrderService.getOrderById = async () => mockRefundedOrder;

      const { container, unmount } = await renderComponent(
        React.createElement(AdminOrderDetailsPage, { orderId: ORDER_ID })
      );
      const text = container.textContent;

      assert.match(text, /Refunded/i);
      assert.match(text, /Payment recorded as refunded/i);
      assert.match(text, /Automated gateway refund processing is not executed from this console/i);

      await unmount();
    });
  });
});
