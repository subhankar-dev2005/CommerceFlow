import { createApp } from "./app.js";

import { env } from "./config/env.js";
import { logger } from "./config/logger.js";

import {
  connectMongoDB,
  disconnectMongoDB
} from "./database/mongodb.js";

import { createProcessHandlers } from "./common/process-handlers.js";

const app = createApp();

let server;

const processHandlers = createProcessHandlers({
  getServer: () => server,
  disconnectDb: disconnectMongoDB,
  loggerInstance: logger,
  exitProcess: (code) => process.exit(code),
  timeoutMs: 10000
});

processHandlers.register(process);

async function startServer() {
  try {
    await connectMongoDB();

    server = app.listen(
      env.PORT,
      () => {
        logger.info(
          {
            port: env.PORT
          },
          "CommerceFlow API started"
        );
      }
    );
  } catch (error) {
    logger.fatal(
      { error },
      "Application startup failed"
    );

    process.exit(1);
  }
}

startServer();