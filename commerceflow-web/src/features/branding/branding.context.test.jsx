import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { BrandingProvider, resolveLogoUrl, BrandingContext } from './branding.context.jsx';
import { useBranding } from './useBranding.js';

// Configure React 19 testing environment for act(...)
globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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
  location: { pathname: '/', search: '' },
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

describe('Branding Context & useBranding Tests', () => {
  describe('resolveLogoUrl', () => {
    it('returns null for null, undefined, or empty string', () => {
      assert.equal(resolveLogoUrl(null), null);
      assert.equal(resolveLogoUrl(undefined), null);
      assert.equal(resolveLogoUrl(''), null);
      assert.equal(resolveLogoUrl('   '), null);
    });

    it('preserves absolute http/https and data URIs', () => {
      assert.equal(resolveLogoUrl('https://example.com/logo.png'), 'https://example.com/logo.png');
      assert.equal(resolveLogoUrl('http://cdn.store.com/logo.webp'), 'http://cdn.store.com/logo.webp');
      assert.equal(resolveLogoUrl('data:image/svg+xml;base64,PHN2Zw=='), 'data:image/svg+xml;base64,PHN2Zw==');
    });

    it('resolves relative URLs to backend origin', () => {
      const resolved = resolveLogoUrl('/api/v1/settings/logo?v=123');
      assert.ok(resolved.endsWith('/api/v1/settings/logo?v=123'));
      assert.ok(resolved.startsWith('http'));
    });
  });

  describe('useBranding fallback', () => {
    it('returns default fallback branding when used outside provider', async () => {
      let capturedValue = null;
      function TestConsumer() {
        capturedValue = useBranding();
        return null;
      }

      const rootEl = mockDoc.createElement('div');
      const root = createRoot(rootEl);
      await act(async () => {
        root.render(<TestConsumer />);
      });

      assert.ok(capturedValue);
      assert.equal(capturedValue.branding.storeName, 'CommerceFlow');
      assert.equal(capturedValue.branding.logoUrl, null);
      assert.equal(capturedValue.branding.hasCustomLogo, false);
      assert.equal(capturedValue.branding.announcementText, '🏕️ Free shipping on orders over $50');
      assert.equal(typeof capturedValue.updateBranding, 'function');
      assert.equal(typeof capturedValue.refreshBranding, 'function');

      await act(async () => {
        root.unmount();
      });
    });
  });

  describe('BrandingProvider', () => {
    it('provides initial branding state and resolves logo URL', async () => {
      let capturedValue = null;
      function TestConsumer() {
        capturedValue = useBranding();
        return null;
      }

      const initial = {
        storeName: 'CommerceFlow Mountain',
        logoUrl: '/api/v1/settings/logo',
        logoAlt: 'Alpine Mountain Mark',
        hasCustomLogo: true,
      };

      const rootEl = mockDoc.createElement('div');
      const root = createRoot(rootEl);
      await act(async () => {
        root.render(
          <BrandingProvider initialBranding={initial}>
            <TestConsumer />
          </BrandingProvider>
        );
      });

      assert.ok(capturedValue);
      assert.equal(capturedValue.branding.storeName, 'CommerceFlow Mountain');
      assert.equal(capturedValue.branding.logoUrl, '/api/v1/settings/logo');
      assert.equal(capturedValue.branding.logoAlt, 'Alpine Mountain Mark');
      assert.equal(capturedValue.branding.hasCustomLogo, true);
      assert.ok(capturedValue.resolvedLogoUrl.includes('/api/v1/settings/logo'));

      await act(async () => {
        root.unmount();
      });
    });

    it('updates branding when updateBranding is called', async () => {
      let capturedValue = null;
      function TestConsumer() {
        capturedValue = useBranding();
        return null;
      }

      const rootEl = mockDoc.createElement('div');
      const root = createRoot(rootEl);
      await act(async () => {
        root.render(
          <BrandingProvider initialBranding={{ storeName: 'Store', logoUrl: null, hasCustomLogo: false }}>
            <TestConsumer />
          </BrandingProvider>
        );
      });

      assert.equal(capturedValue.branding.hasCustomLogo, false);

      await act(async () => {
        capturedValue.updateBranding({
          logoUrl: '/api/v1/settings/logo?v=new',
          logoAlt: 'New Logo',
          hasCustomLogo: true,
          announcementText: '🔥 Seasonal Flash Sale!',
        });
      });

      assert.equal(capturedValue.branding.logoUrl, '/api/v1/settings/logo?v=new');
      assert.equal(capturedValue.branding.logoAlt, 'New Logo');
      assert.equal(capturedValue.branding.hasCustomLogo, true);
      assert.equal(capturedValue.branding.announcementText, '🔥 Seasonal Flash Sale!');

      // Reset
      await act(async () => {
        capturedValue.updateBranding({
          logoUrl: null,
          logoAlt: 'CommerceFlow Logo',
          hasCustomLogo: false,
          announcementText: '🏕️ Free shipping on orders over $50',
        });
      });

      assert.equal(capturedValue.branding.logoUrl, null);
      assert.equal(capturedValue.branding.hasCustomLogo, false);
      assert.equal(capturedValue.branding.announcementText, '🏕️ Free shipping on orders over $50');

      await act(async () => {
        root.unmount();
      });
    });
  });
});
