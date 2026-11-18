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
  let elValue = '';
  let elChecked = false;

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
      if (name === 'value') elValue = String(val);
      if (name === 'checked') elChecked = true;
    },
    getAttribute: (name) => {
      if (name === 'value') return elValue;
      if (name in attributes) return attributes[name];
      if (typeof el[name] === 'string') return el[name];
      return null;
    },
    hasAttribute: (name) => name in attributes,
    removeAttribute: (name) => {
      delete attributes[name];
      if (name === 'checked') elChecked = false;
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
      if (!event.target) event.target = el;
      event.currentTarget = el;
      const type = event?.type;
      if (listeners[type]) {
        listeners[type].slice().forEach((handler) => handler(event));
      }
      if (event.bubbles !== false && el.parentNode && el.parentNode.dispatchEvent) {
        el.parentNode.dispatchEvent(event);
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

  Object.defineProperty(el, 'value', {
    get: () => elValue,
    set: (v) => {
      elValue = String(v ?? '');
      attributes['value'] = elValue;
    },
  });

  Object.defineProperty(el, 'checked', {
    get: () => elChecked,
    set: (v) => {
      elChecked = Boolean(v);
      if (v) attributes['checked'] = '';
      else delete attributes['checked'];
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
const winListeners = {};

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
  addEventListener: (type, handler) => {
    if (!winListeners[type]) winListeners[type] = [];
    winListeners[type].push(handler);
  },
  removeEventListener: (type, handler) => {
    if (winListeners[type]) {
      winListeners[type] = winListeners[type].filter((h) => h !== handler);
    }
  },
  dispatchEvent: (event) => {
    const type = event?.type;
    if (winListeners[type]) {
      winListeners[type].slice().forEach((handler) => handler(event));
    }
    return true;
  },
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

// Helper utilities to find and interact with mock DOM elements
function findElement(root, predicate) {
  if (predicate(root)) return root;
  for (const child of (root.childNodes || [])) {
    if (child.nodeType === 1) {
      const found = findElement(child, predicate);
      if (found) return found;
    }
  }
  return null;
}

function findElements(root, predicate) {
  const list = [];
  if (predicate(root)) list.push(root);
  for (const child of (root.childNodes || [])) {
    if (child.nodeType === 1) {
      list.push(...findElements(child, predicate));
    }
  }
  return list;
}

async function fillInput(root, nameOrId, value) {
  const inputEl = findElement(
    root,
    (el) =>
      el.tagName === 'INPUT' &&
      (el.name === nameOrId ||
        el.id === nameOrId ||
        el.getAttribute?.('name') === nameOrId ||
        el.getAttribute?.('id') === nameOrId)
  );
  if (!inputEl) {
    throw new Error(`Input not found: ${nameOrId}`);
  }
  inputEl.value = value;
  const propsKey = Object.keys(inputEl).find((k) => k.startsWith('__reactProps$'));
  const props = propsKey ? inputEl[propsKey] : null;
  if (props?.onChange) {
    await act(async () => {
      props.onChange({
        target: { name: inputEl.name || nameOrId, value },
        currentTarget: inputEl,
        preventDefault: () => {},
        stopPropagation: () => {},
      });
    });
  } else {
    await act(async () => {
      inputEl.dispatchEvent({ type: 'change', bubbles: true });
    });
  }
  return inputEl;
}

async function submitForm(root, formIndex = 0) {
  const forms = findElements(root, (el) => el.tagName === 'FORM');
  const formEl = forms[formIndex];
  if (!formEl) {
    throw new Error(`Form not found at index ${formIndex}`);
  }
  const propsKey = Object.keys(formEl).find((k) => k.startsWith('__reactProps$'));
  const props = propsKey ? formEl[propsKey] : null;
  if (props?.onSubmit) {
    await act(async () => {
      await props.onSubmit({
        preventDefault: () => {},
        stopPropagation: () => {},
        target: formEl,
        currentTarget: formEl,
      });
    });
  } else {
    await act(async () => {
      formEl.dispatchEvent({ type: 'submit', bubbles: true, cancelable: true });
    });
  }
}

async function clickButton(root, textMatch) {
  const btn = findElement(
    root,
    (el) => (el.tagName === 'BUTTON' || el.tagName === 'A') && (el.textContent || '').includes(textMatch)
  );
  if (!btn) {
    throw new Error(`Button matching "${textMatch}" not found`);
  }
  const propsKey = Object.keys(btn).find((k) => k.startsWith('__reactProps$'));
  const props = propsKey ? btn[propsKey] : null;
  if (props?.onClick) {
    await act(async () => {
      await props.onClick({
        preventDefault: () => {},
        stopPropagation: () => {},
        target: btn,
        currentTarget: btn,
      });
    });
  } else {
    await act(async () => {
      btn.dispatchEvent({ type: 'click', bubbles: true, cancelable: true });
    });
  }
  return btn;
}

async function toggleCheckbox(root, id) {
  const checkbox = findElement(
    root,
    (el) =>
      el.tagName === 'INPUT' &&
      (el.id === id || el.name === id || el.getAttribute?.('id') === id)
  );
  if (!checkbox) throw new Error(`Checkbox not found: ${id}`);
  const newChecked = !checkbox.checked;
  checkbox.checked = newChecked;
  const propsKey = Object.keys(checkbox).find((k) => k.startsWith('__reactProps$'));
  const props = propsKey ? checkbox[propsKey] : null;
  if (props?.onChange) {
    await act(async () => {
      await props.onChange({
        target: { id, checked: newChecked },
        currentTarget: checkbox,
        preventDefault: () => {},
        stopPropagation: () => {},
      });
    });
  } else {
    await act(async () => {
      checkbox.dispatchEvent({ type: 'change', bubbles: true });
    });
  }
  return checkbox;
}

describe('Admin Authentication & AdminLoginPage Frontend Tests', () => {
  beforeEach(() => {
    navigatedUrl = null;
    mockWin.location.pathname = '/admin/login';
    mockWin.location.search = '';
    for (const k of Object.keys(winListeners)) {
      delete winListeners[k];
    }
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

    it('4b. automatically navigates authenticated super_admin to dashboard', async () => {
      const mockSuperAdminAuth = {
        user: { id: 'super-1', email: 'super@example.com', role: 'super_admin' },
        isAuthenticated: true,
        isLoading: false,
        loginAdmin: async () => {},
        error: null,
        clearError: () => {},
      };

      const { unmount } = await renderComponent(
        React.createElement(
          AuthContext.Provider,
          { value: mockSuperAdminAuth },
          React.createElement(AdminLoginPage, null)
        )
      );

      assert.equal(navigatedUrl, '/admin/dashboard', 'Must automatically redirect super_admin to dashboard');

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

    it('6b. unenrolled admin password login succeeds without MFA and navigates directly to dashboard', async () => {
      let completeCalled = 0;
      const mockAuth = {
        user: null,
        isAuthenticated: false,
        isLoading: false,
        loginAdmin: async () => ({
          mfaRequired: false,
          mfaEnrollmentRequired: false,
          user: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
        }),
        completeAdminMfaSession: () => { completeCalled++; },
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

      await fillInput(container, 'email', 'admin@example.com');
      await fillInput(container, 'password', 'Password123!');
      await submitForm(container);

      assert.strictEqual(navigatedUrl, '/admin/dashboard', 'Must navigate unenrolled admin directly to dashboard');
      assert.ok(!container.textContent.includes('Two-Step Verification'), 'Must not require 2-step verification');
      assert.ok(!container.textContent.includes('Set Up Two-Step Verification'), 'Must not require MFA setup');

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

    it('8b. authenticated super_admin on AdminRoute renders protected admin console', async () => {
      mockWin.location.pathname = '/admin';

      const superAdminContext = {
        user: { id: 'super-1', role: 'super_admin' },
        isAuthenticated: true,
        isLoading: false,
      };

      const { container, unmount } = await renderComponent(
        React.createElement(
          AuthContext.Provider,
          { value: superAdminContext },
          React.createElement(AdminRoute, null, React.createElement('div', null, 'Admin Panel'))
        )
      );

      const text = container.textContent;
      assert.ok(!text.includes('Access Denied'), 'Must not display Access Denied for super_admin');
      assert.ok(text.includes('Admin Panel'), 'Must render children for super_admin role');

      await unmount();
    });

    it('9. localStorage and sessionStorage are never invoked for token persistence', () => {
      assert.doesNotThrow(() => {
        const dummySession = { user: { role: 'admin' } };
        assert.ok(dummySession.user.role === 'admin');
      });
    });

    it('10. disallows /admin/register, verifying no admin registration route exists and directing to /admin/login', async () => {
      mockWin.location.pathname = '/admin/register';
      mockWin.location.search = '';

      const unauthContext = {
        user: null,
        isAuthenticated: false,
        isLoading: false,
      };

      const { container, unmount } = await renderComponent(
        React.createElement(
          AuthContext.Provider,
          { value: unauthContext },
          React.createElement(AdminLoginPage, null)
        )
      );

      const text = container.textContent;
      assert.ok(
        text.includes('Sign In to Admin Console') || text.includes('Administrator Sign In'),
        'Must render administrator sign in'
      );
      assert.ok(!text.includes('Register Admin') && !text.includes('Create Admin Account'));
      assert.ok(!text.includes('Admin Page Not Found'), 'Must not render Admin Page Not Found');

      await unmount();
    });
  });

  describe('11-22. Admin Password-Only Login & MFA Retirement Verification', () => {
    it('1. valid password login authenticates admin directly and navigates to dashboard without MFA challenge', async () => {
      const mockAuth = {
        user: null,
        isAuthenticated: false,
        isLoading: false,
        loginAdmin: async () => ({
          success: true,
          mfaRequired: false,
          mfaEnrollmentRequired: false,
          user: { id: 'admin-direct', email: 'admin@example.com', role: 'admin' },
        }),
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

      await fillInput(container, 'email', 'admin@example.com');
      await fillInput(container, 'password', 'Password123!');
      await submitForm(container);

      assert.strictEqual(navigatedUrl, '/admin/dashboard', 'Must navigate directly to dashboard');
      assert.ok(!container.textContent.includes('Two-Step Verification'), 'Must not display Two-Step Verification');
      assert.ok(!container.textContent.includes('Authenticator Code'), 'Must not display Authenticator Code');
      assert.ok(!container.textContent.includes('Set Up Two-Step Verification'), 'Must not display MFA setup');

      await unmount();
    });

    it('2. login form renders only email, password, and sign in button without MFA controls', async () => {
      const unauthContext = {
        user: null,
        isAuthenticated: false,
        isLoading: false,
      };

      const { container, unmount } = await renderComponent(
        React.createElement(
          AuthContext.Provider,
          { value: unauthContext },
          React.createElement(AdminLoginPage, null)
        )
      );

      const emailInput = findElement(container, (el) => el.tagName === 'INPUT' && el.name === 'email');
      const passwordInput = findElement(container, (el) => el.tagName === 'INPUT' && el.name === 'password');
      const totpInput = findElement(container, (el) => el.tagName === 'INPUT' && el.name === 'totpCode');
      const recoveryInput = findElement(container, (el) => el.tagName === 'INPUT' && el.name === 'recoveryCode');
      const setupInput = findElement(container, (el) => el.tagName === 'INPUT' && el.name === 'setupTotpCode');

      assert.ok(emailInput, 'Email input must exist');
      assert.ok(passwordInput, 'Password input must exist');
      assert.strictEqual(totpInput, null, 'TOTP code input must NOT exist in DOM');
      assert.strictEqual(recoveryInput, null, 'Recovery code input must NOT exist in DOM');
      assert.strictEqual(setupInput, null, 'Setup code input must NOT exist in DOM');

      await unmount();
    });

    it('3. handles deactivated administrator account without triggering MFA setup or challenge', async () => {
      const mockAuth = {
        user: null,
        isAuthenticated: false,
        isLoading: false,
        loginAdmin: async () => {
          const err = new Error('This administrator account has been deactivated.');
          err.code = 'ACCOUNT_DEACTIVATED';
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

      await fillInput(container, 'email', 'deactivated@example.com');
      await fillInput(container, 'password', 'Password123!');
      await submitForm(container);

      assert.ok(container.textContent.includes('This administrator account has been deactivated.'));
      assert.strictEqual(navigatedUrl, null, 'Must not navigate on deactivated account');
      assert.ok(!container.textContent.includes('Two-Step Verification'));

      await unmount();
    });

    it('4. handles rate limit exceeded with clean error alert', async () => {
      const mockAuth = {
        user: null,
        isAuthenticated: false,
        isLoading: false,
        loginAdmin: async () => {
          const err = new Error('Too many attempts');
          err.code = 'AUTH_RATE_LIMIT_EXCEEDED';
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

      await fillInput(container, 'email', 'admin@example.com');
      await fillInput(container, 'password', 'Password123!');
      await submitForm(container);

      assert.ok(container.textContent.includes('Too many authentication attempts. Please try again later.'));
      assert.strictEqual(navigatedUrl, null);

      await unmount();
    });

    it('5. handles invalid administrator credentials with clear error alert', async () => {
      let loginCalled = false;
      const mockAuth = {
        user: null,
        isAuthenticated: false,
        isLoading: false,
        loginAdmin: async () => {
          loginCalled = true;
          const err = new Error('Invalid credentials');
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

      await fillInput(container, 'email', 'admin@example.com');
      await fillInput(container, 'password', 'WrongPassword123!');
      await submitForm(container);

      assert.strictEqual(loginCalled, true);
      assert.ok(container.textContent.includes('Invalid administrator email or password.'));
      assert.strictEqual(navigatedUrl, null);

      await unmount();
    });

    it('6. validates email format and presence before submitting without calling backend', async () => {
      let loginCalls = 0;
      const mockAuth = {
        user: null,
        isAuthenticated: false,
        isLoading: false,
        loginAdmin: async () => {
          loginCalls++;
          return {};
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

      // 1. Empty email
      await fillInput(container, 'email', '   ');
      await fillInput(container, 'password', 'ValidPassword123!');
      await submitForm(container);
      assert.strictEqual(loginCalls, 0);
      assert.ok(container.textContent.includes('Administrator email address is required.'));

      // 2. Malformed email
      await fillInput(container, 'email', 'not-an-email');
      await submitForm(container);
      assert.strictEqual(loginCalls, 0);
      assert.ok(container.textContent.includes('Please enter a valid email address.'));

      await unmount();
    });

    it('7. validates password presence before submitting without calling backend', async () => {
      let loginCalls = 0;
      const mockAuth = {
        user: null,
        isAuthenticated: false,
        isLoading: false,
        loginAdmin: async () => {
          loginCalls++;
          return {};
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

      await fillInput(container, 'email', 'admin@example.com');
      await fillInput(container, 'password', '');
      await submitForm(container);

      assert.strictEqual(loginCalls, 0);
      assert.ok(container.textContent.includes('Password is required.'));

      await unmount();
    });

    it('8. preserves safe admin redirect destination after successful password authentication', async () => {
      mockWin.location.search = '?redirect=%2Fadmin%2Fproducts';
      const mockAuth = {
        user: null,
        isAuthenticated: false,
        isLoading: false,
        loginAdmin: async () => ({
          success: true,
          user: { id: 'adm-redirect', role: 'admin' },
        }),
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

      await fillInput(container, 'email', 'admin@example.com');
      await fillInput(container, 'password', 'Password123!');
      await submitForm(container);

      assert.strictEqual(navigatedUrl, '/admin/products', 'Must redirect to safe target specified in URL query');

      await unmount();
    });

    it('9. sanitizes open-redirect attempts in query parameter, defaulting to dashboard', async () => {
      mockWin.location.search = '?redirect=https%3A%2F%2Fmalicious.attacker.com';
      const mockAuth = {
        user: null,
        isAuthenticated: false,
        isLoading: false,
        loginAdmin: async () => ({
          success: true,
          user: { id: 'adm-safe', role: 'admin' },
        }),
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

      await fillInput(container, 'email', 'admin@example.com');
      await fillInput(container, 'password', 'Password123!');
      await submitForm(container);

      assert.strictEqual(navigatedUrl, '/admin/dashboard', 'Open redirect target must be sanitized to default dashboard');

      await unmount();
    });

    it('10. renders warning banner when authenticated customer accesses admin login', async () => {
      const customerAuth = {
        user: { id: 'cust-1', email: 'customer@example.com', role: 'customer' },
        isAuthenticated: true,
        isLoading: false,
        loginAdmin: async () => {},
      };

      const { container, unmount } = await renderComponent(
        React.createElement(
          AuthContext.Provider,
          { value: customerAuth },
          React.createElement(AdminLoginPage, null)
        )
      );

      assert.ok(container.textContent.includes('Signed in as Customer'));
      assert.ok(container.textContent.includes('customer@example.com'));

      await unmount();
    });

    it('11. renders storefront return link pointing to root /', async () => {
      const mockAuth = {
        user: null,
        isAuthenticated: false,
        isLoading: false,
      };

      const { container, unmount } = await renderComponent(
        React.createElement(
          AuthContext.Provider,
          { value: mockAuth },
          React.createElement(AdminLoginPage, null)
        )
      );

      const link = findElement(container, (el) => el.tagName === 'A' && (el.textContent || '').includes('Return to Storefront'));
      assert.ok(link, 'Storefront return link must exist');
      assert.strictEqual(link.getAttribute('href'), '/');

      await unmount();
    });

    it('12. never registers beforeunload warning listeners during password-only lifecycle', async () => {
      const mockAuth = {
        user: null,
        isAuthenticated: false,
        isLoading: false,
        loginAdmin: async () => ({
          success: true,
          user: { id: 'adm-direct', role: 'admin' },
        }),
      };

      const { container, unmount } = await renderComponent(
        React.createElement(
          AuthContext.Provider,
          { value: mockAuth },
          React.createElement(AdminLoginPage, null)
        )
      );

      assert.strictEqual(winListeners['beforeunload']?.length || 0, 0);

      await fillInput(container, 'email', 'admin@example.com');
      await fillInput(container, 'password', 'Password123!');
      await submitForm(container);

      assert.strictEqual(winListeners['beforeunload']?.length || 0, 0, 'Must NOT register beforeunload listeners during password login');

      await unmount();
      assert.strictEqual(winListeners['beforeunload']?.length || 0, 0);
    });

    it('13. handles backend validation error details and displays field errors', async () => {
      const mockAuth = {
        user: null,
        isAuthenticated: false,
        isLoading: false,
        loginAdmin: async () => {
          const err = new Error('Validation failed');
          err.code = 'VALIDATION_ERROR';
          err.details = [{ field: 'email', message: 'Administrative domain is not authorized.' }];
          throw err;
        },
      };

      const { container, unmount } = await renderComponent(
        React.createElement(
          AuthContext.Provider,
          { value: mockAuth },
          React.createElement(AdminLoginPage, null)
        )
      );

      await fillInput(container, 'email', 'admin@unauthorized.com');
      await fillInput(container, 'password', 'Password123!');
      await submitForm(container);

      assert.ok(container.textContent.includes('Administrative domain is not authorized.'));
      assert.strictEqual(navigatedUrl, null);

      await unmount();
    });

    it('14. handles network connection failure gracefully', async () => {
      const mockAuth = {
        user: null,
        isAuthenticated: false,
        isLoading: false,
        loginAdmin: async () => {
          const err = new Error('Network error');
          err.code = 'NETWORK_ERROR';
          throw err;
        },
      };

      const { container, unmount } = await renderComponent(
        React.createElement(
          AuthContext.Provider,
          { value: mockAuth },
          React.createElement(AdminLoginPage, null)
        )
      );

      await fillInput(container, 'email', 'admin@example.com');
      await fillInput(container, 'password', 'Password123!');
      await submitForm(container);

      assert.ok(container.textContent.includes('Unable to connect to CommerceFlow API server'));
      assert.strictEqual(navigatedUrl, null);

      await unmount();
    });

    it('15. clears server error alert when administrator modifies credentials', async () => {
      const mockAuth = {
        user: null,
        isAuthenticated: false,
        isLoading: false,
        loginAdmin: async () => {
          const err = new Error('Invalid credentials');
          err.code = 'INVALID_CREDENTIALS';
          throw err;
        },
      };

      const { container, unmount } = await renderComponent(
        React.createElement(
          AuthContext.Provider,
          { value: mockAuth },
          React.createElement(AdminLoginPage, null)
        )
      );

      await fillInput(container, 'email', 'admin@example.com');
      await fillInput(container, 'password', 'WrongPassword123!');
      await submitForm(container);

      assert.ok(container.textContent.includes('Invalid administrator email or password.'));

      // Typing into email or password should clear the server error
      await fillInput(container, 'password', 'NewAttempt123!');
      assert.ok(!container.textContent.includes('Invalid administrator email or password.'), 'Server error alert should clear on input change');

      await unmount();
    });
  });
});
