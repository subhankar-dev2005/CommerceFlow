/**
 * Pure, zero-dependency parser for incoming HTTP Cookie request headers.
 * Safely parses cookie strings into a key-value dictionary with URI decoding.
 *
 * @param {string|undefined} cookieHeader - Raw req.headers.cookie string
 * @returns {Record<string, string>}
 */
export function parseCookies(cookieHeader) {
  if (!cookieHeader || typeof cookieHeader !== "string") {
    return {};
  }

  const cookies = {};
  const pairs = cookieHeader.split(";");

  for (const pair of pairs) {
    const index = pair.indexOf("=");
    if (index === -1) continue;

    const key = pair.slice(0, index).trim();
    const val = pair.slice(index + 1).trim();

    if (key) {
      try {
        cookies[key] = decodeURIComponent(val);
      } catch {
        cookies[key] = val;
      }
    }
  }

  return cookies;
}

export default parseCookies;
