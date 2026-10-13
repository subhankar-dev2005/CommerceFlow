import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createProcessHandlers } from "./process-handlers.js";

describe("Process-level error handlers and graceful shutdown", () => {
  let mockLogger;
  let mockServer;
  let mockDisconnectDb;
  let mockExitProcess;

  beforeEach(() => {
    vi.useFakeTimers();

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn()
    };

    mockServer = {
      close: vi.fn((cb) => cb(null))
    };

    mockDisconnectDb = vi.fn().mockResolvedValue();
    mockExitProcess = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("1. logs uncaughtException with correct context and initiates fatal shutdown", async () => {
    const handlers = createProcessHandlers({
      getServer: () => mockServer,
      disconnectDb: mockDisconnectDb,
      loggerInstance: mockLogger,
      exitProcess: mockExitProcess,
      timeoutMs: 5000
    });

    const error = new Error("Test uncaught exception");
    await handlers.handleUncaughtException(error);

    // 1. Logged with correct context
    expect(mockLogger.fatal).toHaveBeenCalledWith(
      expect.objectContaining({
        err: error,
        event: "uncaughtException"
      }),
      "Uncaught exception detected"
    );

    // 4. Fatal shutdown initiated
    expect(mockServer.close).toHaveBeenCalledTimes(1);
    expect(mockDisconnectDb).toHaveBeenCalledTimes(1);
    expect(mockExitProcess).toHaveBeenCalledWith(1);
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        signal: "uncaughtException",
        exitCode: 1
      }),
      "Application shutdown completed"
    );
  });

  it("2. logs unhandledRejection with correct context and initiates fatal shutdown", async () => {
    const handlers = createProcessHandlers({
      getServer: () => mockServer,
      disconnectDb: mockDisconnectDb,
      loggerInstance: mockLogger,
      exitProcess: mockExitProcess,
      timeoutMs: 5000
    });

    const rejectionError = new Error("Database query timed out");
    await handlers.handleUnhandledRejection(rejectionError);

    // 2. Logged with correct context
    expect(mockLogger.fatal).toHaveBeenCalledWith(
      expect.objectContaining({
        err: rejectionError,
        event: "unhandledRejection"
      }),
      "Unhandled promise rejection detected"
    );

    // Fatal shutdown initiated
    expect(mockServer.close).toHaveBeenCalledTimes(1);
    expect(mockDisconnectDb).toHaveBeenCalledTimes(1);
    expect(mockExitProcess).toHaveBeenCalledWith(1);
  });

  it("3. handles non-Error rejection values safely without throwing", async () => {
    const handlers = createProcessHandlers({
      getServer: () => mockServer,
      disconnectDb: mockDisconnectDb,
      loggerInstance: mockLogger,
      exitProcess: mockExitProcess,
      timeoutMs: 5000
    });

    // Test with a string rejection value
    await handlers.handleUnhandledRejection("String rejection reason");

    expect(mockLogger.fatal).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "unhandledRejection",
        err: expect.any(Error)
      }),
      "Unhandled promise rejection detected"
    );
    expect(mockExitProcess).toHaveBeenCalledWith(1);

    // Test with an object rejection value
    const handlers2 = createProcessHandlers({
      getServer: () => mockServer,
      disconnectDb: mockDisconnectDb,
      loggerInstance: mockLogger,
      exitProcess: mockExitProcess,
      timeoutMs: 5000
    });

    await handlers2.handleUnhandledRejection({ code: "ERR_CUSTOM", status: 500 });
    expect(mockLogger.fatal).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "unhandledRejection",
        err: expect.any(Error)
      }),
      "Unhandled promise rejection detected"
    );
  });

  it("4. initiates clean graceful shutdown on SIGTERM / SIGINT with exitCode 0", async () => {
    const handlers = createProcessHandlers({
      getServer: () => mockServer,
      disconnectDb: mockDisconnectDb,
      loggerInstance: mockLogger,
      exitProcess: mockExitProcess,
      timeoutMs: 5000
    });

    await handlers.shutdown({ signal: "SIGTERM", exitCode: 0 });

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ signal: "SIGTERM" }),
      "Graceful shutdown started"
    );
    expect(mockServer.close).toHaveBeenCalledTimes(1);
    expect(mockDisconnectDb).toHaveBeenCalledTimes(1);
    expect(mockExitProcess).toHaveBeenCalledWith(0);
  });

  it("5. prevents duplicate shutdown attempts from running cleanup multiple times", async () => {
    const handlers = createProcessHandlers({
      getServer: () => mockServer,
      disconnectDb: mockDisconnectDb,
      loggerInstance: mockLogger,
      exitProcess: mockExitProcess,
      timeoutMs: 5000
    });

    // Fire first shutdown
    const promise1 = handlers.shutdown({ signal: "uncaughtException", exitCode: 1 });
    // Fire second duplicate shutdown concurrently (e.g. SIGTERM while exception is shutting down)
    const promise2 = handlers.shutdown({ signal: "SIGTERM", exitCode: 0 });

    await Promise.all([promise1, promise2]);

    expect(mockServer.close).toHaveBeenCalledTimes(1);
    expect(mockDisconnectDb).toHaveBeenCalledTimes(1);
    expect(mockExitProcess).toHaveBeenCalledTimes(1);
    expect(mockExitProcess).toHaveBeenCalledWith(1);
  });

  it("6. bounds shutdown duration and forces process exit if cleanup hangs", async () => {
    // Hanging server.close that never invokes callback
    const hangingServer = {
      close: vi.fn(() => {})
    };

    const handlers = createProcessHandlers({
      getServer: () => hangingServer,
      disconnectDb: mockDisconnectDb,
      loggerInstance: mockLogger,
      exitProcess: mockExitProcess,
      timeoutMs: 3000
    });

    // Start shutdown (does not resolve because server.close hangs)
    handlers.shutdown({ signal: "uncaughtException", exitCode: 1 });

    expect(mockExitProcess).not.toHaveBeenCalled();

    // Advance time past the bounded timeout
    vi.advanceTimersByTime(3000);

    expect(mockLogger.fatal).toHaveBeenCalledWith(
      expect.objectContaining({ signal: "uncaughtException" }),
      "Graceful shutdown timed out, forcing exit"
    );
    expect(mockExitProcess).toHaveBeenCalledWith(1);
  });

  it("registers listeners on process target", () => {
    const mockProcess = {
      on: vi.fn()
    };

    const handlers = createProcessHandlers();
    handlers.register(mockProcess);

    expect(mockProcess.on).toHaveBeenCalledWith("uncaughtException", expect.any(Function));
    expect(mockProcess.on).toHaveBeenCalledWith("unhandledRejection", expect.any(Function));
    expect(mockProcess.on).toHaveBeenCalledWith("SIGTERM", expect.any(Function));
    expect(mockProcess.on).toHaveBeenCalledWith("SIGINT", expect.any(Function));
  });
});
