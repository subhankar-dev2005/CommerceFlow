import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import AdminAuditLogsPage from './AdminAuditLogsPage.jsx';
import AdminRoute from '../../routes/AdminRoute.jsx';
import { AuthContext } from '../../features/auth/auth.context.jsx';
import { adminAuditService } from '../../features/admin/adminAudit.service.js';

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
  location: { pathname: '/admin/audit-logs', search: '' },
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

const MOCK_AUDIT_LOG_1 = {
  _id: '607f1f77bcf86cd799439001',
  id: '607f1f77bcf86cd799439001',
  eventType: 'ADMIN_USER_CREATED',
  actorUserId: '507f1f77bcf86cd799439001',
  actorEmail: 'admin1@example.com',
  actorRole: 'admin',
  targetUserId: '507f1f77bcf86cd799439002',
  targetEmail: 'newadmin@example.com',
  metadata: { role: 'admin', isActive: true },
  ipAddress: '127.0.0.1',
  userAgent: 'Mozilla/5.0 Test Agent',
  createdAt: '2026-10-08T10:00:00.000Z',
};

const MOCK_AUDIT_LOG_2 = {
  _id: '607f1f77bcf86cd799439002',
  id: '607f1f77bcf86cd799439002',
  eventType: 'ADMIN_USER_STATUS_UPDATED',
  actorUserId: '507f1f77bcf86cd799439001',
  actorEmail: 'admin1@example.com',
  actorRole: 'admin',
  targetUserId: '507f1f77bcf86cd799439003',
  targetEmail: 'targetuser@example.com',
  metadata: { previousStatus: 'active', newStatus: 'inactive', isActive: false },
  ipAddress: '127.0.0.1',
  userAgent: 'Mozilla/5.0 Test Agent',
  createdAt: '2026-10-08T11:00:00.000Z',
};

describe('Admin Audit Logging Frontend Tests', () => {
  beforeEach(() => {
    navigatedUrl = null;
    mockWin.location.pathname = '/admin/audit-logs';
    mockWin.location.search = '';
  });

  it('1. unauthenticated admin users are redirected to /admin/login', async () => {
    mockWin.location.pathname = '/admin/audit-logs';

    const unauthContext = {
      user: null,
      isAuthenticated: false,
      isLoading: false,
    };

    const { unmount } = await renderComponent(
      React.createElement(
        AuthContext.Provider,
        { value: unauthContext },
        React.createElement(AdminRoute, null, React.createElement(AdminAuditLogsPage, null))
      )
    );

    assert.ok(
      navigatedUrl && navigatedUrl.startsWith('/admin/login?redirect='),
      'Must redirect unauthenticated user to /admin/login'
    );
    assert.ok(
      navigatedUrl.includes(encodeURIComponent('/admin/audit-logs')),
      'Must preserve /admin/audit-logs in redirect target'
    );

    await unmount();
  });

  it('2. customers cannot access /admin/audit-logs', async () => {
    mockWin.location.pathname = '/admin/audit-logs';

    const customerContext = {
      user: { id: 'cust-1', email: 'cust@example.com', role: 'customer' },
      isAuthenticated: true,
      isLoading: false,
    };

    const { container, unmount } = await renderComponent(
      React.createElement(
        AuthContext.Provider,
        { value: customerContext },
        React.createElement(AdminRoute, null, React.createElement(AdminAuditLogsPage, null))
      )
    );

    const text = container.textContent;
    assert.ok(text.includes('Access Denied'), 'Must display Access Denied for customer role');
    assert.ok(!text.includes('System Audit Logs'), 'Must not render audit logs content');

    await unmount();
  });

  it('3. admin can render audit logs list', async () => {
    const originalGetLogs = adminAuditService.getAdminAuditLogs;
    adminAuditService.getAdminAuditLogs = async () => ({
      auditLogs: [MOCK_AUDIT_LOG_1, MOCK_AUDIT_LOG_2],
      pagination: {
        page: 1,
        limit: 10,
        total: 2,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      },
    });

    const adminContext = {
      user: { id: 'admin-1', email: 'admin1@example.com', role: 'admin' },
      isAuthenticated: true,
      isLoading: false,
    };

    const { container, unmount } = await renderComponent(
      React.createElement(
        AuthContext.Provider,
        { value: adminContext },
        React.createElement(AdminRoute, null, React.createElement(AdminAuditLogsPage, null))
      )
    );

    const text = container.textContent;
    assert.ok(text.includes('System Audit Logs'), 'Must display page header');
    assert.ok(text.includes('ADMIN_USER_CREATED'), 'Must display first event type');
    assert.ok(text.includes('ADMIN_USER_STATUS_UPDATED'), 'Must display second event type');
    assert.ok(text.includes('admin1@example.com'), 'Must display actor email');
    assert.ok(text.includes('newadmin@example.com'), 'Must display target email');

    adminAuditService.getAdminAuditLogs = originalGetLogs;
    await unmount();
  });

  it('4. renders event type filter select control', async () => {
    const adminContext = {
      user: { id: 'admin-1', email: 'admin1@example.com', role: 'admin' },
      isAuthenticated: true,
      isLoading: false,
    };

    const { container, unmount } = await renderComponent(
      React.createElement(
        AuthContext.Provider,
        { value: adminContext },
        React.createElement(AdminAuditLogsPage, null)
      )
    );

    const text = container.textContent;
    assert.ok(text.includes('Event Type:'), 'Must render event type filter label');
    assert.ok(text.includes('All Events'), 'Must render All Events filter option');

    await unmount();
  });

  it('5. renders empty state when no audit logs match', async () => {
    const originalGetLogs = adminAuditService.getAdminAuditLogs;
    adminAuditService.getAdminAuditLogs = async () => ({
      auditLogs: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 1 },
    });

    const adminContext = {
      user: { id: 'admin-1', email: 'admin1@example.com', role: 'admin' },
      isAuthenticated: true,
      isLoading: false,
    };

    const { container, unmount } = await renderComponent(
      React.createElement(
        AuthContext.Provider,
        { value: adminContext },
        React.createElement(AdminAuditLogsPage, null)
      )
    );

    const text = container.textContent;
    assert.ok(text.includes('No Audit Logs Found'), 'Must display empty state');

    adminAuditService.getAdminAuditLogs = originalGetLogs;
    await unmount();
  });

  it('6. handles error state and displays retry button', async () => {
    const originalGetLogs = adminAuditService.getAdminAuditLogs;
    adminAuditService.getAdminAuditLogs = async () => {
      throw new Error('Database connection failed');
    };

    const adminContext = {
      user: { id: 'admin-1', email: 'admin1@example.com', role: 'admin' },
      isAuthenticated: true,
      isLoading: false,
    };

    const { container, unmount } = await renderComponent(
      React.createElement(
        AuthContext.Provider,
        { value: adminContext },
        React.createElement(AdminAuditLogsPage, null)
      )
    );

    const text = container.textContent;
    assert.ok(text.includes('Failed to Load Audit Logs'), 'Must display error state header');
    assert.ok(text.includes('Database connection failed'), 'Must display error message');

    adminAuditService.getAdminAuditLogs = originalGetLogs;
    await unmount();
  });

  it('7. pagination controls render in audit table', async () => {
    const originalGetLogs = adminAuditService.getAdminAuditLogs;
    adminAuditService.getAdminAuditLogs = async () => ({
      auditLogs: [MOCK_AUDIT_LOG_1],
      pagination: {
        page: 1,
        limit: 10,
        total: 25,
        totalPages: 3,
        hasNextPage: true,
        hasPrevPage: false,
      },
    });

    const adminContext = {
      user: { id: 'admin-1', email: 'admin1@example.com', role: 'admin' },
      isAuthenticated: true,
      isLoading: false,
    };

    const { container, unmount } = await renderComponent(
      React.createElement(
        AuthContext.Provider,
        { value: adminContext },
        React.createElement(AdminAuditLogsPage, null)
      )
    );

    const text = container.textContent;
    assert.ok(text.includes('Page') && text.includes('1') && text.includes('3'), 'Must display Page 1 of 3');
    assert.ok(text.includes('Previous'), 'Must display Previous button');
    assert.ok(text.includes('Next'), 'Must display Next button');

    adminAuditService.getAdminAuditLogs = originalGetLogs;
    await unmount();
  });

  it('8. strictly immutable: no delete, edit, or purge controls exist in DOM', async () => {
    const originalGetLogs = adminAuditService.getAdminAuditLogs;
    adminAuditService.getAdminAuditLogs = async () => ({
      auditLogs: [MOCK_AUDIT_LOG_1, MOCK_AUDIT_LOG_2],
      pagination: { page: 1, limit: 10, total: 2, totalPages: 1 },
    });

    const adminContext = {
      user: { id: 'admin-1', email: 'admin1@example.com', role: 'admin' },
      isAuthenticated: true,
      isLoading: false,
    };

    const { container, unmount } = await renderComponent(
      React.createElement(
        AuthContext.Provider,
        { value: adminContext },
        React.createElement(AdminAuditLogsPage, null)
      )
    );

    const text = container.textContent.toLowerCase();
    assert.ok(!text.includes('delete audit'), 'Must not contain delete audit actions');
    assert.ok(!text.includes('clear audit'), 'Must not contain clear audit actions');
    assert.ok(!text.includes('purge'), 'Must not contain purge controls');
    assert.ok(!text.includes('edit audit'), 'Must not contain edit audit actions');

    adminAuditService.getAdminAuditLogs = originalGetLogs;
    await unmount();
  });

  it('9. no localStorage or sessionStorage token persistence is used', async () => {
    let localAccessed = false;
    let sessionAccessed = false;

    const originalLocal = globalThis.localStorage;
    const originalSession = globalThis.sessionStorage;

    globalThis.localStorage = {
      getItem: () => { localAccessed = true; return null; },
      setItem: () => { localAccessed = true; },
    };
    globalThis.sessionStorage = {
      getItem: () => { sessionAccessed = true; return null; },
      setItem: () => { sessionAccessed = true; },
    };

    const adminContext = {
      user: { id: 'admin-1', email: 'admin1@example.com', role: 'admin' },
      isAuthenticated: true,
      isLoading: false,
    };

    const { unmount } = await renderComponent(
      React.createElement(
        AuthContext.Provider,
        { value: adminContext },
        React.createElement(AdminAuditLogsPage, null)
      )
    );

    assert.equal(localAccessed, false, 'localStorage must never be touched for tokens');
    assert.equal(sessionAccessed, false, 'sessionStorage must never be touched for tokens');

    globalThis.localStorage = originalLocal;
    globalThis.sessionStorage = originalSession;
    await unmount();
  });

  it('10. renders product, inventory, and order audit events with truthful metadata summaries', async () => {
    const originalGetLogs = adminAuditService.getAdminAuditLogs;
    adminAuditService.getAdminAuditLogs = async () => ({
      auditLogs: [
        {
          _id: '607f1f77bcf86cd799439010',
          id: '607f1f77bcf86cd799439010',
          eventType: 'PRODUCT_CREATED',
          actorUserId: '507f1f77bcf86cd799439001',
          actorEmail: 'admin1@example.com',
          actorRole: 'admin',
          resourceType: 'product',
          resourceId: 'prod-123',
          metadata: { name: 'Thermal Camp Jacket', price: 4500, stock: 25 },
          ipAddress: '127.0.0.1',
          userAgent: 'Mozilla/5.0',
          createdAt: '2026-10-09T08:00:00.000Z',
        },
        {
          _id: '607f1f77bcf86cd799439011',
          id: '607f1f77bcf86cd799439011',
          eventType: 'INVENTORY_ADJUSTED',
          actorUserId: '507f1f77bcf86cd799439001',
          actorEmail: 'admin1@example.com',
          actorRole: 'admin',
          resourceType: 'inventory',
          resourceId: 'prod-123',
          metadata: { productName: 'Thermal Camp Jacket', previousStock: 25, adjustment: -5, resultingStock: 20, reason: 'damaged_inventory' },
          ipAddress: '127.0.0.1',
          userAgent: 'Mozilla/5.0',
          createdAt: '2026-10-09T09:00:00.000Z',
        },
        {
          _id: '607f1f77bcf86cd799439012',
          id: '607f1f77bcf86cd799439012',
          eventType: 'ORDER_STATUS_UPDATED',
          actorUserId: '507f1f77bcf86cd799439001',
          actorEmail: 'admin1@example.com',
          actorRole: 'admin',
          resourceType: 'order',
          resourceId: 'order-999',
          metadata: { orderId: 'order-999', previousStatus: 'processing', newStatus: 'shipped' },
          ipAddress: '127.0.0.1',
          userAgent: 'Mozilla/5.0',
          createdAt: '2026-10-09T10:00:00.000Z',
        },
      ],
      pagination: { page: 1, limit: 10, total: 3, totalPages: 1 },
    });

    const adminContext = {
      user: { id: 'admin-1', email: 'admin1@example.com', role: 'admin' },
      isAuthenticated: true,
      isLoading: false,
    };

    const { container, unmount } = await renderComponent(
      React.createElement(
        AuthContext.Provider,
        { value: adminContext },
        React.createElement(AdminAuditLogsPage, null)
      )
    );

    const text = container.textContent;
    assert.ok(text.includes('PRODUCT_CREATED'), 'Should render PRODUCT_CREATED badge');
    assert.ok(text.includes('Thermal Camp Jacket'), 'Should render product name in metadata');
    assert.ok(text.includes('INVENTORY_ADJUSTED'), 'Should render INVENTORY_ADJUSTED badge');
    assert.ok(text.includes('ORDER_STATUS_UPDATED'), 'Should render ORDER_STATUS_UPDATED badge');
    assert.ok(text.includes('processing → shipped'), 'Should render order status transition');

    adminAuditService.getAdminAuditLogs = originalGetLogs;
    await unmount();
  });
});
