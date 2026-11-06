/**
 * Centralized Role Definitions & Authorization Group Mappings
 *
 * Single source of truth for all user roles and permission expansions across CommerceFlow.
 */

export const ROLES = Object.freeze({
  CUSTOMER: "customer",
  ADMIN: "admin",
  SUPER_ADMIN: "super_admin"
});

export const ALL_ROLES = Object.freeze([
  ROLES.CUSTOMER,
  ROLES.ADMIN,
  ROLES.SUPER_ADMIN
]);

export const ADMINISTRATIVE_ROLES = Object.freeze([
  ROLES.ADMIN,
  ROLES.SUPER_ADMIN
]);

/**
 * Role-to-Role Gate Expansion Map (Backward-Compatible)
 *
 * Defines which user roles satisfy a specific route authorization requirement.
 * - An 'admin' gate is satisfied by standard admins and super admins.
 * - A 'super_admin' gate is strictly restricted to super admins.
 * - A 'customer' gate is strictly restricted to customers.
 */
export const ROLE_EXPANSIONS = Object.freeze({
  [ROLES.ADMIN]: Object.freeze([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  [ROLES.SUPER_ADMIN]: Object.freeze([ROLES.SUPER_ADMIN]),
  [ROLES.CUSTOMER]: Object.freeze([ROLES.CUSTOMER])
});

export default ROLES;
