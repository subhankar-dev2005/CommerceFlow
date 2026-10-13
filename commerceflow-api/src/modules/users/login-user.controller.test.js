import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn()
  }
}));

vi.mock("./user.model.js", () => ({
  default: {
    findOne: vi.fn()
  }
}));

vi.mock("../../utils/generate-token.js", () => ({
  default: vi.fn()
}));

import bcrypt from "bcryptjs";
import User from "./user.model.js";
import generateToken from "../../utils/generate-token.js";
import loginUser from "./login-user.controller.js";

describe("loginUser", () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    vi.clearAllMocks();

    req = {
      body: {
        email: "testcustomer@commerceflow.com",
        password: "correct-password"
      },
      requestId: "test-request-id"
    };

    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      cookie: vi.fn().mockReturnThis()
    };

    next = vi.fn();
  });

  it("logs in successfully with valid credentials", async () => {
    const user = {
      _id: "507f1f77bcf86cd799439011",
      name: "Test Customer",
      email: "testcustomer@commerceflow.com",
      role: "customer",
      password: "hashed-password"
    };

    const select = vi.fn().mockResolvedValue(user);

    User.findOne.mockReturnValue({
      select
    });

    bcrypt.compare.mockResolvedValue(true);
    generateToken.mockReturnValue("test-jwt-token");

    await loginUser(req, res, next);

    expect(User.findOne).toHaveBeenCalledWith({
      email: "testcustomer@commerceflow.com"
    });

    expect(select).toHaveBeenCalledWith("+password");

    expect(bcrypt.compare).toHaveBeenCalledWith(
      "correct-password",
      "hashed-password"
    );

    expect(generateToken).toHaveBeenCalledWith({
      userId: "507f1f77bcf86cd799439011",
      email: "testcustomer@commerceflow.com",
      role: "customer"
    });

    expect(res.status).toHaveBeenCalledWith(200);

    // JWT must NOT appear in the JSON response body
    const jsonPayload = res.json.mock.calls[0][0];
    expect(jsonPayload).toMatchObject({
      success: true,
      message: "User logged in successfully",
      data: {
        user: {
          id: "507f1f77bcf86cd799439011",
          name: "Test Customer",
          email: "testcustomer@commerceflow.com",
          role: "customer"
        }
      },
      requestId: "test-request-id"
    });
    // Explicitly assert no token field in the body (Phase 3 security contract)
    expect(jsonPayload.data.token).toBeUndefined();
    expect(jsonPayload.data.accessToken).toBeUndefined();

    // JWT must be delivered via HttpOnly cookie, not response body
    expect(res.cookie).toHaveBeenCalledTimes(1);
    const [cookieName, cookieValue, cookieOptions] = res.cookie.mock.calls[0];
    expect(cookieName).toBe("auth_token");
    expect(cookieValue).toBe("test-jwt-token");
    expect(cookieOptions.httpOnly).toBe(true);
    expect(cookieOptions.sameSite).toBe("lax");
    expect(cookieOptions.path).toBe("/");
    expect(cookieOptions.maxAge).toBeGreaterThan(0);

    expect(next).not.toHaveBeenCalled();
  });

  it("rejects login when user does not exist", async () => {
    const select = vi.fn().mockResolvedValue(null);

    User.findOne.mockReturnValue({
      select
    });

    await loginUser(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);

    const error = next.mock.calls[0][0];

    expect(error.statusCode).toBe(401);
    expect(error.code).toBe("INVALID_CREDENTIALS");
    expect(error.message).toBe(
      "Invalid email or password"
    );

    expect(bcrypt.compare).not.toHaveBeenCalled();
    expect(generateToken).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects login when password is incorrect", async () => {
    const user = {
      _id: "507f1f77bcf86cd799439011",
      name: "Test Customer",
      email: "testcustomer@commerceflow.com",
      role: "customer",
      password: "hashed-password"
    };

    const select = vi.fn().mockResolvedValue(user);

    User.findOne.mockReturnValue({
      select
    });

    bcrypt.compare.mockResolvedValue(false);

    await loginUser(req, res, next);

    expect(bcrypt.compare).toHaveBeenCalledWith(
      "correct-password",
      "hashed-password"
    );

    expect(next).toHaveBeenCalledTimes(1);

    const error = next.mock.calls[0][0];

    expect(error.statusCode).toBe(401);
    expect(error.code).toBe("INVALID_CREDENTIALS");
    expect(error.message).toBe(
      "Invalid email or password"
    );

    expect(generateToken).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects login when customer account is deactivated (isActive=false)", async () => {
    const user = {
      _id: "507f1f77bcf86cd799439011",
      name: "Inactive Customer",
      email: "testcustomer@commerceflow.com",
      role: "customer",
      isActive: false,
      password: "hashed-password"
    };

    const select = vi.fn().mockResolvedValue(user);

    User.findOne.mockReturnValue({
      select
    });

    bcrypt.compare.mockResolvedValue(true);

    await loginUser(req, res, next);

    expect(bcrypt.compare).toHaveBeenCalledWith(
      "correct-password",
      "hashed-password"
    );

    expect(next).toHaveBeenCalledTimes(1);

    const error = next.mock.calls[0][0];

    expect(error.statusCode).toBe(401);
    expect(error.code).toBe("ACCOUNT_DEACTIVATED");
    expect(error.message).toBe("User account is deactivated");
    expect(generateToken).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("logs in successfully when admin account is active", async () => {
    const adminUser = {
      _id: "507f1f77bcf86cd799439099",
      name: "Admin User",
      email: "admin@commerceflow.com",
      role: "admin",
      isActive: true,
      password: "hashed-password"
    };

    const select = vi.fn().mockResolvedValue(adminUser);

    User.findOne.mockReturnValue({
      select
    });

    bcrypt.compare.mockResolvedValue(true);
    generateToken.mockReturnValue("test-admin-jwt-token");

    req.body.email = "admin@commerceflow.com";

    await loginUser(req, res, next);

    expect(generateToken).toHaveBeenCalledWith({
      userId: "507f1f77bcf86cd799439099",
      email: "admin@commerceflow.com",
      role: "admin"
    });

    expect(res.status).toHaveBeenCalledWith(200);

    // JWT must NOT appear in the JSON response body (Phase 3 security contract)
    const adminJsonPayload = res.json.mock.calls[0][0];
    expect(adminJsonPayload).toMatchObject({
      success: true,
      message: "User logged in successfully",
      data: {
        user: {
          id: "507f1f77bcf86cd799439099",
          name: "Admin User",
          email: "admin@commerceflow.com",
          role: "admin"
        }
      },
      requestId: "test-request-id"
    });
    expect(adminJsonPayload.data.token).toBeUndefined();
    expect(adminJsonPayload.data.accessToken).toBeUndefined();

    // JWT delivered via HttpOnly cookie only
    expect(res.cookie).toHaveBeenCalledTimes(1);
    const [adminCookieName, adminCookieValue, adminCookieOptions] = res.cookie.mock.calls[0];
    expect(adminCookieName).toBe("auth_token");
    expect(adminCookieValue).toBe("test-admin-jwt-token");
    expect(adminCookieOptions.httpOnly).toBe(true);

    expect(next).not.toHaveBeenCalled();
  });

  it("rejects login when admin account is deactivated (isActive=false)", async () => {
    const adminUser = {
      _id: "507f1f77bcf86cd799439099",
      name: "Inactive Admin",
      email: "admin@commerceflow.com",
      role: "admin",
      isActive: false,
      password: "hashed-password"
    };

    const select = vi.fn().mockResolvedValue(adminUser);

    User.findOne.mockReturnValue({
      select
    });

    bcrypt.compare.mockResolvedValue(true);

    req.body.email = "admin@commerceflow.com";

    await loginUser(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);

    const error = next.mock.calls[0][0];

    expect(error.statusCode).toBe(401);
    expect(error.code).toBe("ACCOUNT_DEACTIVATED");
    expect(error.message).toBe("User account is deactivated");
    expect(generateToken).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects login with INVALID_CREDENTIALS when password is wrong even if user is deactivated", async () => {
    const user = {
      _id: "507f1f77bcf86cd799439011",
      name: "Inactive Customer",
      email: "testcustomer@commerceflow.com",
      role: "customer",
      isActive: false,
      password: "hashed-password"
    };

    const select = vi.fn().mockResolvedValue(user);

    User.findOne.mockReturnValue({
      select
    });

    bcrypt.compare.mockResolvedValue(false);

    await loginUser(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);

    const error = next.mock.calls[0][0];

    expect(error.statusCode).toBe(401);
    expect(error.code).toBe("INVALID_CREDENTIALS");
    expect(error.message).toBe("Invalid email or password");
    expect(generateToken).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
