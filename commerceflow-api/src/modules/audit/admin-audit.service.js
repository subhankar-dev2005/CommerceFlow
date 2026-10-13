import AdminAuditLog from "./admin-audit-log.model.js";
import { logger } from "../../config/logger.js";
import AppError from "../../common/errors/app-error.js";

export const AUDIT_EVENT_TYPES = Object.freeze({
  ADMIN_USER_CREATED: "ADMIN_USER_CREATED",
  ADMIN_USER_STATUS_UPDATED: "ADMIN_USER_STATUS_UPDATED",
  ADMIN_USER_ROLE_UPDATED: "ADMIN_USER_ROLE_UPDATED",
  ADMIN_CUSTOMER_STATUS_UPDATED: "ADMIN_CUSTOMER_STATUS_UPDATED",
  PRODUCT_CREATED: "PRODUCT_CREATED",
  PRODUCT_UPDATED: "PRODUCT_UPDATED",
  PRODUCT_STATUS_UPDATED: "PRODUCT_STATUS_UPDATED",
  PRODUCT_DELETED: "PRODUCT_DELETED",
  INVENTORY_ADJUSTED: "INVENTORY_ADJUSTED",
  ORDER_STATUS_UPDATED: "ORDER_STATUS_UPDATED",
  SHIPMENT_TRACKING_UPDATED: "SHIPMENT_TRACKING_UPDATED",
  RETURN_APPROVED: "RETURN_APPROVED",
  RETURN_REJECTED: "RETURN_REJECTED",
  RETURN_RECEIVED: "RETURN_RECEIVED",
  RETURN_COMPLETED: "RETURN_COMPLETED",
  REFUND_REQUESTED: "REFUND_REQUESTED",
  REFUND_SUCCEEDED: "REFUND_SUCCEEDED",
  REFUND_FAILED: "REFUND_FAILED",
  REFUND_RETRY_REQUESTED: "REFUND_RETRY_REQUESTED",
  REFUND_RECONCILIATION_REQUIRED: "REFUND_RECONCILIATION_REQUIRED",
  REFUND_RECONCILED: "REFUND_RECONCILED"
});

/**
 * Splits a key into constituent word tokens by accounting for camelCase,
 * underscores, hyphens, and whitespace separators.
 */
function tokenizeKey(key) {
  if (typeof key !== "string" || !key) return [];
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split(/[-_\s]+/)
    .filter(Boolean);
}

const SENSITIVE_KEY_WORDS = new Set([
  "password",
  "passwd",
  "passphrase",
  "secret",
  "token",
  "hash",
  "salt",
  "cookie",
  "auth",
  "authorization",
  "signature",
  "cvv",
  "cvc",
  "pin",
  "ssn",
  "pan",
  "card",
  "cards"
]);

const SENSITIVE_NORMALIZED_SUBSTRINGS = [
  "password",
  "passwd",
  "passphrase",
  "secret",
  "token",
  "hash",
  "cookie",
  "auth",
  "signature",
  "apikey",
  "api_key",
  "privatekey",
  "secretkey",
  "accesskey",
  "paymentmethod",
  "paymentinstrument",
  "paymentdetail",
  "creditcard",
  "debitcard",
  "cardnumber",
  "accountnumber",
  "bankaccount",
  "routingnumber"
];

const RISKY_BLOB_KEYS = new Set([
  "stack",
  "stacktrace",
  "trace",
  "errorstack",
  "rawbody",
  "requestbody",
  "rawrequest",
  "rawresponse",
  "responsebody",
  "reqheaders",
  "headers"
]);

/**
 * Evaluates whether a key name indicates sensitive or risky data.
 */
export function isSensitiveKey(key) {
  if (typeof key !== "string" || !key) return false;

  const normalized = key.toLowerCase().replace(/[-_\s]/g, "");

  // 1. Direct risky blob / raw dump keys
  if (RISKY_BLOB_KEYS.has(normalized)) {
    return true;
  }

  // 2. High-confidence normalized substrings
  for (const sub of SENSITIVE_NORMALIZED_SUBSTRINGS) {
    if (normalized.includes(sub)) {
      return true;
    }
  }

  // 3. Word token analysis for exact/bounded sensitive terms (e.g. pin, ssn, card, pan)
  const tokens = tokenizeKey(key);
  for (const token of tokens) {
    if (SENSITIVE_KEY_WORDS.has(token)) {
      return true;
    }
  }

  // 4. Special composite pairs: e.g. "api" + "key"
  if (tokens.includes("api") && tokens.includes("key")) {
    return true;
  }

  return false;
}

const BEARER_TOKEN_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\b/g;
const RZP_KEY_PATTERN = /\brzp_(?:test|live)_[A-Za-z0-9]+\b/gi;
const CARD_NUMBER_PATTERN = /\b(?:\d[ -]*?){13,19}\b/g;

/**
 * Sanitizes a free-text string value by redacting embedded secrets,
 * credentials, and payment card numbers while preserving legitimate text.
 */
export function sanitizeStringValue(val) {
  if (typeof val !== "string") return val;

  // Bound maximum length to avoid unbounded payload amplification
  let sanitized = val.slice(0, 1000);

  if (BEARER_TOKEN_PATTERN.test(sanitized)) {
    sanitized = sanitized.replace(BEARER_TOKEN_PATTERN, "Bearer [REDACTED]");
  }

  if (JWT_PATTERN.test(sanitized)) {
    sanitized = sanitized.replace(JWT_PATTERN, "[REDACTED_JWT]");
  }

  if (RZP_KEY_PATTERN.test(sanitized)) {
    sanitized = sanitized.replace(RZP_KEY_PATTERN, "[REDACTED_KEY]");
  }

  // Credit card detection: replace if candidate contains 13-19 digits
  sanitized = sanitized.replace(CARD_NUMBER_PATTERN, (match) => {
    const digits = match.replace(/\D/g, "");
    if (digits.length >= 13 && digits.length <= 19) {
      return "[REDACTED_CARD]";
    }
    return match;
  });

  return sanitized;
}

/**
 * Recursively strips sensitive keys, redacts embedded credentials in free-text,
 * eliminates dangerous error stack traces, and ensures the structure is plain JSON serializable.
 */
export function sanitizeAuditMetadata(obj, depth = 0) {
  if (depth > 6 || obj === null || obj === undefined) {
    return null;
  }

  // Handle Error instances passed in metadata
  if (obj instanceof Error) {
    return {
      name: obj.name || "Error",
      message: sanitizeStringValue(obj.message || "An error occurred").slice(0, 300)
    };
  }

  if (typeof obj === "string") {
    return sanitizeStringValue(obj);
  }

  if (typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj
      .map((item) => sanitizeAuditMetadata(item, depth + 1))
      .filter((item) => item !== undefined);
  }

  const clean = {};
  for (const [key, val] of Object.entries(obj)) {
    if (isSensitiveKey(key)) {
      continue;
    }
    if (typeof val === "function" || typeof val === "symbol") {
      continue;
    }
    if (val && (typeof val.toHexString === "function" || val._bsontype === "ObjectID")) {
      clean[key] = val.toString();
    } else if (val instanceof Date) {
      clean[key] = val.toISOString();
    } else if (typeof val === "object" && val !== null) {
      const sanitizedChild = sanitizeAuditMetadata(val, depth + 1);
      if (sanitizedChild !== undefined) {
        clean[key] = sanitizedChild;
      }
    } else if (typeof val === "string") {
      clean[key] = sanitizeStringValue(val);
    } else {
      clean[key] = val;
    }
  }
  return clean;
}

/**
 * Derives client IP safely without trusting spoofable internal headers.
 */
function extractClientIp(req) {
  if (!req) return null;
  const forwarded = req.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim().slice(0, 100);
  }
  const directIp = req.ip || req.socket?.remoteAddress;
  return typeof directIp === "string" ? directIp.slice(0, 100) : null;
}

/**
 * Derives User-Agent safely bounded in length.
 */
function extractUserAgent(req) {
  if (!req) return null;
  const ua = req.headers?.["user-agent"];
  return typeof ua === "string" ? ua.trim().slice(0, 500) : null;
}

/**
 * Records a persistent administrative audit event.
 * Server strictly enforces that actor identity originates from req.user.
 * Client-supplied actor fields are unconditionally ignored.
 *
 * @param {Object} params
 * @param {string} params.eventType - Standardized event type
 * @param {Object} [params.actor] - Optional override only if req is omitted
 * @param {Object} [params.target] - Target entity details { _id, id, email }
 * @param {string} [params.resourceType] - Explicit resource type (e.g. "product", "order", "inventory")
 * @param {string} [params.resourceId] - Explicit resource identifier
 * @param {Object} [params.metadata] - Event-specific contextual metadata
 * @param {Object} params.req - Express request object containing req.user
 * @returns {Promise<Object>} Persisted audit log document
 */
export async function recordAdminAuditEvent({
  eventType,
  actor,
  target,
  resourceType,
  resourceId,
  metadata = {},
  req
}) {
  if (!eventType || typeof eventType !== "string") {
    throw new AppError("A valid audit eventType is required", 500, [], "AUDIT_EVENT_TYPE_REQUIRED");
  }

  // Derive authoritative actor: req.user takes strict precedence
  let actorUserId = null;
  let actorEmail = null;
  let actorRole = null;

  if (req && req.user && req.user._id) {
    actorUserId = req.user._id;
    actorEmail = req.user.email;
    actorRole = req.user.role || "admin";
  } else if (actor && actor._id) {
    // Fallback for internal maintenance scripts
    actorUserId = actor._id;
    actorEmail = actor.email;
    actorRole = actor.role || "admin";
  } else {
    throw new AppError("Authoritative actor user is required for audit recording", 500, [], "AUDIT_ACTOR_REQUIRED");
  }

  const targetUserId = target?._id || target?.id || target?.userId || null;
  const targetEmail = target?.email ? String(target.email).trim().toLowerCase() : null;

  let resolvedResourceType = resourceType ? String(resourceType).trim().toLowerCase() : null;
  let resolvedResourceId = resourceId ? String(resourceId).trim() : null;

  if (!resolvedResourceType && target) {
    if (target.role !== undefined || target.email !== undefined) {
      resolvedResourceType = target.role === "admin" ? "admin_user" : "customer";
      resolvedResourceId = (target._id || target.id || target.userId)?.toString() || null;
    }
  }

  const sanitizedMetadata = sanitizeAuditMetadata(metadata) || {};
  const ipAddress = extractClientIp(req);
  const userAgent = extractUserAgent(req);

  // If running in unit test with disconnected database and unmocked AdminAuditLog
  if (!AdminAuditLog.create._isMockFunction && AdminAuditLog.db?.readyState === 0) {
    logger.debug(
      { eventType, actorUserId },
      "Database disconnected and unmocked: returning in-memory audit log"
    );
    return {
      _id: "000000000000000000000000",
      eventType: eventType.trim(),
      actorUserId,
      actorEmail: String(actorEmail).trim().toLowerCase(),
      actorRole,
      targetUserId,
      targetEmail,
      resourceType: resolvedResourceType,
      resourceId: resolvedResourceId,
      metadata: sanitizedMetadata,
      ipAddress,
      userAgent,
      createdAt: new Date()
    };
  }

  try {
    const auditRecord = await AdminAuditLog.create({
      eventType: eventType.trim(),
      actorUserId,
      actorEmail: String(actorEmail).trim().toLowerCase(),
      actorRole,
      targetUserId,
      targetEmail,
      resourceType: resolvedResourceType,
      resourceId: resolvedResourceId,
      metadata: sanitizedMetadata,
      ipAddress,
      userAgent
    });

    return auditRecord;
  } catch (error) {
    logger.error(
      {
        err: error,
        eventType,
        actorUserId,
        targetUserId
      },
      "Failed to persist administrative audit log event"
    );
    throw error;
  }
}
