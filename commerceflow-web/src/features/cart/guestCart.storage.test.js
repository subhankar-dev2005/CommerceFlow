import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  GUEST_CART_STORAGE_KEY,
  getGuestCart,
  setGuestCart,
  clearGuestCart,
  addGuestCartItem,
  updateGuestCartItem,
  removeGuestCartItem,
} from './guestCart.storage.js';

/**
 * In-memory Mock Storage implementing standard Storage interface
 */
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

  key(index) {
    return Array.from(this.store.keys())[index] ?? null;
  }
}

const VALID_ID_1 = '507f1f77bcf86cd799439011';
const VALID_ID_2 = '507f191e810c19729de860ea';
const VALID_ID_3 = '660f5892c90c1a938fe76d20';

describe('guestCart.storage', () => {
  let mockStorage;
  let originalWindow;
  let originalLocalStorage;

  beforeEach(() => {
    mockStorage = new MockStorage();
    originalWindow = globalThis.window;
    originalLocalStorage = globalThis.localStorage;

    globalThis.window = {
      localStorage: mockStorage,
    };
    globalThis.localStorage = mockStorage;
  });

  afterEach(() => {
    globalThis.window = originalWindow;
    globalThis.localStorage = originalLocalStorage;
  });

  describe('Read behavior (getGuestCart)', () => {
    it('1. missing storage key returns []', () => {
      const items = getGuestCart();
      assert.deepStrictEqual(items, []);
    });

    it('2. valid stored cart returns normalized items', () => {
      mockStorage.setItem(
        GUEST_CART_STORAGE_KEY,
        JSON.stringify([
          { productId: VALID_ID_1, quantity: 2 },
          { productId: VALID_ID_2, quantity: 5 },
        ])
      );

      const items = getGuestCart();
      assert.deepStrictEqual(items, [
        { productId: VALID_ID_1, quantity: 2 },
        { productId: VALID_ID_2, quantity: 5 },
      ]);
    });

    it('3. malformed JSON returns [] and clears corrupted storage', () => {
      mockStorage.setItem(GUEST_CART_STORAGE_KEY, '{invalid json');

      const items = getGuestCart();
      assert.deepStrictEqual(items, []);
      // Corrupted storage entry should be cleaned up
      assert.strictEqual(mockStorage.getItem(GUEST_CART_STORAGE_KEY), null);
    });

    it('4. non-array JSON returns [] and clears corrupted storage', () => {
      // Primitive number
      mockStorage.setItem(GUEST_CART_STORAGE_KEY, '42');
      assert.deepStrictEqual(getGuestCart(), []);
      assert.strictEqual(mockStorage.getItem(GUEST_CART_STORAGE_KEY), null);

      // Primitive string
      mockStorage.setItem(GUEST_CART_STORAGE_KEY, '"some string"');
      assert.deepStrictEqual(getGuestCart(), []);
      assert.strictEqual(mockStorage.getItem(GUEST_CART_STORAGE_KEY), null);

      // Primitive boolean
      mockStorage.setItem(GUEST_CART_STORAGE_KEY, 'true');
      assert.deepStrictEqual(getGuestCart(), []);

      // Object instead of array
      mockStorage.setItem(GUEST_CART_STORAGE_KEY, JSON.stringify({ guestCart: [] }));
      assert.deepStrictEqual(getGuestCart(), []);
      assert.strictEqual(mockStorage.getItem(GUEST_CART_STORAGE_KEY), null);
    });

    it('5. invalid product IDs are removed', () => {
      mockStorage.setItem(
        GUEST_CART_STORAGE_KEY,
        JSON.stringify([
          { productId: VALID_ID_1, quantity: 2 },
          { productId: 'not-hex-id-too-short', quantity: 1 },
          { productId: 12345, quantity: 3 },
          { productId: '', quantity: 4 },
          { productId: null, quantity: 1 },
          { productId: '507f1f77bcf86cd7994390zz', quantity: 2 }, // invalid hex char 'z'
          { quantity: 1 }, // missing productId
        ])
      );

      const items = getGuestCart();
      assert.deepStrictEqual(items, [
        { productId: VALID_ID_1, quantity: 2 },
      ]);
    });

    it('6. invalid quantities are removed', () => {
      mockStorage.setItem(
        GUEST_CART_STORAGE_KEY,
        JSON.stringify([
          { productId: VALID_ID_1, quantity: 3 },
          { productId: VALID_ID_2, quantity: 0 }, // non-positive
          { productId: VALID_ID_3, quantity: -2 }, // negative
          { productId: '507f1f77bcf86cd799439012', quantity: 2.5 }, // fractional
          { productId: '507f1f77bcf86cd799439013', quantity: '3' }, // string
          { productId: '507f1f77bcf86cd799439014', quantity: null },
          { productId: '507f1f77bcf86cd799439015', quantity: NaN },
          { productId: '507f1f77bcf86cd799439016' }, // missing quantity
        ])
      );

      const items = getGuestCart();
      assert.deepStrictEqual(items, [
        { productId: VALID_ID_1, quantity: 3 },
      ]);
    });

    it('7. quantities above 99 are normalized (clamped) to 99', () => {
      mockStorage.setItem(
        GUEST_CART_STORAGE_KEY,
        JSON.stringify([
          { productId: VALID_ID_1, quantity: 150 },
          { productId: VALID_ID_2, quantity: 99 },
          { productId: VALID_ID_3, quantity: 1000 },
        ])
      );

      const items = getGuestCart();
      assert.deepStrictEqual(items, [
        { productId: VALID_ID_1, quantity: 99 },
        { productId: VALID_ID_2, quantity: 99 },
        { productId: VALID_ID_3, quantity: 99 },
      ]);
    });

    it('8. duplicate product IDs are normalized so only one item remains', () => {
      mockStorage.setItem(
        GUEST_CART_STORAGE_KEY,
        JSON.stringify([
          { productId: VALID_ID_1, quantity: 2 },
          { productId: VALID_ID_2, quantity: 3 },
          { productId: VALID_ID_1, quantity: 4 },
        ])
      );

      const items = getGuestCart();
      assert.deepStrictEqual(items, [
        { productId: VALID_ID_1, quantity: 6 }, // 2 + 4 = 6
        { productId: VALID_ID_2, quantity: 3 },
      ]);
    });

    it('8b. duplicate product IDs sum is clamped at 99', () => {
      mockStorage.setItem(
        GUEST_CART_STORAGE_KEY,
        JSON.stringify([
          { productId: VALID_ID_1, quantity: 60 },
          { productId: VALID_ID_1, quantity: 60 },
        ])
      );

      const items = getGuestCart();
      assert.deepStrictEqual(items, [
        { productId: VALID_ID_1, quantity: 99 },
      ]);
    });

    it('strips extraneous fields to ensure only productId and quantity are returned', () => {
      mockStorage.setItem(
        GUEST_CART_STORAGE_KEY,
        JSON.stringify([
          {
            productId: VALID_ID_1,
            quantity: 2,
            price: 49.99,
            name: 'Running Shoes',
            stock: 100,
            token: 'secret',
            userId: 'user123',
          },
        ])
      );

      const items = getGuestCart();
      assert.deepStrictEqual(items, [
        { productId: VALID_ID_1, quantity: 2 },
      ]);
      assert.strictEqual(items[0].price, undefined);
      assert.strictEqual(items[0].name, undefined);
      assert.strictEqual(items[0].stock, undefined);
      assert.strictEqual(items[0].token, undefined);
      assert.strictEqual(items[0].userId, undefined);
    });
  });

  describe('Add behavior (addGuestCartItem)', () => {
    it('9. add a new item', () => {
      const items = addGuestCartItem(VALID_ID_1, 3);
      assert.deepStrictEqual(items, [
        { productId: VALID_ID_1, quantity: 3 },
      ]);

      // Check persisted in storage
      const stored = JSON.parse(mockStorage.getItem(GUEST_CART_STORAGE_KEY));
      assert.deepStrictEqual(stored, [
        { productId: VALID_ID_1, quantity: 3 },
      ]);
    });

    it('10. add to an existing item', () => {
      addGuestCartItem(VALID_ID_1, 2);
      const items = addGuestCartItem(VALID_ID_1, 3);

      assert.deepStrictEqual(items, [
        { productId: VALID_ID_1, quantity: 5 },
      ]);
      assert.strictEqual(items.length, 1);
    });

    it('11. additive quantity clamps at 99', () => {
      addGuestCartItem(VALID_ID_1, 90);
      const items = addGuestCartItem(VALID_ID_1, 20);

      assert.deepStrictEqual(items, [
        { productId: VALID_ID_1, quantity: 99 },
      ]);
    });

    it('11b. adding single item with quantity > 99 clamps to 99', () => {
      const items = addGuestCartItem(VALID_ID_1, 150);
      assert.deepStrictEqual(items, [
        { productId: VALID_ID_1, quantity: 99 },
      ]);
    });

    it('12. invalid product ID does not persist', () => {
      addGuestCartItem(VALID_ID_1, 2);
      const res = addGuestCartItem('invalid-id', 5);

      assert.deepStrictEqual(res, [
        { productId: VALID_ID_1, quantity: 2 },
      ]);

      const stored = JSON.parse(mockStorage.getItem(GUEST_CART_STORAGE_KEY));
      assert.deepStrictEqual(stored, [
        { productId: VALID_ID_1, quantity: 2 },
      ]);
    });

    it('13. invalid quantity does not persist', () => {
      addGuestCartItem(VALID_ID_1, 2);

      // quantity 0
      addGuestCartItem(VALID_ID_1, 0);
      // negative quantity
      addGuestCartItem(VALID_ID_1, -3);
      // fractional quantity
      addGuestCartItem(VALID_ID_1, 1.5);
      // string quantity
      addGuestCartItem(VALID_ID_1, '4');
      // NaN quantity
      addGuestCartItem(VALID_ID_1, NaN);
      // non-existent item with invalid quantity
      addGuestCartItem(VALID_ID_2, -1);

      const items = getGuestCart();
      assert.deepStrictEqual(items, [
        { productId: VALID_ID_1, quantity: 2 },
      ]);
    });
  });

  describe('Update behavior (updateGuestCartItem)', () => {
    it('14. update an existing item', () => {
      addGuestCartItem(VALID_ID_1, 2);
      addGuestCartItem(VALID_ID_2, 3);

      const updated = updateGuestCartItem(VALID_ID_1, 8);
      assert.deepStrictEqual(updated, [
        { productId: VALID_ID_1, quantity: 8 },
        { productId: VALID_ID_2, quantity: 3 },
      ]);
    });

    it('14b. updating quantity above 99 clamps to 99', () => {
      addGuestCartItem(VALID_ID_1, 2);
      const updated = updateGuestCartItem(VALID_ID_1, 120);

      assert.deepStrictEqual(updated, [
        { productId: VALID_ID_1, quantity: 99 },
      ]);
    });

    it('15. invalid update does not create an item', () => {
      addGuestCartItem(VALID_ID_1, 2);
      const updated = updateGuestCartItem(VALID_ID_2, 5);

      assert.deepStrictEqual(updated, [
        { productId: VALID_ID_1, quantity: 2 },
      ]);
    });

    it('16. update to an invalid/non-positive quantity removes or safely rejects the item', () => {
      addGuestCartItem(VALID_ID_1, 5);
      addGuestCartItem(VALID_ID_2, 3);

      // Non-positive quantity (0) removes item
      const afterZero = updateGuestCartItem(VALID_ID_1, 0);
      assert.deepStrictEqual(afterZero, [
        { productId: VALID_ID_2, quantity: 3 },
      ]);

      // Negative quantity removes item
      addGuestCartItem(VALID_ID_1, 5);
      const afterNegative = updateGuestCartItem(VALID_ID_1, -1);
      assert.deepStrictEqual(afterNegative, [
        { productId: VALID_ID_2, quantity: 3 },
      ]);

      // Invalid quantity (fractional, NaN, string) safely rejects without removing/modifying
      const afterFractional = updateGuestCartItem(VALID_ID_2, 2.5);
      assert.deepStrictEqual(afterFractional, [
        { productId: VALID_ID_2, quantity: 3 },
      ]);

      const afterNaN = updateGuestCartItem(VALID_ID_2, NaN);
      assert.deepStrictEqual(afterNaN, [
        { productId: VALID_ID_2, quantity: 3 },
      ]);

      const afterString = updateGuestCartItem(VALID_ID_2, '10');
      assert.deepStrictEqual(afterString, [
        { productId: VALID_ID_2, quantity: 3 },
      ]);
    });
  });

  describe('Remove behavior (removeGuestCartItem)', () => {
    it('17. remove an existing item', () => {
      addGuestCartItem(VALID_ID_1, 2);
      addGuestCartItem(VALID_ID_2, 4);

      const remaining = removeGuestCartItem(VALID_ID_1);
      assert.deepStrictEqual(remaining, [
        { productId: VALID_ID_2, quantity: 4 },
      ]);

      const stored = JSON.parse(mockStorage.getItem(GUEST_CART_STORAGE_KEY));
      assert.deepStrictEqual(stored, [
        { productId: VALID_ID_2, quantity: 4 },
      ]);
    });

    it('18. removing a missing item is safe', () => {
      addGuestCartItem(VALID_ID_1, 2);

      const result = removeGuestCartItem(VALID_ID_2);
      assert.deepStrictEqual(result, [
        { productId: VALID_ID_1, quantity: 2 },
      ]);

      // Non-string productId is safe
      const result2 = removeGuestCartItem(12345);
      assert.deepStrictEqual(result2, [
        { productId: VALID_ID_1, quantity: 2 },
      ]);
    });
  });

  describe('Clear behavior (clearGuestCart)', () => {
    it('19. clear removes guest-cart storage', () => {
      addGuestCartItem(VALID_ID_1, 2);
      assert.notStrictEqual(mockStorage.getItem(GUEST_CART_STORAGE_KEY), null);

      const cleared = clearGuestCart();
      assert.deepStrictEqual(cleared, []);
      assert.strictEqual(mockStorage.getItem(GUEST_CART_STORAGE_KEY), null);
    });
  });

  describe('Storage failure behavior', () => {
    it('20. localStorage failures do not crash the application', () => {
      // 1. Storage inaccessible / throws on getItem (e.g. private browsing security error)
      mockStorage.throwOnGet = true;
      assert.doesNotThrow(() => {
        const items = getGuestCart();
        assert.deepStrictEqual(items, []);
      });
      mockStorage.throwOnGet = false;

      // 2. Storage throws on setItem (e.g. quota exceeded)
      mockStorage.throwOnSet = true;
      assert.doesNotThrow(() => {
        const items = setGuestCart([{ productId: VALID_ID_1, quantity: 2 }]);
        assert.deepStrictEqual(items, [{ productId: VALID_ID_1, quantity: 2 }]);
      });
      assert.doesNotThrow(() => {
        addGuestCartItem(VALID_ID_1, 1);
      });
      mockStorage.throwOnSet = false;

      // 3. Storage throws on removeItem
      mockStorage.throwOnRemove = true;
      assert.doesNotThrow(() => {
        clearGuestCart();
      });
      mockStorage.throwOnRemove = false;

      // 4. Entire storage is unavailable (null window/localStorage)
      globalThis.window = undefined;
      globalThis.localStorage = undefined;
      assert.doesNotThrow(() => {
        assert.deepStrictEqual(getGuestCart(), []);
        assert.deepStrictEqual(setGuestCart([{ productId: VALID_ID_1, quantity: 1 }]), [
          { productId: VALID_ID_1, quantity: 1 },
        ]);
        assert.deepStrictEqual(clearGuestCart(), []);
        assert.deepStrictEqual(addGuestCartItem(VALID_ID_1, 1), [
          { productId: VALID_ID_1, quantity: 1 },
        ]);
      });
    });
  });

  describe('Immutability and Isolation', () => {
    it('21. mutating returned array/objects does not poison internal or stored state', () => {
      addGuestCartItem(VALID_ID_1, 2);

      const items1 = getGuestCart();
      // Mutate the returned array
      items1.push({ productId: VALID_ID_2, quantity: 10 });
      // Mutate the returned item object
      items1[0].quantity = 999;
      items1[0].productId = 'tampered';

      // Next read should be completely unaffected
      const items2 = getGuestCart();
      assert.deepStrictEqual(items2, [
        { productId: VALID_ID_1, quantity: 2 },
      ]);
    });

    it('22. mutating input array to setGuestCart does not mutate stored state', () => {
      const input = [{ productId: VALID_ID_1, quantity: 3 }];
      setGuestCart(input);

      // Mutate caller input
      input[0].quantity = 50;
      input.push({ productId: VALID_ID_2, quantity: 5 });

      const stored = getGuestCart();
      assert.deepStrictEqual(stored, [
        { productId: VALID_ID_1, quantity: 3 },
      ]);
    });
  });
});
