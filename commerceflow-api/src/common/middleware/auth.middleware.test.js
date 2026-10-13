import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../utils/verify-token.js", () => ({
  default: vi.fn()
}));

vi.mock("../../modules/users/user.model.js", () => ({
  default: {
    findById: vi.fn()
  }
}));

import verifyToken from "../../utils/verify-token.js";
import User from "../../modules/users/user.model.js";
import authMiddleware from "./auth.middleware.js";

describe("authMiddleware", () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    vi.clearAllMocks();

    req = {
      headers: {
        authorization: "Bearer valid-token"
      },
      requestId: "test-request-id"
    };

    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };

    next = vi.fn();
  });

  it("allows active user through and sets req.user", async () => {
    const mockUser = {
      _id: "507f1f77bcf86cd799439011",
      email: "active@example.com",
      role: "customer",
      isActive: true
    };

    verifyToken.mockReturnValue({ userId: mockUser._id });
    User.findById.mockResolvedValue(mockUser);

    await authMiddleware(req, res, next);

    expect(verifyToken).toHaveBeenCalledWith("valid-token");
    expect(User.findById).toHaveBeenCalledWith(mockUser._id);
    expect(req.user).toEqual(mockUser);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it("rejects inactive user with status 401 and ACCOUNT_DEACTIVATED", async () => {
    const mockUser = {
      _id: "507f1f77bcf86cd799439011",
      email: "inactive@example.com",
      role: "customer",
      isActive: false
    };

    verifyToken.mockReturnValue({ userId: mockUser._id });
    User.findById.mockResolvedValue(mockUser);

    await authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0];
    expect(error).toBeDefined();
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe("ACCOUNT_DEACTIVATED");
    expect(error.message).toBe("User account is deactivated");
    expect(error.errors).toEqual([]);
    expect(req.user).toBeUndefined();
  });

  it("rejects request when authorization header is missing", async () => {
    req.headers = {};

    await authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe("AUTH_TOKEN_REQUIRED");
    expect(error.message).toBe("Authentication token is required");
  });

  it("rejects request when authorization header does not start with Bearer", async () => {
    req.headers.authorization = "Basic some-token";

    await authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe("AUTH_TOKEN_REQUIRED");
  });

  it("rejects request with INVALID_AUTH_TOKEN when token verification fails with JsonWebTokenError", async () => {
    const jwtError = new Error("invalid signature");
    jwtError.name = "JsonWebTokenError";
    verifyToken.mockImplementation(() => {
      throw jwtError;
    });

    await authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe("INVALID_AUTH_TOKEN");
    expect(error.message).toBe("Invalid authentication token");
  });

  it("rejects request with AUTH_TOKEN_EXPIRED when token verification fails with TokenExpiredError", async () => {
    const expiredError = new Error("jwt expired");
    expiredError.name = "TokenExpiredError";
    verifyToken.mockImplementation(() => {
      throw expiredError;
    });

    await authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe("AUTH_TOKEN_EXPIRED");
    expect(error.message).toBe("Authentication token has expired");
  });

  it("rejects request with USER_NOT_FOUND when user does not exist", async () => {
    verifyToken.mockReturnValue({ userId: "507f1f77bcf86cd799439011" });
    User.findById.mockResolvedValue(null);

    await authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe("USER_NOT_FOUND");
    expect(error.message).toBe("User no longer exists");
  });
});
