import { apiClient, ApiError } from '../../lib/apiClient.js';

/**
 * Address Service
 * Communicates with the CommerceFlow User Address API endpoints.
 * All mutations target /api/v1/users/me/addresses.
 */

/**
 * Validate that an address ID is a 24-character hex MongoDB ObjectId.
 * @param {string} addressId
 * @throws {ApiError}
 */
function validateAddressId(addressId) {
  if (!addressId || typeof addressId !== 'string' || !/^[0-9a-fA-F]{24}$/.test(addressId.trim())) {
    throw new ApiError({
      message: 'A valid 24-character address ID is required',
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'addressId', message: 'Invalid address ID' }],
    });
  }
}

let inFlightAddressesPromise = null;

/**
 * Clear in-flight addresses promise (primarily for tests).
 */
export function clearInFlightAddressesCache() {
  inFlightAddressesPromise = null;
}

/**
 * Fetch all saved delivery addresses for the authenticated user.
 * Addresses are returned sorted by default first, then createdAt descending.
 * Deduplicates concurrent in-flight requests.
 *
 * @param {Object} [options={}] - Request options including AbortSignal
 * @returns {Promise<Array<Object>>}
 */
export async function getAddresses(options = {}) {
  if (inFlightAddressesPromise) {
    return inFlightAddressesPromise;
  }

  inFlightAddressesPromise = (async () => {
    try {
      const response = await apiClient.get('users/me/addresses', options);
      return response?.data?.addresses || [];
    } finally {
      inFlightAddressesPromise = null;
    }
  })();

  return inFlightAddressesPromise;
}

/**
 * Create a new delivery address for the authenticated user.
 *
 * @param {Object} data
 * @param {string} data.fullName - 2 to 100 characters
 * @param {string} data.phone - 10 to 20 characters
 * @param {string} data.addressLine1 - 1 to 200 characters
 * @param {string} [data.addressLine2] - Max 200 characters
 * @param {string} data.city - 1 to 100 characters
 * @param {string} data.state - 1 to 100 characters
 * @param {string} data.postalCode - 3 to 20 characters
 * @param {string} [data.country="India"] - 1 to 100 characters
 * @param {boolean} [data.isDefault=false]
 * @returns {Promise<Object>} Created address document
 */
export async function createAddress(data) {
  inFlightAddressesPromise = null;
  if (!data || typeof data !== 'object') {
    throw new ApiError({
      message: 'Address data is required',
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'body', message: 'Address data must be an object' }],
    });
  }

  const response = await apiClient.post('users/me/addresses', data);
  return response?.data?.address;
}

/**
 * Update an existing delivery address.
 *
 * @param {string} addressId - 24-character hex ID
 * @param {Object} data - Partial address object with at least one field
 * @returns {Promise<Object>} Updated address document
 */
export async function updateAddress(addressId, data) {
  inFlightAddressesPromise = null;
  validateAddressId(addressId);

  if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
    throw new ApiError({
      message: 'At least one field is required to update address',
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'body', message: 'At least one field is required' }],
    });
  }

  const response = await apiClient.patch(
    `users/me/addresses/${encodeURIComponent(addressId.trim())}`,
    data
  );
  return response?.data?.address;
}

/**
 * Set an existing address as the default delivery address.
 * Backend demotes all other addresses for this user to isDefault: false.
 *
 * @param {string} addressId - 24-character hex ID
 * @returns {Promise<Object>} Updated address document
 */
export async function setDefaultAddress(addressId) {
  inFlightAddressesPromise = null;
  validateAddressId(addressId);

  const response = await apiClient.patch(
    `users/me/addresses/${encodeURIComponent(addressId.trim())}/default`,
    {}
  );
  return response?.data?.address;
}

/**
 * Delete a delivery address.
 * If the deleted address was default, backend automatically promotes the newest remaining address.
 *
 * @param {string} addressId - 24-character hex ID
 * @returns {Promise<Object>} Backend response data
 */
export async function deleteAddress(addressId) {
  inFlightAddressesPromise = null;
  validateAddressId(addressId);

  const response = await apiClient.delete(
    `users/me/addresses/${encodeURIComponent(addressId.trim())}`,
    { body: {} }
  );
  return response?.data;
}

export const addressService = {
  getAddresses,
  createAddress,
  updateAddress,
  setDefaultAddress,
  deleteAddress,
  clearInFlightAddressesCache,
};

export default addressService;
