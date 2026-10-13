import { describe, it, expect, vi } from "vitest";
import authorize from "./authorize.middleware.js";
import AppError from "../errors/app-error.js";

describe("authorize middleware", () => {
  it("1. calls next() with an AppError (401 AUTH_REQUIRED) when req.user is missing", () => {
    const middleware = authorize("admin", "manager");
    const req = {};
    const res = {};
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0];

    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe("AUTH_REQUIRED");
    expect(error.message).toBe("Authentication is required");
    expect(error.errors).toEqual([]);
    expect(error.isOperational).toBe(true);
  });

  it("2. calls next() with an AppError (403 FORBIDDEN) when user role is unauthorized", () => {
    const middleware = authorize("admin");
    const req = {
      user: {
        _id: "507f1f77bcf86cd799439011",
        role: "customer"
      }
    };
    const res = {};
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0];

    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(403);
    expect(error.code).toBe("FORBIDDEN");
    expect(error.message).toBe(
      "You do not have permission to access this resource"
    );
    expect(error.errors).toEqual([]);
    expect(error.isOperational).toBe(true);
  });

  it("3. calls next() without an error when user role is authorized", () => {
    const middleware = authorize("admin", "seller");
    const req = {
      user: {
        _id: "507f1f77bcf86cd799439011",
        role: "admin"
      }
    };
    const res = {};
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });
});
