/**
 * Administrative Bootstrap Database Target & Environment Safety Validator
 *
 * Guarantees that administrative bootstrap tools FAIL CLOSED when targeting
 * remote, ambiguous, or production databases without explicit override.
 */

export const LOCAL_HOSTS = ["127.0.0.1", "localhost", "::1", "0.0.0.0"];

/**
 * Parses MongoDB connection URI to extract host, database name, and local status
 * while guaranteeing embedded credentials are redacted from logs.
 */
export function parseMongoTarget(uri) {
  if (!uri || typeof uri !== "string") {
    return {
      host: "none",
      database: "none",
      isLocal: false,
      sanitizedUri: "[EMPTY_MONGODB_URI]",
    };
  }

  try {
    const parsed = new URL(uri);
    const host = parsed.hostname || "unknown";
    const database =
      (parsed.pathname || "").replace(/^\//, "").split("?")[0] || "default";
    const isLocal = LOCAL_HOSTS.includes(host.toLowerCase());

    const sanitizedUrl = new URL(uri);
    if (sanitizedUrl.password) {
      sanitizedUrl.password = "****";
    }
    const sanitizedUri = sanitizedUrl.toString();

    return {
      host,
      database,
      isLocal,
      sanitizedUri,
    };
  } catch {
    return {
      host: "unparseable",
      database: "unknown",
      isLocal: false,
      sanitizedUri: uri.replace(/:([^@/]+)@/, ":****@"),
    };
  }
}

/**
 * Validates whether the target database environment is safe for administrative mutation.
 *
 * Fails closed if:
 * 1. NODE_ENV is set to "production" (unless explicit override is provided)
 * 2. MongoDB host is remote/non-localhost (unless explicit override is provided)
 * 3. NODE_ENV is missing/empty AND target host is not a local loopback address
 */
export function verifyDatabaseTarget({
  mongoUri,
  nodeEnv = process.env.NODE_ENV,
  overrideEnvVar,
  overrideValue = process.env[overrideEnvVar],
}) {
  const target = parseMongoTarget(mongoUri);
  const normalizedEnv = (nodeEnv || "").trim().toLowerCase();
  const isProduction = normalizedEnv === "production";
  const hasOverride = overrideValue === "true";

  // A database is ONLY inherently safe if NOT production AND host is local loopback
  const isSafeLocalTarget = !isProduction && target.isLocal;

  if (!isSafeLocalTarget && !hasOverride) {
    const reasons = [];
    if (isProduction) {
      reasons.push(`NODE_ENV is set to "production"`);
    }
    if (!target.isLocal) {
      reasons.push(
        `MongoDB host "${target.host}" is not a recognized local development target (${LOCAL_HOSTS.join(", ")})`
      );
    }

    return {
      allowed: false,
      target,
      environment: normalizedEnv || "unspecified",
      reason: reasons.join(" and "),
    };
  }

  return {
    allowed: true,
    target,
    environment:
      normalizedEnv || (target.isLocal ? "development (inferred local)" : "unspecified"),
    isProductionOverride: !isSafeLocalTarget && hasOverride,
  };
}
