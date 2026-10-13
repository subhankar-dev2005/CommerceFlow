import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import AdminReturnsPageModule from './AdminReturnsPage.jsx';
import * as returnService from '../../features/returns/return.service.js';

const AdminReturnsPage = AdminReturnsPageModule?.default || AdminReturnsPageModule;

// Configure React testing environment for act(...)
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
      const t = new MockNode();
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
  Node: MockNode,
  Element: MockElement,
  HTMLElement: MockHTMLElement,
  HTMLIFrameElement: MockHTMLIFrameElement,
  location: { pathname: '/admin/returns', search: '' },
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
globalThis.Node = MockNode;
globalThis.Element = MockElement;
globalThis.HTMLElement = MockHTMLElement;
globalThis.HTMLIFrameElement = MockHTMLIFrameElement;

describe('Order Returns & RMA Lifecycle Frontend Tests', () => {
  let container;
  let root;

  beforeEach(() => {
    container = mockDoc.createElement('div');
    root = createRoot(container);
  });

  describe('1. Return Service State Machine & Invariants', () => {
    it('defines all required return statuses', () => {
      assert.deepEqual(returnService.RETURN_STATUSES, [
        'requested',
        'approved',
        'rejected',
        'received',
        'completed',
        'cancelled',
      ]);
    });

    it('enforces legal forward state transitions', () => {
      const transitions = returnService.ALLOWED_RETURN_TRANSITIONS;
      assert.deepEqual(transitions.requested, ['approved', 'rejected', 'cancelled']);
      assert.deepEqual(transitions.approved, ['received']);
      assert.deepEqual(transitions.received, ['completed']);
      assert.deepEqual(transitions.rejected, []);
      assert.deepEqual(transitions.completed, []);
      assert.deepEqual(transitions.cancelled, []);
    });

    it('rejects invalid ObjectId before network dispatch', async () => {
      await assert.rejects(
        () => returnService.getReturnById('invalid-id'),
        /A valid 24-character returnId is required/
      );
    });

    it('rejects empty items in requestReturn before network dispatch', async () => {
      await assert.rejects(
        () =>
          returnService.requestReturn({
            orderId: '507f1f77bcf86cd799439011',
            reason: 'defective',
            items: [],
          }),
        /At least one item must be selected for return/
      );
    });
  });

  describe('2. AdminReturnsPage UI Integration', () => {
    it('renders page header and search controls', async () => {
      let fetchCalled = false;
      const mockService = {
        adminGetReturns: async () => {
          fetchCalled = true;
          return {
            returns: [],
            pagination: { page: 1, limit: 10, total: 0, totalPages: 1 },
          };
        },
      };

      await act(async () => {
        root.render(React.createElement(AdminReturnsPage, { returnService: mockService }));
      });

      assert.ok(fetchCalled, 'adminGetReturns should be called on mount');
      const text = container.textContent;
      assert.ok(text.includes('Returns & RMA Management'));
      assert.ok(text.includes('Status:'));
    });

    it('renders empty state when no returns exist', async () => {
      const mockService = {
        adminGetReturns: async () => ({
          returns: [],
          pagination: { page: 1, limit: 10, total: 0, totalPages: 1 },
        }),
      };

      await act(async () => {
        root.render(React.createElement(AdminReturnsPage, { returnService: mockService }));
      });

      const text = container.textContent;
      assert.ok(text.includes('No Return Requests Found'));
    });

    it('renders returns table with status badge, return number, and pending manual refund status', async () => {
      const mockReturn = {
        _id: '507f1f77bcf86cd799439011',
        returnNumber: 'RET-20261008-0001',
        orderId: '507f1f77bcf86cd799439012',
        customerId: '507f1f77bcf86cd799439013',
        status: 'requested',
        refundStatus: 'pending_manual',
        reason: 'defective',
        totalRefundAmount: 2499,
        items: [
          {
            name: 'Alpine Backpack',
            sku: 'ALP-BP-001',
            originalOrderedQuantity: 1,
            requestedQuantity: 1,
            price: 2499,
          },
        ],
        requestedAt: new Date().toISOString(),
      };

      const mockService = {
        adminGetReturns: async () => ({
          returns: [mockReturn],
          pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
        }),
      };

      await act(async () => {
        root.render(React.createElement(AdminReturnsPage, { returnService: mockService }));
      });

      const text = container.textContent;
      assert.ok(text.includes('RET-20261008-0001'), 'renders returnNumber');
      assert.ok(text.includes('507f1f77bcf86cd799439012'), 'renders orderId');
      assert.ok(text.includes('Return Requested'), 'renders status badge label');
      assert.ok(text.includes('Pending Manual'), 'renders pending manual refund status');
      assert.ok(text.includes('Inspect & Manage'), 'renders inspect action button');
    });

    it('renders error state and retry button on fetch failure', async () => {
      const mockService = {
        adminGetReturns: async () => {
          throw new Error('Database connection timed out');
        },
      };

      await act(async () => {
        root.render(React.createElement(AdminReturnsPage, { returnService: mockService }));
      });

      const text = container.textContent;
      assert.ok(text.includes('Failed to Load Returns'));
      assert.ok(text.includes('Database connection timed out'));
    });

    it('renders detail inspection modal with items, honest refund notice, and valid actions for requested status', async () => {
      const mockReturn = {
        _id: '507f1f77bcf86cd799439011',
        returnNumber: 'RET-20261008-0001',
        orderId: '507f1f77bcf86cd799439012',
        customerId: '507f1f77bcf86cd799439013',
        status: 'requested',
        refundStatus: 'pending_manual',
        reason: 'defective',
        totalRefundAmount: 2499,
        items: [
          {
            name: 'Alpine Backpack',
            sku: 'ALP-BP-001',
            originalOrderedQuantity: 1,
            requestedQuantity: 1,
            price: 2499,
          },
        ],
        requestedAt: new Date().toISOString(),
      };

      const mockService = {
        adminGetReturns: async () => ({
          returns: [mockReturn],
          pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
        }),
      };

      await act(async () => {
        root.render(React.createElement(AdminReturnsPage, { returnService: mockService }));
      });

      const inspectBtns = [];
      const collectButtons = (el) => {
        if (!el) return;
        if (el.tagName === 'BUTTON') inspectBtns.push(el);
        if (el.children) el.children.forEach(collectButtons);
      };
      collectButtons(container);

      const inspectBtn = inspectBtns.find((b) => b.textContent && b.textContent.includes('Inspect & Manage'));
      assert.ok(inspectBtn, 'Inspect & Manage button exists');

      await act(async () => {
        inspectBtn.dispatchEvent({ type: 'click' });
      });

      const modalText = container.textContent;
      assert.ok(modalText.includes('Return #RET-20261008-0001'), 'renders modal title with return number');
      assert.ok(modalText.includes('Alpine Backpack'), 'renders item name');
      assert.ok(modalText.includes('Pending Manual Reconciliation'), 'shows honest refund note');
      assert.ok(modalText.includes('Approve Return (RMA)'), 'shows Approve button for requested return');
      assert.ok(modalText.includes('Reject Request'), 'shows Reject button for requested return');
      assert.ok(!modalText.includes('Refund Successful'), 'never displays fake refund success button');
    });

    it('suppresses lifecycle actions on completed terminal returns', async () => {
      const mockCompletedReturn = {
        _id: '507f1f77bcf86cd799439011',
        returnNumber: 'RET-20261008-0002',
        orderId: '507f1f77bcf86cd799439012',
        customerId: '507f1f77bcf86cd799439013',
        status: 'completed',
        refundStatus: 'pending_manual',
        reason: 'wrong_item',
        totalRefundAmount: 1499,
        items: [
          {
            name: 'Trail Tent',
            sku: 'TRL-TNT-001',
            originalOrderedQuantity: 1,
            requestedQuantity: 1,
            approvedQuantity: 1,
            price: 1499,
          },
        ],
        requestedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };

      const mockService = {
        adminGetReturns: async () => ({
          returns: [mockCompletedReturn],
          pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
        }),
      };

      await act(async () => {
        root.render(React.createElement(AdminReturnsPage, { returnService: mockService }));
      });

      const inspectBtns = [];
      const collectButtons = (el) => {
        if (!el) return;
        if (el.tagName === 'BUTTON') inspectBtns.push(el);
        if (el.children) el.children.forEach(collectButtons);
      };
      collectButtons(container);

      const inspectBtn = inspectBtns.find((b) => b.textContent && b.textContent.includes('Inspect & Manage'));
      assert.ok(inspectBtn, 'Inspect & Manage button exists');

      await act(async () => {
        inspectBtn.dispatchEvent({ type: 'click' });
      });

      const modalText = container.textContent;
      assert.ok(modalText.includes('terminal state (completed)'), 'shows terminal state message');
      assert.ok(!modalText.includes('Approve Return'), 'does not show Approve button on completed return');
      assert.ok(!modalText.includes('Reject Request'), 'does not show Reject button on completed return');
      assert.ok(!modalText.includes('Mark Package Received'), 'does not show Receive button on completed return');
    });
  });
});
