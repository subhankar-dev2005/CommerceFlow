import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import AdminProductsPageModule from './AdminProductsPage.jsx';
import AdminProductDetailPageModule from './AdminProductDetailPage.jsx';
import AdminProductCreatePageModule from './AdminProductCreatePage.jsx';
import AdminProductEditPageModule from './AdminProductEditPage.jsx';
import VariantManagerModule from '../../components/admin/VariantManager.jsx';
import { adminProductService } from '../../features/admin/adminProduct.service.js';

const AdminProductsPage = AdminProductsPageModule?.default || AdminProductsPageModule;
const AdminProductDetailPage = AdminProductDetailPageModule?.default || AdminProductDetailPageModule;
const AdminProductCreatePage = AdminProductCreatePageModule?.default || AdminProductCreatePageModule;
const AdminProductEditPage = AdminProductEditPageModule?.default || AdminProductEditPageModule;
const VariantManager = VariantManagerModule?.default || VariantManagerModule;

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
  location: { pathname: '/admin/products', search: '' },
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

describe('Admin Product Management UI Integration Tests', () => {
  let originalGetProducts;
  let originalGetProductById;
  let originalCreateProduct;
  let originalUpdateProduct;
  let originalUpdateProductStatus;

  beforeEach(() => {
    originalGetProducts = adminProductService.getProducts;
    originalGetProductById = adminProductService.getProductById;
    originalCreateProduct = adminProductService.createProduct;
    originalUpdateProduct = adminProductService.updateProduct;
    originalUpdateProductStatus = adminProductService.updateProductStatus;
  });

  afterEach(() => {
    adminProductService.getProducts = originalGetProducts;
    adminProductService.getProductById = originalGetProductById;
    adminProductService.createProduct = originalCreateProduct;
    adminProductService.updateProduct = originalUpdateProduct;
    adminProductService.updateProductStatus = originalUpdateProductStatus;
  });

  describe('AdminProductsPage Component', () => {
    it('renders products table with catalog products and indicators', async () => {
      const mockProducts = [
        {
          _id: '507f1f77bcf86cd799439011',
          name: 'Alpine Expedition Tent',
          category: 'Camping',
          price: 14999,
          stock: 12,
          sku: 'TENT-ALP',
          isActive: true,
          variants: [
            { variantId: 'v1', sku: 'TENT-ALP-1', stock: 6, isActive: true },
            { variantId: 'v2', sku: 'TENT-ALP-2', stock: 6, isActive: true },
          ],
          createdAt: '2026-03-01T10:00:00.000Z',
        },
        {
          _id: '507f1f77bcf86cd799439012',
          name: 'Classic Trekking Poles',
          category: 'Hiking',
          price: 2499,
          stock: 0,
          sku: 'POLE-TRK',
          isActive: false,
          variants: [],
          createdAt: '2026-03-02T10:00:00.000Z',
        },
      ];

      adminProductService.getProducts = async () => ({
        products: mockProducts,
        pagination: { page: 1, limit: 10, totalProducts: 2, totalPages: 1 },
      });

      const { container, unmount } = await renderComponent(
        React.createElement(AdminProductsPage)
      );

      const text = container.textContent;
      assert.ok(text.includes('Product Catalog Management'), 'Page title rendered');
      assert.ok(text.includes('Alpine Expedition Tent'), 'Product 1 name rendered');
      assert.ok(text.includes('Classic Trekking Poles'), 'Product 2 name rendered');
      assert.ok(text.includes('Camping'), 'Category 1 rendered');
      assert.ok(text.includes('Hiking'), 'Category 2 rendered');
      assert.ok(text.includes('2 variants'), 'Variant badge rendered');
      assert.ok(text.includes('Simple'), 'Simple product indicator rendered');
      assert.ok(text.includes('Active'), 'Active status rendered');
      assert.ok(text.includes('Inactive'), 'Inactive status rendered');

      await unmount();
    });

    it('renders empty state when no products match filters', async () => {
      adminProductService.getProducts = async () => ({
        products: [],
        pagination: { page: 1, limit: 10, totalProducts: 0, totalPages: 1 },
      });

      const { container, unmount } = await renderComponent(
        React.createElement(AdminProductsPage)
      );

      const text = container.textContent;
      assert.ok(text.includes('No products found'), 'Empty state rendered');

      await unmount();
    });

    it('renders error state when API fails', async () => {
      adminProductService.getProducts = async () => {
        throw new Error('Catalog service temporarily unavailable');
      };

      const { container, unmount } = await renderComponent(
        React.createElement(AdminProductsPage)
      );

      const text = container.textContent;
      assert.ok(text.includes('Unable to load catalog'), 'Error title rendered');
      assert.ok(text.includes('Catalog service temporarily unavailable'), 'Error message displayed');

      await unmount();
    });
  });

  describe('AdminProductDetailPage Component', () => {
    it('renders comprehensive product details with variant table and audit metadata', async () => {
      const mockProduct = {
        _id: '507f1f77bcf86cd799439011',
        name: 'Alpine Expedition Tent',
        description: 'Professional grade mountain tent with high wind resistance.',
        category: 'Camping',
        price: 14999,
        stock: 25,
        isActive: true,
        sku: 'TENT-ALP',
        image: 'https://example.com/tent.jpg',
        specifications: [
          { label: 'Weight', value: '3.2 kg' },
          { label: 'Capacity', value: '3 Persons' },
        ],
        variants: [
          {
            variantId: 'var_1',
            sku: 'TENT-ALP-OL-3',
            attributes: { color: 'Olive', capacity: '3P' },
            price: 14999,
            stock: 15,
            isActive: true,
          },
          {
            variantId: 'var_2',
            sku: 'TENT-ALP-BK-3',
            attributes: { color: 'Black', capacity: '3P' },
            price: 15999,
            stock: 10,
            isActive: true,
          },
        ],
        createdAt: '2026-03-01T10:00:00.000Z',
        updatedAt: '2026-03-05T14:30:00.000Z',
      };

      adminProductService.getProductById = async (id) => {
        assert.equal(id, '507f1f77bcf86cd799439011');
        return mockProduct;
      };

      const { container, unmount } = await renderComponent(
        React.createElement(AdminProductDetailPage, { productId: '507f1f77bcf86cd799439011' })
      );

      const text = container.textContent;
      assert.ok(text.includes('Alpine Expedition Tent'), 'Title rendered');
      assert.ok(text.includes('Professional grade mountain tent'), 'Description rendered');
      assert.ok(text.includes('TENT-ALP-OL-3'), 'Variant 1 SKU rendered');
      assert.ok(text.includes('TENT-ALP-BK-3'), 'Variant 2 SKU rendered');
      assert.ok(text.includes('Weight'), 'Spec label rendered');
      assert.ok(text.includes('3.2 kg'), 'Spec value rendered');
      assert.ok(text.includes('Audit & Metadata'), 'Audit section rendered');
      assert.ok(text.includes('Public Storefront'), 'Catalog visibility rendered');

      await unmount();
    });

    it('renders not found error state when product id is missing or not found', async () => {
      adminProductService.getProductById = async () => {
        throw new Error('Product not found');
      };

      const { container, unmount } = await renderComponent(
        React.createElement(AdminProductDetailPage, { productId: '507f1f77bcf86cd799439099' })
      );

      const text = container.textContent;
      assert.ok(text.includes('Product Not Found'), 'Product not found state displayed');

      await unmount();
    });
  });

  describe('VariantManager Component', () => {
    it('renders variant list, dynamic attributes, and summary stats', async () => {
      const mockVariants = [
        {
          variantId: 'v1',
          sku: 'JACKET-RED-M',
          attributes: { color: 'Red', size: 'M' },
          price: 4999,
          stock: 8,
          isActive: true,
        },
      ];

      let lastVariants = null;
      const { container, unmount } = await renderComponent(
        React.createElement(VariantManager, {
          variants: mockVariants,
          onChange: (v) => {
            lastVariants = v;
          },
          basePrice: 4500,
          baseSku: 'JACKET',
        })
      );

      const text = container.textContent;
      assert.ok(text.includes('Variants (1)'), 'Variant count header rendered');
      assert.ok(text.includes('8 units'), 'Total stock rendered');
      assert.ok(text.includes('JACKET-RED-M'), 'Variant SKU rendered');
      assert.ok(text.includes('Red'), 'Color attribute rendered');
      assert.ok(text.includes('M'), 'Size attribute rendered');

      await unmount();
    });
  });

  describe('AdminProductCreatePage Component', () => {
    it('renders structured sections including Product Information, Pricing, and Product Type', async () => {
      const { container, unmount } = await renderComponent(
        React.createElement(AdminProductCreatePage)
      );

      const text = container.textContent;
      assert.ok(text.includes('Create New Product'), 'Page title rendered');
      assert.ok(text.includes('1. Product Information'), 'Section 1 rendered');
      assert.ok(text.includes('2. Pricing & Base Inventory'), 'Section 2 rendered');
      assert.ok(text.includes('3. Product Type & Variants'), 'Section 3 rendered');
      assert.ok(text.includes('4. Media & Gallery'), 'Section 4 rendered');
      assert.ok(text.includes('5. Technical Specifications'), 'Section 5 rendered');
      assert.ok(text.includes('Simple Product'), 'Simple toggle button rendered');
      assert.ok(text.includes('Variant Product'), 'Variant toggle button rendered');

      await unmount();
    });
  });

  describe('AdminProductEditPage Component', () => {
    it('pre-populates existing product data and variants', async () => {
      const mockProduct = {
        _id: '507f1f77bcf86cd799439011',
        name: 'Trail Running Shoes',
        description: 'All-terrain lightweight trail shoes with Vibram sole.',
        category: 'Footwear',
        price: 7999,
        stock: 14,
        isActive: true,
        variants: [
          {
            variantId: 'var_shoe_1',
            sku: 'SHOE-BLK-42',
            attributes: { color: 'Black', size: '42' },
            price: 7999,
            stock: 14,
            isActive: true,
          },
        ],
      };

      adminProductService.getProductById = async () => mockProduct;

      const { container, unmount } = await renderComponent(
        React.createElement(AdminProductEditPage, { productId: '507f1f77bcf86cd799439011' })
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const text = container.textContent;
      assert.ok(text.includes('Edit Product'), 'Page title rendered');
      assert.ok(text.includes('507f1f77bcf86cd799439011'), 'Product ID rendered');
      assert.ok(text.includes('SHOE-BLK-42'), 'Variant SKU rendered');

      await unmount();
    });
  });
});
