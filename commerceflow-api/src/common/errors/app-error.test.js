import { describe, it, expect } from "vitest";
import AppError from "./app-error.js";

describe("AppError", () => {
  it("1. extends the built-in Error class", () => {
    const error = new AppError("Test error");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
    expect(error.name).toBe("AppError");
  });

  it("2. preserves supplied message", () => {
    const message = "Custom failure message";
    const error = new AppError(message);

    expect(error.message).toBe(message);
  });

  it("3. preserves supplied statusCode", () => {
    const error = new AppError("Forbidden", 403);

    expect(error.statusCode).toBe(403);
  });

  it("4. preserves supplied errors array", () => {
    const details = [{ field: "email", message: "Email is already taken" }];
    const error = new AppError("Validation failed", 422, details);

    expect(error.errors).toEqual(details);
  });

  it("5. preserves supplied code", () => {
    const error = new AppError(
      "Resource not found",
      404,
      [],
      "NOT_FOUND_CODE"
    );

    expect(error.code).toBe("NOT_FOUND_CODE");
  });

  it("6. sets isOperational to true", () => {
    const error = new AppError("Operational failure");

    expect(error.isOperational).toBe(true);
  });

  it("7. captures an appropriate stack trace", () => {
    const error = new AppError("Stack trace test");

    expect(error.stack).toBeDefined();
    expect(typeof error.stack).toBe("string");
    expect(error.stack).toContain("AppError");
  });

  it("8. applies correct default values when optional constructor arguments are omitted", () => {
    const error = new AppError("Only message provided");

    expect(error.statusCode).toBe(500);
    expect(error.errors).toEqual([]);
    expect(error.code).toBe("INTERNAL_SERVER_ERROR");
    expect(error.isOperational).toBe(true);
  });
});
