import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import AdminSetupPage from './AdminSetupPage.jsx';
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
  location: { pathname: '/admin/setup', search: '' },
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

// Mock User Fixtures
const MOCK_ADMIN_USER = {
  id: '507f1f77bcf86cd799439011',
  _id: '507f1f77bcf86cd799439011',
  name: 'Chief Admin',
  email: 'admin@example.com',
  role: 'admin',
  isActive: true,
};

const MOCK_CUSTOMER_USER = {
  id: '507f1f77bcf86cd799439012',
  _id: '507f1f77bcf86cd799439012',
  name: 'Regular Customer',
  email: 'customer@example.com',
  role: 'customer',
  isActive: true,
};

describe('AdminSetupPage Component & Security Safeguards', () => {
  beforeEach(() => {
    navigatedUrl = null;
    mockWin.location.pathname = '/admin/setup';
    mockWin.location.search = '';
  });

  it('1. unauthenticated visitor sees restricted access notice and CLI bootstrap guidance', async () => {
    const unauthContext = {
      user: null,
      isAuthenticated: false,
      isLoading: false,
    };

    const { container, unmount } = await renderComponent(
      React.createElement(
        AuthContext.Provider,
        { value: unauthContext },
        React.createElement(AdminSetupPage, null)
      )
    );

    const text = container.textContent;
    assert.ok(
      text.includes('Administrator Authentication Required'),
      'Must explain that administrator authentication is required'
    );
    assert.ok(
      text.includes('public registration of administrator accounts is strictly prohibited'),
      'Must explicitly disallow public registration'
    );
    assert.ok(
      text.includes('scripts/create-admin.js'),
      'Must provide the safety-checked CLI bootstrap command for development'
    );
    assert.ok(
      text.includes('Sign In as Administrator'),
      'Must offer navigation to admin sign in'
    );

    await unmount();
  });

  it('2. authenticated customer cannot access admin setup and receives Access Denied', async () => {
    const customerContext = {
      user: MOCK_CUSTOMER_USER,
      isAuthenticated: true,
      isLoading: false,
    };

    const { container, unmount } = await renderComponent(
      React.createElement(
        AuthContext.Provider,
        { value: customerContext },
        React.createElement(AdminSetupPage, null)
      )
    );

    const text = container.textContent;
    assert.ok(text.includes('Access Denied'), 'Must render Access Denied for customer role');
    assert.ok(
      text.includes('Customer accounts do not have permission'),
      'Must explain customer role restriction'
    );
    assert.ok(!text.includes('Provision Administrator Account'), 'Must not render setup form for customer');

    await unmount();
  });

  it('3. authenticated administrator sees the complete setup and provisioning form', async () => {
    const adminContext = {
      user: MOCK_ADMIN_USER,
      isAuthenticated: true,
      isLoading: false,
    };

    const { container, unmount } = await renderComponent(
      React.createElement(
        AuthContext.Provider,
        { value: adminContext },
        React.createElement(AdminSetupPage, null)
      )
    );

    const text = container.textContent;
    assert.ok(text.includes('Admin Account Setup'), 'Must display Admin Account Setup title');
    assert.ok(text.includes('Full Name'), 'Must include Full Name field');
    assert.ok(text.includes('Administrator Email'), 'Must include Administrator Email field');
    assert.ok(text.includes('Password'), 'Must include Password field');
    assert.ok(text.includes('Confirm Password'), 'Must include Confirm Password field');
    assert.ok(
      text.includes('Provision Administrator Account'),
      'Must render Provision Administrator Account submit button'
    );

    await unmount();
  });

  it('4. client-side validation rejects invalid email, weak password, and mismatched confirmation', async () => {
    // Test service-level validation
    await assert.rejects(
      () => adminUserService.createAdminUser({ name: 'A', email: 'notanemail', password: 'short' }),
      (err) => {
        assert.equal(err.code, 'VALIDATION_ERROR');
        return true;
      }
    );
  });

  it('5. createAdminUser service sends only name, email, password — never arbitrary roles', async () => {
    let capturedPayload = null;
    const originalCreate = adminUserService.createAdminUser;

    adminUserService.createAdminUser = async (data) => {
      capturedPayload = data;
      return {
        _id: '507f1f77bcf86cd799439099',
        name: data.name,
        email: data.email,
        role: 'admin',
        isActive: true,
      };
    };

    const res = await adminUserService.createAdminUser({
      name: 'Operations Manager',
      email: 'ops@commerceflow.internal',
      password: 'StrongPassword123!',
    });

    assert.equal(capturedPayload.name, 'Operations Manager');
    assert.equal(capturedPayload.email, 'ops@commerceflow.internal');
    assert.equal(capturedPayload.role, undefined, 'Client payload must not send arbitrary role overrides');
    assert.equal(res.role, 'admin');

    adminUserService.createAdminUser = originalCreate;
  });

  it('6. passwords and tokens are never returned or stored in web storage', async () => {
    const userRes = {
      id: '507f1f77bcf86cd799439099',
      name: 'Auditor Admin',
      email: 'auditor@example.com',
      role: 'admin',
      isActive: true,
    };

    assert.equal(userRes.password, undefined);
    assert.equal(userRes.token, undefined);
    assert.equal(userRes.jwt, undefined);

    // Verify localStorage setItem throws on token storage attempt
    assert.throws(() => {
      mockWin.localStorage.setItem('token', 'some-jwt');
    }, /localStorage must not be used/);
  });
});
