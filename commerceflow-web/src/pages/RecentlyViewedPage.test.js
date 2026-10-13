import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import cartContextModule from '../features/cart/cart.context.jsx';
const { CartProvider, AuthContext } = cartContextModule;
import wishlistContextModule from '../features/wishlist/wishlist.context.jsx';
const { WishlistProvider } = wishlistContextModule;
import recentlyViewedContextModule from '../features/recentlyViewed/RecentlyViewedContext.jsx';
const { RecentlyViewedContext } = recentlyViewedContextModule;
import recentlyViewedPageModule from './RecentlyViewedPage.jsx';
const RecentlyViewedPage = recentlyViewedPageModule?.default || recentlyViewedPageModule;
import { apiClient } from '../lib/apiClient.js';

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
    _listeners: listeners,
    removeEventListener: (type, handler) => {
      if (listeners[type]) {
        listeners[type] = listeners[type].filter((h) => h !== handler);
      }
    },
    dispatchEvent: (event) => {
      const type = event?.type;
      const evt = { ...event, target: el };
      for (let curr = el; curr; curr = curr.parentNode) {
        evt.currentTarget = curr;
        if (curr._listeners && curr._listeners[type]) {
          for (const h of curr._listeners[type]) {
            h(evt);
          }
        }
      }
      return true;
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
const winListeners = {};
const mockWin = {
  document: mockDoc,
  Node,
  Element,
  HTMLElement,
  HTMLIFrameElement,
  location: { pathname: '/recently-viewed', search: '' },
  history: { pushState: () => {} },
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
    const handlers = winListeners[event?.type] || [];
    for (const h of handlers) h(event);
    return true;
  },
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
];

describe('RecentlyViewedPage', () => {
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

  async function renderPage(contextValue = {}) {
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
                RecentlyViewedContext.Provider,
                { value: contextValue },
                React.createElement(RecentlyViewedPage, null)
              )
            )
          )
        )
      );
    });
  }

  function findButtons(container) {
    const buttons = [];
    function traverse(node) {
      if (!node) return;
      if (node.tagName === 'BUTTON') buttons.push(node);
      if (node.childNodes) {
        for (const child of node.childNodes) {
          traverse(child);
        }
      }
    }
    traverse(container);
    return buttons;
  }

  it('renders recently viewed products with title, breadcrumbs and product cards', async () => {
    const items = [
      { viewedAt: '2026-10-01T10:00:00.000Z', product: SAMPLE_PRODUCTS[0] },
      { viewedAt: '2026-10-01T09:00:00.000Z', product: SAMPLE_PRODUCTS[1] },
    ];

    await renderPage({
      recentlyViewed: items,
      isLoading: false,
      error: null,
      clearRecentlyViewed: async () => {},
    });

    const text = rootEl.textContent;
    assert.match(text, /Recently Viewed Products/);
    assert.match(text, /BROWSING HISTORY/);
    assert.match(text, /Summit Alpine Tent/);
    assert.match(text, /Trailhead Sleeping Bag/);
    assert.match(text, /Clear History/);
  });

  it('renders empty state when history is empty', async () => {
    await renderPage({
      recentlyViewed: [],
      isLoading: false,
      error: null,
      clearRecentlyViewed: async () => {},
    });

    const text = rootEl.textContent;
    assert.match(text, /No recently viewed products/);
    assert.match(text, /Explore Catalog/);
    assert.doesNotMatch(text, /Clear History/);
  });

  it('renders loading state when isLoading is true and list is empty', async () => {
    await renderPage({
      recentlyViewed: [],
      isLoading: true,
      error: null,
      clearRecentlyViewed: async () => {},
    });

    const text = rootEl.textContent;
    assert.match(text, /Recently Viewed Products/);
    assert.doesNotMatch(text, /No recently viewed products/);
  });

  it('opens confirmation panel on "Clear History" button click', async () => {
    const items = [{ viewedAt: null, product: SAMPLE_PRODUCTS[0] }];

    await renderPage({
      recentlyViewed: items,
      isLoading: false,
      error: null,
      clearRecentlyViewed: async () => {},
    });

    assert.doesNotMatch(rootEl.textContent, /Clear Browsing History\?/);

    const buttons = findButtons(rootEl);
    const clearBtn = buttons.find((b) => b.textContent.includes('Clear History'));
    assert.ok(clearBtn, 'Clear History button exists');

    await act(async () => {
      clearBtn.dispatchEvent({ type: 'click' });
    });

    assert.match(rootEl.textContent, /Clear Browsing History\?/);
    assert.match(rootEl.textContent, /Confirm Clear/);
    assert.match(rootEl.textContent, /Cancel/);
  });

  it('cancels clear when Cancel button is clicked without calling clearRecentlyViewed', async () => {
    let clearCalled = false;
    const items = [{ viewedAt: null, product: SAMPLE_PRODUCTS[0] }];

    await renderPage({
      recentlyViewed: items,
      isLoading: false,
      error: null,
      clearRecentlyViewed: async () => {
        clearCalled = true;
      },
    });

    // Open confirmation
    let buttons = findButtons(rootEl);
    let clearBtn = buttons.find((b) => b.textContent.includes('Clear History'));
    await act(async () => {
      clearBtn.dispatchEvent({ type: 'click' });
    });

    // Click cancel
    buttons = findButtons(rootEl);
    const cancelBtn = buttons.find((b) => b.textContent.includes('Cancel'));
    assert.ok(cancelBtn, 'Cancel button exists');

    await act(async () => {
      cancelBtn.dispatchEvent({ type: 'click' });
    });

    assert.equal(clearCalled, false, 'clearRecentlyViewed was not called');
    assert.doesNotMatch(rootEl.textContent, /Clear Browsing History\?/);
  });

  it('executes clearRecentlyViewed when Confirm Clear is clicked', async () => {
    let clearCalled = false;
    const items = [{ viewedAt: null, product: SAMPLE_PRODUCTS[0] }];

    await renderPage({
      recentlyViewed: items,
      isLoading: false,
      error: null,
      clearRecentlyViewed: async () => {
        clearCalled = true;
      },
    });

    // Open confirmation
    let buttons = findButtons(rootEl);
    let clearBtn = buttons.find((b) => b.textContent.includes('Clear History'));
    await act(async () => {
      clearBtn.dispatchEvent({ type: 'click' });
    });

    // Confirm clear
    buttons = findButtons(rootEl);
    const confirmBtn = buttons.find((b) => b.textContent.includes('Confirm Clear'));
    assert.ok(confirmBtn, 'Confirm Clear button exists');

    await act(async () => {
      confirmBtn.dispatchEvent({ type: 'click' });
    });

    assert.equal(clearCalled, true, 'clearRecentlyViewed was called');
  });

  it('displays action error when clearRecentlyViewed fails', async () => {
    const items = [{ viewedAt: null, product: SAMPLE_PRODUCTS[0] }];

    await renderPage({
      recentlyViewed: items,
      isLoading: false,
      error: null,
      clearRecentlyViewed: async () => {
        throw new Error('Network error clearing history');
      },
    });

    // Open confirmation
    let buttons = findButtons(rootEl);
    let clearBtn = buttons.find((b) => b.textContent.includes('Clear History'));
    await act(async () => {
      clearBtn.dispatchEvent({ type: 'click' });
    });

    // Confirm clear
    buttons = findButtons(rootEl);
    const confirmBtn = buttons.find((b) => b.textContent.includes('Confirm Clear'));
    await act(async () => {
      confirmBtn.dispatchEvent({ type: 'click' });
    });

    assert.match(rootEl.textContent, /Network error clearing history/);
  });

  it('displays fallback notice when partial error occurs with available items', async () => {
    const items = [{ viewedAt: null, product: SAMPLE_PRODUCTS[0] }];

    await renderPage({
      recentlyViewed: items,
      isLoading: false,
      error: new Error('Partial sync error'),
      clearRecentlyViewed: async () => {},
    });

    assert.match(rootEl.textContent, /Some items could not be refreshed from the server/);
    assert.match(rootEl.textContent, /Summit Alpine Tent/);
  });

  it('dismisses clear confirmation dialog when Escape key is pressed', async () => {
    const items = [{ viewedAt: null, product: SAMPLE_PRODUCTS[0] }];

    await renderPage({
      recentlyViewed: items,
      isLoading: false,
      error: null,
      clearRecentlyViewed: async () => {},
    });

    const buttons = findButtons(rootEl);
    const clearBtn = buttons.find((b) => b.textContent.includes('Clear History'));
    assert.ok(clearBtn);

    await act(async () => {
      clearBtn.dispatchEvent({ type: 'click' });
    });

    assert.match(rootEl.textContent, /Clear Browsing History\?/);

    await act(async () => {
      mockWin.dispatchEvent({ type: 'keydown', key: 'Escape' });
    });

    assert.doesNotMatch(rootEl.textContent, /Clear Browsing History\?/);
  });
});
