/* global URL */
/**
 * Application environment configuration
 */

/**
 * Evaluates whether an API URL targets a local development or loopback address.
 *
 * @param {string} url
 * @returns {boolean}
 */
export function isLocalhostOrLoopbackUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  try {
    const URLConstructor = typeof URL !== 'undefined' ? URL : globalThis.URL;
    const parsed = new URLConstructor(trimmed);
    const hostname = parsed.hostname.toLowerCase();
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '[::1]' ||
      hostname === '0.0.0.0' ||
      hostname.endsWith('.localhost')
    );
  } catch {
    const lower = trimmed.toLowerCase();
    return (
      lower.includes('localhost') ||
      lower.includes('127.0.0.1') ||
      lower.includes('0.0.0.0') ||
      lower.includes('::1')
    );
  }
}

/**
 * Resolves and validates the backend API base URL based on the environment.
 * - In development and test environments, falls back safely to 'http://localhost:4000/api/v1'.
 * - In production, strictly requires an explicit VITE_API_BASE_URL and rejects missing, empty, or localhost/development values.
 *
 * @param {Object} [options={}]
 * @param {string} [options.url] Custom or injected API URL
 * @param {boolean} [options.isProduction] Whether running in production mode
 * @returns {string} Normalized API base URL without trailing slash
 * @throws {Error} When production build or runtime is missing or points to localhost VITE_API_BASE_URL
 */
export function resolveApiBaseUrl(options = {}) {
  const isProd =
    options.isProduction !== undefined
      ? options.isProduction
      : (import.meta.env?.PROD ??
          (typeof globalThis.process !== 'undefined' &&
            globalThis.process?.env?.NODE_ENV === 'production' &&
            !globalThis.process?.env?.NODE_TEST_CONTEXT &&
            !globalThis.process?.env?.VITEST));

  const candidate =
    options.url !== undefined
      ? options.url
      : (import.meta.env?.VITE_API_BASE_URL ??
          (typeof globalThis.process !== 'undefined'
            ? globalThis.process?.env?.VITE_API_BASE_URL
            : undefined));

  const sanitized = typeof candidate === 'string' ? candidate.trim() : '';

  if (isProd) {
    if (!sanitized) {
      throw new Error(
        '[CommerceFlow Config Error] Missing VITE_API_BASE_URL environment variable in production. ' +
        'Production builds must explicitly configure VITE_API_BASE_URL (e.g. https://example.com/api/v1).'
      );
    }

    if (isLocalhostOrLoopbackUrl(sanitized)) {
      throw new Error(
        `[CommerceFlow Config Error] Invalid VITE_API_BASE_URL for production: "${sanitized}". ` +
        'Production builds must not point to localhost or loopback endpoints. ' +
        'Please supply a valid public production API URL (e.g. https://example.com/api/v1).'
      );
    }

    return sanitized.replace(/\/+$/, '');
  }

  // Development / Test default fallback
  const resolved = sanitized || 'http://localhost:4000/api/v1';
  return resolved.replace(/\/+$/, '');
}

/**
 * Base URL for the CommerceFlow API, guaranteed without trailing slashes.
 */
export const API_BASE_URL = resolveApiBaseUrl();
