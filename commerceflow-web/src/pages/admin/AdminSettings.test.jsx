import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import AdminSettingsPage from './AdminSettingsPage.jsx';

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
    dispatchEvent: () => true,
    click: () => {
      const reactPropsKey = Object.keys(el).find((k) => k.startsWith('__reactProps$'));
      if (reactPropsKey && el[reactPropsKey]?.onClick) {
        el[reactPropsKey].onClick({ type: 'click', preventDefault: () => {}, stopPropagation: () => {} });
        return;
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
const mockWin = {
  document: mockDoc,
  Node: MockNode,
  Element: MockElement,
  HTMLElement: MockHTMLElement,
  HTMLIFrameElement: MockHTMLIFrameElement,
  location: { pathname: '/admin/settings', search: '' },
  history: {
    pushState: () => {},
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

globalThis.window = mockWin;
globalThis.document = mockDoc;
globalThis.Event = mockWin.Event;
globalThis.CustomEvent = mockWin.CustomEvent;
globalThis.Node = MockNode;
globalThis.Element = MockElement;
globalThis.HTMLElement = MockHTMLElement;
globalThis.HTMLIFrameElement = MockHTMLIFrameElement;

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
