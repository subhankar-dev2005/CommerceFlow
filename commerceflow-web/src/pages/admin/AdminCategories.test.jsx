import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import AdminCategoriesPage from './AdminCategoriesPage.jsx';

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
      if (el.options && (c.tagName === 'OPTION' || c.nodeName === 'OPTION')) {
        el.options.push(c);
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
  location: { pathname: '/admin/categories', search: '' },
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

describe('AdminCategoriesPage UI Integration Tests', () => {
  const mockCategories = [
    {
      name: 'Outdoor Gear',
      totalProducts: 12,
      activeProducts: 10,
      inStockProducts: 9,
      outOfStockProducts: 3,
      totalStock: 85,
    },
    {
      name: 'Apparel',
      totalProducts: 5,
      activeProducts: 5,
      inStockProducts: 5,
      outOfStockProducts: 0,
      totalStock: 40,
    },
  ];

  const mockService = {
    getAdminCategories: async () => ({
      categories: mockCategories,
      totalCategories: 2,
    }),
    renameAdminCategory: async () => ({ success: true }),
    deleteAdminCategory: async () => ({ success: true }),
  };

  it('renders page header and metric summary cards', async () => {
    const { container, unmount } = await renderComponent(
      <AdminCategoriesPage categoryService={mockService} />
    );

    const text = container.textContent;
    assert.ok(text.includes('Categories Management'), 'Should display page title');
    assert.ok(text.includes('Outdoor Gear'), 'Should display Outdoor Gear category');
    assert.ok(text.includes('Apparel'), 'Should display Apparel category');
    assert.ok(text.includes('Total Categories'), 'Should display metric card for total categories');

    await unmount();
  });

  it('renders empty state when no categories exist', async () => {
    const emptyService = {
      getAdminCategories: async () => ({ categories: [], totalCategories: 0 }),
    };

    const { container, unmount } = await renderComponent(
      <AdminCategoriesPage categoryService={emptyService} />
    );

    const text = container.textContent;
    assert.ok(text.includes('No Categories Found'), 'Should display empty state title');

    await unmount();
  });

  it('renders error state and retry button on fetch failure', async () => {
    const failingService = {
      getAdminCategories: async () => {
        throw new Error('Database timeout');
      },
    };

    const { container, unmount } = await renderComponent(
      <AdminCategoriesPage categoryService={failingService} />
    );

    const text = container.textContent;
    assert.ok(text.includes('Could not load categories'), 'Should render error header');
    assert.ok(text.includes('Database timeout'), 'Should display error message');

    await unmount();
  });
});
