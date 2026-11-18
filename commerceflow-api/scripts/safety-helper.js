/**
 * Administrative Bootstrap Database Target & Environment Safety Validator
 *
 * Guarantees that administrative bootstrap tools FAIL CLOSED when targeting
 * remote, ambiguous, or production databases without explicit override.
 */

export const LOCAL_HOSTS = ["127.0.0.1", "localhost", "::1", "[::1]", "0.0.0.0"];

export const PROD_DB_NAME_PATTERNS = [
  /^prod(?:uction)?$/i,
  /(?:^|[_\-.])prod(?:uction)?(?:[_\-.]|$)/i,
];

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

  const trimmed = uri.trim();
  if (!trimmed.startsWith("mongodb://") && !trimmed.startsWith("mongodb+srv://")) {
    return {
      host: "unparseable",
      database: "unknown",
      isLocal: false,
      sanitizedUri: "[INVALID_URI_SCHEME]",
    };
  }

  // Helper to sanitize credential strings
  const sanitize = (raw) => raw.replace(/\/\/[^@]+@/, "//****:****@");

  // Attempt 1: Standard WHATWG URL parsing
  try {
    const parsed = new URL(trimmed);
    const rawHost = parsed.hostname || "unknown";
    const cleanHost = rawHost.replace(/^\[|\]$/g, "").toLowerCase();
    const rawPath = (parsed.pathname || "").replace(/^\//, "").split("?")[0].trim();
    const database = rawPath || "default";

    const isLocal =
      LOCAL_HOSTS.includes(cleanHost) || LOCAL_HOSTS.includes(rawHost.toLowerCase());

    const sanitizedUrl = new URL(trimmed);
    if (sanitizedUrl.username || sanitizedUrl.password) {
      sanitizedUrl.username = "****";
      sanitizedUrl.password = "****";
    }
    const sanitizedUri = sanitizedUrl.toString();

    return {
      host: cleanHost,
      database,
      isLocal,
      sanitizedUri,
    };
  } catch {
    // Attempt 2: Multi-host replica set URI parser (e.g., mongodb://host1:27017,host2:27017/db?replicaSet=rs0)
    try {
      const match = trimmed.match(/^mongodb(?:\+srv)?:\/\/([^/]+)(?:\/([^?]*))?(?:\?.*)?$/);
      if (match) {
        const authority = match[1];
        const rawDb = (match[2] || "").trim();
        const database = rawDb || "default";

        // Strip userinfo if present
        const hostPart = authority.includes("@") ? authority.split("@").pop() : authority;
        const hostList = hostPart
          .split(",")
          .map((h) => {
            const trimmedH = h.trim();
            if (trimmedH.startsWith("[") && trimmedH.includes("]")) {
              return trimmedH.slice(1, trimmedH.indexOf("]")).toLowerCase();
            }
            if (trimmedH.startsWith("::1")) {
              return "::1";
            }
            return trimmedH.split(":")[0].replace(/^\[|\]$/g, "").trim().toLowerCase();
          })
          .filter(Boolean);

        if (hostList.length > 0) {
          const isLocal = hostList.every(
            (h) => LOCAL_HOSTS.includes(h) || LOCAL_HOSTS.includes(`[${h}]`)
          );
          return {
            host: hostList.join(","),
            database,
            isLocal,
            sanitizedUri: sanitize(trimmed),
          };
        }
      }
    } catch {
      // Fall through to unparseable
    }

    return {
      host: "unparseable",
      database: "unknown",
      isLocal: false,
      sanitizedUri: sanitize(trimmed),
    };
  }
}

/**
 * Validates whether the target database environment is safe for administrative mutation.
 *
 * Rules:
 * 1. NODE_ENV === "production" is strictly forbidden and can NEVER be overridden.
 * 2. Database names matching production patterns (e.g. *prod*, *production*) are strictly rejected.
 * 3. Local development loopback targets are permitted when NODE_ENV is "development", "test", or omitted.
 * 4. Remote staging targets require:
 *    - Explicit NODE_ENV === "staging"
 *    - Explicit staging override permission (e.g. ALLOW_STAGING_ADMIN_CREATION=true)
 *    - Explicit database confirmation matching the target database name
 *    - Non-production database name
 * 5. Ambiguous, unparseable, or mismatched targets fail closed.
 */
export function verifyDatabaseTarget({
  mongoUri,
  nodeEnv = process.env.NODE_ENV,
  overrideEnvVar,
  overrideValue = overrideEnvVar ? process.env[overrideEnvVar] : undefined,
  stagingOverrideEnvVar,
  stagingOverrideValue = stagingOverrideEnvVar ? process.env[stagingOverrideEnvVar] : undefined,
  confirmDatabase = process.env.CONFIRM_TARGET_DB || process.env.CONFIRM_DATABASE,
}) {
  const target = parseMongoTarget(mongoUri);
  const normalizedEnv = (nodeEnv || "").trim().toLowerCase();
  const isProductionEnv = normalizedEnv === "production";

  // Check 1: Target parsing validity
  if (target.host === "unparseable" || target.host === "none" || target.database === "unknown") {
    return {
      allowed: false,
      target,
      environment: normalizedEnv || "unspecified",
      reason: "Unable to reliably parse target MongoDB host or database from URI",
    };
  }

  // Check 2: Absolute production lockout (no override may ever bypass this)
  if (isProductionEnv) {
    return {
      allowed: false,
      target,
      environment: "production",
      reason: 'NODE_ENV is set to "production". Production administrative mutations are strictly forbidden.',
    };
  }

  // Check 3: Reject database names indicating production
  const isProductionDb = PROD_DB_NAME_PATTERNS.some((pattern) => pattern.test(target.database));
  if (isProductionDb) {
    return {
      allowed: false,
      target,
      environment: normalizedEnv || "unspecified",
      reason: `Database name "${target.database}" indicates a production database. Administrative mutation blocked.`,
    };
  }

  // Check 4: Safe local development targets
  const isSafeLocalTarget = target.isLocal;
  if (isSafeLocalTarget) {
    return {
      allowed: true,
      target,
      environment: normalizedEnv || "development (inferred local)",
      isProductionOverride: false,
      isStagingOverride: false,
    };
  }

  // Check 5: Remote target requirements (Staging Fail-Closed Safeguard)
  // Remote targets MUST be explicitly staging
  if (normalizedEnv !== "staging") {
    return {
      allowed: false,
      target,
      environment: normalizedEnv || "unspecified",
      reason: `Remote MongoDB host "${target.host}" requires NODE_ENV to be explicitly set to "staging" (received: "${normalizedEnv || "empty"}").`,
    };
  }

  // Must have an explicit staging override permission
  const hasStagingOverride =
    stagingOverrideValue === "true" ||
    (stagingOverrideEnvVar && process.env[stagingOverrideEnvVar] === "true") ||
    process.env.ALLOW_STAGING_ADMIN_CREATION === "true" ||
    process.env.ALLOW_STAGING_ADMIN_PROMOTION === "true";

  if (!hasStagingOverride) {
    return {
      allowed: false,
      target,
      environment: "staging",
      reason: `Remote staging target requires explicit staging override permission (${stagingOverrideEnvVar || "ALLOW_STAGING_ADMIN_CREATION"}=true). Broad production overrides are not permitted.`,
    };
  }

  // Remote URI must specify an explicit database name
  if (target.database === "default" || !target.database) {
    return {
      allowed: false,
      target,
      environment: "staging",
      reason: "Remote staging target URI must include an explicit database name.",
    };
  }

  // Must have explicit database confirmation matching the parsed target database
  const confirmedDb = (confirmDatabase || "").trim();
  if (!confirmedDb) {
    return {
      allowed: false,
      target,
      environment: "staging",
      reason: `Remote staging target requires explicit database confirmation via CONFIRM_TARGET_DB (expected: "${target.database}").`,
    };
  }

  if (confirmedDb.toLowerCase() !== target.database.toLowerCase()) {
    return {
      allowed: false,
      target,
      environment: "staging",
      reason: `Database confirmation mismatch: CONFIRM_TARGET_DB ("${confirmedDb}") does not match parsed target database ("${target.database}").`,
    };
  }

  return {
    allowed: true,
    target,
    environment: "staging",
    isProductionOverride: false,
    isStagingOverride: true,
  };
}
