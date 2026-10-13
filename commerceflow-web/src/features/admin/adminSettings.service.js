import { apiClient, ApiError } from '../../lib/apiClient.js';

/**
 * Administrative Store Settings Service
 * Consumes: /api/v1/admin/settings
 */

/**
 * Fetch current persisted store settings and safe operational diagnostics.
 *
 * @param {Object} [options={}]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ settings: Object, systemInfo: Object }>}
 */
export async function getStoreSettings({ signal } = {}) {
  const response = await apiClient.get('admin/settings', { signal });
  const data = response?.data || {};
  return {
    settings: data.settings || {},
    systemInfo: data.systemInfo || {},
  };
}

/**
 * Update and persist store configuration values.
 *
 * @param {Object} payload
 * @param {Object} [options={}]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ settings: Object, systemInfo: Object }>}
 */
export async function updateStoreSettings(payload, { signal } = {}) {
  if (!payload || typeof payload !== 'object' || Object.keys(payload).length === 0) {
    throw new ApiError({
      message: 'At least one settings field must be provided',
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  }

  const response = await apiClient.patch('admin/settings', payload, { signal });
  const data = response?.data || {};
  return {
    settings: data.settings || {},
    systemInfo: data.systemInfo || {},
  };
}

export const adminSettingsService = {
  getStoreSettings,
  updateStoreSettings,
};

export default adminSettingsService;
