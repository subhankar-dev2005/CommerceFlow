import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import AdminReportsPage, { sanitizeCsvCell } from './AdminReportsPage.jsx';

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
    click: () => {},
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
  doc.documentElement = createMockElement('html', doc);
  doc.body = createMockElement('body', doc);
  doc.documentElement.appendChild(doc.body);
  return doc;
}

const mockDoc = createMockDocument();
const mockWin = {
  document: mockDoc,
  Node: MockNode,
  Element: MockElement,
  HTMLElement: MockHTMLElement,
  HTMLIFrameElement: MockHTMLIFrameElement,
  location: { pathname: '/admin/reports', search: '' },
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
  URL: {
    createObjectURL: () => 'blob:mock-url',
    revokeObjectURL: () => {},
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
if (!globalThis.URL.createObjectURL) {
  globalThis.URL.createObjectURL = mockWin.URL.createObjectURL;
  globalThis.URL.revokeObjectURL = mockWin.URL.revokeObjectURL;
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

describe('AdminReportsPage UI Integration Tests', () => {
  const mockSales = {
    period: '30d',
    currency: 'INR',
    points: [
      { date: '2026-10-10', revenue: 4500, orderCount: 3 },
      { date: '2026-10-11', revenue: 9800, orderCount: 6 },
    ],
    totalRevenue: 14300,
  };

  const mockSummary = {
    summary: {
      totalProducts: 40,
      totalOrders: 150,
      totalRevenue: 540000,
    },
  };

  const mockTopProducts = [
    {
      productId: 'p1',
      name: 'Alpine Backpack',
      sku: 'ALP-BP-01',
      unitsSold: 25,
      totalRevenue: 75000,
    },
  ];

  const mockService = {
    getDashboardSales: async () => mockSales,
    getDashboardSummary: async () => mockSummary,
    getTopSellingProducts: async () => mockTopProducts,
  };

  it('renders page header, period buttons, and financial KPI cards', async () => {
    const { container, unmount } = await renderComponent(
      <AdminReportsPage dashboardService={mockService} />
    );

    const text = container.textContent;
    assert.ok(text.includes('Analytics & Reports'), 'Should display page title');
    assert.ok(text.includes('Last 7 Days'), 'Should display 7d filter button');
    assert.ok(text.includes('Last 30 Days'), 'Should display 30d filter button');
    assert.ok(text.includes('Export Daily CSV'), 'Should display CSV export button');
    assert.ok(text.includes('Gross Period Revenue'), 'Should display revenue KPI card');
    assert.ok(text.includes('Paid Order Count'), 'Should display order count KPI');

    await unmount();
  });

  it('renders error state on API failure', async () => {
    const failingService = {
      getDashboardSales: async () => {
        throw new Error('Analytics aggregation error');
      },
      getDashboardSummary: async () => ({ summary: {} }),
      getTopSellingProducts: async () => [],
    };

    const { container, unmount } = await renderComponent(
      <AdminReportsPage dashboardService={failingService} />
    );

    const text = container.textContent;
    assert.ok(text.includes('Could not load reports'), 'Should display error title');
    assert.ok(text.includes('Analytics aggregation error'), 'Should display error message');

    await unmount();
  });

  describe('CSV Cell Sanitization & Formula Injection Hardening', () => {
    it('neutralizes malicious formula injection strings starting with =, +, -, @', () => {
      assert.equal(sanitizeCsvCell('=SUM(A1:B10)'), "'=SUM(A1:B10)");
      assert.equal(sanitizeCsvCell('+cmd|/C calc!A0'), "'+cmd|/C calc!A0");
      assert.equal(sanitizeCsvCell('-1+1'), "'-1+1");
      assert.equal(sanitizeCsvCell('@IMPORTXML("url")'), '"\'@IMPORTXML(""url"")"');
    });

    it('neutralizes formulas disguised with leading whitespace, tabs, and carriage returns', () => {
      assert.equal(sanitizeCsvCell('   =1+1'), "'   =1+1");
      assert.equal(sanitizeCsvCell('\t=SUM(1,2)'), '"\'\t=SUM(1,2)"');
      assert.equal(sanitizeCsvCell('\r@malicious'), '"\'\r@malicious"');
      assert.equal(sanitizeCsvCell('\n-cmd'), '"\'\n-cmd"');
    });

    it('preserves legitimate numbers without mangling or prepending quotes', () => {
      assert.equal(sanitizeCsvCell(42), '42');
      assert.equal(sanitizeCsvCell(-15), '-15');
      assert.equal(sanitizeCsvCell(0), '0');
      assert.equal(sanitizeCsvCell(1299.99), '1299.99');
    });

    it('preserves ordinary text that does not start with formula triggers', () => {
      assert.equal(sanitizeCsvCell('Wireless Earbuds Pro'), 'Wireless Earbuds Pro');
      assert.equal(sanitizeCsvCell('Category: Footwear'), 'Category: Footwear');
      assert.equal(sanitizeCsvCell(''), '');
      assert.equal(sanitizeCsvCell(null), '');
      assert.equal(sanitizeCsvCell(undefined), '');
    });

    it('correctly escapes commas, double quotes, and embedded newlines', () => {
      assert.equal(sanitizeCsvCell('Electronics, Gadgets'), '"Electronics, Gadgets"');
      assert.equal(sanitizeCsvCell('Cotton "Organic" T-Shirt'), '"Cotton ""Organic"" T-Shirt"');
      assert.equal(sanitizeCsvCell('Line 1\nLine 2'), '"Line 1\nLine 2"');
    });

    it('handles formula strings that also contain commas or double quotes', () => {
      // Must both neutralize formula trigger and escape quotes/commas for CSV compliance
      const result = sanitizeCsvCell('=HYPERLINK("http://evil.com", "Click")');
      assert.ok(result.startsWith('"\'='), 'Should start with quote followed by neutralized formula indicator');
      assert.ok(result.includes('""http://evil.com""'), 'Internal quotes must be escaped with double quotes');
      assert.ok(result.endsWith('"'), 'Should be closed with a quote');
    });
  });
});
