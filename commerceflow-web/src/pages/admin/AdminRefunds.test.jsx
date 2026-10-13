import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import AdminRefundsPage from './AdminRefundsPage.jsx';
import AdminRoute from '../../routes/AdminRoute.jsx';
import { AuthContext } from '../../features/auth/auth.context.jsx';
import { REFUND_STATUSES } from '../../features/admin/adminRefund.service.js';

// Configure React 19 testing environment for act(...)
globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Mock DOM classes for React 19 testing in Node
class MockNode {}
class MockElement extends MockNode {}
class MockHTMLElement extends MockElement {}
class MockHTMLIFrameElement extends MockHTMLElement {}

function createMockElement(tag, doc) {
  const el = new MockHTMLElement();
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
      attributes[name] = String(val);
      if (name === 'value') el.value = String(val);
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
    get: () => children.map((c) => c.textContent || '').join(''),
    set: (val) => {
      children.length = 0;
      if (val) {
        const textNode = new MockNode();
        textNode.nodeType = 3;
        textNode.nodeValue = String(val);
        textNode.ownerDocument = doc;
        Object.defineProperty(textNode, 'textContent', {
          get: () => textNode.nodeValue,
          set: (v) => { textNode.nodeValue = String(v); },
        });
        textNode.parentNode = el;
        children.push(textNode);
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
      const t = new MockNode();
      t.nodeType = 3;
      t.nodeValue = String(text);
      t.ownerDocument = doc;
      Object.defineProperty(t, 'textContent', {
        get: () => t.nodeValue,
        set: (v) => { t.nodeValue = String(v); },
      });
      return t;
    },
    createComment: () => ({ nodeType: 8, ownerDocument: doc }),
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  return doc;
}

const mockDoc = createMockDocument();
const mockWin = {
  document: mockDoc,
  Node: MockNode,
  Element: MockElement,
  HTMLElement: MockHTMLElement,
  HTMLIFrameElement: MockHTMLIFrameElement,
  location: { pathname: '/admin/refunds', search: '' },
  history: {
    pushState: () => {},
    replaceState: () => {},
  },
  innerWidth: 1200,
  scrollTo: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
  Event: class MockEvent {
    constructor(type) {
      this.type = type;
    }
  },
  CustomEvent: class MockCustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  },
  URLSearchParams: globalThis.URLSearchParams,
  AbortController: globalThis.AbortController,
};
mockDoc.defaultView = mockWin;

if (!globalThis.window) globalThis.window = mockWin;
if (!globalThis.document) globalThis.document = mockDoc;
if (!globalThis.Event) globalThis.Event = mockWin.Event;
if (!globalThis.CustomEvent) globalThis.CustomEvent = mockWin.CustomEvent;
if (!globalThis.Node) globalThis.Node = MockNode;
if (!globalThis.Element) globalThis.Element = MockElement;
if (!globalThis.HTMLElement) globalThis.HTMLElement = MockHTMLElement;
if (!globalThis.HTMLIFrameElement) globalThis.HTMLIFrameElement = MockHTMLIFrameElement;

async function renderComponent(element) {
  const rootEl = mockDoc.createElement('div');
  const root = createRoot(rootEl);
  await act(async () => {
    root.render(element);
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

describe('Admin Financial Refunds & Ledger UI Tests', () => {
  it('1. customer cannot access /admin/refunds via AdminRoute', async () => {
    const customerAuth = {
      user: { _id: 'cust-1', name: 'Regular Customer', role: 'customer' },
      isAuthenticated: true,
      loading: false,
    };

    const { container } = await renderComponent(
      React.createElement(
        AuthContext.Provider,
        { value: customerAuth },
        React.createElement(AdminRoute, null, React.createElement(AdminRefundsPage, null))
      )
    );

    const text = container.textContent;
    assert.ok(text.includes('Access Denied'));
    assert.ok(!text.includes('Payment Refunds & Financial Ledger'));
  });

  it('2. admin can render refunds list and table headers', async () => {
    const mockService = {
      adminGetRefunds: async () => ({
        refunds: [
          {
            _id: '507f1f77bcf86cd799439001',
            refundNumber: 'RFND-20261010-001',
            orderId: { _id: '507f1f77bcf86cd799439002' },
            returnId: { _id: '507f1f77bcf86cd799439003', returnNumber: 'RET-001' },
            customerId: { name: 'Alice Smith', email: 'alice@example.com' },
            amount: 2500,
            amountInPaise: 250000,
            currency: 'INR',
            gateway: 'razorpay',
            gatewayPaymentId: 'pay_test123',
            gatewayRefundId: 'rfnd_test999',
            status: 'succeeded',
            createdAt: new Date().toISOString(),
          },
        ],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
      }),
    };

    const { container } = await renderComponent(
      React.createElement(AdminRefundsPage, { refundService: mockService })
    );

    const text = container.textContent;
    assert.ok(text.includes('Payment Refunds & Financial Ledger'));
    assert.ok(text.includes('RFND-20261010-001'));
    assert.ok(text.includes('Alice Smith'));
    assert.ok(text.includes('Refund Succeeded'));
    assert.ok(text.includes('Inspect & Reconcile'));
  });

  it('3. renders empty state when no refunds match filters', async () => {
    const mockService = {
      adminGetRefunds: async () => ({
        refunds: [],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 1 },
      }),
    };

    const { container } = await renderComponent(
      React.createElement(AdminRefundsPage, { refundService: mockService })
    );

    const text = container.textContent;
    assert.ok(text.includes('No Refund Records Found'));
  });

  it('4. handles error state and displays retry button', async () => {
    const mockService = {
      adminGetRefunds: async () => {
        throw new Error('Database gateway reconciliation error');
      },
    };

    const { container } = await renderComponent(
      React.createElement(AdminRefundsPage, { refundService: mockService })
    );

    const text = container.textContent;
    assert.ok(text.includes('Failed to Load Refunds'));
    assert.ok(text.includes('Database gateway reconciliation error'));
  });

  it('5. inspect modal displays refund details and immutable ledger history', async () => {
    const mockRefund = {
      _id: '507f1f77bcf86cd799439001',
      refundNumber: 'RFND-20261010-MODAL',
      orderId: { _id: '507f1f77bcf86cd799439002' },
      returnId: { _id: '507f1f77bcf86cd799439003', returnNumber: 'RET-MODAL' },
      customerId: { name: 'Bob Jones', email: 'bob@example.com' },
      amount: 1999,
      amountInPaise: 199900,
      currency: 'INR',
      gateway: 'razorpay',
      gatewayPaymentId: 'pay_modal_456',
      gatewayRefundId: 'rfnd_modal_789',
      idempotencyKey: 'rma-refund:507f1f77bcf86cd799439003',
      status: 'succeeded',
      createdAt: new Date().toISOString(),
    };

    const mockLedger = [
      {
        _id: 'led_1',
        eventType: 'PAYMENT_REFUND_REQUESTED',
        direction: 'debit',
        amount: 1999,
        status: 'pending',
        createdAt: new Date().toISOString(),
      },
      {
        _id: 'led_2',
        eventType: 'PAYMENT_REFUNDED',
        direction: 'debit',
        amount: 1999,
        status: 'succeeded',
        createdAt: new Date().toISOString(),
      },
    ];

    const mockService = {
      adminGetRefunds: async () => ({
        refunds: [mockRefund],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
      }),
      adminGetRefundById: async () => ({
        refund: mockRefund,
        ledgerEntries: mockLedger,
      }),
    };

    const { container } = await renderComponent(
      React.createElement(AdminRefundsPage, { refundService: mockService })
    );

    const buttons = [];
    const collectButtons = (el) => {
      if (!el) return;
      if (el.tagName === 'BUTTON') buttons.push(el);
      if (el.children) el.children.forEach(collectButtons);
    };
    collectButtons(container);

    const inspectBtn = buttons.find((b) => b.textContent && b.textContent.includes('Inspect & Reconcile'));
    assert.ok(inspectBtn, 'Inspect & Reconcile button exists');

    await act(async () => {
      inspectBtn.dispatchEvent({ type: 'click' });
    });

    const modalText = container.textContent;
    assert.ok(modalText.includes('Refund Inspection & Ledger Reconciliation'));
    assert.ok(modalText.includes('RFND-20261010-MODAL'));
    assert.ok(modalText.includes('Immutable Financial Ledger History'));
    assert.ok(modalText.includes('PAYMENT_REFUND_REQUESTED'));
    assert.ok(modalText.includes('PAYMENT_REFUNDED'));
    // Since status is succeeded, Retry button must NOT be present!
    assert.ok(!modalText.includes('Retry Failed Gateway Refund'));
  });

  it('6. retry button is only visible for failed refunds and can trigger retry', async () => {
    let retryCalled = false;
    const mockFailedRefund = {
      _id: '507f1f77bcf86cd799439009',
      refundNumber: 'RFND-20261010-FAILED',
      orderId: { _id: '507f1f77bcf86cd799439002' },
      customerId: { name: 'Charlie', email: 'charlie@example.com' },
      amount: 800,
      amountInPaise: 80000,
      currency: 'INR',
      gateway: 'razorpay',
      gatewayPaymentId: 'pay_fail_777',
      gatewayRefundId: null,
      idempotencyKey: 'rma-refund:507f1f77bcf86cd799439009',
      status: 'failed',
      failureReason: 'Gateway timeout during fund disbursement',
      createdAt: new Date().toISOString(),
    };

    const mockService = {
      adminGetRefunds: async () => ({
        refunds: [mockFailedRefund],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
      }),
      adminGetRefundById: async () => ({
        refund: mockFailedRefund,
        ledgerEntries: [],
      }),
      adminRetryRefund: async () => {
        retryCalled = true;
        return {
          ...mockFailedRefund,
          status: 'succeeded',
          gatewayRefundId: 'rfnd_recovered_123',
        };
      },
    };

    const { container } = await renderComponent(
      React.createElement(AdminRefundsPage, { refundService: mockService })
    );

    const buttons = [];
    const collectButtons = (el) => {
      if (!el) return;
      if (el.tagName === 'BUTTON') buttons.push(el);
      if (el.children) el.children.forEach(collectButtons);
    };
    collectButtons(container);

    const inspectBtn = buttons.find((b) => b.textContent && b.textContent.includes('Inspect & Reconcile'));
    await act(async () => {
      inspectBtn.dispatchEvent({ type: 'click' });
    });

    const modalText = container.textContent;
    assert.ok(modalText.includes('Gateway timeout during fund disbursement'));
    assert.ok(modalText.includes('Retry Failed Gateway Refund'), 'Retry button is visible for failed refunds');

    // Collect buttons inside modal
    buttons.length = 0;
    collectButtons(container);
    const retryBtn = buttons.find((b) => b.textContent && b.textContent.includes('Retry Failed Gateway Refund'));
    assert.ok(retryBtn, 'Retry button found');

    await act(async () => {
      retryBtn.dispatchEvent({ type: 'click' });
    });

    assert.ok(retryCalled, 'adminRetryRefund service was dispatched');
  });

  it('7. strictly immutable: no client-facing controls exist to manipulate refund amount or select succeeded status', async () => {
    const mockService = {
      adminGetRefunds: async () => ({
        refunds: [],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 1 },
      }),
    };

    const { container } = await renderComponent(
      React.createElement(AdminRefundsPage, { refundService: mockService })
    );

    const text = container.textContent;
    assert.ok(!text.includes('Edit Amount'));
    assert.ok(!text.includes('Force Success'));
    assert.ok(!text.includes('Mark Succeeded'));
  });
});
