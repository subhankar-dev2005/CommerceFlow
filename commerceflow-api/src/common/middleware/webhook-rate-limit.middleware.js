import rateLimit from "express-rate-limit";

import { env } from "../../config/env.js";
import { generateRateLimitKey, normalizeClientIp } from "./auth-rate-limit.middleware.js";

const webhookRateLimitMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.WEBHOOK_RATE_LIMIT || 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: generateRateLimitKey,
  message: {
    success: false,
    error: {
      code: "WEBHOOK_RATE_LIMIT_EXCEEDED",
      message: "Too many webhook requests. Please try again later.",
      details: []
    }
  }
});

const originalWebhookResetKey = webhookRateLimitMiddleware.resetKey;
webhookRateLimitMiddleware.resetKey = (key) => {
  originalWebhookResetKey(key);
  const normalized = normalizeClientIp(key);
  if (normalized !== key) {
    originalWebhookResetKey(normalized);
  }
};

export default webhookRateLimitMiddleware;
