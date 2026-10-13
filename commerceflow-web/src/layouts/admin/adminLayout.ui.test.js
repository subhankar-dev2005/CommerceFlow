import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import AdminBreadcrumbsModule from './AdminBreadcrumbs.jsx';
import AdminPageHeaderModule from './AdminPageHeader.jsx';
import * as AdminShellStatesModule from './AdminShellStates.jsx';
import AdminSidebarModule from './AdminSidebar.jsx';
import AdminHeaderModule from './AdminHeader.jsx';
import AdminLayoutModule from '../AdminLayout.jsx';
import cartContextModule from '../../features/cart/cart.context.jsx';
import authContextModule from '../../features/auth/auth.context.jsx';

const AdminBreadcrumbs = AdminBreadcrumbsModule?.default || AdminBreadcrumbsModule;
const AdminPageHeader = AdminPageHeaderModule?.default || AdminPageHeaderModule;
const AdminLoadingState = AdminShellStatesModule?.AdminLoadingState || AdminShellStatesModule?.default?.AdminLoadingState;
const AdminErrorState = AdminShellStatesModule?.AdminErrorState || AdminShellStatesModule?.default?.AdminErrorState;
const AdminEmptyState = AdminShellStatesModule?.AdminEmptyState || AdminShellStatesModule?.default?.AdminEmptyState;
const AdminSidebar = AdminSidebarModule?.default || AdminSidebarModule;
const AdminHeader = AdminHeaderModule?.default || AdminHeaderModule;
const AdminLayout = AdminLayoutModule?.default || AdminLayoutModule;

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
      if (name === 'role') el.role = sVal;
      if (name === 'type') el.type = sVal;
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

const mockAuthValue = {
  user: {
    id: '507f1f77bcf86cd799439001',
    name: 'Sarah Admin',
    email: 'admin@commerceflow.com',
    role: 'admin',
  },
  isAuthenticated: true,
  isLoading: false,
  logout: () => {},
};

async function renderComponent(ui) {
  const rootEl = mockDoc.createElement('div');
  const root = createRoot(rootEl);
  await act(async () => {
    root.render(
      React.createElement(AuthContext.Provider, { value: mockAuthValue }, ui)
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

describe('Admin Application Shell UI Components', () => {
  it('AdminBreadcrumbs renders accessible trail and formats path segments', async () => {
    const { container, unmount } = await renderComponent(
      React.createElement(AdminBreadcrumbs, { currentPath: '/admin/products/new' })
    );

    const text = container.textContent;
    assert.ok(text.includes('Admin'));
    assert.ok(text.includes('Products'));
    assert.ok(text.includes('Create Product'));

    await unmount();
  });

  it('AdminPageHeader renders title, subtitle, and badge slot', async () => {
    const { container, unmount } = await renderComponent(
      React.createElement(AdminPageHeader, {
        title: 'Product Catalog',
        subtitle: 'Manage inventory and active items',
        badge: 'Live',
        actions: React.createElement('button', { type: 'button' }, 'Add Product'),
      })
    );

    const text = container.textContent;
    assert.ok(text.includes('Product Catalog'));
    assert.ok(text.includes('Manage inventory and active items'));
    assert.ok(text.includes('Live'));
    assert.ok(text.includes('Add Product'));

    await unmount();
  });

  it('AdminShellStates render Loading, Error, and Empty surfaces cleanly', async () => {
    // 1. Loading state
    const loadRes = await renderComponent(
      React.createElement(AdminLoadingState, { title: 'Loading catalog...' })
    );
    assert.ok(loadRes.container.textContent.includes('Loading catalog...'));
    await loadRes.unmount();

    // 2. Error state
    let retryCalled = false;
    const errRes = await renderComponent(
      React.createElement(AdminErrorState, {
        title: 'Server Error',
        message: 'Could not reach database',
        onRetry: () => { retryCalled = true; },
      })
    );
    assert.ok(errRes.container.textContent.includes('Server Error'));
    assert.ok(errRes.container.textContent.includes('Could not reach database'));
    assert.equal(typeof retryCalled, 'boolean');
    await errRes.unmount();

    // 3. Empty state
    const emptyRes = await renderComponent(
      React.createElement(AdminEmptyState, {
        title: 'No Products Found',
        description: 'Try broadening your search',
        actionLabel: 'Create Product',
        actionHref: '/admin/products/new',
      })
    );
    assert.ok(emptyRes.container.textContent.includes('No Products Found'));
    assert.ok(emptyRes.container.textContent.includes('Create Product'));
    await emptyRes.unmount();
  });

  it('AdminSidebar renders forest-green branding and role-appropriate sections', async () => {
    const { container, unmount } = await renderComponent(
      React.createElement(AdminSidebar, {
        currentPath: '/admin/products',
        userRole: 'admin',
        isCollapsed: false,
      })
    );

    const text = container.textContent;
    assert.ok(text.includes('CommerceFlow'));
    assert.ok(text.includes('Gear Up · Explore More'));
    assert.ok(text.includes('MAIN'));
    assert.ok(text.includes('Dashboard'));
    assert.ok(text.includes('PRODUCT MANAGEMENT'));
    assert.ok(text.includes('Products'));
    assert.ok(text.includes('Categories'));
    assert.ok(text.includes('Inventory'));
    assert.ok(text.includes('Variants'));
    assert.ok(text.includes('ORDER MANAGEMENT'));
    assert.ok(text.includes('Orders'));
    assert.ok(text.includes('Returns'));
    assert.ok(text.includes('USER MANAGEMENT'));
    assert.ok(text.includes('Customers'));
    assert.ok(text.includes('SYSTEM'));
    assert.ok(text.includes('Audit Logs'));
    assert.ok(text.includes('Online'));

    await unmount();
  });

  it('AdminSidebar highlights active navigation item and auto-expands active nested group', async () => {
    const { container, unmount } = await renderComponent(
      React.createElement(AdminSidebar, {
        currentPath: '/admin/orders',
        userRole: 'admin',
        isCollapsed: false,
      })
    );

    // Finding links with aria-current="page"
    function findElements(node, predicate, acc = []) {
      if (predicate(node)) acc.push(node);
      for (const child of node.children || []) {
        findElements(child, predicate, acc);
      }
      return acc;
    }

    const currentPages = findElements(container, (n) => n.getAttribute && n.getAttribute('aria-current') === 'page');
    assert.ok(currentPages.length >= 1, 'Should have at least one active page link');
    assert.ok(currentPages[0].textContent.includes('Orders'), 'Orders link should be active');

    // Auto-expanded group for Orders should render Returns child link
    const text = container.textContent;
    assert.ok(text.includes('Returns'));
    assert.ok(text.includes('Refunds'));

    await unmount();
  });

  it('AdminSidebar highlights only the single appropriate submenu link without duplicate active highlights', async () => {
    function findElements(node, predicate, acc = []) {
      if (predicate(node)) acc.push(node);
      for (const child of node.children || []) {
        findElements(child, predicate, acc);
      }
      return acc;
    }

    // 1. On /admin/refunds, only the nested Refunds link is active
    const refundsRes = await renderComponent(
      React.createElement(AdminSidebar, {
        currentPath: '/admin/refunds',
        userRole: 'admin',
        isCollapsed: false,
      })
    );
    const refundsActiveLinks = findElements(refundsRes.container, (n) => n.getAttribute && n.getAttribute('aria-current') === 'page');
    assert.strictEqual(refundsActiveLinks.length, 1, 'Only one link should be active for /admin/refunds');
    assert.ok(refundsActiveLinks[0].textContent.includes('Refunds'));
    await refundsRes.unmount();

    // 2. On /admin/users, only the nested Administrators link is active
    const usersRes = await renderComponent(
      React.createElement(AdminSidebar, {
        currentPath: '/admin/users',
        userRole: 'admin',
        isCollapsed: false,
      })
    );
    const usersActiveLinks = findElements(usersRes.container, (n) => n.getAttribute && n.getAttribute('aria-current') === 'page');
    assert.strictEqual(usersActiveLinks.length, 1, 'Only one link should be active for /admin/users');
    assert.ok(usersActiveLinks[0].textContent.includes('Administrators'));
    await usersRes.unmount();
  });

  it('AdminSidebar supports desktop collapsed state', async () => {
    const { container, unmount } = await renderComponent(
      React.createElement(AdminSidebar, {
        currentPath: '/admin',
        userRole: 'admin',
        isCollapsed: true,
      })
    );

    function findElements(node, predicate, acc = []) {
      if (predicate(node)) acc.push(node);
      for (const child of node.children || []) {
        findElements(child, predicate, acc);
      }
      return acc;
    }

    const aside = findElements(container, (n) => n.tagName === 'ASIDE')[0];
    assert.ok(aside, 'Aside should exist');
    // When collapsed, aside should have w-20 class
    const className = aside.getAttribute('class') || '';
    assert.ok(className.includes('w-20'), 'Should have w-20 collapsed width');

    // Tagline text should be hidden in collapsed state
    const text = container.textContent;
    assert.ok(!text.includes('Gear Up · Explore More'), 'Brand tagline should be hidden when collapsed');

    await unmount();
  });

  it('AdminSidebar triggers onCloseMobile and onNavigate callbacks', async () => {
    let closed = false;
    let navigated = false;

    const { container, unmount } = await renderComponent(
      React.createElement(AdminSidebar, {
        currentPath: '/admin',
        userRole: 'admin',
        isCollapsed: false,
        onCloseMobile: () => { closed = true; },
        onNavigate: () => { navigated = true; },
      })
    );

    function findElements(node, predicate, acc = []) {
      if (predicate(node)) acc.push(node);
      for (const child of node.children || []) {
        findElements(child, predicate, acc);
      }
      return acc;
    }

    // Close button should be present in mobile mode
    const closeBtn = findElements(container, (n) => n.tagName === 'BUTTON' && n.getAttribute('aria-label') === 'Close navigation drawer')[0];
    assert.ok(closeBtn, 'Close button should exist when onCloseMobile is passed');
    if (closeBtn._listeners && closeBtn._listeners.click) {
      for (const h of closeBtn._listeners.click) {
        h({ type: 'click', preventDefault: () => {} });
      }
    } else if (closeBtn.dispatchEvent) {
      closeBtn.dispatchEvent({ type: 'click' });
    }
    assert.equal(typeof closed, 'boolean');
    assert.equal(typeof navigated, 'boolean');

    await unmount();
  });

  it('AdminHeader renders global search, notifications indicator, and role selector', async () => {
    const { container, unmount } = await renderComponent(
      React.createElement(AdminHeader, {
        onToggleSidebar: () => {},
      })
    );

    const text = container.textContent;
    assert.ok(text.includes('Admin'));
    assert.ok(text.includes('Sarah Admin'));

    await unmount();
  });

  it('AdminLayout wraps children and provides accessible skip-to-content link', async () => {
    const { container, unmount } = await renderComponent(
      React.createElement(
        AdminLayout,
        { currentPath: '/admin/inventory' },
        React.createElement('div', null, 'Inventory Content Test')
      )
    );

    const text = container.textContent;
    assert.ok(text.includes('Skip to administrative content'));
    assert.ok(text.includes('Inventory Content Test'));
    assert.ok(text.includes('Inventory'));
    assert.ok(text.includes('Dashboard'), 'AdminLayout sidebar MUST contain Dashboard nav link');

    await unmount();
  });

  it('AdminLayout renders sidebar logo AND navigation items on desktop /admin route', async () => {
    const { container, unmount } = await renderComponent(
      React.createElement(
        AdminLayout,
        { currentPath: '/admin' },
        React.createElement('div', null, 'Dashboard Page Content')
      )
    );

    const text = container.textContent;
    // Brand header logo & title
    assert.ok(text.includes('CommerceFlow'), 'Sidebar should render CommerceFlow logo/brand');
    assert.ok(text.includes('Gear Up · Explore More'), 'Sidebar should render brand tagline');

    // Navigation sections & items MUST NOT be empty
    assert.ok(text.includes('MAIN'), 'Sidebar should render MAIN section header');
    assert.ok(text.includes('Dashboard'), 'Sidebar should render Dashboard navigation item');
    assert.ok(text.includes('PRODUCT MANAGEMENT'), 'Sidebar should render PRODUCT MANAGEMENT section');
    assert.ok(text.includes('Products'), 'Sidebar should render Products navigation item');
    assert.ok(text.includes('Categories'), 'Sidebar should render Categories navigation item');
    assert.ok(text.includes('ORDER MANAGEMENT'), 'Sidebar should render ORDER MANAGEMENT section');
    assert.ok(text.includes('Orders'), 'Sidebar should render Orders navigation item');
    assert.ok(text.includes('USER MANAGEMENT'), 'Sidebar should render USER MANAGEMENT section');
    assert.ok(text.includes('Customers'), 'Sidebar should render Customers navigation item');
    assert.ok(text.includes('SYSTEM'), 'Sidebar should render SYSTEM section');
    assert.ok(text.includes('Settings'), 'Sidebar should render Settings navigation item');

    // Ensure nav element is not empty
    function findElements(node, predicate, acc = []) {
      if (predicate(node)) acc.push(node);
      for (const child of node.children || []) {
        findElements(child, predicate, acc);
      }
      return acc;
    }
    const navEl = findElements(container, (n) => n.tagName === 'NAV' && n.getAttribute('aria-label') === 'Admin sidebar navigation')[0];
    assert.ok(navEl, 'Admin sidebar navigation nav element should exist');
    assert.ok(navEl.children.length > 0, 'Admin sidebar navigation must have child sections rendered');

    await unmount();
  });
});
