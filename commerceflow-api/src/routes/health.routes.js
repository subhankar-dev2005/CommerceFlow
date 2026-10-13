import { Router } from "express";

import {
  getMongoDBStatus,
  pingMongoDB
} from "../database/mongodb.js";

const router = Router();

/*
 * Liveness endpoint.
 *
 * Returns HTTP 200 while the Node process is alive.
 * Must NOT depend on MongoDB. Must NOT require authentication.
 * Must be lightweight — no I/O, no database calls.
 */
router.get("/", (req, res) => {
  res.status(200).json({
    success: true,

    data: {
      status: "ok",
      timestamp:
        new Date().toISOString()
    },

    requestId: req.requestId
  });
});

router.get("/live", (req, res) => {
  res.status(200).json({
    success: true,

    data: {
      status: "alive"
    },

    requestId: req.requestId
  });
});

/*
 * Readiness endpoint.
 *
 * Returns HTTP 200 only when the application can serve
 * database-backed requests. Uses a real MongoDB ping with a
 * bounded timeout (3 s) via the existing Mongoose connection —
 * no second database client is created.
 *
 * Returns HTTP 503 when MongoDB is unavailable.
 * Does NOT expose internal connection details or error messages.
 */
router.get("/ready", async (req, res) => {
  /*
   * Quick-check the Mongoose readyState first.
   * If we are not in the "connected" state there is no point
   * issuing a command — it will never return.
   */
  const { status } = getMongoDBStatus();
  const isConnectedState = status === "connected";

  if (!isConnectedState) {
    return res.status(503).json({
      success: false,

      data: {
        status: "not_ready"
      },

      requestId: req.requestId
    });
  }

  /*
   * Issue a real ping to confirm the driver can reach the server.
   * Bounded at 3 s so this endpoint never hangs indefinitely.
   */
  try {
    await pingMongoDB(3000);

    return res.status(200).json({
      success: true,

      data: {
        status: "ready"
      },

      requestId: req.requestId
    });
  } catch {
    /*
     * Do NOT expose the raw error message — it may contain
     * connection strings, hostnames, or internal stack frames.
     */
    return res.status(503).json({
      success: false,

      data: {
        status: "not_ready"
      },

      requestId: req.requestId
    });
  }
});

export default router;