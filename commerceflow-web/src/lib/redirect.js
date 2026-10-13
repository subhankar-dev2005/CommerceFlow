/**
 * Validates and normalizes administrative redirect paths.
 *
 * Prevents open redirect attacks by ensuring the target destination is
 * strictly a relative, same-origin path within the application.
 *
 * Rules:
 * 1. Must start with a single '/'
 * 2. Must not start with '//' or '/\' (protocol-relative attacks)
 * 3. Must not contain a protocol scheme (e.g. 'http:', 'javascript:', 'data:')
 * 4. Must not redirect back to '/admin/login' (prevents redirect loop)
 * 5. Defaults safely to '/admin/dashboard'
 *
 * @param {string|null|undefined} target - Candidate redirect path
 * @param {string} [fallback='/admin/dashboard'] - Safe fallback destination
 * @returns {string} Safe validated path
 */
export function getSafeAdminRedirect(target, fallback = '/admin/dashboard') {
  if (!target || typeof target !== 'string') {
    return fallback;
  }

  const trimmed = target.trim();

  // Must begin with a single forward slash
  if (!trimmed.startsWith('/')) {
    return fallback;
  }

  // Reject protocol-relative URLs (e.g. //evil.example, /\evil.example)
  if (trimmed.startsWith('//') || trimmed.startsWith('/\\') || trimmed.startsWith('/%2f')) {
    return fallback;
  }

  // Reject URL scheme indicators anywhere before query/hash
  const pathPart = trimmed.split(/[?#]/)[0];
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(pathPart)) {
    return fallback;
  }

  // Reject control characters or newlines
  if (/[\r\n\t]/.test(trimmed)) {
    return fallback;
  }

  // Prevent redirect loops back to admin login
  if (pathPart === '/admin/login') {
    return fallback;
  }

  return trimmed;
}

export default getSafeAdminRedirect;
