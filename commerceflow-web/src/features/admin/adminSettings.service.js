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

/**
 * Upload and persist a custom store logo.
 *
 * @param {Object} payload
 * @param {string} payload.image - Base64 data URL or string
 * @param {string} [payload.altText] - Custom alt text
 * @param {Object} [options={}]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ logoUrl: string, logoAlt: string, updatedAt: string }>}
 */
export async function uploadLogo(payload, { signal } = {}) {
  if (!payload?.image || typeof payload.image !== 'string' || !payload.image.trim()) {
    throw new ApiError({
      message: 'Valid image data is required',
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  }

  const response = await apiClient.post('admin/settings/logo', payload, { signal });
  return response?.data || {};
}

/**
 * Reset the store logo to the default CommerceFlow brand mark.
 *
 * @param {Object} [options={}]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ logoUrl: null, logoAlt: string, hasCustomLogo: false }>}
 */
export async function resetLogo({ signal } = {}) {
  const response = await apiClient.post('admin/settings/logo/reset', {}, { signal });
  return response?.data || {};
}

/**
 * Fetch public store branding metadata.
 *
 * @param {Object} [options={}]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ storeName: string, logoUrl: string|null, logoAlt: string, hasCustomLogo: boolean, announcementText?: string }>}
 */
export async function getPublicBranding({ signal } = {}) {
  const response = await apiClient.get('settings/branding', { signal });
  return response?.data || {
    storeName: 'CommerceFlow',
    logoUrl: null,
    logoAlt: 'CommerceFlow Logo',
    hasCustomLogo: false,
    announcementText: '🏕️ Free shipping on orders over $50',
  };
}

/**
 * Reset storefront announcement text back to default.
 *
 * @param {Object} [options={}]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ announcementText: string }>}
 */
export async function resetAnnouncement({ signal } = {}) {
  const response = await apiClient.post('admin/settings/announcement/reset', {}, { signal });
  return response?.data || { announcementText: '🏕️ Free shipping on orders over $50' };
}

/**
 * Fetch standalone public announcement text.
 *
 * @param {Object} [options={}]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ announcementText: string }>}
 */
export async function getPublicAnnouncement({ signal } = {}) {
  const response = await apiClient.get('settings/announcement', { signal });
  return response?.data || { announcementText: '🏕️ Free shipping on orders over $50' };
}

/**
 * Fetch public payment methods availability.
 *
 * @param {Object} [options={}]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<Object>}
 */
export async function getPublicPaymentMethods({ signal } = {}) {
  try {
    const response = await apiClient.get('settings/payment-methods', { signal });
    const payload = response?.data?.paymentMethods || response?.data;
    return payload || {
      cod: { enabled: true, name: 'Cash on Delivery' },
      upi: { enabled: true, name: 'UPI' },
      card: { enabled: true, name: 'Credit / Debit Card' },
      netbanking: { enabled: true, name: 'Net Banking' },
      wallet: { enabled: true, name: 'Wallets' },
    };
  } catch {
    return {
      cod: { enabled: true, name: 'Cash on Delivery' },
      upi: { enabled: true, name: 'UPI' },
      card: { enabled: true, name: 'Credit / Debit Card' },
      netbanking: { enabled: true, name: 'Net Banking' },
      wallet: { enabled: true, name: 'Wallets' },
    };
  }
}

export const adminSettingsService = {
  getStoreSettings,
  updateStoreSettings,
  uploadLogo,
  resetLogo,
  getPublicBranding,
  resetAnnouncement,
  getPublicAnnouncement,
  getPublicPaymentMethods,
};

export default adminSettingsService;
