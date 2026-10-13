import { describe, it, expect, vi, beforeEach } from "vitest";
import Address from "./address.model.js";
import AppError from "../../common/errors/app-error.js";
import {
  updateAddress,
  setDefaultAddress,
  deleteAddress
} from "./address.controller.js";

describe("address.controller - missing-address AppError handling", () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    vi.restoreAllMocks();

    req = {
      params: {
        addressId: "507f1f77bcf86cd799439011"
      },
      user: {
        _id: "507f1f77bcf86cd799439099"
      },
      body: {},
      requestId: "req-address-test-123"
    };

    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };

    next = vi.fn();
  });

  it("1. updateAddress: forwards an AppError (404 ADDRESS_NOT_FOUND) to next() when address does not exist", async () => {
    vi.spyOn(Address, "findOne").mockResolvedValue(null);

    await updateAddress(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0];

    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe("ADDRESS_NOT_FOUND");
    expect(error.message).toBe("Address not found");
    expect(error.errors).toEqual([]);
    expect(error.isOperational).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("2. setDefaultAddress: forwards an AppError (404 ADDRESS_NOT_FOUND) to next() when address does not exist", async () => {
    vi.spyOn(Address, "findOne").mockResolvedValue(null);

    await setDefaultAddress(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0];

    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe("ADDRESS_NOT_FOUND");
    expect(error.message).toBe("Address not found");
    expect(error.errors).toEqual([]);
    expect(error.isOperational).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("3. deleteAddress: forwards an AppError (404 ADDRESS_NOT_FOUND) to next() when address does not exist", async () => {
    vi.spyOn(Address, "findOne").mockResolvedValue(null);

    await deleteAddress(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0];

    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe("ADDRESS_NOT_FOUND");
    expect(error.message).toBe("Address not found");
    expect(error.errors).toEqual([]);
    expect(error.isOperational).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
  });
});
