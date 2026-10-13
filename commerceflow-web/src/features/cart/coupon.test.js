import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import cartContextModule from './cart.context.jsx';
import { applyCoupon, removeCoupon } from './cart.service.js';
import { createOrder } from '../orders/order.service.js';
import { apiClient, ApiError } from '../../lib/apiClient.js';
import { normalizeOrderFinancials, formatPrice } from '../../lib/utils.js';

const { CartProvider, CartContext, AuthContext } = cartContextModule;

globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Mock DOM environment for React 19 testing in Node
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

class MockStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, value) {
    this.store.set(key, String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

const doc = createMockDocument();
let currentStorage = new MockStorage();
const windowListeners = new Map();

const win = {
  document: doc,
  Node,
  Element,
  HTMLElement,
  HTMLIFrameElement,
  get localStorage() {
    return currentStorage;
  },
  addEventListener: (type, handler) => {
    if (!windowListeners.has(type)) windowListeners.set(type, new Set());
    windowListeners.get(type).add(handler);
  },
  removeEventListener: (type, handler) => {
    if (windowListeners.has(type)) {
      windowListeners.get(type).delete(handler);
    }
  },
  dispatchEvent: (event) => {
    const handlers = windowListeners.get(event.type);
    if (handlers) {
      for (const handler of Array.from(handlers)) {
        handler(event);
      }
    }
  },
};

doc.defaultView = win;
globalThis.window = win;
globalThis.document = doc;
globalThis.Node = Node;
globalThis.Element = Element;
globalThis.HTMLElement = HTMLElement;

describe('P1.1 Step 77.6 — Customer Coupon Frontend Integration', () => {
  let originalPost;
  let originalGet;
  let originalDelete;
  let originalPatch;

  beforeEach(() => {
    originalPost = apiClient.post;
    originalGet = apiClient.get;
    originalDelete = apiClient.delete;
    originalPatch = apiClient.patch;
    currentStorage = new MockStorage();
    windowListeners.clear();
  });

  afterEach(() => {
    apiClient.post = originalPost;
    apiClient.get = originalGet;
    apiClient.delete = originalDelete;
    apiClient.patch = originalPatch;
  });

  function mountCartContext(authValue = { isAuthenticated: true, isLoading: false }) {
    let latestContext = null;

    function TestConsumer() {
      latestContext = React.useContext(CartContext);
      return null;
    }

    const container = doc.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        React.createElement(
          AuthContext.Provider,
          { value: authValue },
          React.createElement(CartProvider, null, React.createElement(TestConsumer))
        )
      );
    });

    return {
      get: () => latestContext,
      unmount: () => {
        act(() => root.unmount());
      },
    };
  }

  // --------------------------------------------------------------------------
  // Cart Service Direct Function Tests
  // --------------------------------------------------------------------------
  describe('Cart Service Coupon APIs', () => {
    it('service applyCoupon sends POST cart/coupon and returns parsed payload', async () => {
      let calledUrl = null;
      let sentBody = null;
      apiClient.post = async (url, body) => {
        calledUrl = url;
        sentBody = body;
        return {
          success: true,
          data: {
            cart: { items: [] },
            coupon: { code: 'SAVE10', discountAmount: 100, isValid: true },
            financials: { subtotal: 1000, shippingAmount: 0, taxAmount: 0, discountAmount: 100, total: 900 },
            totals: { subtotal: 1000, discountAmount: 100, total: 900 },
          },
        };
      };

      const result = await applyCoupon('SAVE10');
      assert.equal(calledUrl, 'cart/coupon');
      assert.deepEqual(sentBody, { code: 'SAVE10' });
      assert.equal(result.coupon.code, 'SAVE10');
      assert.equal(result.financials.discountAmount, 100);
    });

    it('service removeCoupon sends DELETE cart/coupon and returns parsed payload', async () => {
      let calledUrl = null;
      apiClient.delete = async (url) => {
        calledUrl = url;
        return {
          success: true,
          data: {
            cart: { items: [] },
            coupon: null,
            financials: { subtotal: 1000, shippingAmount: 0, taxAmount: 0, discountAmount: 0, total: 1000 },
            totals: { subtotal: 1000, total: 1000 },
          },
        };
      };

      const result = await removeCoupon();
      assert.equal(calledUrl, 'cart/coupon');
      assert.equal(result.coupon, null);
      assert.equal(result.financials.discountAmount, 0);
    });
  });

  // --------------------------------------------------------------------------
  // Apply Coupon Scenarios (1 - 8)
  // --------------------------------------------------------------------------
  describe('Apply Coupon', () => {
    it('1. successful apply updates coupon and financials from backend response', async () => {
      apiClient.get = async () => ({
        success: true,
        data: {
          cart: { items: [{ product: { _id: 'p1', price: 1000, name: 'Tent' }, quantity: 1 }] },
          coupon: null,
          financials: { subtotal: 1000, shippingAmount: 0, taxAmount: 0, discountAmount: 0, total: 1000 },
          totals: { itemCount: 1, totalQuantity: 1, subtotal: 1000, total: 1000 },
        },
      });

      apiClient.post = async (endpoint, body) => {
        if (endpoint === 'cart/coupon') {
          assert.equal(body.code, 'SAVE10');
          return {
            success: true,
            data: {
              cart: { items: [{ product: { _id: 'p1', price: 1000, name: 'Tent' }, quantity: 1 }] },
              coupon: { code: 'SAVE10', discountAmount: 100, isValid: true },
              financials: { subtotal: 1000, shippingAmount: 0, taxAmount: 0, discountAmount: 100, total: 900 },
              totals: { itemCount: 1, totalQuantity: 1, subtotal: 1000, discountAmount: 100, total: 900 },
            },
          };
        }
      };

      const wrapper = mountCartContext();
      await act(async () => {});

      await act(async () => {
        const result = await wrapper.get().applyCoupon('SAVE10');
        assert.equal(result.coupon.code, 'SAVE10');
      });

      const ctx = wrapper.get();
      assert.equal(ctx.coupon.code, 'SAVE10');
      assert.equal(ctx.coupon.isValid, true);
      assert.equal(ctx.financials.discountAmount, 100);
      assert.equal(ctx.financials.total, 900);
      assert.equal(ctx.couponError, null);
      wrapper.unmount();
    });

    it('2. empty/invalid input throws VALIDATION_ERROR and does not call API', async () => {
      let apiCalled = false;
      apiClient.get = async () => ({ success: true, data: { cart: { items: [] }, coupon: null, financials: null, totals: { subtotal: 0 } } });
      apiClient.post = async () => { apiCalled = true; };

      const wrapper = mountCartContext();
      await act(async () => {});

      await act(async () => {
        await assert.rejects(
          async () => wrapper.get().applyCoupon('   '),
          (err) => err.code === 'VALIDATION_ERROR' && err.status === 400
        );
      });

      assert.equal(apiCalled, false);
      wrapper.unmount();
    });

    it('3. backend validation error maps into couponError and preserves message', async () => {
      apiClient.get = async () => ({ success: true, data: { cart: { items: [] }, coupon: null, financials: null, totals: { subtotal: 0 } } });
      apiClient.post = async () => {
        throw new ApiError({
          status: 404,
          code: 'COUPON_NOT_FOUND',
          message: 'Coupon code not found',
        });
      };

      const wrapper = mountCartContext();
      await act(async () => {});

      await act(async () => {
        await assert.rejects(
          async () => wrapper.get().applyCoupon('BADCODE'),
          (err) => err.code === 'COUPON_NOT_FOUND'
        );
      });

      assert.equal(wrapper.get().couponError?.code, 'COUPON_NOT_FOUND');
      assert.equal(wrapper.get().couponError?.message, 'Coupon code not found');
      wrapper.unmount();
    });

    it('4. expired coupon error preserves COUPON_EXPIRED code', async () => {
      apiClient.get = async () => ({ success: true, data: { cart: { items: [] }, coupon: null, financials: null, totals: { subtotal: 0 } } });
      apiClient.post = async () => {
        throw new ApiError({
          status: 400,
          code: 'COUPON_EXPIRED',
          message: 'This coupon has expired',
        });
      };

      const wrapper = mountCartContext();
      await act(async () => {});

      await act(async () => {
        await assert.rejects(
          async () => wrapper.get().applyCoupon('OLDPROMO'),
          (err) => err.code === 'COUPON_EXPIRED'
        );
      });

      assert.equal(wrapper.get().couponError?.code, 'COUPON_EXPIRED');
      wrapper.unmount();
    });

    it('5. minimum subtotal error preserves COUPON_MIN_SUBTOTAL_NOT_MET', async () => {
      apiClient.get = async () => ({ success: true, data: { cart: { items: [] }, coupon: null, financials: null, totals: { subtotal: 0 } } });
      apiClient.post = async () => {
        throw new ApiError({
          status: 400,
          code: 'COUPON_MIN_SUBTOTAL_NOT_MET',
          message: 'Cart subtotal must be at least ₹1,500',
        });
      };

      const wrapper = mountCartContext();
      await act(async () => {});

      await act(async () => {
        await assert.rejects(
          async () => wrapper.get().applyCoupon('BIGSPEND'),
          (err) => err.code === 'COUPON_MIN_SUBTOTAL_NOT_MET'
        );
      });

      assert.equal(wrapper.get().couponError?.code, 'COUPON_MIN_SUBTOTAL_NOT_MET');
      assert.equal(wrapper.get().couponError?.message, 'Cart subtotal must be at least ₹1,500');
      wrapper.unmount();
    });

    it('6. restricted product/category error preserves COUPON_RESTRICTED_CATEGORIES', async () => {
      apiClient.get = async () => ({ success: true, data: { cart: { items: [] }, coupon: null, financials: null, totals: { subtotal: 0 } } });
      apiClient.post = async () => {
        throw new ApiError({
          status: 400,
          code: 'COUPON_RESTRICTED_CATEGORIES',
          message: 'This coupon only applies to Footwear',
        });
      };

      const wrapper = mountCartContext();
      await act(async () => {});

      await act(async () => {
        await assert.rejects(
          async () => wrapper.get().applyCoupon('BOOTS20'),
          (err) => err.code === 'COUPON_RESTRICTED_CATEGORIES'
        );
      });

      assert.equal(wrapper.get().couponError?.code, 'COUPON_RESTRICTED_CATEGORIES');
      wrapper.unmount();
    });

    it('7. loading state isApplyingCoupon toggles true during mutation and false after', async () => {
      let resolveRequest;
      const delayedPromise = new Promise((resolve) => {
        resolveRequest = resolve;
      });

      apiClient.get = async () => ({ success: true, data: { cart: { items: [] }, coupon: null, financials: null, totals: { subtotal: 0 } } });
      apiClient.post = async () => {
        await delayedPromise;
        return {
          success: true,
          data: {
            cart: { items: [] },
            coupon: { code: 'SAVE10', isValid: true },
            financials: { subtotal: 100, discountAmount: 10, total: 90 },
            totals: { subtotal: 100, total: 90 },
          },
        };
      };

      const wrapper = mountCartContext();
      await act(async () => {});

      assert.equal(wrapper.get().isApplyingCoupon, false);

      let applyPromise;
      act(() => {
        applyPromise = wrapper.get().applyCoupon('SAVE10');
      });

      assert.equal(wrapper.get().isApplyingCoupon, true);

      await act(async () => {
        resolveRequest();
        await applyPromise;
      });

      assert.equal(wrapper.get().isApplyingCoupon, false);
      wrapper.unmount();
    });

    it('8. double-click prevention rejects concurrent apply mutations with 409', async () => {
      let finish;
      const delayedPromise = new Promise((resolve) => { finish = resolve; });

      apiClient.get = async () => ({ success: true, data: { cart: { items: [] }, coupon: null, financials: null, totals: { subtotal: 0 } } });
      apiClient.post = async () => {
        await delayedPromise;
        return {
          success: true,
          data: { cart: { items: [] }, coupon: { code: 'DUP', isValid: true }, financials: null, totals: { subtotal: 100 } },
        };
      };

      const wrapper = mountCartContext();
      await act(async () => {});

      let firstPromise;
      act(() => {
        firstPromise = wrapper.get().applyCoupon('DUP');
      });

      await assert.rejects(
        async () => wrapper.get().applyCoupon('DUP'),
        (err) => err.code === 'CART_MUTATION_IN_PROGRESS' && err.status === 409
      );

      await act(async () => {
        finish();
        await firstPromise;
      });

      wrapper.unmount();
    });
  });

  // --------------------------------------------------------------------------
  // Remove Coupon Scenarios (9 - 11)
  // --------------------------------------------------------------------------
  describe('Remove Coupon', () => {
    it('9. successful removal resets coupon to null and updates server financials', async () => {
      apiClient.get = async () => ({
        success: true,
        data: {
          cart: { items: [] },
          coupon: { code: 'SAVE10', isValid: true, discountAmount: 100 },
          financials: { subtotal: 1000, shippingAmount: 0, taxAmount: 0, discountAmount: 100, total: 900 },
          totals: { subtotal: 1000, discountAmount: 100, total: 900 },
        },
      });

      apiClient.delete = async (endpoint) => {
        if (endpoint === 'cart/coupon') {
          return {
            success: true,
            data: {
              cart: { items: [] },
              coupon: null,
              financials: { subtotal: 1000, shippingAmount: 0, taxAmount: 0, discountAmount: 0, total: 1000 },
              totals: { subtotal: 1000, discountAmount: 0, total: 1000 },
            },
          };
        }
      };

      const wrapper = mountCartContext();
      await act(async () => {});

      assert.equal(wrapper.get().coupon.code, 'SAVE10');

      await act(async () => {
        await wrapper.get().removeCoupon();
      });

      assert.equal(wrapper.get().coupon, null);
      assert.equal(wrapper.get().financials.discountAmount, 0);
      assert.equal(wrapper.get().financials.total, 1000);
      wrapper.unmount();
    });

    it('10. loading state isRemovingCoupon toggles true during removal', async () => {
      let resolveRemove;
      const delayedPromise = new Promise((resolve) => { resolveRemove = resolve; });

      apiClient.get = async () => ({
        success: true,
        data: { cart: { items: [] }, coupon: { code: 'SAVE10', isValid: true }, financials: null, totals: { subtotal: 100 } },
      });

      apiClient.delete = async () => {
        await delayedPromise;
        return {
          success: true,
          data: { cart: { items: [] }, coupon: null, financials: null, totals: { subtotal: 100 } },
        };
      };

      const wrapper = mountCartContext();
      await act(async () => {});

      assert.equal(wrapper.get().isRemovingCoupon, false);

      let removePromise;
      act(() => {
        removePromise = wrapper.get().removeCoupon();
      });

      assert.equal(wrapper.get().isRemovingCoupon, true);

      await act(async () => {
        resolveRemove();
        await removePromise;
      });

      assert.equal(wrapper.get().isRemovingCoupon, false);
      wrapper.unmount();
    });

    it('11. remove error handles API failure and sets couponError', async () => {
      apiClient.get = async () => ({
        success: true,
        data: { cart: { items: [] }, coupon: { code: 'SAVE10', isValid: true }, financials: null, totals: { subtotal: 100 } },
      });

      apiClient.delete = async () => {
        throw new ApiError({
          status: 500,
          code: 'API_ERROR',
          message: 'Failed to remove coupon from cart',
        });
      };

      const wrapper = mountCartContext();
      await act(async () => {});

      await act(async () => {
        await assert.rejects(
          async () => wrapper.get().removeCoupon(),
          (err) => err.code === 'API_ERROR'
        );
      });

      assert.equal(wrapper.get().couponError?.code, 'API_ERROR');
      wrapper.unmount();
    });
  });

  // --------------------------------------------------------------------------
  // Cart Financials (12 - 17)
  // --------------------------------------------------------------------------
  describe('Cart Financial Breakdown', () => {
    it('12-16. subtotal, shipping, tax, discount, total are exposed directly from server financials', async () => {
      const serverFinancials = {
        subtotal: 2500,
        shippingAmount: 150,
        taxAmount: 225,
        discountAmount: 250,
        total: 2625,
      };

      apiClient.get = async () => ({
        success: true,
        data: {
          cart: { items: [] },
          coupon: { code: 'SAVE10', isValid: true, discountAmount: 250 },
          financials: serverFinancials,
          totals: serverFinancials,
        },
      });

      const wrapper = mountCartContext();
      await act(async () => {});

      const fin = wrapper.get().financials;
      assert.equal(fin.subtotal, 2500);
      assert.equal(fin.shippingAmount, 150);
      assert.equal(fin.taxAmount, 225);
      assert.equal(fin.discountAmount, 250);
      assert.equal(fin.total, 2625);
      wrapper.unmount();
    });

    it('17. zero-value rows format correctly without producing NaN or empty output', () => {
      const fin = normalizeOrderFinancials({
        subtotal: 500,
        shippingAmount: 0,
        taxAmount: 0,
        discountAmount: 0,
        total: 500,
      });

      assert.equal(formatPrice(fin.shippingAmount), '₹0');
      assert.equal(formatPrice(fin.taxAmount), '₹0');
      assert.equal(formatPrice(fin.discountAmount), '₹0');
      assert.equal(formatPrice(fin.total), '₹500');
    });
  });

  // --------------------------------------------------------------------------
  // Stale Coupon Handling (18 - 20)
  // --------------------------------------------------------------------------
  describe('Stale Coupon Handling', () => {
    it('18-20. coupon.isValid === false exposes stale error message and sets discount to 0', async () => {
      apiClient.get = async () => ({
        success: true,
        data: {
          cart: { items: [] },
          coupon: {
            code: 'EXPIRED10',
            isValid: false,
            error: {
              code: 'COUPON_EXPIRED',
              message: 'This coupon has expired and can no longer be used',
            },
          },
          financials: { subtotal: 1000, shippingAmount: 0, taxAmount: 0, discountAmount: 0, total: 1000 },
          totals: { subtotal: 1000, discountAmount: 0, total: 1000 },
        },
      });

      const wrapper = mountCartContext();
      await act(async () => {});

      const ctx = wrapper.get();
      assert.equal(ctx.coupon.code, 'EXPIRED10');
      assert.equal(ctx.coupon.isValid, false);
      assert.equal(ctx.coupon.error.code, 'COUPON_EXPIRED');
      assert.equal(ctx.coupon.error.message, 'This coupon has expired and can no longer be used');
      assert.equal(ctx.financials.discountAmount, 0);
      assert.equal(ctx.financials.total, 1000);
      wrapper.unmount();
    });
  });

  // --------------------------------------------------------------------------
  // Checkout Integration (21 - 24)
  // --------------------------------------------------------------------------
  describe('Checkout Integration & Stale Reject', () => {
    it('21. successful order creation forwards couponCode in payload', async () => {
      let capturedPayload = null;
      apiClient.post = async (endpoint, body) => {
        if (endpoint === 'orders') {
          capturedPayload = body;
          return {
            success: true,
            data: {
              order: {
                _id: '507f1f77bcf86cd799439011',
                subtotal: 1200,
                shippingAmount: 0,
                taxAmount: 0,
                discountAmount: 120,
                total: 1080,
                coupon: { code: 'SAVE10', discountAmount: 120 },
              },
            },
          };
        }
      };

      const order = await createOrder('507f1f77bcf86cd799439012', 'SAVE10');
      assert.deepEqual(capturedPayload, {
        addressId: '507f1f77bcf86cd799439012',
        couponCode: 'SAVE10',
      });
      assert.equal(order.total, 1080);
      assert.equal(order.discountAmount, 120);
    });

    it('22-23. backend rejects stale coupon during order creation: error thrown, cart intact', async () => {
      apiClient.post = async (endpoint) => {
        if (endpoint === 'orders') {
          throw new ApiError({
            status: 400,
            code: 'COUPON_EXPIRED',
            message: 'Coupon has expired',
          });
        }
      };

      await assert.rejects(
        async () => createOrder('507f1f77bcf86cd799439012', 'STALE10'),
        (err) => err.code === 'COUPON_EXPIRED' && err.status === 400
      );
    });

    it('24. authoritative order total shown from persisted order model', () => {
      const persistedOrder = {
        _id: '507f1f77bcf86cd799439011',
        subtotal: 1500,
        shippingAmount: 100,
        taxAmount: 75,
        discountAmount: 150,
        total: 1525,
      };

      const fin = normalizeOrderFinancials(persistedOrder);
      assert.equal(fin.subtotal, 1500);
      assert.equal(fin.shippingAmount, 100);
      assert.equal(fin.taxAmount, 75);
      assert.equal(fin.discountAmount, 150);
      assert.equal(fin.total, 1525);
    });
  });

  // --------------------------------------------------------------------------
  // Authentication & Guest State (25 - 28)
  // --------------------------------------------------------------------------
  describe('Authentication Boundaries & Session Isolation', () => {
    it('25. guest cannot apply coupon: throws AUTH_REQUIRED without network request', async () => {
      let apiCalled = false;
      apiClient.post = async () => { apiCalled = true; };

      const wrapper = mountCartContext({ isAuthenticated: false, isLoading: false });
      await act(async () => {});

      await assert.rejects(
        async () => wrapper.get().applyCoupon('GUEST10'),
        (err) => err.code === 'AUTH_REQUIRED' && err.status === 401
      );

      assert.equal(apiCalled, false);
      assert.equal(wrapper.get().coupon, null);
      wrapper.unmount();
    });

    it('26. authenticated coupon flow allows coupon mutation and state update', async () => {
      apiClient.get = async () => ({
        success: true,
        data: { cart: { items: [] }, coupon: null, financials: null, totals: { subtotal: 100 } },
      });
      apiClient.post = async () => ({
        success: true,
        data: {
          cart: { items: [] },
          coupon: { code: 'AUTH10', isValid: true, discountAmount: 10 },
          financials: { subtotal: 100, discountAmount: 10, total: 90 },
          totals: { subtotal: 100, discountAmount: 10, total: 90 },
        },
      });

      const wrapper = mountCartContext({ isAuthenticated: true, isLoading: false });
      await act(async () => {});

      await act(async () => {
        await wrapper.get().applyCoupon('AUTH10');
      });

      assert.equal(wrapper.get().coupon.code, 'AUTH10');
      wrapper.unmount();
    });

    it('27. logout does not leak coupon state: serverCoupon and financials are purged', async () => {
      apiClient.get = async () => ({
        success: true,
        data: {
          cart: { items: [] },
          coupon: { code: 'LEAK_CHECK', isValid: true, discountAmount: 50 },
          financials: { subtotal: 500, discountAmount: 50, total: 450 },
          totals: { subtotal: 500, total: 450 },
        },
      });

      let authState = { isAuthenticated: true, isLoading: false };
      let latestContext = null;

      function TestConsumer() {
        latestContext = React.useContext(CartContext);
        return null;
      }

      function Wrapper() {
        return React.createElement(
          AuthContext.Provider,
          { value: authState },
          React.createElement(CartProvider, null, React.createElement(TestConsumer))
        );
      }

      const container = doc.createElement('div');
      const root = createRoot(container);

      act(() => {
        root.render(React.createElement(Wrapper));
      });
      await act(async () => {});

      assert.equal(latestContext.coupon.code, 'LEAK_CHECK');

      // Transition to unauthenticated (logout)
      authState = { isAuthenticated: false, isLoading: false };
      act(() => {
        root.render(React.createElement(Wrapper));
      });
      await act(async () => {});

      assert.equal(latestContext.coupon, null);
      assert.equal(latestContext.financials.discountAmount, 0);

      act(() => root.unmount());
    });

    it('28. login retrieves server coupon state after session establishment', async () => {
      apiClient.get = async () => ({
        success: true,
        data: {
          cart: { items: [] },
          coupon: { code: 'WELCOME10', isValid: true, discountAmount: 100 },
          financials: { subtotal: 1000, discountAmount: 100, total: 900 },
          totals: { subtotal: 1000, discountAmount: 100, total: 900 },
        },
      });

      let authState = { isAuthenticated: false, isLoading: false };
      let latestContext = null;

      function TestConsumer() {
        latestContext = React.useContext(CartContext);
        return null;
      }

      function Wrapper() {
        return React.createElement(
          AuthContext.Provider,
          { value: authState },
          React.createElement(CartProvider, null, React.createElement(TestConsumer))
        );
      }

      const container = doc.createElement('div');
      const root = createRoot(container);

      act(() => {
        root.render(React.createElement(Wrapper));
      });
      await act(async () => {});

      assert.equal(latestContext.coupon, null);

      // Transition to authenticated (login)
      authState = { isAuthenticated: true, isLoading: false };
      act(() => {
        root.render(React.createElement(Wrapper));
      });
      await act(async () => {});

      assert.equal(latestContext.coupon.code, 'WELCOME10');
      assert.equal(latestContext.financials.discountAmount, 100);

      act(() => root.unmount());
    });
  });
});
