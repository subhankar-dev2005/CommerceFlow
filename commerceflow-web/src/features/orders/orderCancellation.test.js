import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import {
  cancelOrder as serviceCancelOrder,
  CUSTOMER_CANCELLATION_REASONS,
  CANCELLATION_REASON_LABELS,
  CANCELLATION_ACTOR_LABELS,
  getCancellationReasonLabel,
  getCancellationActorLabel,
} from './order.service.js';
import { ADMIN_CANCELLATION_REASONS } from '../admin/adminOrder.service.js';
import orderDetailsPageModule from '../../pages/OrderDetailsPage.jsx';
const OrderDetailsPage = orderDetailsPageModule?.default || orderDetailsPageModule;
import orderCardModule from '../../components/OrderCard.jsx';
const OrderCard = orderCardModule?.default || orderCardModule;
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
  const isSelect = tag.toUpperCase() === 'SELECT';
  let _value = '';

  Object.assign(el, {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    nodeName: tag.toUpperCase(),
    ownerDocument: doc,
    style: {},
    childNodes: children,
    options: isSelect ? [] : undefined,
    checked: false,
    disabled: false,
    setAttribute: (name, val) => {
      const sVal = String(val);
      attributes[name] = sVal;
      if (name === 'aria-label') el.ariaLabel = sVal;
      if (name === 'role') el.role = sVal;
      if (name === 'value') el.value = sVal;
      if (name === 'type') el.type = sVal;
      if (name === 'name') el.name = sVal;
      if (name === 'id') el.id = sVal;
      if (name === 'disabled') el.disabled = val === true || val === '' || val === 'disabled';
      if (name === 'checked') el.checked = val === true || val === '' || val === 'checked';
      if (name.toLowerCase() === 'maxlength') el.maxLength = Number(val);
    },
    getAttribute: (name) => {
      const lower = name.toLowerCase();
      if (attributes[name] !== undefined) return attributes[name];
      if (attributes[lower] !== undefined) return attributes[lower];
      if (lower === 'type' && el.type) return el.type;
      if (lower === 'value' && el.value) return el.value;
      if (lower === 'name' && el.name) return el.name;
      if (lower === 'id' && el.id) return el.id;
      if (lower === 'role' && el.role) return el.role;
      if (lower === 'disabled' && el.disabled) return 'true';
      if (lower === 'maxlength' && (el.maxLength || attributes.maxlength || attributes.maxLength)) {
        return String(el.maxLength || attributes.maxlength || attributes.maxLength);
      }
      return null;
    },
    hasAttribute: (name) => name in attributes,
    removeAttribute: (name) => {
      delete attributes[name];
      if (name === 'disabled') el.disabled = false;
      if (name === 'checked') el.checked = false;
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
      const eventVal = event?.target?.value;
      if (eventVal !== undefined) {
        el.value = eventVal;
      }
      if (event?.target?.checked !== undefined) {
        el.checked = event.target.checked;
      }
      const evt = { ...event, target: el };
      for (let curr = el; curr; curr = curr.parentNode) {
        evt.currentTarget = curr;
        if (curr._listeners && curr._listeners[type]) {
          for (const h of curr._listeners[type]) {
            h(evt);
          }
        }
      }
      if (doc && doc._listeners && doc._listeners[type]) {
        evt.currentTarget = doc;
        for (const h of doc._listeners[type]) {
          h(evt);
        }
      }
      const propsKey = Object.keys(el).find((k) => k.startsWith('__reactProps'));
      const reactProps = propsKey ? el[propsKey] : null;
      if (reactProps) {
        if (type === 'change' && typeof reactProps.onChange === 'function') {
          reactProps.onChange({ target: { value: eventVal !== undefined ? eventVal : el.value } });
        } else if (type === 'click' && typeof reactProps.onClick === 'function') {
          reactProps.onClick({ target: el, preventDefault: () => {}, stopPropagation: () => {} });
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
      if (el.options && (child.tagName === 'OPTION' || child.nodeName === 'OPTION')) {
        el.options.push(child);
      }
      return child;
    },
    removeChild: (child) => {
      const idx = children.indexOf(child);
      if (idx !== -1) {
        children.splice(idx, 1);
        child.parentNode = null;
      }
      if (el.options) {
        const oIdx = el.options.indexOf(child);
        if (oIdx !== -1) el.options.splice(oIdx, 1);
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
      if (el.options && (newChild.tagName === 'OPTION' || newChild.nodeName === 'OPTION')) {
        el.options.push(newChild);
      }
      return newChild;
    },
    focus: () => {
      doc.activeElement = el;
    },
  });

  let _hasExplicitValue = false;
  Object.defineProperty(el, 'value', {
    get: () => {
      const propsKey = Object.keys(el).find((k) => k.startsWith('__reactProps'));
      if (propsKey && el[propsKey] && el[propsKey].value !== undefined) {
        return String(el[propsKey].value);
      }
      if (_hasExplicitValue) return _value;
      if (attributes['value'] !== undefined) return attributes['value'];
      return '';
    },
    set: (val) => {
      _hasExplicitValue = true;
      _value = String(val);
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
  const docListeners = {};
  const doc = {
    nodeType: 9,
    activeElement: null,
    _listeners: docListeners,
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
    addEventListener: (type, handler) => {
      if (!docListeners[type]) docListeners[type] = [];
      docListeners[type].push(handler);
    },
    removeEventListener: (type, handler) => {
      if (docListeners[type]) {
        docListeners[type] = docListeners[type].filter((h) => h !== handler);
      }
    },
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
  location: { pathname: '/account/orders/507f1f77bcf86cd799439011', search: '' },
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

function findElements(node, predicate) {
  const matches = [];
  function traverse(n) {
    if (!n) return;
    if (n.nodeType === 1 && predicate(n)) matches.push(n);
    if (n.childNodes) {
      for (const child of n.childNodes) {
        traverse(child);
      }
    }
  }
  traverse(node);
  return matches;
}

const TEST_ORDER_ID = '507f1f77bcf86cd799439011';

const sampleOrder = {
  _id: TEST_ORDER_ID,
  status: 'processing',
  subtotal: 4500,
  totalQuantity: 2,
  items: [
    {
      _id: 'item1',
      name: 'Trail Tent Pro',
      price: 4500,
      quantity: 1,
      subtotal: 4500,
      product: { _id: 'prod1', name: 'Trail Tent Pro' },
    },
  ],
  payment: { provider: 'razorpay', status: 'paid', transactionId: 'pay_123' },
  shippingAddress: {
    fullName: 'Arun Kumar',
    phone: '9876543210',
    addressLine1: '12 Forest Hill',
    city: 'Dehradun',
    state: 'Uttarakhand',
    postalCode: '248001',
    country: 'India',
  },
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
};

describe('P1.5.6 Customer Cancellation Reason Frontend Integration Tests', () => {
  let rootEl;
  let root;
  let originalApiClientGet;
  let originalApiClientPatch;

  beforeEach(() => {
    rootEl = mockDoc.createElement('div');
    root = createRoot(rootEl);

    originalApiClientGet = apiClient.get;
    originalApiClientPatch = apiClient.patch;
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    apiClient.get = originalApiClientGet;
    apiClient.patch = originalApiClientPatch;
  });

  // Helper to render OrderDetailsPage wrapped in mocked contexts
  async function renderOrderDetailsPage(orderContextOverrides = {}, paymentContextOverrides = {}) {
    const defaultOrderContext = {
      selectedOrder: sampleOrder,
      isLoadingDetail: false,
      detailError: null,
      getOrderById: async () => sampleOrder,
      cancelOrder: async () => sampleOrder,
      isMutating: false,
      ...orderContextOverrides,
    };

    const defaultPaymentContext = {
      openCheckout: () => {},
      isCreatingPaymentOrder: false,
      isVerifyingPayment: false,
      isCheckoutOpen: false,
      ...paymentContextOverrides,
    };

    await act(async () => {
      root.render(
        React.createElement(OrderDetailsPage, {
          orderId: TEST_ORDER_ID,
          orderContext: defaultOrderContext,
          paymentContext: defaultPaymentContext,
        })
      );
    });
  }

  describe('1. Constants & Reason Code Mapping', () => {
    it('provides all 7 required customer cancellation reasons with exact human-readable labels', () => {
      const expectedReasons = [
        { value: 'changed_mind', label: 'Changed my mind' },
        { value: 'ordered_by_mistake', label: 'Ordered by mistake' },
        { value: 'found_better_price', label: 'Found a better price' },
        { value: 'delivery_too_slow', label: 'Delivery is taking too long' },
        { value: 'payment_issue', label: 'Payment issue' },
        { value: 'duplicate_order', label: 'Duplicate order' },
        { value: 'other', label: 'Other' },
      ];

      assert.strictEqual(CUSTOMER_CANCELLATION_REASONS.length, 7);
      for (const expected of expectedReasons) {
        const found = CUSTOMER_CANCELLATION_REASONS.find((r) => r.value === expected.value);
        assert.ok(found, `Reason ${expected.value} should exist`);
        assert.strictEqual(found.label, expected.label);
      }
    });

    it('maps customer, admin, and system cancellation codes to user-friendly labels', () => {
      assert.strictEqual(CANCELLATION_REASON_LABELS['changed_mind'], 'Changed my mind');
      assert.strictEqual(CANCELLATION_REASON_LABELS['ordered_by_mistake'], 'Ordered by mistake');
      assert.strictEqual(CANCELLATION_REASON_LABELS['found_better_price'], 'Found a better price');
      assert.strictEqual(CANCELLATION_REASON_LABELS['delivery_too_slow'], 'Delivery is taking too long');
      assert.strictEqual(CANCELLATION_REASON_LABELS['payment_issue'], 'Payment issue');
      assert.strictEqual(CANCELLATION_REASON_LABELS['duplicate_order'], 'Duplicate order');
      assert.strictEqual(CANCELLATION_REASON_LABELS['other'], 'Other');
      assert.strictEqual(CANCELLATION_REASON_LABELS['customer_request'], 'Customer request');
      assert.strictEqual(CANCELLATION_REASON_LABELS['item_unavailable'], 'Item unavailable');
      assert.strictEqual(CANCELLATION_REASON_LABELS['fraud_suspected'], 'Suspected fraud');
      assert.strictEqual(CANCELLATION_REASON_LABELS['delivery_address_undeliverable'], 'Delivery address is undeliverable');
      assert.strictEqual(CANCELLATION_REASON_LABELS['payment_dispute'], 'Payment dispute');
      assert.strictEqual(CANCELLATION_REASON_LABELS['system_checkout_failure'], 'Checkout could not be completed');
    });

    it('safely falls back to Other for unknown reason codes without exposing raw values', () => {
      assert.strictEqual(getCancellationReasonLabel('unknown_reason_code'), 'Other');
      assert.strictEqual(getCancellationReasonLabel(''), 'Other');
      assert.strictEqual(getCancellationReasonLabel(null), 'Other');
      assert.strictEqual(getCancellationReasonLabel(undefined), 'Other');
    });

    it('maps cancellation actors to human-readable labels and omits unknown/missing actors', () => {
      assert.strictEqual(CANCELLATION_ACTOR_LABELS['customer'], 'You');
      assert.strictEqual(CANCELLATION_ACTOR_LABELS['admin'], 'Store');
      assert.strictEqual(CANCELLATION_ACTOR_LABELS['system'], 'System');

      assert.strictEqual(getCancellationActorLabel('customer'), 'You');
      assert.strictEqual(getCancellationActorLabel('admin'), 'Store');
      assert.strictEqual(getCancellationActorLabel('system'), 'System');
      assert.strictEqual(getCancellationActorLabel('unauthorized_actor'), null);
      assert.strictEqual(getCancellationActorLabel(''), null);
      assert.strictEqual(getCancellationActorLabel(null), null);
      assert.strictEqual(getCancellationActorLabel(undefined), null);
    });

    it('keeps customer cancellation reason options distinct from admin reason options', () => {
      const customerCodes = CUSTOMER_CANCELLATION_REASONS.map((r) => r.value);
      const adminCodes = ADMIN_CANCELLATION_REASONS.map((r) => r.value);

      // Customer reasons must NOT include admin-only reasons
      const adminOnlyReasons = [
        'customer_request',
        'item_unavailable',
        'fraud_suspected',
        'delivery_address_undeliverable',
        'payment_dispute',
      ];
      for (const code of adminOnlyReasons) {
        assert.strictEqual(customerCodes.includes(code), false, `Customer reasons should not include admin-only reason: ${code}`);
      }

      // Admin reasons must NOT include customer-only reasons
      const customerOnlyReasons = [
        'changed_mind',
        'ordered_by_mistake',
        'found_better_price',
        'delivery_too_slow',
        'payment_issue',
      ];
      for (const code of customerOnlyReasons) {
        assert.strictEqual(adminCodes.includes(code), false, `Admin reasons should not include customer-only reason: ${code}`);
      }
    });
  });

  describe('2. Cancellation Service Payload & Security Contract', () => {
    it('sends PATCH orders/:id/cancel with { reason, reasonDetail }', async () => {
      let capturedEndpoint = null;
      let capturedPayload = null;

      apiClient.patch = async (endpoint, payload) => {
        capturedEndpoint = endpoint;
        capturedPayload = payload;
        return { data: { order: { ...sampleOrder, status: 'cancelled' } } };
      };

      const result = await serviceCancelOrder(TEST_ORDER_ID, {
        reason: 'found_better_price',
        reasonDetail: 'Found on another store for 10% less',
      });

      assert.strictEqual(capturedEndpoint, `orders/${TEST_ORDER_ID}/cancel`);
      assert.deepStrictEqual(capturedPayload, {
        reason: 'found_better_price',
        reasonDetail: 'Found on another store for 10% less',
      });
      assert.strictEqual(result.status, 'cancelled');
    });

    it('sends each of the 7 supported customer reasons correctly in payload', async () => {
      const reasons = [
        'changed_mind',
        'ordered_by_mistake',
        'found_better_price',
        'delivery_too_slow',
        'payment_issue',
        'duplicate_order',
        'other',
      ];

      for (const reason of reasons) {
        let capturedPayload = null;
        apiClient.patch = async (endpoint, payload) => {
          capturedPayload = payload;
          return { data: { order: { ...sampleOrder, status: 'cancelled' } } };
        };

        await serviceCancelOrder(TEST_ORDER_ID, { reason });
        assert.deepStrictEqual(capturedPayload, { reason });
      }
    });

    it('trims whitespace from reasonDetail before sending payload', async () => {
      let capturedPayload = null;

      apiClient.patch = async (endpoint, payload) => {
        capturedPayload = payload;
        return { data: { order: sampleOrder } };
      };

      await serviceCancelOrder(TEST_ORDER_ID, {
        reason: 'other',
        reasonDetail: '   Leading and trailing spaces   ',
      });

      assert.strictEqual(capturedPayload.reasonDetail, 'Leading and trailing spaces');
    });

    it('never includes client-supplied actor (cancelledBy) or timestamp (cancelledAt)', async () => {
      let capturedPayload = null;

      apiClient.patch = async (endpoint, payload) => {
        capturedPayload = payload;
        return { data: { order: sampleOrder } };
      };

      // Attempt to pass malicious/disallowed actor or timestamp
      await serviceCancelOrder(TEST_ORDER_ID, {
        reason: 'changed_mind',
        reasonDetail: '',
        cancelledBy: 'admin',
        cancelledAt: '2020-01-01T00:00:00.000Z',
      });

      assert.strictEqual('cancelledBy' in capturedPayload, false);
      assert.strictEqual('cancelledAt' in capturedPayload, false);
    });

    it('sends empty payload when reason and reasonDetail are omitted (backend defaults)', async () => {
      let capturedPayload = null;

      apiClient.patch = async (endpoint, payload) => {
        capturedPayload = payload;
        return { data: { order: sampleOrder } };
      };

      await serviceCancelOrder(TEST_ORDER_ID);
      assert.deepStrictEqual(capturedPayload, {});
    });

    it('validates orderId and rejects invalid id before making network call', async () => {
      await assert.rejects(
        () => serviceCancelOrder('invalid-id', { reason: 'other' }),
        { name: 'ApiError', status: 400 }
      );
    });
  });

  describe('3. Customer Cancellation UI Eligibility Rules', () => {
    it('renders "Cancel Order" button when order is eligible (processing)', async () => {
      await renderOrderDetailsPage({ selectedOrder: { ...sampleOrder, status: 'processing' } });

      const buttons = findElements(rootEl, (n) => n.tagName === 'BUTTON');
      const cancelBtn = buttons.find((b) => b.textContent.includes('Cancel Order'));
      assert.ok(cancelBtn, 'Cancel Order button should be rendered for processing order');
    });

    it('renders "Cancel Order" button when order is pending or confirmed or shipped', async () => {
      for (const status of ['pending', 'confirmed', 'shipped']) {
        await renderOrderDetailsPage({ selectedOrder: { ...sampleOrder, status } });
        const buttons = findElements(rootEl, (n) => n.tagName === 'BUTTON');
        const cancelBtn = buttons.find((b) => b.textContent.includes('Cancel Order'));
        assert.ok(cancelBtn, `Cancel Order button should be rendered for ${status} order`);
      }
    });

    it('does NOT render "Cancel Order" button when order is delivered', async () => {
      await renderOrderDetailsPage({ selectedOrder: { ...sampleOrder, status: 'delivered' } });

      const buttons = findElements(rootEl, (n) => n.tagName === 'BUTTON');
      const cancelBtn = buttons.find((b) => b.textContent.includes('Cancel Order'));
      assert.strictEqual(cancelBtn, undefined, 'Cancel Order button must not render for delivered order');
    });

    it('does NOT render "Cancel Order" button when order is already cancelled', async () => {
      await renderOrderDetailsPage({ selectedOrder: { ...sampleOrder, status: 'cancelled' } });

      const buttons = findElements(rootEl, (n) => n.tagName === 'BUTTON');
      const cancelBtn = buttons.find((b) => b.textContent.includes('Cancel Order'));
      assert.strictEqual(cancelBtn, undefined, 'Cancel Order button must not render for cancelled order');
    });
  });

  describe('4. Confirmation Modal Accessibility & Interactions', () => {
    it('opens accessible modal with role="dialog" and aria attributes on click', async () => {
      await renderOrderDetailsPage();

      // Initially no modal
      let dialogs = findElements(rootEl, (n) => n.getAttribute('role') === 'dialog');
      assert.strictEqual(dialogs.length, 0);

      // Click "Cancel Order" button
      const buttons = findElements(rootEl, (n) => n.tagName === 'BUTTON');
      const cancelBtn = buttons.find((b) => b.textContent.includes('Cancel Order'));
      assert.ok(cancelBtn);

      await act(async () => {
        cancelBtn.dispatchEvent({ type: 'click' });
      });

      // Dialog is now open
      dialogs = findElements(rootEl, (n) => n.getAttribute('role') === 'dialog');
      assert.strictEqual(dialogs.length, 1);
      assert.strictEqual(dialogs[0].getAttribute('aria-modal'), 'true');
      assert.strictEqual(dialogs[0].getAttribute('aria-labelledby'), 'cancel-dialog-title');
      assert.strictEqual(dialogs[0].getAttribute('aria-describedby'), 'cancel-dialog-description');

      assert.match(rootEl.textContent, /Cancel Order/);
      assert.match(rootEl.textContent, /Reason for cancellation/);
    });

    it('renders all 7 reason options in the modal with an accessible native select', async () => {
      await renderOrderDetailsPage();

      const buttons = findElements(rootEl, (n) => n.tagName === 'BUTTON');
      const cancelBtn = buttons.find((b) => b.textContent.includes('Cancel Order'));
      await act(async () => {
        cancelBtn.dispatchEvent({ type: 'click' });
      });

      const select = findElements(rootEl, (n) => n.tagName === 'SELECT')[0];
      assert.ok(select, 'Reason select element should be present');
      assert.strictEqual(select.getAttribute('name'), 'cancellationReason');

      const options = findElements(rootEl, (n) => n.tagName === 'OPTION');
      assert.strictEqual(options.length, 7);

      const optionValues = options.map((i) => i.getAttribute('value') || i.value);
      assert.deepStrictEqual(optionValues, [
        'changed_mind',
        'ordered_by_mistake',
        'found_better_price',
        'delivery_too_slow',
        'payment_issue',
        'duplicate_order',
        'other',
      ]);

      const expectedLabels = [
        'Changed my mind',
        'Ordered by mistake',
        'Found a better price',
        'Delivery is taking too long',
        'Payment issue',
        'Duplicate order',
        'Other',
      ];
      const optionLabels = options.map((i) => i.textContent);
      assert.deepStrictEqual(optionLabels, expectedLabels);
    });

    it('defaults reason selector to other upon opening dialog and does not submit until confirmed', async () => {
      let cancelled = false;
      await renderOrderDetailsPage({
        cancelOrder: async () => {
          cancelled = true;
          return { ...sampleOrder, status: 'cancelled' };
        },
      });

      const buttons = findElements(rootEl, (n) => n.tagName === 'BUTTON');
      const cancelBtn = buttons.find((b) => b.textContent.includes('Cancel Order'));
      await act(async () => {
        cancelBtn.dispatchEvent({ type: 'click' });
      });

      // Opening modal does NOT submit the cancellation
      assert.strictEqual(cancelled, false, 'Opening modal must not submit cancellation request');

      const select = findElements(rootEl, (n) => n.tagName === 'SELECT')[0];
      assert.ok(select, 'Select should exist');
      assert.strictEqual(select.value, 'other', 'Select should default to other');

      // Confirm button is enabled with default selection, but request is not sent until clicked
      const submitBtn = findElements(rootEl, (n) => n.tagName === 'BUTTON').find((b) => b.textContent.includes('Confirm cancellation') || b.textContent.includes('Yes, Cancel Order'));
      assert.strictEqual(submitBtn.disabled, false, 'Confirm button is enabled with default selection');
      assert.strictEqual(cancelled, false, 'Cancellation is not submitted until confirmed');
    });

    it('requires explicit confirmation before cancellation request is sent', async () => {
      let cancelled = false;
      let submittedData = null;
      await renderOrderDetailsPage({
        cancelOrder: async (orderId, data) => {
          cancelled = true;
          submittedData = data;
          return { ...sampleOrder, status: 'cancelled' };
        },
      });

      const buttons = findElements(rootEl, (n) => n.tagName === 'BUTTON');
      const cancelBtn = buttons.find((b) => b.textContent.includes('Cancel Order'));

      // Clicking "Cancel Order" on the details page opens modal, does NOT submit
      await act(async () => {
        cancelBtn.dispatchEvent({ type: 'click' });
      });
      assert.strictEqual(cancelled, false, 'Must not send request merely by opening modal');

      const submitBtn = findElements(rootEl, (n) => n.tagName === 'BUTTON').find((b) => b.textContent.includes('Confirm cancellation') || b.textContent.includes('Yes, Cancel Order'));
      assert.strictEqual(submitBtn.disabled, false);

      // Clicking "Confirm cancellation" inside dialog explicitly confirms and sends request
      await act(async () => {
        submitBtn.dispatchEvent({ type: 'click' });
      });
      assert.strictEqual(cancelled, true, 'Submits cancellation upon explicit confirmation');
      assert.strictEqual(submittedData?.reason, 'other');
      assert.strictEqual(submittedData?.reasonDetail, '');
    });

    it('submits each of the 7 supported reasons correctly via modal confirmation', async () => {
      const allReasons = [
        'changed_mind',
        'ordered_by_mistake',
        'found_better_price',
        'delivery_too_slow',
        'payment_issue',
        'duplicate_order',
        'other',
      ];

      for (const reasonVal of allReasons) {
        let submittedPayload = null;
        await renderOrderDetailsPage({
          cancelOrder: async (orderId, data) => {
            submittedPayload = data;
            return { ...sampleOrder, status: 'cancelled' };
          },
        });

        const cancelBtn = findElements(rootEl, (n) => n.tagName === 'BUTTON').find((b) => b.textContent.includes('Cancel Order'));
        await act(async () => {
          cancelBtn.dispatchEvent({ type: 'click' });
        });

        const select = findElements(rootEl, (n) => n.tagName === 'SELECT')[0];
        await act(async () => {
          select.dispatchEvent({ type: 'change', target: { value: reasonVal } });
        });

        const submitBtn = findElements(rootEl, (n) => n.tagName === 'BUTTON').find((b) => b.textContent.includes('Confirm cancellation') || b.textContent.includes('Yes, Cancel Order'));
        await act(async () => {
          submitBtn.dispatchEvent({ type: 'click' });
        });

        assert.strictEqual(submittedPayload?.reason, reasonVal);
        assert.strictEqual(submittedPayload?.reasonDetail, '');
      }
    });

    it('shows optional details textarea limited to 500 chars with counter for all reasons', async () => {
      await renderOrderDetailsPage();

      const buttons = findElements(rootEl, (n) => n.tagName === 'BUTTON');
      const cancelBtn = buttons.find((b) => b.textContent.includes('Cancel Order'));
      await act(async () => {
        cancelBtn.dispatchEvent({ type: 'click' });
      });

      // Textarea is present for any reason (e.g., changed_mind)
      const select = findElements(rootEl, (n) => n.tagName === 'SELECT')[0];
      await act(async () => {
        select.dispatchEvent({ type: 'change', target: { value: 'changed_mind' } });
      });

      let textareas = findElements(rootEl, (n) => n.tagName === 'TEXTAREA');
      assert.strictEqual(textareas.length, 1);
      const textarea = textareas[0];
      assert.strictEqual(textarea.getAttribute('maxlength'), '500');
      assert.match(rootEl.textContent, /0\/500/);

      // Simulate typing in textarea
      await act(async () => {
        textarea.dispatchEvent({ type: 'change', target: { value: 'Need to change delivery address' } });
      });
      assert.match(rootEl.textContent, /31\/500/);

      // Switch reason to "found_better_price" — textarea remains present and accessible
      await act(async () => {
        select.dispatchEvent({ type: 'change', target: { value: 'found_better_price' } });
      });
      textareas = findElements(rootEl, (n) => n.tagName === 'TEXTAREA');
      assert.strictEqual(textareas.length, 1);
    });

    it('submits selected reason and trimmed detail to cancelOrder', async () => {
      let passedReason = null;
      let passedDetail = null;

      await renderOrderDetailsPage({
        cancelOrder: async (orderId, data) => {
          passedReason = data?.reason;
          passedDetail = data?.reasonDetail;
          return { ...sampleOrder, status: 'cancelled' };
        },
      });

      const buttons = findElements(rootEl, (n) => n.tagName === 'BUTTON');
      const cancelBtn = buttons.find((b) => b.textContent.includes('Cancel Order'));
      await act(async () => {
        cancelBtn.dispatchEvent({ type: 'click' });
      });

      // Select "changed_mind"
      const select = findElements(rootEl, (n) => n.tagName === 'SELECT')[0];
      await act(async () => {
        select.dispatchEvent({ type: 'change', target: { value: 'changed_mind' } });
      });

      const textarea = findElements(rootEl, (n) => n.tagName === 'TEXTAREA')[0];
      await act(async () => {
        textarea.dispatchEvent({ type: 'change', target: { value: '   Found better deal elsewhere   ' } });
      });

      const submitBtn = findElements(rootEl, (n) => n.tagName === 'BUTTON').find((b) => b.textContent.includes('Confirm cancellation') || b.textContent.includes('Yes, Cancel Order'));
      await act(async () => {
        submitBtn.dispatchEvent({ type: 'click' });
      });

      assert.strictEqual(passedReason, 'changed_mind');
      assert.strictEqual(passedDetail, 'Found better deal elsewhere');
    });

    it('submits selected reason with empty reasonDetail if detail is not provided', async () => {
      let passedData = null;
      await renderOrderDetailsPage({
        cancelOrder: async (orderId, data) => {
          passedData = data;
          return { ...sampleOrder, status: 'cancelled' };
        },
      });

      const cancelBtn = findElements(rootEl, (n) => n.tagName === 'BUTTON').find((b) => b.textContent.includes('Cancel Order'));
      await act(async () => {
        cancelBtn.dispatchEvent({ type: 'click' });
      });

      // Select "ordered_by_mistake"
      const select = findElements(rootEl, (n) => n.tagName === 'SELECT')[0];
      await act(async () => {
        select.dispatchEvent({ type: 'change', target: { value: 'ordered_by_mistake' } });
      });

      const submitBtn = findElements(rootEl, (n) => n.tagName === 'BUTTON').find((b) => b.textContent.includes('Confirm cancellation') || b.textContent.includes('Yes, Cancel Order'));
      await act(async () => {
        submitBtn.dispatchEvent({ type: 'click' });
      });

      assert.strictEqual(passedData.reason, 'ordered_by_mistake');
      assert.strictEqual(passedData.reasonDetail, '');
    });

    it('successful cancellation updates the order, displays success feedback, and refreshes order details', async () => {
      let getOrderCalled = false;
      const cancelledOrder = {
        ...sampleOrder,
        status: 'cancelled',
        cancellation: {
          reason: 'ordered_by_mistake',
          reasonDetail: '',
          cancelledBy: 'customer',
          cancelledAt: '2026-10-01T12:00:00.000Z',
        },
      };

      await renderOrderDetailsPage({
        cancelOrder: async () => cancelledOrder,
        getOrderById: async () => {
          getOrderCalled = true;
          return cancelledOrder;
        },
      });

      const cancelBtn = findElements(rootEl, (n) => n.tagName === 'BUTTON').find((b) => b.textContent.includes('Cancel Order'));
      await act(async () => {
        cancelBtn.dispatchEvent({ type: 'click' });
      });

      const select = findElements(rootEl, (n) => n.tagName === 'SELECT')[0];
      await act(async () => {
        select.dispatchEvent({ type: 'change', target: { value: 'ordered_by_mistake' } });
      });

      const submitBtn = findElements(rootEl, (n) => n.tagName === 'BUTTON').find((b) => b.textContent.includes('Confirm cancellation') || b.textContent.includes('Yes, Cancel Order'));
      await act(async () => {
        submitBtn.dispatchEvent({ type: 'click' });
      });

      // Dialog is closed
      assert.strictEqual(findElements(rootEl, (n) => n.getAttribute('role') === 'dialog').length, 0);

      // Success alert is displayed
      assert.match(rootEl.textContent, /Order has been cancelled successfully/);

      // getOrderById was invoked to refresh order
      assert.strictEqual(getOrderCalled, true);
    });

    it('dismisses modal and resets inputs when Escape key is pressed', async () => {
      await renderOrderDetailsPage();

      const cancelBtn = findElements(rootEl, (n) => n.tagName === 'BUTTON').find((b) => b.textContent.includes('Cancel Order'));
      await act(async () => {
        cancelBtn.dispatchEvent({ type: 'click' });
      });

      // Dialog is open
      assert.strictEqual(findElements(rootEl, (n) => n.getAttribute('role') === 'dialog').length, 1);

      // Select reason
      const select = findElements(rootEl, (n) => n.tagName === 'SELECT')[0];
      await act(async () => {
        select.dispatchEvent({ type: 'change', target: { value: 'changed_mind' } });
      });

      // Press Escape
      await act(async () => {
        mockWin.dispatchEvent({ type: 'keydown', key: 'Escape' });
      });

      // Dialog is closed
      assert.strictEqual(findElements(rootEl, (n) => n.getAttribute('role') === 'dialog').length, 0);

      // Reopen to confirm state was reset to default other reason and empty detail
      await act(async () => {
        cancelBtn.dispatchEvent({ type: 'click' });
      });
      const reopenedSelect = findElements(rootEl, (n) => n.tagName === 'SELECT')[0];
      assert.strictEqual(reopenedSelect.value, 'other', 'Select should reset to other');
      const textareas = findElements(rootEl, (n) => n.tagName === 'TEXTAREA');
      assert.strictEqual(textareas[0].value, '');
    });

    it('dismisses modal and resets inputs when "No, Keep Order" is clicked', async () => {
      await renderOrderDetailsPage();

      const cancelBtn = findElements(rootEl, (n) => n.tagName === 'BUTTON').find((b) => b.textContent.includes('Cancel Order'));
      await act(async () => {
        cancelBtn.dispatchEvent({ type: 'click' });
      });

      const keepBtn = findElements(rootEl, (n) => n.tagName === 'BUTTON').find((b) => b.textContent.includes('No, Keep Order'));
      assert.ok(keepBtn);

      await act(async () => {
        keepBtn.dispatchEvent({ type: 'click' });
      });

      assert.strictEqual(findElements(rootEl, (n) => n.getAttribute('role') === 'dialog').length, 0);
    });

    it('prevents duplicate submissions while mutation is in progress', async () => {
      let callCount = 0;
      await renderOrderDetailsPage({
        isMutating: true,
        cancelOrder: async () => {
          callCount++;
        },
      });

      // The sidebar cancel button should be disabled while isMutating is true
      const cancelBtn = findElements(rootEl, (n) => n.tagName === 'BUTTON').find((b) => b.textContent.includes('Cancel Order'));
      assert.strictEqual(cancelBtn.disabled, true);
      assert.strictEqual(callCount, 0);
    });

    it('displays server error when cancellation fails without optimistically marking order cancelled, keeping dialog open and preserving values', async () => {
      await renderOrderDetailsPage({
        cancelOrder: async () => {
          const err = new Error('Delivered orders cannot be cancelled.');
          err.code = 'ORDER_CANNOT_BE_CANCELLED';
          throw err;
        },
      });

      const cancelBtn = findElements(rootEl, (n) => n.tagName === 'BUTTON').find((b) => b.textContent.includes('Cancel Order'));
      await act(async () => {
        cancelBtn.dispatchEvent({ type: 'click' });
      });

      const select = findElements(rootEl, (n) => n.tagName === 'SELECT')[0];
      await act(async () => {
        select.dispatchEvent({ type: 'change', target: { value: 'payment_issue' } });
      });

      const textarea = findElements(rootEl, (n) => n.tagName === 'TEXTAREA')[0];
      await act(async () => {
        textarea.dispatchEvent({ type: 'change', target: { value: 'Card was charged twice' } });
      });

      const submitBtn = findElements(rootEl, (n) => n.tagName === 'BUTTON').find((b) => b.textContent.includes('Confirm cancellation') || b.textContent.includes('Yes, Cancel Order'));
      await act(async () => {
        submitBtn.dispatchEvent({ type: 'click' });
      });

      // Dialog is STILL open
      const dialogs = findElements(rootEl, (n) => n.getAttribute('role') === 'dialog');
      assert.strictEqual(dialogs.length, 1, 'Dialog must remain open on API failure');

      // Error message is rendered
      assert.match(rootEl.textContent, /Delivered orders cannot be cancelled\./);

      // Entered reason and textarea details are preserved
      assert.strictEqual(select.value, 'payment_issue');
      assert.strictEqual(textarea.value, 'Card was charged twice');

      // Order status is still processing, NOT optimistically marked cancelled
      assert.match(rootEl.textContent, /Processing/);
    });

    it('handles ORDER_ALREADY_CANCELLED error gracefully without logout, closing modal and refreshing order', async () => {
      let getOrderCalled = false;
      await renderOrderDetailsPage({
        cancelOrder: async () => {
          const err = new Error('This order has already been cancelled.');
          err.code = 'ORDER_ALREADY_CANCELLED';
          throw err;
        },
        getOrderById: async () => {
          getOrderCalled = true;
          return { ...sampleOrder, status: 'cancelled' };
        },
      });

      const cancelBtn = findElements(rootEl, (n) => n.tagName === 'BUTTON').find((b) => b.textContent.includes('Cancel Order'));
      await act(async () => {
        cancelBtn.dispatchEvent({ type: 'click' });
      });

      assert.strictEqual(findElements(rootEl, (n) => n.getAttribute('role') === 'dialog').length, 1);

      const submitBtn = findElements(rootEl, (n) => n.tagName === 'BUTTON').find((b) => b.textContent.includes('Confirm cancellation') || b.textContent.includes('Yes, Cancel Order'));
      await act(async () => {
        submitBtn.dispatchEvent({ type: 'click' });
      });

      // Dialog is closed
      assert.strictEqual(findElements(rootEl, (n) => n.getAttribute('role') === 'dialog').length, 0);

      // Error banner with clear user-facing message is displayed
      assert.match(rootEl.textContent, /This order has already been cancelled\./);

      // getOrderById called to refresh order
      assert.strictEqual(getOrderCalled, true);
    });
  });

  describe('5. Cancelled Order Presentation & Legacy Graceful Degradation', () => {
    it('displays mapped cancellation reason, details, actor (You), and formatted date/time when metadata is present', async () => {
      const cancelledOrderWithMeta = {
        ...sampleOrder,
        status: 'cancelled',
        cancellation: {
          reason: 'found_better_price',
          reasonDetail: 'Found 20% discount on competitor site',
          cancelledBy: 'customer',
          cancelledAt: '2026-10-01T12:00:00.000Z',
        },
      };

      await renderOrderDetailsPage({ selectedOrder: cancelledOrderWithMeta });

      const text = rootEl.textContent;
      assert.match(text, /Order Cancelled/);
      assert.match(text, /Cancellation details/);
      assert.match(text, /Cancelled by:/);
      assert.match(text, /You/);
      assert.match(text, /Cancellation Reason:/);
      assert.match(text, /Found a better price/);
      assert.match(text, /Details:/);
      assert.match(text, /Found 20% discount on competitor site/);
      assert.match(text, /Cancelled On:/);
      assert.match(text, /Oct 2026/);
    });

    it('displays system compensation cancellation metadata with readable reason, actor (System), and timestamp', async () => {
      const systemCancelledOrder = {
        ...sampleOrder,
        status: 'cancelled',
        cancellation: {
          reason: 'system_checkout_failure',
          reasonDetail: '',
          cancelledBy: 'system',
          cancelledAt: '2026-10-01T12:00:00.000Z',
        },
      };

      await renderOrderDetailsPage({ selectedOrder: systemCancelledOrder });

      const text = rootEl.textContent;
      assert.match(text, /Order Cancelled/);
      assert.match(text, /Cancellation details/);
      assert.match(text, /Cancelled by:/);
      assert.match(text, /System/);
      assert.match(text, /Cancellation Reason:/);
      assert.match(text, /Checkout could not be completed/);
      assert.match(text, /Cancelled On:/);
      assert.match(text, /Oct 2026/);
    });

    it('displays admin cancellation metadata with readable reason, actor (Store), detail, and date', async () => {
      const adminCancelledOrder = {
        ...sampleOrder,
        status: 'cancelled',
        cancellation: {
          reason: 'item_unavailable',
          reasonDetail: 'Out of stock in warehouse',
          cancelledBy: 'admin',
          cancelledAt: '2026-10-01T12:00:00.000Z',
        },
      };

      await renderOrderDetailsPage({ selectedOrder: adminCancelledOrder });

      const text = rootEl.textContent;
      assert.match(text, /Order Cancelled/);
      assert.match(text, /Cancellation details/);
      assert.match(text, /Cancelled by:/);
      assert.match(text, /Store/);
      assert.match(text, /Cancellation Reason:/);
      assert.match(text, /Item unavailable/);
      assert.match(text, /Details:/);
      assert.match(text, /Out of stock in warehouse/);
      assert.match(text, /Cancelled On:/);
      assert.match(text, /Oct 2026/);
    });

    it('safely falls back to Other for unknown reason code and never renders raw unknown code', async () => {
      const unknownReasonOrder = {
        ...sampleOrder,
        status: 'cancelled',
        cancellation: {
          reason: 'unrecognized_server_code_xyz',
          reasonDetail: 'Explanation for custom reason',
          cancelledBy: 'customer',
          cancelledAt: '2026-10-01T12:00:00.000Z',
        },
      };

      await renderOrderDetailsPage({ selectedOrder: unknownReasonOrder });

      const text = rootEl.textContent;
      assert.match(text, /Cancelled by:/);
      assert.match(text, /You/);
      assert.match(text, /Cancellation Reason:/);
      assert.match(text, /Other/);
      assert.doesNotMatch(text, /unrecognized_server_code_xyz/);
    });

    it('omits actor line when cancelledBy is unknown or unmapped in customer view', async () => {
      const unknownActorOrder = {
        ...sampleOrder,
        status: 'cancelled',
        cancellation: {
          reason: 'payment_issue',
          cancelledBy: 'malicious_actor_injection',
          cancelledAt: '2026-10-01T12:00:00.000Z',
        },
      };

      await renderOrderDetailsPage({ selectedOrder: unknownActorOrder });

      const text = rootEl.textContent;
      assert.match(text, /Cancellation Reason:/);
      assert.match(text, /Payment issue/);
      assert.doesNotMatch(text, /Cancelled by:/i);
      assert.doesNotMatch(text, /malicious_actor_injection/);
    });

    it('displays formatted cancellation date when cancelledAt is a valid timestamp', async () => {
      const validDateOrder = {
        ...sampleOrder,
        status: 'cancelled',
        cancellation: {
          reason: 'changed_mind',
          cancelledBy: 'customer',
          cancelledAt: '2026-10-01T12:00:00.000Z',
        },
      };

      await renderOrderDetailsPage({ selectedOrder: validDateOrder });

      const text = rootEl.textContent;
      assert.match(text, /Cancelled by:/);
      assert.match(text, /You/);
      assert.match(text, /Cancelled On:/);
      assert.match(text, /Oct 2026/);
    });

    it('omits cancellation date line when cancelledAt is invalid or unparseable', async () => {
      const invalidDateOrder = {
        ...sampleOrder,
        status: 'cancelled',
        cancellation: {
          reason: 'changed_mind',
          cancelledBy: 'customer',
          cancelledAt: 'not-a-valid-date-string',
        },
      };

      await renderOrderDetailsPage({ selectedOrder: invalidDateOrder });

      const text = rootEl.textContent;
      assert.match(text, /Cancelled by:/);
      assert.match(text, /You/);
      assert.match(text, /Cancellation Reason:/);
      assert.match(text, /Changed my mind/);
      assert.doesNotMatch(text, /Cancelled On:/);
      assert.doesNotMatch(text, /Invalid Date/i);
    });

    it('falls back to neutral text when order has only an invalid cancellation date and no other metadata', async () => {
      const invalidDateOnlyOrder = {
        ...sampleOrder,
        status: 'cancelled',
        cancellation: {
          cancelledAt: 'not-a-real-date',
        },
      };

      await renderOrderDetailsPage({ selectedOrder: invalidDateOnlyOrder });

      const text = rootEl.textContent;
      assert.match(text, /Cancellation details are unavailable for this order\./);
      assert.doesNotMatch(text, /Cancellation Reason:/);
      assert.doesNotMatch(text, /Cancelled On:/);
    });

    it('falls back to neutral text when order has only a cancellation actor and no other metadata', async () => {
      const unknownActorOnlyOrder = {
        ...sampleOrder,
        status: 'cancelled',
        cancellation: {
          cancelledBy: 'customer',
        },
      };

      await renderOrderDetailsPage({ selectedOrder: unknownActorOnlyOrder });

      const text = rootEl.textContent;
      assert.match(text, /Cancellation details are unavailable for this order\./);
      assert.doesNotMatch(text, /Cancellation Reason:/);
      assert.doesNotMatch(text, /Cancelled by:/);
    });

    it('OrderCard displays cancellation metadata without exposing actor, and handles legacy safely', async () => {
      const cardOrderWithMeta = {
        ...sampleOrder,
        status: 'cancelled',
        cancellation: {
          reason: 'changed_mind',
          reasonDetail: 'Changed my thoughts',
          cancelledBy: 'customer',
          cancelledAt: '2026-10-01T12:00:00.000Z',
        },
      };

      await act(async () => {
        root.render(React.createElement(OrderCard, { order: cardOrderWithMeta }));
      });

      let cardText = rootEl.textContent;
      assert.match(cardText, /Cancelled:/);
      assert.match(cardText, /Changed my mind/);
      assert.match(cardText, /Changed my thoughts/);
      // Must NOT expose cancelledBy in customer OrderCard
      assert.doesNotMatch(cardText, /Cancelled by customer/);
      assert.doesNotMatch(cardText, /Cancelled By:/i);

      // System cancellation on OrderCard
      const cardSystemOrder = {
        ...sampleOrder,
        status: 'cancelled',
        cancellation: {
          reason: 'system_checkout_failure',
          cancelledBy: 'system',
          cancelledAt: '2026-10-01T12:00:00.000Z',
        },
      };

      await act(async () => {
        root.render(React.createElement(OrderCard, { order: cardSystemOrder }));
      });

      cardText = rootEl.textContent;
      assert.match(cardText, /Cancelled:/);
      assert.match(cardText, /Checkout could not be completed/);
      assert.doesNotMatch(cardText, /Cancelled automatically/);
      assert.doesNotMatch(cardText, /Cancelled By:/i);

      // Legacy cancelled order without metadata on OrderCard
      const legacyOrder = {
        ...sampleOrder,
        status: 'cancelled',
        cancellation: null,
      };

      await act(async () => {
        root.render(React.createElement(OrderCard, { order: legacyOrder }));
      });

      cardText = rootEl.textContent;
      assert.match(cardText, /Cancellation details unavailable\./);
      assert.doesNotMatch(cardText, /Cancelled:/);
    });

    it('renders reasonDetail as safe text without executing or rendering HTML tags', async () => {
      const xssOrder = {
        ...sampleOrder,
        status: 'cancelled',
        cancellation: {
          reason: 'other',
          reasonDetail: '<script>alert("xss")</script><img src="x" onerror="alert(1)"><b>Dangerous Text</b>',
          cancelledBy: 'customer',
          cancelledAt: '2026-10-01T12:00:00.000Z',
        },
      };

      await renderOrderDetailsPage({ selectedOrder: xssOrder });

      const text = rootEl.textContent;
      // Literal string is present as plain text content
      assert.match(text, /<script>alert\("xss"\)<\/script>/);
      assert.match(text, /<b>Dangerous Text<\/b>/);
      // No script tags or injected onerror image elements or bold tags
      assert.strictEqual(findElements(rootEl, (n) => n.tagName === 'SCRIPT').length, 0);
      assert.strictEqual(findElements(rootEl, (n) => n.tagName === 'IMG' && n.hasAttribute('onerror')).length, 0);
      assert.strictEqual(findElements(rootEl, (n) => n.tagName === 'B').length, 0);
    });

    it('gracefully handles legacy cancelled order with missing metadata without inventing reasons', async () => {
      const legacyCancelledOrder = {
        ...sampleOrder,
        status: 'cancelled',
        cancellation: null,
      };

      await renderOrderDetailsPage({ selectedOrder: legacyCancelledOrder });

      const text = rootEl.textContent;
      assert.match(text, /Order Cancelled/);
      assert.match(text, /All gear items have been automatically restored to inventory/);
      // Displays neutral fallback
      assert.match(text, /Cancellation details are unavailable for this order\./);
      // Must NOT display "Cancellation Reason:" or invent a placeholder
      assert.doesNotMatch(text, /Cancellation Reason:/);
      assert.doesNotMatch(text, /Cancelled On:/);
      assert.doesNotMatch(text, /Cancelled By:/);
      assert.doesNotMatch(text, /Unknown Reason/i);
    });

    it('hides reason detail section when reasonDetail is empty string', async () => {
      const orderEmptyDetail = {
        ...sampleOrder,
        status: 'cancelled',
        cancellation: {
          reason: 'changed_mind',
          reasonDetail: '',
          cancelledBy: 'customer',
          cancelledAt: '2026-10-01T12:00:00.000Z',
        },
      };

      await renderOrderDetailsPage({ selectedOrder: orderEmptyDetail });

      const text = rootEl.textContent;
      assert.match(text, /Cancellation Reason:/);
      assert.match(text, /Changed my mind/);
      assert.doesNotMatch(text, /Details:/);
    });

    it('does NOT display cancellation metadata or fallback for active, non-cancelled orders', async () => {
      await renderOrderDetailsPage({ selectedOrder: { ...sampleOrder, status: 'processing', cancellation: null } });

      const text = rootEl.textContent;
      assert.doesNotMatch(text, /Order Cancelled/);
      assert.doesNotMatch(text, /Cancellation details/);
      assert.doesNotMatch(text, /Cancellation Reason:/);
      assert.doesNotMatch(text, /Cancelled On:/);
      assert.doesNotMatch(text, /Cancellation details are unavailable for this order/);
    });

    it('cancellation object on a non-cancelled order is not displayed on OrderDetailsPage or OrderCard', async () => {
      const activeOrderWithMalformedCancellation = {
        ...sampleOrder,
        status: 'confirmed',
        cancellation: {
          reason: 'changed_mind',
          reasonDetail: 'Should never show for confirmed orders',
          cancelledBy: 'customer',
          cancelledAt: '2026-10-01T12:00:00.000Z',
        },
      };

      // 1. OrderDetailsPage
      await renderOrderDetailsPage({ selectedOrder: activeOrderWithMalformedCancellation });
      const detailText = rootEl.textContent;
      assert.doesNotMatch(detailText, /Order Cancelled/);
      assert.doesNotMatch(detailText, /Cancellation details/);
      assert.doesNotMatch(detailText, /Cancellation Reason:/);
      assert.doesNotMatch(detailText, /Changed my mind/);
      assert.doesNotMatch(detailText, /Should never show for confirmed orders/);

      // 2. OrderCard
      await act(async () => {
        root.render(React.createElement(OrderCard, { order: activeOrderWithMalformedCancellation }));
      });
      const cardText = rootEl.textContent;
      assert.doesNotMatch(cardText, /Cancelled:/);
      assert.doesNotMatch(cardText, /Changed my mind/);
    });
  });

  describe('6. OrderContext Integration Tests', () => {
    it('OrderProvider.cancelOrder passes reason and reasonDetail to service and updates order', async () => {
      const orderContextModule = await import('./order.context.jsx');
      const OrderProvider = orderContextModule?.OrderProvider || orderContextModule?.default?.OrderProvider;
      const OrderContext = orderContextModule?.OrderContext || orderContextModule?.default?.OrderContext || orderContextModule?.default;
      const cartContextModule = await import('../cart/cart.context.jsx');
      const AuthContext = cartContextModule?.AuthContext || cartContextModule?.default?.AuthContext;

      let capturedPayload = null;
      apiClient.patch = async (endpoint, payload) => {
        capturedPayload = payload;
        return { data: { order: { ...sampleOrder, status: 'cancelled', cancellation: payload } } };
      };

      let contextVal = null;
      function TestConsumer() {
        contextVal = React.useContext(OrderContext);
        return null;
      }

      await act(async () => {
        root.render(
          React.createElement(
            AuthContext.Provider,
            { value: { isAuthenticated: true, user: { _id: 'u1' } } },
            React.createElement(OrderProvider, null, React.createElement(TestConsumer))
          )
        );
      });

      assert.ok(contextVal, 'OrderContext should be provided');
      assert.strictEqual(typeof contextVal.cancelOrder, 'function');

      let updatedOrder = null;
      await act(async () => {
        updatedOrder = await contextVal.cancelOrder(TEST_ORDER_ID, {
          reason: 'ordered_by_mistake',
          reasonDetail: 'Wrong size selected',
        });
      });

      assert.deepStrictEqual(capturedPayload, {
        reason: 'ordered_by_mistake',
        reasonDetail: 'Wrong size selected',
      });
      assert.strictEqual(updatedOrder.status, 'cancelled');
      assert.deepStrictEqual(updatedOrder.cancellation, {
        reason: 'ordered_by_mistake',
        reasonDetail: 'Wrong size selected',
      });
    });

    it('OrderProvider.cancelOrder prevents concurrent mutations with ORDER_MUTATION_IN_PROGRESS', async () => {
      const orderContextModule = await import('./order.context.jsx');
      const OrderProvider = orderContextModule?.OrderProvider || orderContextModule?.default?.OrderProvider;
      const OrderContext = orderContextModule?.OrderContext || orderContextModule?.default?.OrderContext || orderContextModule?.default;
      const cartContextModule = await import('../cart/cart.context.jsx');
      const AuthContext = cartContextModule?.AuthContext || cartContextModule?.default?.AuthContext;

      let resolvePatch;
      apiClient.patch = () => new Promise((resolve) => { resolvePatch = resolve; });

      let contextVal = null;
      function TestConsumer() {
        contextVal = React.useContext(OrderContext);
        return null;
      }

      await act(async () => {
        root.render(
          React.createElement(
            AuthContext.Provider,
            { value: { isAuthenticated: true, user: { _id: 'u1' } } },
            React.createElement(OrderProvider, null, React.createElement(TestConsumer))
          )
        );
      });

      // Start first cancellation mutation (pending)
      let firstPromise;
      act(() => {
        firstPromise = contextVal.cancelOrder(TEST_ORDER_ID, { reason: 'changed_mind' });
      });

      // Attempt second cancellation while first is in progress
      await assert.rejects(
        () => contextVal.cancelOrder(TEST_ORDER_ID, { reason: 'other' }),
        { status: 409, code: 'ORDER_MUTATION_IN_PROGRESS' }
      );

      // Resolve the first request
      await act(async () => {
        resolvePatch({ data: { order: { ...sampleOrder, status: 'cancelled' } } });
        await firstPromise;
      });
    });
  });

  describe('7. P1.5.9 Customer Cancellation Edge-Case QA', () => {
    it('handles missing or unknown reason code safely for customer, admin, and system actors', async () => {
      // 1. Missing reason with customer actor
      const customerMissingReason = {
        ...sampleOrder,
        status: 'cancelled',
        cancellation: {
          reason: null,
          cancelledBy: 'customer',
          cancelledAt: '2026-10-01T12:00:00.000Z',
        },
      };
      await renderOrderDetailsPage({ selectedOrder: customerMissingReason });
      let text = rootEl.textContent;
      assert.match(text, /Cancelled by:/);
      assert.match(text, /You/);
      assert.match(text, /Cancellation Reason:/);
      assert.match(text, /Other/);

      // 2. Missing reason with admin actor
      const adminMissingReason = {
        ...sampleOrder,
        status: 'cancelled',
        cancellation: {
          reason: undefined,
          cancelledBy: 'admin',
          cancelledAt: '2026-10-01T12:00:00.000Z',
        },
      };
      await renderOrderDetailsPage({ selectedOrder: adminMissingReason });
      text = rootEl.textContent;
      assert.match(text, /Cancelled by:/);
      assert.match(text, /Store/);
      assert.match(text, /Cancellation Reason:/);
      assert.match(text, /Other/);

      // 3. Empty string reason with system actor
      const systemEmptyReason = {
        ...sampleOrder,
        status: 'cancelled',
        cancellation: {
          reason: '',
          cancelledBy: 'system',
          cancelledAt: '2026-10-01T12:00:00.000Z',
        },
      };
      await renderOrderDetailsPage({ selectedOrder: systemEmptyReason });
      text = rootEl.textContent;
      assert.match(text, /Cancelled by:/);
      assert.match(text, /System/);
      assert.match(text, /Cancellation Reason:/);
      assert.match(text, /Other/);

      // 4. Unknown/unrecognized reason code
      const unknownReason = {
        ...sampleOrder,
        status: 'cancelled',
        cancellation: {
          reason: 'custom_discontinued_sku_event',
          cancelledBy: 'admin',
          cancelledAt: '2026-10-01T12:00:00.000Z',
        },
      };
      await renderOrderDetailsPage({ selectedOrder: unknownReason });
      text = rootEl.textContent;
      assert.match(text, /Cancelled by:/);
      assert.match(text, /Store/);
      assert.match(text, /Cancellation Reason:/);
      assert.match(text, /Other/);
      assert.doesNotMatch(text, /custom_discontinued_sku_event/);
    });

    it('sends whitespace-only reasonDetail as empty string in service and UI flows', async () => {
      let capturedPayload = null;
      apiClient.patch = async (endpoint, payload) => {
        capturedPayload = payload;
        return { data: { order: { ...sampleOrder, status: 'cancelled' } } };
      };

      // Service call with whitespace-only detail
      await serviceCancelOrder(TEST_ORDER_ID, {
        reason: 'other',
        reasonDetail: '   \t  \n  ',
      });
      assert.strictEqual(capturedPayload.reasonDetail, '');

      // UI flow with whitespace-only detail
      let uiSubmittedData = null;
      await renderOrderDetailsPage({
        cancelOrder: async (orderId, data) => {
          uiSubmittedData = data;
          return { ...sampleOrder, status: 'cancelled' };
        },
      });

      const cancelBtn = findElements(rootEl, (n) => n.tagName === 'BUTTON').find((b) => b.textContent.includes('Cancel Order'));
      await act(async () => {
        cancelBtn.dispatchEvent({ type: 'click' });
      });

      const select = findElements(rootEl, (n) => n.tagName === 'SELECT')[0];
      await act(async () => {
        select.dispatchEvent({ type: 'change', target: { value: 'other' } });
      });

      const textarea = findElements(rootEl, (n) => n.tagName === 'TEXTAREA')[0];
      await act(async () => {
        textarea.dispatchEvent({ type: 'change', target: { value: '    \n   ' } });
      });

      const submitBtn = findElements(rootEl, (n) => n.tagName === 'BUTTON').find((b) => b.textContent.includes('Confirm cancellation') || b.textContent.includes('Yes, Cancel Order'));
      await act(async () => {
        submitBtn.dispatchEvent({ type: 'click' });
      });

      assert.strictEqual(uiSubmittedData.reasonDetail, '');
    });

    it('preserves user input in modal on 409 conflict API error and does not optimistically mark cancelled', async () => {
      await renderOrderDetailsPage({
        cancelOrder: async () => {
          const err = new Error('An order operation is already in progress.');
          err.status = 409;
          err.code = 'ORDER_MUTATION_IN_PROGRESS';
          throw err;
        },
      });

      const cancelBtn = findElements(rootEl, (n) => n.tagName === 'BUTTON').find((b) => b.textContent.includes('Cancel Order'));
      await act(async () => {
        cancelBtn.dispatchEvent({ type: 'click' });
      });

      const select = findElements(rootEl, (n) => n.tagName === 'SELECT')[0];
      await act(async () => {
        select.dispatchEvent({ type: 'change', target: { value: 'found_better_price' } });
      });

      const textarea = findElements(rootEl, (n) => n.tagName === 'TEXTAREA')[0];
      await act(async () => {
        textarea.dispatchEvent({ type: 'change', target: { value: 'Competitor offered 15% discount' } });
      });

      const submitBtn = findElements(rootEl, (n) => n.tagName === 'BUTTON').find((b) => b.textContent.includes('Confirm cancellation') || b.textContent.includes('Yes, Cancel Order'));
      await act(async () => {
        submitBtn.dispatchEvent({ type: 'click' });
      });

      // Dialog must remain open
      const dialogs = findElements(rootEl, (n) => n.getAttribute('role') === 'dialog');
      assert.strictEqual(dialogs.length, 1);

      // Error must be displayed
      assert.match(rootEl.textContent, /An order operation is already in progress\./);

      // Inputs must be preserved
      assert.strictEqual(select.value, 'found_better_price');
      assert.strictEqual(textarea.value, 'Competitor offered 15% discount');

      // Order status badge remains processing, NOT cancelled
      assert.match(rootEl.textContent, /Processing/);
    });

    it('displays persisted server cancellation response when updated order is returned from API', async () => {
      const serverCancelledOrder = {
        ...sampleOrder,
        status: 'cancelled',
        cancellation: {
          reason: 'ordered_by_mistake',
          reasonDetail: 'Server-sanitized note: duplicate gear order',
          cancelledBy: 'customer',
          cancelledAt: '2026-10-02T16:45:00.000Z',
        },
      };

      let selectedState = sampleOrder;
      await renderOrderDetailsPage({
        get selectedOrder() {
          return selectedState;
        },
        cancelOrder: async () => {
          selectedState = serverCancelledOrder;
          return serverCancelledOrder;
        },
        getOrderById: async () => {
          return selectedState;
        },
      });

      const cancelBtn = findElements(rootEl, (n) => n.tagName === 'BUTTON').find((b) => b.textContent.includes('Cancel Order'));
      await act(async () => {
        cancelBtn.dispatchEvent({ type: 'click' });
      });

      const select = findElements(rootEl, (n) => n.tagName === 'SELECT')[0];
      await act(async () => {
        select.dispatchEvent({ type: 'change', target: { value: 'ordered_by_mistake' } });
      });

      const submitBtn = findElements(rootEl, (n) => n.tagName === 'BUTTON').find((b) => b.textContent.includes('Confirm cancellation') || b.textContent.includes('Yes, Cancel Order'));
      await act(async () => {
        submitBtn.dispatchEvent({ type: 'click' });
      });

      // Re-render with updated server order
      await renderOrderDetailsPage({ selectedOrder: serverCancelledOrder });

      const text = rootEl.textContent;
      assert.match(text, /Order Cancelled/);
      assert.match(text, /Cancellation details/);
      assert.match(text, /Cancelled by:/);
      assert.match(text, /You/);
      assert.match(text, /Cancellation Reason:/);
      assert.match(text, /Ordered by mistake/);
      assert.match(text, /Details:/);
      assert.match(text, /Server-sanitized note: duplicate gear order/);
      assert.match(text, /Cancelled On:/);
      assert.match(text, /Oct 2026/);
    });
  });
});
