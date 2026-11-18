import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import AdminCouponsPage from './AdminCouponsPage.jsx';
import AdminRoute from '../../routes/AdminRoute.jsx';
import { AuthContext } from '../../features/auth/auth.context.jsx';
import { adminCouponService } from '../../features/admin/adminCoupon.service.js';
import { ApiError } from '../../lib/apiClient.js';

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
      if (name in el && typeof el[name] === 'string') return el[name];
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
      return c;
    },
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
let navigatedUrl = null;

const mockWin = {
  document: mockDoc,
  Node: MockNode,
  Element: MockElement,
  HTMLElement: MockHTMLElement,
  HTMLIFrameElement: MockHTMLIFrameElement,
  location: { pathname: '/admin/coupons', search: '' },
  history: {
    pushState: (_s, _t, url) => {
      navigatedUrl = url;
    },
  },
  CustomEvent: class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  },
  Event: class Event {
    constructor(type) {
      this.type = type;
    }
  },
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
  scrollTo: () => {},
  setTimeout: globalThis.setTimeout,
  clearTimeout: globalThis.clearTimeout,
  queueMicrotask: globalThis.queueMicrotask,
};

globalThis.window = mockWin;
globalThis.document = mockDoc;

describe('AdminCouponsPage UI & Access Invariants', () => {
  beforeEach(() => {
    navigatedUrl = null;
  });

  it('1. unauthenticated guest is blocked and redirected to /admin/login', async () => {
    const rootEl = mockDoc.createElement('div');
    const root = createRoot(rootEl);

    const guestAuth = {
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    };

    await act(async () => {
      root.render(
        React.createElement(
          AuthContext.Provider,
          { value: guestAuth },
          React.createElement(AdminRoute, null, React.createElement(AdminCouponsPage))
        )
      );
    });

    assert.ok(
      navigatedUrl && navigatedUrl.startsWith('/admin/login?redirect='),
      'Must redirect unauthenticated user to /admin/login'
    );
    assert.ok(!rootEl.textContent.includes('Coupons Management'));

    await act(async () => {
      root.unmount();
    });
  });

  it('2. customer is strictly blocked by AdminRoute with Access Denied', async () => {
    const rootEl = mockDoc.createElement('div');
    const root = createRoot(rootEl);

    const customerAuth = {
      user: { id: 'cust-1', name: 'Customer User', email: 'cust@example.com', role: 'customer' },
      isAuthenticated: true,
      isLoading: false,
      error: null,
    };

    await act(async () => {
      root.render(
        React.createElement(
          AuthContext.Provider,
          { value: customerAuth },
          React.createElement(AdminRoute, null, React.createElement(AdminCouponsPage))
        )
      );
    });

    assert.ok(rootEl.textContent.includes('Access Denied'));
    assert.ok(!rootEl.textContent.includes('Coupons Management'));

    await act(async () => {
      root.unmount();
    });
  });

  it('3. authorized administrator loads coupons table cleanly', async () => {
    const rootEl = mockDoc.createElement('div');
    const root = createRoot(rootEl);

    const mockCoupons = [
      {
        id: 'cpn-1',
        _id: 'cpn-1',
        code: 'WELCOME10',
        type: 'percentage',
        value: 10,
        minimumSubtotal: 500,
        maximumDiscount: 100,
        usedCount: 14,
        usageLimit: 100,
        isActive: true,
      },
    ];

    const mockService = {
      getAdminCoupons: async () => ({
        coupons: mockCoupons,
        totalCoupons: 1,
        totalPages: 1,
        page: 1,
        limit: 10,
      }),
      updateAdminCouponStatus: async () => ({ success: true }),
    };

    await act(async () => {
      root.render(React.createElement(AdminCouponsPage, { couponService: mockService }));
      await new Promise((r) => setTimeout(r, 10));
    });

    assert.ok(rootEl.textContent.includes('Coupons Management'));
    assert.ok(rootEl.textContent.includes('WELCOME10'));
    assert.ok(rootEl.textContent.includes('10% Off'));

    await act(async () => {
      root.unmount();
    });
  });

  it('4. access denied (403 Forbidden) suppresses retry button preventing repeated request loops', async () => {
    const rootEl = mockDoc.createElement('div');
    const root = createRoot(rootEl);

    let requestCount = 0;
    const mockService = {
      getAdminCoupons: async () => {
        requestCount++;
        throw new ApiError({
          message: 'You do not have permission to access this resource',
          status: 403,
          code: 'FORBIDDEN',
        });
      },
    };

    await act(async () => {
      root.render(React.createElement(AdminCouponsPage, { couponService: mockService }));
      await new Promise((r) => setTimeout(r, 10));
    });

    assert.strictEqual(requestCount, 1, 'Initial load must request exactly once');
    assert.ok(rootEl.textContent.includes('Access Denied'));
    assert.ok(rootEl.textContent.includes('Access denied: You do not have permission to view or manage promotional discount coupons.'));
    // Crucial: Must NOT contain "Try Again" retry button on 403
    assert.ok(!rootEl.textContent.includes('Try Again'), 'Retry button must be omitted when access is denied');

    await act(async () => {
      root.unmount();
    });
  });

  it('5. network connection refused (status 0) shows backend port 4000 guidance and permits retry', async () => {
    const rootEl = mockDoc.createElement('div');
    const root = createRoot(rootEl);

    let requestCount = 0;
    const mockService = {
      getAdminCoupons: async () => {
        requestCount++;
        throw new ApiError({
          message: 'Network connection failed',
          status: 0,
          code: 'NETWORK_ERROR',
        });
      },
    };

    await act(async () => {
      root.render(React.createElement(AdminCouponsPage, { couponService: mockService }));
      await new Promise((r) => setTimeout(r, 10));
    });

    assert.strictEqual(requestCount, 1, 'Must request exactly once on mount');
    assert.ok(rootEl.textContent.includes('Could not load coupons'));
    assert.ok(rootEl.textContent.includes('backend server is running on port 4000'));
    assert.ok(rootEl.textContent.includes('Try Again'), 'Retry button is provided for transient network errors');

    await act(async () => {
      root.unmount();
    });
  });

  it('6. multi-page pagination displays correct coupon counts and pagination navigation controls', async () => {
    const rootEl = mockDoc.createElement('div');
    const root = createRoot(rootEl);

    const mockService = {
      getAdminCoupons: async (params) => ({
        coupons: [
          {
            id: 'cpn-10',
            _id: 'cpn-10',
            code: 'SAVEMORE20',
            type: 'percentage',
            value: 20,
            isActive: true,
          },
        ],
        totalCoupons: 25,
        totalPages: 3,
        page: params.page || 1,
        limit: 10,
      }),
    };

    await act(async () => {
      root.render(React.createElement(AdminCouponsPage, { couponService: mockService }));
      await new Promise((r) => setTimeout(r, 10));
    });

    assert.ok(rootEl.textContent.includes('25 Coupons'), 'Header badge must display totalCoupons');
    assert.ok(rootEl.textContent.includes('Page 1 of 3 (25 total)'), 'Pagination footer must display totalPages and total count');
    assert.ok(rootEl.textContent.includes('Next'), 'Next page button must be rendered');
    assert.ok(rootEl.textContent.includes('Previous'), 'Previous page button must be rendered');

    await act(async () => {
      root.unmount();
    });
  });
});
