import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import AdminDashboardPageModule from './AdminDashboardPage.jsx';
import { adminDashboardService } from '../../features/admin/adminDashboard.service.js';
import { adminAuditService } from '../../features/admin/adminAudit.service.js';
import cartContextModule from '../../features/cart/cart.context.jsx';
import authContextModule from '../../features/auth/auth.context.jsx';

const AdminDashboardPage = AdminDashboardPageModule?.default || AdminDashboardPageModule;
const AuthContext = cartContextModule?.AuthContext || authContextModule?.AuthContext || authContextModule?.default || authContextModule;

// Configure React 19 test environment
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
  location: { pathname: '/admin', search: '' },
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

function findAllElements(root, predicate) {
  const results = [];
  if (predicate(root)) results.push(root);
  for (const child of root.childNodes || []) {
    if (child.nodeType === 1) {
      results.push(...findAllElements(child, predicate));
    }
  }
  return results;
}

const MOCK_ADMIN_USER = {
  _id: '507f1f77bcf86cd799439001',
  name: 'Jane Commander',
  email: 'admin@commerceflow.io',
  role: 'admin',
};

const MOCK_DASHBOARD_DATA = {
  summary: {
    totalProducts: 42,
    activeProducts: 36,
    totalOrders: 28,
    pendingOrders: 5,
    lowStockProducts: 4,
    outOfStockProducts: 2,
    totalCategories: 6,
    totalRevenue: 154000,
  },
  sales: {
    period: '7d',
    currency: 'INR',
    points: [
      { date: '2026-10-01', revenue: 22000, orderCount: 3 },
      { date: '2026-10-02', revenue: 35000, orderCount: 5 },
      { date: '2026-10-03', revenue: 18000, orderCount: 2 },
    ],
    totalRevenue: 75000,
  },
  recentOrders: [
    {
      _id: '6703f1b2c3d4e5f6a7b8c9d1',
      customerName: 'Robert Vance',
      customerEmail: 'robert@example.com',
      status: 'confirmed',
      paymentStatus: 'paid',
      total: 8500,
      totalQuantity: 2,
      createdAt: '2026-10-05T14:30:00Z',
    },
    {
      _id: '6703f1b2c3d4e5f6a7b8c9d2',
      customerName: 'Phyllis Lapin',
      customerEmail: 'phyllis@example.com',
      status: 'pending',
      paymentStatus: 'pending',
      total: 3200,
      totalQuantity: 1,
      createdAt: '2026-10-06T09:15:00Z',
    },
  ],
  recentProducts: [
    {
      _id: '6703a1b2c3d4e5f6a7b8c901',
      name: 'Everest 4-Season Tent',
      category: 'Camping',
      price: 24999,
      stock: 3,
      isActive: true,
      hasVariants: true,
      variantCount: 2,
      sku: 'EV-TENT-4S',
      createdAt: '2026-09-28T10:00:00Z',
    },
  ],
  topSellingProducts: [
    {
      _id: '6703a1b2c3d4e5f6a7b8c901',
      productId: '6703a1b2c3d4e5f6a7b8c901',
      name: 'Everest 4-Season Tent',
      unitsSold: 14,
      revenue: 349986,
    },
  ],
};

describe('AdminDashboardPage UI & Rendering Tests', () => {
  let originalGetSummary;
  let originalGetSales;
  let originalGetAuditLogs;

  beforeEach(() => {
    originalGetSummary = adminDashboardService.getDashboardSummary;
    originalGetSales = adminDashboardService.getDashboardSales;
    originalGetAuditLogs = adminAuditService?.getAdminAuditLogs;
  });

  afterEach(() => {
    adminDashboardService.getDashboardSummary = originalGetSummary;
    adminDashboardService.getDashboardSales = originalGetSales;
    if (adminAuditService) {
      adminAuditService.getAdminAuditLogs = originalGetAuditLogs;
    }
  });

  it('1. dashboard renders', async () => {
    adminDashboardService.getDashboardSummary = async () => MOCK_DASHBOARD_DATA;

    const { container } = await renderComponent(
      React.createElement(
        AuthContext.Provider,
        { value: { user: MOCK_ADMIN_USER } },
        React.createElement(AdminDashboardPage)
      )
    );

    const fullText = container.textContent;
    assert.ok(fullText.includes('Admin Control Panel'), 'Should render Admin Control Panel');
    assert.ok(fullText.includes('Sales Overview'), 'Should render Sales Overview');
    assert.ok(fullText.includes('Recent Orders'), 'Should render Recent Orders');
  });

  it('2. authenticated admin name', async () => {
    adminDashboardService.getDashboardSummary = async () => MOCK_DASHBOARD_DATA;

    const { container } = await renderComponent(
      React.createElement(
        AuthContext.Provider,
        { value: { user: MOCK_ADMIN_USER } },
        React.createElement(AdminDashboardPage)
      )
    );

    const fullText = container.textContent;
    assert.ok(fullText.includes('Welcome back, Jane Commander'), 'Greeting must use authenticated user name');
  });

  it('3. KPI values', async () => {
    adminDashboardService.getDashboardSummary = async () => MOCK_DASHBOARD_DATA;

    const { container } = await renderComponent(
      React.createElement(
        AuthContext.Provider,
        { value: { user: MOCK_ADMIN_USER } },
        React.createElement(AdminDashboardPage)
      )
    );

    const fullText = container.textContent;
    assert.ok(fullText.includes('42'), 'Should render total products (42)');
    assert.ok(fullText.includes('28'), 'Should render total orders (28)');
    assert.ok(fullText.includes('36'), 'Should render active products (36)');
  });

  it('4. revenue', async () => {
    adminDashboardService.getDashboardSummary = async () => MOCK_DASHBOARD_DATA;

    const { container } = await renderComponent(
      React.createElement(
        AuthContext.Provider,
        { value: { user: MOCK_ADMIN_USER } },
        React.createElement(AdminDashboardPage)
      )
    );

    const fullText = container.textContent;
    assert.ok(fullText.includes('1,54,000') || fullText.includes('154,000'), 'Should render formatted revenue');
  });

  it('5. sales chart', async () => {
    adminDashboardService.getDashboardSummary = async () => MOCK_DASHBOARD_DATA;

    const { container } = await renderComponent(
      React.createElement(
        AuthContext.Provider,
        { value: { user: MOCK_ADMIN_USER } },
        React.createElement(AdminDashboardPage)
      )
    );

    const regions = findAllElements(container, (el) => el.getAttribute('role') === 'region');
    assert.ok(regions.length >= 1, 'Sales chart should render an accessible region');

    const svgs = findAllElements(container, (el) => el.tagName === 'SVG');
    assert.ok(svgs.length > 0, 'Sales chart SVG canvas should be rendered');
  });

  it('6. period selector', async () => {
    adminDashboardService.getDashboardSummary = async () => MOCK_DASHBOARD_DATA;
    let requestedPeriod = null;
    adminDashboardService.getDashboardSales = async (period) => {
      requestedPeriod = period;
      return {
        period,
        currency: 'INR',
        points: [{ date: '2026-09-15', revenue: 50000, orderCount: 4 }],
        totalRevenue: 50000,
      };
    };

    const { container } = await renderComponent(
      React.createElement(
        AuthContext.Provider,
        { value: { user: MOCK_ADMIN_USER } },
        React.createElement(AdminDashboardPage)
      )
    );

    const buttons = findAllElements(container, (el) => el.tagName === 'BUTTON' && el.getAttribute('role') === 'tab');
    const btn30d = buttons.find((b) => b.textContent.includes('Last 30 days'));
    assert.ok(btn30d, 'Last 30 days period button should exist');

    await act(async () => {
      btn30d.dispatchEvent({ type: 'click' });
    });

    assert.equal(requestedPeriod, '30d', 'Clicking 30d button should request 30d sales aggregation');
  });

  it('7. recent orders', async () => {
    adminDashboardService.getDashboardSummary = async () => MOCK_DASHBOARD_DATA;

    const { container } = await renderComponent(
      React.createElement(
        AuthContext.Provider,
        { value: { user: MOCK_ADMIN_USER } },
        React.createElement(AdminDashboardPage)
      )
    );

    const fullText = container.textContent;
    assert.ok(fullText.includes('Robert Vance'), 'Should render customer name Robert Vance');
    assert.ok(fullText.includes('Phyllis Lapin'), 'Should render customer name Phyllis Lapin');
    assert.ok(fullText.includes('Confirmed'), 'Should render Confirmed status badge');
    assert.ok(fullText.includes('Pending'), 'Should render Pending status badge');
  });

  it('8. top products', async () => {
    adminDashboardService.getDashboardSummary = async () => MOCK_DASHBOARD_DATA;

    const { container } = await renderComponent(
      React.createElement(
        AuthContext.Provider,
        { value: { user: MOCK_ADMIN_USER } },
        React.createElement(AdminDashboardPage)
      )
    );

    const fullText = container.textContent;
    assert.ok(
      fullText.includes('Top Selling Products') || fullText.includes('Top Products') || fullText.includes('Best Sellers'),
      'Should render top products header'
    );
    assert.ok(fullText.includes('14 sold'), 'Should render units sold from server');
  });

  it('9. secondary metrics', async () => {
    adminDashboardService.getDashboardSummary = async () => MOCK_DASHBOARD_DATA;

    const { container } = await renderComponent(
      React.createElement(
        AuthContext.Provider,
        { value: { user: MOCK_ADMIN_USER } },
        React.createElement(AdminDashboardPage)
      )
    );

    const fullText = container.textContent;
    assert.ok(fullText.includes('Product Categories'), 'Should render Product Categories card');
    assert.ok(fullText.includes('6'), 'Should render 6 categories');
    assert.ok(fullText.includes('Low Stock Items'), 'Should render Low Stock card');
    assert.ok(fullText.includes('4'), 'Should render low stock count (4)');
    assert.ok(fullText.includes('Out of Stock Items'), 'Should render Out of Stock card');
    assert.ok(fullText.includes('2'), 'Should render out of stock count (2)');
  });

  it('10. recent products', async () => {
    adminDashboardService.getDashboardSummary = async () => MOCK_DASHBOARD_DATA;

    const { container } = await renderComponent(
      React.createElement(
        AuthContext.Provider,
        { value: { user: MOCK_ADMIN_USER } },
        React.createElement(AdminDashboardPage)
      )
    );

    const fullText = container.textContent;
    assert.ok(fullText.includes('Everest 4-Season Tent'), 'Should render product name');
    assert.ok(fullText.includes('EV-TENT-4S'), 'Should render variant SKU');
    assert.ok(fullText.includes('3 units'), 'Should render 3 units stock');
    assert.ok(fullText.includes('2 variants'), 'Should indicate 2 variants');
  });

  it('11. quick actions', async () => {
    adminDashboardService.getDashboardSummary = async () => MOCK_DASHBOARD_DATA;

    const { container } = await renderComponent(
      React.createElement(
        AuthContext.Provider,
        { value: { user: MOCK_ADMIN_USER } },
        React.createElement(AdminDashboardPage)
      )
    );

    const fullText = container.textContent;
    assert.ok(fullText.includes('Quick Actions'), 'Should render Quick Actions heading');
    assert.ok(fullText.includes('Add Product'), 'Should render Add Product tile');
    assert.ok(fullText.includes('Manage Inventory'), 'Should render Manage Inventory tile');
    assert.ok(fullText.includes('View Orders'), 'Should render View Orders tile');
    assert.ok(fullText.includes('Manage Customers'), 'Should render Manage Customers tile');
  });

  it('12. Manage Inventory navigation', async () => {
    adminDashboardService.getDashboardSummary = async () => MOCK_DASHBOARD_DATA;

    const { container } = await renderComponent(
      React.createElement(
        AuthContext.Provider,
        { value: { user: MOCK_ADMIN_USER } },
        React.createElement(AdminDashboardPage)
      )
    );

    const links = findAllElements(container, (el) => el.tagName === 'A');
    const hrefs = links.map((l) => l.getAttribute('href'));
    assert.ok(hrefs.includes('/admin/inventory'), 'Must link to /admin/inventory');
  });

  it('13. View Orders navigation', async () => {
    adminDashboardService.getDashboardSummary = async () => MOCK_DASHBOARD_DATA;

    const { container } = await renderComponent(
      React.createElement(
        AuthContext.Provider,
        { value: { user: MOCK_ADMIN_USER } },
        React.createElement(AdminDashboardPage)
      )
    );

    const links = findAllElements(container, (el) => el.tagName === 'A');
    const hrefs = links.map((l) => l.getAttribute('href'));
    assert.ok(hrefs.includes('/admin/orders'), 'Must link to /admin/orders');
  });

  it('14. Add Product navigation', async () => {
    adminDashboardService.getDashboardSummary = async () => MOCK_DASHBOARD_DATA;

    const { container } = await renderComponent(
      React.createElement(
        AuthContext.Provider,
        { value: { user: MOCK_ADMIN_USER } },
        React.createElement(AdminDashboardPage)
      )
    );

    const links = findAllElements(container, (el) => el.tagName === 'A');
    const hrefs = links.map((l) => l.getAttribute('href'));
    assert.ok(hrefs.includes('/admin/products/new'), 'Must link to /admin/products/new');
  });

  it('15. Manage Customers navigation', async () => {
    adminDashboardService.getDashboardSummary = async () => MOCK_DASHBOARD_DATA;

    const { container } = await renderComponent(
      React.createElement(
        AuthContext.Provider,
        { value: { user: MOCK_ADMIN_USER } },
        React.createElement(AdminDashboardPage)
      )
    );

    const links = findAllElements(container, (el) => el.tagName === 'A');
    const hrefs = links.map((l) => l.getAttribute('href'));
    assert.ok(hrefs.includes('/admin/customers'), 'Must link to /admin/customers');
  });

  it('16. loading state', async () => {
    adminDashboardService.getDashboardSummary = () => new Promise(() => {});

    const { container } = await renderComponent(
      React.createElement(
        AuthContext.Provider,
        { value: { user: MOCK_ADMIN_USER } },
        React.createElement(AdminDashboardPage)
      )
    );

    const statusEl = findAllElements(container, (el) => el.getAttribute('role') === 'status');
    assert.ok(statusEl.length > 0, 'Loading status indicator should be present');
    assert.equal(statusEl[0].getAttribute('aria-label'), 'Loading dashboard');
  });

  it('17. error state', async () => {
    adminDashboardService.getDashboardSummary = async () => {
      throw new Error('Database connection timed out');
    };

    const { container } = await renderComponent(
      React.createElement(
        AuthContext.Provider,
        { value: { user: MOCK_ADMIN_USER } },
        React.createElement(AdminDashboardPage)
      )
    );

    const fullText = container.textContent;
    assert.ok(fullText.includes('Unable to load Admin Dashboard'), 'Should render error header');
    assert.ok(fullText.includes('Database connection timed out'), 'Should render error description');

    const buttons = findAllElements(container, (el) => el.tagName === 'BUTTON');
    const retryBtn = buttons.find((b) => b.textContent.includes('Try Again'));
    assert.ok(retryBtn, 'Try Again retry button must be available');
  });

  it('18. empty state', async () => {
    adminDashboardService.getDashboardSummary = async () => ({
      summary: {
        totalProducts: 0,
        activeProducts: 0,
        totalOrders: 0,
        pendingOrders: 0,
        lowStockProducts: 0,
        outOfStockProducts: 0,
        totalCategories: 0,
        totalRevenue: 0,
      },
      sales: { period: '7d', currency: 'INR', points: [], totalRevenue: 0 },
      recentOrders: [],
      recentProducts: [],
      topSellingProducts: [],
    });

    const { container } = await renderComponent(
      React.createElement(
        AuthContext.Provider,
        { value: { user: MOCK_ADMIN_USER } },
        React.createElement(AdminDashboardPage)
      )
    );

    const fullText = container.textContent;
    assert.ok(fullText.includes('No orders recorded'), 'Should display empty order state');
    assert.ok(fullText.includes('No products in catalog'), 'Should display empty product state');
  });

  it('19. system activity empty state', async () => {
    adminDashboardService.getDashboardSummary = async () => ({
      summary: {
        totalProducts: 0,
        activeProducts: 0,
        totalOrders: 0,
        pendingOrders: 0,
        lowStockProducts: 0,
        outOfStockProducts: 0,
        totalCategories: 0,
        totalRevenue: 0,
      },
      sales: { period: '7d', currency: 'INR', points: [], totalRevenue: 0 },
      recentOrders: [],
      recentProducts: [],
      topSellingProducts: [],
    });

    const { container } = await renderComponent(
      React.createElement(
        AuthContext.Provider,
        { value: { user: MOCK_ADMIN_USER } },
        React.createElement(AdminDashboardPage)
      )
    );

    const fullText = container.textContent;
    assert.ok(fullText.includes('No recent activity'), 'Should display honest empty system activity state');
    assert.ok(fullText.includes('Audit Logging: Planned'), 'Should show audit logging planned indicator');
  });

  it('20. no fake activity', async () => {
    adminDashboardService.getDashboardSummary = async () => MOCK_DASHBOARD_DATA;

    const { container } = await renderComponent(
      React.createElement(
        AuthContext.Provider,
        { value: { user: MOCK_ADMIN_USER } },
        React.createElement(AdminDashboardPage)
      )
    );

    const fullText = container.textContent;
    assert.ok(!fullText.includes('Vendor registered'), 'Must NOT invent fake vendor activity');
    assert.ok(!fullText.includes('Product added by Admin'), 'Must NOT invent synthetic audit log');
  });

  it('21. no fake vendor metric', async () => {
    adminDashboardService.getDashboardSummary = async () => MOCK_DASHBOARD_DATA;

    const { container } = await renderComponent(
      React.createElement(
        AuthContext.Provider,
        { value: { user: MOCK_ADMIN_USER } },
        React.createElement(AdminDashboardPage)
      )
    );

    const fullText = container.textContent;
    assert.ok(!fullText.includes('Active Vendors'), 'Must NOT invent Active Vendors metric');
    assert.ok(!fullText.includes('+12%'), 'Must NOT contain fake +12% growth percentage');
    assert.ok(!fullText.includes('+8%'), 'Must NOT contain fake +8% growth percentage');
    assert.ok(!fullText.includes('Sarah Admin'), 'Must NOT hardcode fake administrator Sarah Admin');
  });

  it('22. responsive-safe rendering', async () => {
    adminDashboardService.getDashboardSummary = async () => MOCK_DASHBOARD_DATA;

    const { container } = await renderComponent(
      React.createElement(
        AuthContext.Provider,
        { value: { user: MOCK_ADMIN_USER } },
        React.createElement(AdminDashboardPage)
      )
    );

    const h1List = findAllElements(container, (el) => el.tagName === 'H1');
    assert.equal(h1List.length, 1, 'Should have exactly one h1 for page title');

    const tables = findAllElements(container, (el) => el.tagName === 'TABLE');
    assert.ok(tables.length >= 2, 'Should have accessible tables for recent orders and products');
  });

  it('23. renders real administrative activity when audit service returns live events', async () => {
    adminDashboardService.getDashboardSummary = async () => MOCK_DASHBOARD_DATA;
    adminAuditService.getAdminAuditLogs = async () => ({
      auditLogs: [
        {
          _id: '6703f1b2c3d4e5f6a7b8c9d9',
          eventType: 'PRODUCT_CREATED',
          actorEmail: 'admin@commerceflow.io',
          actorRole: 'admin',
          metadata: { name: 'Summit Expedition Tent' },
          createdAt: '2026-10-06T10:00:00Z',
        },
        {
          _id: '6703f1b2c3d4e5f6a7b8c9d8',
          eventType: 'INVENTORY_ADJUSTED',
          actorEmail: 'admin@commerceflow.io',
          actorRole: 'admin',
          metadata: { productName: 'Summit Tent', adjustment: 10 },
          createdAt: '2026-10-06T09:30:00Z',
        },
      ],
      pagination: { total: 2 },
    });

    const { container } = await renderComponent(
      React.createElement(
        AuthContext.Provider,
        { value: { user: MOCK_ADMIN_USER } },
        React.createElement(AdminDashboardPage)
      )
    );

    const fullText = container.textContent;
    assert.ok(fullText.includes('PRODUCT_CREATED'), 'Should display PRODUCT_CREATED event type');
    assert.ok(fullText.includes('Summit Expedition Tent'), 'Should display product name in activity');
    assert.ok(fullText.includes('INVENTORY_ADJUSTED'), 'Should display INVENTORY_ADJUSTED event type');
    assert.ok(fullText.includes('admin@commerceflow.io'), 'Should display actor email');
    assert.ok(!fullText.includes('No recent activity'), 'Empty state should be suppressed when activities exist');
  });

  it('24. exits loading state on initial request failure and successfully recovers via Try Again retry action', async () => {
    let callCount = 0;
    adminDashboardService.getDashboardSummary = async () => {
      callCount += 1;
      if (callCount === 1) {
        throw new Error('Network timeout');
      }
      return MOCK_DASHBOARD_DATA;
    };

    const { container } = await renderComponent(
      React.createElement(
        AuthContext.Provider,
        { value: { user: MOCK_ADMIN_USER } },
        React.createElement(AdminDashboardPage)
      )
    );

    // Initial render must exit loading and render error state
    const statusEls = findAllElements(container, (el) => el.getAttribute('role') === 'status');
    assert.strictEqual(statusEls.length, 0, 'Skeleton loading must not persist on error');

    const fullText = container.textContent;
    assert.ok(fullText.includes('Unable to load Admin Dashboard'), 'Error title should render');
    assert.ok(fullText.includes('Network timeout'), 'Error description should render');

    // Click retry button
    const buttons = findAllElements(container, (el) => el.tagName === 'BUTTON');
    const retryBtn = buttons.find((b) => b.textContent.includes('Try Again'));
    assert.ok(retryBtn, 'Try Again button must be present');

    await act(async () => {
      retryBtn.dispatchEvent({ type: 'click' });
      await new Promise((r) => setTimeout(r, 20));
    });

    assert.strictEqual(callCount, 2, 'Retry must re-invoke getDashboardSummary');
    assert.ok(container.textContent.includes('₹1,54,000'), 'Dashboard must recover and render revenue');
  });
});
