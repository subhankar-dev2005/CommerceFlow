import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import cartContextModule from './cart.context.jsx';
import {
  GUEST_CART_STORAGE_KEY,
  clearGuestCart,
} from './guestCart.storage.js';
import { apiClient, ApiError } from '../../lib/apiClient.js';

const { CartProvider, CartContext, AuthContext } = cartContextModule;

// Configure React 19 testing environment for act(...)
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Mock DOM for React 19 testing in Node
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

const PRODUCT_ID_1 = '507f1f77bcf86cd799439011';
const PRODUCT_ID_2 = '507f191e810c19729de860ea';

const MOCK_PRODUCT_1 = {
  _id: PRODUCT_ID_1,
  name: 'Mechanical Keyboard',
  price: 2999,
  stock: 25,
  isActive: true,
  image: 'https://example.com/keyboard.jpg',
  category: 'Accessories',
};

const MOCK_PRODUCT_2 = {
  _id: PRODUCT_ID_2,
  name: 'Wireless Mouse',
  price: 1499,
  stock: 50,
  isActive: true,
  image: 'https://example.com/mouse.jpg',
  category: 'Accessories',
};

// Global DOM setup once for test process
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
  __listeners: windowListeners,
};
doc.defaultView = win;

globalThis.window = win;
globalThis.document = doc;
globalThis.Node = Node;
globalThis.Element = Element;
globalThis.HTMLElement = HTMLElement;

describe('CartContext Dual-Mode & Merge Orchestration (Step 73.6)', () => {
  let originalApiClientGet;
  let originalApiClientPost;
  let originalApiClientPatch;
  let originalApiClientDelete;
  let apiCalls;

  beforeEach(() => {
    currentStorage = new MockStorage();
    windowListeners.clear();
    clearGuestCart();

    apiCalls = [];
    originalApiClientGet = apiClient.get;
    originalApiClientPost = apiClient.post;
    originalApiClientPatch = apiClient.patch;
    originalApiClientDelete = apiClient.delete;

    apiClient.get = async (endpoint, options) => {
      apiCalls.push({ method: 'GET', endpoint, options });
      if (endpoint === 'cart') {
        return {
          data: {
            cart: {
              items: [
                {
                  _id: PRODUCT_ID_1,
                  product: MOCK_PRODUCT_1,
                  quantity: 2,
                },
              ],
            },
            totals: {
              itemCount: 1,
              totalQuantity: 2,
              subtotal: 5998,
            },
          },
        };
      }
      if (endpoint === `products/${PRODUCT_ID_1}`) {
        return { data: { product: MOCK_PRODUCT_1 } };
      }
      if (endpoint === `products/${PRODUCT_ID_2}`) {
        return { data: { product: MOCK_PRODUCT_2 } };
      }
      return { data: null };
    };

    apiClient.post = async (endpoint, body, options) => {
      apiCalls.push({ method: 'POST', endpoint, body, options });
      if (endpoint === 'cart/items') {
        return {
          data: {
            cart: {
              items: [{ _id: body.productId, product: MOCK_PRODUCT_1, quantity: body.quantity }],
            },
            totals: { itemCount: 1, totalQuantity: body.quantity, subtotal: 2999 * body.quantity },
          },
        };
      }
      if (endpoint === 'cart/merge') {
        return {
          data: {
            cart: {
              items: [
                { _id: PRODUCT_ID_1, product: MOCK_PRODUCT_1, quantity: 2 },
                { _id: PRODUCT_ID_2, product: MOCK_PRODUCT_2, quantity: 1 },
              ],
            },
            totals: {
              itemCount: 2,
              totalQuantity: 3,
              subtotal: 7497,
            },
            mergeReport: {
              added: [{ productId: PRODUCT_ID_1, quantity: 2 }],
              updated: [],
              clamped: [],
              omitted: [],
            },
          },
        };
      }
      return { data: null };
    };

    apiClient.patch = async (endpoint, body, options) => {
      apiCalls.push({ method: 'PATCH', endpoint, body, options });
      return {
        data: {
          cart: { items: [{ _id: PRODUCT_ID_1, product: MOCK_PRODUCT_1, quantity: body.quantity }] },
          totals: { itemCount: 1, totalQuantity: body.quantity, subtotal: 2999 * body.quantity },
        },
      };
    };

    apiClient.delete = async (endpoint, options) => {
      apiCalls.push({ method: 'DELETE', endpoint, options });
      return {
        data: {
          cart: { items: [] },
          totals: { itemCount: 0, totalQuantity: 0, subtotal: 0 },
        },
      };
    };
  });

  afterEach(() => {
    apiClient.get = originalApiClientGet;
    apiClient.post = originalApiClientPost;
    apiClient.patch = originalApiClientPatch;
    apiClient.delete = originalApiClientDelete;
  });

  async function renderHarness({ isAuthenticated = false, isLoading = false, user = null } = {}) {
    let captured = null;
    const subscribers = new Set();

    function Consumer() {
      const ctx = React.useContext(CartContext);
      captured = ctx;
      for (const sub of subscribers) {
        sub(ctx);
      }
      return null;
    }

    function Wrapper({ authState }) {
      return React.createElement(
        AuthContext.Provider,
        { value: authState },
        React.createElement(CartProvider, null, React.createElement(Consumer))
      );
    }

    const rootEl = doc.createElement('div');
    const root = createRoot(rootEl);

    await act(async () => {
      root.render(React.createElement(Wrapper, { authState: { isAuthenticated, isLoading, user } }));
    });

    return {
      get value() {
        return captured;
      },
      setAuth: async (newAuth) => {
        await act(async () => {
          root.render(React.createElement(Wrapper, { authState: newAuth }));
        });
      },
      waitFor: (predicate, timeoutMs = 2000) => {
        return new Promise((resolve, reject) => {
          if (captured && predicate(captured)) {
            return resolve(captured);
          }
          const timer = setTimeout(() => {
            subscribers.delete(onUpdate);
            reject(new Error(`waitFor timed out after ${timeoutMs}ms`));
          }, timeoutMs);

          function onUpdate(val) {
            if (predicate(val)) {
              clearTimeout(timer);
              subscribers.delete(onUpdate);
              resolve(val);
            }
          }
          subscribers.add(onUpdate);
        });
      },
      unmount: async () => {
        await act(async () => {
          root.unmount();
        });
      },
    };
  }

  describe('Core Dual-Mode Cart (Step 73.5 Preserved)', () => {
    it('1. unauthenticated Context loads guest cart and hydrates product info', async () => {
      currentStorage.setItem(
        GUEST_CART_STORAGE_KEY,
        JSON.stringify([{ productId: PRODUCT_ID_1, quantity: 2 }])
      );

      const harness = await renderHarness({ isAuthenticated: false, isLoading: false });
      const ctx = await harness.waitFor((c) => c.cart?.items?.length === 1);

      assert.strictEqual(ctx.cart.items.length, 1);
      assert.strictEqual(ctx.cart.items[0].product.name, 'Mechanical Keyboard');
      assert.strictEqual(ctx.totals.itemCount, 1);
      assert.strictEqual(ctx.totals.totalQuantity, 2);
      assert.strictEqual(ctx.totals.subtotal, 5998);

      const cartApiCalls = apiCalls.filter((c) => c.endpoint === 'cart');
      assert.strictEqual(cartApiCalls.length, 0);

      await harness.unmount();
    });

    it('2. authenticated Context loads server cart', async () => {
      const harness = await renderHarness({ isAuthenticated: true, isLoading: false });
      const ctx = await harness.waitFor((c) => c.cart?.items?.length === 1 && !c.isLoading);

      assert.strictEqual(ctx.cart.items.length, 1);
      assert.strictEqual(ctx.cart.items[0].product.name, 'Mechanical Keyboard');

      const cartCalls = apiCalls.filter((c) => c.endpoint === 'cart');
      assert.strictEqual(cartCalls.length, 1);

      await harness.unmount();
    });

    it('3. guest addToCart does not call backend cart mutation', async () => {
      const harness = await renderHarness({ isAuthenticated: false, isLoading: false });
      await harness.waitFor((c) => !c.isLoading);

      const initialApiCount = apiCalls.length;
      await act(async () => {
        await harness.value.addToCart(PRODUCT_ID_1, 3);
      });

      assert.strictEqual(harness.value.cart.items.length, 1);
      assert.strictEqual(harness.value.cart.items[0].quantity, 3);
      assert.strictEqual(harness.value.totals.totalQuantity, 3);

      const backendMutations = apiCalls
        .slice(initialApiCount)
        .filter((c) => c.endpoint.startsWith('cart'));
      assert.strictEqual(backendMutations.length, 0);

      await harness.unmount();
    });

    it('4. authenticated addToCart still calls backend', async () => {
      const harness = await renderHarness({ isAuthenticated: true, isLoading: false });
      await harness.waitFor((c) => !c.isLoading && c.cart !== null);

      const postCallsBefore = apiCalls.filter((c) => c.method === 'POST');
      await act(async () => {
        await harness.value.addToCart(PRODUCT_ID_1, 1);
      });

      const postCallsAfter = apiCalls.filter((c) => c.method === 'POST');
      assert.strictEqual(postCallsAfter.length, postCallsBefore.length + 1);
      assert.strictEqual(postCallsAfter[postCallsAfter.length - 1].endpoint, 'cart/items');

      await harness.unmount();
    });

    it('5. guest updateQuantity uses guest storage and avoids backend calls', async () => {
      currentStorage.setItem(
        GUEST_CART_STORAGE_KEY,
        JSON.stringify([{ productId: PRODUCT_ID_1, quantity: 2 }])
      );

      const harness = await renderHarness({ isAuthenticated: false, isLoading: false });
      await harness.waitFor((c) => c.cart?.items?.length === 1);

      await act(async () => {
        await harness.value.updateQuantity(PRODUCT_ID_1, 5);
      });

      assert.strictEqual(harness.value.cart.items[0].quantity, 5);
      assert.strictEqual(harness.value.totals.totalQuantity, 5);

      const rawStored = JSON.parse(currentStorage.getItem(GUEST_CART_STORAGE_KEY));
      assert.deepStrictEqual(rawStored, [{ productId: PRODUCT_ID_1, quantity: 5 }]);

      const patchCalls = apiCalls.filter((c) => c.method === 'PATCH');
      assert.strictEqual(patchCalls.length, 0);

      await harness.unmount();
    });

    it('6. authenticated updateQuantity still calls backend', async () => {
      const harness = await renderHarness({ isAuthenticated: true, isLoading: false });
      await harness.waitFor((c) => !c.isLoading && c.cart !== null);

      await act(async () => {
        await harness.value.updateQuantity(PRODUCT_ID_1, 4);
      });

      const patchCalls = apiCalls.filter((c) => c.method === 'PATCH');
      assert.strictEqual(patchCalls.length, 1);
      assert.strictEqual(patchCalls[0].endpoint, `cart/items/${PRODUCT_ID_1}`);

      await harness.unmount();
    });

    it('7. guest removeItem uses guest storage', async () => {
      currentStorage.setItem(
        GUEST_CART_STORAGE_KEY,
        JSON.stringify([{ productId: PRODUCT_ID_1, quantity: 2 }])
      );

      const harness = await renderHarness({ isAuthenticated: false, isLoading: false });
      await harness.waitFor((c) => c.cart?.items?.length === 1);

      await act(async () => {
        await harness.value.removeItem(PRODUCT_ID_1);
      });

      assert.strictEqual(harness.value.cart.items.length, 0);
      assert.strictEqual(harness.value.totals.totalQuantity, 0);

      const rawStored = JSON.parse(currentStorage.getItem(GUEST_CART_STORAGE_KEY));
      assert.deepStrictEqual(rawStored, []);

      const deleteCalls = apiCalls.filter((c) => c.method === 'DELETE');
      assert.strictEqual(deleteCalls.length, 0);

      await harness.unmount();
    });

    it('8. authenticated removeItem still calls backend', async () => {
      const harness = await renderHarness({ isAuthenticated: true, isLoading: false });
      await harness.waitFor((c) => !c.isLoading && c.cart !== null);

      await act(async () => {
        await harness.value.removeItem(PRODUCT_ID_1);
      });

      const deleteCalls = apiCalls.filter((c) => c.method === 'DELETE');
      assert.strictEqual(deleteCalls.length, 1);
      assert.strictEqual(deleteCalls[0].endpoint, `cart/items/${PRODUCT_ID_1}`);

      await harness.unmount();
    });

    it('9. guest clearCart clears guest storage', async () => {
      currentStorage.setItem(
        GUEST_CART_STORAGE_KEY,
        JSON.stringify([{ productId: PRODUCT_ID_1, quantity: 2 }])
      );

      const harness = await renderHarness({ isAuthenticated: false, isLoading: false });
      await harness.waitFor((c) => c.cart?.items?.length === 1);

      await act(async () => {
        await harness.value.clearCart();
      });

      assert.strictEqual(harness.value.cart.items.length, 0);
      assert.strictEqual(harness.value.totals.totalQuantity, 0);
      assert.strictEqual(currentStorage.getItem(GUEST_CART_STORAGE_KEY), null);

      await harness.unmount();
    });

    it('10. authenticated clearCart still calls backend', async () => {
      const harness = await renderHarness({ isAuthenticated: true, isLoading: false });
      await harness.waitFor((c) => !c.isLoading && c.cart !== null);

      await act(async () => {
        await harness.value.clearCart();
      });

      const deleteCalls = apiCalls.filter((c) => c.method === 'DELETE' && c.endpoint === 'cart');
      assert.strictEqual(deleteCalls.length, 1);

      await harness.unmount();
    });

    it('11. logout switches back to guest mode without copying server cart to guest storage', async () => {
      const harness = await renderHarness({ isAuthenticated: true, isLoading: false });
      await harness.waitFor((c) => c.cart?.items?.length === 1);

      await harness.setAuth({ isAuthenticated: false, isLoading: false });
      const guestState = await harness.waitFor((c) => c.cart?.items?.length === 0);

      assert.strictEqual(guestState.cart.items.length, 0);
      assert.strictEqual(currentStorage.getItem(GUEST_CART_STORAGE_KEY), null);

      await harness.unmount();
    });

    it('12. guest cart storage is never populated with price/name/stock/product objects', async () => {
      const harness = await renderHarness({ isAuthenticated: false, isLoading: false });
      await harness.waitFor((c) => !c.isLoading);

      await act(async () => {
        await harness.value.addToCart(PRODUCT_ID_1, 2);
      });

      const storedRaw = JSON.parse(currentStorage.getItem(GUEST_CART_STORAGE_KEY));
      assert.deepStrictEqual(storedRaw, [{ productId: PRODUCT_ID_1, quantity: 2 }]);

      const item = storedRaw[0];
      assert.strictEqual(item.price, undefined);
      assert.strictEqual(item.name, undefined);
      assert.strictEqual(item.stock, undefined);
      assert.strictEqual(item.product, undefined);

      await harness.unmount();
    });

    it('13. storage event refreshes guest state', async () => {
      const harness = await renderHarness({ isAuthenticated: false, isLoading: false });
      await harness.waitFor((c) => !c.isLoading);

      currentStorage.setItem(
        GUEST_CART_STORAGE_KEY,
        JSON.stringify([{ productId: PRODUCT_ID_2, quantity: 3 }])
      );

      await act(async () => {
        win.dispatchEvent({
          type: 'storage',
          key: GUEST_CART_STORAGE_KEY,
        });
      });

      const refreshed = await harness.waitFor(
        (c) => c.cart?.items?.[0]?.product?.name === 'Wireless Mouse'
      );
      assert.strictEqual(refreshed.cart.items[0].quantity, 3);
      assert.strictEqual(refreshed.totals.totalQuantity, 3);

      await harness.unmount();
    });

    it('14. event listener is cleaned up on unmount', async () => {
      const harness = await renderHarness({ isAuthenticated: false, isLoading: false });
      await harness.waitFor((c) => !c.isLoading);

      const storageListenersBefore = windowListeners.get('storage')?.size ?? 0;
      assert.strictEqual(storageListenersBefore, 1);

      await harness.unmount();
      const storageListenersAfter = windowListeners.get('storage')?.size ?? 0;
      assert.strictEqual(storageListenersAfter, 0);
    });

    it('15. product hydration failure does not destroy guest storage', async () => {
      const UNKNOWN_PRODUCT_ID = '607f1f77bcf86cd799439999';
      currentStorage.setItem(
        GUEST_CART_STORAGE_KEY,
        JSON.stringify([{ productId: UNKNOWN_PRODUCT_ID, quantity: 2 }])
      );

      const harness = await renderHarness({ isAuthenticated: false, isLoading: false });
      const ctx = await harness.waitFor((c) => c.cart?.items?.length === 1 && !c.isLoading);

      assert.strictEqual(ctx.cart.items[0].product, null);
      assert.strictEqual(ctx.cart.items[0].quantity, 2);

      const rawStored = JSON.parse(currentStorage.getItem(GUEST_CART_STORAGE_KEY));
      assert.deepStrictEqual(rawStored, [{ productId: UNKNOWN_PRODUCT_ID, quantity: 2 }]);

      await harness.unmount();
    });

    it('16. stale async hydration cannot overwrite authenticated cart state', async () => {
      let resolveProductFetch;
      const slowProductPromise = new Promise((resolve) => {
        resolveProductFetch = resolve;
      });

      apiClient.get = async (endpoint) => {
        if (endpoint === `products/${PRODUCT_ID_1}`) {
          await slowProductPromise;
          return { data: { product: MOCK_PRODUCT_1 } };
        }
        if (endpoint === 'cart') {
          return {
            data: {
              cart: { items: [{ _id: PRODUCT_ID_2, product: MOCK_PRODUCT_2, quantity: 1 }] },
              totals: { itemCount: 1, totalQuantity: 1, subtotal: 1499 },
            },
          };
        }
        return { data: null };
      };

      apiClient.post = async (endpoint) => {
        if (endpoint === 'cart/merge') {
          return {
            data: {
              cart: { items: [{ _id: PRODUCT_ID_2, product: MOCK_PRODUCT_2, quantity: 1 }] },
              totals: { itemCount: 1, totalQuantity: 1, subtotal: 1499 },
              mergeReport: { added: [], updated: [], clamped: [], omitted: [] },
            },
          };
        }
        return { data: null };
      };

      currentStorage.setItem(
        GUEST_CART_STORAGE_KEY,
        JSON.stringify([{ productId: PRODUCT_ID_1, quantity: 5 }])
      );

      // Mount unauthenticated - starts slow product fetch
      const harness = await renderHarness({ isAuthenticated: false, isLoading: false });

      // Instantly switch to authenticated before product fetch resolves
      await harness.setAuth({ isAuthenticated: true, isLoading: false });

      const authCart = await harness.waitFor(
        (c) => c.cart?.items?.[0]?.product?.name === 'Wireless Mouse'
      );
      assert.strictEqual(authCart.cart.items[0].product.name, 'Wireless Mouse');

      // Now resolve slow product fetch
      await act(async () => {
        resolveProductFetch();
        await new Promise((r) => setTimeout(r, 20));
      });

      // Authenticated cart remains active
      assert.strictEqual(harness.value.cart.items[0].product.name, 'Wireless Mouse');

      await harness.unmount();
    });
  });

  describe('Post-Login Merge Orchestration (Step 73.6)', () => {
    it('1. guest → authenticated with guest items calls /cart/merge', async () => {
      currentStorage.setItem(
        GUEST_CART_STORAGE_KEY,
        JSON.stringify([{ productId: PRODUCT_ID_1, quantity: 2 }])
      );

      const harness = await renderHarness({ isAuthenticated: false, isLoading: false });
      await harness.waitFor((c) => c.cart?.items?.length === 1);

      // Transition to authenticated
      await harness.setAuth({ isAuthenticated: true, isLoading: false });
      await harness.waitFor((c) => c.cart?.items?.length === 2 && !c.isLoading);

      const mergeCalls = apiCalls.filter((c) => c.endpoint === 'cart/merge');
      assert.strictEqual(mergeCalls.length, 1);

      await harness.unmount();
    });

    it('2. payload contains only productId + quantity', async () => {
      currentStorage.setItem(
        GUEST_CART_STORAGE_KEY,
        JSON.stringify([
          { productId: PRODUCT_ID_1, quantity: 2 },
          { productId: PRODUCT_ID_2, quantity: 3 },
        ])
      );

      const harness = await renderHarness({ isAuthenticated: false, isLoading: false });
      await harness.waitFor((c) => c.cart?.items?.length === 2);

      await harness.setAuth({ isAuthenticated: true, isLoading: false });
      await harness.waitFor((c) => c.cart?.items?.length === 2 && !c.isLoading);

      const mergeCall = apiCalls.find((c) => c.endpoint === 'cart/merge');
      assert.ok(mergeCall);
      assert.deepStrictEqual(mergeCall.body, {
        items: [
          { productId: PRODUCT_ID_1, quantity: 2 },
          { productId: PRODUCT_ID_2, quantity: 3 },
        ],
      });

      await harness.unmount();
    });

    it('3. successful response becomes Context cart', async () => {
      currentStorage.setItem(
        GUEST_CART_STORAGE_KEY,
        JSON.stringify([{ productId: PRODUCT_ID_1, quantity: 2 }])
      );

      const harness = await renderHarness({ isAuthenticated: false, isLoading: false });
      await harness.waitFor((c) => c.cart?.items?.length === 1);

      await harness.setAuth({ isAuthenticated: true, isLoading: false });
      const ctx = await harness.waitFor((c) => c.cart?.items?.length === 2 && !c.isLoading);

      assert.strictEqual(ctx.cart.items.length, 2);
      assert.strictEqual(ctx.cart.items[0]._id, PRODUCT_ID_1);
      assert.strictEqual(ctx.cart.items[1]._id, PRODUCT_ID_2);

      await harness.unmount();
    });

    it('4. server totals become Context totals', async () => {
      currentStorage.setItem(
        GUEST_CART_STORAGE_KEY,
        JSON.stringify([{ productId: PRODUCT_ID_1, quantity: 2 }])
      );

      const harness = await renderHarness({ isAuthenticated: false, isLoading: false });
      await harness.waitFor((c) => c.cart?.items?.length === 1);

      await harness.setAuth({ isAuthenticated: true, isLoading: false });
      const ctx = await harness.waitFor((c) => c.totals.totalQuantity === 3 && !c.isLoading);

      assert.strictEqual(ctx.totals.itemCount, 2);
      assert.strictEqual(ctx.totals.totalQuantity, 3);
      assert.strictEqual(ctx.totals.subtotal, 7497);

      await harness.unmount();
    });

    it('5. guest storage is cleared only after successful merge', async () => {
      currentStorage.setItem(
        GUEST_CART_STORAGE_KEY,
        JSON.stringify([{ productId: PRODUCT_ID_1, quantity: 2 }])
      );

      const harness = await renderHarness({ isAuthenticated: false, isLoading: false });
      await harness.waitFor((c) => c.cart?.items?.length === 1);

      await harness.setAuth({ isAuthenticated: true, isLoading: false });
      await harness.waitFor((c) => c.cart?.items?.length === 2 && !c.isLoading);

      // Verify guest storage was cleared upon merge success
      assert.strictEqual(currentStorage.getItem(GUEST_CART_STORAGE_KEY), null);

      await harness.unmount();
    });

    it('6. merge report is preserved if exposed', async () => {
      currentStorage.setItem(
        GUEST_CART_STORAGE_KEY,
        JSON.stringify([{ productId: PRODUCT_ID_1, quantity: 2 }])
      );

      const harness = await renderHarness({ isAuthenticated: false, isLoading: false });
      await harness.waitFor((c) => c.cart?.items?.length === 1);

      await harness.setAuth({ isAuthenticated: true, isLoading: false });
      const ctx = await harness.waitFor((c) => c.lastMergeReport !== null && !c.isLoading);

      assert.ok(ctx.lastMergeReport);
      assert.strictEqual(ctx.lastMergeReport.added.length, 1);
      assert.strictEqual(ctx.lastMergeReport.added[0].productId, PRODUCT_ID_1);

      await harness.unmount();
    });

    it('7. guest → authenticated with empty guest cart does not call /cart/merge', async () => {
      currentStorage.clear();

      const harness = await renderHarness({ isAuthenticated: false, isLoading: false });
      await harness.waitFor((c) => !c.isLoading);

      await harness.setAuth({ isAuthenticated: true, isLoading: false });
      await harness.waitFor((c) => c.cart !== null && !c.isLoading);

      const mergeCalls = apiCalls.filter((c) => c.endpoint === 'cart/merge');
      assert.strictEqual(mergeCalls.length, 0);

      await harness.unmount();
    });

    it('8. normal server cart loading still occurs when guest cart is empty', async () => {
      currentStorage.clear();

      const harness = await renderHarness({ isAuthenticated: false, isLoading: false });
      await harness.waitFor((c) => !c.isLoading);

      await harness.setAuth({ isAuthenticated: true, isLoading: false });
      const ctx = await harness.waitFor((c) => c.cart !== null && !c.isLoading);

      assert.strictEqual(ctx.cart.items.length, 1);
      assert.strictEqual(ctx.cart.items[0].product.name, 'Mechanical Keyboard');

      const getCartCalls = apiCalls.filter((c) => c.method === 'GET' && c.endpoint === 'cart');
      assert.strictEqual(getCartCalls.length, 1);

      await harness.unmount();
    });

    it('9. merge failure does not clear guest storage', async () => {
      apiClient.post = async (endpoint, body, options) => {
        apiCalls.push({ method: 'POST', endpoint, body, options });
        if (endpoint === 'cart/merge') {
          throw new ApiError({
            message: 'Server merge failed',
            status: 500,
            code: 'INTERNAL_SERVER_ERROR',
          });
        }
        return { data: null };
      };

      currentStorage.setItem(
        GUEST_CART_STORAGE_KEY,
        JSON.stringify([{ productId: PRODUCT_ID_1, quantity: 2 }])
      );

      const harness = await renderHarness({ isAuthenticated: false, isLoading: false });
      await harness.waitFor((c) => c.cart?.items?.length === 1);

      await harness.setAuth({ isAuthenticated: true, isLoading: false });
      await harness.waitFor((c) => c.error !== null);

      // Storage MUST remain preserved
      const stored = currentStorage.getItem(GUEST_CART_STORAGE_KEY);
      assert.notStrictEqual(stored, null);
      assert.deepStrictEqual(JSON.parse(stored), [{ productId: PRODUCT_ID_1, quantity: 2 }]);

      await harness.unmount();
    });

    it('10. merge failure does not logout the user', async () => {
      apiClient.post = async (endpoint) => {
        if (endpoint === 'cart/merge') {
          throw new ApiError({
            message: 'Merge service unavailable',
            status: 503,
            code: 'SERVICE_UNAVAILABLE',
          });
        }
        return { data: null };
      };

      currentStorage.setItem(
        GUEST_CART_STORAGE_KEY,
        JSON.stringify([{ productId: PRODUCT_ID_1, quantity: 2 }])
      );

      const harness = await renderHarness({ isAuthenticated: false, isLoading: false });
      await harness.waitFor((c) => c.cart?.items?.length === 1);

      let currentAuthState = { isAuthenticated: true, isLoading: false };
      await harness.setAuth(currentAuthState);
      await harness.waitFor((c) => c.error !== null);

      // AuthState was not forcefully changed to unauthenticated
      assert.strictEqual(currentAuthState.isAuthenticated, true);

      await harness.unmount();
    });

    it('11. merge failure exposes cart error', async () => {
      apiClient.post = async (endpoint) => {
        if (endpoint === 'cart/merge') {
          throw new ApiError({
            message: 'Validation failed during cart merge',
            status: 400,
            code: 'VALIDATION_ERROR',
          });
        }
        return { data: null };
      };

      currentStorage.setItem(
        GUEST_CART_STORAGE_KEY,
        JSON.stringify([{ productId: PRODUCT_ID_1, quantity: 2 }])
      );

      const harness = await renderHarness({ isAuthenticated: false, isLoading: false });
      await harness.waitFor((c) => c.cart?.items?.length === 1);

      await harness.setAuth({ isAuthenticated: true, isLoading: false });
      const ctx = await harness.waitFor((c) => c.error !== null);

      assert.strictEqual(ctx.error.message, 'Validation failed during cart merge');
      assert.strictEqual(ctx.error.status, 400);

      await harness.unmount();
    });

    it('12. authenticated server cart remains usable after merge failure', async () => {
      apiClient.post = async (endpoint) => {
        if (endpoint === 'cart/merge') {
          throw new ApiError({
            message: 'Merge temporary error',
            status: 500,
            code: 'MERGE_FAILED',
          });
        }
        return { data: null };
      };

      currentStorage.setItem(
        GUEST_CART_STORAGE_KEY,
        JSON.stringify([{ productId: PRODUCT_ID_1, quantity: 2 }])
      );

      const harness = await renderHarness({ isAuthenticated: false, isLoading: false });
      await harness.waitFor((c) => c.cart?.items?.length === 1);

      await harness.setAuth({ isAuthenticated: true, isLoading: false });
      const ctx = await harness.waitFor((c) => c.error !== null && c.cart !== null);

      // Server cart was fetched as fallback
      assert.strictEqual(ctx.cart.items.length, 1);
      assert.strictEqual(ctx.cart.items[0].product.name, 'Mechanical Keyboard');

      await harness.unmount();
    });

    it('13. React/auth lifecycle cannot issue duplicate merge calls for one transition', async () => {
      currentStorage.setItem(
        GUEST_CART_STORAGE_KEY,
        JSON.stringify([{ productId: PRODUCT_ID_1, quantity: 2 }])
      );

      const harness = await renderHarness({ isAuthenticated: false, isLoading: false });
      await harness.waitFor((c) => c.cart?.items?.length === 1);

      // Rapid successive re-renders / auth updates
      await harness.setAuth({ isAuthenticated: true, isLoading: false });
      await harness.setAuth({ isAuthenticated: true, isLoading: false });
      await harness.setAuth({ isAuthenticated: true, isLoading: false });

      await harness.waitFor((c) => c.cart?.items?.length === 2 && !c.isLoading);

      const mergeCalls = apiCalls.filter((c) => c.endpoint === 'cart/merge');
      assert.strictEqual(mergeCalls.length, 1);

      await harness.unmount();
    });

    it('14. a genuine retry after failure remains possible via retryGuestCartMerge', async () => {
      let shouldFail = true;
      apiClient.post = async (endpoint, body, options) => {
        apiCalls.push({ method: 'POST', endpoint, body, options });
        if (endpoint === 'cart/merge') {
          if (shouldFail) {
            throw new ApiError({
              message: 'Temporary network failure',
              status: 0,
              code: 'NETWORK_ERROR',
            });
          }
          return {
            data: {
              cart: {
                items: [{ _id: PRODUCT_ID_1, product: MOCK_PRODUCT_1, quantity: 2 }],
              },
              totals: { itemCount: 1, totalQuantity: 2, subtotal: 5998 },
              mergeReport: { added: [{ productId: PRODUCT_ID_1, quantity: 2 }], updated: [], clamped: [], omitted: [] },
            },
          };
        }
        return { data: null };
      };

      currentStorage.setItem(
        GUEST_CART_STORAGE_KEY,
        JSON.stringify([{ productId: PRODUCT_ID_1, quantity: 2 }])
      );

      const harness = await renderHarness({ isAuthenticated: false, isLoading: false });
      await harness.waitFor((c) => c.cart?.items?.length === 1);

      // Transition to auth: initial merge fails
      await harness.setAuth({ isAuthenticated: true, isLoading: false });
      await harness.waitFor((c) => c.error !== null);

      assert.strictEqual(apiCalls.filter((c) => c.endpoint === 'cart/merge').length, 1);
      assert.notStrictEqual(currentStorage.getItem(GUEST_CART_STORAGE_KEY), null);

      // Now retry explicitly
      shouldFail = false;
      await act(async () => {
        await harness.value.retryGuestCartMerge();
      });

      assert.strictEqual(apiCalls.filter((c) => c.endpoint === 'cart/merge').length, 2);
      assert.strictEqual(currentStorage.getItem(GUEST_CART_STORAGE_KEY), null);
      assert.strictEqual(harness.value.error, null);

      await harness.unmount();
    });

    it('15. authenticated registration transition uses the same merge path', async () => {
      currentStorage.setItem(
        GUEST_CART_STORAGE_KEY,
        JSON.stringify([{ productId: PRODUCT_ID_1, quantity: 2 }])
      );

      const harness = await renderHarness({ isAuthenticated: false, isLoading: false });
      await harness.waitFor((c) => c.cart?.items?.length === 1);

      // Simulates registration completing and automatically establishing auth session
      await harness.setAuth({
        isAuthenticated: true,
        isLoading: false,
        user: { _id: 'user-new', name: 'Newly Registered User', email: 'new@example.com' },
      });
      await harness.waitFor((c) => c.cart?.items?.length === 2 && !c.isLoading);

      const mergeCalls = apiCalls.filter((c) => c.endpoint === 'cart/merge');
      assert.strictEqual(mergeCalls.length, 1);
      assert.strictEqual(currentStorage.getItem(GUEST_CART_STORAGE_KEY), null);

      await harness.unmount();
    });

    it('16. logout does not trigger merge', async () => {
      const harness = await renderHarness({ isAuthenticated: true, isLoading: false });
      await harness.waitFor((c) => c.cart?.items?.length === 1);

      const mergeCallsBefore = apiCalls.filter((c) => c.endpoint === 'cart/merge').length;

      // Logout
      await harness.setAuth({ isAuthenticated: false, isLoading: false });
      await harness.waitFor((c) => c.cart?.items?.length === 0);

      const mergeCallsAfter = apiCalls.filter((c) => c.endpoint === 'cart/merge').length;
      assert.strictEqual(mergeCallsAfter, mergeCallsBefore);

      await harness.unmount();
    });

    it('17. server cart is not copied into guest localStorage on logout', async () => {
      const harness = await renderHarness({ isAuthenticated: true, isLoading: false });
      await harness.waitFor((c) => c.cart?.items?.length === 1);

      // Logout
      await harness.setAuth({ isAuthenticated: false, isLoading: false });
      await harness.waitFor((c) => c.cart?.items?.length === 0);

      assert.strictEqual(currentStorage.getItem(GUEST_CART_STORAGE_KEY), null);

      await harness.unmount();
    });

    it('18. storage-event invalidation prevents stale guest cart from being merged after another tab consumed it', async () => {
      // Tab B unauthenticated has items in storage
      currentStorage.setItem(
        GUEST_CART_STORAGE_KEY,
        JSON.stringify([{ productId: PRODUCT_ID_1, quantity: 2 }])
      );

      const harness = await renderHarness({ isAuthenticated: false, isLoading: false });
      await harness.waitFor((c) => c.cart?.items?.length === 1);

      // Tab A logged in and consumed storage
      currentStorage.removeItem(GUEST_CART_STORAGE_KEY);

      // Tab B receives storage event
      await act(async () => {
        win.dispatchEvent({
          type: 'storage',
          key: GUEST_CART_STORAGE_KEY,
        });
      });
      await harness.waitFor((c) => c.cart?.items?.length === 0);

      // Tab B now logs in
      await harness.setAuth({ isAuthenticated: true, isLoading: false });
      await harness.waitFor((c) => c.cart !== null && !c.isLoading);

      // Tab B must NOT send a merge call with stale items!
      const mergeCalls = apiCalls.filter((c) => c.endpoint === 'cart/merge');
      assert.strictEqual(mergeCalls.length, 0);

      await harness.unmount();
    });

    it('19. merge payload contains no price, name, image, stock, totals, or tokens', async () => {
      currentStorage.setItem(
        GUEST_CART_STORAGE_KEY,
        JSON.stringify([{ productId: PRODUCT_ID_1, quantity: 2 }])
      );

      const harness = await renderHarness({ isAuthenticated: false, isLoading: false });
      await harness.waitFor((c) => c.cart?.items?.length === 1);

      await harness.setAuth({ isAuthenticated: true, isLoading: false });
      await harness.waitFor((c) => c.cart?.items?.length === 2 && !c.isLoading);

      const mergeCall = apiCalls.find((c) => c.endpoint === 'cart/merge');
      assert.ok(mergeCall);

      // Validate strict payload keys
      const payloadKeys = Object.keys(mergeCall.body);
      assert.deepStrictEqual(payloadKeys, ['items']);

      for (const item of mergeCall.body.items) {
        assert.deepStrictEqual(Object.keys(item).sort(), ['productId', 'quantity']);
        assert.strictEqual(item.price, undefined);
        assert.strictEqual(item.name, undefined);
        assert.strictEqual(item.image, undefined);
        assert.strictEqual(item.stock, undefined);
        assert.strictEqual(item.totals, undefined);
      }

      await harness.unmount();
    });

    it('20. backend merge endpoint is called only while authenticated', async () => {
      const harness = await renderHarness({ isAuthenticated: false, isLoading: false });
      await harness.waitFor((c) => !c.isLoading);

      // Calling retryGuestCartMerge while unauthenticated fails safely
      await act(async () => {
        await assert.rejects(
          async () => {
            await harness.value.retryGuestCartMerge();
          },
          (err) => err.status === 401 && err.code === 'UNAUTHENTICATED'
        );
      });

      const mergeCalls = apiCalls.filter((c) => c.endpoint === 'cart/merge');
      assert.strictEqual(mergeCalls.length, 0);

      await harness.unmount();
    });
  });
});
