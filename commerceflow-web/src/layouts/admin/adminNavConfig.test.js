import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getFilteredNavigation,
  isNavActive,
  isGroupActive,
  ADMIN_NAV_SECTIONS,
} from './adminNavConfig.js';

describe('Admin Navigation Configuration & Role Filtering', () => {
  it('defines all required administrative sections from visual reference', () => {
    const sectionIds = ADMIN_NAV_SECTIONS.map((s) => s.id);
    assert.deepEqual(sectionIds, [
      'main',
      'product-management',
      'order-management',
      'user-management',
      'system',
    ]);
  });

  it('admin role receives all administrative sections and navigation items', () => {
    const nav = getFilteredNavigation('admin');
    const allItemIds = nav.flatMap((s) => s.items.map((i) => i.id));

    // Top-level items matching the visual reference design
    assert.ok(allItemIds.includes('dashboard'));
    assert.ok(allItemIds.includes('products'));
    assert.ok(allItemIds.includes('categories'));
    assert.ok(allItemIds.includes('inventory'));
    assert.ok(allItemIds.includes('variants'));
    assert.ok(allItemIds.includes('brands'));
    assert.ok(allItemIds.includes('orders'));
    assert.ok(allItemIds.includes('returns'));
    assert.ok(allItemIds.includes('customers'));
    assert.ok(allItemIds.includes('vendors'));
    assert.ok(allItemIds.includes('settings'));
    assert.ok(allItemIds.includes('audit-logs'));
    assert.ok(allItemIds.includes('reports'));

    // Duplicate top-level entries are removed to prevent double-active highlights
    assert.ok(!allItemIds.includes('refunds'), 'Duplicate top-level refunds should be removed');
    assert.ok(!allItemIds.includes('administrators'), 'Duplicate top-level administrators should be removed');
    assert.ok(!allItemIds.includes('admin-setup'), 'Duplicate top-level admin-setup should be removed');

    // Submenu entries are preserved
    const allSubItemIds = nav.flatMap((s) => s.items.flatMap((i) => (i.children || []).map((c) => c.id)));
    assert.ok(allSubItemIds.includes('all-products'));
    assert.ok(allSubItemIds.includes('create-product'));
    assert.ok(allSubItemIds.includes('all-orders'));
    assert.ok(allSubItemIds.includes('refunds-sub'));
    assert.ok(allSubItemIds.includes('all-customers'));
    assert.ok(allSubItemIds.includes('admin-users-sub'));
    assert.ok(allSubItemIds.includes('store-settings'));
    assert.ok(allSubItemIds.includes('admin-setup-sub'));
  });

  it('non-admin role is rejected and receives empty navigation', () => {
    assert.strictEqual(getFilteredNavigation('customer').length, 0);
    assert.strictEqual(getFilteredNavigation('').length, 0);
    assert.strictEqual(getFilteredNavigation(undefined).length, 0);
    assert.strictEqual(getFilteredNavigation(null).length, 0);
  });

  it('unsupported roles including superAdmin, manager, and unknown receive empty navigation', () => {
    assert.strictEqual(getFilteredNavigation('superAdmin').length, 0);
    assert.strictEqual(getFilteredNavigation('manager').length, 0);
    assert.strictEqual(getFilteredNavigation('unknown').length, 0);
  });

  it('correctly calculates active state for exact dashboard and nested paths', () => {
    assert.strictEqual(isNavActive('/admin', '/admin'), true);
    assert.strictEqual(isNavActive('/admin/dashboard', '/admin'), true);
    assert.strictEqual(isNavActive('/admin/products', '/admin/products'), true);
    assert.strictEqual(isNavActive('/admin/products/new', '/admin/products'), true);
    assert.strictEqual(isNavActive('/admin/products/123/edit', '/admin/products'), true);
    assert.strictEqual(isNavActive('/admin/orders', '/admin/products'), false);
    assert.strictEqual(isNavActive('/admin/orders', '/admin/orders'), true);
  });

  it('correctly identifies active group for nested submenus without activating siblings', () => {
    const ordersItem = ADMIN_NAV_SECTIONS.find((s) => s.id === 'order-management').items.find((i) => i.id === 'orders');
    const customersItem = ADMIN_NAV_SECTIONS.find((s) => s.id === 'user-management').items.find((i) => i.id === 'customers');
    const settingsItem = ADMIN_NAV_SECTIONS.find((s) => s.id === 'system').items.find((i) => i.id === 'settings');

    assert.strictEqual(isGroupActive('/admin/refunds', ordersItem), true);
    assert.strictEqual(isGroupActive('/admin/returns', ordersItem), false);
    assert.strictEqual(isGroupActive('/admin/users', customersItem), true);
    assert.strictEqual(isGroupActive('/admin/vendors', customersItem), false);
    assert.strictEqual(isGroupActive('/admin/setup', settingsItem), true);
  });
});
