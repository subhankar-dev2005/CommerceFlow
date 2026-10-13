/* global Headers, DOMException */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  apiClient,
  ApiError,
  getRateLimitCooldown,
  resetRateLimitCooldown,
  clearInFlightRequests,
} from './apiClient.js';

describe('apiClient — In-Flight Deduplication and Rate-Limit Cooldown', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    resetRateLimitCooldown();
    clearInFlightRequests();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    resetRateLimitCooldown();
    clearInFlightRequests();
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

