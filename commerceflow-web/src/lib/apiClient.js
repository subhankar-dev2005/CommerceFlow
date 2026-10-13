/* global DOMException */
import { API_BASE_URL } from './config.js';
import { removeAccessToken } from './storage.js';

function createAbortError() {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('The user aborted a request.', 'AbortError');
  }
  const err = new Error('The user aborted a request.');
  err.name = 'AbortError';
  return err;
}

/**
 * Normalized API Error representation for CommerceFlow.
 * Preserves backend error fields without exposing raw implementation details.
 */
export class ApiError extends Error {
  constructor({
    message = 'An unexpected API error occurred',
    status = 500,
    code = 'API_ERROR',
    details = [],
    requestId = null,
    raw = null,
    retryAfter = null,
  } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
    this.raw = raw;
    this.retryAfter = retryAfter;
  }
}

/**
 * Backend error codes that specifically denote invalid or expired sessions.
 */
const SESSION_EXPIRATION_CODES = [
  'AUTH_TOKEN_EXPIRED',
  'INVALID_AUTH_TOKEN',
  'USER_NOT_FOUND',
  'ACCOUNT_DEACTIVATED',
];

// Active client-side rate limit cooldown timestamp (ms since epoch)
let rateLimitedUntil = null;
const endpointCooldowns = new Map();

/**
 * Returns remaining rate limit cooldown duration in seconds, or 0 if inactive.
 * When endpoint is provided, checks for route-scoped cooldown as well as global cooldown.
 * @param {string} [endpoint] - Optional endpoint path to check for route-scoped cooldown
 * @returns {number}
 */
export function getRateLimitCooldown(endpoint) {
  const now = Date.now();
  if (endpoint && typeof endpoint === 'string') {
    const normalized = endpoint.replace(/^\/+/, '').split('?')[0];
    const endpointUntil = endpointCooldowns.get(normalized);
    if (endpointUntil) {
      const remainingMs = endpointUntil - now;
      if (remainingMs > 0) {
        return Math.ceil(remainingMs / 1000);
      }
      endpointCooldowns.delete(normalized);
    }
  }

  if (!rateLimitedUntil) return 0;
  const remainingMs = rateLimitedUntil - now;
  if (remainingMs <= 0) {
    rateLimitedUntil = null;
    return 0;
  }
  return Math.ceil(remainingMs / 1000);
}

/**
 * Resets any active client-side rate limit cooldown (primarily for testing and reset handlers).
 */
export function resetRateLimitCooldown() {
  rateLimitedUntil = null;
  endpointCooldowns.clear();
}

// Active in-flight GET request registry for deduplication: cacheKey -> { controller, subscribers, promise }
const inFlightRequests = new Map();

/**
 * Clears active in-flight request tracking (primarily for testing).
 */
export function clearInFlightRequests() {
  inFlightRequests.clear();
}

/**
 * Internal fetch executor that performs HTTP calls and standardizes responses.
 */
async function executeFetch(url, { method = 'GET', headers = {}, body: serializedBody, signal, ...restOptions } = {}) {
  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: serializedBody,
      // Include cookies for cross-origin requests (HttpOnly auth cookie)
      credentials: 'include',
      signal,
      ...restOptions,
    });
  } catch (networkError) {
    if (networkError?.name === 'AbortError') {
      throw networkError;
    }
    throw new ApiError({
      message: networkError?.message || 'Network connection failed. Please check your internet connection.',
      status: 0,
      code: 'NETWORK_ERROR',
      details: [],
      requestId: null,
      raw: networkError,
    });
  }

  // Parse Response Content
  let responseData = null;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    try {
      responseData = await response.json();
    } catch {
      // Keep responseData as null if json parsing fails
    }
  } else {
    try {
      const text = await response.text();
      if (text) {
        responseData = { message: text };
      }
    } catch {
      // Keep responseData as null if reading text fails
    }
  }

  // Check HTTP Status
  if (!response.ok) {
    const status = response.status;
    const backendError = responseData?.error;

    const message =
      backendError?.message ||
      responseData?.message ||
      response.statusText ||
      `Request failed with status ${status}`;

    const code = backendError?.code || `HTTP_${status}`;
    const details = Array.isArray(backendError?.details) ? backendError.details : [];
    const requestId = responseData?.requestId || response.headers.get('x-request-id') || null;

    // Handle authentication session expiration specifically for verified auth failure codes
    if (status === 401 && SESSION_EXPIRATION_CODES.includes(code)) {
      removeAccessToken();
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        let event = null;
        if (typeof window.CustomEvent === 'function') {
          event = new window.CustomEvent('commerceflow:session-expired', {
            detail: { code, message, requestId },
          });
        } else if (typeof window.Event === 'function') {
          event = new window.Event('commerceflow:session-expired');
        }
        if (event) {
          window.dispatchEvent(event);
        }
      }
    }

    const retryAfterHeader = response.headers.get('retry-after') || response.headers.get('Retry-After');
    const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : null;

    // Respect server rate limit cooldown when 429 received with Retry-After header
    if (status === 429 && retryAfter && Number.isFinite(retryAfter) && retryAfter > 0) {
      if (code === 'AUTH_RATE_LIMIT_EXCEEDED') {
        const until = Date.now() + retryAfter * 1000;
        endpointCooldowns.set('users/login', until);
        endpointCooldowns.set('users/admin/login', until);
        endpointCooldowns.set('users/register', until);
      } else {
        rateLimitedUntil = Date.now() + retryAfter * 1000;
      }
    }

    throw new ApiError({
      message,
      status,
      code,
      details,
      requestId,
      raw: responseData,
      retryAfter,
    });
  }

  // Return parsed payload preserving backend response structure
  return responseData;
}

/**
 * Perform an HTTP request to the CommerceFlow API.
 *
 * @param {string} endpoint - API endpoint (e.g. '/products' or 'products')
 * @param {Object} [options={}] - Standard fetch options with extensions
 * @param {*} [options.body] - Request body (automatically JSON stringified if plain object/array)
 * @param {string|null} [options.token] - Explicit token override for non-browser API clients.
 *   Browser sessions authenticate via HttpOnly cookie — no token should be supplied here.
 * @param {boolean} [options.dedupe=true] - Whether to deduplicate concurrent in-flight GET requests
 * @returns {Promise<any>} Parsed response data matching backend structure
 * @throws {ApiError} Normalized error on non-2xx status or network failures
 */
export async function request(endpoint, options = {}) {
  const {
    method = 'GET',
    headers: customHeaders = {},
    body,
    token: explicitToken,
    signal,
    dedupe,
    ...restOptions
  } = options;

  // Enforce active client-side rate limit cooldown before touching the network
  const currentCooldown = getRateLimitCooldown(endpoint);
  if (currentCooldown > 0) {
    throw new ApiError({
      message: `Too many requests. Rate limit cooldown active. Please retry in ${currentCooldown} seconds.`,
      status: 429,
      code: 'RATE_LIMIT_COOLDOWN',
      retryAfter: currentCooldown,
    });
  }

  // Reject immediately if caller signal is already aborted
  if (signal?.aborted) {
    throw createAbortError();
  }

  // Resolve URL
  const isAbsoluteUrl = /^https?:\/\//i.test(endpoint);
  const normalizedEndpoint = endpoint.replace(/^\/+/, '');
  const url = isAbsoluteUrl ? endpoint : `${API_BASE_URL}/${normalizedEndpoint}`;

  // Build Headers as a standard plain object
  const headers = { ...customHeaders };

  // Apply Authorization Bearer header only when an explicit token override
  // is supplied. Browser sessions authenticate via the HttpOnly cookie instead.
  const token = explicitToken !== undefined ? explicitToken : null;
  if (token && !headers['Authorization'] && !headers['authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Handle Request Body Serialization
  let serializedBody = body;
  if (body !== undefined && body !== null) {
    const isPlainObjectOrArray =
      typeof body === 'object' &&
      (body.constructor === Object || Array.isArray(body));

    if (isPlainObjectOrArray) {
      if (!headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/json';
      }
      serializedBody = JSON.stringify(body);
    }
  }

  const isGet = method.toUpperCase() === 'GET' && !serializedBody;
  const shouldDedupe = isGet && dedupe !== false;

  if (!shouldDedupe) {
    return executeFetch(url, {
      method,
      headers,
      body: serializedBody,
      signal,
      ...restOptions,
    });
  }

  // Deduplicate identical in-flight GET requests to prevent StrictMode & concurrent amplification
  const cacheKey = `${url}:${token || ''}`;

  let entry = inFlightRequests.get(cacheKey);
  // If the existing entry was aborted (e.g. from a prior cancelled caller in StrictMode),
  // discard it immediately so a new clean request can be dispatched.
  if (entry && entry.controller?.signal?.aborted) {
    inFlightRequests.delete(cacheKey);
    entry = null;
  }

  if (!entry) {
    const internalController = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const subscribers = new Set();
    const fetchPromise = executeFetch(url, {
      method,
      headers,
      body: serializedBody,
      signal: internalController?.signal,
      ...restOptions,
    }).finally(() => {
      inFlightRequests.delete(cacheKey);
    });

    entry = { controller: internalController, subscribers, promise: fetchPromise };
    inFlightRequests.set(cacheKey, entry);
  }

  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      if (settled) return;
      settled = true;
      entry.subscribers.delete(onAbort);
      if (signal && typeof signal.removeEventListener === 'function') {
        signal.removeEventListener('abort', onAbort);
      }
      // If all callers aborted, abort the underlying network fetch and immediately evict from cache
      if (entry.subscribers.size === 0 && entry.controller) {
        entry.controller.abort();
        inFlightRequests.delete(cacheKey);
      }
    };

    const onAbort = () => {
      cleanup();
      reject(createAbortError());
    };

    if (signal && typeof signal.addEventListener === 'function') {
      signal.addEventListener('abort', onAbort);
    }
    entry.subscribers.add(onAbort);

    entry.promise.then(
      (data) => {
        cleanup();
        resolve(data);
      },
      (err) => {
        cleanup();
        reject(err);
      }
    );
  });
}

/**
 * Standard API client methods
 */
export const apiClient = {
  request,
  get: (endpoint, options = {}) => request(endpoint, { ...options, method: 'GET' }),
  post: (endpoint, body, options = {}) => request(endpoint, { ...options, method: 'POST', body }),
  put: (endpoint, body, options = {}) => request(endpoint, { ...options, method: 'PUT', body }),
  patch: (endpoint, body, options = {}) => request(endpoint, { ...options, method: 'PATCH', body }),
  delete: (endpoint, options = {}) => request(endpoint, { ...options, method: 'DELETE' }),
  del: (endpoint, options = {}) => request(endpoint, { ...options, method: 'DELETE' }),
};

export default apiClient;
