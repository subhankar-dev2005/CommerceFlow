import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import recentlyViewedModule from './RecentlyViewedContext.jsx';
import authContextModule from '../auth/auth.context.jsx';

const RecentlyViewedProvider =
  recentlyViewedModule?.RecentlyViewedProvider ||
  recentlyViewedModule?.default?.RecentlyViewedProvider ||
  (typeof recentlyViewedModule?.default === 'function' ? recentlyViewedModule.default : null) ||
  recentlyViewedModule?.RecentlyViewedContext?.RecentlyViewedProvider ||
  recentlyViewedModule?.default?.RecentlyViewedContext?.RecentlyViewedProvider;

const RecentlyViewedContext =
  recentlyViewedModule?.RecentlyViewedContext ||
  recentlyViewedModule?.default?.RecentlyViewedContext ||
  RecentlyViewedProvider?.RecentlyViewedContext ||
  recentlyViewedModule?.default;

const AuthContext =
  authContextModule?.AuthContext ||
  authContextModule?.default?.AuthContext ||
  authContextModule?.default ||
  authContextModule;

import { useRecentlyViewed } from './useRecentlyViewed.js';
import {
  GUEST_RECENTLY_VIEWED_KEY
} from './recentlyViewed.storage.js';
import { apiClient } from '../../lib/apiClient.js';

// Configure React 19 testing environment for act(...)
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Mock DOM minimal environment for React 19 in Node
class Node {}
class Element extends Node {}
class HTMLElement extends Element {}

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
        insertBefore: (c) => c
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
    documentElement: new HTMLElement(),
    addEventListener: () => {},
    removeEventListener: () => {}
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
const PRODUCT_ID_2 = '607f1f77bcf86cd799439021';

const MOCK_PRODUCT_1 = {
  _id: PRODUCT_ID_1,
  name: 'Alpine Tent',
  price: 12000,
  stock: 5,
  isActive: true
};

const MOCK_PRODUCT_2 = {
  _id: PRODUCT_ID_2,
  name: 'Sleeping Bag',
  price: 4500,
  stock: 10,
  isActive: true
};

describe('RecentlyViewedContext & useRecentlyViewed', () => {
  let container;
  let root;
  let mockStorage;
  let originalDocument;
  let originalLocalStorage;
  let originalWindow;
  let recordedApiCalls;
  let mockApiResponses;

  beforeEach(() => {
    mockStorage = new MockStorage();
    originalLocalStorage = globalThis.localStorage;
    globalThis.localStorage = mockStorage;

    originalDocument = globalThis.document;
    globalThis.document = createMockDocument();

    originalWindow = globalThis.window;
    const mockWin = {
      localStorage: mockStorage,
      document: globalThis.document,
      location: { pathname: '/', search: '' },
      HTMLIFrameElement: class HTMLIFrameElement extends HTMLElement {},
      addEventListener: () => {},
      removeEventListener: () => {}
    };
    globalThis.window = mockWin;
    globalThis.document.defaultView = mockWin;

    recordedApiCalls = [];
    mockApiResponses = {};

    apiClient.get = async (endpoint, options) => {
      recordedApiCalls.push({ method: 'GET', endpoint, options });
      if (endpoint === `products/${PRODUCT_ID_1}`) {
        return { data: { product: MOCK_PRODUCT_1 } };
      }
      if (endpoint === `products/${PRODUCT_ID_2}`) {
        return { data: { product: MOCK_PRODUCT_2 } };
      }
      const key = `GET:${endpoint}`;
      if (mockApiResponses[key] instanceof Error) throw mockApiResponses[key];
      return mockApiResponses[key] ?? { data: { items: [], totalItems: 0 } };
    };

    apiClient.post = async (endpoint, body, options) => {
      recordedApiCalls.push({ method: 'POST', endpoint, body, options });
      const key = `POST:${endpoint}`;
      if (mockApiResponses[key] instanceof Error) throw mockApiResponses[key];
      return mockApiResponses[key] ?? { data: {} };
    };

    apiClient.delete = async (endpoint, options) => {
      recordedApiCalls.push({ method: 'DELETE', endpoint, options });
      const key = `DELETE:${endpoint}`;
      if (mockApiResponses[key] instanceof Error) throw mockApiResponses[key];
      return mockApiResponses[key] ?? { success: true };
    };

    container = globalThis.document.createElement('div');
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    globalThis.document = originalDocument;
    globalThis.localStorage = originalLocalStorage;
    globalThis.window = originalWindow;
  });

  function renderWithProviders(ui, authValue = { isAuthenticated: false, isLoading: false }) {
    return act(async () => {
      root.render(
        React.createElement(
          AuthContext.Provider,
          { value: authValue },
          React.createElement(
            RecentlyViewedProvider,
            null,
            ui
          )
        )
      );
    });
  }

  describe('useRecentlyViewed Hook Guard', () => {
    it('throws error when useRecentlyViewed is called outside provider', async () => {
      const tempContainer = globalThis.document.createElement('div');
      const tempRoot = createRoot(tempContainer);
      function ConsumerOutside() {
        useRecentlyViewed();
        return null;
      }
      assert.throws(() => {
        act(() => {
          tempRoot.render(<ConsumerOutside />);
        });
      }, /useRecentlyViewed must be used within a <RecentlyViewedProvider>/);
      try {
        await act(async () => {
          tempRoot.unmount();
        });
      } catch {
        // ignore
      }
    });
  });

  describe('Guest Browsing Behavior', () => {
    it('records view in localStorage without making authenticated API calls', async () => {
      let contextValue;
      function TestConsumer() {
        contextValue = React.useContext(RecentlyViewedContext);
        return null;
      }

      await renderWithProviders(<TestConsumer />, { isAuthenticated: false, isLoading: false });

      await act(async () => {
        await contextValue.recordRecentlyViewed(PRODUCT_ID_1);
      });

      // Assert stored in guest localStorage
      const stored = JSON.parse(mockStorage.getItem(GUEST_RECENTLY_VIEWED_KEY));
      assert.deepStrictEqual(stored, [PRODUCT_ID_1]);

      // Assert no authenticated API calls made
      const recordCalls = recordedApiCalls.filter((c) => c.endpoint === 'recently-viewed');
      assert.strictEqual(recordCalls.length, 0);

      // Assert context state is populated with hydrated product
      assert.strictEqual(contextValue.recentlyViewed.length, 1);
      assert.strictEqual(contextValue.recentlyViewed[0].product._id, PRODUCT_ID_1);
    });

    it('clearing history clears guest storage and sets state to empty', async () => {
      mockStorage.setItem(GUEST_RECENTLY_VIEWED_KEY, JSON.stringify([PRODUCT_ID_1]));

      let contextValue;
      function TestConsumer() {
        contextValue = React.useContext(RecentlyViewedContext);
        return null;
      }

      await renderWithProviders(<TestConsumer />, { isAuthenticated: false, isLoading: false });

      await act(async () => {
        await contextValue.clearRecentlyViewed();
      });

      assert.strictEqual(mockStorage.getItem(GUEST_RECENTLY_VIEWED_KEY), null);
      assert.deepStrictEqual(contextValue.recentlyViewed, []);
    });
  });

  describe('Authenticated Browsing Behavior', () => {
    it('calls POST /api/v1/recently-viewed and does NOT store in guest localStorage', async () => {
      mockApiResponses['POST:recently-viewed'] = {
        data: { productId: PRODUCT_ID_1, viewedAt: new Date().toISOString() }
      };
      mockApiResponses['GET:recently-viewed'] = {
        data: {
          items: [{ viewedAt: new Date().toISOString(), product: MOCK_PRODUCT_1 }],
          totalItems: 1
        }
      };

      let contextValue;
      function TestConsumer() {
        contextValue = React.useContext(RecentlyViewedContext);
        return null;
      }

      await renderWithProviders(
        <TestConsumer />,
        { isAuthenticated: true, isLoading: false, user: { _id: 'user_123' } }
      );

      await act(async () => {
        await contextValue.recordRecentlyViewed(PRODUCT_ID_1);
      });

      // Assert API was called with { productId }
      const postCalls = recordedApiCalls.filter(
        (c) => c.method === 'POST' && c.endpoint === 'recently-viewed'
      );
      assert.strictEqual(postCalls.length, 1);
      assert.deepStrictEqual(postCalls[0].body, { productId: PRODUCT_ID_1 });

      // Assert guest storage remains empty
      assert.strictEqual(mockStorage.getItem(GUEST_RECENTLY_VIEWED_KEY), null);
    });

    it('deduplicates rapid consecutive record requests within dwell window', async () => {
      mockApiResponses['POST:recently-viewed'] = {
        data: { productId: PRODUCT_ID_1, viewedAt: new Date().toISOString() }
      };

      let contextValue;
      function TestConsumer() {
        contextValue = React.useContext(RecentlyViewedContext);
        return null;
      }

      await renderWithProviders(
        <TestConsumer />,
        { isAuthenticated: true, isLoading: false, user: { _id: 'user_123' } }
      );

      await act(async () => {
        // Trigger two rapid record calls for the same product
        await Promise.all([
          contextValue.recordRecentlyViewed(PRODUCT_ID_1),
          contextValue.recordRecentlyViewed(PRODUCT_ID_1)
        ]);
      });

      const postCalls = recordedApiCalls.filter(
        (c) => c.method === 'POST' && c.endpoint === 'recently-viewed'
      );
      assert.strictEqual(postCalls.length, 1);
    });
  });

  describe('Guest-to-Authenticated Merge Lifecycle', () => {
    it('merges guest items upon login and clears guest storage on success', async () => {
      // Preload guest storage
      mockStorage.setItem(GUEST_RECENTLY_VIEWED_KEY, JSON.stringify([PRODUCT_ID_1, PRODUCT_ID_2]));

      mockApiResponses['POST:recently-viewed/merge'] = {
        data: { mergedCount: 2 }
      };
      mockApiResponses['GET:recently-viewed'] = {
        data: {
          items: [
            { viewedAt: new Date().toISOString(), product: MOCK_PRODUCT_1 },
            { viewedAt: new Date().toISOString(), product: MOCK_PRODUCT_2 }
          ],
          totalItems: 2
        }
      };

      let contextValue;
      function TestConsumer() {
        contextValue = React.useContext(RecentlyViewedContext);
        return null;
      }

      await renderWithProviders(
        <TestConsumer />,
        { isAuthenticated: true, isLoading: false, user: { _id: 'user_123' } }
      );

      // Verify merge API was called with guest IDs
      const mergeCalls = recordedApiCalls.filter((c) => c.endpoint === 'recently-viewed/merge');
      assert.strictEqual(mergeCalls.length, 1);
      assert.deepStrictEqual(mergeCalls[0].body, { productIds: [PRODUCT_ID_1, PRODUCT_ID_2] });

      // Verify guest storage was cleared ONLY after success
      assert.strictEqual(mockStorage.getItem(GUEST_RECENTLY_VIEWED_KEY), null);

      // Verify server items loaded into state
      assert.strictEqual(contextValue.recentlyViewed.length, 2);
    });

    it('preserves guest storage when merge API fails (does not lose history or crash)', async () => {
      mockStorage.setItem(GUEST_RECENTLY_VIEWED_KEY, JSON.stringify([PRODUCT_ID_1]));

      const mergeError = new Error('Merge network failure');
      mockApiResponses['POST:recently-viewed/merge'] = mergeError;
      mockApiResponses['GET:recently-viewed'] = {
        data: { items: [], totalItems: 0 }
      };

      let contextValue;
      function TestConsumer() {
        contextValue = React.useContext(RecentlyViewedContext);
        return null;
      }

      await renderWithProviders(
        <TestConsumer />,
        { isAuthenticated: true, isLoading: false, user: { _id: 'user_123' } }
      );

      // Guest storage MUST be preserved on merge failure
      const stored = JSON.parse(mockStorage.getItem(GUEST_RECENTLY_VIEWED_KEY));
      assert.deepStrictEqual(stored, [PRODUCT_ID_1]);

      // Error captured in state without crashing
      assert.ok(contextValue.error);
    });
  });

  describe('Logout & Isolation', () => {
    it('logout resets server history without writing server items to guest storage', async () => {
      mockApiResponses['GET:recently-viewed'] = {
        data: {
          items: [{ viewedAt: new Date().toISOString(), product: MOCK_PRODUCT_1 }],
          totalItems: 1
        }
      };

      let contextValue;
      function TestConsumer() {
        contextValue = React.useContext(RecentlyViewedContext);
        return null;
      }

      // 1. Render as authenticated user
      await renderWithProviders(
        <TestConsumer />,
        { isAuthenticated: true, isLoading: false, user: { _id: 'user_123' } }
      );

      assert.strictEqual(contextValue.recentlyViewed.length, 1);

      // 2. Transition to logged out
      await renderWithProviders(
        <TestConsumer />,
        { isAuthenticated: false, isLoading: false }
      );

      // Guest localStorage must NOT contain authenticated user's history
      assert.strictEqual(mockStorage.getItem(GUEST_RECENTLY_VIEWED_KEY), null);
      assert.deepStrictEqual(contextValue.recentlyViewed, []);
    });

    it('User A history is never displayed to User B after logout and login as User B', async () => {
      let contextValue;
      function TestConsumer() {
        contextValue = React.useContext(RecentlyViewedContext);
        return null;
      }

      // User A data
      mockApiResponses['GET:recently-viewed'] = {
        data: {
          items: [{ viewedAt: new Date().toISOString(), product: MOCK_PRODUCT_1 }],
          totalItems: 1
        }
      };

      // 1. User A logs in and sees Product 1
      await renderWithProviders(
        <TestConsumer />,
        { isAuthenticated: true, isLoading: false, user: { _id: 'user_A' } }
      );
      assert.strictEqual(contextValue.recentlyViewed.length, 1);
      assert.strictEqual(contextValue.recentlyViewed[0].product._id, PRODUCT_ID_1);

      // 2. User A logs out
      await renderWithProviders(
        <TestConsumer />,
        { isAuthenticated: false, isLoading: false }
      );
      assert.deepStrictEqual(contextValue.recentlyViewed, []);

      // User B data
      mockApiResponses['GET:recently-viewed'] = {
        data: {
          items: [{ viewedAt: new Date().toISOString(), product: MOCK_PRODUCT_2 }],
          totalItems: 1
        }
      };

      // 3. User B logs in and sees Product 2
      await renderWithProviders(
        <TestConsumer />,
        { isAuthenticated: true, isLoading: false, user: { _id: 'user_B' } }
      );
      assert.strictEqual(contextValue.recentlyViewed.length, 1);
      assert.strictEqual(contextValue.recentlyViewed[0].product._id, PRODUCT_ID_2);
      assert.notStrictEqual(contextValue.recentlyViewed[0].product._id, PRODUCT_ID_1);
    });

    it('stale User A GET response arriving after logout or User B login is discarded', async () => {
      let contextValue;
      function TestConsumer() {
        contextValue = React.useContext(RecentlyViewedContext);
        return null;
      }

      let resolveUserAGet;
      const userAPromise = new Promise((resolve) => {
        resolveUserAGet = resolve;
      });

      // API returns a deferred promise for User A
      apiClient.get = async (endpoint, options) => {
        recordedApiCalls.push({ method: 'GET', endpoint, options });
        if (endpoint === 'recently-viewed') {
          return userAPromise;
        }
        return { data: { items: [], totalItems: 0 } };
      };

      // 1. User A logs in (GET is pending)
      await renderWithProviders(
        <TestConsumer />,
        { isAuthenticated: true, isLoading: false, user: { _id: 'user_A' } }
      );

      // 2. User A logs out before User A's GET resolves
      await renderWithProviders(
        <TestConsumer />,
        { isAuthenticated: false, isLoading: false }
      );

      // 3. Now resolve the stale User A GET response
      resolveUserAGet({
        data: {
          items: [{ viewedAt: new Date().toISOString(), product: MOCK_PRODUCT_1 }],
          totalItems: 1
        }
      });
      await act(async () => {});

      // Stale response must be discarded; guest state must remain empty
      assert.deepStrictEqual(contextValue.recentlyViewed, []);
      assert.strictEqual(mockStorage.getItem(GUEST_RECENTLY_VIEWED_KEY), null);
    });

    it('stale User A record request completing after logout does not set User A history into guest state', async () => {
      let contextValue;
      function TestConsumer() {
        contextValue = React.useContext(RecentlyViewedContext);
        return null;
      }

      let resolveRecord;
      const recordPromise = new Promise((resolve) => {
        resolveRecord = resolve;
      });

      mockApiResponses['GET:recently-viewed'] = {
        data: { items: [], totalItems: 0 }
      };

      apiClient.post = async (endpoint, body, options) => {
        recordedApiCalls.push({ method: 'POST', endpoint, body, options });
        if (endpoint === 'recently-viewed') {
          return recordPromise;
        }
        return { success: true };
      };

      // 1. User A logs in
      await renderWithProviders(
        <TestConsumer />,
        { isAuthenticated: true, isLoading: false, user: { _id: 'user_A' } }
      );

      // 2. User A triggers record (in flight)
      let recordActionPromise;
      await act(async () => {
        recordActionPromise = contextValue.recordRecentlyViewed(PRODUCT_ID_1);
      });

      // 3. User A logs out while record is pending
      await renderWithProviders(
        <TestConsumer />,
        { isAuthenticated: false, isLoading: false }
      );

      // 4. Resolve the pending record request
      resolveRecord({ success: true, data: { productId: PRODUCT_ID_1 } });
      await act(async () => {
        await recordActionPromise;
      });

      // Stale write must not leak into guest history or state
      assert.deepStrictEqual(contextValue.recentlyViewed, []);
      assert.strictEqual(mockStorage.getItem(GUEST_RECENTLY_VIEWED_KEY), null);
    });

    it('direct user identity change (User A -> User B) without intermediate logout updates history to User B', async () => {
      let contextValue;
      function TestConsumer() {
        contextValue = React.useContext(RecentlyViewedContext);
        return null;
      }

      mockApiResponses['GET:recently-viewed'] = {
        data: {
          items: [{ viewedAt: new Date().toISOString(), product: MOCK_PRODUCT_1 }],
          totalItems: 1
        }
      };

      // 1. User A is active
      await renderWithProviders(
        <TestConsumer />,
        { isAuthenticated: true, isLoading: false, user: { _id: 'user_A' } }
      );
      assert.strictEqual(contextValue.recentlyViewed[0].product._id, PRODUCT_ID_1);

      // Change backend mock for User B
      mockApiResponses['GET:recently-viewed'] = {
        data: {
          items: [{ viewedAt: new Date().toISOString(), product: MOCK_PRODUCT_2 }],
          totalItems: 1
        }
      };

      // 2. Direct user identity switch: User A -> User B (isAuthenticated remains true)
      await renderWithProviders(
        <TestConsumer />,
        { isAuthenticated: true, isLoading: false, user: { _id: 'user_B' } }
      );

      // Context must update to User B's items and not retain User A's items
      assert.strictEqual(contextValue.recentlyViewed.length, 1);
      assert.strictEqual(contextValue.recentlyViewed[0].product._id, PRODUCT_ID_2);
    });
  });
});
