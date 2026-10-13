import { logger as defaultLogger } from "../config/logger.js";
import { disconnectMongoDB as defaultDisconnectMongoDB } from "../database/mongodb.js";

/**
 * Creates process-level exception/rejection and graceful shutdown handlers.
 *
 * @param {Object} options
 * @param {Function} [options.getServer] Function returning the running http.Server instance
 * @param {Function} [options.disconnectDb] Function to disconnect from database
 * @param {Object} [options.loggerInstance] Structured logger instance
 * @param {Function} [options.exitProcess] Function to exit the process
 * @param {number} [options.timeoutMs] Bounded cleanup timeout in ms
 */
export function createProcessHandlers({
  getServer = () => null,
  disconnectDb = defaultDisconnectMongoDB,
  loggerInstance = defaultLogger,
  exitProcess = (code) => process.exit(code),
  timeoutMs = 10000
} = {}) {
  let isShuttingDown = false;

  async function shutdown({ signal, exitCode = 0, err = null }) {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;

    if (exitCode !== 0) {
      loggerInstance.fatal(
        { signal, err, event: signal },
        `Fatal process error (${signal}), initiating graceful shutdown`
      );
    } else {
      loggerInstance.info(
        { signal },
        "Graceful shutdown started"
      );
    }

    const forceTimer = setTimeout(() => {
      loggerInstance.fatal(
        { signal },
        "Graceful shutdown timed out, forcing exit"
      );
      exitProcess(exitCode !== 0 ? exitCode : 1);
    }, timeoutMs);

    if (typeof forceTimer.unref === "function") {
      forceTimer.unref();
    }

    try {
      const server = getServer();
      if (server && typeof server.close === "function") {
        await new Promise((resolve) => {
          server.close((closeErr) => {
            if (closeErr) {
              loggerInstance.error(
                { err: closeErr },
                "Error closing HTTP server"
              );
            }
            resolve();
          });
        });
      }

      if (typeof disconnectDb === "function") {
        await disconnectDb();
      }

      clearTimeout(forceTimer);

      loggerInstance.info(
        { signal, exitCode },
        "Application shutdown completed"
      );
      exitProcess(exitCode);
    } catch (shutdownError) {
      clearTimeout(forceTimer);
      loggerInstance.error(
        { err: shutdownError },
        "Shutdown failed"
      );
      exitProcess(1);
    }
  }

  function handleUncaughtException(error) {
    const normalizedError =
      error instanceof Error
        ? error
        : new Error(
            typeof error === "string"
              ? error
              : "Uncaught exception with non-error value"
          );

    loggerInstance.fatal(
      {
        err: normalizedError,
        event: "uncaughtException"
      },
      "Uncaught exception detected"
    );

    return shutdown({
      signal: "uncaughtException",
      exitCode: 1,
      err: normalizedError
    });
  }

  function handleUnhandledRejection(reason, promise) {
    const normalizedError =
      reason instanceof Error
        ? reason
        : new Error(
            typeof reason === "string"
              ? reason
              : reason !== undefined && reason !== null
                ? JSON.stringify(reason)
                : "Unhandled promise rejection with non-error value"
          );

    loggerInstance.fatal(
      {
        err: normalizedError,
        event: "unhandledRejection"
      },
      "Unhandled promise rejection detected"
    );

    return shutdown({
      signal: "unhandledRejection",
      exitCode: 1,
      err: normalizedError
    });
  }

  function register(processTarget = process) {
    processTarget.on("uncaughtException", handleUncaughtException);
    processTarget.on("unhandledRejection", handleUnhandledRejection);
    processTarget.on("SIGTERM", () =>
      shutdown({ signal: "SIGTERM", exitCode: 0 })
    );
    processTarget.on("SIGINT", () =>
      shutdown({ signal: "SIGINT", exitCode: 0 })
    );
  }

  return {
    shutdown,
    handleUncaughtException,
    handleUnhandledRejection,
    register,
    getIsShuttingDown: () => isShuttingDown
  };
}
