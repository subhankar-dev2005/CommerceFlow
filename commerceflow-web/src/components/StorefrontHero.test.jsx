import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import StorefrontHero from './StorefrontHero.jsx';
import { adminBannerService } from '../features/admin/adminBanner.service.js';

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
      if (name in el && typeof el[name] === 'string') return el[name];
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
    createDocumentFragment: () => {
      const frag = new MockNode();
      frag.nodeType = 11;
      frag.childNodes = [];
      frag.appendChild = (c) => {
        frag.childNodes.push(c);
        return c;
      };
      return frag;
    },
    createComment: () => ({ nodeType: 8, ownerDocument: doc }),
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  return doc;
}

const mockDoc = createMockDocument();
globalThis.window = {
  document: mockDoc,
  Node: MockNode,
  Element: MockElement,
  HTMLElement: MockHTMLElement,
  HTMLIFrameElement: MockHTMLIFrameElement,
  addEventListener: () => {},
  removeEventListener: () => {},
  matchMedia: () => ({ matches: false })
};
globalThis.document = mockDoc;
globalThis.HTMLIFrameElement = MockHTMLIFrameElement;

describe('StorefrontHero Carousel Component Tests', () => {
  beforeEach(() => {
    // Reset any state
  });

  it('renders default fallback slides when API returns empty or fails', async () => {
    const originalGet = adminBannerService.getPublicBanners;
    adminBannerService.getPublicBanners = async () => [];

    try {
      const rootEl = mockDoc.createElement('div');
      const root = createRoot(rootEl);

      await act(async () => {
        root.render(<StorefrontHero />);
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const text = rootEl.textContent;
      assert.ok(text.includes('Gear Up for'));
      assert.ok(text.includes('Shop Camping Gear'));

      await act(async () => {
        root.unmount();
      });
    } finally {
      adminBannerService.getPublicBanners = originalGet;
    }
  });

  it('renders dynamic active banners from API with responsive picture and heading', async () => {
    const originalGet = adminBannerService.getPublicBanners;
    adminBannerService.getPublicBanners = async () => [
      {
        _id: 'b1',
        title: 'Alpine Expeditions 2026',
        heading: 'Conquer the Highest Summits',
        subtitle: 'Engineered apparel and four-season tents ready for zero-degree climbs.',
        buttonLabel: 'Shop Alpine Line',
        destination: '/shop?collection=alpine',
        targetUrl: '/shop?collection=alpine',
        desktopImage: 'https://images.example.com/alpine-desktop.jpg',
        mobileImage: 'https://images.example.com/alpine-mobile.jpg',
        altText: 'Climber on icy ridge at sunrise'
      }
    ];

    try {
      const rootEl = mockDoc.createElement('div');
      const root = createRoot(rootEl);

      await act(async () => {
        root.render(<StorefrontHero />);
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const text = rootEl.textContent;
      assert.ok(text.includes('Conquer the Highest Summits'));
      assert.ok(text.includes('Shop Alpine Line'));
      assert.ok(text.includes('four-season tents'));

      await act(async () => {
        root.unmount();
      });
    } finally {
      adminBannerService.getPublicBanners = originalGet;
    }
  });
});

