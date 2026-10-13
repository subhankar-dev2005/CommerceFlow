import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import adminCustomersPageModule from './AdminCustomersPage.jsx';
import adminCustomerDetailsPageModule from './AdminCustomerDetailsPage.jsx';
import { adminCustomerService } from '../../features/admin/adminCustomer.service.js';
import { ApiError } from '../../lib/apiClient.js';

const AdminCustomersPage = adminCustomersPageModule?.default || adminCustomersPageModule;
const AdminCustomerDetailsPage = adminCustomerDetailsPageModule?.default || adminCustomerDetailsPageModule;

// Configure React 19 testing environment for act(...)
globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Mock DOM for React 19 testing in Node
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
      if (name === 'aria-checked') el.ariaChecked = sVal;
      if (name === 'aria-label') el.ariaLabel = sVal;
      if (name === 'role') el.role = sVal;
      if (name === 'type') el.type = sVal;
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
  location: { pathname: '/admin/customers', search: '' },
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

// ─── Test Fixtures ────────────────────────────────────────────────────────────

const MOCK_CUSTOMER_ACTIVE = {
  _id: '507f1f77bcf86cd799439002',
  id: '507f1f77bcf86cd799439002',
  name: 'Alice Johnson',
  email: 'alice@example.com',
  role: 'customer',
  isActive: true,
  createdAt: '2026-01-15T10:00:00.000Z',
  updatedAt: '2026-03-30T10:00:00.000Z',
};

const MOCK_CUSTOMER_INACTIVE = {
  _id: '507f1f77bcf86cd799439003',
  id: '507f1f77bcf86cd799439003',
  name: 'Bob Smith',
  email: 'bob@example.com',
  role: 'customer',
  isActive: false,
  createdAt: '2026-02-10T11:00:00.000Z',
  updatedAt: '2026-03-29T11:00:00.000Z',
};

const MOCK_DETAIL_DATA = {
  customer: MOCK_CUSTOMER_ACTIVE,
  addresses: [
    {
      _id: '607f1f77bcf86cd799439011',
      fullName: 'Alice Johnson',
      phone: '9876543210',
      addressLine1: '123 Elm St',
      city: 'Mumbai',
      state: 'Maharashtra',
      postalCode: '400001',
      country: 'India',
      isDefault: true,
    },
  ],
  orderStats: {
    totalOrders: 4,
    totalSpent: 8500,
    lastOrderDate: '2026-03-15T12:00:00.000Z',
  },
  recentOrders: [
    {
      _id: '707f1f77bcf86cd799439021',
      status: 'delivered',
      paymentStatus: 'paid',
      shipmentStatus: 'delivered',
      total: 2500,
      itemCount: 2,
      createdAt: '2026-03-15T12:00:00.000Z',
    },
  ],
};

describe('P1.3 Step 79.6 — Admin Customers Frontend UI Tests', () => {
  let origGetCustomers;
  let origGetCustomer;
  let origUpdateStatus;

  beforeEach(() => {
    origGetCustomers = adminCustomerService.getAdminCustomers;
    origGetCustomer = adminCustomerService.getAdminCustomer;
    origUpdateStatus = adminCustomerService.updateAdminCustomerStatus;
  });

  afterEach(() => {
    adminCustomerService.getAdminCustomers = origGetCustomers;
    adminCustomerService.getAdminCustomer = origGetCustomer;
    adminCustomerService.updateAdminCustomerStatus = origUpdateStatus;
  });

  describe('AdminCustomersPage', () => {
    it('renders customer list title, customer data, and active status badge', async () => {
      adminCustomerService.getAdminCustomers = async () => ({
        customers: [MOCK_CUSTOMER_ACTIVE, MOCK_CUSTOMER_INACTIVE],
        pagination: { page: 1, limit: 10, totalCustomers: 2, totalPages: 1 },
      });

      const { container, unmount } = await renderComponent(
        React.createElement(AdminCustomersPage)
      );
      const text = container.textContent;

      assert.ok(text.includes('Customers'));
      assert.ok(text.includes('Alice Johnson'));
      assert.ok(text.includes('alice@example.com'));
      assert.ok(text.includes('Active'));
      assert.ok(text.includes('Bob Smith'));
      assert.ok(text.includes('bob@example.com'));
      assert.ok(text.includes('Inactive'));

      // Security check: Never display sensitive fields or mock secrets
      assert.ok(!text.includes('password'));
      assert.ok(!text.includes('passwordHash'));
      assert.ok(!text.includes('JWT'));

      await unmount();
    });

    it('renders deactivate action for active customer and activate action for inactive customer', async () => {
      adminCustomerService.getAdminCustomers = async () => ({
        customers: [MOCK_CUSTOMER_ACTIVE, MOCK_CUSTOMER_INACTIVE],
        pagination: { page: 1, limit: 10, totalCustomers: 2, totalPages: 1 },
      });

      const { container, unmount } = await renderComponent(
        React.createElement(AdminCustomersPage)
      );
      const text = container.textContent;

      assert.ok(text.includes('Deactivate'));
      assert.ok(text.includes('Activate'));
      assert.ok(text.includes('View Details'));

      await unmount();
    });

    it('renders empty state when no customers match filter', async () => {
      adminCustomerService.getAdminCustomers = async () => ({
        customers: [],
        pagination: { page: 1, limit: 10, totalCustomers: 0, totalPages: 1 },
      });

      const { container, unmount } = await renderComponent(
        React.createElement(AdminCustomersPage)
      );
      const text = container.textContent;

      assert.ok(text.includes('No customer accounts in system'));

      await unmount();
    });

    it('renders error state with retry button on API failure', async () => {
      adminCustomerService.getAdminCustomers = async () => {
        throw new Error('Connection refused');
      };

      const { container, unmount } = await renderComponent(
        React.createElement(AdminCustomersPage)
      );
      const text = container.textContent;

      assert.ok(text.includes('Unable to load customers'));
      assert.ok(text.includes('Connection refused'));

      await unmount();
    });

    it('opens confirmation modal on deactivate click, cancels without mutating, and confirms mutation with correct payload', async () => {
      let statusCallPayload = null;
      adminCustomerService.getAdminCustomers = async () => ({
        customers: [MOCK_CUSTOMER_ACTIVE],
        pagination: { page: 1, limit: 10, totalCustomers: 1, totalPages: 1 },
      });
      adminCustomerService.updateAdminCustomerStatus = async (id, isActive) => {
        statusCallPayload = { id, isActive };
        return { ...MOCK_CUSTOMER_ACTIVE, isActive };
      };

      const { container, unmount } = await renderComponent(
        React.createElement(AdminCustomersPage)
      );

      // Verify initial state shows Deactivate button
      assert.ok(container.textContent.includes('Deactivate'));

      // Find Deactivate button
      const deactivateBtn = findElement(container, (n) =>
        n.tagName === 'BUTTON' && n.textContent.includes('Deactivate')
      );
      assert.ok(deactivateBtn, 'Deactivate button must exist');

      // Click Deactivate button to open modal
      await act(async () => {
        deactivateBtn.dispatchEvent({ type: 'click' });
      });

      // Confirmation modal is rendered with details and security warnings
      assert.ok(container.textContent.includes('Deactivate Customer Account?'));
      assert.ok(container.textContent.includes('Alice Johnson'));
      assert.ok(container.textContent.includes('Historical orders, addresses, reviews, and commerce data are fully preserved'));

      // Find Cancel button in modal
      const cancelBtn = findElement(container, (n) =>
        n.tagName === 'BUTTON' && n.textContent === 'Cancel'
      );
      assert.ok(cancelBtn, 'Cancel button must exist');

      // Cancel modal
      await act(async () => {
        cancelBtn.dispatchEvent({ type: 'click' });
      });

      // Modal closed and no mutation called
      assert.equal(statusCallPayload, null);
      assert.ok(!container.textContent.includes('Deactivate Customer Account?'));

      // Open modal again
      const reopenBtn = findElement(container, (n) =>
        n.tagName === 'BUTTON' && n.textContent.includes('Deactivate')
      );
      await act(async () => {
        reopenBtn.dispatchEvent({ type: 'click' });
      });

      // Find Confirm Deactivation button
      const confirmBtn = findElement(container, (n) =>
        n.tagName === 'BUTTON' && n.textContent.includes('Confirm Deactivation')
      );
      assert.ok(confirmBtn, 'Confirm button must exist');

      // Click Confirm Deactivation
      await act(async () => {
        confirmBtn.dispatchEvent({ type: 'click' });
      });

      // Verify updateAdminCustomerStatus was called with exact customerId and false
      assert.deepEqual(statusCallPayload, {
        id: MOCK_CUSTOMER_ACTIVE._id,
        isActive: false,
      });

      // Success toast appears
      assert.ok(container.textContent.includes('successfully deactivated'));

      // Customer row in table now reflects Inactive state and shows Activate button
      assert.ok(container.textContent.includes('Inactive'));
      assert.ok(container.textContent.includes('Activate'));

      await unmount();
    });

    it('handles status mutation failure by displaying error and preserving current state', async () => {
      adminCustomerService.getAdminCustomers = async () => ({
        customers: [MOCK_CUSTOMER_ACTIVE],
        pagination: { page: 1, limit: 10, totalCustomers: 1, totalPages: 1 },
      });
      adminCustomerService.updateAdminCustomerStatus = async () => {
        throw new Error('Database connection timeout');
      };

      const { container, unmount } = await renderComponent(
        React.createElement(AdminCustomersPage)
      );

      const deactivateBtn = findElement(container, (n) =>
        n.tagName === 'BUTTON' && n.textContent.includes('Deactivate')
      );
      await act(async () => {
        deactivateBtn.dispatchEvent({ type: 'click' });
      });

      const confirmBtn = findElement(container, (n) =>
        n.tagName === 'BUTTON' && n.textContent.includes('Confirm Deactivation')
      );
      await act(async () => {
        confirmBtn.dispatchEvent({ type: 'click' });
      });

      // Error message is displayed in modal
      assert.ok(container.textContent.includes('Database connection timeout'));
      // State is preserved (still active in background list)
      assert.ok(container.textContent.includes('Active'));

      await unmount();
    });

    it('re-fetches customer list on retry click after initial failure', async () => {
      let callCount = 0;
      adminCustomerService.getAdminCustomers = async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Network timeout');
        }
        return {
          customers: [MOCK_CUSTOMER_ACTIVE],
          pagination: { page: 1, limit: 10, totalCustomers: 1, totalPages: 1 },
        };
      };

      const { container, unmount } = await renderComponent(
        React.createElement(AdminCustomersPage)
      );

      assert.ok(container.textContent.includes('Unable to load customers'));
      assert.ok(container.textContent.includes('Network timeout'));

      const retryBtn = findElement(container, (n) =>
        n.tagName === 'BUTTON' && n.textContent.includes('Try Again')
      );
      assert.ok(retryBtn, 'Retry button must exist in error state');

      await act(async () => {
        retryBtn.dispatchEvent({ type: 'click' });
      });

      assert.equal(callCount, 2);
      assert.ok(container.textContent.includes('Alice Johnson'));
      assert.ok(!container.textContent.includes('Unable to load customers'));

      await unmount();
    });

    it('prevents concurrent duplicate status mutation requests while confirm is pending', async () => {
      let mutationCalls = 0;
      let resolveMutation;
      const mutationPromise = new Promise((res) => {
        resolveMutation = res;
      });

      adminCustomerService.getAdminCustomers = async () => ({
        customers: [MOCK_CUSTOMER_ACTIVE],
        pagination: { page: 1, limit: 10, totalCustomers: 1, totalPages: 1 },
      });
      adminCustomerService.updateAdminCustomerStatus = async (id, isActive) => {
        mutationCalls++;
        await mutationPromise;
        return { ...MOCK_CUSTOMER_ACTIVE, isActive };
      };

      const { container, unmount } = await renderComponent(
        React.createElement(AdminCustomersPage)
      );

      const deactivateBtn = findElement(container, (n) =>
        n.tagName === 'BUTTON' && n.textContent.includes('Deactivate')
      );
      await act(async () => {
        deactivateBtn.dispatchEvent({ type: 'click' });
      });

      const confirmBtn = findElement(container, (n) =>
        n.tagName === 'BUTTON' && n.textContent.includes('Confirm Deactivation')
      );
      assert.ok(confirmBtn);

      // Trigger first confirm
      let firstClickPromise;
      await act(async () => {
        firstClickPromise = confirmBtn.dispatchEvent({ type: 'click' });
      });

      assert.equal(mutationCalls, 1);

      // Attempt second confirm while first is still pending
      await act(async () => {
        confirmBtn.dispatchEvent({ type: 'click' });
      });

      // Still exactly 1 call
      assert.equal(mutationCalls, 1);

      // Complete mutation
      await act(async () => {
        resolveMutation();
        await firstClickPromise;
      });

      assert.equal(mutationCalls, 1);
      assert.ok(container.textContent.includes('successfully deactivated'));

      await unmount();
    });
  });

  describe('AdminCustomerDetailsPage', () => {
    it('renders customer identity, status, order statistics, addresses, and recent orders', async () => {
      adminCustomerService.getAdminCustomer = async () => MOCK_DETAIL_DATA;

      const { container, unmount } = await renderComponent(
        React.createElement(AdminCustomerDetailsPage, { customerId: MOCK_CUSTOMER_ACTIVE._id })
      );
      const text = container.textContent;

      assert.ok(text.includes('Alice Johnson'));
      assert.ok(text.includes('alice@example.com'));
      assert.ok(text.includes('Active Account'));

      // Order summary cards: Authoritative server numbers displayed
      assert.ok(text.includes('Total Orders Placed'));
      assert.ok(text.includes('4'));
      assert.ok(text.includes('Total Spend'));
      // Formatted with formatPrice (₹8,500)
      assert.ok(text.includes('8,500'));

      // Delivery addresses
      assert.ok(text.includes('Saved Delivery Addresses'));
      assert.ok(text.includes('Default Address'));
      assert.ok(text.includes('123 Elm St'));
      assert.ok(text.includes('Mumbai'));

      // Recent orders
      assert.ok(text.includes('Recent Orders'));
      assert.ok(text.includes('707f1f77bcf86cd799439021'));
      assert.ok(text.includes('2,500'));

      // Action button
      assert.ok(text.includes('Deactivate Account'));

      // Security: Never display passwords or hashes
      assert.ok(!text.includes('password'));
      assert.ok(!text.includes('passwordHash'));

      await unmount();
    });

    it('renders empty address and empty order states gracefully when lists are empty', async () => {
      adminCustomerService.getAdminCustomer = async () => ({
        customer: MOCK_CUSTOMER_INACTIVE,
        addresses: [],
        orderStats: { totalOrders: 0, totalSpent: 0, lastOrderDate: null },
        recentOrders: [],
      });

      const { container, unmount } = await renderComponent(
        React.createElement(AdminCustomerDetailsPage, { customerId: MOCK_CUSTOMER_INACTIVE._id })
      );
      const text = container.textContent;

      assert.ok(text.includes('No saved delivery addresses found'));
      assert.ok(text.includes('No orders placed by this customer yet'));
      assert.ok(text.includes('Activate Account'));

      await unmount();
    });

    it('renders Customer Not Found view when API returns 404', async () => {
      adminCustomerService.getAdminCustomer = async () => {
        throw new ApiError({
          status: 404,
          code: 'CUSTOMER_NOT_FOUND',
          message: 'Customer not found',
        });
      };

      const { container, unmount } = await renderComponent(
        React.createElement(AdminCustomerDetailsPage, { customerId: '507f1f77bcf86cd799439099' })
      );
      const text = container.textContent;

      assert.ok(text.includes('Customer Not Found'));
      assert.ok(text.includes('Return to Customers'));

      await unmount();
    });

    it('allows activating/deactivating customer from the detail page with confirmation', async () => {
      let updatePayload = null;
      adminCustomerService.getAdminCustomer = async () => MOCK_DETAIL_DATA;
      adminCustomerService.updateAdminCustomerStatus = async (id, isActive) => {
        updatePayload = { id, isActive };
        return { ...MOCK_CUSTOMER_ACTIVE, isActive };
      };

      const { container, unmount } = await renderComponent(
        React.createElement(AdminCustomerDetailsPage, { customerId: MOCK_CUSTOMER_ACTIVE._id })
      );

      // Detail page has Deactivate Account button
      const deactivateBtn = findElement(container, (n) =>
        n.tagName === 'BUTTON' && n.textContent.includes('Deactivate Account')
      );
      assert.ok(deactivateBtn, 'Deactivate button must exist on detail page');

      // Click to open modal
      await act(async () => {
        deactivateBtn.dispatchEvent({ type: 'click' });
      });

      assert.ok(container.textContent.includes('Deactivate Customer Account?'));

      // Confirm mutation
      const confirmBtn = findElement(container, (n) =>
        n.tagName === 'BUTTON' && n.textContent.includes('Confirm Deactivation')
      );
      assert.ok(confirmBtn, 'Confirm button must exist');

      await act(async () => {
        confirmBtn.dispatchEvent({ type: 'click' });
      });

      assert.deepEqual(updatePayload, {
        id: MOCK_CUSTOMER_ACTIVE._id,
        isActive: false,
      });

      // Success toast appears
      assert.ok(container.textContent.includes('successfully deactivated'));
      // Badge updates to Inactive Account
      assert.ok(container.textContent.includes('Inactive Account'));
      // Action button updates to Activate Account
      assert.ok(container.textContent.includes('Activate Account'));

      await unmount();
    });

    it('resets data and avoids showing customer A data when navigating from customer A to customer B', async () => {
      let resolveCustomerB;
      const customerBPromise = new Promise((res) => {
        resolveCustomerB = res;
      });

      adminCustomerService.getAdminCustomer = async (id) => {
        if (id === MOCK_CUSTOMER_ACTIVE._id) {
          return MOCK_DETAIL_DATA;
        }
        await customerBPromise;
        return {
          customer: MOCK_CUSTOMER_INACTIVE,
          addresses: [],
          orderStats: { totalOrders: 0, totalSpent: 0, lastOrderDate: null },
          recentOrders: [],
        };
      };

      const rootEl = mockDoc.createElement('div');
      const root = createRoot(rootEl);

      // Render Customer A
      await act(async () => {
        root.render(
          React.createElement(AdminCustomerDetailsPage, {
            key: MOCK_CUSTOMER_ACTIVE._id,
            customerId: MOCK_CUSTOMER_ACTIVE._id,
          })
        );
      });

      assert.ok(rootEl.textContent.includes('Alice Johnson'));

      // Switch to Customer B while request is still pending
      await act(async () => {
        root.render(
          React.createElement(AdminCustomerDetailsPage, {
            key: MOCK_CUSTOMER_INACTIVE._id,
            customerId: MOCK_CUSTOMER_INACTIVE._id,
          })
        );
      });

      // Customer A data must be cleared immediately, not showing Alice Johnson
      assert.ok(!rootEl.textContent.includes('Alice Johnson'));

      // Resolve Customer B
      await act(async () => {
        resolveCustomerB();
      });

      assert.ok(rootEl.textContent.includes('Bob Smith'));

      await act(async () => {
        root.unmount();
      });
    });

    it('re-fetches customer detail on retry click after initial failure', async () => {
      let callCount = 0;
      adminCustomerService.getAdminCustomer = async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Server unavailable');
        }
        return MOCK_DETAIL_DATA;
      };

      const { container, unmount } = await renderComponent(
        React.createElement(AdminCustomerDetailsPage, { customerId: MOCK_CUSTOMER_ACTIVE._id })
      );

      assert.ok(container.textContent.includes('Unable to load customer profile'));
      assert.ok(container.textContent.includes('Server unavailable'));

      const retryBtn = findElement(container, (n) =>
        n.tagName === 'BUTTON' && n.textContent.includes('Try Again')
      );
      assert.ok(retryBtn, 'Retry button must exist in error state');

      await act(async () => {
        retryBtn.dispatchEvent({ type: 'click' });
      });

      assert.equal(callCount, 2);
      assert.ok(container.textContent.includes('Alice Johnson'));
      assert.ok(!container.textContent.includes('Unable to load customer profile'));

      await unmount();
    });

    it('handles 403 business rejection on status mutation without crash, preserving state', async () => {
      adminCustomerService.getAdminCustomer = async () => MOCK_DETAIL_DATA;
      adminCustomerService.updateAdminCustomerStatus = async () => {
        throw new ApiError({
          status: 403,
          code: 'FORBIDDEN',
          message: 'Super-admin privilege required to deactivate this customer account.',
        });
      };

      const { container, unmount } = await renderComponent(
        React.createElement(AdminCustomerDetailsPage, { customerId: MOCK_CUSTOMER_ACTIVE._id })
      );

      const deactivateBtn = findElement(container, (n) =>
        n.tagName === 'BUTTON' && n.textContent.includes('Deactivate Account')
      );
      await act(async () => {
        deactivateBtn.dispatchEvent({ type: 'click' });
      });

      const confirmBtn = findElement(container, (n) =>
        n.tagName === 'BUTTON' && n.textContent.includes('Confirm Deactivation')
      );
      await act(async () => {
        confirmBtn.dispatchEvent({ type: 'click' });
      });

      // Error message is displayed in modal
      assert.ok(container.textContent.includes('Super-admin privilege required'));
      // State is preserved (still Active Account)
      assert.ok(container.textContent.includes('Active Account'));

      await unmount();
    });
  });
});
