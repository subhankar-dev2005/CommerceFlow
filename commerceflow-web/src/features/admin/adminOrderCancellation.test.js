import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import {
  adminOrderService,
  updateOrderStatus as serviceUpdateOrderStatus,
  ADMIN_CANCELLATION_REASONS,
  ADMIN_CANCELLATION_REASON_LABELS,
  ADMIN_CANCELLATION_ACTOR_LABELS,
  getAdminCancellationReasonLabel,
  getAdminCancellationActorLabel,
} from './adminOrder.service.js';
import { CUSTOMER_CANCELLATION_REASONS } from '../orders/order.service.js';
import adminOrderDetailsPageModule from '../../pages/admin/AdminOrderDetailsPage.jsx';
const AdminOrderDetailsPage = adminOrderDetailsPageModule?.default || adminOrderDetailsPageModule;
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
    options: [],
    children: children,
    childNodes: children,
    value: '',
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
      if (event?.target?.value !== undefined) {
        el.value = event.target.value;
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
          reactProps.onChange({ target: { value: el.value, checked: el.checked } });
        } else if (type === 'click' && typeof reactProps.onClick === 'function') {
          reactProps.onClick({ target: el, preventDefault: () => {}, stopPropagation: () => {} });
        } else if (type === 'submit' && typeof reactProps.onSubmit === 'function') {
          reactProps.onSubmit({ target: el, preventDefault: () => {}, stopPropagation: () => {} });
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
      if (child.tagName === 'OPTION') el.options.push(child);
      return child;
    },
    removeChild: (child) => {
      const index = children.indexOf(child);
      if (index !== -1) {
        children.splice(index, 1);
        child.parentNode = null;
      }
      if (child.tagName === 'OPTION') {
        const optIndex = el.options.indexOf(child);
        if (optIndex !== -1) el.options.splice(optIndex, 1);
      }
      return child;
    },
    insertBefore: (newChild, refChild) => {
      if (newChild.parentNode) {
        newChild.parentNode.removeChild(newChild);
      }
      newChild.parentNode = el;
      const index = children.indexOf(refChild);
      if (index !== -1) {
        children.splice(index, 0, newChild);
      } else {
        children.push(newChild);
      }
      return newChild;
    },
    focus: () => {},
    blur: () => {},
  });

  Object.defineProperty(el, 'textContent', {
    get() {
      let text = '';
      for (const child of children) {
        if (child.nodeType === 3) text += child.nodeValue;
        else if (child.textContent) text += child.textContent;
      }
      return text;
    },
    set(val) {
      children.length = 0;
      const textNode = doc.createTextNode(String(val));
      textNode.parentNode = el;
      children.push(textNode);
    },
  });

  return el;
}

function createMockDocument() {
  const docListeners = {};
  const doc = {
    nodeType: 9,
    nodeName: '#document',
    createElement: (tag) => createMockElement(tag, doc),
    createElementNS: (_ns, tag) => createMockElement(tag, doc),
    createTextNode: (text) => {
      const node = new Node();
      node.nodeType = 3;
      node.nodeName = '#text';
      node.nodeValue = String(text);
      node.ownerDocument = doc;
      node.parentNode = null;
      return node;
    },
    createComment: () => {
      const node = new Node();
      node.nodeType = 8;
      node.nodeName = '#comment';
      node.ownerDocument = doc;
      node.parentNode = null;
      return node;
    },
    addEventListener: (type, handler) => {
      if (!docListeners[type]) docListeners[type] = [];
      docListeners[type].push(handler);
    },
    removeEventListener: (type, handler) => {
      if (docListeners[type]) {
        docListeners[type] = docListeners[type].filter((h) => h !== handler);
      }
    },
    _listeners: docListeners,
    body: null,
  };
  doc.body = createMockElement('body', doc);
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
  URL: globalThis.URL,
  location: { pathname: '/admin/orders/507f1f77bcf86cd799439011', search: '' },
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

const sampleProcessingOrder = {
  _id: TEST_ORDER_ID,
  user: { _id: '507f1f77bcf86cd799439012', name: 'Dev Tester', email: 'dev@example.com' },
  status: 'processing',
  subtotal: 5400,
  totalQuantity: 2,
  items: [
    {
      _id: 'item1',
      name: 'All-Weather Expedition Tent',
      price: 5400,
      quantity: 1,
      subtotal: 5400,
      product: { _id: 'prod1', name: 'All-Weather Expedition Tent' },
    },
  ],
  shippingAddress: {
    fullName: 'Dev Tester',
    phone: '+91 9876543210',
    addressLine1: '42 Pine Crest Trail',
    city: 'Bengaluru',
    state: 'Karnataka',
    postalCode: '560001',
    country: 'India',
  },
  payment: {
    provider: 'razorpay',
    status: 'paid',
    razorpayOrderId: 'order_test_987',
    transactionId: 'pay_test_987',
  },
  shipment: null,
  cancellation: null,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:15:00.000Z',
};

const sampleCancelledOrderWithMeta = {
  ...sampleProcessingOrder,
  status: 'cancelled',
  cancellation: {
    reason: 'item_unavailable',
    reasonDetail: 'Warehouse stock discrepancy, SKU unfulfillable',
    cancelledBy: 'admin',
    cancelledAt: '2026-10-01T11:30:00.000Z',
  },
};

const sampleLegacyCancelledOrder = {
  ...sampleProcessingOrder,
  status: 'cancelled',
  cancellation: null,
};

describe('P1.5.7 — Admin Cancellation Reason Frontend Integration Tests', () => {
  let rootEl;
  let root;
  let originalApiClientGet;
  let originalApiClientPatch;

  beforeEach(() => {
    rootEl = mockDoc.createElement('div');
    mockDoc.body.appendChild(rootEl);
    root = createRoot(rootEl);

    originalApiClientGet = apiClient.get;
    originalApiClientPatch = apiClient.patch;

    apiClient.get = async () => ({
      data: { order: sampleProcessingOrder },
    });
    apiClient.patch = async () => ({
      data: { order: sampleCancelledOrderWithMeta },
    });
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

  async function renderAdminOrderDetailsPage(orderData = sampleProcessingOrder) {
    apiClient.get = async () => ({
      data: { order: orderData },
    });

    await act(async () => {
      root.render(React.createElement(AdminOrderDetailsPage, { orderId: TEST_ORDER_ID }));
    });
  }

  describe('1. Approved Admin Reason Codes & Constants', () => {
    it('provides exactly the 7 approved admin reason codes with human-readable labels', () => {
      const expectedCodes = [
        'customer_request',
        'item_unavailable',
        'fraud_suspected',
        'delivery_address_undeliverable',
        'payment_dispute',
        'duplicate_order',
        'other',
      ];

      assert.strictEqual(ADMIN_CANCELLATION_REASONS.length, 7);
      const actualCodes = ADMIN_CANCELLATION_REASONS.map((r) => r.value);
      assert.deepStrictEqual(actualCodes, expectedCodes);

      assert.strictEqual(adminOrderService.ADMIN_CANCELLATION_REASONS, ADMIN_CANCELLATION_REASONS);
      assert.strictEqual(adminOrderService.ADMIN_CANCELLATION_REASON_LABELS, ADMIN_CANCELLATION_REASON_LABELS);
      assert.strictEqual(adminOrderService.updateOrderStatus, serviceUpdateOrderStatus);

      assert.strictEqual(ADMIN_CANCELLATION_REASON_LABELS.customer_request, 'Customer request');
      assert.strictEqual(ADMIN_CANCELLATION_REASON_LABELS.item_unavailable, 'Item unavailable');
      assert.strictEqual(ADMIN_CANCELLATION_REASON_LABELS.fraud_suspected, 'Suspected fraud');
      assert.strictEqual(ADMIN_CANCELLATION_REASON_LABELS.delivery_address_undeliverable, 'Delivery address is undeliverable');
      assert.strictEqual(ADMIN_CANCELLATION_REASON_LABELS.payment_dispute, 'Payment dispute');
      assert.strictEqual(ADMIN_CANCELLATION_REASON_LABELS.duplicate_order, 'Duplicate order');
      assert.strictEqual(ADMIN_CANCELLATION_REASON_LABELS.other, 'Other');
    });

    it('maps admin cancellation actors to human-readable labels', () => {
      assert.strictEqual(ADMIN_CANCELLATION_ACTOR_LABELS.customer, 'Customer');
      assert.strictEqual(ADMIN_CANCELLATION_ACTOR_LABELS.admin, 'Admin');
      assert.strictEqual(ADMIN_CANCELLATION_ACTOR_LABELS.system, 'System');
      assert.strictEqual(adminOrderService.ADMIN_CANCELLATION_ACTOR_LABELS, ADMIN_CANCELLATION_ACTOR_LABELS);
    });

    it('keeps admin reason options distinct from customer reason options', () => {
      const adminCodes = ADMIN_CANCELLATION_REASONS.map((r) => r.value);
      const customerCodes = CUSTOMER_CANCELLATION_REASONS.map((r) => r.value);

      // Customer-only reasons must NOT be offered to admin
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

      // Admin-only reasons must NOT be offered to customer
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
    });

    it('safely falls back to Other for unknown reason codes without exposing raw values', () => {
      assert.strictEqual(getAdminCancellationReasonLabel('unknown_code_xyz'), 'Other');
      assert.strictEqual(getAdminCancellationReasonLabel(''), 'Other');
      assert.strictEqual(getAdminCancellationReasonLabel(null), 'Other');
      assert.strictEqual(getAdminCancellationReasonLabel(undefined), 'Other');
      assert.strictEqual(getAdminCancellationReasonLabel(12345), 'Other');
    });

    it('omits unknown or missing cancellation actors', () => {
      assert.strictEqual(getAdminCancellationActorLabel('admin'), 'Admin');
      assert.strictEqual(getAdminCancellationActorLabel('customer'), 'Customer');
      assert.strictEqual(getAdminCancellationActorLabel('system'), 'System');
      assert.strictEqual(getAdminCancellationActorLabel('unknown_actor'), null);
      assert.strictEqual(getAdminCancellationActorLabel(''), null);
      assert.strictEqual(getAdminCancellationActorLabel(null), null);
      assert.strictEqual(getAdminCancellationActorLabel(undefined), null);
    });
  });

  describe('2. Admin Service Payload & Security Contract', () => {
    it('sends PATCH orders/:id/status with { status: "cancelled", reason, reasonDetail } for every approved reason code', async () => {
      for (const reasonCode of [
        'customer_request',
        'item_unavailable',
        'fraud_suspected',
        'delivery_address_undeliverable',
        'payment_dispute',
        'duplicate_order',
        'other',
      ]) {
        let capturedEndpoint = null;
        let capturedPayload = null;

        apiClient.patch = async (endpoint, payload) => {
          capturedEndpoint = endpoint;
          capturedPayload = payload;
          return { data: { order: { ...sampleProcessingOrder, status: 'cancelled' } } };
        };

        const result = await serviceUpdateOrderStatus(TEST_ORDER_ID, 'cancelled', {
          reason: reasonCode,
          reasonDetail: `Testing reason code ${reasonCode}`,
        });

        assert.strictEqual(capturedEndpoint, `orders/${TEST_ORDER_ID}/status`);
        assert.deepStrictEqual(capturedPayload, {
          status: 'cancelled',
          reason: reasonCode,
          reasonDetail: `Testing reason code ${reasonCode}`,
        });
        assert.strictEqual(result.status, 'cancelled');
      }
    });

    it('defaults reason to "other" and reasonDetail to "" if omitted on cancellation', async () => {
      let capturedPayload = null;

      apiClient.patch = async (endpoint, payload) => {
        capturedPayload = payload;
        return { data: { order: sampleProcessingOrder } };
      };

      await serviceUpdateOrderStatus(TEST_ORDER_ID, 'cancelled');
      assert.deepStrictEqual(capturedPayload, {
        status: 'cancelled',
        reason: 'other',
        reasonDetail: '',
      });
    });

    it('trims whitespace and truncates reasonDetail to 500 characters', async () => {
      let capturedPayload = null;

      apiClient.patch = async (endpoint, payload) => {
        capturedPayload = payload;
        return { data: { order: sampleProcessingOrder } };
      };

      const longText = '   ' + 'A'.repeat(600) + '   ';
      await serviceUpdateOrderStatus(TEST_ORDER_ID, 'cancelled', {
        reason: 'other',
        reasonDetail: longText,
      });

      assert.strictEqual(capturedPayload.reasonDetail.length, 500);
      assert.strictEqual(capturedPayload.reasonDetail, 'A'.repeat(500));
    });

    it('never sends client-supplied cancelledBy or cancelledAt to the backend', async () => {
      let capturedPayload = null;

      apiClient.patch = async (endpoint, payload) => {
        capturedPayload = payload;
        return { data: { order: sampleProcessingOrder } };
      };

      await serviceUpdateOrderStatus(TEST_ORDER_ID, 'cancelled', {
        reason: 'fraud_suspected',
        reasonDetail: 'Flagged transaction',
        cancelledBy: 'admin',
        cancelledAt: '2026-10-01T12:00:00.000Z',
      });

      assert.strictEqual('cancelledBy' in capturedPayload, false);
      assert.strictEqual('cancelledAt' in capturedPayload, false);
      assert.deepStrictEqual(capturedPayload, {
        status: 'cancelled',
        reason: 'fraud_suspected',
        reasonDetail: 'Flagged transaction',
      });
    });

    it('retains strictly { status } payload for non-cancellation transitions', async () => {
      for (const nonCancelledStatus of ['processing', 'shipped', 'delivered']) {
        let capturedPayload = null;

        apiClient.patch = async (endpoint, payload) => {
          capturedPayload = payload;
          return { data: { order: { ...sampleProcessingOrder, status: nonCancelledStatus } } };
        };

        // Even if options are accidentally passed, non-cancellation sends ONLY status
        await serviceUpdateOrderStatus(TEST_ORDER_ID, nonCancelledStatus, {
          reason: 'customer_request',
          reasonDetail: 'Ignored detail',
        });

        assert.deepStrictEqual(capturedPayload, {
          status: nonCancelledStatus,
        });
      }
    });

    it('rejects invalid order IDs before making network calls', async () => {
      await assert.rejects(
        () => serviceUpdateOrderStatus('bad-id', 'cancelled'),
        { name: 'ApiError', status: 400 }
      );
    });
  });

  describe('3. Admin Cancellation Reason Dialog & Confirmation Workflow', () => {
    it('shows accessible cancellation reason dialog with all 7 approved codes and 500-char detail input', async () => {
      await renderAdminOrderDetailsPage(sampleProcessingOrder);

      // Verify no dialog initially
      let dialogs = findElements(rootEl, (n) => n.getAttribute('role') === 'dialog');
      assert.strictEqual(dialogs.length, 0);

      // Select 'cancelled' in status dropdown
      const selects = findElements(rootEl, (n) => n.tagName === 'SELECT' && n.getAttribute('id') === 'status-select');
      assert.strictEqual(selects.length, 1);
      const select = selects[0];

      await act(async () => {
        select.dispatchEvent({ type: 'change', target: { value: 'cancelled' } });
      });

      // Submit status form
      const forms = findElements(rootEl, (n) => n.tagName === 'FORM');
      const statusForm = forms[0];
      await act(async () => {
        statusForm.dispatchEvent({ type: 'submit' });
      });

      // Dialog is now open
      dialogs = findElements(rootEl, (n) => n.getAttribute('role') === 'dialog');
      assert.strictEqual(dialogs.length, 1);
      assert.strictEqual(dialogs[0].getAttribute('aria-modal'), 'true');
      assert.strictEqual(dialogs[0].getAttribute('aria-labelledby'), 'confirm-dialog-title');
      assert.strictEqual(dialogs[0].getAttribute('aria-describedby'), 'confirm-dialog-description');

      // Verify all 7 reason radio inputs
      const radios = findElements(rootEl, (n) => n.tagName === 'INPUT' && n.getAttribute('type') === 'radio');
      assert.strictEqual(radios.length, 7);
      const values = radios.map((r) => r.getAttribute('value'));
      assert.deepStrictEqual(values, [
        'customer_request',
        'item_unavailable',
        'fraud_suspected',
        'delivery_address_undeliverable',
        'payment_dispute',
        'duplicate_order',
        'other',
      ]);

      // Verify optional textarea with maxlength 500 and counter
      const textareas = findElements(rootEl, (n) => n.tagName === 'TEXTAREA' && n.getAttribute('name') === 'reasonDetail');
      assert.strictEqual(textareas.length, 1);
      assert.strictEqual(textareas[0].getAttribute('maxlength'), '500');
      assert.match(rootEl.textContent, /0\/500/);
    });

    it('non-cancellation status transition submits only status without showing cancellation fields', async () => {
      let capturedPayload = null;
      apiClient.patch = async (endpoint, payload) => {
        capturedPayload = payload;
        return { data: { order: { ...sampleProcessingOrder, status: 'shipped' } } };
      };

      await renderAdminOrderDetailsPage(sampleProcessingOrder);

      // Select 'shipped' in status dropdown
      const select = findElements(rootEl, (n) => n.getAttribute('id') === 'status-select')[0];
      await act(async () => {
        select.dispatchEvent({ type: 'change', target: { value: 'shipped' } });
      });

      // Submit status form
      const form = findElements(rootEl, (n) => n.tagName === 'FORM')[0];
      await act(async () => {
        form.dispatchEvent({ type: 'submit' });
      });

      // Dialog should NOT be opened; cancellation reason fields must remain hidden
      const dialogs = findElements(rootEl, (n) => n.getAttribute('role') === 'dialog');
      assert.strictEqual(dialogs.length, 0);

      // Verify payload contains only status
      assert.deepStrictEqual(capturedPayload, {
        status: 'shipped',
      });
      assert.strictEqual('reason' in capturedPayload, false);
      assert.strictEqual('reasonDetail' in capturedPayload, false);
    });

    it('does not submit cancellation until admin confirms dialog', async () => {
      let patchCalled = false;
      apiClient.patch = async () => {
        patchCalled = true;
        return { data: { order: sampleCancelledOrderWithMeta } };
      };

      await renderAdminOrderDetailsPage(sampleProcessingOrder);

      // Select 'cancelled' and submit form to open dialog
      const select = findElements(rootEl, (n) => n.getAttribute('id') === 'status-select')[0];
      await act(async () => {
        select.dispatchEvent({ type: 'change', target: { value: 'cancelled' } });
      });
      const form = findElements(rootEl, (n) => n.tagName === 'FORM')[0];
      await act(async () => {
        form.dispatchEvent({ type: 'submit' });
      });

      // Confirm dialog opened, but NO PATCH call was made
      assert.strictEqual(patchCalled, false);

      // Cancel dialog via "Keep Order"
      const buttons = findElements(rootEl, (n) => n.tagName === 'BUTTON');
      const keepOrderBtn = buttons.find((b) => b.textContent.includes('Keep Order'));
      assert.ok(keepOrderBtn);
      await act(async () => {
        keepOrderBtn.dispatchEvent({ type: 'click' });
      });

      // Dialog closed and still no API call
      const dialogs = findElements(rootEl, (n) => n.getAttribute('role') === 'dialog');
      assert.strictEqual(dialogs.length, 0);
      assert.strictEqual(patchCalled, false);
    });

    it('dismisses cancellation dialog and resets inputs when Escape key is pressed without submitting', async () => {
      let patchCalled = false;
      apiClient.patch = async () => {
        patchCalled = true;
        return { data: { order: sampleCancelledOrderWithMeta } };
      };

      await renderAdminOrderDetailsPage(sampleProcessingOrder);

      // Open dialog
      const select = findElements(rootEl, (n) => n.getAttribute('id') === 'status-select')[0];
      await act(async () => {
        select.dispatchEvent({ type: 'change', target: { value: 'cancelled' } });
      });
      const form = findElements(rootEl, (n) => n.tagName === 'FORM')[0];
      await act(async () => {
        form.dispatchEvent({ type: 'submit' });
      });

      // Dialog is open
      assert.strictEqual(findElements(rootEl, (n) => n.getAttribute('role') === 'dialog').length, 1);

      // Dispatch Escape key
      await act(async () => {
        mockWin.dispatchEvent({ type: 'keydown', key: 'Escape' });
      });

      // Dialog is closed without API call
      assert.strictEqual(findElements(rootEl, (n) => n.getAttribute('role') === 'dialog').length, 0);
      assert.strictEqual(patchCalled, false);
    });

    it('defaults UI reason selection to "other" and requires reason for confirm button', async () => {
      await renderAdminOrderDetailsPage(sampleProcessingOrder);

      const select = findElements(rootEl, (n) => n.getAttribute('id') === 'status-select')[0];
      await act(async () => {
        select.dispatchEvent({ type: 'change', target: { value: 'cancelled' } });
      });
      const form = findElements(rootEl, (n) => n.tagName === 'FORM')[0];
      await act(async () => {
        form.dispatchEvent({ type: 'submit' });
      });

      const buttons = findElements(rootEl, (n) => n.tagName === 'BUTTON');
      const confirmBtn = buttons.find((b) => b.textContent.includes('Confirm Cancellation'));
      assert.ok(confirmBtn);

      // Defaults to 'other'
      const otherRadio = findElements(rootEl, (n) => n.getAttribute('value') === 'other')[0];
      assert.ok(otherRadio);
      assert.strictEqual(otherRadio.checked, true);

      // Enabled because a valid reason ('other') is selected by default
      assert.strictEqual(confirmBtn.disabled, false);

      // Select 'customer_request'
      const radio = findElements(rootEl, (n) => n.getAttribute('value') === 'customer_request')[0];
      await act(async () => {
        radio.dispatchEvent({ type: 'change', target: { value: 'customer_request', checked: true } });
      });

      // Now customer_request is checked and confirm button remains enabled
      assert.strictEqual(radio.checked, true);
      assert.strictEqual(confirmBtn.disabled, false);
    });

    it('submits default "other" reason if submitted without altering reason selector', async () => {
      let capturedPayload = null;
      apiClient.patch = async (endpoint, payload) => {
        capturedPayload = payload;
        return { data: { order: sampleCancelledOrderWithMeta } };
      };

      await renderAdminOrderDetailsPage(sampleProcessingOrder);

      // Open modal
      const select = findElements(rootEl, (n) => n.getAttribute('id') === 'status-select')[0];
      await act(async () => {
        select.dispatchEvent({ type: 'change', target: { value: 'cancelled' } });
      });
      const form = findElements(rootEl, (n) => n.tagName === 'FORM')[0];
      await act(async () => {
        form.dispatchEvent({ type: 'submit' });
      });

      // Immediately submit without altering radio selection or typing detail
      const confirmBtn = findElements(rootEl, (n) => n.tagName === 'BUTTON' && n.textContent.includes('Confirm Cancellation'))[0];
      await act(async () => {
        confirmBtn.dispatchEvent({ type: 'click' });
      });

      assert.deepStrictEqual(capturedPayload, {
        status: 'cancelled',
        reason: 'other',
        reasonDetail: '',
      });
    });

    it('submits confirmed reason and trimmed reasonDetail to API', async () => {
      let capturedPayload = null;
      apiClient.patch = async (endpoint, payload) => {
        capturedPayload = payload;
        return { data: { order: sampleCancelledOrderWithMeta } };
      };

      await renderAdminOrderDetailsPage(sampleProcessingOrder);

      // Open modal
      const select = findElements(rootEl, (n) => n.getAttribute('id') === 'status-select')[0];
      await act(async () => {
        select.dispatchEvent({ type: 'change', target: { value: 'cancelled' } });
      });
      const form = findElements(rootEl, (n) => n.tagName === 'FORM')[0];
      await act(async () => {
        form.dispatchEvent({ type: 'submit' });
      });

      // Pick 'fraud_suspected'
      const radio = findElements(rootEl, (n) => n.getAttribute('value') === 'fraud_suspected')[0];
      await act(async () => {
        radio.dispatchEvent({ type: 'change', target: { value: 'fraud_suspected', checked: true } });
      });

      // Enter details
      const textarea = findElements(rootEl, (n) => n.tagName === 'TEXTAREA' && n.getAttribute('name') === 'reasonDetail')[0];
      await act(async () => {
        textarea.dispatchEvent({ type: 'change', target: { value: '  Suspicious chargeback risk reported  ' } });
      });

      // Confirm cancellation
      const confirmBtn = findElements(rootEl, (n) => n.tagName === 'BUTTON' && n.textContent.includes('Confirm Cancellation'))[0];
      await act(async () => {
        confirmBtn.dispatchEvent({ type: 'click' });
      });

      assert.deepStrictEqual(capturedPayload, {
        status: 'cancelled',
        reason: 'fraud_suspected',
        reasonDetail: 'Suspicious chargeback risk reported',
      });
    });

    it('on API failure, keeps dialog open and preserves selected reason and detail', async () => {
      apiClient.patch = async () => {
        const error = new Error('Backend rejected cancellation: Order already shipped');
        error.code = 'INVALID_ORDER_STATUS_TRANSITION';
        throw error;
      };

      await renderAdminOrderDetailsPage(sampleProcessingOrder);

      // Open modal
      const select = findElements(rootEl, (n) => n.getAttribute('id') === 'status-select')[0];
      await act(async () => {
        select.dispatchEvent({ type: 'change', target: { value: 'cancelled' } });
      });
      const form = findElements(rootEl, (n) => n.tagName === 'FORM')[0];
      await act(async () => {
        form.dispatchEvent({ type: 'submit' });
      });

      // Select 'item_unavailable' and type detail
      const radio = findElements(rootEl, (n) => n.getAttribute('value') === 'item_unavailable')[0];
      await act(async () => {
        radio.dispatchEvent({ type: 'change', target: { value: 'item_unavailable', checked: true } });
      });

      const textarea = findElements(rootEl, (n) => n.tagName === 'TEXTAREA' && n.getAttribute('name') === 'reasonDetail')[0];
      await act(async () => {
        textarea.dispatchEvent({ type: 'change', target: { value: 'Out of stock in fulfillment center 3' } });
      });

      // Click Confirm Cancellation
      const confirmBtn = findElements(rootEl, (n) => n.tagName === 'BUTTON' && n.textContent.includes('Confirm Cancellation'))[0];
      await act(async () => {
        confirmBtn.dispatchEvent({ type: 'click' });
      });

      // Dialog MUST remain open
      const dialogs = findElements(rootEl, (n) => n.getAttribute('role') === 'dialog');
      assert.strictEqual(dialogs.length, 1);

      // Reason and detail MUST be preserved
      assert.match(rootEl.textContent, /Backend rejected cancellation/);
      const preservedRadio = findElements(rootEl, (n) => n.getAttribute('value') === 'item_unavailable')[0];
      assert.strictEqual(preservedRadio.checked, true);
      const preservedTextarea = findElements(rootEl, (n) => n.tagName === 'TEXTAREA' && n.getAttribute('name') === 'reasonDetail')[0];
      assert.strictEqual(preservedTextarea.value, 'Out of stock in fulfillment center 3');

      // Order status MUST NOT be optimistically marked cancelled
      assert.match(rootEl.textContent, /Processing/i);

      // Safe retry: API now succeeds, resubmitting with preserved values
      let retriedPayload = null;
      apiClient.patch = async (endpoint, payload) => {
        retriedPayload = payload;
        return { data: { order: sampleCancelledOrderWithMeta } };
      };

      await act(async () => {
        confirmBtn.dispatchEvent({ type: 'click' });
      });

      assert.deepStrictEqual(retriedPayload, {
        status: 'cancelled',
        reason: 'item_unavailable',
        reasonDetail: 'Out of stock in fulfillment center 3',
      });
      // Dialog closes on successful retry
      assert.strictEqual(findElements(rootEl, (n) => n.getAttribute('role') === 'dialog').length, 0);
    });

    it('prevents duplicate submissions while cancellation mutation is in flight', async () => {
      let resolvePatch;
      const patchPromise = new Promise((resolve) => {
        resolvePatch = resolve;
      });
      apiClient.patch = () => patchPromise;

      await renderAdminOrderDetailsPage(sampleProcessingOrder);

      // Open modal
      const select = findElements(rootEl, (n) => n.getAttribute('id') === 'status-select')[0];
      await act(async () => {
        select.dispatchEvent({ type: 'change', target: { value: 'cancelled' } });
      });
      const form = findElements(rootEl, (n) => n.tagName === 'FORM')[0];
      await act(async () => {
        form.dispatchEvent({ type: 'submit' });
      });

      // Select 'other'
      const radio = findElements(rootEl, (n) => n.getAttribute('value') === 'other')[0];
      await act(async () => {
        radio.dispatchEvent({ type: 'change', target: { value: 'other', checked: true } });
      });

      // Click Confirm Cancellation
      const confirmBtn = findElements(rootEl, (n) => n.tagName === 'BUTTON' && n.textContent.includes('Confirm Cancellation'))[0];
      await act(async () => {
        confirmBtn.dispatchEvent({ type: 'click' });
      });

      // While in flight, confirm button must be disabled
      assert.strictEqual(confirmBtn.disabled, true);

      // Resolve API
      await act(async () => {
        resolvePatch({ data: { order: sampleCancelledOrderWithMeta } });
      });

      // Dialog closes on success
      const dialogs = findElements(rootEl, (n) => n.getAttribute('role') === 'dialog');
      assert.strictEqual(dialogs.length, 0);
    });
  });

  describe('4. Persisted Metadata Display & Legacy Absence', () => {
    it('displays persisted cancellation reason, details, actor, and timestamp when metadata exists', async () => {
      await renderAdminOrderDetailsPage(sampleCancelledOrderWithMeta);

      const text = rootEl.textContent;
      assert.match(text, /Cancellation Details/i);
      // Reason formatted with label: 'Item unavailable'
      assert.match(text, /Item unavailable/);
      // Detail
      assert.match(text, /Warehouse stock discrepancy, SKU unfulfillable/);
      // Actor: 'Admin'
      assert.match(text, /Admin/);
      // Timestamp
      assert.match(text, /Cancelled On:/i);
    });

    it('displays system cancellation metadata with readable reason (System checkout failure) and actor (System)', async () => {
      const systemCancelledOrder = {
        ...sampleProcessingOrder,
        status: 'cancelled',
        cancellation: {
          reason: 'system_checkout_failure',
          reasonDetail: '',
          cancelledBy: 'system',
          cancelledAt: '2026-10-01T12:00:00.000Z',
        },
      };

      await renderAdminOrderDetailsPage(systemCancelledOrder);

      const text = rootEl.textContent;
      assert.match(text, /Cancellation Details/i);
      assert.match(text, /System checkout failure/);
      assert.match(text, /System/);
      assert.match(text, /Cancelled On:/i);
    });

    it('displays customer cancellation metadata in admin order details with readable actor (Customer)', async () => {
      const customerCancelledOrder = {
        ...sampleProcessingOrder,
        status: 'cancelled',
        cancellation: {
          reason: 'changed_mind',
          reasonDetail: 'Customer called support to cancel',
          cancelledBy: 'customer',
          cancelledAt: '2026-10-01T12:00:00.000Z',
        },
      };

      await renderAdminOrderDetailsPage(customerCancelledOrder);

      const text = rootEl.textContent;
      assert.match(text, /Cancellation Details/i);
      assert.match(text, /Changed my mind/);
      assert.match(text, /Customer called support to cancel/);
      assert.match(text, /Customer/);
    });

    it('handles legacy cancelled orders without metadata without crashing or inventing values', async () => {
      await renderAdminOrderDetailsPage(sampleLegacyCancelledOrder);

      const text = rootEl.textContent;
      // Fulfillment status should show Cancelled
      assert.match(text, /Cancelled/);
      // Neutral fallback is displayed
      assert.match(text, /Cancellation details unavailable/i);
      // But no invented reason, no invented actor, no "Reason: undefined" or "Reason: Other"
      assert.doesNotMatch(text, /Cancellation Reason:/i);
      assert.doesNotMatch(text, /Cancelled By:/i);
      assert.doesNotMatch(text, /Reason Detail:/i);
    });

    it('hides reason detail in admin view when reasonDetail is empty string', async () => {
      const orderEmptyDetail = {
        ...sampleProcessingOrder,
        status: 'cancelled',
        cancellation: {
          reason: 'fraud_suspected',
          reasonDetail: '',
          cancelledBy: 'admin',
          cancelledAt: '2026-10-01T12:00:00.000Z',
        },
      };

      await renderAdminOrderDetailsPage(orderEmptyDetail);

      const text = rootEl.textContent;
      assert.match(text, /Cancellation Details/i);
      assert.match(text, /Suspected fraud/);
      assert.doesNotMatch(text, /Reason Detail:/i);
    });

    it('does not display cancellation details or fallback for active, non-cancelled orders', async () => {
      await renderAdminOrderDetailsPage(sampleProcessingOrder);

      const text = rootEl.textContent;
      assert.doesNotMatch(text, /Cancellation Details/i);
      assert.doesNotMatch(text, /Cancellation details unavailable/i);
    });

    it('renders cancellation date when a valid timestamp is provided', async () => {
      const orderValidDate = {
        ...sampleProcessingOrder,
        status: 'cancelled',
        cancellation: {
          reason: 'customer_request',
          reasonDetail: 'Customer phoned in',
          cancelledBy: 'admin',
          cancelledAt: '2026-10-01T14:30:00.000Z',
        },
      };

      await renderAdminOrderDetailsPage(orderValidDate);

      const text = rootEl.textContent;
      assert.match(text, /Cancelled On:/i);
      assert.match(text, /2026/);
    });

    it('omits cancellation date when cancelledAt is invalid without fabricating values or rendering Invalid Date', async () => {
      const orderInvalidDate = {
        ...sampleProcessingOrder,
        status: 'cancelled',
        cancellation: {
          reason: 'item_unavailable',
          reasonDetail: 'Supplier discontinued',
          cancelledBy: 'admin',
          cancelledAt: 'invalid-date-format',
        },
      };

      await renderAdminOrderDetailsPage(orderInvalidDate);

      const text = rootEl.textContent;
      assert.match(text, /Cancellation Details/i);
      assert.match(text, /Item unavailable/);
      assert.match(text, /Supplier discontinued/);
      assert.match(text, /Admin/);
      // Must not display "Cancelled On:"
      assert.doesNotMatch(text, /Cancelled On:/i);
      // Must not display "Invalid Date" or "Not available" for the date
      assert.doesNotMatch(text, /Invalid Date/i);
      assert.doesNotMatch(text, /Not available/i);
    });

    it('falls back to neutral text when order has only an invalid cancellation date and no other metadata', async () => {
      const orderOnlyInvalidDate = {
        ...sampleProcessingOrder,
        status: 'cancelled',
        cancellation: {
          reason: null,
          reasonDetail: null,
          cancelledBy: null,
          cancelledAt: 'malformed_timestamp_123',
        },
      };

      await renderAdminOrderDetailsPage(orderOnlyInvalidDate);

      const text = rootEl.textContent;
      assert.match(text, /Cancellation details unavailable/i);
      assert.doesNotMatch(text, /Cancelled On:/i);
      assert.doesNotMatch(text, /Invalid Date/i);
      assert.doesNotMatch(text, /Not available/i);
    });

    it('falls back to neutral text when order has only an unknown cancellation actor and no other metadata', async () => {
      const orderOnlyUnknownActor = {
        ...sampleProcessingOrder,
        status: 'cancelled',
        cancellation: {
          reason: null,
          reasonDetail: null,
          cancelledBy: 'unrecognized_actor_injection',
          cancelledAt: null,
        },
      };

      await renderAdminOrderDetailsPage(orderOnlyUnknownActor);

      const text = rootEl.textContent;
      assert.match(text, /Cancellation details unavailable/i);
      assert.doesNotMatch(text, /Cancelled By:/i);
      assert.doesNotMatch(text, /unrecognized_actor_injection/);
    });

    it('safely falls back to Other for unknown reason code in admin view and never renders raw unknown code', async () => {
      const orderUnknownReason = {
        ...sampleProcessingOrder,
        status: 'cancelled',
        cancellation: {
          reason: 'unrecognized_legacy_or_malformed_code',
          reasonDetail: 'Some reason detail text',
          cancelledBy: 'admin',
          cancelledAt: '2026-10-01T12:00:00.000Z',
        },
      };

      await renderAdminOrderDetailsPage(orderUnknownReason);

      const text = rootEl.textContent;
      assert.match(text, /Cancellation Details/i);
      assert.match(text, /Reason:/);
      assert.match(text, /Other/);
      assert.doesNotMatch(text, /unrecognized_legacy_or_malformed_code/);
    });

    it('omits actor line in admin view when cancelledBy is missing or unknown and never renders raw unknown values', async () => {
      const orderUnknownActor = {
        ...sampleProcessingOrder,
        status: 'cancelled',
        cancellation: {
          reason: 'item_unavailable',
          reasonDetail: '',
          cancelledBy: 'malicious_injected_actor',
          cancelledAt: '2026-10-01T12:00:00.000Z',
        },
      };

      await renderAdminOrderDetailsPage(orderUnknownActor);

      const text = rootEl.textContent;
      assert.match(text, /Cancellation Details/i);
      assert.match(text, /Item unavailable/);
      // Entire actor line should be omitted
      assert.doesNotMatch(text, /Cancelled By:/i);
      assert.doesNotMatch(text, /malicious_injected_actor/);
    });
  });
});
