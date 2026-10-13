
import express from "express";

import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";

import { env } from "./config/env.js";
import { logger } from "./config/logger.js";

import requestIdMiddleware from "./common/middleware/request-id.middleware.js";

import notFoundMiddleware from "./common/middleware/not-found.middleware.js";
import errorMiddleware from "./common/middleware/error.middleware.js";

import parseCookies from "./utils/parse-cookies.js";
import apiRoutes from "./routes/index.js";
import { generateRateLimitKey } from "./common/middleware/auth-rate-limit.middleware.js";
import {
  getMongoDBStatus
} from "./database/mongodb.js";


export function createApp({ corsOrigin = env.CORS_ORIGIN } = {}) {
  const app = express();

  /*
   * Security
   * Prevent Express from exposing framework information.
   */
  app.disable("x-powered-by");

  /*
   * Reverse proxy trust configuration.
   * Never blindly trust all proxies (trust proxy = true).
   * Safe default: false (standalone / direct connections).
   * When behind a trusted proxy (e.g. Nginx, ALB): set to hop count (e.g. 1) or CIDR/loopback.
   */
  if (env.TRUST_PROXY === "false" || !env.TRUST_PROXY) {
    app.set("trust proxy", false);
  } else if (env.TRUST_PROXY === "true") {
    app.set("trust proxy", 1);
  } else {
    const num = Number(env.TRUST_PROXY);
    app.set(
      "trust proxy",
      Number.isInteger(num) && num > 0 ? num : env.TRUST_PROXY
    );
  }

  /*
   * Structured HTTP logging.
   * Pino should run early so requests and responses are logged.
   */
  app.use(
    pinoHttp({
      logger
    })
  );

  /*
   * Request ID.
   * Every request receives a unique ID for tracing,
   * logging, debugging, and error responses.
   */
  app.use(requestIdMiddleware);

  /*
   * Security headers.
   */
  app.use(helmet());

  /*
   * CORS configuration.
   */
  const allowedOrigins = Array.isArray(corsOrigin)
    ? corsOrigin
    : typeof corsOrigin === "string"
      ? [corsOrigin]
      : corsOrigin;

  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true
    })
  );

  /*
   * Global API rate limiting.
   *
   * Webhook and authentication routes receive separate,
   * dedicated rate limits.
   */
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 100,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      keyGenerator: generateRateLimitKey,
      message: {
        success: false,
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: "Too many requests, please try again later.",
          details: []
        }
      },
      skip: (req) => {
        const path = (req.originalUrl || "").split("?")[0].replace(/\/+$/, "");
        return (
          req.originalUrl.startsWith("/api/v1/payments/webhook") ||
          path === "/health" ||
          path === "/ready" ||
          path === "/api/v1/health" ||
          path.startsWith("/api/v1/health/") ||
          (req.method === "POST" && (
            path === "/api/v1/users/login" ||
            path === "/api/v1/users/register" ||
            path === "/api/v1/users/admin/login"
          )) ||
          (req.method === "GET" && (
            path === "/api/v1/products" ||
            path === "/api/v1/products/categories" ||
            (path.startsWith("/api/v1/products/") && !path.includes("/reviews"))
          ))
        );
      }
    })
  );

  /*
   * JSON request parsing.
   *
   * The size limit protects the API from unnecessarily
   * large JSON payloads.
   */
  app.use(
    express.json({
      limit: "1mb",
      verify: (req, res, buf) => {
        const path = (req.originalUrl || "").split("?")[0].replace(/\/+$/, "");
        if (path === "/api/v1/payments/webhook") {
          req.rawBody = buf;
        }
      }
    })
  );

  /*
   * Cookie parsing.
   * Extracts incoming cookies into req.cookies without external dependencies.
   */
  app.use((req, res, next) => {
    if (!req.cookies && req.headers?.cookie) {
      req.cookies = parseCookies(req.headers.cookie);
    } else if (!req.cookies) {
      req.cookies = {};
    }
    next();
  });

  /*
   * Root-level infrastructure probe endpoints.
   *
   * These aliases sit outside /api/v1 so load balancers, Kubernetes liveness
   * probes, and Docker HEALTHCHECK can reach them without knowing the API
   * version prefix.  They bypass authentication, rate-limiting, and (for the
   * liveness endpoint) any database dependency.
   *
   * GET /health  — liveness probe (process alive)
   * GET /ready   — readiness probe (MongoDB reachable via readyState only;
   *               the full ping is available at /api/v1/health/ready)
   */
  app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.get("/ready", (req, res) => {
    const { status } = getMongoDBStatus();
    const isReady = status === "connected";
    res
      .status(isReady ? 200 : 503)
      .json({ status: isReady ? "ready" : "not_ready" });
  });

  /*
   * API routes.
   */
  app.use("/api/v1", apiRoutes);


  /*
   * Must be registered after all application routes.
   */
  app.use(notFoundMiddleware);

  /*
   * Global error handler.
   *
   * Must always be the final middleware.
   */
  app.use(errorMiddleware);

  return app;
}

