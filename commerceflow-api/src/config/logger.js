import pino from "pino";

import { env } from "./env.js";

export const logger = pino({
  level: env.LOG_LEVEL,

  base: {
    service: "commerceflow-api",
    environment: env.NODE_ENV
  },

  timestamp: pino.stdTimeFunctions.isoTime,

  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "headers.authorization",
      "headers.cookie",
      "authorization",
      "cookie",
      "password",
      "*.password",
      "*.*.password",
      "token",
      "*.token",
      "refreshToken",
      "*.refreshToken",
      "razorpaySignature",
      "*.razorpaySignature",
      "req.headers['x-razorpay-signature']"
    ],
    censor: "[REDACTED]"
  }
});