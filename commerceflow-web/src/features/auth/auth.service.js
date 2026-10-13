import { apiClient } from '../../lib/apiClient.js';

/**
 * Authentication API Service
 *
 * Interacts with backend authentication endpoints via the central apiClient.
 * Token storage is handled by the browser via HttpOnly cookies; this service
 * does NOT manage token storage directly.
 */

/**
 * Log in an existing user.
 *
 * @param {Object} credentials
 * @param {string} credentials.email
 * @param {string} credentials.password
 * @returns {Promise<{ user: Object }>}
 */
export async function loginUser({ email, password }) {
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const response = await apiClient.post(
    'users/login',
    { email: normalizedEmail, password },
    { token: null }
  );
  return {
    user: response?.data?.user,
  };
}

/**
 * Register a new customer account.
 * Note: Backend registration does NOT return a token.
 *
 * @param {Object} userData
 * @param {string} userData.name
 * @param {string} userData.email
 * @param {string} userData.password
 * @returns {Promise<{ user: Object }>}
 */
export async function registerUser({ name, email, password }) {
  const normalizedName = typeof name === 'string' ? name.trim() : '';
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const response = await apiClient.post(
    'users/register',
    { name: normalizedName, email: normalizedEmail, password },
    { token: null }
  );
  return {
    user: response?.data?.user,
  };
}

let inFlightCurrentUserPromise = null;

/**
 * Fetch the currently authenticated user profile.
 * Relies on the HttpOnly auth cookie sent automatically by the browser.
 * Deduplicates concurrent in-flight calls (e.g. during React Strict Mode mounting
 * or rapid bootstrap checks) to avoid duplicate network requests.
 *
 * @returns {Promise<{ user: Object }>}
 */
export async function getCurrentUser() {
  if (inFlightCurrentUserPromise) {
    return inFlightCurrentUserPromise;
  }

  inFlightCurrentUserPromise = (async () => {
    try {
      const response = await apiClient.get('/users/me');
      return {
        user: response?.data?.user,
      };
    } catch (err) {
      const isUnauthenticated =
        err?.status === 401 &&
        (err?.code === 'AUTH_TOKEN_REQUIRED' ||
          err?.code === 'AUTH_TOKEN_EXPIRED' ||
          err?.code === 'INVALID_AUTH_TOKEN' ||
          err?.code === 'USER_NOT_FOUND' ||
          err?.code === 'ACCOUNT_DEACTIVATED');

      if (isUnauthenticated) {
        return { user: null };
      }
      throw err;
    } finally {
      inFlightCurrentUserPromise = null;
    }
  })();

  return inFlightCurrentUserPromise;
}

/**
 * Log out the current user.
 * Instructs the backend to clear the HttpOnly auth cookie.
 *
 * @returns {Promise<void>}
 */
export async function logoutUser() {
  await apiClient.post('users/logout', {});
}

let inFlightAdminLoginPromise = null;

/**
 * Log in an administrator account.
 * Deduplicates concurrent in-flight calls to prevent duplicate network requests.
 *
 * @param {Object} credentials
 * @param {string} credentials.email
 * @param {string} credentials.password
 * @returns {Promise<{ user: Object }>}
 */
export async function loginAdmin({ email, password }) {
  if (inFlightAdminLoginPromise) {
    return inFlightAdminLoginPromise;
  }

  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

  inFlightAdminLoginPromise = (async () => {
    try {
      const response = await apiClient.post(
        'users/admin/login',
        { email: normalizedEmail, password },
        { token: null }
      );
      return {
        user: response?.data?.user,
      };
    } finally {
      inFlightAdminLoginPromise = null;
    }
  })();

  return inFlightAdminLoginPromise;
}

export const authService = {
  loginUser,
  loginAdmin,
  registerUser,
  getCurrentUser,
  logoutUser,
};

export default authService;
