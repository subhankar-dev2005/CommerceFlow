/**
 * Unit tests for normalizeOrderFinancials (src/lib/utils.js)
 *
 * Covers P0.5 Step 75.4 requirements:
 *  1. Complete new-order fields — backend values passed through as-is
 *  2. Legacy order fallback — missing fields default to 0, total falls back to subtotal
 *  3. Missing total fallback — total derived from subtotal when absent
 *  4. Missing shipping/tax/discount — each defaults to 0
 *  5. Malformed values — NaN / Infinity / undefined never appear in output
 *  6. Empty/null order arg — produces safe zero defaults
 *
 * Architecture notes:
 *  - normalizeOrderFinancials reads server data only; it NEVER recomputes the total
 *  - When order.total is a valid non-negative finite number, it is returned as-is
 *  - Frontend must not multiply amounts by 100 or override backend authority
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeOrderFinancials, formatPrice } from './utils.js';

// ---------------------------------------------------------------------------
// 1. Complete new-order fields — backend total preserved unchanged
// ---------------------------------------------------------------------------
describe('normalizeOrderFinancials — new order with all fields', () => {
  const order = {
    subtotal: 1000,
    shippingAmount: 100,
    taxAmount: 50,
    discountAmount: 25,
    total: 1125,
  };

  it('reads subtotal from backend', () => {
    assert.strictEqual(normalizeOrderFinancials(order).subtotal, 1000);
  });

  it('reads shippingAmount from backend', () => {
    assert.strictEqual(normalizeOrderFinancials(order).shippingAmount, 100);
  });

  it('reads taxAmount from backend', () => {
    assert.strictEqual(normalizeOrderFinancials(order).taxAmount, 50);
  });

  it('reads discountAmount from backend', () => {
    assert.strictEqual(normalizeOrderFinancials(order).discountAmount, 25);
  });

  it('uses backend total as-is (does NOT recompute from parts)', () => {
    assert.strictEqual(normalizeOrderFinancials(order).total, 1125);
  });
});

// ---------------------------------------------------------------------------
// 2. Legacy order — only subtotal present
// ---------------------------------------------------------------------------
describe('normalizeOrderFinancials — legacy order (subtotal only)', () => {
  const order = { subtotal: 1000 };

  it('subtotal = 1000', () => {
    assert.strictEqual(normalizeOrderFinancials(order).subtotal, 1000);
  });

  it('shippingAmount defaults to 0', () => {
    assert.strictEqual(normalizeOrderFinancials(order).shippingAmount, 0);
  });

  it('taxAmount defaults to 0', () => {
    assert.strictEqual(normalizeOrderFinancials(order).taxAmount, 0);
  });

  it('discountAmount defaults to 0', () => {
    assert.strictEqual(normalizeOrderFinancials(order).discountAmount, 0);
  });

  it('total falls back to subtotal when order.total is absent', () => {
    assert.strictEqual(normalizeOrderFinancials(order).total, 1000);
  });
});

// ---------------------------------------------------------------------------
// 3. Missing total field — total must fall back to subtotal
// ---------------------------------------------------------------------------
describe('normalizeOrderFinancials — missing total field', () => {
  const order = {
    subtotal: 1000,
    shippingAmount: 0,
    taxAmount: 0,
    discountAmount: 0,
  };

  it('total falls back to subtotal', () => {
    assert.strictEqual(normalizeOrderFinancials(order).total, 1000);
  });
});

// ---------------------------------------------------------------------------
// 4. Missing individual optional fields — each defaults to 0 independently
// ---------------------------------------------------------------------------
describe('normalizeOrderFinancials — missing individual optional fields', () => {
  it('missing shippingAmount defaults to 0', () => {
    const fin = normalizeOrderFinancials({ subtotal: 500, total: 500 });
    assert.strictEqual(fin.shippingAmount, 0);
  });

  it('missing taxAmount defaults to 0', () => {
    const fin = normalizeOrderFinancials({ subtotal: 500, total: 500 });
    assert.strictEqual(fin.taxAmount, 0);
  });

  it('missing discountAmount defaults to 0', () => {
    const fin = normalizeOrderFinancials({ subtotal: 500, total: 500 });
    assert.strictEqual(fin.discountAmount, 0);
  });
});

// ---------------------------------------------------------------------------
// 5. Malformed / invalid values — never produce NaN, Infinity, or undefined
// ---------------------------------------------------------------------------
describe('normalizeOrderFinancials — malformed / invalid values', () => {
  const malformedCases = [
    { label: 'null order arg', order: null },
    { label: 'undefined order arg', order: undefined },
    { label: 'empty object', order: {} },
    {
      label: 'string values',
      order: { subtotal: 'abc', shippingAmount: 'xyz', taxAmount: null, discountAmount: undefined, total: 'bad' },
    },
    {
      label: 'NaN values',
      order: { subtotal: NaN, shippingAmount: NaN, taxAmount: NaN, discountAmount: NaN, total: NaN },
    },
    {
      label: 'Infinity total',
      order: { subtotal: 500, total: Infinity },
    },
    {
      label: 'negative total',
      order: { subtotal: 500, total: -10 },
    },
  ];

  for (const { label, order } of malformedCases) {
    it(`${label}: all outputs are finite numbers`, () => {
      const fin = normalizeOrderFinancials(order);
      for (const [key, val] of Object.entries(fin)) {
        assert.ok(
          typeof val === 'number' && isFinite(val) && !isNaN(val),
          `Expected ${key} to be finite number but got ${val} for case: "${label}"`
        );
      }
    });
  }

  it('Infinity total falls back to subtotal', () => {
    const fin = normalizeOrderFinancials({ subtotal: 500, total: Infinity });
    assert.strictEqual(fin.total, 500);
  });

  it('negative total falls back to subtotal', () => {
    const fin = normalizeOrderFinancials({ subtotal: 500, total: -10 });
    assert.strictEqual(fin.total, 500);
  });

  it('NaN total falls back to subtotal', () => {
    const fin = normalizeOrderFinancials({ subtotal: 500, total: NaN });
    assert.strictEqual(fin.total, 500);
  });

  it('null subtotal defaults to 0', () => {
    const fin = normalizeOrderFinancials({ subtotal: null });
    assert.strictEqual(fin.subtotal, 0);
  });
});

// ---------------------------------------------------------------------------
// 6. formatPrice safety — no NaN/undefined in rendered output
// ---------------------------------------------------------------------------
describe('formatPrice — safe output for all normalizeOrderFinancials outputs', () => {
  const adversarialOrders = [
    {},
    { subtotal: 0 },
    { subtotal: 9999, total: 9999 },
    { subtotal: 'bad', total: null },
    null,
    undefined,
  ];

  for (const order of adversarialOrders) {
    it(`formatPrice does not produce NaN/undefined string for: ${JSON.stringify(order)}`, () => {
      const fin = normalizeOrderFinancials(order);
      const rendered = formatPrice(fin.total);
      assert.ok(typeof rendered === 'string', 'formatPrice must return a string');
      assert.ok(!rendered.includes('NaN'), `Must not contain NaN: ${rendered}`);
      assert.ok(!rendered.includes('undefined'), `Must not contain undefined: ${rendered}`);
    });
  }
});

// ---------------------------------------------------------------------------
// 7. Backend total authority — helper reads total, never recomputes it
// ---------------------------------------------------------------------------
describe('normalizeOrderFinancials — backend total authority', () => {
  it('uses backend total even when parts do not arithmetically match', () => {
    // Simulates a server-side coupon applied outside the line-item math.
    // Frontend must NEVER recompute total from parts.
    const order = {
      subtotal: 1000,
      shippingAmount: 0,
      taxAmount: 0,
      discountAmount: 0,
      total: 800,
    };
    assert.strictEqual(normalizeOrderFinancials(order).total, 800);
  });

  it('zero total is valid and is not replaced by subtotal', () => {
    // Fully-discounted order edge case.
    const order = { subtotal: 500, total: 0 };
    assert.strictEqual(normalizeOrderFinancials(order).total, 0);
  });
});
