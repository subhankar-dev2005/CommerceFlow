import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import AdminBannersPage from './AdminBannersPage.jsx';
import { adminBannerService } from '../../features/admin/adminBanner.service.js';

// Configure React 19 testing environment for act(...)
globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

class MockNode {}
class MockElement extends MockNode {}
class MockHTMLElement extends MockElement {}
class MockHTMLIFrameElement extends MockHTMLElement {}

globalThis.MockNode = MockNode;
globalThis.MockElement = MockElement;
globalThis.MockHTMLElement = MockHTMLElement;
globalThis.MockHTMLIFrameElement = MockHTMLIFrameElement;
globalThis.HTMLIFrameElement = MockHTMLIFrameElement;
globalThis.Node = MockNode;
globalThis.Element = MockElement;
globalThis.HTMLElement = MockHTMLElement;

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
  confirm: () => true
};
globalThis.document = mockDoc;

describe('AdminBannersPage Integration Tests', () => {
  beforeEach(() => {
    // Reset any state
  });

  it('renders marketing banners list with title, placement, status, and destination', async () => {
    const originalGet = adminBannerService.getAdminBanners;
    adminBannerService.getAdminBanners = async () => ({
      banners: [
        {
          _id: 'ban_1',
          id: 'ban_1',
          title: 'Spring Summit Launch',
          heading: 'Gear Up for Spring Peaks',
          subtitle: 'Up to 20% off all tents',
          buttonLabel: 'Explore Tents',
          placement: 'hero_carousel',
          imageUrl: 'https://images.example.com/banner-hero.jpg',
          desktopImage: 'https://images.example.com/banner-hero.jpg',
          mobileImageUrl: 'https://images.example.com/banner-hero-mobile.jpg',
          mobileImage: 'https://images.example.com/banner-hero-mobile.jpg',
          altText: 'Scenic tent on mountain ridge',
          destinationType: 'category',
          destination: '/shop?category=Camping',
          targetUrl: '/shop?category=Camping',
          position: 1,
          displayOrder: 1,
          status: 'published'
        }
      ],
      pagination: { totalBanners: 1, totalPages: 1 }
    });

    try {
      const rootEl = mockDoc.createElement('div');
      const root = createRoot(rootEl);

      await act(async () => {
        root.render(<AdminBannersPage />);
      });

      // Allow microtask resolution
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const text = rootEl.textContent;
      assert.ok(text.includes('Banner Management'));
      assert.ok(text.includes('Spring Summit Launch'));
      assert.ok(text.includes('Gear Up for Spring Peaks'));
      assert.ok(text.includes('/shop?category=Camping'));
      assert.ok(text.includes('Published'));

      await act(async () => {
        root.unmount();
      });
    } finally {
      adminBannerService.getAdminBanners = originalGet;
    }
  });

  it('resolves relative banner image storage paths to absolute API URLs on rendered cards', async () => {
    function findElement(node, predicate) {
      if (!node) return null;
      if (predicate(node)) return node;
      for (const child of node.childNodes || []) {
        const found = findElement(child, predicate);
        if (found) return found;
      }
      return null;
    }

    const originalGet = adminBannerService.getAdminBanners;
    adminBannerService.getAdminBanners = async () => ({
      banners: [
        {
          _id: 'ban_winter_sale',
          id: 'ban_winter_sale',
          title: 'Winter Sale',
          heading: 'Winter sale is live now',
          subtitle: '50% off',
          buttonLabel: 'Explore Collection',
          placement: 'hero_carousel',
          imageUrl: '/api/v1/banners/images/banner-desktop-1793613727628-88931d1b136fbc11.png',
          desktopImage: '/api/v1/banners/images/banner-desktop-1793613727628-88931d1b136fbc11.png',
          altText: 'Winter sale promotional banner',
          destinationType: 'custom_internal',
          destination: '/shop',
          targetUrl: '/shop',
          position: 1,
          displayOrder: 1,
          status: 'published'
        }
      ],
      pagination: { totalBanners: 1, totalPages: 1 }
    });

    try {
      const rootEl = mockDoc.createElement('div');
      const root = createRoot(rootEl);

      await act(async () => {
        root.render(<AdminBannersPage />);
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const text = rootEl.textContent;
      assert.ok(text.includes('Winter Sale'));
      assert.ok(text.includes('Winter sale is live now'));

      const img = findElement(rootEl, (el) => el.tagName === 'IMG');
      assert.ok(img, 'Banner card must render an <img> tag');
      const src = img.getAttribute('src');
      assert.ok(
        src && src.startsWith('http') && src.includes('/api/v1/banners/images/banner-desktop-1793613727628-88931d1b136fbc11.png'),
        `Image src must resolve to absolute backend API URL, received: ${src}`
      );

      await act(async () => {
        root.unmount();
      });
    } finally {
      adminBannerService.getAdminBanners = originalGet;
    }
  });

  it('renders empty state when no banners exist', async () => {
    const originalGet = adminBannerService.getAdminBanners;
    adminBannerService.getAdminBanners = async () => ({
      banners: [],
      pagination: { totalBanners: 0, totalPages: 1 }
    });

    try {
      const rootEl = mockDoc.createElement('div');
      const root = createRoot(rootEl);

      await act(async () => {
        root.render(<AdminBannersPage />);
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const text = rootEl.textContent;
      assert.ok(text.includes('No banners found'));
      assert.ok(text.includes('Add New Banner'));

      await act(async () => {
        root.unmount();
      });
    } finally {
      adminBannerService.getAdminBanners = originalGet;
    }
  });

  it('renders error state when API fails with retry capability', async () => {
    const originalGet = adminBannerService.getAdminBanners;
    adminBannerService.getAdminBanners = async () => {
      throw new Error('Network timeout loading banners');
    };

    try {
      const rootEl = mockDoc.createElement('div');
      const root = createRoot(rootEl);

      await act(async () => {
        root.render(<AdminBannersPage />);
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const text = rootEl.textContent;
      assert.ok(text.includes('Unable to load banners'));
      assert.ok(text.includes('Network timeout loading banners'));

      await act(async () => {
        root.unmount();
      });
    } finally {
      adminBannerService.getAdminBanners = originalGet;
    }
  });
});
