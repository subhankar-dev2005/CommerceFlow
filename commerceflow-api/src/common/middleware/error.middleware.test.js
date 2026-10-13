import { describe, it, expect, vi, beforeEach } from "vitest";
import errorMiddleware from "./error.middleware.js";
import AppError from "../errors/app-error.js";
import { logger } from "../../config/logger.js";

describe("error.middleware - centralized error architecture", () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(logger, "error").mockImplementation(() => {});

    req = {
      requestId: "req-err-test-123",
      method: "POST",
      originalUrl: "/api/v1/test"
    };

    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };

    next = vi.fn();
  });

  it("1. handles operational AppError and preserves status, code, message, details, and requestId", () => {
    const operationalError = new AppError(
      "Something went wrong",
      400,
      [],
      "TEST_ERROR"
    );

    errorMiddleware(operationalError, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: "TEST_ERROR",
        message: "Something went wrong",
        details: []
      },
      requestId: "req-err-test-123"
    });
  });

  it("2. handles unexpected/non-operational error with 500 INTERNAL_SERVER_ERROR without exposing raw message or stack", () => {
    const rawError = new Error("Fatal unhandled database failure at node_modules/internal.js");

    errorMiddleware(rawError, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Internal server error",
        details: []
      },
      requestId: "req-err-test-123"
    });

    const responsePayload = res.json.mock.calls[0][0];
    const payloadString = JSON.stringify(responsePayload);

    expect(payloadString).not.toContain("Fatal unhandled database failure");
    expect(payloadString).not.toContain("node_modules");
    expect(responsePayload.stack).toBeUndefined();
    expect(responsePayload.error.stack).toBeUndefined();
  });

  it("3. normalizes MongoDB duplicate-key error (11000) to 409 DUPLICATE_RESOURCE and masks internal DB details", () => {
    const mongoDuplicateError = {
      code: 11000,
      name: "MongoServerError",
      keyPattern: { email: 1 },
      keyValue: { email: "user@example.com" },
      message:
        'E11000 duplicate key error collection: commerceflow.users index: email_1 dup key: { email: "user@example.com" }'
    };

    errorMiddleware(mongoDuplicateError, req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: "DUPLICATE_RESOURCE",
        message: "Resource already exists",
        details: []
      },
      requestId: "req-err-test-123"
    });

    const jsonPayload = res.json.mock.calls[0][0];
    const payloadString = JSON.stringify(jsonPayload);
    expect(payloadString).not.toContain("commerceflow.users");
    expect(payloadString).not.toContain("email_1");
    expect(payloadString).not.toContain("user@example.com");
    expect(payloadString).not.toContain("E11000");
  });

  it("4. normalizes Mongoose CastError to 400 INVALID_ID and masks raw CastError details", () => {
    const castError = {
      name: "CastError",
      message:
        'Cast to ObjectId failed for value "not-a-valid-id" at path "_id" for model "Product"',
      path: "_id",
      value: "not-a-valid-id"
    };

    errorMiddleware(castError, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: "INVALID_ID",
        message: "Invalid resource identifier",
        details: []
      },
      requestId: "req-err-test-123"
    });

    const payloadString = JSON.stringify(res.json.mock.calls[0][0]);
    expect(payloadString).not.toContain("Cast to ObjectId failed");
    expect(payloadString).not.toContain("not-a-valid-id");
  });

  it("5. normalizes Mongoose ValidationError to 400 VALIDATION_ERROR with structured { field, message } details", () => {
    const validationError = {
      name: "ValidationError",
      message: "Validation failed: price: Path `price` is required.",
      errors: {
        price: {
          path: "price",
          message: "Path `price` is required."
        },
        name: {
          path: "name",
          message: "Product name must contain at least 2 characters"
        }
      }
    };

    errorMiddleware(validationError, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Validation failed",
        details: [
          { field: "price", message: "Path `price` is required." },
          {
            field: "name",
            message: "Product name must contain at least 2 characters"
          }
        ]
      },
      requestId: "req-err-test-123"
    });
  });

  it("6. handles body-parser entity.too.large with 413 PAYLOAD_TOO_LARGE and details: []", () => {
    const payloadTooLargeError = {
      type: "entity.too.large",
      message: "request entity too large"
    };

    errorMiddleware(payloadTooLargeError, req, res, next);

    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: "Request body is too large",
        details: []
      },
      requestId: "req-err-test-123"
    });
  });

  it("7. handles body-parser entity.parse.failed with 400 INVALID_JSON and details: []", () => {
    const parseFailedError = {
      type: "entity.parse.failed",
      message: "Unexpected token in JSON at position 4"
    };

    errorMiddleware(parseFailedError, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: "INVALID_JSON",
        message: "Request body contains invalid JSON",
        details: []
      },
      requestId: "req-err-test-123"
    });
  });

  it("8. preserves req.requestId when present and falls back to null when absent", () => {
    // 1) With requestId
    const errWithId = new AppError("Error with requestId", 400, [], "BAD_REQUEST");
    errorMiddleware(errWithId, req, res, next);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: "req-err-test-123" })
    );

    // 2) Without requestId
    const reqWithoutId = {
      method: "GET",
      originalUrl: "/api/v1/no-id"
    };
    const resWithoutId = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };
    const errWithoutId = new AppError("Error without requestId", 400, [], "BAD_REQUEST");

    errorMiddleware(errWithoutId, reqWithoutId, resWithoutId, next);

    expect(resWithoutId.json).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: null })
    );
  });

  it("9. logs errors with logger.error including request context and error details", () => {
    const error = new AppError("Logged error", 403, [], "FORBIDDEN");

    errorMiddleware(error, req, res, next);

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      {
        err: error,
        requestId: "req-err-test-123",
        method: "POST",
        url: "/api/v1/test",
        statusCode: 403,
        errorCode: "FORBIDDEN"
      },
      "Logged error"
    );
  });

  it("10. protects sensitive internal information from being exposed in HTTP responses", () => {
    const sensitiveError = new Error(
      "MongoServerError: users collection internal database details"
    );

    errorMiddleware(sensitiveError, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);

    const responsePayload = res.json.mock.calls[0][0];
    const stringified = JSON.stringify(responsePayload);

    expect(stringified).not.toContain("MongoServerError");
    expect(stringified).not.toContain("users collection internal database details");
    expect(responsePayload.error.message).toBe("Internal server error");
    expect(responsePayload.error.details).toEqual([]);
  });
});
