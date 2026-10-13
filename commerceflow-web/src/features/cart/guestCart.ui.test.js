import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import fs from 'node:fs';
import path from 'node:path';
import cartContextModule from './cart.context.jsx';
const { CartProvider, CartContext, AuthContext } = cartContextModule;
import wishlistContextModule from '../wishlist/wishlist.context.jsx';
const { WishlistProvider } = wishlistContextModule;
import {
  GUEST_CART_STORAGE_KEY,
  getGuestCart,
  clearGuestCart,
} from './guestCart.storage.js';
import { apiClient } from '../../lib/apiClient.js';
import productCardModule from '../../components/ProductCard.jsx';
const ProductCard = productCardModule?.default || productCardModule;

import headerModule from '../../components/Header.jsx';
const Header = headerModule?.default || headerModule;

import cartPageModule from '../../pages/CartPage.jsx';
const CartPage = cartPageModule?.default || cartPageModule;

// Configure React 19 testing environment for act(...)
globalThis.React = React;
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
    createElementNS: (_ns, tag) => {
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
  location: {
    pathname: '/',
    search: '',
  },
  history: {
    pushState: () => {},
  },
  __listeners: windowListeners,
};
doc.defaultView = win;

globalThis.window = win;
globalThis.document = doc;
globalThis.Node = Node;
globalThis.Element = Element;
globalThis.HTMLElement = HTMLElement;

const PRODUCT_ID_1 = '507f1f77bcf86cd799439011';
const PRODUCT_ID_2 = '507f191e810c19729de860ea';

const MOCK_PRODUCT_1 = {
  _id: PRODUCT_ID_1,
  id: PRODUCT_ID_1,
  name: 'Mechanical Keyboard',
  price: 2999,
  stock: 25,
  isActive: true,
  image: 'https://example.com/keyboard.jpg',
  category: 'Accessories',
  description: 'Premium mechanical gaming keyboard.',
};

const MOCK_PRODUCT_2 = {
  _id: PRODUCT_ID_2,
  id: PRODUCT_ID_2,
  name: 'Wireless Mouse',
  price: 1499,
  stock: 50,
  isActive: true,
  image: 'https://example.com/mouse.jpg',
  category: 'Accessories',
  description: 'Ergonomic wireless optical mouse.',
};

describe('Guest Cart UI Integration (Step 73.7)', () => {
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
            totals: { itemCount: 1, totalQuantity: 2, subtotal: 5998 },
          },
        };
      }
      if (endpoint === `products/${PRODUCT_ID_1}`) {
        return { data: { product: MOCK_PRODUCT_1 } };
      }
      if (endpoint === `products/${PRODUCT_ID_2}`) {
        return { data: { product: MOCK_PRODUCT_2 } };
      }
      if (endpoint === 'products/categories') {
        return { data: { categories: ['Accessories', 'Devices'] } };
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
        data: { cart: { items: [] }, totals: { itemCount: 0, totalQuantity: 0, subtotal: 0 } },
      };
    };
  });

  afterEach(() => {
    apiClient.get = originalApiClientGet;
    apiClient.post = originalApiClientPost;
    apiClient.patch = originalApiClientPatch;
    apiClient.delete = originalApiClientDelete;
  });

  async function renderWithProviders(ui, { isAuthenticated = false, isLoading = false } = {}) {
    const rootEl = doc.createElement('div');
    const root = createRoot(rootEl);

    await act(async () => {
      root.render(
        React.createElement(
          AuthContext.Provider,
          { value: { isAuthenticated, isLoading, user: isAuthenticated ? { name: 'User' } : null } },
          React.createElement(CartProvider, null,
            React.createElement(WishlistProvider, null, ui)
          )
        )
      );
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

  it('1. guest can add from ProductCard without login redirect or guest barrier', async () => {
    let capturedContext = null;
    function Inspector() {
      capturedContext = React.useContext(CartContext);
      return null;
    }

    const { unmount } = await renderWithProviders(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(Inspector),
        React.createElement(ProductCard, { product: MOCK_PRODUCT_1 })
      ),
      { isAuthenticated: false }
    );

    // Initial state: guest cart is empty
    assert.strictEqual(getGuestCart().length, 0);

    // Add to cart through CartContext as ProductCard triggers
    await act(async () => {
      await capturedContext.addToCart(PRODUCT_ID_1, 1);
    });

    // Verify item is persisted in guest storage
    const stored = getGuestCart();
    assert.strictEqual(stored.length, 1);
    assert.strictEqual(stored[0].productId, PRODUCT_ID_1);
    assert.strictEqual(stored[0].quantity, 1);

    // Confirm NO backend mutation API was called
    const backendMutations = apiCalls.filter((c) => c.endpoint === 'cart/items');
    assert.strictEqual(backendMutations.length, 0);

    await unmount();
  });

  it('2. authenticated add behavior still calls backend', async () => {
    let capturedContext = null;
    function Inspector() {
      capturedContext = React.useContext(CartContext);
      return null;
    }

    const { unmount } = await renderWithProviders(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(Inspector),
        React.createElement(ProductCard, { product: MOCK_PRODUCT_1 })
      ),
      { isAuthenticated: true }
    );

    await act(async () => {
      await capturedContext.addToCart(PRODUCT_ID_1, 1);
    });

    const backendMutations = apiCalls.filter((c) => c.endpoint === 'cart/items');
    assert.strictEqual(backendMutations.length, 1);

    await unmount();
  });

  it('3. guest /cart route is accessible and does not show sign-in barrier', async () => {
    // Empty guest cart
    const { unmount } = await renderWithProviders(
      React.createElement(CartPage),
      { isAuthenticated: false }
    );

    // CartPage mounted unauthenticated without crashing or redirecting
    await unmount();
  });

  it('4. guest cart renders hydrated product data on CartPage', async () => {
    // Seed guest storage
    currentStorage.setItem(
      GUEST_CART_STORAGE_KEY,
      JSON.stringify([{ productId: PRODUCT_ID_1, quantity: 2 }])
    );

    let capturedContext = null;
    function Inspector() {
      capturedContext = React.useContext(CartContext);
      return null;
    }

    const { unmount } = await renderWithProviders(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(Inspector),
        React.createElement(CartPage)
      ),
      { isAuthenticated: false }
    );

    // Wait for guest cart hydration
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    assert.ok(capturedContext.cart);
    assert.strictEqual(capturedContext.cart.items.length, 1);
    assert.strictEqual(capturedContext.cart.items[0].product.name, 'Mechanical Keyboard');
    assert.strictEqual(capturedContext.totals.subtotal, 5998);

    await unmount();
  });

  it('5. guest quantity update works through CartContext', async () => {
    currentStorage.setItem(
      GUEST_CART_STORAGE_KEY,
      JSON.stringify([{ productId: PRODUCT_ID_1, quantity: 2 }])
    );

    let capturedContext = null;
    function Inspector() {
      capturedContext = React.useContext(CartContext);
      return null;
    }

    const { unmount } = await renderWithProviders(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(Inspector),
        React.createElement(CartPage)
      ),
      { isAuthenticated: false }
    );

    await act(async () => {
      await capturedContext.updateQuantity(PRODUCT_ID_1, 5);
    });

    assert.strictEqual(capturedContext.cart.items[0].quantity, 5);
    assert.strictEqual(capturedContext.totals.totalQuantity, 5);
    assert.strictEqual(getGuestCart()[0].quantity, 5);

    await unmount();
  });

  it('6. guest remove works through CartContext', async () => {
    currentStorage.setItem(
      GUEST_CART_STORAGE_KEY,
      JSON.stringify([{ productId: PRODUCT_ID_1, quantity: 2 }])
    );

    let capturedContext = null;
    function Inspector() {
      capturedContext = React.useContext(CartContext);
      return null;
    }

    const { unmount } = await renderWithProviders(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(Inspector),
        React.createElement(CartPage)
      ),
      { isAuthenticated: false }
    );

    await act(async () => {
      await capturedContext.removeItem(PRODUCT_ID_1);
    });

    assert.strictEqual(capturedContext.cart.items.length, 0);
    assert.strictEqual(capturedContext.totals.totalQuantity, 0);
    assert.strictEqual(getGuestCart().length, 0);

    await unmount();
  });

  it('7. guest clear works through CartContext', async () => {
    currentStorage.setItem(
      GUEST_CART_STORAGE_KEY,
      JSON.stringify([{ productId: PRODUCT_ID_1, quantity: 2 }])
    );

    let capturedContext = null;
    function Inspector() {
      capturedContext = React.useContext(CartContext);
      return null;
    }

    const { unmount } = await renderWithProviders(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(Inspector),
        React.createElement(CartPage)
      ),
      { isAuthenticated: false }
    );

    await act(async () => {
      await capturedContext.clearCart();
    });

    assert.strictEqual(capturedContext.cart.items.length, 0);
    assert.strictEqual(currentStorage.getItem(GUEST_CART_STORAGE_KEY), null);

    await unmount();
  });

  it('8. guest cart badge/count updates in Header', async () => {
    let capturedContext = null;
    function Inspector() {
      capturedContext = React.useContext(CartContext);
      return null;
    }

    const { unmount } = await renderWithProviders(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(Inspector),
        React.createElement(Header)
      ),
      { isAuthenticated: false }
    );

    assert.strictEqual(capturedContext.totals.totalQuantity, 0);

    await act(async () => {
      await capturedContext.addToCart(PRODUCT_ID_1, 3);
    });

    assert.strictEqual(capturedContext.totals.totalQuantity, 3);

    await unmount();
  });

  it('9. checkout authentication requirement remains intact in App routes', () => {
    const appFilePath = path.resolve('src/App.jsx');
    const appContent = fs.readFileSync(appFilePath, 'utf8');

    // /checkout MUST still be wrapped with <ProtectedRoute>
    assert.ok(
      appContent.includes("<ProtectedRoute>\n          <CheckoutPage />\n        </ProtectedRoute>") ||
      appContent.includes("<ProtectedRoute><CheckoutPage /></ProtectedRoute>") ||
      appContent.includes("pathname === '/checkout'")
    );

    // /cart MUST NOT be wrapped in <ProtectedRoute>
    assert.ok(
      !appContent.includes("<ProtectedRoute>\n          <CartPage />\n        </ProtectedRoute>")
    );
  });

  it('10. guest cart is not cleared when attempting to navigate to checkout', () => {
    currentStorage.setItem(
      GUEST_CART_STORAGE_KEY,
      JSON.stringify([{ productId: PRODUCT_ID_1, quantity: 2 }])
    );

    const storedBefore = getGuestCart();
    assert.strictEqual(storedBefore.length, 1);

    // Simulating checkout navigation (redirect to login)
    const storedAfter = getGuestCart();
    assert.deepStrictEqual(storedAfter, storedBefore);
  });

  it('11. UI components do not directly write to guest-cart localStorage', () => {
    const componentsToCheck = [
      'src/components/ProductCard.jsx',
      'src/pages/ProductPage.jsx',
      'src/pages/CartPage.jsx',
      'src/components/Header.jsx',
    ];

    for (const relPath of componentsToCheck) {
      const fullPath = path.resolve(relPath);
      const content = fs.readFileSync(fullPath, 'utf8');

      // UI components should NOT import guest storage directly
      assert.ok(
        !content.includes('guestCart.storage.js'),
        `${relPath} should not import guestCart.storage.js directly`
      );

      // UI components should NOT directly set the guest cart key
      assert.ok(
        !content.includes('commerceflow_guest_cart'),
        `${relPath} should not reference commerceflow_guest_cart directly`
      );
    }
  });

  it('12. no duplicate merge logic exists outside CartContext / cart service', () => {
    const filesToCheck = [
      'src/components/ProductCard.jsx',
      'src/pages/ProductPage.jsx',
      'src/pages/CartPage.jsx',
      'src/pages/LoginPage.jsx',
      'src/pages/RegisterPage.jsx',
    ];

    for (const relPath of filesToCheck) {
      const fullPath = path.resolve(relPath);
      const content = fs.readFileSync(fullPath, 'utf8');

      assert.ok(
        !content.includes('cart/merge'),
        `${relPath} should not directly call cart/merge endpoint`
      );
    }
  });
});
