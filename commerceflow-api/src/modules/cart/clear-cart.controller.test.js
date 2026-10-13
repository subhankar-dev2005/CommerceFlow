import {
  describe,
  it,
  expect,
  beforeEach,
  vi
} from "vitest";

import clearCart from "./clear-cart.controller.js";
import Cart from "./cart.model.js";

describe("clearCart", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns CART_NOT_FOUND when the cart does not exist", async () => {
    vi.spyOn(Cart, "findOne")
      .mockResolvedValue(null);

    const req = {
      user: {
        _id: "507f1f77bcf86cd799439012"
      }
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    const next = vi.fn();

    await clearCart(req, res, next);

    expect(Cart.findOne).toHaveBeenCalledWith({
      user: "507f1f77bcf86cd799439012"
    });

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        code: "CART_NOT_FOUND"
      })
    );

    expect(res.status).not.toHaveBeenCalled();
  });

  it("clears all items from the cart successfully", async () => {
    const cart = {
      items: [
        {
          product: {
            toString: () => "507f1f77bcf86cd799439011"
          },
          quantity: 2
        },
        {
          product: {
            toString: () => "507f1f77bcf86cd799439099"
          },
          quantity: 3
        }
      ],
      save: vi.fn().mockResolvedValue(true)
    };

    vi.spyOn(Cart, "findOne")
      .mockResolvedValue(cart);

    const req = {
      user: {
        _id: "507f1f77bcf86cd799439012"
      },
      requestId: "test-request-id"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    const next = vi.fn();

    await clearCart(req, res, next);

    expect(cart.items).toEqual([]);

    expect(cart.save).toHaveBeenCalledTimes(1);

    expect(res.status).toHaveBeenCalledWith(200);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Cart cleared successfully",
      data: {
        cart
      },
      requestId: "test-request-id"
    });

    expect(next).not.toHaveBeenCalled();
  });

  it("keeps the cart document and removes every item", async () => {
    const cart = {
      user: "507f1f77bcf86cd799439012",
      items: [
        {
          product: {
            toString: () => "507f1f77bcf86cd799439011"
          },
          quantity: 1
        },
        {
          product: {
            toString: () => "507f1f77bcf86cd799439099"
          },
          quantity: 5
        },
        {
          product: {
            toString: () => "507f1f77bcf86cd799439088"
          },
          quantity: 2
        }
      ],
      save: vi.fn().mockResolvedValue(true)
    };

    vi.spyOn(Cart, "findOne")
      .mockResolvedValue(cart);

    const req = {
      user: {
        _id: "507f1f77bcf86cd799439012"
      },
      requestId: "test-request-id"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    const next = vi.fn();

    await clearCart(req, res, next);

    expect(cart.user).toBe(
      "507f1f77bcf86cd799439012"
    );

    expect(cart.items).toHaveLength(0);

    expect(cart.save).toHaveBeenCalledTimes(1);

    expect(next).not.toHaveBeenCalled();
  });
});