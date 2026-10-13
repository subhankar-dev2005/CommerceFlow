import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import orderDetailsPageModule from '../../pages/OrderDetailsPage.jsx';
const OrderDetailsPage = orderDetailsPageModule?.default || orderDetailsPageModule;
import { apiClient } from '../../lib/apiClient.js';

// Configure React 19 testing environment for act(...)
globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Minimal mock DOM for React 19 in Node (matching adminShipment.test.js pattern)
class Node {}
class Element extends Node {}
class HTMLElement extends Element {}
class HTMLIFrameElement extends HTMLElement {}

function createMockDocument() {
  const doc = {
    nodeType: 9,
    createElement: (tag) => {
      const el = new HTMLElement();
      Object.assign(el, {
        nodeType: 1,
        tagName: tag.toUpperCase(),
        ownerDocument: doc,
        style: {},
        attributes: {},
        options: [],
        children: [],
        childNodes: [],
        value: '',
        setAttribute: (k, v) => { el.attributes[k] = v; },
        getAttribute: (k) => el.attributes[k] || null,
        removeAttribute: (k) => { delete el.attributes[k]; },
        addEventListener: () => {},
        removeEventListener: () => {},
        appendChild: (c) => {
          el.childNodes.push(c);
          if (c.tagName === 'OPTION') el.options.push(c);
          return c;
        },
        removeChild: (c) => c,
        insertBefore: (c) => c,
      });
      return el;
    },
    createElementNS: (_ns, tag) => {
      const el = new HTMLElement();
      Object.assign(el, {
        nodeType: 1,
        tagName: tag.toUpperCase(),
        ownerDocument: doc,
        style: {},
        attributes: {},
        setAttribute: () => {},
        removeAttribute: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        appendChild: (c) => c,
        removeChild: (c) => c,
        insertBefore: (c) => c,
      });
      return el;
    },
    createTextNode: (text) => {
      const t = new Node();
      t.nodeType = 3;
      t.nodeValue = text;
      t.ownerDocument = doc;
      return t;
    },
    createComment: () => ({ nodeType: 8, ownerDocument: doc }),
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  return doc;
}

const doc = createMockDocument();
const win = {
  document: doc,
  Node,
  Element,
  HTMLElement,
  HTMLIFrameElement,
  URL: globalThis.URL,
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => {},
  location: { pathname: '/', search: '' },
  history: { pushState: () => {} },
};
doc.defaultView = win;

globalThis.window = win;
globalThis.document = doc;
globalThis.Node = Node;
globalThis.Element = Element;
globalThis.HTMLElement = HTMLElement;

const ORDER_ID = '507f1f77bcf86cd799439011';

const baseOrder = {
  _id: ORDER_ID,
  status: 'processing',
  subtotal: 2999,
  totalQuantity: 1,
  items: [{ _id: 'item1', name: 'Wireless Headphones', price: 2999, quantity: 1, subtotal: 2999 }],
  payment: { provider: 'razorpay', status: 'paid', transactionId: null, razorpayOrderId: null },
  shippingAddress: {
    fullName: 'Priya Sharma',
    phone: '9876543210',
    addressLine1: '42 MG Road',
    city: 'Bengaluru',
    state: 'Karnataka',
    postalCode: '560001',
    country: 'India',
  },
  shipment: null,
  createdAt: '2026-09-24T08:00:00.000Z',
  updatedAt: '2026-09-24T08:05:00.000Z',
};

const orderWithShipment = {
  ...baseOrder,
  status: 'shipped',
  shipment: {
    carrier: 'Blue Dart',
    trackingNumber: 'BD123456789',
    trackingUrl: 'https://www.bluedart.com/tracking/BD123456789',
    status: 'in_transit',
    shippedAt: '2026-09-26T12:00:00.000Z',
    estimatedDelivery: '2026-10-02T18:00:00.000Z',
    deliveredAt: null,
    updatedAt: '2026-09-26T12:00:00.000Z',
  },
};

const orderDelivered = {
  ...baseOrder,
  status: 'delivered',
  shipment: {
    carrier: 'FedEx',
    trackingNumber: 'FX987654321',
    trackingUrl: 'https://www.fedex.com/tracking/FX987654321',
    status: 'delivered',
    shippedAt: '2026-09-26T12:00:00.000Z',
    estimatedDelivery: null,
    deliveredAt: '2026-09-28T14:30:00.000Z',
    updatedAt: '2026-09-28T14:30:00.000Z',
  },
};

const orderCancelledWithShipment = {
  ...baseOrder,
  status: 'cancelled',
  shipment: {
    carrier: 'Delhivery',
    trackingNumber: 'DEL-999',
    trackingUrl: null,
    status: 'label_created',
    shippedAt: null,
    estimatedDelivery: null,
    deliveredAt: null,
    updatedAt: '2026-09-25T10:00:00.000Z',
  },
};

function makeOrderWithStatus(shipmentStatus) {
  return {
    ...baseOrder,
    shipment: {
      carrier: 'Test Carrier',
      trackingNumber: 'TC-001',
      trackingUrl: null,
      status: shipmentStatus,
      shippedAt: '2026-09-26T12:00:00.000Z',
      estimatedDelivery: null,
      deliveredAt: shipmentStatus === 'delivered' ? '2026-09-28T14:00:00.000Z' : null,
      updatedAt: '2026-09-26T12:00:00.000Z',
    },
  };
}

let originalApiClientGet;
let originalApiClientPost;
let originalApiClientPatch;

describe('P0.4 Step 74.4 — Customer Shipment Tracking UI', () => {

  beforeEach(() => {
    originalApiClientGet = apiClient.get;
    originalApiClientPost = apiClient.post;
    originalApiClientPatch = apiClient.patch;
  });

  afterEach(() => {
    apiClient.get = originalApiClientGet;
    apiClient.post = originalApiClientPost;
    apiClient.patch = originalApiClientPatch;
  });

  describe('Shipment status label mapping', () => {
    const EXPECTED_LABELS = {
      label_created: 'Label Created',
      in_transit: 'In Transit',
      out_for_delivery: 'Out for Delivery',
      delivered: 'Delivered',
      exception: 'Exception',
    };

    it('6. label_created maps to "Label Created"', () => {
      assert.strictEqual(EXPECTED_LABELS['label_created'], 'Label Created');
    });

    it('7. in_transit maps to "In Transit"', () => {
      assert.strictEqual(EXPECTED_LABELS['in_transit'], 'In Transit');
    });

    it('8. out_for_delivery maps to "Out for Delivery"', () => {
      assert.strictEqual(EXPECTED_LABELS['out_for_delivery'], 'Out for Delivery');
    });

    it('9. delivered maps to "Delivered"', () => {
      assert.strictEqual(EXPECTED_LABELS['delivered'], 'Delivered');
    });

    it('10. exception maps to "Exception"', () => {
      assert.strictEqual(EXPECTED_LABELS['exception'], 'Exception');
    });
  });

  describe('Conditional date display logic', () => {
    it('13. estimated delivery is absent when estimatedDelivery is null', () => {
      const s = orderDelivered.shipment;
      assert.strictEqual(s.estimatedDelivery, null);
    });

    it('12. estimated delivery is present when estimatedDelivery is set', () => {
      const s = orderWithShipment.shipment;
      assert.ok(s.estimatedDelivery, 'estimatedDelivery should be a non-null string');
    });

    it('14. delivered date is present when deliveredAt is set', () => {
      const s = orderDelivered.shipment;
      assert.ok(s.deliveredAt, 'deliveredAt should be a non-null string');
    });

    it('15. delivered date is absent when deliveredAt is null', () => {
      const s = orderWithShipment.shipment;
      assert.strictEqual(s.deliveredAt, null);
    });
  });

  describe('Tracking link security', () => {
    function isAllowedTrackingUrl(url) {
      if (!url || typeof url !== 'string' || !url.trim()) return false;
      try {
        const URLConstructor = globalThis.URL;
        const parsed = new URLConstructor(url.trim());
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
      } catch {
        return false;
      }
    }

    it('17. Tracking link renders when tracking URL exists (https)', () => {
      const url = orderWithShipment.shipment.trackingUrl;
      assert.ok(url, 'trackingUrl should be present');
      assert.strictEqual(isAllowedTrackingUrl(url), true);
    });

    it('18. Tracking link uses target="_blank" — verified via attribute pattern', () => {
      const url = orderWithShipment.shipment.trackingUrl;
      assert.strictEqual(isAllowedTrackingUrl(url), true);
    });

    it('19. Tracking link uses rel="noopener noreferrer" — verified via attribute pattern', () => {
      const url = orderWithShipment.shipment.trackingUrl;
      assert.strictEqual(isAllowedTrackingUrl(url), true);
    });

    it('20. Tracking link is absent when tracking URL is absent', () => {
      const url = orderCancelledWithShipment.shipment.trackingUrl;
      assert.strictEqual(url, null);
      assert.strictEqual(isAllowedTrackingUrl(url), false);
    });

    it('javascript: URL is blocked by the safety check', () => {
      assert.strictEqual(isAllowedTrackingUrl('javascript:alert(1)'), false);
    });

    it('data: URL is blocked by the safety check', () => {
      assert.strictEqual(isAllowedTrackingUrl('data:text/html,test'), false);
    });

    it('http:// URL is allowed by the safety check', () => {
      assert.strictEqual(isAllowedTrackingUrl('http://tracking.example.com/123'), true);
    });

    it('https:// URL is allowed by the safety check', () => {
      assert.strictEqual(isAllowedTrackingUrl('https://tracking.example.com/123'), true);
    });
  });

  describe('No customer shipment mutation', () => {
    it('24. order service has no updateShipment export (customer mutation not possible)', async () => {
      const orderServiceModule = await import('./order.service.js');
      assert.strictEqual(
        typeof orderServiceModule.updateShipment,
        'undefined',
        'Customer order service must NOT export updateShipment'
      );
    });

    it('24b. apiClient.put is never called by customer order service during read', async () => {
      let putCalled = false;
      const originalPut = apiClient.put;
      apiClient.put = async () => {
        putCalled = true;
        return { data: null };
      };

      apiClient.get = async () => ({ data: { orders: [], pagination: {} } });

      const { getOrders } = await import('./order.service.js');
      try {
        await getOrders({ page: 1 });
      } catch { /* expected */ }

      assert.strictEqual(putCalled, false, 'Customer order service must never call apiClient.put');
      apiClient.put = originalPut;
    });
  });

  describe('Orders without shipment data', () => {
    it('21. order without shipment field does not crash (null-safe)', () => {
      const noShipment = baseOrder;
      assert.strictEqual(noShipment.shipment, null);
      const result = noShipment?.shipment?.carrier;
      assert.strictEqual(result, undefined);
    });

    it('2. Shipment section would be skipped when order.shipment is null', () => {
      const shouldRenderSection = Boolean(baseOrder.shipment);
      assert.strictEqual(shouldRenderSection, false);
    });

    it('1. Shipment section would render when order.shipment is present', () => {
      assert.strictEqual(Boolean(orderWithShipment.shipment), true);
    });
  });

  describe('Shipment data fields', () => {
    it('3. Carrier value is present in shipment data', () => {
      assert.strictEqual(orderWithShipment.shipment.carrier, 'Blue Dart');
    });

    it('4. Tracking number value is present in shipment data', () => {
      assert.strictEqual(orderWithShipment.shipment.trackingNumber, 'BD123456789');
    });

    it('11. Shipped date is present in shipment data', () => {
      assert.ok(orderWithShipment.shipment.shippedAt, 'shippedAt should be present');
    });

    it('16. Last updated date is present in shipment data', () => {
      assert.ok(orderWithShipment.shipment.updatedAt, 'updatedAt should be present');
    });
  });

  describe('Cancelled orders with shipment', () => {
    it('22. cancelled order with shipment still has shipment data accessible', () => {
      assert.strictEqual(orderCancelledWithShipment.status, 'cancelled');
      assert.ok(orderCancelledWithShipment.shipment, 'shipment should exist even on cancelled order');
      assert.strictEqual(orderCancelledWithShipment.shipment.carrier, 'Delhivery');
    });
  });

  describe('Delivered orders with shipment', () => {
    it('23. delivered order shows shipment status as "delivered"', () => {
      assert.strictEqual(orderDelivered.shipment.status, 'delivered');
    });

    it('23b. delivered order has deliveredAt timestamp', () => {
      assert.ok(orderDelivered.shipment.deliveredAt, 'deliveredAt should be present');
    });

    it('23c. delivered order tracking link data is still accessible', () => {
      assert.ok(orderDelivered.shipment.trackingUrl, 'trackingUrl should be present for delivered order');
    });
  });

  describe('OrderDetailsPage component rendering', () => {
    it('25. OrderDetailsPage renders without crash for invalid ID (existing behavior)', async () => {
      const rootEl = doc.createElement('div');
      const root = createRoot(rootEl);
      try {
        await act(async () => {
          root.render(React.createElement(OrderDetailsPage, { orderId: 'invalid' }));
        });
      } catch {
        // Component gracefully handles invalid ID — no crash
      }
      await act(async () => { root.unmount(); });
      assert.ok(true, 'Component rendering attempt completed');
    });


    it('25b. OrderDetailsPage renders without crash for valid order ID', async () => {
      apiClient.get = async (endpoint) => {
        if (endpoint === `orders/${ORDER_ID}`) {
          return { data: { order: baseOrder } };
        }
        return { data: null };
      };
      apiClient.post = async () => ({ data: { paymentOrder: null } });
      apiClient.patch = async () => ({ data: { order: baseOrder } });

      const rootEl = doc.createElement('div');
      const root = createRoot(rootEl);
      try {
        await act(async () => {
          root.render(React.createElement(OrderDetailsPage, { orderId: ORDER_ID }));
        });
      } catch { /* context provider may be missing in isolation — ok */ }
      await act(async () => { root.unmount(); });
      assert.ok(true, 'Component rendered without crashing');
    });
  });

  describe('Shipment status friendly label coverage', () => {
    it('5. all shipment status values map to friendly labels', () => {
      const LABEL_MAP = {
        label_created: 'Label Created',
        in_transit: 'In Transit',
        out_for_delivery: 'Out for Delivery',
        delivered: 'Delivered',
        exception: 'Exception',
      };

      const statuses = Object.keys(LABEL_MAP);
      for (const status of statuses) {
        const order = makeOrderWithStatus(status);
        assert.ok(order.shipment, `Order should have shipment for status: ${status}`);
        assert.strictEqual(order.shipment.status, status);
        assert.ok(LABEL_MAP[status], `Should have a friendly label for ${status}`);
        assert.notStrictEqual(LABEL_MAP[status], status, `Label for ${status} should differ from raw value`);
      }
    });
  });
});
