/**
 * Authentication token storage — Phase 3 migration.
 *
 * Authentication is now driven exclusively by HttpOnly cookies set by the
 * backend. JWTs are NEVER stored in localStorage, sessionStorage, or any
 * JavaScript-readable browser storage.
 *
 * These functions are retained as safe no-ops so that any remaining call
 * sites do not cause runtime errors during the migration window.
 * They perform NO read or write operations on any browser storage.
 *
 * DO NOT re-introduce localStorage/sessionStorage token persistence here.
 */

/**
 * No-op. Tokens are managed via HttpOnly cookie — not readable from JS.
 * @returns {null}
 */
export function getAccessToken() {
  return null;
}

/**
 * No-op. Token is set as HttpOnly cookie by the backend login response.
 */
export function setAccessToken() {
  // No-op: auth token must not be written to JavaScript-accessible storage.
}

/**
 * No-op. Cookie is cleared by calling POST /api/v1/users/logout.
 */
export function removeAccessToken() {
  // No-op: cookie removal is handled server-side via clearAuthCookie().
}

export const clearAccessToken = removeAccessToken;
