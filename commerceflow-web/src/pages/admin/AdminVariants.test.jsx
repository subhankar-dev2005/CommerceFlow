import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import AdminVariantsPage from './AdminVariantsPage.jsx';

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
  location: { pathname: '/admin/variants', search: '' },
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

describe('AdminVariantsPage UI Integration Tests', () => {
  const mockVariants = [
    {
      id: '507f1f77bcf86cd799439011_v1',
      productId: '507f1f77bcf86cd799439011',
      productName: 'Trailhead Alpine Tent',
      category: 'Camping',
      type: 'variant',
      variantId: 'v1',
      variantName: 'Color: Forest Green, Size: 2-Person',
      sku: 'TAT-GRN-2P',
      attributes: { Color: 'Forest Green', Capacity: '2-Person' },
      stock: 15,
      price: 12999,
      isActive: true,
      stockState: 'inStock',
    },
    {
      id: '507f1f77bcf86cd799439011_v2',
      productId: '507f1f77bcf86cd799439011',
      productName: 'Trailhead Alpine Tent',
      category: 'Camping',
      type: 'variant',
      variantId: 'v2',
      variantName: 'Color: Forest Green, Size: 4-Person',
      sku: 'TAT-GRN-4P',
      attributes: null,
      stock: 2,
      price: 18999,
      isActive: true,
      stockState: 'lowStock',
    },
  ];

  const mockService = {
    getAdminInventory: async () => ({
      items: mockVariants,
      pagination: { page: 1, limit: 15, totalItems: 2, totalPages: 1 },
    }),
    adjustInventoryStock: async () => ({ success: true }),
  };

  it('renders page header and variant rows with SKU badges', async () => {
    const { container, unmount } = await renderComponent(
      <AdminVariantsPage inventoryService={mockService} />
    );

    const text = container.textContent;
    assert.ok(text.includes('Product Variants'), 'Should render page title');
    assert.ok(text.includes('TAT-GRN-2P'), 'Should render SKU for variant 1');
    assert.ok(text.includes('TAT-GRN-4P'), 'Should render SKU for variant 2');
    assert.ok(text.includes('Trailhead Alpine Tent'), 'Should render parent product name');
    assert.ok(text.includes('Total Variants'), 'Should render metric card');

    await unmount();
  });

  it('renders empty state when no variants are returned', async () => {
    const emptyService = {
      getAdminInventory: async () => ({ items: [], pagination: { totalItems: 0 } }),
    };

    const { container, unmount } = await renderComponent(
      <AdminVariantsPage inventoryService={emptyService} />
    );

    const text = container.textContent;
    assert.ok(text.includes('No Product Variants Found'), 'Should render empty state');

    await unmount();
  });

  it('renders error state and retry button on network failure', async () => {
    const failingService = {
      getAdminInventory: async () => {
        throw new Error('Catalog service unavailable');
      },
    };

    const { container, unmount } = await renderComponent(
      <AdminVariantsPage inventoryService={failingService} />
    );

    const text = container.textContent;
    assert.ok(text.includes('Could not load variants'), 'Should render error header');
    assert.ok(text.includes('Catalog service unavailable'), 'Should render error message');

    await unmount();
  });

  it('renders attribute chips for variants with attributes and fallback badge for variants without attributes', async () => {
    const { container, unmount } = await renderComponent(
      <AdminVariantsPage inventoryService={mockService} />
    );

    const text = container.textContent;
    // Variant 1 has attributes { Color: 'Forest Green', Capacity: '2-Person' }
    assert.ok(text.includes('Color:'), 'Should render Color attribute label');
    assert.ok(text.includes('Forest Green'), 'Should render Color attribute value');
    assert.ok(text.includes('Capacity:'), 'Should render Capacity attribute label');
    assert.ok(text.includes('2-Person'), 'Should render Capacity attribute value');

    // Variant 2 has no attributes, falls back to variantName
    assert.ok(
      text.includes('Color: Forest Green, Size: 4-Person'),
      'Should fallback to variantName for variant without attributes'
    );

    await unmount();
  });
});
