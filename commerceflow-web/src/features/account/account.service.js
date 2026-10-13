import { apiClient } from '../../lib/apiClient.js';

/**
 * Customer Account Service
 * Interacts with authenticated user profile and password endpoints via apiClient.
 *
 * Rules:
 * - Backend is the sole authority for profile state and password changes.
 * - No raw fetch() calls.
 * - No console logging or exposure of passwords/tokens.
 * - No storage of passwords or profile cache in localStorage/sessionStorage.
 * - Only backend-supported fields are sent in request payloads.
 */

/**
 * Fetch authenticated user's current server-side profile.
 *
 * @returns {Promise<Object>} Authenticated user profile document
 */
export async function getProfile() {
  const response = await apiClient.get('/users/me');
  return response?.data?.user;
}

/**
 * Update authenticated user's profile.
 * Only sends supported fields (name).
 *
 * @param {Object} payload
 * @param {string} payload.name - Customer full name
 * @returns {Promise<Object>} Updated user profile document
 */
export async function updateProfile(payload) {
  const sanitizedName = typeof payload?.name === 'string' ? payload.name.trim() : '';

  const response = await apiClient.patch('/users/me', {
    name: sanitizedName,
  });

  return response?.data?.user;
}

/**
 * Change authenticated user's password.
 *
 * Note: confirmPassword, email, token, and user ID must NEVER be sent to the backend.
 *
 * @param {Object} payload
 * @param {string} payload.currentPassword
 * @param {string} payload.newPassword
 * @returns {Promise<Object>} Backend response data
 */
export async function changePassword(payload) {
  const response = await apiClient.patch('/users/me/password', {
    currentPassword: payload?.currentPassword,
    newPassword: payload?.newPassword,
  });

  return response?.data;
}

export const accountService = {
  getProfile,
  updateProfile,
  changePassword,
};

export default accountService;
