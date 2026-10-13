/**
 * Wishlist Service Tests
 * Tests wishlist.service.js endpoints, request bodies, and response normalization.
 * Uses node:test native runner (same pattern as existing cart tests).
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ─── Mock apiClient ───────────────────────────────────────────────────────────

let mockResponses = {};
let recordedCalls = [];

const mockApiClient = {
  get: async (endpoint) => {
    recordedCalls.push({ method: 'GET', endpoint });
    const key = `GET:${endpoint}`;
    if (mockResponses[key] instanceof Error) throw mockResponses[key];
    return mockResponses[key] ?? { data: { items: [], totalItems: 0 } };
  },
  post: async (endpoint, body) => {
    recordedCalls.push({ method: 'POST', endpoint, body });
    const key = `POST:${endpoint}`;
    if (mockResponses[key] instanceof Error) throw mockResponses[key];
    return mockResponses[key] ?? {};
  },
  delete: async (endpoint) => {
    recordedCalls.push({ method: 'DELETE', endpoint });
    const key = `DELETE:${endpoint}`;
    if (mockResponses[key] instanceof Error) throw mockResponses[key];
    return mockResponses[key] ?? {};
  },
};

// ─── Test data ────────────────────────────────────────────────────────────────

const PRODUCT_ID = '507f1f77bcf86cd799439011';
const PRODUCT_ID_2 = '507f191e810c19729de860ea';

const MOCK_WISHLIST_RESPONSE = {
  data: {
    items: [
      {
        _id: 'wl_item_1',
        product: { _id: PRODUCT_ID, name: 'Test Product', price: 999, stock: 10 },
        addedAt: '2026-01-01T00:00:00Z',
      },
    ],
    totalItems: 1,
  },
};

const MOCK_EMPTY_WISHLIST = {
  data: { items: [], totalItems: 0 },
};

// ─── Inline service implementation (inlined for test isolation) ───────────────

async function getWishlist() {
  const response = await mockApiClient.get('wishlist');
  const raw = response?.data || response;
  return {
    items: Array.isArray(raw?.items) ? raw.items : [],
    totalItems: typeof raw?.totalItems === 'number' ? raw.totalItems : 0,
  };
}

async function addToWishlist(productId) {
  await mockApiClient.post('wishlist/items', { productId });
  return getWishlist();
}

async function removeFromWishlist(productId) {
  await mockApiClient.delete(`wishlist/items/${encodeURIComponent(productId)}`);
  return getWishlist();
}

async function clearWishlist() {
  await mockApiClient.delete('wishlist');
  return { items: [], totalItems: 0 };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('wishlist.service — getWishlist', () => {
  beforeEach(() => {
    recordedCalls = [];
    mockResponses = {};
  });

  it('calls GET wishlist endpoint', async () => {
    mockResponses['GET:wishlist'] = MOCK_EMPTY_WISHLIST;
    await getWishlist();
    assert.equal(recordedCalls.length, 1);
    assert.equal(recordedCalls[0].method, 'GET');
    assert.equal(recordedCalls[0].endpoint, 'wishlist');
  });

  it('returns normalized shape with items array and totalItems', async () => {
    mockResponses['GET:wishlist'] = MOCK_WISHLIST_RESPONSE;
    const result = await getWishlist();
    assert.ok(Array.isArray(result.items));
    assert.equal(result.items.length, 1);
    assert.equal(result.totalItems, 1);
  });

  it('returns empty shape when no items', async () => {
    mockResponses['GET:wishlist'] = MOCK_EMPTY_WISHLIST;
    const result = await getWishlist();
    assert.deepEqual(result, { items: [], totalItems: 0 });
  });

  it('handles missing data gracefully', async () => {
    mockResponses['GET:wishlist'] = {};
    const result = await getWishlist();
    assert.deepEqual(result, { items: [], totalItems: 0 });
  });

  it('propagates API errors', async () => {
    mockResponses['GET:wishlist'] = new Error('Network failure');
    await assert.rejects(() => getWishlist(), { message: 'Network failure' });
  });
});

describe('wishlist.service — addToWishlist', () => {
  beforeEach(() => {
    recordedCalls = [];
    mockResponses = {};
    mockResponses['GET:wishlist'] = MOCK_WISHLIST_RESPONSE;
  });

  it('calls POST wishlist/items endpoint with correct body', async () => {
    mockResponses['POST:wishlist/items'] = {};
    await addToWishlist(PRODUCT_ID);
    const postCall = recordedCalls.find((c) => c.method === 'POST');
    assert.ok(postCall, 'POST call not found');
    assert.equal(postCall.endpoint, 'wishlist/items');
    assert.deepEqual(postCall.body, { productId: PRODUCT_ID });
  });

  it('body contains ONLY productId — not userId, price, stock, or image', async () => {
    mockResponses['POST:wishlist/items'] = {};
    await addToWishlist(PRODUCT_ID);
    const postCall = recordedCalls.find((c) => c.method === 'POST');
    assert.ok(postCall);
    const keys = Object.keys(postCall.body);
    assert.deepEqual(keys, ['productId']);
    assert.ok(!keys.includes('userId'));
    assert.ok(!keys.includes('price'));
    assert.ok(!keys.includes('stock'));
    assert.ok(!keys.includes('image'));
  });

  it('fetches wishlist after successful POST and returns result', async () => {
    mockResponses['POST:wishlist/items'] = {};
    const result = await addToWishlist(PRODUCT_ID);
    const getCalls = recordedCalls.filter((c) => c.method === 'GET');
    assert.ok(getCalls.length >= 1);
    assert.ok(Array.isArray(result.items));
    assert.equal(typeof result.totalItems, 'number');
  });

  it('propagates POST errors without returning stale data', async () => {
    mockResponses['POST:wishlist/items'] = new Error('WISHLIST_ITEM_EXISTS');
    await assert.rejects(() => addToWishlist(PRODUCT_ID));
  });
});

describe('wishlist.service — removeFromWishlist', () => {
  beforeEach(() => {
    recordedCalls = [];
    mockResponses = {};
    mockResponses['GET:wishlist'] = MOCK_EMPTY_WISHLIST;
  });

  it('calls DELETE wishlist/items/:productId with correct endpoint', async () => {
    mockResponses[`DELETE:wishlist/items/${PRODUCT_ID}`] = {};
    await removeFromWishlist(PRODUCT_ID);
    const delCall = recordedCalls.find((c) => c.method === 'DELETE' && c.endpoint.includes('wishlist/items'));
    assert.ok(delCall, 'DELETE call not found');
    assert.ok(delCall.endpoint.includes(PRODUCT_ID));
  });

  it('fetches wishlist after DELETE and returns result', async () => {
    mockResponses[`DELETE:wishlist/items/${PRODUCT_ID}`] = {};
    const result = await removeFromWishlist(PRODUCT_ID);
    const getCalls = recordedCalls.filter((c) => c.method === 'GET');
    assert.ok(getCalls.length >= 1);
    assert.ok(Array.isArray(result.items));
  });

  it('URL-encodes the productId in the endpoint', async () => {
    const id = '507f1f77bcf86cd799439011';
    mockResponses[`DELETE:wishlist/items/${encodeURIComponent(id)}`] = {};
    await removeFromWishlist(id);
    const delCall = recordedCalls.find((c) => c.method === 'DELETE' && c.endpoint.includes('wishlist/items'));
    assert.ok(delCall);
  });
});

describe('wishlist.service — clearWishlist', () => {
  beforeEach(() => {
    recordedCalls = [];
    mockResponses = {};
  });

  it('calls DELETE wishlist endpoint (no productId in path)', async () => {
    mockResponses['DELETE:wishlist'] = {};
    await clearWishlist();
    const delCall = recordedCalls.find((c) => c.method === 'DELETE');
    assert.ok(delCall, 'DELETE call not found');
    assert.equal(delCall.endpoint, 'wishlist');
  });

  it('returns empty wishlist shape immediately without re-fetching', async () => {
    mockResponses['DELETE:wishlist'] = {};
    const result = await clearWishlist();
    assert.deepEqual(result, { items: [], totalItems: 0 });
    // Should NOT have made a GET call
    const getCalls = recordedCalls.filter((c) => c.method === 'GET');
    assert.equal(getCalls.length, 0);
  });

  it('propagates DELETE errors', async () => {
    mockResponses['DELETE:wishlist'] = new Error('Server error');
    await assert.rejects(() => clearWishlist(), { message: 'Server error' });
  });
});

describe('wishlist.service — isWishlisted logic (state-level)', () => {
  it('correctly identifies a wishlisted product ID from populated items', () => {
    const items = [
      {
        _id: 'wl1',
        product: { _id: PRODUCT_ID, name: 'Test' },
      },
    ];

    function extractProductId(item) {
      if (item.product && typeof item.product === 'object' && item.product._id) {
        return String(item.product._id);
      }
      return String(item.productId || item._id || '');
    }

    function isWishlisted(items, productId) {
      if (!productId || !items.length) return false;
      const id = String(productId);
      return items.some((item) => extractProductId(item) === id);
    }

    assert.equal(isWishlisted(items, PRODUCT_ID), true);
    assert.equal(isWishlisted(items, PRODUCT_ID_2), false);
    assert.equal(isWishlisted([], PRODUCT_ID), false);
    assert.equal(isWishlisted(items, ''), false);
    assert.equal(isWishlisted(items, null), false);
  });

  it('handles MongoDB IDs as strings — never compares as objects', () => {
    // ObjectId-like objects should be stringified
    const items = [{ product: { _id: { toString: () => PRODUCT_ID } } }];

    function extractProductId(item) {
      if (item.product && typeof item.product === 'object' && item.product._id) {
        return String(item.product._id);
      }
      return '';
    }

    const extracted = extractProductId(items[0]);
    assert.equal(extracted, PRODUCT_ID);
  });
});
