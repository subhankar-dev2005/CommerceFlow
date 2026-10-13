import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import cartContextModule from '../cart/cart.context.jsx';
const { CartProvider, AuthContext } = cartContextModule;
import wishlistContextModule from '../wishlist/wishlist.context.jsx';
const { WishlistProvider } = wishlistContextModule;
import recentlyViewedContextModule from './RecentlyViewedContext.jsx';
const { RecentlyViewedContext } = recentlyViewedContextModule;
import recentlyViewedSectionModule from './RecentlyViewedSection.jsx';
const RecentlyViewedSection = recentlyViewedSectionModule?.default || recentlyViewedSectionModule;
import { apiClient } from '../../lib/apiClient.js';

// Configure React 19 testing environment for act(...)
globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Mock DOM minimal environment for React 19 in Node
class Node {}
class Element extends Node {}
class HTMLElement extends Element {}
class HTMLIFrameElement extends HTMLElement {}

function createMockElement(tag, doc) {
  const el = new HTMLElement();
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
    setAttribute: (name, val) => {
      const sVal = String(val);
      attributes[name] = sVal;
      if (name === 'aria-label') el.ariaLabel = sVal;
      if (name === 'role') el.role = sVal;
      if (name === 'href') el.href = sVal;
    },
    getAttribute: (name) => attributes[name] || null,
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
    appendChild: (child) => {
      if (child.parentNode && child.parentNode !== el) {
        child.parentNode.removeChild(child);
      }
      child.parentNode = el;
      children.push(child);
      return child;
    },
    removeChild: (child) => {
      const idx = children.indexOf(child);
      if (idx !== -1) {
        children.splice(idx, 1);
        child.parentNode = null;
      }
      return child;
    },
    insertBefore: (newChild, refChild) => {
      if (!refChild) return el.appendChild(newChild);
      const idx = children.indexOf(refChild);
      if (idx !== -1) {
        if (newChild.parentNode) newChild.parentNode.removeChild(newChild);
        newChild.parentNode = el;
        children.splice(idx, 0, newChild);
      } else {
        children.push(newChild);
      }
      return newChild;
    },
    contains: (target) => {
      if (target === el) return true;
      return children.some((c) => (c.contains ? c.contains(target) : c === target));
    },
  });

  Object.defineProperty(el, 'textContent', {
    get: () => children.map((c) => c.textContent || c.nodeValue || '').join(''),
    set: (val) => {
      children.length = 0;
      if (val !== undefined && val !== null && val !== '') {
        const tn = doc.createTextNode(String(val));
        tn.parentNode = el;
        children.push(tn);
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
        set: (v) => {
          t.nodeValue = String(v);
        },
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
  location: { pathname: '/', search: '' },
  history: { pushState: () => {} },
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
};
mockDoc.defaultView = mockWin;

globalThis.window = mockWin;
globalThis.document = mockDoc;
globalThis.Node = Node;
globalThis.Element = Element;
globalThis.HTMLElement = HTMLElement;
globalThis.HTMLIFrameElement = HTMLIFrameElement;

const SAMPLE_PRODUCTS = [
  {
    _id: '507f1f77bcf86cd799439011',
    name: 'Summit Alpine Tent',
    price: 349.99,
    stock: 10,
    category: 'Camping',
    image: 'https://images.example.com/tent.jpg',
    isActive: true,
  },
  {
    _id: '507f1f77bcf86cd799439012',
    name: 'Trailhead Sleeping Bag',
    price: 189.5,
    stock: 5,
    category: 'Hiking',
    image: 'https://images.example.com/bag.jpg',
    isActive: true,
  },
  {
    _id: '507f1f77bcf86cd799439013',
    name: 'Expedition Backpack 65L',
    price: 249.0,
    stock: 8,
    category: 'Hiking',
    image: 'https://images.example.com/pack.jpg',
    isActive: true,
  },
];

describe('RecentlyViewedSection', () => {
  let rootEl;
  let root;
  let originalApiClientGet;

  beforeEach(() => {
    rootEl = mockDoc.createElement('div');
    root = createRoot(rootEl);

    originalApiClientGet = apiClient.get;
    apiClient.get = async (endpoint) => {
      if (endpoint === 'cart') {
        return { data: { cart: { items: [] }, totals: { itemCount: 0, totalQuantity: 0, subtotal: 0 } } };
      }
      if (endpoint === 'wishlist') {
        return { data: { wishlist: { items: [] } } };
      }
      return { data: null };
    };
  });

  afterEach(() => {
    apiClient.get = originalApiClientGet;
  });

const SectionContext = RecentlyViewedSection.RecentlyViewedContext || RecentlyViewedContext;

  async function renderSection(contextValue = {}, props = {}) {
    await act(async () => {
      root.render(
        React.createElement(
          AuthContext.Provider,
          { value: { isAuthenticated: false, isLoading: false, user: null } },
          React.createElement(
            CartProvider,
            null,
            React.createElement(
              WishlistProvider,
              null,
              React.createElement(
                SectionContext.Provider,
                { value: contextValue },
                React.createElement(RecentlyViewedSection, props)
              )
            )
          )
        )
      );
    });
  }

  it('renders products when recentlyViewed has items', async () => {
    const items = [
      { viewedAt: '2026-10-01T10:00:00.000Z', product: SAMPLE_PRODUCTS[0] },
      { viewedAt: '2026-10-01T09:00:00.000Z', product: SAMPLE_PRODUCTS[1] },
    ];

    await renderSection({ recentlyViewed: items, isLoading: false, error: null });

    const text = rootEl.textContent;
    assert.match(text, /Recently Viewed/);
    assert.match(text, /YOUR BROWSING HISTORY/);
    assert.match(text, /Summit Alpine Tent/);
    assert.match(text, /Trailhead Sleeping Bag/);
    assert.match(text, /View All/);
  });

  it('renders nothing (null) when recentlyViewed is empty', async () => {
    await renderSection({ recentlyViewed: [], isLoading: false, error: null });

    assert.equal(rootEl.childNodes.length, 0);
  });

  it('excludes currentProductId from displayed items', async () => {
    const items = [
      { viewedAt: '2026-10-01T10:00:00.000Z', product: SAMPLE_PRODUCTS[0] },
      { viewedAt: '2026-10-01T09:00:00.000Z', product: SAMPLE_PRODUCTS[1] },
    ];

    // Exclude product 0
    await renderSection(
      { recentlyViewed: items, isLoading: false, error: null },
      { currentProductId: '507f1f77bcf86cd799439011' }
    );

    const text = rootEl.textContent;
    assert.doesNotMatch(text, /Summit Alpine Tent/);
    assert.match(text, /Trailhead Sleeping Bag/);
  });

  it('renders nothing when currentProductId is the ONLY item in history', async () => {
    const items = [
      { viewedAt: '2026-10-01T10:00:00.000Z', product: SAMPLE_PRODUCTS[0] },
    ];

    await renderSection(
      { recentlyViewed: items, isLoading: false, error: null },
      { currentProductId: '507f1f77bcf86cd799439011' }
    );

    assert.equal(rootEl.childNodes.length, 0);
  });

  it('renders loading skeleton when isLoading is true and list is empty', async () => {
    await renderSection({ recentlyViewed: [], isLoading: true, error: null });

    assert.ok(rootEl.childNodes.length > 0);
    const section = rootEl.childNodes[0];
    assert.equal(section.getAttribute('aria-labelledby'), 'recently-viewed-heading');
  });

  it('fails silently (returns null) on error without throwing or breaking page', async () => {
    await renderSection({
      recentlyViewed: [],
      isLoading: false,
      error: new Error('Failed to fetch recently viewed'),
    });

    assert.equal(rootEl.childNodes.length, 0);
  });

  it('renders nothing if RecentlyViewedContext is null/missing (graceful fallback)', async () => {
    await act(async () => {
      root.render(React.createElement(RecentlyViewedSection, {}));
    });

    assert.equal(rootEl.childNodes.length, 0);
  });

  it('respects custom title and limit props', async () => {
    const items = SAMPLE_PRODUCTS.map((p) => ({ viewedAt: null, product: p }));

    await renderSection(
      { recentlyViewed: items, isLoading: false, error: null },
      { title: 'Your Recent Gear', limit: 2 }
    );

    const text = rootEl.textContent;
    assert.match(text, /Your Recent Gear/);
    assert.match(text, /Summit Alpine Tent/);
    assert.match(text, /Trailhead Sleeping Bag/);
    assert.doesNotMatch(text, /Expedition Backpack 65L/);
  });
});
