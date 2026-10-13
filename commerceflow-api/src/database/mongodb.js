import mongoose from "mongoose";

import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

export async function connectMongoDB() {
  try {
    await mongoose.connect(
      env.MONGODB_URI
    );

    logger.info(
      {
        host:
          mongoose.connection.host,
        database:
          mongoose.connection.name
      },
      "MongoDB connected"
    );
  } catch (error) {
    logger.fatal(
      { error },
      "MongoDB connection failed"
    );

    throw error;
  }
}

export async function disconnectMongoDB() {
  if (
    mongoose.connection.readyState !==
    mongoose.ConnectionStates.disconnected
  ) {
    await mongoose.disconnect();

    logger.info(
      "MongoDB disconnected"
    );
  }
}

export function getMongoDBStatus() {
  const states = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting"
  };

  return {
    status:
      states[mongoose.connection.readyState],
    readyState:
      mongoose.connection.readyState
  };
}

/**
 * Performs a lightweight ping against the existing MongoDB connection.
 *
 * Uses the application's existing Mongoose connection — no second client.
 * Rejects with an error when:
 * - the connection is not in the "connected" state (readyState !== 1), or
 * - the ping command does not respond within `timeoutMs`.
 *
 * @param {number} [timeoutMs=3000] Maximum milliseconds to wait for the ping.
 * @returns {Promise<void>} Resolves when ping succeeds; rejects otherwise.
 */
export async function pingMongoDB(timeoutMs = 3000) {
  /*
   * Short-circuit immediately for non-connected states.
   * This avoids issuing a command that will never return
   * when the driver is disconnected or disconnecting.
   */
  const state = mongoose.connection.readyState;
  if (state !== 1) {
    throw new Error(
      `MongoDB connection is not ready (readyState=${state})`
    );
  }

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error("MongoDB db handle is not available");
  }

  const pingPromise = db.command({ ping: 1 });

  const timeoutPromise = new Promise((_resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`MongoDB ping timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    /*
     * Unref the timer so it does not prevent Node.js from exiting
     * naturally during tests or graceful shutdown sequences.
     */
    if (typeof timer.unref === "function") {
      timer.unref();
    }
  });

  await Promise.race([pingPromise, timeoutPromise]);
}
