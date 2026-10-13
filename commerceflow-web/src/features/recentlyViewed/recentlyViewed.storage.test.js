import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  GUEST_RECENTLY_VIEWED_KEY,
  MAX_GUEST_RECENTLY_VIEWED,
  isValidProductId,
  getGuestRecentlyViewed,
  addGuestRecentlyViewed,
  clearGuestRecentlyViewed
} from './recentlyViewed.storage.js';

class MockStorage {
  constructor() {
    this.store = new Map();
    this.throwOnGet = false;
    this.throwOnSet = false;
    this.throwOnRemove = false;
  }

  getItem(key) {
    if (this.throwOnGet) {
      throw new Error('SecurityError: Access to localStorage is denied');
    }
    return this.store.has(key) ? this.store.get(key) : null;
  }

  setItem(key, value) {
    if (this.throwOnSet) {
      throw new Error('QuotaExceededError: Storage quota exceeded');
    }
    this.store.set(key, String(value));
  }

  removeItem(key) {
    if (this.throwOnRemove) {
      throw new Error('StorageError: Removal failed');
    }
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }

  get length() {
    return this.store.size;
  }
}

describe('recentlyViewed.storage', () => {
  let mockStorage;
  let originalLocalStorage;

  beforeEach(() => {
    mockStorage = new MockStorage();
    originalLocalStorage = globalThis.localStorage;
    globalThis.localStorage = mockStorage;
    if (typeof window !== 'undefined') {
      window.localStorage = mockStorage;
    }
  });

  afterEach(() => {
    globalThis.localStorage = originalLocalStorage;
    if (typeof window !== 'undefined') {
      window.localStorage = originalLocalStorage;
    }
  });

  describe('isValidProductId', () => {
    it('accepts valid 24-character hex strings', () => {
      assert.strictEqual(isValidProductId('507f1f77bcf86cd799439011'), true);
      assert.strictEqual(isValidProductId('607f1f77bcf86cd799439021'), true);
      assert.strictEqual(isValidProductId('0123456789abcdef01234567'), true);
    });

    it('rejects malformed or non-string inputs', () => {
      assert.strictEqual(isValidProductId(''), false);
      assert.strictEqual(isValidProductId('invalid-id'), false);
      assert.strictEqual(isValidProductId('507f1f77bcf86cd79943901'), false); // 23 chars
      assert.strictEqual(isValidProductId('507f1f77bcf86cd7994390111'), false); // 25 chars
      assert.strictEqual(isValidProductId('507f1f77bcf86cd79943901z'), false); // non-hex
      assert.strictEqual(isValidProductId(null), false);
      assert.strictEqual(isValidProductId(undefined), false);
      assert.strictEqual(isValidProductId(12345), false);
      assert.strictEqual(isValidProductId({}), false);
    });
  });

  describe('getGuestRecentlyViewed', () => {
    it('returns empty array when storage is empty', () => {
      const items = getGuestRecentlyViewed();
      assert.deepStrictEqual(items, []);
    });

    it('returns stored valid product IDs in original order', () => {
      const id1 = '507f1f77bcf86cd799439011';
      const id2 = '607f1f77bcf86cd799439021';
      mockStorage.setItem(GUEST_RECENTLY_VIEWED_KEY, JSON.stringify([id1, id2]));

      const items = getGuestRecentlyViewed();
      assert.deepStrictEqual(items, [id1, id2]);
    });

    it('self-heals and returns [] when stored JSON is malformed', () => {
      mockStorage.setItem(GUEST_RECENTLY_VIEWED_KEY, '{ invalid json');
      const items = getGuestRecentlyViewed();
      assert.deepStrictEqual(items, []);
      assert.strictEqual(mockStorage.getItem(GUEST_RECENTLY_VIEWED_KEY), null);
    });

    it('self-heals and returns [] when stored data is an object instead of array', () => {
      mockStorage.setItem(GUEST_RECENTLY_VIEWED_KEY, JSON.stringify({ productId: '507f1f77bcf86cd799439011' }));
      const items = getGuestRecentlyViewed();
      assert.deepStrictEqual(items, []);
      assert.strictEqual(mockStorage.getItem(GUEST_RECENTLY_VIEWED_KEY), null);
    });

    it('filters out invalid IDs from stored array and persists cleaned array', () => {
      const validId = '507f1f77bcf86cd799439011';
      mockStorage.setItem(GUEST_RECENTLY_VIEWED_KEY, JSON.stringify([validId, 'invalid-id', null, 123]));

      const items = getGuestRecentlyViewed();
      assert.deepStrictEqual(items, [validId]);
      assert.deepStrictEqual(JSON.parse(mockStorage.getItem(GUEST_RECENTLY_VIEWED_KEY)), [validId]);
    });

    it('returns empty array and does not throw when localStorage access fails', () => {
      mockStorage.throwOnGet = true;
      const items = getGuestRecentlyViewed();
      assert.deepStrictEqual(items, []);
    });
  });

  describe('addGuestRecentlyViewed', () => {
    it('prepends product ID to empty storage', () => {
      const id = '507f1f77bcf86cd799439011';
      const result = addGuestRecentlyViewed(id);

      assert.deepStrictEqual(result, [id]);
      assert.deepStrictEqual(JSON.parse(mockStorage.getItem(GUEST_RECENTLY_VIEWED_KEY)), [id]);
    });

    it('moves existing product ID to index 0 (most recent) without duplicate', () => {
      const id1 = '507f1f77bcf86cd799439011';
      const id2 = '607f1f77bcf86cd799439021';
      const id3 = '707f1f77bcf86cd799439031';

      addGuestRecentlyViewed(id1);
      addGuestRecentlyViewed(id2);
      addGuestRecentlyViewed(id3);
      // Order now: [id3, id2, id1]

      const updated = addGuestRecentlyViewed(id1);
      assert.deepStrictEqual(updated, [id1, id3, id2]);
      assert.strictEqual(updated.length, 3);
    });

    it('caps stored guest history strictly at MAX_GUEST_RECENTLY_VIEWED (12)', () => {
      const ids = Array.from({ length: 15 }, (_, i) => {
        return `507f1f77bcf86cd7994390${String(i).padStart(2, '0')}`;
      });

      ids.forEach((id) => addGuestRecentlyViewed(id));

      const stored = getGuestRecentlyViewed();
      assert.strictEqual(stored.length, MAX_GUEST_RECENTLY_VIEWED);
      // Newest item should be the last one added
      assert.strictEqual(stored[0], ids[14]);
      // Oldest retained item should be index 3
      assert.strictEqual(stored[11], ids[3]);
    });

    it('safely handles quota exceeded errors during write without throwing', () => {
      const id = '507f1f77bcf86cd799439011';
      mockStorage.throwOnSet = true;

      assert.doesNotThrow(() => {
        const result = addGuestRecentlyViewed(id);
        assert.deepStrictEqual(result, [id]);
      });
    });

    it('ignores invalid product ID and preserves existing storage', () => {
      const validId = '507f1f77bcf86cd799439011';
      addGuestRecentlyViewed(validId);

      const result = addGuestRecentlyViewed('not-valid');
      assert.deepStrictEqual(result, [validId]);
    });
  });

  describe('clearGuestRecentlyViewed', () => {
    it('removes storage key and returns empty array', () => {
      const id = '507f1f77bcf86cd799439011';
      addGuestRecentlyViewed(id);
      assert.strictEqual(getGuestRecentlyViewed().length, 1);

      const result = clearGuestRecentlyViewed();
      assert.deepStrictEqual(result, []);
      assert.strictEqual(mockStorage.getItem(GUEST_RECENTLY_VIEWED_KEY), null);
    });

    it('safely handles errors during removal without throwing', () => {
      mockStorage.throwOnRemove = true;
      assert.doesNotThrow(() => {
        const result = clearGuestRecentlyViewed();
        assert.deepStrictEqual(result, []);
      });
    });
  });
});
