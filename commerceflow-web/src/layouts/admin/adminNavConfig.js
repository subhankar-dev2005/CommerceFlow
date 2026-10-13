/**
 * Administrative Navigation Architecture Specification
 *
 * Supports the authoritative CommerceFlow Admin Control Panel information architecture.
 * Distinguishes between existing functional modules and planned/future modules.
 * Centralizes role metadata for future role extensibility without inventing backend roles now.
 */

export const ADMIN_NAV_SECTIONS = [
  {
    id: 'main',
    title: 'MAIN',
    allowedRoles: ['admin'],
    items: [
      {
        id: 'dashboard',
        label: 'Dashboard',
        href: '/admin',
        icon: 'dashboard',
        status: 'functional',
        allowedRoles: ['admin'],
      },
    ],
  },
  {
    id: 'product-management',
    title: 'PRODUCT MANAGEMENT',
    allowedRoles: ['admin'],
    items: [
      {
        id: 'products',
        label: 'Products',
        href: '/admin/products',
        icon: 'products',
        status: 'functional',
        hasSubmenu: true,
        children: [
          { id: 'all-products', label: 'All Products', href: '/admin/products' },
          { id: 'create-product', label: 'Add Product', href: '/admin/products/new' },
        ],
        allowedRoles: ['admin'],
      },
      {
        id: 'categories',
        label: 'Categories',
        href: '/admin/categories',
        icon: 'categories',
        status: 'functional',
        allowedRoles: ['admin'],
      },
      {
        id: 'inventory',
        label: 'Inventory',
        href: '/admin/inventory',
        icon: 'inventory',
        status: 'functional',
        allowedRoles: ['admin'],
      },
      {
        id: 'variants',
        label: 'Variants',
        href: '/admin/variants',
        icon: 'variants',
        status: 'functional',
        allowedRoles: ['admin'],
      },
      {
        id: 'brands',
        label: 'Brands',
        href: '/admin/brands',
        icon: 'brands',
        status: 'functional',
        allowedRoles: ['admin'],
      },
    ],
  },
  {
    id: 'order-management',
    title: 'ORDER MANAGEMENT',
    allowedRoles: ['admin'],
    items: [
      {
        id: 'orders',
        label: 'Orders',
        href: '/admin/orders',
        icon: 'orders',
        status: 'functional',
        hasSubmenu: true,
        children: [
          { id: 'all-orders', label: 'All Orders', href: '/admin/orders' },
          { id: 'refunds-sub', label: 'Refunds', href: '/admin/refunds' },
        ],
        allowedRoles: ['admin'],
      },
      {
        id: 'returns',
        label: 'Returns',
        href: '/admin/returns',
        icon: 'returns',
        status: 'functional',
        allowedRoles: ['admin'],
      },
    ],
  },
  {
    id: 'user-management',
    title: 'USER MANAGEMENT',
    allowedRoles: ['admin'],
    items: [
      {
        id: 'customers',
        label: 'Customers',
        href: '/admin/customers',
        icon: 'users',
        status: 'functional',
        hasSubmenu: true,
        children: [
          { id: 'all-customers', label: 'All Customers', href: '/admin/customers' },
          { id: 'admin-users-sub', label: 'Administrators', href: '/admin/users' },
        ],
        allowedRoles: ['admin'],
      },
      {
        id: 'vendors',
        label: 'Vendors',
        href: '/admin/vendors',
        icon: 'vendors',
        status: 'functional',
        allowedRoles: ['admin'],
      },
    ],
  },
  {
    id: 'system',
    title: 'SYSTEM',
    allowedRoles: ['admin'],
    items: [
      {
        id: 'settings',
        label: 'Settings',
        href: '/admin/settings',
        icon: 'settings',
        status: 'functional',
        hasSubmenu: true,
        children: [
          { id: 'store-settings', label: 'Store Settings', href: '/admin/settings' },
          { id: 'admin-setup-sub', label: 'Admin Setup', href: '/admin/setup' },
        ],
        allowedRoles: ['admin'],
      },
      {
        id: 'audit-logs',
        label: 'Audit Logs',
        href: '/admin/audit-logs',
        icon: 'auditLogs',
        status: 'functional',
        allowedRoles: ['admin'],
      },
      {
        id: 'reports',
        label: 'Reports',
        href: '/admin/reports',
        icon: 'reports',
        status: 'functional',
        allowedRoles: ['admin'],
      },
    ],
  },
];

/**
 * Filter navigation items based on user role.
 * In Step 1, authoritatively filters for 'admin' role.
 *
 * @param {string} userRole - Current authenticated role ('admin')
 * @returns {Array<Object>} Filtered sections with permitted items
 */
export function getFilteredNavigation(userRole = '') {
  if (!userRole) return [];
  return ADMIN_NAV_SECTIONS
    .filter((section) => section.allowedRoles.includes(userRole))
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.allowedRoles.includes(userRole)),
    }))
    .filter((section) => section.items.length > 0);
}

/**
 * Determine if a specific path is active given the current location.
 *
 * @param {string} currentPath - Current browser pathname
 * @param {string} itemHref - Navigation item href
 * @returns {boolean} True if active
 */
export function isNavActive(currentPath, itemHref) {
  if (!currentPath || !itemHref) return false;
  if (itemHref === '/admin' || itemHref === '/admin/dashboard') {
    return currentPath === '/admin' || currentPath === '/admin/dashboard';
  }
  return currentPath.startsWith(itemHref);
}

/**
 * Determine if a group should be expanded based on current location.
 *
 * @param {string} currentPath - Current browser pathname
 * @param {Object} item - Navigation item object
 * @returns {boolean} True if group is active/expanded
 */
export function isGroupActive(currentPath, item) {
  if (!item || !currentPath) return false;
  if (Array.isArray(item.children)) {
    return item.children.some((child) => isNavActive(currentPath, child.href));
  }
  return isNavActive(currentPath, item.href);
}
