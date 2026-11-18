import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import AdminSettingsPage from './AdminSettingsPage.jsx';
import {
  regenerateAdminMfaRecoveryCodes,
  disableAdminMfa,
  setupAdminMfa,
  activateAdminMfa,
  authService,
} from '../../features/auth/auth.service.js';
import { apiClient, ApiError } from '../../lib/apiClient.js';

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
      if (name === 'value') el.value = String(val);
    },
    getAttribute: (name) => {
      if (name in attributes) return attributes[name];
      if (el[name] !== undefined && typeof el[name] !== 'function') return String(el[name]);
      return null;
    },
    hasAttribute: (name) => (name in attributes) || (el[name] !== undefined && typeof el[name] !== 'function'),
    removeAttribute: (name) => {
      delete attributes[name];
    },
    closest: (selector) => {
      const tag = selector.toUpperCase();
      let cur = el;
      while (cur && cur.nodeType === 1) {
        if (cur.tagName === tag) return cur;
        cur = cur.parentNode;
      }
      return null;
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
    dispatchEvent: () => true,
    click: () => {
      const reactPropsKey = Object.keys(el).find((k) => k.startsWith('__reactProps$'));
      if (reactPropsKey) {
        if (el[reactPropsKey]?.onClick) {
          return el[reactPropsKey].onClick({ type: 'click', preventDefault: () => {}, stopPropagation: () => {} });
        }
        if (el[reactPropsKey]?.onChange) {
          return el[reactPropsKey].onChange({ type: 'change', target: el, preventDefault: () => {}, stopPropagation: () => {} });
        }
      }
      if (listeners['click']) {
        listeners['click'].forEach((fn) => fn({ type: 'click', preventDefault: () => {}, stopPropagation: () => {} }));
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

const docListeners = {};
const winListeners = {};
let mockConfirmResponse = true;
let lastConfirmMessage = null;
const historyPushed = [];

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
    addEventListener: (type, fn, options) => {
      const isCapture = typeof options === 'boolean' ? options : Boolean(options?.capture);
      if (!docListeners[type]) docListeners[type] = [];
      docListeners[type].push({ fn, isCapture });
    },
    removeEventListener: (type, fn, options) => {
      const isCapture = typeof options === 'boolean' ? options : Boolean(options?.capture);
      if (docListeners[type]) {
        docListeners[type] = docListeners[type].filter(
          (l) => l.fn !== fn || l.isCapture !== isCapture
        );
      }
    },
    dispatchEvent: (event) => {
      const listeners = docListeners[event.type] || [];
      for (const { fn } of [...listeners]) {
        if (event._immediatePropagationStopped) break;
        fn(event);
      }
      return !event.defaultPrevented;
    },
  };
  return doc;
}

let lastCopiedText = null;
let clipboardShouldFail = false;

const mockStorage = (() => {
  let store = {};
  return {
    getItem: (k) => store[k] || null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (i) => Object.keys(store)[i] || null,
    _getRaw: () => store,
  };
})();

const mockDoc = createMockDocument();
const mockWin = {
  document: mockDoc,
  Node: MockNode,
  Element: MockElement,
  HTMLElement: MockHTMLElement,
  HTMLIFrameElement: MockHTMLIFrameElement,
  location: { pathname: '/admin/settings', search: '' },
  history: {
    pushState: (state, title, url) => {
      historyPushed.push({ state, title, url });
      if (url) {
        mockWin.location.pathname = url.split('?')[0];
        mockWin.location.search = url.includes('?') ? '?' + url.split('?')[1] : '';
      }
    },
    replaceState: (state, title, url) => {
      if (url) {
        mockWin.location.pathname = url.split('?')[0];
        mockWin.location.search = url.includes('?') ? '?' + url.split('?')[1] : '';
      }
    },
  },
  innerWidth: 1200,
  scrollTo: () => {},
  addEventListener: (type, fn, options) => {
    const isCapture = typeof options === 'boolean' ? options : Boolean(options?.capture);
    if (!winListeners[type]) winListeners[type] = [];
    winListeners[type].push({ fn, isCapture });
  },
  removeEventListener: (type, fn, options) => {
    const isCapture = typeof options === 'boolean' ? options : Boolean(options?.capture);
    if (winListeners[type]) {
      winListeners[type] = winListeners[type].filter(
        (l) => l.fn !== fn || l.isCapture !== isCapture
      );
    }
  },
  dispatchEvent: (event) => {
    const listeners = winListeners[event.type] || [];
    for (const { fn } of [...listeners]) {
      if (event._immediatePropagationStopped) break;
      fn(event);
    }
    return !event.defaultPrevented;
  },
  confirm: (msg) => {
    lastConfirmMessage = msg;
    return mockConfirmResponse;
  },
  navigator: {
    clipboard: {
      writeText: async (text) => {
        if (clipboardShouldFail) {
          throw new Error('Clipboard access denied by browser policy');
        }
        lastCopiedText = text;
      },
    },
  },
  localStorage: mockStorage,
  sessionStorage: mockStorage,
  Event: class MockEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.cancelable = Boolean(init.cancelable);
      this.defaultPrevented = false;
      this._propagationStopped = false;
      this._immediatePropagationStopped = false;
      this.returnValue = undefined;
    }
    preventDefault() {
      this.defaultPrevented = true;
    }
    stopPropagation() {
      this._propagationStopped = true;
    }
    stopImmediatePropagation() {
      this._immediatePropagationStopped = true;
      this._propagationStopped = true;
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

globalThis.window = mockWin;
globalThis.document = mockDoc;
globalThis.confirm = mockWin.confirm;
try {
  Object.defineProperty(globalThis, 'navigator', {
    value: mockWin.navigator,
    configurable: true,
    writable: true,
  });
} catch {
  if (globalThis.navigator) {
    globalThis.navigator.clipboard = mockWin.navigator.clipboard;
  }
}
globalThis.localStorage = mockWin.localStorage;
globalThis.sessionStorage = mockWin.sessionStorage;
globalThis.Event = mockWin.Event;
globalThis.CustomEvent = mockWin.CustomEvent;
globalThis.Node = MockNode;
globalThis.Element = MockElement;
globalThis.HTMLElement = MockHTMLElement;
globalThis.HTMLIFrameElement = MockHTMLIFrameElement;

function findElement(root, predicate) {
  if (!root) return null;
  if (predicate(root)) return root;
  for (const child of root.childNodes || []) {
    const found = findElement(child, predicate);
    if (found) return found;
  }
  return null;
}

function findAllElements(root, predicate) {
  const matches = [];
  if (!root) return matches;
  if (predicate(root)) matches.push(root);
  for (const child of root.childNodes || []) {
    matches.push(...findAllElements(child, predicate));
  }
  return matches;
}

function changeInput(el, value) {
  el.value = value;
  const reactPropsKey = Object.keys(el).find((k) => k.startsWith('__reactProps$'));
  if (reactPropsKey && el[reactPropsKey]?.onChange) {
    el[reactPropsKey].onChange({
      target: { value, checked: Boolean(value), name: el.getAttribute('name') },
      preventDefault: () => {},
      stopPropagation: () => {},
    });
  }
}

function changeCheckbox(el, checked) {
  el.checked = checked;
  const reactPropsKey = Object.keys(el).find((k) => k.startsWith('__reactProps$'));
  if (reactPropsKey && el[reactPropsKey]?.onChange) {
    el[reactPropsKey].onChange({
      target: { checked, value: el.value, name: el.getAttribute('name') },
      preventDefault: () => {},
      stopPropagation: () => {},
    });
  }
}

function simulateAnchorClick(anchor, options = {}) {
  const event = new mockWin.Event('click', { cancelable: true });
  event.target = anchor;
  event.ctrlKey = Boolean(options.ctrlKey);
  event.metaKey = Boolean(options.metaKey);
  event.shiftKey = Boolean(options.shiftKey);
  mockDoc.dispatchEvent(event);
  if (!event.defaultPrevented && !event._propagationStopped) {
    if (typeof anchor.click === 'function') {
      anchor.click();
    }
  }
  return event;
}

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

describe('AdminSettingsPage UI Integration Tests', () => {
  const mockSettingsData = {
    settings: {
      storeName: 'CommerceFlow Mountain',
      supportEmail: 'support@commerceflow.com',
      supportPhone: '+91 98765 43210',
      currency: 'INR',
      currencySymbol: '₹',
      freeShippingThreshold: 999,
      standardShippingRate: 99,
      lowStockThreshold: 5,
      returnWindowDays: 14,
      isMaintenanceMode: false,
    },
    systemInfo: {
      environment: 'development',
      apiVersion: 'v1',
      databaseStatus: 'connected',
      paymentGateway: 'Razorpay (Configured)',
    },
  };

  const mockService = {
    getStoreSettings: async () => mockSettingsData,
    updateStoreSettings: async (payload) => ({
      settings: { ...mockSettingsData.settings, ...payload },
      systemInfo: mockSettingsData.systemInfo,
    }),
  };

  it('renders page header and store profile form fields', async () => {
    const { container, unmount } = await renderComponent(
      <AdminSettingsPage settingsService={mockService} />
    );

    const text = container.textContent;
    assert.ok(text.includes('Store Settings'), 'Should display page title');
    assert.ok(text.includes('Store Profile'), 'Should display Store Profile tab');
    assert.ok(text.includes('Website Branding'), 'Should display Website Branding tab');
    assert.ok(text.includes('Announcement Bar'), 'Should display Announcement Bar tab');
    assert.ok(text.includes('Fulfillment & Returns'), 'Should display Fulfillment tab');
    assert.ok(text.includes('Inventory Alerts'), 'Should display Inventory Alerts tab');
    assert.ok(text.includes('Save Settings'), 'Should display save button');

    await unmount();
  });

  it('switches to Website Branding tab and opens reset confirmation modal', async () => {
    function findElement(root, predicate) {
      if (predicate(root)) return root;
      for (const child of root.childNodes || []) {
        const found = findElement(child, predicate);
        if (found) return found;
      }
      return null;
    }

    const mockCustomLogoService = {
      getStoreSettings: async () => ({
        settings: {
          ...mockSettingsData.settings,
          logoUrl: '/api/v1/settings/logo?v=173000',
          logoAlt: 'Custom Brand Mark',
        },
        systemInfo: mockSettingsData.systemInfo,
      }),
      resetLogo: async () => ({ logoUrl: null }),
    };

    const { container, unmount } = await renderComponent(
      <AdminSettingsPage settingsService={mockCustomLogoService} />
    );

    // Find and click the Website Branding tab button
    const brandingTabBtn = findElement(
      container,
      (el) => el.tagName === 'BUTTON' && el.textContent.includes('Website Branding')
    );
    assert.ok(brandingTabBtn, 'Website Branding tab button should be found');

    await act(async () => {
      brandingTabBtn.click();
    });

    const brandingText = container.textContent;
    assert.ok(brandingText.includes('Website Branding & Logo Management'), 'Should display branding section title');
    assert.ok(brandingText.includes('Current Published Logo'), 'Should display current logo section');
    assert.ok(brandingText.includes('Upload New Logo'), 'Should display upload dropzone');
    assert.ok(brandingText.includes('Reset to Default Logo'), 'Should display reset button');

    // Find and click the Reset to Default Logo button
    const resetBtn = findElement(
      container,
      (el) => el.tagName === 'BUTTON' && el.textContent.includes('Reset to Default Logo')
    );
    assert.ok(resetBtn, 'Reset to Default Logo button should be found');

    await act(async () => {
      resetBtn.click();
    });

    const modalText = container.textContent;
    assert.ok(modalText.includes('Reset Website Logo to Default?'), 'Should display reset confirmation modal title');
    assert.ok(modalText.includes('This will remove the custom branding asset'), 'Should explain reset consequences');
    assert.ok(modalText.includes('Confirm Reset'), 'Should display confirm reset action button');

    await unmount();
  });

  it('switches to Announcement Bar tab, previews announcement, and opens reset confirmation modal', async () => {
    function findElement(root, predicate) {
      if (predicate(root)) return root;
      for (const child of root.childNodes || []) {
        const found = findElement(child, predicate);
        if (found) return found;
      }
      return null;
    }

    const mockAnnouncementService = {
      getStoreSettings: async () => ({
        settings: {
          ...mockSettingsData.settings,
          announcementText: '🔥 Seasonal Flash Sale — 25% Off!',
        },
        systemInfo: mockSettingsData.systemInfo,
      }),
      updateStoreSettings: async (payload) => ({
        settings: { ...mockSettingsData.settings, ...payload },
        systemInfo: mockSettingsData.systemInfo,
      }),
      resetAnnouncement: async () => ({
        announcementText: '🏕️ Free shipping on orders over $50',
      }),
    };

    const { container, unmount } = await renderComponent(
      <AdminSettingsPage settingsService={mockAnnouncementService} />
    );

    // Find and click the Announcement Bar tab button
    const announcementTabBtn = findElement(
      container,
      (el) => el.tagName === 'BUTTON' && el.textContent.includes('Announcement Bar')
    );
    assert.ok(announcementTabBtn, 'Announcement Bar tab button should be found');

    await act(async () => {
      announcementTabBtn.click();
    });

    const announcementText = container.textContent;
    assert.ok(announcementText.includes('Storefront Announcement Bar'), 'Should display announcement section title');
    assert.ok(announcementText.includes('Live Storefront Preview'), 'Should display live preview title');
    assert.ok(announcementText.includes('🔥 Seasonal Flash Sale — 25% Off!'), 'Should display current announcement message in preview');
    assert.ok(announcementText.includes('Save Announcement'), 'Should display save announcement button');
    assert.ok(announcementText.includes('Reset to Default'), 'Should display reset announcement button');

    // Find and click the Reset to Default button
    const resetBtn = findElement(
      container,
      (el) => el.tagName === 'BUTTON' && el.textContent.includes('Reset to Default')
    );
    assert.ok(resetBtn, 'Reset to Default button should be found');

    await act(async () => {
      resetBtn.click();
    });

    const modalText = container.textContent;
    assert.ok(modalText.includes('Reset Announcement to Default?'), 'Should display reset confirmation modal title');
    assert.ok(modalText.includes('🏕️ Free shipping on orders over $50'), 'Should explain default message in modal');
    assert.ok(modalText.includes('Confirm Reset'), 'Should display confirm reset action button');

    await unmount();
  });


  it('renders error state on API failure', async () => {
    const failingService = {
      getStoreSettings: async () => {
        throw new Error('Connection refused');
      },
    };

    const { container, unmount } = await renderComponent(
      <AdminSettingsPage settingsService={failingService} />
    );

    const text = container.textContent;
    assert.ok(text.includes('Could not load settings'), 'Should display error title');
    assert.ok(text.includes('Connection refused'), 'Should display error message');

    await unmount();
  });
});

describe('auth.service.js — regenerateAdminMfaRecoveryCodes contract', () => {
  const originalPost = apiClient.post;

  beforeEach(() => {
    mockStorage.clear();
    lastCopiedText = null;
    clipboardShouldFail = false;
  });

  it('regenerateAdminMfaRecoveryCodes is exported both standalone and on authService', () => {
    assert.equal(typeof regenerateAdminMfaRecoveryCodes, 'function', 'Should export standalone function');
    assert.equal(typeof authService.regenerateAdminMfaRecoveryCodes, 'function', 'Should export on authService');
  });

  it('calls users/admin/mfa/recovery/regenerate with password and totpCode in TOTP mode', async () => {
    let capturedEndpoint = null;
    let capturedBody = null;
    let capturedOptions = null;

    apiClient.post = async (endpoint, body, options) => {
      capturedEndpoint = endpoint;
      capturedBody = body;
      capturedOptions = options;
      return {
        success: true,
        data: {
          recoveryCodes: [
            '1111-2222-3333-4444',
            '5555-6666-7777-8888',
            '9999-AAAA-BBBB-CCCC',
            'DDDD-EEEE-FFFF-0000',
            '1234-5678-90AB-CDEF',
            'GHIJ-KLMN-OPQR-STUV',
            'WXYZ-2345-6789-ABCD',
            'EFGH-JKMN-PQRT-VWXY',
          ],
        },
      };
    };

    try {
      const result = await regenerateAdminMfaRecoveryCodes({
        password: 'AdminSecretPassword!1',
        totpCode: '123456',
      });

      assert.equal(capturedEndpoint, 'users/admin/mfa/recovery/regenerate', 'Must call correct backend endpoint');
      assert.deepEqual(capturedBody, {
        password: 'AdminSecretPassword!1',
        totpCode: '123456',
      }, 'Must submit only password and totpCode');
      assert.equal(capturedOptions, undefined, 'Must not pass token: null override so ambient cookie is used');
      assert.equal(result.recoveryCodes.length, 8, 'Must return 8 recovery codes');
    } finally {
      apiClient.post = originalPost;
    }
  });

  it('calls users/admin/mfa/recovery/regenerate with password and recoveryCode in recovery mode', async () => {
    let capturedEndpoint = null;
    let capturedBody = null;

    apiClient.post = async (endpoint, body) => {
      capturedEndpoint = endpoint;
      capturedBody = body;
      return {
        success: true,
        data: {
          recoveryCodes: [
            'CODE-A', 'CODE-B', 'CODE-C', 'CODE-D',
            'CODE-E', 'CODE-F', 'CODE-G', 'CODE-H',
          ],
        },
      };
    };

    try {
      const result = await regenerateAdminMfaRecoveryCodes({
        password: 'AdminSecretPassword!1',
        recoveryCode: 'OLD-RECOVERY-CODE-1',
      });

      assert.equal(capturedEndpoint, 'users/admin/mfa/recovery/regenerate');
      assert.deepEqual(capturedBody, {
        password: 'AdminSecretPassword!1',
        recoveryCode: 'OLD-RECOVERY-CODE-1',
      }, 'Must submit only password and recoveryCode');
      assert.equal(result.recoveryCodes.length, 8);
    } finally {
      apiClient.post = originalPost;
    }
  });

  it('propagates ApiError on backend failure without swallowing', async () => {
    apiClient.post = async () => {
      throw new ApiError({
        status: 401,
        code: 'INVALID_CURRENT_PASSWORD',
        message: 'Invalid administrator password',
      });
    };

    try {
      await assert.rejects(
        async () => {
          await regenerateAdminMfaRecoveryCodes({
            password: 'wrongPassword',
            totpCode: '123456',
          });
        },
        (err) => {
          assert.equal(err.code, 'INVALID_CURRENT_PASSWORD');
          assert.equal(err.status, 401);
          return true;
        }
      );
    } finally {
      apiClient.post = originalPost;
    }
  });

  it('does not write recovery codes, passwords, or tokens to localStorage or sessionStorage', async () => {
    apiClient.post = async () => ({
      success: true,
      data: {
        recoveryCodes: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8'],
      },
    });

    try {
      await regenerateAdminMfaRecoveryCodes({
        password: 'SecretPassword',
        totpCode: '654321',
      });

      assert.equal(mockStorage.length, 0, 'No keys must be written to browser storage');
    } finally {
      apiClient.post = originalPost;
    }
  });

  it('rejects with ApiError when both totpCode and recoveryCode are supplied without making network call', async () => {
    let callCount = 0;
    apiClient.post = async () => {
      callCount++;
      return { success: true };
    };

    try {
      await assert.rejects(
        async () => {
          await regenerateAdminMfaRecoveryCodes({
            password: 'AdminPassword!123',
            totpCode: '123456',
            recoveryCode: 'REC-1234-5678',
          });
        },
        (err) => {
          assert.equal(err.name, 'ApiError');
          assert.equal(err.status, 400);
          assert.equal(err.code, 'VALIDATION_ERROR');
          assert.ok(err.message.includes('Conflicting authentication factors'));
          assert.equal(err.details[0].field, 'stepUp');
          return true;
        }
      );
      assert.equal(callCount, 0, 'Must NOT make any network request when conflicting factors are provided');
    } finally {
      apiClient.post = originalPost;
    }
  });

  it('does not reject when one factor is valid and the other is empty or whitespace string', async () => {
    let capturedBody = null;
    apiClient.post = async (endpoint, body) => {
      capturedBody = body;
      return {
        success: true,
        data: {
          recoveryCodes: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8'],
        },
      };
    };

    try {
      const res = await regenerateAdminMfaRecoveryCodes({
        password: 'AdminPassword!123',
        totpCode: '123456',
        recoveryCode: '   ',
      });
      assert.equal(res.recoveryCodes.length, 8);
      assert.deepEqual(capturedBody, {
        password: 'AdminPassword!123',
        totpCode: '123456',
      });
    } finally {
      apiClient.post = originalPost;
    }
  });
});

describe('auth.service.js — disableAdminMfa contract', () => {
  const originalPost = apiClient.post;

  beforeEach(() => {
    mockStorage.clear();
    lastCopiedText = null;
    clipboardShouldFail = false;
  });

  it('disableAdminMfa is exported both standalone and on authService', () => {
    assert.equal(typeof disableAdminMfa, 'function', 'Should export standalone function');
    assert.equal(typeof authService.disableAdminMfa, 'function', 'Should export on authService');
  });

  it('calls users/admin/mfa/disable with password and totpCode in TOTP mode', async () => {
    let capturedEndpoint = null;
    let capturedBody = null;
    let capturedOptions = null;

    apiClient.post = async (endpoint, body, options) => {
      capturedEndpoint = endpoint;
      capturedBody = body;
      capturedOptions = options;
      return {
        success: true,
        data: {
          user: { id: 'admin1', email: 'admin@example.com', twoFactorEnabled: false },
        },
      };
    };

    try {
      const result = await disableAdminMfa({
        password: 'AdminPassword!1',
        totpCode: '123456',
      });

      assert.equal(capturedEndpoint, 'users/admin/mfa/disable', 'Must call correct backend endpoint');
      assert.deepEqual(capturedBody, {
        password: 'AdminPassword!1',
        totpCode: '123456',
      }, 'Must submit only password and totpCode');
      assert.equal(capturedOptions, undefined, 'Must not pass token: null override so ambient cookie is used');
      assert.equal(result.user.twoFactorEnabled, false, 'Must return updated user');
    } finally {
      apiClient.post = originalPost;
    }
  });

  it('calls users/admin/mfa/disable with password and recoveryCode in recovery mode', async () => {
    let capturedEndpoint = null;
    let capturedBody = null;

    apiClient.post = async (endpoint, body) => {
      capturedEndpoint = endpoint;
      capturedBody = body;
      return {
        success: true,
        data: {
          user: { id: 'admin1', email: 'admin@example.com', twoFactorEnabled: false },
        },
      };
    };

    try {
      const result = await disableAdminMfa({
        password: 'AdminPassword!1',
        recoveryCode: 'REC-CODE-1234-5678',
      });

      assert.equal(capturedEndpoint, 'users/admin/mfa/disable');
      assert.deepEqual(capturedBody, {
        password: 'AdminPassword!1',
        recoveryCode: 'REC-CODE-1234-5678',
      }, 'Must submit only password and recoveryCode');
      assert.equal(result.user.twoFactorEnabled, false);
    } finally {
      apiClient.post = originalPost;
    }
  });

  it('propagates ApiError on backend failure without swallowing', async () => {
    apiClient.post = async () => {
      throw new ApiError({
        status: 401,
        code: 'INVALID_CURRENT_PASSWORD',
        message: 'Invalid administrator password',
      });
    };

    try {
      await assert.rejects(
        async () => {
          await disableAdminMfa({
            password: 'wrongPassword',
            totpCode: '123456',
          });
        },
        (err) => {
          assert.equal(err.code, 'INVALID_CURRENT_PASSWORD');
          assert.equal(err.status, 401);
          return true;
        }
      );
    } finally {
      apiClient.post = originalPost;
    }
  });

  it('does not write passwords or codes to localStorage or sessionStorage on disable', async () => {
    apiClient.post = async () => ({
      success: true,
      data: {
        user: { id: 'admin1', twoFactorEnabled: false },
      },
    });

    try {
      await disableAdminMfa({
        password: 'SecretPassword',
        totpCode: '654321',
      });

      assert.equal(mockStorage.length, 0, 'No keys must be written to browser storage');
    } finally {
      apiClient.post = originalPost;
    }
  });

  it('rejects with ApiError when both totpCode and recoveryCode are supplied without making network call', async () => {
    let callCount = 0;
    apiClient.post = async () => {
      callCount++;
      return { success: true };
    };

    try {
      await assert.rejects(
        async () => {
          await disableAdminMfa({
            password: 'AdminPassword!123',
            totpCode: '123456',
            recoveryCode: 'REC-1234-5678',
          });
        },
        (err) => {
          assert.equal(err.name, 'ApiError');
          assert.equal(err.status, 400);
          assert.equal(err.code, 'VALIDATION_ERROR');
          assert.ok(err.message.includes('Conflicting authentication factors'));
          return true;
        }
      );
      assert.equal(callCount, 0, 'Must NOT make any network request when conflicting factors are provided');
    } finally {
      apiClient.post = originalPost;
    }
  });

  it('rejects with ApiError when neither totpCode nor recoveryCode is supplied', async () => {
    let callCount = 0;
    apiClient.post = async () => {
      callCount++;
      return { success: true };
    };

    try {
      await assert.rejects(
        async () => {
          await disableAdminMfa({
            password: 'AdminPassword!123',
          });
        },
        (err) => {
          assert.equal(err.name, 'ApiError');
          assert.equal(err.status, 400);
          assert.equal(err.code, 'VALIDATION_ERROR');
          assert.ok(err.message.includes('Must provide either totpCode or recoveryCode'));
          return true;
        }
      );
      assert.equal(callCount, 0, 'Must NOT make any network request when no second factor is provided');
    } finally {
      apiClient.post = originalPost;
    }
  });
});

describe('AdminSettingsPage — Admin MFA Recovery-Code Regeneration UI', () => {
  const mockSettingsData = {
    settings: {
      storeName: 'CommerceFlow Mountain',
      supportEmail: 'support@commerceflow.com',
      supportPhone: '+91 98765 43210',
      currency: 'INR',
      currencySymbol: '₹',
      freeShippingThreshold: 999,
      standardShippingRate: 99,
      lowStockThreshold: 5,
      returnWindowDays: 14,
      isMaintenanceMode: false,
    },
    systemInfo: {
      environment: 'development',
      apiVersion: 'v1',
      databaseStatus: 'connected',
      paymentGateway: 'Razorpay (Configured)',
    },
  };

  const mockSettingsService = {
    getStoreSettings: async () => mockSettingsData,
    updateStoreSettings: async (payload) => ({
      settings: { ...mockSettingsData.settings, ...payload },
      systemInfo: mockSettingsData.systemInfo,
    }),
  };

  const sampleCodes = [
    '2J4K-7M9P-4T6W',
    '3B8D-5F7H-9K2L',
    '8N1Q-3R5S-7U9V',
    '5W7X-9Y2Z-4A6B',
    '9C1D-3E5F-7G8H',
    '6J8K-2M4N-6P7Q',
    '1R3S-5T7U-9V2W',
    '7X9Y-2Z4A-6B8C',
  ];

  beforeEach(() => {
    mockStorage.clear();
    lastCopiedText = null;
    clipboardShouldFail = false;
    mockConfirmResponse = true;
    lastConfirmMessage = null;
    historyPushed.length = 0;
    mockWin.location.pathname = '/admin/settings';
    mockWin.location.search = '';
    for (const k of Object.keys(docListeners)) delete docListeners[k];
    for (const k of Object.keys(winListeners)) delete winListeners[k];
  });

  it('renders Security Settings tab and switches to security panel', async () => {
    const { container, unmount } = await renderComponent(
      <AdminSettingsPage settingsService={mockSettingsService} />
    );

    const securityTabBtn = findElement(
      container,
      (el) => el.tagName === 'BUTTON' && el.textContent.includes('Security Settings')
    );
    assert.ok(securityTabBtn, 'Should render Security Settings tab button');

    await act(async () => {
      securityTabBtn.click();
    });

    const text = container.textContent;
    assert.ok(text.includes('Administrator Security & MFA Recovery'), 'Should display security section header');
    assert.ok(text.includes('MFA Active & Enforced'), 'Should display MFA active badge');
    assert.ok(text.includes('Regenerate Emergency Recovery Codes'), 'Should display regenerate codes section');
    assert.ok(text.includes('Current Administrator Password'), 'Should render password field');
    assert.ok(text.includes('Authenticator App (TOTP)'), 'Should render TOTP radio option');
    assert.ok(text.includes('Existing Recovery Code'), 'Should render Recovery Code radio option');

    await unmount();
  });

  it('navigates directly to security tab via initialTab="security"', async () => {
    const { container, unmount } = await renderComponent(
      <AdminSettingsPage settingsService={mockSettingsService} initialTab="security" />
    );

    const text = container.textContent;
    assert.ok(text.includes('Administrator Security & MFA Recovery'), 'Should open security tab directly');
    await unmount();
  });

  it('navigates directly to security tab via window.location pathname "/admin/settings/security"', async () => {
    mockWin.location.pathname = '/admin/settings/security';

    const { container, unmount } = await renderComponent(
      <AdminSettingsPage settingsService={mockSettingsService} />
    );

    const text = container.textContent;
    assert.ok(text.includes('Administrator Security & MFA Recovery'), 'Should detect /admin/settings/security pathname');
    await unmount();
  });

  it('requires administrator current password before submitting', async () => {
    let authServiceCalled = false;
    const mockAuthService = {
      regenerateAdminMfaRecoveryCodes: async () => {
        authServiceCalled = true;
        return { recoveryCodes: sampleCodes };
      },
    };

    const { container, unmount } = await renderComponent(
      <AdminSettingsPage
        settingsService={mockSettingsService}
        authService={mockAuthService}
        initialTab="security"
      />
    );

    const submitBtn = findElement(
      container,
      (el) => el.tagName === 'BUTTON' && el.textContent.includes('Regenerate Recovery Codes')
    );
    assert.ok(submitBtn, 'Submit button should be found');

    await act(async () => {
      submitBtn.click();
    });

    const text = container.textContent;
    assert.ok(text.includes('Current administrator password is required.'), 'Should display password required error');
    assert.equal(authServiceCalled, false, 'Auth service must not be called when password is missing');

    await unmount();
  });

  it('validates TOTP code requirements in TOTP mode', async () => {
    let authServiceCalled = false;
    const mockAuthService = {
      regenerateAdminMfaRecoveryCodes: async () => {
        authServiceCalled = true;
        return { recoveryCodes: sampleCodes };
      },
    };

    const { container, unmount } = await renderComponent(
      <AdminSettingsPage
        settingsService={mockSettingsService}
        authService={mockAuthService}
        initialTab="security"
      />
    );

    const passwordInput = findElement(
      container,
      (el) => el.tagName === 'INPUT' && el.getAttribute('type') === 'password'
    );
    const submitBtn = findElement(
      container,
      (el) => el.tagName === 'BUTTON' && el.textContent.includes('Regenerate Recovery Codes')
    );

    // Enter password, leave TOTP empty
    await act(async () => {
      changeInput(passwordInput, 'ValidPassword#123');
    });

    await act(async () => {
      submitBtn.click();
    });

    assert.ok(container.textContent.includes('A 6-digit authenticator code is required.'));
    assert.equal(authServiceCalled, false);

    // Enter non-6-digit TOTP
    const totpInput = findElement(
      container,
      (el) => el.tagName === 'INPUT' && el.getAttribute('name') === 'totpCode'
    );

    await act(async () => {
      changeInput(totpInput, '123');
    });

    await act(async () => {
      submitBtn.click();
    });

    assert.ok(container.textContent.includes('Please enter a valid 6-digit numeric authenticator code.'));
    assert.equal(authServiceCalled, false);

    await unmount();
  });

  it('submits only password and totpCode in TOTP mode', async () => {
    let submittedPayload = null;
    const mockAuthService = {
      regenerateAdminMfaRecoveryCodes: async (payload) => {
        submittedPayload = payload;
        return { recoveryCodes: sampleCodes };
      },
    };

    const { container, unmount } = await renderComponent(
      <AdminSettingsPage
        settingsService={mockSettingsService}
        authService={mockAuthService}
        initialTab="security"
      />
    );

    const passwordInput = findElement(
      container,
      (el) => el.tagName === 'INPUT' && el.getAttribute('type') === 'password'
    );
    const totpInput = findElement(
      container,
      (el) => el.tagName === 'INPUT' && el.getAttribute('name') === 'totpCode'
    );
    const submitBtn = findElement(
      container,
      (el) => el.tagName === 'BUTTON' && el.textContent.includes('Regenerate Recovery Codes')
    );

    await act(async () => {
      changeInput(passwordInput, 'AdminSuperPassword!2026');
      changeInput(totpInput, '654321');
    });

    await act(async () => {
      submitBtn.click();
    });

    assert.deepEqual(submittedPayload, {
      password: 'AdminSuperPassword!2026',
      totpCode: '654321',
    }, 'Must submit only password and totpCode');
    assert.equal(submittedPayload.recoveryCode, undefined, 'Must not submit recoveryCode');

    await unmount();
  });

  it('submits only password and recoveryCode in recovery mode', async () => {
    let submittedPayload = null;
    const mockAuthService = {
      regenerateAdminMfaRecoveryCodes: async (payload) => {
        submittedPayload = payload;
        return { recoveryCodes: sampleCodes };
      },
    };

    const { container, unmount } = await renderComponent(
      <AdminSettingsPage
        settingsService={mockSettingsService}
        authService={mockAuthService}
        initialTab="security"
      />
    );

    // Switch to recovery code mode
    const recoveryRadio = findElement(
      container,
      (el) => el.tagName === 'INPUT' && el.getAttribute('id') === 'step-up-recovery'
    );
    assert.ok(recoveryRadio, 'Recovery mode radio should be found');

    await act(async () => {
      recoveryRadio.click();
    });

    const passwordInput = findElement(
      container,
      (el) => el.tagName === 'INPUT' && el.getAttribute('type') === 'password'
    );
    const recoveryInput = findElement(
      container,
      (el) => el.tagName === 'INPUT' && el.getAttribute('name') === 'recoveryCode'
    );
    const submitBtn = findElement(
      container,
      (el) => el.tagName === 'BUTTON' && el.textContent.includes('Regenerate Recovery Codes')
    );

    await act(async () => {
      changeInput(passwordInput, 'AdminSuperPassword!2026');
      changeInput(recoveryInput, 'OLD-CODE-1234-5678');
    });

    await act(async () => {
      submitBtn.click();
    });

    assert.deepEqual(submittedPayload, {
      password: 'AdminSuperPassword!2026',
      recoveryCode: 'OLD-CODE-1234-5678',
    }, 'Must submit only password and recoveryCode');
    assert.equal(submittedPayload.totpCode, undefined, 'Must not submit totpCode');

    await unmount();
  });

  it('successful regeneration displays exactly the eight returned recovery codes', async () => {
    const mockAuthService = {
      regenerateAdminMfaRecoveryCodes: async () => ({
        recoveryCodes: sampleCodes,
      }),
    };

    const { container, unmount } = await renderComponent(
      <AdminSettingsPage
        settingsService={mockSettingsService}
        authService={mockAuthService}
        initialTab="security"
      />
    );

    const passwordInput = findElement(
      container,
      (el) => el.tagName === 'INPUT' && el.getAttribute('type') === 'password'
    );
    const totpInput = findElement(
      container,
      (el) => el.tagName === 'INPUT' && el.getAttribute('name') === 'totpCode'
    );
    const submitBtn = findElement(
      container,
      (el) => el.tagName === 'BUTTON' && el.textContent.includes('Regenerate Recovery Codes')
    );

    await act(async () => {
      changeInput(passwordInput, 'Secret123');
      changeInput(totpInput, '112233');
    });

    await act(async () => {
      submitBtn.click();
    });

    const text = container.textContent;
    assert.ok(text.includes('New Emergency Recovery Codes Generated'), 'Should show one-time display title');
    assert.ok(text.includes('All previous recovery codes are now permanently invalidated.'), 'Should warn about invalidation');
    assert.ok(text.includes('One-Time Emergency Backup Codes (8)'), 'Should show code count');

    sampleCodes.forEach((code) => {
      assert.ok(text.includes(code), `Display must contain code ${code}`);
    });

    await unmount();
  });

  it('copies all eight codes to clipboard and displays feedback', async () => {
    const mockAuthService = {
      regenerateAdminMfaRecoveryCodes: async () => ({
        recoveryCodes: sampleCodes,
      }),
    };

    const { container, unmount } = await renderComponent(
      <AdminSettingsPage
        settingsService={mockSettingsService}
        authService={mockAuthService}
        initialTab="security"
      />
    );

    const passwordInput = findElement(
      container,
      (el) => el.tagName === 'INPUT' && el.getAttribute('type') === 'password'
    );
    const totpInput = findElement(
      container,
      (el) => el.tagName === 'INPUT' && el.getAttribute('name') === 'totpCode'
    );
    const submitBtn = findElement(
      container,
      (el) => el.tagName === 'BUTTON' && el.textContent.includes('Regenerate Recovery Codes')
    );

    await act(async () => {
      changeInput(passwordInput, 'Secret123');
      changeInput(totpInput, '112233');
    });

    await act(async () => {
      submitBtn.click();
    });

    const copyBtn = findElement(
      container,
      (el) => el.tagName === 'BUTTON' && el.getAttribute('id') === 'btn-copy-recovery-codes'
    );
    assert.ok(copyBtn, 'Copy button should be present');

    await act(async () => {
      copyBtn.click();
    });

    assert.equal(lastCopiedText, sampleCodes.join('\n'), 'Clipboard must receive all 8 codes joined with newlines');
    assert.ok(container.textContent.includes('✓ Copied All Codes!'), 'Must display copy success feedback');

    await unmount();
  });

  it('handles clipboard failure gracefully when writeText throws', async () => {
    clipboardShouldFail = true;

    const mockAuthService = {
      regenerateAdminMfaRecoveryCodes: async () => ({
        recoveryCodes: sampleCodes,
      }),
    };

    const { container, unmount } = await renderComponent(
      <AdminSettingsPage
        settingsService={mockSettingsService}
        authService={mockAuthService}
        initialTab="security"
      />
    );

    const passwordInput = findElement(
      container,
      (el) => el.tagName === 'INPUT' && el.getAttribute('type') === 'password'
    );
    const totpInput = findElement(
      container,
      (el) => el.tagName === 'INPUT' && el.getAttribute('name') === 'totpCode'
    );
    const submitBtn = findElement(
      container,
      (el) => el.tagName === 'BUTTON' && el.textContent.includes('Regenerate Recovery Codes')
    );

    await act(async () => {
      changeInput(passwordInput, 'Secret123');
      changeInput(totpInput, '112233');
    });

    await act(async () => {
      submitBtn.click();
    });

    const copyBtn = findElement(
      container,
      (el) => el.tagName === 'BUTTON' && el.getAttribute('id') === 'btn-copy-recovery-codes'
    );

    await act(async () => {
      copyBtn.click();
      await new Promise((r) => setTimeout(r, 20));
    });

    const text = container.textContent;
    assert.ok(text.includes('Copy Failed — Copy Manually'), 'Should indicate copy failure on button');
    assert.ok(text.includes('Automatic clipboard copy failed. Please select and copy the codes manually'), 'Should show fallback manual copy instructions');

    clipboardShouldFail = false;
    await unmount();
  });

  it('requires acknowledgment before allowing dismissal of one-time codes', async () => {
    const mockAuthService = {
      regenerateAdminMfaRecoveryCodes: async () => ({
        recoveryCodes: sampleCodes,
      }),
    };

    const { container, unmount } = await renderComponent(
      <AdminSettingsPage
        settingsService={mockSettingsService}
        authService={mockAuthService}
        initialTab="security"
      />
    );

    const passwordInput = findElement(
      container,
      (el) => el.tagName === 'INPUT' && el.getAttribute('type') === 'password'
    );
    const totpInput = findElement(
      container,
      (el) => el.tagName === 'INPUT' && el.getAttribute('name') === 'totpCode'
    );
    const submitBtn = findElement(
      container,
      (el) => el.tagName === 'BUTTON' && el.textContent.includes('Regenerate Recovery Codes')
    );

    await act(async () => {
      changeInput(passwordInput, 'Secret123');
      changeInput(totpInput, '112233');
    });

    await act(async () => {
      submitBtn.click();
    });

    const dismissBtn = findElement(
      container,
      (el) => el.tagName === 'BUTTON' && el.getAttribute('id') === 'btn-dismiss-recovery-codes'
    );
    assert.ok(dismissBtn, 'Dismiss button should be found');
    assert.equal(dismissBtn.hasAttribute('disabled'), true, 'Dismiss button must be disabled until acknowledged');

    const ackCheckbox = findElement(
      container,
      (el) => el.tagName === 'INPUT' && el.getAttribute('id') === 'ack-recovery-codes'
    );
    assert.ok(ackCheckbox, 'Acknowledgment checkbox should be found');

    // Check acknowledgment
    await act(async () => {
      changeCheckbox(ackCheckbox, true);
    });

    assert.equal(dismissBtn.hasAttribute('disabled'), false, 'Dismiss button must become enabled after acknowledgment');

    // Click dismiss button
    await act(async () => {
      dismissBtn.click();
    });

    const textAfterDismiss = container.textContent;
    assert.ok(!textAfterDismiss.includes('One-Time Emergency Backup Codes (8)'), 'Codes should be removed from view');
    assert.ok(textAfterDismiss.includes('New recovery codes successfully generated and saved.'), 'Success message should appear');

    await unmount();
  });

  it('displays useful non-sensitive errors for INVALID_CURRENT_PASSWORD', async () => {
    const mockAuthService = {
      regenerateAdminMfaRecoveryCodes: async () => {
        throw new ApiError({
          status: 401,
          code: 'INVALID_CURRENT_PASSWORD',
          message: 'The current password provided is incorrect.',
        });
      },
    };

    const { container, unmount } = await renderComponent(
      <AdminSettingsPage
        settingsService={mockSettingsService}
        authService={mockAuthService}
        initialTab="security"
      />
    );

    const passwordInput = findElement(
      container,
      (el) => el.tagName === 'INPUT' && el.getAttribute('type') === 'password'
    );
    const totpInput = findElement(
      container,
      (el) => el.tagName === 'INPUT' && el.getAttribute('name') === 'totpCode'
    );
    const submitBtn = findElement(
      container,
      (el) => el.tagName === 'BUTTON' && el.textContent.includes('Regenerate Recovery Codes')
    );

    await act(async () => {
      changeInput(passwordInput, 'WrongPassword123');
      changeInput(totpInput, '112233');
    });

    await act(async () => {
      submitBtn.click();
    });

    const text = container.textContent;
    assert.ok(text.includes('Incorrect current password. Please verify your credentials and try again.'));

    await unmount();
  });

  it('displays useful non-sensitive errors for rate limiting and session expiration', async () => {
    let errorToThrow = new ApiError({
      status: 429,
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
      message: 'Too many requests.',
    });

    const mockAuthService = {
      regenerateAdminMfaRecoveryCodes: async () => {
        throw errorToThrow;
      },
    };

    const { container, unmount } = await renderComponent(
      <AdminSettingsPage
        settingsService={mockSettingsService}
        authService={mockAuthService}
        initialTab="security"
      />
    );

    const passwordInput = findElement(
      container,
      (el) => el.tagName === 'INPUT' && el.getAttribute('type') === 'password'
    );
    const totpInput = findElement(
      container,
      (el) => el.tagName === 'INPUT' && el.getAttribute('name') === 'totpCode'
    );
    const submitBtn = findElement(
      container,
      (el) => el.tagName === 'BUTTON' && el.textContent.includes('Regenerate Recovery Codes')
    );

    await act(async () => {
      changeInput(passwordInput, 'Secret123');
      changeInput(totpInput, '112233');
    });

    await act(async () => {
      submitBtn.click();
    });

    assert.ok(container.textContent.includes('Too many attempts. Rate limit exceeded. Please wait a few minutes before trying again.'));

    // Test session expired error
    errorToThrow = new ApiError({
      status: 401,
      code: 'AUTH_TOKEN_EXPIRED',
      message: 'Token expired',
    });

    await act(async () => {
      changeInput(passwordInput, 'Secret123');
      changeInput(totpInput, '112233');
    });

    await act(async () => {
      submitBtn.click();
    });

    assert.ok(container.textContent.includes('Your administrative session has expired or is invalid. Please sign in again.'));

    await unmount();
  });

  it('handles ambiguous network failure with explicit warning and avoids automatic retry', async () => {
    let callCount = 0;
    const mockAuthService = {
      regenerateAdminMfaRecoveryCodes: async () => {
        callCount++;
        throw new ApiError({
          status: 0,
          code: 'NETWORK_ERROR',
          message: 'Network connection failed.',
        });
      },
    };

    const { container, unmount } = await renderComponent(
      <AdminSettingsPage
        settingsService={mockSettingsService}
        authService={mockAuthService}
        initialTab="security"
      />
    );

    const passwordInput = findElement(
      container,
      (el) => el.tagName === 'INPUT' && el.getAttribute('type') === 'password'
    );
    const totpInput = findElement(
      container,
      (el) => el.tagName === 'INPUT' && el.getAttribute('name') === 'totpCode'
    );
    const submitBtn = findElement(
      container,
      (el) => el.tagName === 'BUTTON' && el.textContent.includes('Regenerate Recovery Codes')
    );

    await act(async () => {
      changeInput(passwordInput, 'Secret123');
      changeInput(totpInput, '112233');
    });

    await act(async () => {
      submitBtn.click();
    });

    const text = container.textContent;
    assert.ok(text.includes('Network Ambiguity Warning — Do Not Retry'), 'Should display prominent ambiguity warning banner');
    assert.ok(text.includes('Old recovery codes may no longer be valid. Do NOT retry automatically.'), 'Should warn that old codes may be invalidated');
    assert.equal(callCount, 1, 'Must not retry network requests automatically for destructive credential rotation');

    await unmount();
  });

  it('prevents duplicate submissions while request is in flight', async () => {
    let resolveRequest;
    const pendingPromise = new Promise((resolve) => {
      resolveRequest = resolve;
    });

    const mockAuthService = {
      regenerateAdminMfaRecoveryCodes: async () => pendingPromise,
    };

    const { container, unmount } = await renderComponent(
      <AdminSettingsPage
        settingsService={mockSettingsService}
        authService={mockAuthService}
        initialTab="security"
      />
    );

    const passwordInput = findElement(
      container,
      (el) => el.tagName === 'INPUT' && el.getAttribute('type') === 'password'
    );
    const totpInput = findElement(
      container,
      (el) => el.tagName === 'INPUT' && el.getAttribute('name') === 'totpCode'
    );
    const submitBtn = findElement(
      container,
      (el) => el.tagName === 'BUTTON' && el.textContent.includes('Regenerate Recovery Codes')
    );

    await act(async () => {
      changeInput(passwordInput, 'Secret123');
      changeInput(totpInput, '112233');
    });

    // Fire first click
    let clickPromise;
    await act(async () => {
      clickPromise = submitBtn.click();
    });

    assert.equal(submitBtn.hasAttribute('disabled'), true, 'Button must be disabled while in flight');
    assert.ok(submitBtn.textContent.includes('Verifying & Regenerating...'), 'Button should display in-flight text');

    // Resolve request
    await act(async () => {
      resolveRequest({ recoveryCodes: sampleCodes });
      await clickPromise;
    });

    await unmount();
  });

  it('does not write plaintext recovery codes to storage or logs', async () => {
    const mockAuthService = {
      regenerateAdminMfaRecoveryCodes: async () => ({
        recoveryCodes: sampleCodes,
      }),
    };

    const { container, unmount } = await renderComponent(
      <AdminSettingsPage
        settingsService={mockSettingsService}
        authService={mockAuthService}
        initialTab="security"
      />
    );

    const passwordInput = findElement(
      container,
      (el) => el.tagName === 'INPUT' && el.getAttribute('type') === 'password'
    );
    const totpInput = findElement(
      container,
      (el) => el.tagName === 'INPUT' && el.getAttribute('name') === 'totpCode'
    );
    const submitBtn = findElement(
      container,
      (el) => el.tagName === 'BUTTON' && el.textContent.includes('Regenerate Recovery Codes')
    );

    await act(async () => {
      changeInput(passwordInput, 'Secret123');
      changeInput(totpInput, '112233');
    });

    await act(async () => {
      submitBtn.click();
    });

    assert.equal(mockStorage.length, 0, 'No recovery codes or secret keys may be written to storage');

    await unmount();
  });

  it('prompts confirmation on in-app anchor navigation when unacknowledged codes exist, and cancels navigation on dismiss', async () => {
    const mockAuthService = {
      regenerateAdminMfaRecoveryCodes: async () => ({
        recoveryCodes: sampleCodes,
      }),
    };

    const { container, unmount } = await renderComponent(
      <AdminSettingsPage
        settingsService={mockSettingsService}
        authService={mockAuthService}
        initialTab="security"
      />
    );

    // Generate codes
    const passwordInput = findElement(container, (el) => el.tagName === 'INPUT' && el.getAttribute('type') === 'password');
    const totpInput = findElement(container, (el) => el.tagName === 'INPUT' && el.getAttribute('name') === 'totpCode');
    const submitBtn = findElement(container, (el) => el.tagName === 'BUTTON' && el.textContent.includes('Regenerate Recovery Codes'));

    await act(async () => {
      changeInput(passwordInput, 'Secret123');
      changeInput(totpInput, '112233');
    });
    await act(async () => {
      submitBtn.click();
    });

    assert.ok(container.textContent.includes(sampleCodes[0]), 'Codes must be displayed');

    // Attempt navigation via anchor while codes are unacknowledged
    mockConfirmResponse = false;
    lastConfirmMessage = null;

    const fakeAnchor = mockDoc.createElement('a');
    fakeAnchor.setAttribute('href', '/admin/orders');
    fakeAnchor.textContent = 'Orders';

    await act(async () => {
      simulateAnchorClick(fakeAnchor);
    });

    assert.ok(lastConfirmMessage, 'Must prompt confirmation before leaving');
    assert.ok(
      lastConfirmMessage.includes('unacknowledged') || lastConfirmMessage.includes('discard'),
      'Confirmation message must explain risk of discarding unacknowledged codes'
    );
    assert.equal(historyPushed.length, 0, 'Must NOT push new history entry when user cancels');
    assert.equal(mockWin.location.pathname, '/admin/settings', 'Must remain on settings page');
    assert.ok(container.textContent.includes(sampleCodes[0]), 'Codes must remain displayed when user cancels');

    await unmount();
  });

  it('allows in-app anchor navigation after confirmation, clearing transient recovery codes', async () => {
    const mockAuthService = {
      regenerateAdminMfaRecoveryCodes: async () => ({
        recoveryCodes: sampleCodes,
      }),
    };

    const { container, unmount } = await renderComponent(
      <AdminSettingsPage
        settingsService={mockSettingsService}
        authService={mockAuthService}
        initialTab="security"
      />
    );

    const passwordInput = findElement(container, (el) => el.tagName === 'INPUT' && el.getAttribute('type') === 'password');
    const totpInput = findElement(container, (el) => el.tagName === 'INPUT' && el.getAttribute('name') === 'totpCode');
    const submitBtn = findElement(container, (el) => el.tagName === 'BUTTON' && el.textContent.includes('Regenerate Recovery Codes'));

    await act(async () => {
      changeInput(passwordInput, 'Secret123');
      changeInput(totpInput, '112233');
    });
    await act(async () => {
      submitBtn.click();
    });

    // Confirm navigation
    mockConfirmResponse = true;
    lastConfirmMessage = null;

    const fakeAnchor = mockDoc.createElement('a');
    fakeAnchor.setAttribute('href', '/admin/orders');
    fakeAnchor.textContent = 'Orders';

    await act(async () => {
      simulateAnchorClick(fakeAnchor);
    });

    assert.ok(lastConfirmMessage, 'Must prompt confirmation before leaving');
    assert.equal(mockWin.location.pathname, '/admin/orders', 'Must navigate to target path');
    assert.ok(!container.textContent.includes(sampleCodes[0]), 'Codes must be cleared from component state');

    await unmount();
  });

  it('prompts confirmation on popstate (browser back/forward) when unacknowledged codes exist, and cancels on dismiss', async () => {
    const mockAuthService = {
      regenerateAdminMfaRecoveryCodes: async () => ({
        recoveryCodes: sampleCodes,
      }),
    };

    const { container, unmount } = await renderComponent(
      <AdminSettingsPage
        settingsService={mockSettingsService}
        authService={mockAuthService}
        initialTab="security"
      />
    );

    const passwordInput = findElement(container, (el) => el.tagName === 'INPUT' && el.getAttribute('type') === 'password');
    const totpInput = findElement(container, (el) => el.tagName === 'INPUT' && el.getAttribute('name') === 'totpCode');
    const submitBtn = findElement(container, (el) => el.tagName === 'BUTTON' && el.textContent.includes('Regenerate Recovery Codes'));

    await act(async () => {
      changeInput(passwordInput, 'Secret123');
      changeInput(totpInput, '112233');
    });
    await act(async () => {
      submitBtn.click();
    });

    mockConfirmResponse = false;
    lastConfirmMessage = null;

    const popstateEvent = new mockWin.Event('popstate', { cancelable: true });

    await act(async () => {
      mockWin.dispatchEvent(popstateEvent);
    });

    assert.ok(lastConfirmMessage, 'Must prompt confirmation on popstate');
    assert.equal(popstateEvent._immediatePropagationStopped, true, 'Must stop immediate propagation to router listeners');
    assert.ok(container.textContent.includes(sampleCodes[0]), 'Recovery codes must remain rendered after cancelling popstate');

    await unmount();
  });

  it('allows popstate navigation after confirmation, clearing transient recovery codes', async () => {
    const mockAuthService = {
      regenerateAdminMfaRecoveryCodes: async () => ({
        recoveryCodes: sampleCodes,
      }),
    };

    const { container, unmount } = await renderComponent(
      <AdminSettingsPage
        settingsService={mockSettingsService}
        authService={mockAuthService}
        initialTab="security"
      />
    );

    const passwordInput = findElement(container, (el) => el.tagName === 'INPUT' && el.getAttribute('type') === 'password');
    const totpInput = findElement(container, (el) => el.tagName === 'INPUT' && el.getAttribute('name') === 'totpCode');
    const submitBtn = findElement(container, (el) => el.tagName === 'BUTTON' && el.textContent.includes('Regenerate Recovery Codes'));

    await act(async () => {
      changeInput(passwordInput, 'Secret123');
      changeInput(totpInput, '112233');
    });
    await act(async () => {
      submitBtn.click();
    });

    mockConfirmResponse = true;
    lastConfirmMessage = null;

    const popstateEvent = new mockWin.Event('popstate', { cancelable: true });

    await act(async () => {
      mockWin.dispatchEvent(popstateEvent);
    });

    assert.ok(lastConfirmMessage, 'Must prompt confirmation on popstate');
    assert.ok(!container.textContent.includes(sampleCodes[0]), 'Codes must be cleared upon confirmed popstate navigation');

    await unmount();
  });

  it('acknowledging codes disables the navigation guard and permits anchor navigation without confirmation', async () => {
    const mockAuthService = {
      regenerateAdminMfaRecoveryCodes: async () => ({
        recoveryCodes: sampleCodes,
      }),
    };

    const { container, unmount } = await renderComponent(
      <AdminSettingsPage
        settingsService={mockSettingsService}
        authService={mockAuthService}
        initialTab="security"
      />
    );

    const passwordInput = findElement(container, (el) => el.tagName === 'INPUT' && el.getAttribute('type') === 'password');
    const totpInput = findElement(container, (el) => el.tagName === 'INPUT' && el.getAttribute('name') === 'totpCode');
    const submitBtn = findElement(container, (el) => el.tagName === 'BUTTON' && el.textContent.includes('Regenerate Recovery Codes'));

    await act(async () => {
      changeInput(passwordInput, 'Secret123');
      changeInput(totpInput, '112233');
    });
    await act(async () => {
      submitBtn.click();
    });

    const ackCheckbox = findElement(
      container,
      (el) => el.tagName === 'INPUT' && el.getAttribute('id') === 'ack-recovery-codes'
    );
    assert.ok(ackCheckbox, 'Acknowledgment checkbox must be rendered');

    await act(async () => {
      changeCheckbox(ackCheckbox, true);
    });

    mockConfirmResponse = false;
    lastConfirmMessage = null;

    const fakeAnchor = mockDoc.createElement('a');
    fakeAnchor.setAttribute('href', '/admin/orders');
    fakeAnchor.textContent = 'Orders';

    await act(async () => {
      simulateAnchorClick(fakeAnchor);
    });

    assert.equal(lastConfirmMessage, null, 'Must NOT prompt confirmation when codes are acknowledged');

    await unmount();
  });

  it('normal navigation without unacknowledged codes is unaffected and does not trigger confirmation', async () => {
    const { container, unmount } = await renderComponent(
      <AdminSettingsPage settingsService={mockSettingsService} initialTab="security" />
    );

    mockConfirmResponse = false;
    lastConfirmMessage = null;

    const fakeAnchor = mockDoc.createElement('a');
    fakeAnchor.setAttribute('href', '/admin/dashboard');
    fakeAnchor.textContent = 'Dashboard';

    await act(async () => {
      simulateAnchorClick(fakeAnchor);
    });

    assert.equal(lastConfirmMessage, null, 'Must not prompt confirmation when no unacknowledged codes exist');

    await unmount();
  });

  it('tab switching inside AdminSettingsPage retains unacknowledged recovery codes without discarding them', async () => {
    const mockAuthService = {
      regenerateAdminMfaRecoveryCodes: async () => ({
        recoveryCodes: sampleCodes,
      }),
    };

    const { container, unmount } = await renderComponent(
      <AdminSettingsPage
        settingsService={mockSettingsService}
        authService={mockAuthService}
        initialTab="security"
      />
    );

    const passwordInput = findElement(container, (el) => el.tagName === 'INPUT' && el.getAttribute('type') === 'password');
    const totpInput = findElement(container, (el) => el.tagName === 'INPUT' && el.getAttribute('name') === 'totpCode');
    const submitBtn = findElement(container, (el) => el.tagName === 'BUTTON' && el.textContent.includes('Regenerate Recovery Codes'));

    await act(async () => {
      changeInput(passwordInput, 'Secret123');
      changeInput(totpInput, '112233');
    });
    await act(async () => {
      submitBtn.click();
    });

    assert.ok(container.textContent.includes(sampleCodes[0]), 'Codes must be rendered initially');

    // Switch to Store Profile tab
    const profileTabBtn = findElement(
      container,
      (el) => el.tagName === 'BUTTON' && el.textContent.includes('Store Profile')
    );
    assert.ok(profileTabBtn, 'Should find Store Profile tab');

    await act(async () => {
      profileTabBtn.click();
    });

    assert.ok(container.textContent.includes('Store Identification & Contact'), 'Should be on general tab');

    // Switch back to Security Settings tab
    const securityTabBtn = findElement(
      container,
      (el) => el.tagName === 'BUTTON' && el.textContent.includes('Security Settings')
    );
    assert.ok(securityTabBtn, 'Should find Security Settings tab');

    await act(async () => {
      securityTabBtn.click();
    });

    for (const code of sampleCodes) {
      assert.ok(container.textContent.includes(code), `Code ${code} must still be displayed after returning to tab`);
    }

    await unmount();
  });

  it('beforeunload handler warns before browser reload/closure while codes are unacknowledged', async () => {
    const mockAuthService = {
      regenerateAdminMfaRecoveryCodes: async () => ({
        recoveryCodes: sampleCodes,
      }),
    };

    const { container, unmount } = await renderComponent(
      <AdminSettingsPage
        settingsService={mockSettingsService}
        authService={mockAuthService}
        initialTab="security"
      />
    );

    const passwordInput = findElement(container, (el) => el.tagName === 'INPUT' && el.getAttribute('type') === 'password');
    const totpInput = findElement(container, (el) => el.tagName === 'INPUT' && el.getAttribute('name') === 'totpCode');
    const submitBtn = findElement(container, (el) => el.tagName === 'BUTTON' && el.textContent.includes('Regenerate Recovery Codes'));

    await act(async () => {
      changeInput(passwordInput, 'Secret123');
      changeInput(totpInput, '112233');
    });
    await act(async () => {
      submitBtn.click();
    });

    const beforeUnloadEvent = new mockWin.Event('beforeunload', { cancelable: true });

    await act(async () => {
      mockWin.dispatchEvent(beforeUnloadEvent);
    });

    assert.equal(beforeUnloadEvent.defaultPrevented, true, 'beforeunload must be preventDefaulted');
    assert.equal(beforeUnloadEvent.returnValue, '', 'beforeunload returnValue must be empty string per browser spec');

    await unmount();
  });
});

describe('AdminSettingsPage — Manual MFA Enable & Disable UI', () => {
  const mockSettingsData = {
    settings: {
      storeName: 'CommerceFlow Mountain',
      supportEmail: 'support@commerceflow.com',
      supportPhone: '+91 98765 43210',
      currency: 'INR',
      currencySymbol: '₹',
      freeShippingThreshold: 999,
      standardShippingRate: 99,
      lowStockThreshold: 5,
      returnWindowDays: 14,
      isMaintenanceMode: false,
    },
    systemInfo: {
      environment: 'development',
      apiVersion: 'v1',
      databaseStatus: 'connected',
      paymentGateway: 'Razorpay (Configured)',
    },
  };

  const mockSettingsService = {
    getStoreSettings: async () => mockSettingsData,
    updateStoreSettings: async (payload) => ({
      settings: { ...mockSettingsData.settings, ...payload },
      systemInfo: mockSettingsData.systemInfo,
    }),
  };

  const sampleCodes = [
    '2J4K-7M9P-4T6W',
    '3B8D-5F7H-9K2L',
    '8N1Q-3R5S-7U9V',
    '5W7X-9Y2Z-4A6B',
    '9C1D-3E5F-7G8H',
    '6J8K-2M4N-6P7Q',
    '1R3S-5T7U-9V2W',
    '7X9Y-2Z4A-6B8C',
  ];

  beforeEach(() => {
    mockStorage.clear();
    lastCopiedText = null;
    clipboardShouldFail = false;
    mockConfirmResponse = true;
    lastConfirmMessage = null;
    historyPushed.length = 0;
    mockWin.location.pathname = '/admin/settings';
    mockWin.location.search = '';
    for (const k of Object.keys(docListeners)) delete docListeners[k];
    for (const k of Object.keys(winListeners)) delete winListeners[k];
  });

  it('renders Two-Factor Authentication Disabled and Enable button when user is unenrolled', async () => {
    const mockAuthService = {
      getCurrentUser: async () => ({
        user: { twoFactorEnabled: false },
      }),
    };

    const { container, unmount } = await renderComponent(
      <AdminSettingsPage
        settingsService={mockSettingsService}
        authService={mockAuthService}
        initialTab="security"
      />
    );

    const text = container.textContent;
    assert.ok(text.includes('Two-Factor Authentication Disabled'), 'Should display unenrolled badge');
    assert.ok(text.includes('Protect Your Administrative Account'), 'Should display MFA protection prompt');
    assert.ok(text.includes('Enable Two-Step Verification'), 'Should display enable button');

    // Should NOT display recovery regeneration or disable sections
    assert.equal(text.includes('Regenerate Emergency Recovery Codes'), false);
    assert.equal(text.includes('Disable Two-Step Verification'), false);

    await unmount();
  });

  it('initiates setup modal with secret and activates MFA with 6-digit TOTP code', async () => {
    let setupCalled = false;
    let activatePayload = null;

    const mockAuthService = {
      getCurrentUser: async () => ({
        user: { twoFactorEnabled: false },
      }),
      setupAdminMfa: async () => {
        setupCalled = true;
        return {
          secret: 'JBSWY3DPEHPK3PXP',
          qrCodeDataUrl: 'data:image/svg+xml,...',
        };
      },
      activateAdminMfa: async (payload) => {
        activatePayload = payload;
        return {
          user: { twoFactorEnabled: true },
          recoveryCodes: sampleCodes,
        };
      },
    };

    const { container, unmount } = await renderComponent(
      <AdminSettingsPage
        settingsService={mockSettingsService}
        authService={mockAuthService}
        initialTab="security"
      />
    );

    const enableBtn = findElement(
      container,
      (el) => el.tagName === 'BUTTON' && el.textContent.includes('Enable Two-Step Verification')
    );
    assert.ok(enableBtn, 'Should find Enable button');

    await act(async () => {
      enableBtn.click();
    });

    assert.equal(setupCalled, true, 'setupAdminMfa must be called');
    assert.ok(container.textContent.includes('Setup Two-Step Verification'), 'Setup modal must be open');
    assert.ok(container.textContent.includes('JBSWY3DPEHPK3PXP'), 'Manual secret key must be displayed');

    const totpInput = findElement(
      container,
      (el) => el.tagName === 'INPUT' && el.getAttribute('placeholder') === '123456'
    );
    assert.ok(totpInput, 'TOTP code input must be rendered in modal');

    const verifyBtn = findElement(
      container,
      (el) => el.tagName === 'BUTTON' && el.textContent.includes('Verify & Activate')
    );
    assert.ok(verifyBtn, 'Verify & Activate button must be rendered');

    await act(async () => {
      changeInput(totpInput, '654321');
    });

    await act(async () => {
      verifyBtn.click();
    });

    assert.deepEqual(activatePayload, { totpCode: '654321' }, 'activateAdminMfa must receive valid code');
    assert.ok(container.textContent.includes('MFA Active & Enforced'), 'Badge must update to active');
    assert.ok(container.textContent.includes('New Emergency Recovery Codes Generated'), 'Generated recovery codes must be displayed');

    await unmount();
  });

  it('clicking Disable Two-Step Verification opens confirmation modal and disables MFA', async () => {
    let disablePayload = null;

    const mockAuthService = {
      getCurrentUser: async () => ({
        user: { twoFactorEnabled: true },
      }),
      disableAdminMfa: async (payload) => {
        disablePayload = payload;
        return {
          user: { twoFactorEnabled: false },
        };
      },
    };

    const { container, unmount } = await renderComponent(
      <AdminSettingsPage
        settingsService={mockSettingsService}
        authService={mockAuthService}
        initialTab="security"
      />
    );

    assert.ok(container.textContent.includes('MFA Active & Enforced'), 'Badge must show MFA active');

    const disableBtn = findElement(
      container,
      (el) => el.tagName === 'BUTTON' && el.textContent.includes('Disable Two-Step Verification')
    );
    assert.ok(disableBtn, 'Disable Two-Step Verification button must be found');

    await act(async () => {
      disableBtn.click();
    });

    assert.ok(container.textContent.includes('Confirm & Disable MFA'), 'Disable modal must be open');

    const passwordInput = findElement(
      container,
      (el) => el.tagName === 'INPUT' && el.getAttribute('id') === 'disable-password'
    );
    const totpInput = findElement(
      container,
      (el) => el.tagName === 'INPUT' && el.getAttribute('placeholder') === '6-digit authenticator code'
    );
    const confirmBtn = findElement(
      container,
      (el) => el.tagName === 'BUTTON' && el.textContent.includes('Confirm & Disable MFA')
    );

    await act(async () => {
      changeInput(passwordInput, 'AdminPassword!1');
      changeInput(totpInput, '789012');
    });

    await act(async () => {
      confirmBtn.click();
    });

    assert.deepEqual(disablePayload, {
      password: 'AdminPassword!1',
      totpCode: '789012',
    });

    assert.ok(container.textContent.includes('Two-Factor Authentication Disabled'), 'State must update to disabled');
    assert.ok(container.textContent.includes('Two-step verification has been disabled'), 'Success alert must be shown');

    await unmount();
  });

  it('displays error in disable modal when disableAdminMfa fails', async () => {
    const mockAuthService = {
      getCurrentUser: async () => ({
        user: { twoFactorEnabled: true },
      }),
      disableAdminMfa: async () => {
        throw new ApiError({
          status: 401,
          code: 'INVALID_CURRENT_PASSWORD',
          message: 'Incorrect current password. Please verify your credentials and try again.',
        });
      },
    };

    const { container, unmount } = await renderComponent(
      <AdminSettingsPage
        settingsService={mockSettingsService}
        authService={mockAuthService}
        initialTab="security"
      />
    );

    const disableBtn = findElement(
      container,
      (el) => el.tagName === 'BUTTON' && el.textContent.includes('Disable Two-Step Verification')
    );

    await act(async () => {
      disableBtn.click();
    });

    const passwordInput = findElement(
      container,
      (el) => el.tagName === 'INPUT' && el.getAttribute('id') === 'disable-password'
    );
    const totpInput = findElement(
      container,
      (el) => el.tagName === 'INPUT' && el.getAttribute('placeholder') === '6-digit authenticator code'
    );
    const confirmBtn = findElement(
      container,
      (el) => el.tagName === 'BUTTON' && el.textContent.includes('Confirm & Disable MFA')
    );

    await act(async () => {
      changeInput(passwordInput, 'WrongPassword');
      changeInput(totpInput, '111222');
    });

    await act(async () => {
      confirmBtn.click();
    });

    assert.ok(container.textContent.includes('Incorrect current password'), 'Modal must render error message');
    assert.ok(container.textContent.includes('Confirm & Disable MFA'), 'Modal must remain open');

    await unmount();
  });
});
