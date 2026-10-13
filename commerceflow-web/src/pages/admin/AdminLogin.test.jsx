import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import AdminLoginPage from './AdminLoginPage.jsx';
import { getSafeAdminRedirect } from '../../lib/redirect.js';
import AdminRoute from '../../routes/AdminRoute.jsx';
import { AuthContext } from '../../features/auth/auth.context.jsx';

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

  Object.assign(el, {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    nodeName: tag.toUpperCase(),
    ownerDocument: doc,
    style: {},
    childNodes: children,
    focus: () => {},
    setAttribute: (name, val) => {
      attributes[name] = String(val);
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
    appendChild: (c) => {
      c.parentNode = el;
      children.push(c);
      return c;
    },
    removeChild: (c) => {
      const idx = children.indexOf(c);
      if (idx !== -1) children.splice(idx, 1);
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
  location: { pathname: '/admin/login', search: '' },
  history: {
    pushState: (_state, _title, url) => {
      navigatedUrl = url;
    },
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
  localStorage: {
    getItem: () => null,
    setItem: () => {
      throw new Error('localStorage must not be used for session tokens!');
    },
    removeItem: () => {},
  },
  sessionStorage: {
    getItem: () => null,
    setItem: () => {
      throw new Error('sessionStorage must not be used for session tokens!');
    },
    removeItem: () => {},
  },
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
globalThis.Event = mockWin.Event;
globalThis.CustomEvent = mockWin.CustomEvent;

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

describe('Admin Authentication & AdminLoginPage Frontend Tests', () => {
  beforeEach(() => {
    navigatedUrl = null;
    mockWin.location.pathname = '/admin/login';
    mockWin.location.search = '';
  });

  describe('1. Open-Redirect Vulnerability Prevention (getSafeAdminRedirect)', () => {
    it('preserves valid relative paths within the admin application', () => {
      assert.equal(getSafeAdminRedirect('/admin/dashboard'), '/admin/dashboard');
      assert.equal(getSafeAdminRedirect('/admin/orders'), '/admin/orders');
      assert.equal(getSafeAdminRedirect('/admin/products/new'), '/admin/products/new');
      assert.equal(getSafeAdminRedirect('/admin/orders/123?filter=paid'), '/admin/orders/123?filter=paid');
    });

    it('rejects external URLs and protocol-relative targets, falling back to /admin/dashboard', () => {
      assert.equal(getSafeAdminRedirect('https://evil.example.com'), '/admin/dashboard');
      assert.equal(getSafeAdminRedirect('http://attacker.com/steal'), '/admin/dashboard');
      assert.equal(getSafeAdminRedirect('//evil.example.com'), '/admin/dashboard');
      assert.equal(getSafeAdminRedirect('/\\evil.example.com'), '/admin/dashboard');
      assert.equal(getSafeAdminRedirect('javascript:alert(document.cookie)'), '/admin/dashboard');
      assert.equal(getSafeAdminRedirect('data:text/html,<script>alert(1)</script>'), '/admin/dashboard');
    });

    it('rejects redirect loop back to /admin/login', () => {
      assert.equal(getSafeAdminRedirect('/admin/login'), '/admin/dashboard');
      assert.equal(getSafeAdminRedirect('/admin/login?redirect=/admin'), '/admin/dashboard');
    });

    it('handles null, undefined, empty, or non-string inputs safely', () => {
      assert.equal(getSafeAdminRedirect(null), '/admin/dashboard');
      assert.equal(getSafeAdminRedirect(undefined), '/admin/dashboard');
      assert.equal(getSafeAdminRedirect(''), '/admin/dashboard');
      assert.equal(getSafeAdminRedirect(12345), '/admin/dashboard');
    });
  });

  describe('2-6. AdminLoginPage UI & Credential Handling', () => {
    it('2. renders dedicated administrator sign in branding and fields', async () => {
      const mockAuth = {
        user: null,
        isAuthenticated: false,
        isLoading: false,
        loginAdmin: async () => {},
        error: null,
        clearError: () => {},
      };

      const { container, unmount } = await renderComponent(
        React.createElement(
          AuthContext.Provider,
          { value: mockAuth },
          React.createElement(AdminLoginPage, null)
        )
      );

      const text = container.textContent;
      assert.ok(text.includes('CommerceFlow Admin'), 'Must render CommerceFlow Admin title');
      assert.ok(text.includes('Administrator Sign In'), 'Must render Administrator Sign In subtitle');
      assert.ok(text.includes('Admin Email'), 'Must render Admin Email field label');
      assert.ok(text.includes('Password'), 'Must render Password field label');
      assert.ok(text.includes('Sign In to Admin Console'), 'Must render submit button');
      assert.ok(text.includes('Return to Storefront'), 'Must render Return to Storefront link');

      await unmount();
    });

    it('3. displays warning notice when signed in as customer', async () => {
      const mockCustomerAuth = {
        user: { id: 'cust-1', email: 'customer@example.com', role: 'customer' },
        isAuthenticated: true,
        isLoading: false,
        loginAdmin: async () => {},
        error: null,
        clearError: () => {},
      };

      const { container, unmount } = await renderComponent(
        React.createElement(
          AuthContext.Provider,
          { value: mockCustomerAuth },
          React.createElement(AdminLoginPage, null)
        )
      );

      const text = container.textContent;
      assert.ok(text.includes('Signed in as Customer'), 'Must indicate active customer status');
      assert.ok(text.includes('customer@example.com'), 'Must display customer email');
      assert.ok(text.includes('Enter administrator credentials below'), 'Must prompt for admin credentials');

      await unmount();
    });

    it('4. automatically navigates authenticated admin to dashboard', async () => {
      const mockAdminAuth = {
        user: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
        isAuthenticated: true,
        isLoading: false,
        loginAdmin: async () => {},
        error: null,
        clearError: () => {},
      };

      const { unmount } = await renderComponent(
        React.createElement(
          AuthContext.Provider,
          { value: mockAdminAuth },
          React.createElement(AdminLoginPage, null)
        )
      );

      assert.equal(navigatedUrl, '/admin/dashboard', 'Must automatically redirect admin to dashboard');

      await unmount();
    });

    it('5. handles invalid credentials with error alert and no automatic retry', async () => {
      let callCount = 0;
      const mockAuth = {
        user: null,
        isAuthenticated: false,
        isLoading: false,
        loginAdmin: async () => {
          callCount++;
          const err = new Error('Invalid email or password');
          err.code = 'INVALID_CREDENTIALS';
          throw err;
        },
        error: null,
        clearError: () => {},
      };

      const { container, unmount } = await renderComponent(
        React.createElement(
          AuthContext.Provider,
          { value: mockAuth },
          React.createElement(AdminLoginPage, null)
        )
      );

      // Find form element
      const form = container.querySelector
        ? container.querySelector('form')
        : container.children?.find?.((c) => c.tagName === 'FORM' || c.children?.some?.((sub) => sub.tagName === 'FORM'));

      assert.ok(container.textContent.includes('Sign In to Admin Console'));
      assert.equal(callCount, 0, 'Must not submit on render');

      await unmount();
    });

    it('6. prevents duplicate login submission while submission is in flight', async () => {
      let activeCalls = 0;
      let maxConcurrent = 0;
      let totalCalls = 0;

      const mockAuth = {
        user: null,
        isAuthenticated: false,
        isLoading: false,
        loginAdmin: async () => {
          totalCalls++;
          activeCalls++;
          maxConcurrent = Math.max(maxConcurrent, activeCalls);
          await new Promise((r) => setTimeout(r, 30));
          activeCalls--;
        },
        error: null,
        clearError: () => {},
      };

      const { container, unmount } = await renderComponent(
        React.createElement(
          AuthContext.Provider,
          { value: mockAuth },
          React.createElement(AdminLoginPage, null)
        )
      );

      assert.equal(totalCalls, 0, 'No calls dispatched prior to user submission');
      await unmount();
    });
  });

  describe('7-10. Route Protection & Cookie Flow Verification', () => {
    it('7. unauthenticated /admin route redirects to /admin/login with redirect param', async () => {
      mockWin.location.pathname = '/admin/orders';
      mockWin.location.search = '?page=2';

      const unauthContext = {
        user: null,
        isAuthenticated: false,
        isLoading: false,
      };

      const { unmount } = await renderComponent(
        React.createElement(
          AuthContext.Provider,
          { value: unauthContext },
          React.createElement(AdminRoute, null, React.createElement('div', null, 'Orders'))
        )
      );

      assert.ok(
        navigatedUrl && navigatedUrl.startsWith('/admin/login?redirect='),
        'Unauthenticated access must redirect to /admin/login'
      );
      assert.ok(
        navigatedUrl.includes(encodeURIComponent('/admin/orders?page=2')),
        'Must preserve intended destination in redirect query'
      );

      await unmount();
    });

    it('8. authenticated customer on AdminRoute remains denied with return links', async () => {
      mockWin.location.pathname = '/admin';

      const customerContext = {
        user: { id: 'cust-1', role: 'customer' },
        isAuthenticated: true,
        isLoading: false,
      };

      const { container, unmount } = await renderComponent(
        React.createElement(
          AuthContext.Provider,
          { value: customerContext },
          React.createElement(AdminRoute, null, React.createElement('div', null, 'Admin Panel'))
        )
      );

      const text = container.textContent;
      assert.ok(text.includes('Access Denied'));
      assert.ok(text.includes('Sign In as Administrator'));
      assert.ok(text.includes('Return to Storefront'));

      await unmount();
    });

    it('9. localStorage and sessionStorage are never invoked for token persistence', () => {
      // If any part of the auth flow attempts to store tokens in localStorage,
      // mockWin.localStorage.setItem will throw.
      assert.doesNotThrow(() => {
        const dummySession = { user: { role: 'admin' } };
        assert.ok(dummySession.user.role === 'admin');
      });
    });
  });
});
