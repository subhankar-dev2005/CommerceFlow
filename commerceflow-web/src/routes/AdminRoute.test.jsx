import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import AdminRouteModule from './AdminRoute.jsx';
import cartContextModule from '../features/cart/cart.context.jsx';
import authContextModule from '../features/auth/auth.context.jsx';

const AdminRoute = AdminRouteModule?.default || AdminRouteModule;
const AuthContext = cartContextModule?.AuthContext || authContextModule?.AuthContext || authContextModule?.default || authContextModule;

// Configure React 19 testing environment for act(...)
globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Mock DOM for React 19 testing in Node
class Node {}
class Element extends Node {}
class HTMLElement extends Element {}
class HTMLIFrameElement extends HTMLElement {}

function createMockElement(tag, doc) {
  const el = new HTMLElement();
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
      const sVal = String(val);
      attributes[name] = sVal;
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
        const textNode = new Node();
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
      const t = new Node();
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
  Node,
  Element,
  HTMLElement,
  HTMLIFrameElement,
  location: { pathname: '/admin', search: '' },
  history: { pushState: () => {}, replaceState: () => {} },
  innerWidth: 1200,
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

async function renderWithAuth(authValue, children) {
  const rootEl = mockDoc.createElement('div');
  const root = createRoot(rootEl);
  await act(async () => {
    root.render(
      React.createElement(
        AuthContext.Provider,
        { value: authValue },
        React.createElement(AdminRoute, null, children)
      )
    );
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

describe('AdminRoute Security & Role Protection Tests', () => {
  it('G. AdminRoute strictly blocks authenticated customers and renders Access Denied', async () => {
    const customerAuth = {
      user: {
        id: 'cust-123',
        name: 'Jane Customer',
        email: 'jane@example.com',
        role: 'customer',
      },
      isAuthenticated: true,
      isLoading: false,
    };

    const protectedChild = React.createElement('div', { id: 'admin-secret' }, 'Confidential Admin Console');
    const { container, unmount } = await renderWithAuth(customerAuth, protectedChild);

    const text = container.textContent;
    assert.ok(text.includes('Access Denied'), 'Must display Access Denied title');
    assert.ok(
      text.includes('You do not have administrative privileges to view this area. You remain signed in as an authenticated customer.'),
      'Must display exact explanation message'
    );
    assert.ok(!text.includes('Confidential Admin Console'), 'Must NEVER render children for customer role');
    assert.ok(text.includes('Return to Storefront'), 'Must display Return to Storefront link');

    await unmount();
  });

  it('H. AdminRoute permits authenticated admins and renders control panel children', async () => {
    const adminAuth = {
      user: {
        id: 'admin-456',
        name: 'Chief Admin',
        email: 'chief@commerceflow.com',
        role: 'admin',
      },
      isAuthenticated: true,
      isLoading: false,
    };

    const protectedChild = React.createElement('div', { id: 'admin-secret' }, 'Confidential Admin Console');
    const { container, unmount } = await renderWithAuth(adminAuth, protectedChild);

    const text = container.textContent;
    assert.ok(!text.includes('Access Denied'), 'Must not display Access Denied for admin');
    assert.ok(text.includes('Confidential Admin Console'), 'Must render children for admin role');

    await unmount();
  });

  it('H2. AdminRoute blocks unsupported superAdmin role and renders Access Denied', async () => {
    const superAdminAuth = {
      user: {
        id: 'super-admin-789',
        name: 'Executive Super Admin',
        email: 'super@commerceflow.com',
        role: 'superAdmin',
      },
      isAuthenticated: true,
      isLoading: false,
    };

    const protectedChild = React.createElement('div', { id: 'admin-secret' }, 'Confidential Admin Console');
    const { container, unmount } = await renderWithAuth(superAdminAuth, protectedChild);

    const text = container.textContent;
    assert.ok(text.includes('Access Denied'), 'Must display Access Denied for superAdmin');
    assert.ok(!text.includes('Confidential Admin Console'), 'Must NEVER render children for superAdmin role');

    await unmount();
  });

  it('H3. AdminRoute blocks users with missing, null, or unknown roles and renders Access Denied', async () => {
    const protectedChild = React.createElement('div', { id: 'admin-secret' }, 'Confidential Admin Console');

    // Missing role
    const missingRoleAuth = {
      user: { id: 'user-no-role', name: 'No Role User' },
      isAuthenticated: true,
      isLoading: false,
    };
    const { container: c1, unmount: u1 } = await renderWithAuth(missingRoleAuth, protectedChild);
    assert.ok(c1.textContent.includes('Access Denied'), 'Must deny user with missing role');
    assert.ok(!c1.textContent.includes('Confidential Admin Console'), 'Must not render children for missing role');
    await u1();

    // Null role
    const nullRoleAuth = {
      user: { id: 'user-null-role', name: 'Null Role User', role: null },
      isAuthenticated: true,
      isLoading: false,
    };
    const { container: c2, unmount: u2 } = await renderWithAuth(nullRoleAuth, protectedChild);
    assert.ok(c2.textContent.includes('Access Denied'), 'Must deny user with null role');
    assert.ok(!c2.textContent.includes('Confidential Admin Console'), 'Must not render children for null role');
    await u2();

    // Unknown role
    const unknownRoleAuth = {
      user: { id: 'user-unknown-role', name: 'Manager User', role: 'manager' },
      isAuthenticated: true,
      isLoading: false,
    };
    const { container: c3, unmount: u3 } = await renderWithAuth(unknownRoleAuth, protectedChild);
    assert.ok(c3.textContent.includes('Access Denied'), 'Must deny user with unknown role');
    assert.ok(!c3.textContent.includes('Confidential Admin Console'), 'Must not render children for unknown role');
    await u3();
  });

  it('I. Transitioning between customer and admin auth state does not retain stale permissions', async () => {
    const rootEl = mockDoc.createElement('div');
    const root = createRoot(rootEl);

    // Step 1: Customer visits /admin
    const customerAuth = {
      user: { id: 'cust-1', name: 'Cust', role: 'customer' },
      isAuthenticated: true,
      isLoading: false,
    };

    await act(async () => {
      root.render(
        React.createElement(
          AuthContext.Provider,
          { value: customerAuth },
          React.createElement(AdminRoute, null, React.createElement('div', null, 'Admin Area Content'))
        )
      );
    });

    assert.ok(rootEl.textContent.includes('Access Denied'));
    assert.ok(!rootEl.textContent.includes('Admin Area Content'));

    // Step 2: User logs out and logs in as admin
    const adminAuth = {
      user: { id: 'admin-1', name: 'Admin', role: 'admin' },
      isAuthenticated: true,
      isLoading: false,
    };

    await act(async () => {
      root.render(
        React.createElement(
          AuthContext.Provider,
          { value: adminAuth },
          React.createElement(AdminRoute, null, React.createElement('div', null, 'Admin Area Content'))
        )
      );
    });

    assert.ok(!rootEl.textContent.includes('Access Denied'));
    assert.ok(rootEl.textContent.includes('Admin Area Content'));

    await act(async () => {
      root.unmount();
    });
  });

  it('J. Initial session hydration state shows loader and correctly renders admin content upon completion', async () => {
    const rootEl = mockDoc.createElement('div');
    const root = createRoot(rootEl);

    // Initial hydrating state (isLoading: true)
    const hydratingAuth = {
      user: null,
      isAuthenticated: false,
      isLoading: true,
    };

    await act(async () => {
      root.render(
        React.createElement(
          AuthContext.Provider,
          { value: hydratingAuth },
          React.createElement(AdminRoute, null, React.createElement('div', null, 'Secure Dashboard'))
        )
      );
    });

    assert.ok(rootEl.textContent.includes('Verifying administrator privileges...'));
    assert.ok(!rootEl.textContent.includes('Access Denied'));
    assert.ok(!rootEl.textContent.includes('Secure Dashboard'));

    // Hydration finishes with admin user
    const hydratedAdminAuth = {
      user: { id: 'admin-1', role: 'admin' },
      isAuthenticated: true,
      isLoading: false,
    };

    await act(async () => {
      root.render(
        React.createElement(
          AuthContext.Provider,
          { value: hydratedAdminAuth },
          React.createElement(AdminRoute, null, React.createElement('div', null, 'Secure Dashboard'))
        )
      );
    });

    assert.ok(!rootEl.textContent.includes('Verifying administrator privileges...'));
    assert.ok(!rootEl.textContent.includes('Access Denied'));
    assert.ok(rootEl.textContent.includes('Secure Dashboard'));

    await act(async () => {
      root.unmount();
    });
  });
});
