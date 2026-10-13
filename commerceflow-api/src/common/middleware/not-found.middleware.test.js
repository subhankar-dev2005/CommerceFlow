import { describe, it, expect, vi } from "vitest";
import notFoundMiddleware from "./not-found.middleware.js";

describe("notFoundMiddleware", () => {
  it("returns 404 with standard ROUTE_NOT_FOUND error shape including empty details array", () => {
    const req = {
      method: "GET",
      originalUrl: "/api/v1/unknown",
      requestId: "req-12345"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };

    notFoundMiddleware(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: "ROUTE_NOT_FOUND",
        message: "Route GET /api/v1/unknown not found",
        details: []
      },
      requestId: "req-12345"
    });
  });

  it("defaults requestId to null when req.requestId is not present", () => {
    const req = {
      method: "POST",
      originalUrl: "/api/v1/missing"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };

    notFoundMiddleware(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: "ROUTE_NOT_FOUND",
        message: "Route POST /api/v1/missing not found",
        details: []
      },
      requestId: null
    });
  });
});
