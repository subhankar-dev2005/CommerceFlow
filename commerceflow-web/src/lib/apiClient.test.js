/* global Headers, DOMException */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  apiClient,
  ApiError,
  getRateLimitCooldown,
  resetRateLimitCooldown,
  clearInFlightRequests,
  resetRefreshState,
  getStoredRefreshTimestamp,
  setStoredRefreshTimestamp,
  SESSION_EXPIRATION_CODES,
  NON_REFRESH_SESSION_CODES,
  DEFINITIVE_REFRESH_FAILURE_CODES,
} from './apiClient.js';

describe('apiClient — In-Flight Deduplication and Rate-Limit Cooldown', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    resetRateLimitCooldown();
    clearInFlightRequests();
    resetRefreshState();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    resetRateLimitCooldown();
    clearInFlightRequests();
    resetRefreshState();
  });

  it('1. deduplicates concurrent in-flight GET requests to the same endpoint', async () => {
    let fetchCount = 0;

    globalThis.fetch = async () => {
      fetchCount += 1;
      await new Promise((r) => setTimeout(r, 25));
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: { value: 42 } }),
      };
    };

    const p1 = apiClient.get('/test-endpoint');
    const p2 = apiClient.get('/test-endpoint');

    const [res1, res2] = await Promise.all([p1, p2]);

    assert.strictEqual(fetchCount, 1, 'Only one network fetch must occur for concurrent identical GETs');
    assert.deepStrictEqual(res1, { success: true, data: { value: 42 } });
    assert.deepStrictEqual(res2, { success: true, data: { value: 42 } });
  });

  it('2. initiates a new network fetch after an in-flight request has completed', async () => {
    let fetchCount = 0;

    globalThis.fetch = async () => {
      fetchCount += 1;
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, call: fetchCount }),
      };
    };

    const first = await apiClient.get('/sequential-endpoint');
    assert.strictEqual(first.call, 1);
    assert.strictEqual(fetchCount, 1);

    const second = await apiClient.get('/sequential-endpoint');
    assert.strictEqual(second.call, 2);
    assert.strictEqual(fetchCount, 2);
  });

  it('3. does not deduplicate POST or other mutating HTTP methods', async () => {
    let fetchCount = 0;

    globalThis.fetch = async () => {
      fetchCount += 1;
      await new Promise((r) => setTimeout(r, 20));
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true }),
      };
    };

    const p1 = apiClient.post('/mutating', { a: 1 });
    const p2 = apiClient.post('/mutating', { a: 1 });

    await Promise.all([p1, p2]);

    assert.strictEqual(fetchCount, 2, 'POST requests must never be deduplicated');
  });

  it('4. preserves independent cancellation: caller 1 aborts without aborting caller 2', async () => {
    let fetchCount = 0;

    globalThis.fetch = async (url, opts) => {
      fetchCount += 1;
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ success: true, data: 'shared-result' }),
          });
        }, 50);

        opts.signal?.addEventListener('abort', () => {
          clearTimeout(timeout);
          reject(new DOMException('The user aborted a request.', 'AbortError'));
        });
      });
    };

    const controller1 = new AbortController();
    const controller2 = new AbortController();

    const p1 = apiClient.get('/cancellation-test', { signal: controller1.signal });
    const p2 = apiClient.get('/cancellation-test', { signal: controller2.signal });

    // Abort caller 1 after 10ms
    setTimeout(() => controller1.abort(), 10);

    let p1Error = null;
    try {
      await p1;
    } catch (err) {
      p1Error = err;
    }

    assert.ok(p1Error, 'Caller 1 must reject with an error');
    assert.strictEqual(p1Error.name, 'AbortError');

    const res2 = await p2;
    assert.deepStrictEqual(res2, { success: true, data: 'shared-result' });
    assert.strictEqual(fetchCount, 1);
  });

  it('5. aborts underlying fetch only when all concurrent callers have aborted', async () => {
    let underlyingAborted = false;

    globalThis.fetch = async (url, opts) => {
      return new Promise((resolve, reject) => {
        opts.signal?.addEventListener('abort', () => {
          underlyingAborted = true;
          reject(new DOMException('The user aborted a request.', 'AbortError'));
        });
      });
    };

    const c1 = new AbortController();
    const c2 = new AbortController();

    const p1 = apiClient.get('/all-abort-test', { signal: c1.signal });
    const p2 = apiClient.get('/all-abort-test', { signal: c2.signal });

    c1.abort();
    c2.abort();

    await Promise.allSettled([p1, p2]);

    assert.strictEqual(underlyingAborted, true, 'Underlying fetch must abort when all callers abort');
  });

  it('6. activates rate limit cooldown on HTTP 429 with Retry-After header', async () => {
    globalThis.fetch = async () => {
      return {
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers({
          'content-type': 'application/json',
          'retry-after': '60',
        }),
        json: async () => ({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests, please try again later.',
          },
        }),
      };
    };

    let caughtError = null;
    try {
      await apiClient.get('/rate-limited-endpoint');
    } catch (err) {
      caughtError = err;
    }

    assert.ok(caughtError instanceof ApiError);
    assert.strictEqual(caughtError.status, 429);
    assert.strictEqual(caughtError.retryAfter, 60);

    const cooldown = getRateLimitCooldown();
    assert.ok(cooldown > 0 && cooldown <= 60, `Cooldown should be active (got ${cooldown})`);
  });

  it('7. blocks subsequent requests during active rate limit cooldown without network dispatch', async () => {
    let networkCalls = 0;

    globalThis.fetch = async () => {
      networkCalls += 1;
      return {
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers({
          'content-type': 'application/json',
          'retry-after': '30',
        }),
        json: async () => ({
          success: false,
          error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests' },
        }),
      };
    };

    // First call receives 429 and triggers cooldown
    await assert.rejects(
      async () => apiClient.get('/cooldown-test'),
      (err) => err.status === 429 && err.retryAfter === 30
    );
    assert.strictEqual(networkCalls, 1);

    // Second call during cooldown must be blocked immediately without hitting network
    await assert.rejects(
      async () => apiClient.get('/any-other-endpoint'),
      (err) => {
        assert.strictEqual(err.status, 429);
        assert.strictEqual(err.code, 'RATE_LIMIT_COOLDOWN');
        assert.ok(err.retryAfter > 0);
        return true;
      }
    );

    // Verify network was not touched a second time
    assert.strictEqual(networkCalls, 1, 'Network must not be contacted during active cooldown');
  });

  it('8. resets rate limit cooldown when resetRateLimitCooldown is called', async () => {
    let networkCalls = 0;

    globalThis.fetch = async () => {
      networkCalls += 1;
      if (networkCalls === 1) {
        return {
          ok: false,
          status: 429,
          headers: new Headers({ 'retry-after': '120', 'content-type': 'application/json' }),
          json: async () => ({ success: false, error: { code: 'RATE_LIMIT_EXCEEDED' } }),
        };
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true }),
      };
    };

    await assert.rejects(() => apiClient.get('/reset-cooldown-test'));
    assert.ok(getRateLimitCooldown() > 0);

    resetRateLimitCooldown();
    assert.strictEqual(getRateLimitCooldown(), 0);

    const result = await apiClient.get('/reset-cooldown-test');
    assert.deepStrictEqual(result, { success: true });
    assert.strictEqual(networkCalls, 2);
  });

  it('9. does not poison subsequent callers when an in-flight request is aborted (StrictMode remount)', async () => {
    let networkCalls = 0;

    globalThis.fetch = async (url, opts) => {
      networkCalls += 1;
      const callNum = networkCalls;
      return new Promise((resolve, reject) => {
        opts.signal?.addEventListener('abort', () => {
          reject(new DOMException('The user aborted a request.', 'AbortError'));
        });
        setTimeout(() => {
          resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ success: true, callNum }),
          });
        }, 30);
      });
    };

    const c1 = new AbortController();
    const p1 = apiClient.get('/remount-test', { signal: c1.signal });

    // Simulate React StrictMode unmount: abort caller 1 immediately
    c1.abort();

    let p1Error = null;
    try {
      await p1;
    } catch (err) {
      p1Error = err;
    }
    assert.ok(p1Error, 'Caller 1 should reject');
    assert.strictEqual(p1Error.name, 'AbortError');

    // Simulate React StrictMode remount: caller 2 dispatches a new request immediately
    const c2 = new AbortController();
    const res2 = await apiClient.get('/remount-test', { signal: c2.signal });

    assert.ok(res2, 'Caller 2 must receive a response rather than being aborted');
    assert.strictEqual(res2.callNum, 2);
    assert.strictEqual(networkCalls, 2);
  });

  it('10. AUTH_RATE_LIMIT_EXCEEDED cools down auth endpoints without blocking general storefront browsing', async () => {
    let networkCalls = 0;

    globalThis.fetch = async (url) => {
      networkCalls += 1;
      if (url.includes('users/login')) {
        return {
          ok: false,
          status: 429,
          headers: new Headers({
            'content-type': 'application/json',
            'retry-after': '60',
          }),
          json: async () => ({
            success: false,
            error: { code: 'AUTH_RATE_LIMIT_EXCEEDED', message: 'Too many authentication attempts' },
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: { categories: ['Clothing'] } }),
      };
    };

    // First call receives 429 AUTH_RATE_LIMIT_EXCEEDED
    await assert.rejects(
      async () => apiClient.post('users/login', { email: 'bad@test.com', password: 'wrong' }),
      (err) => err.status === 429 && err.code === 'AUTH_RATE_LIMIT_EXCEEDED'
    );

    // Calling auth endpoint during cooldown is blocked client-side
    await assert.rejects(
      async () => apiClient.post('users/login', { email: 'bad@test.com', password: 'wrong' }),
      (err) => err.status === 429 && err.code === 'RATE_LIMIT_COOLDOWN'
    );

    // Crucially: public catalog browsing (products/categories) is NOT blocked!
    const catalogResult = await apiClient.get('products/categories');
    assert.deepStrictEqual(catalogResult, { success: true, data: { categories: ['Clothing'] } });
    assert.strictEqual(networkCalls, 2, 'Only unblocked requests touch the network');
  });
});

function setupMockWindow() {
  const events = [];
  const listeners = new Map();

  class MockCustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail || null;
    }
  }

  const mockStorage = new Map();

  const mockWindow = {
    CustomEvent: MockCustomEvent,
    Event: MockCustomEvent,
    addEventListener: (type, handler) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
    },
    removeEventListener: (type, handler) => {
      if (listeners.has(type)) listeners.get(type).delete(handler);
    },
    dispatchEvent: (event) => {
      events.push(event);
      const handlers = listeners.get(event.type);
      if (handlers) {
        for (const handler of handlers) {
          handler(event);
        }
      }
      return true;
    },
    localStorage: {
      getItem: (k) => (mockStorage.has(k) ? mockStorage.get(k) : null),
      setItem: (k, v) => mockStorage.set(k, String(v)),
      removeItem: (k) => mockStorage.delete(k),
      clear: () => mockStorage.clear(),
      _storage: mockStorage,
    },
  };

  return { mockWindow, events, mockStorage };
}

function mockJsonResponse(status, data, headers = {}) {
  const headerMap = new Headers({
    'content-type': 'application/json',
    ...headers,
  });
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : status === 401 ? 'Unauthorized' : status === 409 ? 'Conflict' : 'Error',
    headers: headerMap,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

describe('apiClient — Refresh-Token Session Recovery & Concurrency', () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;

  let mockWin;
  let dispatchedEvents;
  let mockStorage;

  beforeEach(() => {
    resetRateLimitCooldown();
    clearInFlightRequests();
    resetRefreshState();

    const setup = setupMockWindow();
    mockWin = setup.mockWindow;
    dispatchedEvents = setup.events;
    mockStorage = setup.mockStorage;
    globalThis.window = mockWin;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
    resetRateLimitCooldown();
    clearInFlightRequests();
    resetRefreshState();
  });

  it('1. deduplicates concurrent in-flight 401s into a single refresh request within tab', async () => {
    let refreshCalls = 0;
    let endpointACalls = 0;
    let endpointBCalls = 0;
    let endpointCCalls = 0;

    globalThis.fetch = async (url) => {
      const urlStr = String(url);

      if (urlStr.includes('/users/refresh')) {
        refreshCalls += 1;
        // Introduce small network delay so concurrent requests overlap
        await new Promise((r) => setTimeout(r, 20));
        return mockJsonResponse(200, {
          success: true,
          message: 'Session refreshed successfully',
          data: { user: { id: 'u1', name: 'Tester' } },
        });
      }

      if (urlStr.includes('/user/profile')) {
        endpointACalls += 1;
        if (endpointACalls === 1) {
          return mockJsonResponse(401, {
            success: false,
            error: { code: 'AUTH_TOKEN_EXPIRED', message: 'Authentication token has expired' },
          });
        }
        return mockJsonResponse(200, { success: true, data: { name: 'Alice' } });
      }

      if (urlStr.includes('/user/orders')) {
        endpointBCalls += 1;
        if (endpointBCalls === 1) {
          return mockJsonResponse(401, {
            success: false,
            error: { code: 'AUTH_TOKEN_EXPIRED', message: 'Authentication token has expired' },
          });
        }
        return mockJsonResponse(200, { success: true, data: { orders: [1, 2] } });
      }

      if (urlStr.includes('/cart/items')) {
        endpointCCalls += 1;
        if (endpointCCalls === 1) {
          return mockJsonResponse(401, {
            success: false,
            error: { code: 'AUTH_TOKEN_EXPIRED', message: 'Authentication token has expired' },
          });
        }
        return mockJsonResponse(200, { success: true, data: { added: true } });
      }

      throw new Error(`Unhandled URL: ${urlStr}`);
    };

    // Dispatch 3 concurrent requests across GET and POST that all fail with 401 AUTH_TOKEN_EXPIRED
    const p1 = apiClient.get('/user/profile');
    const p2 = apiClient.get('/user/orders');
    const p3 = apiClient.post('/cart/items', { productId: 'p1', quantity: 1 });

    const [res1, res2, res3] = await Promise.all([p1, p2, p3]);

    assert.strictEqual(refreshCalls, 1, 'Only one refresh network call must occur for concurrent 401s');
    assert.strictEqual(endpointACalls, 2, 'Initial call + 1 retry');
    assert.strictEqual(endpointBCalls, 2, 'Initial call + 1 retry');
    assert.strictEqual(endpointCCalls, 2, 'Initial call + 1 retry');

    assert.deepStrictEqual(res1, { success: true, data: { name: 'Alice' } });
    assert.deepStrictEqual(res2, { success: true, data: { orders: [1, 2] } });
    assert.deepStrictEqual(res3, { success: true, data: { added: true } });
    assert.strictEqual(dispatchedEvents.length, 0, 'No session-expired events should fire on successful recovery');
  });

  it('2. enforces retry limit: retries at most once and prevents infinite refresh loop', async () => {
    let refreshCalls = 0;
    let endpointCalls = 0;

    globalThis.fetch = async (url) => {
      const urlStr = String(url);

      if (urlStr.includes('/users/refresh')) {
        refreshCalls += 1;
        return mockJsonResponse(200, {
          success: true,
          data: { user: { id: 'u1' } },
        });
      }

      if (urlStr.includes('/failing-endpoint')) {
        endpointCalls += 1;
        // Even after refresh, endpoint continues to return 401 AUTH_TOKEN_EXPIRED
        return mockJsonResponse(401, {
          success: false,
          error: { code: 'AUTH_TOKEN_EXPIRED', message: 'Token still rejected' },
        });
      }

      throw new Error(`Unhandled URL: ${urlStr}`);
    };

    await assert.rejects(
      async () => apiClient.get('/failing-endpoint'),
      (err) => {
        assert.ok(err instanceof ApiError);
        assert.strictEqual(err.status, 401);
        assert.strictEqual(err.code, 'AUTH_TOKEN_EXPIRED');
        return true;
      }
    );

    assert.strictEqual(refreshCalls, 1, 'Must attempt refresh exactly once');
    assert.strictEqual(endpointCalls, 2, 'Must attempt initial request + exactly 1 retry');
    assert.strictEqual(dispatchedEvents.length, 1, 'Must dispatch session-expired when retried request fails');
    assert.strictEqual(dispatchedEvents[0].detail.code, 'AUTH_TOKEN_EXPIRED');
  });

  it('3. prevents recursive refresh loops: excludes refresh endpoint from self-interception', async () => {
    let refreshCalls = 0;

    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('/users/refresh')) {
        refreshCalls += 1;
        return mockJsonResponse(401, {
          success: false,
          error: { code: 'REFRESH_TOKEN_EXPIRED', message: 'Session expired' },
        });
      }
      throw new Error(`Unhandled URL: ${urlStr}`);
    };

    await assert.rejects(
      async () => apiClient.post('users/refresh', {}),
      (err) => {
        assert.ok(err instanceof ApiError);
        assert.strictEqual(err.status, 401);
        assert.strictEqual(err.code, 'REFRESH_TOKEN_EXPIRED');
        return true;
      }
    );

    assert.strictEqual(refreshCalls, 1, 'Refresh endpoint must NEVER attempt to refresh itself');
    assert.strictEqual(dispatchedEvents.length, 1, 'Definitive refresh failure must emit session-expired');
    assert.strictEqual(dispatchedEvents[0].detail.code, 'REFRESH_TOKEN_EXPIRED');
  });

  it('4. recovers from 409 CONCURRENT_REFRESH with bounded delay and retries original request', async () => {
    let refreshCalls = 0;
    let endpointCalls = 0;

    globalThis.fetch = async (url) => {
      const urlStr = String(url);

      if (urlStr.includes('/users/refresh')) {
        refreshCalls += 1;
        return mockJsonResponse(409, {
          success: false,
          error: {
            code: 'CONCURRENT_REFRESH',
            message: 'A concurrent session refresh request was already processed for this session',
          },
        });
      }

      if (urlStr.includes('/saved-items')) {
        endpointCalls += 1;
        if (endpointCalls === 1) {
          return mockJsonResponse(401, {
            success: false,
            error: { code: 'AUTH_TOKEN_EXPIRED', message: 'Token expired' },
          });
        }
        // Retried call succeeds using the concurrent winner's newly rotated cookies
        return mockJsonResponse(200, { success: true, data: { items: ['item-1', 'item-2'] } });
      }

      throw new Error(`Unhandled URL: ${urlStr}`);
    };

    const res = await apiClient.get('/saved-items');

    assert.strictEqual(refreshCalls, 1);
    assert.strictEqual(endpointCalls, 2, 'Initial 401 + 1 retry');
    assert.deepStrictEqual(res, { success: true, data: { items: ['item-1', 'item-2'] } });
    assert.strictEqual(dispatchedEvents.length, 0, '409 CONCURRENT_REFRESH must not log out the user');
  });

  it('5. handles 409 CONCURRENT_REFRESH where retried request still fails without looping', async () => {
    let refreshCalls = 0;
    let endpointCalls = 0;

    globalThis.fetch = async (url) => {
      const urlStr = String(url);

      if (urlStr.includes('/users/refresh')) {
        refreshCalls += 1;
        return mockJsonResponse(409, {
          success: false,
          error: { code: 'CONCURRENT_REFRESH', message: 'Concurrent refresh processed' },
        });
      }

      if (urlStr.includes('/failing-after-409')) {
        endpointCalls += 1;
        return mockJsonResponse(401, {
          success: false,
          error: { code: 'AUTH_TOKEN_EXPIRED', message: 'Token expired' },
        });
      }

      throw new Error(`Unhandled URL: ${urlStr}`);
    };

    await assert.rejects(
      async () => apiClient.get('/failing-after-409'),
      (err) => {
        assert.ok(err instanceof ApiError);
        assert.strictEqual(err.status, 401);
        return true;
      }
    );

    assert.strictEqual(refreshCalls, 1);
    assert.strictEqual(endpointCalls, 2, 'Initial call + exactly 1 retry; no infinite loop');
    assert.strictEqual(dispatchedEvents.length, 1, 'Definitive expiration dispatched after retried failure');
  });

  it('6. dispatches session-expired for confirmed definitive session error codes', async () => {
    const definitiveCodes = [
      { status: 401, code: 'TOKEN_REUSE_DETECTED' },
      { status: 401, code: 'REFRESH_TOKEN_EXPIRED' },
      { status: 401, code: 'INVALID_REFRESH_TOKEN' },
      { status: 401, code: 'AUTH_TOKEN_REVOKED' },
      { status: 403, code: 'FORBIDDEN' },
    ];

    for (const { status, code } of definitiveCodes) {
      dispatchedEvents.length = 0;
      resetRefreshState();

      globalThis.fetch = async (url) => {
        const urlStr = String(url);

        if (urlStr.includes('/users/refresh')) {
          return mockJsonResponse(status, {
            success: false,
            error: { code, message: `Definitive error: ${code}` },
          });
        }

        if (urlStr.includes('/protected-data')) {
          return mockJsonResponse(401, {
            success: false,
            error: { code: 'AUTH_TOKEN_EXPIRED', message: 'Auth token expired' },
          });
        }

        throw new Error(`Unhandled URL: ${urlStr}`);
      };

      await assert.rejects(
        async () => apiClient.get('/protected-data'),
        (err) => {
          assert.strictEqual(err.code, code);
          return true;
        }
      );

      assert.strictEqual(
        dispatchedEvents.length,
        1,
        `Expected session-expired event for definitive failure ${code}`
      );
      assert.strictEqual(dispatchedEvents[0].detail.code, code);
    }
  });

  it('7. does NOT clear session or emit session-expired on transient errors (429, 500, network error)', async () => {
    // 7a. Rate limit (429) on refresh
    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('/users/refresh')) {
        return mockJsonResponse(429, {
          success: false,
          error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many refresh requests' },
        });
      }
      return mockJsonResponse(401, {
        success: false,
        error: { code: 'AUTH_TOKEN_EXPIRED', message: 'Token expired' },
      });
    };

    await assert.rejects(
      async () => apiClient.get('/test-429'),
      (err) => err.status === 429 && err.code === 'RATE_LIMIT_EXCEEDED'
    );
    assert.strictEqual(dispatchedEvents.length, 0, '429 on refresh must NOT emit session-expired');

    // 7b. Server error (500) on refresh
    resetRefreshState();
    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('/users/refresh')) {
        return mockJsonResponse(500, {
          success: false,
          error: { code: 'REFRESH_DATABASE_ERROR', message: 'Database connection failed' },
        });
      }
      return mockJsonResponse(401, {
        success: false,
        error: { code: 'AUTH_TOKEN_EXPIRED', message: 'Token expired' },
      });
    };

    await assert.rejects(
      async () => apiClient.get('/test-500'),
      (err) => err.status === 500 && err.code === 'REFRESH_DATABASE_ERROR'
    );
    assert.strictEqual(dispatchedEvents.length, 0, '500 on refresh must NOT emit session-expired');

    // 7c. Network disconnection on refresh
    resetRefreshState();
    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('/users/refresh')) {
        throw new TypeError('Failed to fetch');
      }
      return mockJsonResponse(401, {
        success: false,
        error: { code: 'AUTH_TOKEN_EXPIRED', message: 'Token expired' },
      });
    };

    await assert.rejects(
      async () => apiClient.get('/test-net'),
      (err) => err.code === 'NETWORK_ERROR'
    );
    assert.strictEqual(dispatchedEvents.length, 0, 'Network failure on refresh must NOT emit session-expired');
  });

  it('8. transmits required credentials: include and X-CommerceFlow-Client: web headers', async () => {
    let refreshOptionsCaptured = null;

    globalThis.fetch = async (url, opts) => {
      const urlStr = String(url);

      if (urlStr.includes('/users/refresh')) {
        refreshOptionsCaptured = opts;
        return mockJsonResponse(200, {
          success: true,
          data: { user: { id: 'u1' } },
        });
      }

      if (urlStr.includes('/header-test')) {
        if (!refreshOptionsCaptured) {
          return mockJsonResponse(401, {
            success: false,
            error: { code: 'AUTH_TOKEN_EXPIRED', message: 'Token expired' },
          });
        }
        return mockJsonResponse(200, { success: true });
      }

      throw new Error(`Unhandled URL: ${urlStr}`);
    };

    await apiClient.get('/header-test');

    assert.ok(refreshOptionsCaptured, 'Refresh request must have been dispatched');
    assert.strictEqual(refreshOptionsCaptured.method, 'POST');
    assert.strictEqual(
      refreshOptionsCaptured.credentials,
      'include',
      'Refresh must include credentials for HttpOnly cookie transmission'
    );

    const headers = refreshOptionsCaptured.headers;
    const clientHeader = headers['X-CommerceFlow-Client'] || headers['x-commerceflow-client'];
    assert.strictEqual(
      clientHeader,
      'web',
      'Refresh request must include X-CommerceFlow-Client: web header for CSRF protection'
    );
    const contentType = headers['Content-Type'] || headers['content-type'];
    assert.strictEqual(contentType, 'application/json');
  });

  it('9. coordinates cross-tab refresh via navigator.locks and peer timestamp check [Unit-test simulation — not real-browser environment]', async () => {
    let refreshCalls = 0;
    let endpointCalls = 0;
    let lockAcquired = false;

    // Simulate Web Locks API safely on globalThis.navigator
    const hadLocks = 'locks' in globalThis.navigator;
    const originalLocks = Object.getOwnPropertyDescriptor(globalThis.navigator, 'locks');

    Object.defineProperty(globalThis.navigator, 'locks', {
      value: {
        request: async (name, callback) => {
          assert.strictEqual(name, 'commerceflow_auth_refresh');
          lockAcquired = true;
          return callback();
        },
      },
      configurable: true,
      writable: true,
    });

    try {
      const initialFailTime = Date.now();

      globalThis.fetch = async (url) => {
        const urlStr = String(url);

        if (urlStr.includes('/users/refresh')) {
          refreshCalls += 1;
          return mockJsonResponse(200, { success: true, data: { user: { id: 'u1' } } });
        }

        if (urlStr.includes('/cross-tab-resource')) {
          endpointCalls += 1;
          if (endpointCalls === 1) {
            // While this tab's request failed, simulate another tab completing refresh right after
            setStoredRefreshTimestamp(initialFailTime + 50);
            return mockJsonResponse(401, {
              success: false,
              error: { code: 'AUTH_TOKEN_EXPIRED', message: 'Expired' },
            });
          }
          return mockJsonResponse(200, { success: true, data: { sync: 'confirmed' } });
        }

        throw new Error(`Unhandled URL: ${urlStr}`);
      };

      const result = await apiClient.get('/cross-tab-resource');

      assert.strictEqual(lockAcquired, true, 'Must acquire commerceflow_auth_refresh lock');
      assert.strictEqual(
        refreshCalls,
        0,
        'Must skip /users/refresh network call because peer tab already refreshed'
      );
      assert.strictEqual(endpointCalls, 2, 'Initial call + retry with new cookies');
      assert.deepStrictEqual(result, { success: true, data: { sync: 'confirmed' } });
    } finally {
      if (hadLocks && originalLocks) {
        Object.defineProperty(globalThis.navigator, 'locks', originalLocks);
      } else {
        delete globalThis.navigator.locks;
      }
    }
  });

  it('10. does NOT log out on arbitrary 403 or 429 on non-refresh endpoints', async () => {
    // Arbitrary 403 Forbidden on general endpoint (e.g. insufficient privileges)
    globalThis.fetch = async () => {
      return mockJsonResponse(403, {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied to this resource' },
      });
    };

    await assert.rejects(
      async () => apiClient.get('/admin/restricted'),
      (err) => err.status === 403 && err.code === 'FORBIDDEN'
    );
    assert.strictEqual(
      dispatchedEvents.length,
      0,
      'Arbitrary 403 on protected endpoint must NOT log out user'
    );

    // Arbitrary 429 on storefront endpoint
    globalThis.fetch = async () => {
      return mockJsonResponse(429, {
        success: false,
        error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests' },
      });
    };

    await assert.rejects(
      async () => apiClient.get('/public/catalog'),
      (err) => err.status === 429 && err.code === 'RATE_LIMIT_EXCEEDED'
    );
    assert.strictEqual(
      dispatchedEvents.length,
      0,
      '429 on general endpoint must NOT log out user'
    );
  });

  it('11. does NOT refresh on non-refreshable 401 error codes (AUTH_TOKEN_REVOKED, ACCOUNT_DEACTIVATED)', async () => {
    let refreshCalls = 0;

    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('/users/refresh')) {
        refreshCalls += 1;
        return mockJsonResponse(200, { success: true });
      }
      return mockJsonResponse(401, {
        success: false,
        error: { code: 'ACCOUNT_DEACTIVATED', message: 'User account is deactivated' },
      });
    };

    await assert.rejects(
      async () => apiClient.get('/orders/mine'),
      (err) => err.status === 401 && err.code === 'ACCOUNT_DEACTIVATED'
    );

    assert.strictEqual(refreshCalls, 0, 'Must NOT attempt refresh on ACCOUNT_DEACTIVATED');
    assert.strictEqual(dispatchedEvents.length, 1, 'Must dispatch session-expired for deactivated account');
    assert.strictEqual(dispatchedEvents[0].detail.code, 'ACCOUNT_DEACTIVATED');
  });

  it('12. never stores authentication tokens or secrets in browser storage', async () => {
    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('/users/refresh')) {
        return mockJsonResponse(200, {
          success: true,
          data: {
            user: { id: 'u1', name: 'Secure User' },
          },
        });
      }
      if (urlStr.includes('/test-storage')) {
        return mockJsonResponse(401, {
          success: false,
          error: { code: 'AUTH_TOKEN_EXPIRED', message: 'Expired' },
        });
      }
      return mockJsonResponse(200, { success: true });
    };

    try {
      await apiClient.get('/test-storage');
    } catch {
      // Ignore retry outcome
    }

    // Inspect all keys stored in mock localStorage
    for (const [key, value] of mockStorage.entries()) {
      assert.strictEqual(
        key,
        'commerceflow_auth_last_refresh',
        `Unexpected key found in localStorage: "${key}"`
      );
      assert.ok(
        /^\d+$/.test(value),
        `Stored refresh timestamp must be a pure numeric epoch string, got: "${value}"`
      );
    }
  });
});

describe('apiClient — Mutation CSRF Client-Identification Header', () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;

  let mockWin;
  let dispatchedEvents;
  let mockStorage;

  beforeEach(() => {
    resetRateLimitCooldown();
    clearInFlightRequests();
    resetRefreshState();

    const setup = setupMockWindow();
    mockWin = setup.mockWindow;
    dispatchedEvents = setup.events;
    mockStorage = setup.mockStorage;
    globalThis.window = mockWin;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
    resetRateLimitCooldown();
    clearInFlightRequests();
    resetRefreshState();
  });

  it('1. apiClient.post transmits X-CommerceFlow-Client: web header by default', async () => {
    let capturedOptions = null;
    globalThis.fetch = async (url, opts) => {
      capturedOptions = opts;
      return mockJsonResponse(200, { success: true, data: { id: 1 } });
    };

    await apiClient.post('/orders', { items: [{ productId: 'p1', quantity: 1 }] });

    assert.ok(capturedOptions, 'Fetch must be called');
    assert.strictEqual(capturedOptions.method, 'POST');
    assert.strictEqual(
      capturedOptions.headers['X-CommerceFlow-Client'],
      'web',
      'POST must include X-CommerceFlow-Client: web header'
    );
    assert.strictEqual(
      capturedOptions.headers['Content-Type'],
      'application/json',
      'JSON body must have Content-Type header'
    );
  });

  it('2. apiClient.put transmits X-CommerceFlow-Client: web header by default', async () => {
    let capturedOptions = null;
    globalThis.fetch = async (url, opts) => {
      capturedOptions = opts;
      return mockJsonResponse(200, { success: true });
    };

    await apiClient.put('/cart/items/p1', { quantity: 2 });

    assert.ok(capturedOptions, 'Fetch must be called');
    assert.strictEqual(capturedOptions.method, 'PUT');
    assert.strictEqual(
      capturedOptions.headers['X-CommerceFlow-Client'],
      'web',
      'PUT must include X-CommerceFlow-Client: web header'
    );
  });

  it('3. apiClient.patch transmits X-CommerceFlow-Client: web header by default', async () => {
    let capturedOptions = null;
    globalThis.fetch = async (url, opts) => {
      capturedOptions = opts;
      return mockJsonResponse(200, { success: true });
    };

    await apiClient.patch('/users/me/password', {
      currentPassword: 'oldPassword123',
      newPassword: 'newPassword123',
    });

    assert.ok(capturedOptions, 'Fetch must be called');
    assert.strictEqual(capturedOptions.method, 'PATCH');
    assert.strictEqual(
      capturedOptions.headers['X-CommerceFlow-Client'],
      'web',
      'PATCH must include X-CommerceFlow-Client: web header'
    );
  });

  it('4. apiClient.delete and apiClient.del transmit X-CommerceFlow-Client: web header by default', async () => {
    let capturedOptions = null;
    globalThis.fetch = async (url, opts) => {
      capturedOptions = opts;
      return mockJsonResponse(200, { success: true });
    };

    await apiClient.delete('/cart/items/p1');
    assert.strictEqual(capturedOptions.method, 'DELETE');
    assert.strictEqual(
      capturedOptions.headers['X-CommerceFlow-Client'],
      'web',
      'DELETE must include X-CommerceFlow-Client: web header'
    );

    capturedOptions = null;
    await apiClient.del('/cart');
    assert.strictEqual(capturedOptions.method, 'DELETE');
    assert.strictEqual(
      capturedOptions.headers['X-CommerceFlow-Client'],
      'web',
      'del alias must include X-CommerceFlow-Client: web header'
    );
  });

  it('5. safe methods (GET) do NOT include X-CommerceFlow-Client header by default', async () => {
    let capturedOptions = null;
    globalThis.fetch = async (url, opts) => {
      capturedOptions = opts;
      return mockJsonResponse(200, { success: true, data: [] });
    };

    await apiClient.get('/products');

    assert.ok(capturedOptions, 'Fetch must be called');
    assert.strictEqual(capturedOptions.method, 'GET');
    assert.strictEqual(
      capturedOptions.headers['X-CommerceFlow-Client'],
      undefined,
      'GET must not include X-CommerceFlow-Client header by default'
    );
    assert.strictEqual(
      capturedOptions.headers['x-commerceflow-client'],
      undefined,
      'GET must not include lowercase x-commerceflow-client header by default'
    );
  });

  it('6. safe methods with HEAD method do NOT include X-CommerceFlow-Client header', async () => {
    let capturedOptions = null;
    globalThis.fetch = async (url, opts) => {
      capturedOptions = opts;
      return mockJsonResponse(200, null);
    };

    await apiClient.request('/health', { method: 'HEAD' });

    assert.ok(capturedOptions, 'Fetch must be called');
    assert.strictEqual(capturedOptions.method, 'HEAD');
    assert.strictEqual(
      capturedOptions.headers['X-CommerceFlow-Client'],
      undefined,
      'HEAD must not include X-CommerceFlow-Client header'
    );
  });

  it('7. preserves caller-supplied X-CommerceFlow-Client header and does not overwrite it', async () => {
    let capturedOptions = null;
    globalThis.fetch = async (url, opts) => {
      capturedOptions = opts;
      return mockJsonResponse(200, { success: true });
    };

    await apiClient.post(
      '/custom',
      { data: 123 },
      { headers: { 'X-CommerceFlow-Client': 'custom-agent-v1' } }
    );

    assert.strictEqual(
      capturedOptions.headers['X-CommerceFlow-Client'],
      'custom-agent-v1',
      'Caller-supplied X-CommerceFlow-Client must be preserved'
    );
  });

  it('8. preserves caller-supplied lowercase x-commerceflow-client header', async () => {
    let capturedOptions = null;
    globalThis.fetch = async (url, opts) => {
      capturedOptions = opts;
      return mockJsonResponse(200, { success: true });
    };

    await apiClient.post(
      '/custom-lower',
      { data: 123 },
      { headers: { 'x-commerceflow-client': 'partner-cli' } }
    );

    assert.strictEqual(
      capturedOptions.headers['x-commerceflow-client'],
      'partner-cli',
      'Caller-supplied lowercase header must be preserved'
    );
    assert.strictEqual(
      capturedOptions.headers['X-CommerceFlow-Client'],
      undefined,
      'Should not duplicate header with different casing'
    );
  });

  it('9. preserves caller-supplied custom headers and explicit Authorization Bearer token', async () => {
    let capturedOptions = null;
    globalThis.fetch = async (url, opts) => {
      capturedOptions = opts;
      return mockJsonResponse(200, { success: true });
    };

    await apiClient.patch(
      '/users/me',
      { name: 'New Name' },
      {
        token: 'explicit-jwt-token-123',
        headers: {
          'X-Request-Correlation-ID': 'corr-abc-123',
          'X-Custom-Trace': 'trace-xyz',
        },
      }
    );

    assert.strictEqual(capturedOptions.headers['X-CommerceFlow-Client'], 'web');
    assert.strictEqual(capturedOptions.headers['Authorization'], 'Bearer explicit-jwt-token-123');
    assert.strictEqual(capturedOptions.headers['X-Request-Correlation-ID'], 'corr-abc-123');
    assert.strictEqual(capturedOptions.headers['X-Custom-Trace'], 'trace-xyz');
  });

  it('10. mutations with empty or null body still include X-CommerceFlow-Client: web', async () => {
    let postOptions = null;
    let deleteOptions = null;

    globalThis.fetch = async (url, opts) => {
      if (opts.method === 'POST') postOptions = opts;
      if (opts.method === 'DELETE') deleteOptions = opts;
      return mockJsonResponse(200, { success: true });
    };

    // Body-less POST (e.g. logout-all)
    await apiClient.post('/users/logout-all');
    assert.strictEqual(postOptions.method, 'POST');
    assert.strictEqual(
      postOptions.headers['X-CommerceFlow-Client'],
      'web',
      'Body-less POST must still include X-CommerceFlow-Client: web'
    );

    // Body-less DELETE (e.g. clear cart)
    await apiClient.delete('/cart');
    assert.strictEqual(deleteOptions.method, 'DELETE');
    assert.strictEqual(
      deleteOptions.headers['X-CommerceFlow-Client'],
      'web',
      'Body-less DELETE must still include X-CommerceFlow-Client: web'
    );
  });

  it('11. retried mutation after transparent 401 session refresh preserves X-CommerceFlow-Client: web', async () => {
    let refreshCalls = 0;
    let mutationCalls = 0;
    let retriedHeaders = null;

    globalThis.fetch = async (url, opts) => {
      const urlStr = String(url);

      if (urlStr.includes('/users/refresh')) {
        refreshCalls += 1;
        assert.strictEqual(
          opts.headers['X-CommerceFlow-Client'],
          'web',
          'Refresh request must include client header'
        );
        return mockJsonResponse(200, { success: true, data: { user: { id: 'u1' } } });
      }

      if (urlStr.includes('/orders')) {
        mutationCalls += 1;
        if (mutationCalls === 1) {
          // First attempt fails with expired token
          return mockJsonResponse(401, {
            success: false,
            error: { code: 'AUTH_TOKEN_EXPIRED', message: 'Token expired' },
          });
        }
        // Second attempt (retry)
        retriedHeaders = opts.headers;
        return mockJsonResponse(200, { success: true, data: { orderId: 'ord-123' } });
      }

      throw new Error(`Unhandled URL: ${urlStr}`);
    };

    const res = await apiClient.post('/orders', { items: [] });

    assert.strictEqual(refreshCalls, 1, 'Refresh must be executed once');
    assert.strictEqual(mutationCalls, 2, 'Mutation must be executed twice (initial + retry)');
    assert.ok(retriedHeaders, 'Retried headers must be captured');
    assert.strictEqual(
      retriedHeaders['X-CommerceFlow-Client'],
      'web',
      'Retried mutation must preserve X-CommerceFlow-Client: web'
    );
    assert.deepStrictEqual(res, { success: true, data: { orderId: 'ord-123' } });
  });
});

