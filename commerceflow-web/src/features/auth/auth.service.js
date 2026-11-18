import { apiClient, ApiError } from '../../lib/apiClient.js';

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
          err?.code === 'AUTH_TOKEN_REVOKED' ||
          err?.code === 'USER_NOT_FOUND' ||
          err?.code === 'ACCOUNT_DEACTIVATED' ||
          err?.code === 'UNAUTHORIZED' ||
          !err?.code);

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
 * Preserves and returns backend MFA challenge metadata without assuming an authenticated session.
 *
 * @param {Object} credentials
 * @param {string} credentials.email
 * @param {string} credentials.password
 * @returns {Promise<{ mfaRequired: boolean, mfaEnrollmentRequired: boolean, challengeToken: string, expiresInSeconds: number, user?: Object }>}
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
        mfaRequired: Boolean(response?.data?.mfaRequired),
        mfaEnrollmentRequired: Boolean(response?.data?.mfaEnrollmentRequired),
        challengeToken: response?.data?.challengeToken,
        expiresInSeconds: response?.data?.expiresInSeconds ?? 300,
        user: response?.data?.user,
      };
    } finally {
      inFlightAdminLoginPromise = null;
    }
  })();

  return inFlightAdminLoginPromise;
}

/**
 * Verify an administrator MFA login challenge using a 6-digit TOTP code.
 * Upon success, the backend sets auth_token and refresh_token HttpOnly cookies.
 *
 * @param {Object} params
 * @param {string} params.challengeToken
 * @param {string} params.totpCode
 * @returns {Promise<{ user: Object }>}
 */
export async function verifyAdminMfa({ challengeToken, totpCode }) {
  const response = await apiClient.post(
    'users/admin/mfa/verify',
    { challengeToken, totpCode },
    { token: null }
  );
  return {
    user: response?.data?.user,
  };
}

/**
 * Verify an administrator MFA login challenge using a single-use recovery code.
 * Upon success, the backend sets auth_token and refresh_token HttpOnly cookies.
 *
 * @param {Object} params
 * @param {string} params.challengeToken
 * @param {string} params.recoveryCode
 * @returns {Promise<{ user: Object }>}
 */
export async function verifyAdminMfaRecovery({ challengeToken, recoveryCode }) {
  const response = await apiClient.post(
    'users/admin/mfa/recovery',
    { challengeToken, recoveryCode },
    { token: null }
  );
  return {
    user: response?.data?.user,
  };
}

/**
 * Initiate MFA enrollment for an unenrolled administrator.
 * Generates and stores a pending TOTP secret on the server. Does NOT issue session cookies.
 *
 * @param {Object} params
 * @param {string} params.challengeToken
 * @returns {Promise<{ secret: string, otpauthUri: string, expiresInSeconds: number }>}
 */
export async function setupAdminMfa({ challengeToken } = {}) {
  const payload = challengeToken ? { challengeToken } : {};
  const options = challengeToken ? { token: null } : undefined;
  const response = await apiClient.post(
    'users/admin/mfa/setup',
    payload,
    options
  );
  return {
    secret: response?.data?.secret,
    otpauthUri: response?.data?.otpauthUri,
    expiresInSeconds: response?.data?.expiresInSeconds ?? 600,
  };
}

/**
 * Confirm and activate MFA enrollment by verifying the first TOTP code.
 * Upon success, backend enables MFA, generates 8 recovery codes, and issues session cookies.
 *
 * @param {Object} params
 * @param {string} [params.challengeToken]
 * @param {string} params.totpCode
 * @returns {Promise<{ user: Object, recoveryCodes: string[] }>}
 */
export async function activateAdminMfa({ challengeToken, totpCode }) {
  const payload = challengeToken
    ? { challengeToken, totpCode: String(totpCode).trim() }
    : { totpCode: String(totpCode).trim() };
  const options = challengeToken ? { token: null } : undefined;
  const response = await apiClient.post(
    'users/admin/mfa/activate',
    payload,
    options
  );
  return {
    user: response?.data?.user,
    recoveryCodes: response?.data?.recoveryCodes,
  };
}

/**
 * Regenerate administrator MFA recovery codes with step-up verification.
 * Requires current password and exactly one step-up factor (totpCode or recoveryCode).
 * Relies on the active ambient HttpOnly auth_token session cookie.
 *
 * @param {Object} params
 * @param {string} params.password
 * @param {string} [params.totpCode]
 * @param {string} [params.recoveryCode]
 * @returns {Promise<{ recoveryCodes: string[], message?: string }>}
 */
export async function regenerateAdminMfaRecoveryCodes({ password, totpCode, recoveryCode }) {
  const hasTotp = totpCode !== undefined && totpCode !== null && String(totpCode).trim() !== '';
  const hasRecovery = recoveryCode !== undefined && recoveryCode !== null && String(recoveryCode).trim() !== '';

  if (hasTotp && hasRecovery) {
    throw new ApiError({
      message: 'Conflicting authentication factors: supply either totpCode or recoveryCode, not both.',
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'stepUp', message: 'Cannot provide both totpCode and recoveryCode' }],
    });
  }

  const payload = { password };
  if (hasTotp) {
    payload.totpCode = String(totpCode).trim();
  }
  if (hasRecovery) {
    payload.recoveryCode = String(recoveryCode).trim();
  }

  const response = await apiClient.post(
    'users/admin/mfa/recovery/regenerate',
    payload
  );

  return {
    recoveryCodes: response?.data?.recoveryCodes || [],
    message: response?.message,
  };
}

/**
 * Disable administrator multi-factor authentication.
 * Requires current password and exactly one step-up factor (totpCode or recoveryCode).
 * Relies on the active ambient HttpOnly auth_token session cookie.
 *
 * @param {Object} params
 * @param {string} params.password
 * @param {string} [params.totpCode]
 * @param {string} [params.recoveryCode]
 * @returns {Promise<{ user: Object, message?: string }>}
 */
export async function disableAdminMfa({ password, totpCode, recoveryCode }) {
  const hasTotp = totpCode !== undefined && totpCode !== null && String(totpCode).trim() !== '';
  const hasRecovery = recoveryCode !== undefined && recoveryCode !== null && String(recoveryCode).trim() !== '';

  if (hasTotp && hasRecovery) {
    throw new ApiError({
      message: 'Conflicting authentication factors: supply either totpCode or recoveryCode, not both.',
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'stepUp', message: 'Cannot provide both totpCode and recoveryCode' }],
    });
  }

  if (!hasTotp && !hasRecovery) {
    throw new ApiError({
      message: 'Must provide either totpCode or recoveryCode.',
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'stepUp', message: 'Must provide either totpCode or recoveryCode' }],
    });
  }

  const payload = { password: String(password || '') };
  if (hasTotp) {
    payload.totpCode = String(totpCode).trim();
  }
  if (hasRecovery) {
    payload.recoveryCode = String(recoveryCode).trim();
  }

  const response = await apiClient.post(
    'users/admin/mfa/disable',
    payload
  );

  return {
    user: response?.data?.user,
    message: response?.message,
  };
}

/**
 * Trigger session refresh.
 * Relies on the HttpOnly refresh_token cookie sent automatically by the browser.
 * The backend sets rotated auth_token and refresh_token cookies.
 *
 * @returns {Promise<{ user: Object }>}
 */
export async function refreshToken() {
  const response = await apiClient.post(
    'users/refresh',
    {},
    {
      _isRefreshRequest: true,
      headers: {
        'X-CommerceFlow-Client': 'web',
      },
    }
  );
  return {
    user: response?.data?.user,
  };
}

export const authService = {
  loginUser,
  loginAdmin,
  verifyAdminMfa,
  verifyAdminMfaRecovery,
  setupAdminMfa,
  activateAdminMfa,
  regenerateAdminMfaRecoveryCodes,
  disableAdminMfa,
  registerUser,
  getCurrentUser,
  logoutUser,
  refreshToken,
};

export default authService;
