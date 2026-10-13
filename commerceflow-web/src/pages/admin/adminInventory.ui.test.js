import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import AdminInventoryPageModule from './AdminInventoryPage.jsx';
import { adminInventoryService } from '../../features/admin/adminInventory.service.js';

const AdminInventoryPage = AdminInventoryPageModule?.default || AdminInventoryPageModule;

// Configure React 19 testing environment for act(...)
globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Mock DOM Environment for Node.js
class Node {}
class Element extends Node {}
class HTMLElement extends Element {}
class HTMLIFrameElement extends HTMLElement {}

function createMockElement(tag, doc) {
  const el = new HTMLElement();
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
      const sVal = String(val);
      attributes[name] = sVal;
      if (name === 'id') el.id = sVal;
      if (name === 'aria-label') el.ariaLabel = sVal;
      if (name === 'aria-selected') el.ariaSelected = sVal;
      if (name === 'role') el.role = sVal;
      if (name === 'type') el.type = sVal;
      if (name === 'href') el.href = sVal;
      if (name === 'value') el.value = sVal;
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
      const evt = {
        preventDefault: () => {},
        stopPropagation: () => {},
        ...event,
        target: event?.target || el,
      };
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
    getElementById: () => null,
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
  location: { pathname: '/admin/inventory', search: '' },
  history: { pushState: () => {}, replaceState: () => {} },
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
  URLSearchParams: globalThis.URLSearchParams,
  AbortController: globalThis.AbortController,
};
mockDoc.defaultView = mockWin;

globalThis.window = mockWin;
globalThis.document = mockDoc;
globalThis.Node = Node;
globalThis.Element = Element;
globalThis.HTMLElement = HTMLElement;
globalThis.HTMLIFrameElement = HTMLIFrameElement;

async function renderComponent(ui) {
  const rootEl = mockDoc.createElement('div');
  const root = createRoot(rootEl);
  await act(async () => {
    root.render(ui);
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

function findElement(root, predicate) {
  if (predicate(root)) return root;
  for (const child of root.childNodes || []) {
    if (child.nodeType === 1) {
      const found = findElement(child, predicate);
      if (found) return found;
    }
  }
  return null;
}

function findAllElements(root, predicate) {
  const results = [];
  function recurse(n) {
    if (predicate(n)) results.push(n);
    for (const child of n.childNodes || []) {
      if (child.nodeType === 1) {
        recurse(child);
      }
    }
  }
  recurse(root);
  return results;
}

// ─── Test Fixtures ────────────────────────────────────────────────────────────

const MOCK_SIMPLE_ITEM = {
  id: '507f1f77bcf86cd799439001:simple',
  productId: '507f1f77bcf86cd799439001',
  productName: 'Trailhead Hydration Flask',
  category: 'Accessories',
  type: 'simple',
  sku: 'FLASK-HYD-750',
  variantId: null,
  variantName: null,
  stock: 25,
  stockState: 'inStock',
  isActive: true,
  productImage: 'https://example.com/flask.jpg',
  price: 1299,
};

const MOCK_VARIANT_ITEM_1 = {
  id: '507f1f77bcf86cd799439002:var_red_m',
  productId: '507f1f77bcf86cd799439002',
  productName: 'Alpine Technical Jacket',
  category: 'Apparel',
  type: 'variant',
  sku: 'JCKT-RED-M',
  variantId: 'var_red_m',
  variantName: 'Red / M',
  attributes: { color: 'Red', size: 'M' },
  stock: 4,
  stockState: 'lowStock',
  isActive: true,
  productImage: 'https://example.com/jacket.jpg',
  price: 8999,
};

const MOCK_VARIANT_ITEM_2 = {
  id: '507f1f77bcf86cd799439002:var_blk_l',
  productId: '507f1f77bcf86cd799439002',
  productName: 'Alpine Technical Jacket',
  category: 'Apparel',
  type: 'variant',
  sku: 'JCKT-BLK-L',
  variantId: 'var_blk_l',
  variantName: 'Black / L',
  stock: 0,
  stockState: 'outOfStock',
  isActive: true,
  productImage: 'https://example.com/jacket.jpg',
  price: 8999,
};

const MOCK_INVENTORY_RESPONSE = {
  items: [MOCK_SIMPLE_ITEM, MOCK_VARIANT_ITEM_1, MOCK_VARIANT_ITEM_2],
  summary: {
    totalProducts: 2,
    totalStock: 29,
    lowStockCount: 1,
    outOfStockCount: 1,
    lowStockThreshold: 5,
  },
  pagination: {
    page: 1,
    limit: 10,
    totalProducts: 2,
    totalItems: 3,
    totalPages: 1,
  },
};

describe('Admin Inventory Management UI Integration Tests', () => {
  let originalGetAdminInventory;
  let originalAdjustInventoryStock;

  beforeEach(() => {
    originalGetAdminInventory = adminInventoryService.getAdminInventory;
    originalAdjustInventoryStock = adminInventoryService.adjustInventoryStock;
  });

  afterEach(() => {
    adminInventoryService.getAdminInventory = originalGetAdminInventory;
    adminInventoryService.adjustInventoryStock = originalAdjustInventoryStock;
  });

  describe('Page Rendering & States', () => {
    it('renders page header, KPI summaries, and inventory table', async () => {
      adminInventoryService.getAdminInventory = async () => MOCK_INVENTORY_RESPONSE;

      const { container, unmount } = await renderComponent(
        React.createElement(AdminInventoryPage)
      );
      const text = container.textContent;

      // Header assertions
      assert.ok(text.includes('Inventory Management'), 'Title rendered');
      assert.ok(text.includes('Monitor current stock levels'), 'Subtitle rendered');

      // KPI card assertions
      assert.ok(text.includes('Catalog Products'), 'Catalog products card');
      assert.ok(text.includes('Total Stock Units'), 'Total stock card');
      assert.ok(text.includes('29'), 'Total stock quantity');
      assert.ok(text.includes('Low Stock'), 'Low stock card');
      assert.ok(text.includes('Out of Stock'), 'Out of stock card');

      // Table line items
      assert.ok(text.includes('Trailhead Hydration Flask'), 'Simple product name');
      assert.ok(text.includes('FLASK-HYD-750'), 'Simple product SKU');
      assert.ok(text.includes('Alpine Technical Jacket'), 'Variant product name');
      assert.ok(text.includes('Red / M'), 'Variant 1 name');
      assert.ok(text.includes('Black / L'), 'Variant 2 name');

      await unmount();
    });

    it('renders loading state initially while fetching', async () => {
      adminInventoryService.getAdminInventory = () => new Promise(() => {}); // never resolves

      const { container, unmount } = await renderComponent(
        React.createElement(AdminInventoryPage)
      );

      const text = container.textContent;
      assert.ok(text.includes('Loading inventory records'), 'Loading state rendered');

      await unmount();
    });

    it('renders error state when inventory service fails', async () => {
      adminInventoryService.getAdminInventory = async () => {
        throw new Error('Database cluster timeout');
      };

      const { container, unmount } = await renderComponent(
        React.createElement(AdminInventoryPage)
      );

      const text = container.textContent;
      assert.ok(text.includes('Unable to load inventory records'), 'Error state rendered');
      assert.ok(text.includes('Database cluster timeout'), 'Error message rendered');

      await unmount();
    });

    it('renders empty state when no products exist in catalog', async () => {
      adminInventoryService.getAdminInventory = async () => ({
        items: [],
        summary: { totalProducts: 0, totalStock: 0, lowStockCount: 0, outOfStockCount: 0 },
        pagination: { page: 1, limit: 10, totalProducts: 0, totalItems: 0, totalPages: 1 },
      });

      const { container, unmount } = await renderComponent(
        React.createElement(AdminInventoryPage)
      );

      const text = container.textContent;
      assert.ok(text.includes('No inventory records found'), 'Empty state rendered');

      await unmount();
    });
  });

  describe('Item Representation & Stock Badges', () => {
    it('distinguishes simple products vs variant line items correctly', async () => {
      adminInventoryService.getAdminInventory = async () => MOCK_INVENTORY_RESPONSE;

      const { container, unmount } = await renderComponent(
        React.createElement(AdminInventoryPage)
      );
      const text = container.textContent;

      // Type badges
      assert.ok(text.includes('Simple'), 'Simple badge present');
      assert.ok(text.includes('Variant'), 'Variant badge present');

      // Stock state pills
      assert.ok(text.includes('In Stock (25)'), 'In stock badge');
      assert.ok(text.includes('Low Stock (4)'), 'Low stock badge');
      assert.ok(text.includes('Out of Stock (0)'), 'Out of stock badge');

      await unmount();
    });

    it('exposes and renders actual variant attributes when present on variant items', async () => {
      adminInventoryService.getAdminInventory = async () => MOCK_INVENTORY_RESPONSE;

      const { container, unmount } = await renderComponent(
        React.createElement(AdminInventoryPage)
      );
      const text = container.textContent;
      assert.ok(text.includes('color:'), 'Renders attribute key color');
      assert.ok(text.includes('Red'), 'Renders attribute value Red');
      assert.ok(text.includes('size:'), 'Renders attribute key size');
      assert.ok(text.includes('M'), 'Renders attribute value M');

      await unmount();
    });
  });

  describe('Search & Filtering Controls', () => {
    it('dispatches search query when search prop is passed', async () => {
      let queryReceived = null;
      adminInventoryService.getAdminInventory = async (params) => {
        queryReceived = params;
        return MOCK_INVENTORY_RESPONSE;
      };

      const { unmount } = await renderComponent(
        React.createElement(AdminInventoryPage, { search: '?search=Jacket' })
      );

      assert.equal(queryReceived?.search, 'Jacket');
      await unmount();
    });

    it('respects stock level filter and product type filter from URL params', async () => {
      let queryReceived = null;
      adminInventoryService.getAdminInventory = async (params) => {
        queryReceived = params;
        return MOCK_INVENTORY_RESPONSE;
      };

      const { unmount } = await renderComponent(
        React.createElement(AdminInventoryPage, { search: '?stock=lowStock&type=variant' })
      );

      assert.equal(queryReceived?.stock, 'lowStock');
      assert.equal(queryReceived?.type, 'variant');
      await unmount();
    });
  });

  describe('Manual Stock Adjustment Modal & Workflow', () => {
    it('opens adjustment modal with selected item details and can cancel', async () => {
      adminInventoryService.getAdminInventory = async () => MOCK_INVENTORY_RESPONSE;

      const { container, unmount } = await renderComponent(
        React.createElement(AdminInventoryPage)
      );

      // Find first "Adjust" button
      const adjustButtons = findAllElements(container, (n) =>
        n.tagName === 'BUTTON' && n.textContent.includes('Adjust')
      );
      assert.ok(adjustButtons.length >= 1, 'Adjust buttons rendered');

      // Click to open modal on Simple product
      await act(async () => {
        adjustButtons[0].dispatchEvent({ type: 'click' });
      });

      // Modal is open
      assert.ok(container.textContent.includes('Manual Stock Adjustment'), 'Modal header visible');
      assert.ok(container.textContent.includes('Trailhead Hydration Flask'), 'Product name in modal');
      assert.ok(container.textContent.includes('Current Stock: 25'), 'Current stock in modal');

      // Find Cancel button
      const cancelBtn = findElement(container, (n) =>
        n.tagName === 'BUTTON' && n.textContent === 'Cancel'
      );
      assert.ok(cancelBtn, 'Cancel button exists');

      // Click Cancel
      await act(async () => {
        cancelBtn.dispatchEvent({ type: 'click' });
      });

      // Modal closed
      assert.ok(!container.textContent.includes('Manual Stock Adjustment'), 'Modal dismissed');

      await unmount();
    });

    it('prevents zero adjustment and displays client-side validation error', async () => {
      adminInventoryService.getAdminInventory = async () => MOCK_INVENTORY_RESPONSE;

      const { container, unmount } = await renderComponent(
        React.createElement(AdminInventoryPage)
      );

      const adjustButtons = findAllElements(container, (n) =>
        n.tagName === 'BUTTON' && n.textContent.includes('Adjust')
      );

      await act(async () => {
        adjustButtons[0].dispatchEvent({ type: 'click' });
      });

      // Find modal form
      const modalForms = findAllElements(container, (n) => n.tagName === 'FORM');
      const adjustForm = modalForms[modalForms.length - 1];

      // Submit with default delta = 0
      await act(async () => {
        adjustForm.dispatchEvent({ type: 'submit' });
      });

      assert.ok(container.textContent.includes('Adjustment amount cannot be zero'), 'Zero delta rejected');

      await unmount();
    });

    it('submits valid adjustment for variant item with server-authoritative response', async () => {
      let adjustmentPayload = null;
      adminInventoryService.getAdminInventory = async () => MOCK_INVENTORY_RESPONSE;
      adminInventoryService.adjustInventoryStock = async (payload) => {
        adjustmentPayload = payload;
        return {
          success: true,
          message: 'Inventory adjusted successfully',
          adjustment: {
            id: 'adj_001',
            previousStock: 4,
            adjustment: 2,
            resultingStock: 6,
            reason: 'stock_correction',
          },
        };
      };

      const { container, unmount } = await renderComponent(
        React.createElement(AdminInventoryPage)
      );

      // Open modal on variant item (index 1)
      const adjustButtons = findAllElements(container, (n) =>
        n.tagName === 'BUTTON' && n.textContent.includes('Adjust')
      );

      await act(async () => {
        adjustButtons[1].dispatchEvent({ type: 'click' });
      });

      assert.ok(container.textContent.includes('Alpine Technical Jacket'));
      assert.ok(container.textContent.includes('Variant: Red / M'));

      // Click the Add 1 button twice
      const addBtn = findElement(container, (n) =>
        n.tagName === 'BUTTON' && n.getAttribute('title') === 'Add 1'
      );
      assert.ok(addBtn, 'Add 1 button found');

      await act(async () => {
        addBtn.dispatchEvent({ type: 'click' });
      });
      await act(async () => {
        addBtn.dispatchEvent({ type: 'click' });
      });

      // Submit adjustment
      const modalForms = findAllElements(container, (n) => n.tagName === 'FORM');
      const adjustForm = modalForms[modalForms.length - 1];

      await act(async () => {
        adjustForm.dispatchEvent({ type: 'submit' });
      });

      // Verify payload passed to adminInventoryService
      assert.equal(adjustmentPayload.productId, '507f1f77bcf86cd799439002');
      assert.equal(adjustmentPayload.variantId, 'var_red_m');
      assert.equal(adjustmentPayload.adjustment, 2);
      assert.equal(adjustmentPayload.reason, 'stock_correction');

      // Verify success banner rendered
      assert.ok(container.textContent.includes('Successfully adjusted stock'), 'Success banner shown');
      assert.ok(container.textContent.includes('New stock: 6'), 'Authoritative resulting stock shown');

      await unmount();
    });

    it('displays client error in modal if stock adjustment would reduce stock below zero', async () => {
      adminInventoryService.getAdminInventory = async () => MOCK_INVENTORY_RESPONSE;

      const { container, unmount } = await renderComponent(
        React.createElement(AdminInventoryPage)
      );

      const adjustButtons = findAllElements(container, (n) =>
        n.tagName === 'BUTTON' && n.textContent.includes('Adjust')
      );

      // Open modal on variant item with stock = 4
      await act(async () => {
        adjustButtons[1].dispatchEvent({ type: 'click' });
      });

      const subBtn = findElement(container, (n) =>
        n.tagName === 'BUTTON' && n.getAttribute('title') === 'Subtract 1'
      );
      assert.ok(subBtn, 'Subtract 1 button found');

      // Click Subtract 1 five times (4 - 5 = -1)
      for (let i = 0; i < 5; i++) {
        await act(async () => {
          subBtn.dispatchEvent({ type: 'click' });
        });
      }

      const modalForms = findAllElements(container, (n) => n.tagName === 'FORM');
      const adjustForm = modalForms[modalForms.length - 1];

      await act(async () => {
        adjustForm.dispatchEvent({ type: 'submit' });
      });

      // Modal displays validation error
      assert.ok(container.textContent.includes('Cannot reduce stock below zero'), 'Negative stock rejected');

      await unmount();
    });
  });
});
