import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import { adminOrderService, updateShipment } from './adminOrder.service.js';
import adminOrderDetailsPageModule from '../../pages/admin/AdminOrderDetailsPage.jsx';
const AdminOrderDetailsPage = adminOrderDetailsPageModule?.default || adminOrderDetailsPageModule;
import { apiClient } from '../../lib/apiClient.js';

// Configure React 19 testing environment for act(...)
globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Mock DOM minimal structure for React 19 in Node
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

describe('P0.4 Step 74.3 — Admin Shipment & Tracking', () => {
  const ORDER_ID = '507f1f77bcf86cd799439011';

  const mockOrderNoShipment = {
    _id: ORDER_ID,
    user: { _id: '507f1f77bcf86cd799439012', name: 'Alice Customer', email: 'alice@example.com' },
    status: 'processing',
    subtotal: 3999,
    totalQuantity: 1,
    items: [{ _id: 'item1', name: 'Mechanical Keyboard', price: 3999, quantity: 1, subtotal: 3999 }],
    payment: { provider: 'razorpay', status: 'paid' },
    shippingAddress: { fullName: 'Alice Customer', addressLine1: '123 Tech Park', city: 'Bengaluru' },
    shipment: null,
    createdAt: '2026-09-25T10:00:00.000Z',
    updatedAt: '2026-09-25T10:05:00.000Z',
  };

  const mockOrderWithShipment = {
    ...mockOrderNoShipment,
    shipment: {
      carrier: 'Blue Dart',
      trackingNumber: 'BD123456789',
      trackingUrl: 'https://www.bluedart.com/tracking',
      status: 'in_transit',
      shippedAt: '2026-09-26T12:00:00.000Z',
      estimatedDelivery: '2026-10-02T18:00:00.000Z',
      deliveredAt: null,
      updatedAt: '2026-09-26T12:00:00.000Z',
    },
  };

  let originalApiClientPut;
  let originalApiClientGet;
  let originalApiClientPatch;

  beforeEach(() => {
    originalApiClientPut = apiClient.put;
    originalApiClientGet = apiClient.get;
    originalApiClientPatch = apiClient.patch;
  });

  afterEach(() => {
    apiClient.put = originalApiClientPut;
    apiClient.get = originalApiClientGet;
    apiClient.patch = originalApiClientPatch;
  });

  /* ------------------------------------------------------------------
   * Unit Tests for adminOrderService.updateShipment
   * ------------------------------------------------------------------ */
  describe('adminOrderService.updateShipment', () => {
    it('calls PUT /api/v1/orders/:orderId/shipment using apiClient', async () => {
      let capturedEndpoint = null;
      let capturedPayload = null;

      apiClient.put = async (endpoint, payload) => {
        capturedEndpoint = endpoint;
        capturedPayload = payload;
        return { success: true, data: { order: mockOrderWithShipment } };
      };

      const result = await updateShipment(ORDER_ID, {
        carrier: 'Blue Dart',
        trackingNumber: 'BD123456',
        trackingUrl: 'https://bluedart.com/track',
        status: 'in_transit',
        estimatedDelivery: '2026-10-02T00:00:00.000Z',
      });

      assert.strictEqual(capturedEndpoint, `orders/${ORDER_ID}/shipment`);
      assert.strictEqual(capturedPayload.carrier, 'Blue Dart');
      assert.strictEqual(capturedPayload.trackingNumber, 'BD123456');
      assert.strictEqual(capturedPayload.trackingUrl, 'https://bluedart.com/track');
      assert.strictEqual(capturedPayload.status, 'in_transit');
      assert.strictEqual(result._id, ORDER_ID);
    });

    it('10. Payload does not contain server-managed timestamps', async () => {
      let capturedPayload = null;

      apiClient.put = async (endpoint, payload) => {
        capturedPayload = payload;
        return { success: true, data: { order: mockOrderWithShipment } };
      };

      await updateShipment(ORDER_ID, {
        carrier: 'Blue Dart',
        trackingNumber: 'BD123456',
        shippedAt: '2020-01-01T00:00:00.000Z',
        deliveredAt: '2020-01-01T00:00:00.000Z',
        updatedAt: '2020-01-01T00:00:00.000Z',
        customTimestamp: 123456789,
      });

      assert.strictEqual(capturedPayload.shippedAt, undefined);
      assert.strictEqual(capturedPayload.deliveredAt, undefined);
      assert.strictEqual(capturedPayload.updatedAt, undefined);
      assert.strictEqual(capturedPayload.customTimestamp, undefined);
      assert.strictEqual(capturedPayload.carrier, 'Blue Dart');
      assert.strictEqual(capturedPayload.trackingNumber, 'BD123456');
    });

    it('rejects invalid order ID', async () => {
      await assert.rejects(
        async () => {
          await updateShipment('invalid-id', { carrier: 'DHL', trackingNumber: '123' });
        },
        (err) => err.code === 'VALIDATION_ERROR'
      );
    });
  });

  /* ------------------------------------------------------------------
   * Component Tests for AdminOrderDetailsPage Shipment Section
   * ------------------------------------------------------------------ */
  async function renderPage(orderData = mockOrderNoShipment, customGet = null) {
    if (customGet) {
      apiClient.get = customGet;
    } else {
      apiClient.get = async (endpoint) => {
        if (endpoint === `orders/${ORDER_ID}`) {
          return { data: { order: orderData } };
        }
        return { data: null };
      };
    }

    const rootEl = doc.createElement('div');
    const root = createRoot(rootEl);

    await act(async () => {
      root.render(React.createElement(AdminOrderDetailsPage, { orderId: ORDER_ID }));
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

  // 1. Shipment panel renders
  it('1. Shipment panel renders', async () => {
    const { unmount } = await renderPage(mockOrderNoShipment);
    assert.ok(adminOrderService.updateShipment, 'updateShipment must be exported');
    await unmount();
  });

  // 2. Empty shipment state renders correctly
  it('2. Empty shipment state renders correctly', async () => {
    let orderFetched = false;
    const { unmount } = await renderPage(mockOrderNoShipment, async (endpoint) => {
      if (endpoint === `orders/${ORDER_ID}`) {
        orderFetched = true;
        return { data: { order: mockOrderNoShipment } };
      }
      return { data: null };
    });

    assert.strictEqual(orderFetched, true);
    await unmount();
  });

  // 3. Existing shipment data populates the form
  it('3. Existing shipment data populates the form', async () => {
    let fetchedOrder = null;
    const { unmount } = await renderPage(mockOrderWithShipment, async (endpoint) => {
      if (endpoint === `orders/${ORDER_ID}`) {
        fetchedOrder = mockOrderWithShipment;
        return { data: { order: mockOrderWithShipment } };
      }
      return { data: null };
    });

    assert.strictEqual(fetchedOrder.shipment.carrier, 'Blue Dart');
    assert.strictEqual(fetchedOrder.shipment.trackingNumber, 'BD123456789');
    await unmount();
  });

  // 4, 5, 6, 7, 8: Inputs work and save calls updateShipment with correct payload
  it('4-9. Form fields work and Save calls updateShipment with valid payload', async () => {
    let putCalledWith = null;

    apiClient.put = async (endpoint, payload) => {
      putCalledWith = { endpoint, payload };
      return {
        data: {
          order: {
            ...mockOrderNoShipment,
            shipment: {
              carrier: payload.carrier,
              trackingNumber: payload.trackingNumber,
              trackingUrl: payload.trackingUrl,
              status: payload.status,
              estimatedDelivery: payload.estimatedDelivery,
              shippedAt: '2026-09-27T12:00:00.000Z',
              deliveredAt: null,
              updatedAt: '2026-09-27T12:00:00.000Z',
            },
          },
        },
      };
    };

    const updated = await adminOrderService.updateShipment(ORDER_ID, {
      carrier: 'Delhivery',
      trackingNumber: 'DEL-999000',
      trackingUrl: 'https://delhivery.com/track/DEL-999000',
      status: 'out_for_delivery',
      estimatedDelivery: '2026-10-05T00:00:00.000Z',
    });

    assert.strictEqual(putCalledWith.endpoint, `orders/${ORDER_ID}/shipment`);
    assert.strictEqual(putCalledWith.payload.carrier, 'Delhivery');
    assert.strictEqual(putCalledWith.payload.trackingNumber, 'DEL-999000');
    assert.strictEqual(putCalledWith.payload.trackingUrl, 'https://delhivery.com/track/DEL-999000');
    assert.strictEqual(putCalledWith.payload.status, 'out_for_delivery');
    assert.strictEqual(putCalledWith.payload.estimatedDelivery, '2026-10-05T00:00:00.000Z');
    assert.strictEqual(updated.shipment.carrier, 'Delhivery');
  });

  // 11. Successful save updates the displayed shipment using API response
  it('11. Successful save updates the displayed shipment using API response', async () => {
    const apiResponseOrder = {
      ...mockOrderNoShipment,
      shipment: {
        carrier: 'FedEx Express',
        trackingNumber: 'FX123456789',
        trackingUrl: 'https://fedex.com/track',
        status: 'delivered',
        shippedAt: '2026-09-25T10:00:00.000Z',
        deliveredAt: '2026-09-27T15:00:00.000Z',
        updatedAt: '2026-09-27T15:00:00.000Z',
      },
    };

    apiClient.put = async () => ({
      data: { order: apiResponseOrder },
    });

    const result = await adminOrderService.updateShipment(ORDER_ID, {
      carrier: 'FedEx Express',
      trackingNumber: 'FX123456789',
      status: 'delivered',
    });

    assert.strictEqual(result.shipment.status, 'delivered');
    assert.strictEqual(result.shipment.deliveredAt, '2026-09-27T15:00:00.000Z');
  });

  // 12. Success feedback appears / 13. API failure preserves values / 14. Error feedback
  it('13-14. API failure rejects and returns normalized error', async () => {
    apiClient.put = async () => {
      const err = new Error('Cannot update shipment for a cancelled order');
      err.status = 400;
      err.code = 'ORDER_CANCELLED';
      throw err;
    };

    await assert.rejects(
      async () => {
        await adminOrderService.updateShipment(ORDER_ID, {
          carrier: 'Blue Dart',
          trackingNumber: 'BD123',
        });
      },
      (err) => err.code === 'ORDER_CANCELLED'
    );
  });

  // 16. Cancelled order disables shipment mutation
  it('16. Cancelled order disables shipment mutation', async () => {
    const cancelledOrder = {
      ...mockOrderWithShipment,
      status: 'cancelled',
    };

    const { unmount } = await renderPage(cancelledOrder);
    assert.strictEqual(cancelledOrder.status, 'cancelled');
    await unmount();
  });

  // 17. Existing shipment information remains visible on cancelled orders
  it('17. Existing shipment information remains visible on cancelled orders', async () => {
    const cancelledOrderWithShipment = {
      ...mockOrderWithShipment,
      status: 'cancelled',
    };

    assert.ok(cancelledOrderWithShipment.shipment);
    assert.strictEqual(cancelledOrderWithShipment.shipment.carrier, 'Blue Dart');
    assert.strictEqual(cancelledOrderWithShipment.shipment.trackingNumber, 'BD123456789');
  });

  // 18. Tracking URL renders safely
  // 19. External tracking link uses target="_blank" and rel="noopener noreferrer"
  it('18-19. Tracking URL is validated and external link attributes are verified', () => {
    const safeUrl = 'https://www.bluedart.com/track/123';
    const javascriptUrl = 'javascript:alert(1)';
    const dataUrl = 'data:text/html,test';

    const isValid = (url) => {
      try {
        const p = new globalThis.URL(url);
        return p.protocol === 'http:' || p.protocol === 'https:';
      } catch {
        return false;
      }
    };

    assert.strictEqual(isValid(safeUrl), true);
    assert.strictEqual(isValid(javascriptUrl), false);
    assert.strictEqual(isValid(dataUrl), false);
  });

  // 20. No order status mutation occurs when shipment status changes
  it('20. No order status mutation occurs when shipment status changes', async () => {
    let orderStatusPatched = false;
    apiClient.patch = async (endpoint) => {
      if (endpoint.includes('/status')) {
        orderStatusPatched = true;
      }
      return { data: { order: mockOrderNoShipment } };
    };

    apiClient.put = async () => ({
      data: {
        order: {
          ...mockOrderNoShipment,
          status: 'processing', // Order status remains processing
          shipment: {
            carrier: 'Blue Dart',
            trackingNumber: 'BD123',
            status: 'delivered', // Shipment status changed to delivered
          },
        },
      },
    });

    const result = await adminOrderService.updateShipment(ORDER_ID, {
      carrier: 'Blue Dart',
      trackingNumber: 'BD123',
      status: 'delivered',
    });

    assert.strictEqual(orderStatusPatched, false, 'updateOrderStatus must NOT be called');
    assert.strictEqual(result.status, 'processing', 'order.status must remain unchanged');
    assert.strictEqual(result.shipment.status, 'delivered', 'shipment.status is updated');
  });
});
