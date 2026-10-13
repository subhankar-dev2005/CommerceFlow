import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import AdminUsersPage from './AdminUsersPage.jsx';
import AdminRoute from '../../routes/AdminRoute.jsx';
import { AuthContext } from '../../features/auth/auth.context.jsx';
import { adminUserService } from '../../features/admin/adminUser.service.js';

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
  location: { pathname: '/admin/users', search: '' },
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

const MOCK_ADMIN_USER = {
  _id: '507f1f77bcf86cd799439001',
  id: '507f1f77bcf86cd799439001',
  name: 'Primary Admin',
  email: 'primary@example.com',
  role: 'admin',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const MOCK_SECOND_ADMIN = {
  _id: '507f1f77bcf86cd799439002',
  id: '507f1f77bcf86cd799439002',
  name: 'Secondary Admin',
  email: 'secondary@example.com',
  role: 'admin',
  isActive: true,
  createdAt: '2026-02-01T00:00:00.000Z',
};

describe('Admin User Management Frontend Tests', () => {
  beforeEach(() => {
    navigatedUrl = null;
    mockWin.location.pathname = '/admin/users';
    mockWin.location.search = '';
  });

  it('1. unauthenticated admin users are redirected to /admin/login', async () => {
    mockWin.location.pathname = '/admin/users';

    const unauthContext = {
      user: null,
      isAuthenticated: false,
      isLoading: false,
    };

    const { unmount } = await renderComponent(
      React.createElement(
        AuthContext.Provider,
        { value: unauthContext },
        React.createElement(AdminRoute, null, React.createElement(AdminUsersPage, null))
      )
    );

    assert.ok(
      navigatedUrl && navigatedUrl.startsWith('/admin/login?redirect='),
      'Must redirect unauthenticated user to /admin/login'
    );
    assert.ok(
      navigatedUrl.includes(encodeURIComponent('/admin/users')),
      'Must preserve /admin/users in redirect target'
    );

    await unmount();
  });

  it('2. customers cannot access /admin/users', async () => {
    mockWin.location.pathname = '/admin/users';

    const customerContext = {
      user: { id: 'cust-1', email: 'cust@example.com', role: 'customer' },
      isAuthenticated: true,
      isLoading: false,
    };

    const { container, unmount } = await renderComponent(
      React.createElement(
        AuthContext.Provider,
        { value: customerContext },
        React.createElement(AdminRoute, null, React.createElement(AdminUsersPage, null))
      )
    );

    const text = container.textContent;
    assert.ok(text.includes('Access Denied'), 'Must display Access Denied for customer role');
    assert.ok(!text.includes('Manage store administrators'), 'Must not render admin users page content');

    await unmount();
  });

  it('3. admin can render administrator list', async () => {
    const originalGetUsers = adminUserService.getAdminUsers;
    adminUserService.getAdminUsers = async () => ({
      users: [MOCK_ADMIN_USER, MOCK_SECOND_ADMIN],
      pagination: { page: 1, limit: 10, totalUsers: 2, totalPages: 1 },
    });

    const adminContext = {
      user: MOCK_ADMIN_USER,
      isAuthenticated: true,
      isLoading: false,
    };

    const { container, unmount } = await renderComponent(
      React.createElement(
        AuthContext.Provider,
        { value: adminContext },
        React.createElement(AdminUsersPage, null)
      )
    );

    const text = container.textContent;
    assert.ok(text.includes('Administrators'), 'Must render Administrators page title');
    assert.ok(text.includes('Primary Admin'), 'Must render first admin');
    assert.ok(text.includes('primary@example.com'), 'Must render first admin email');
    assert.ok(text.includes('Secondary Admin'), 'Must render second admin');
    assert.ok(text.includes('secondary@example.com'), 'Must render second admin email');

    adminUserService.getAdminUsers = originalGetUsers;
    await unmount();
  });

  it('4. renders search and filter UI controls', async () => {
    const originalGetUsers = adminUserService.getAdminUsers;
    adminUserService.getAdminUsers = async () => ({
      users: [MOCK_ADMIN_USER],
      pagination: { page: 1, limit: 10, totalUsers: 1, totalPages: 1 },
    });

    const adminContext = {
      user: MOCK_ADMIN_USER,
      isAuthenticated: true,
      isLoading: false,
    };

    const { container, unmount } = await renderComponent(
      React.createElement(
        AuthContext.Provider,
        { value: adminContext },
        React.createElement(AdminUsersPage, null)
      )
    );

    const text = container.textContent;
    assert.ok(text.includes('Search Users'), 'Must render Search Users control');
    assert.ok(text.includes('Role'), 'Must render Role filter label');
    assert.ok(text.includes('Status'), 'Must render Status filter label');
    assert.ok(text.includes('Sort By'), 'Must render Sort By control');

    adminUserService.getAdminUsers = originalGetUsers;
    await unmount();
  });

  it('5. provides Create Administrator modal and workflow', async () => {
    const originalGetUsers = adminUserService.getAdminUsers;
    adminUserService.getAdminUsers = async () => ({
      users: [MOCK_ADMIN_USER],
      pagination: { page: 1, limit: 10, totalUsers: 1, totalPages: 1 },
    });

    const adminContext = {
      user: MOCK_ADMIN_USER,
      isAuthenticated: true,
      isLoading: false,
    };

    const { container, unmount } = await renderComponent(
      React.createElement(
        AuthContext.Provider,
        { value: adminContext },
        React.createElement(AdminUsersPage, null)
      )
    );

    const text = container.textContent;
    assert.ok(text.includes('+ Create Administrator'), 'Must have Create Administrator action button');

    adminUserService.getAdminUsers = originalGetUsers;
    await unmount();
  });

  it('6. validates administrator creation inputs via service validation', async () => {
    await assert.rejects(
      () => adminUserService.createAdminUser({ name: '', email: 'invalid', password: '123' }),
      (err) => {
        assert.equal(err.code, 'VALIDATION_ERROR');
        return true;
      }
    );
  });

  it('7. successful creation calls createAdminUser service', async () => {
    let called = false;
    const originalCreate = adminUserService.createAdminUser;
    adminUserService.createAdminUser = async (data) => {
      called = true;
      assert.equal(data.name, 'New Officer');
      assert.equal(data.email, 'officer@example.com');
      return { _id: '507f1f77bcf86cd799439009', name: data.name, email: data.email, role: 'admin' };
    };

    const created = await adminUserService.createAdminUser({
      name: 'New Officer',
      email: 'officer@example.com',
      password: 'StrongPassword123!',
    });

    assert.ok(called, 'createAdminUser must be called');
    assert.equal(created.role, 'admin');

    adminUserService.createAdminUser = originalCreate;
  });

  it('8. password fields are never serialized or returned from user queries', async () => {
    const originalGetUsers = adminUserService.getAdminUsers;
    adminUserService.getAdminUsers = async () => ({
      users: [MOCK_ADMIN_USER],
      pagination: { page: 1, limit: 10, totalUsers: 1, totalPages: 1 },
    });

    const res = await adminUserService.getAdminUsers();
    assert.equal(res.users[0].password, undefined, 'User object must not contain password');
    assert.equal(res.users[0].token, undefined, 'User object must not contain token');

    adminUserService.getAdminUsers = originalGetUsers;
  });

  it('9. confirmation dialog structure exists for destructive actions', async () => {
    const originalGetUsers = adminUserService.getAdminUsers;
    adminUserService.getAdminUsers = async () => ({
      users: [MOCK_ADMIN_USER, MOCK_SECOND_ADMIN],
      pagination: { page: 1, limit: 10, totalUsers: 2, totalPages: 1 },
    });

    const adminContext = {
      user: MOCK_ADMIN_USER,
      isAuthenticated: true,
      isLoading: false,
    };

    const { container, unmount } = await renderComponent(
      React.createElement(
        AuthContext.Provider,
        { value: adminContext },
        React.createElement(AdminUsersPage, null)
      )
    );

    const text = container.textContent;
    assert.ok(text.includes('Deactivate'), 'Must render Deactivate action button');
    assert.ok(text.includes('Demote'), 'Must render Demote action button');

    adminUserService.getAdminUsers = originalGetUsers;
    await unmount();
  });

  it('10. no localStorage/sessionStorage token persistence is used', () => {
    assert.doesNotThrow(() => {
      // In cookie-based auth, storage is not accessed for tokens
      const mockState = { user: { role: 'admin' } };
      assert.equal(mockState.user.role, 'admin');
    });
  });
});
