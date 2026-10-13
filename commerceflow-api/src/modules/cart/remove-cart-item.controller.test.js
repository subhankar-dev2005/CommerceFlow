import {
  describe,
  it,
  expect,
  beforeEach,
  vi
} from "vitest";

import removeCartItem from "./remove-cart-item.controller.js";
import Cart from "./cart.model.js";

describe("removeCartItem", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns CART_NOT_FOUND when the cart does not exist", async () => {
    vi.spyOn(Cart, "findOne")
      .mockResolvedValue(null);

    const req = {
      params: {
        productId: "507f1f77bcf86cd799439011"
      },
      user: {
        _id: "507f1f77bcf86cd799439012"
      }
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    const next = vi.fn();

    await removeCartItem(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        code: "CART_NOT_FOUND"
      })
    );

    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns CART_ITEM_NOT_FOUND when the product is not in the cart", async () => {
    const cart = {
      items: [
        {
          product: {
            toString: () => "507f1f77bcf86cd799439099"
          },
          quantity: 2
        }
      ]
    };

    vi.spyOn(Cart, "findOne")
      .mockResolvedValue(cart);

    const req = {
      params: {
        productId: "507f1f77bcf86cd799439011"
      },
      user: {
        _id: "507f1f77bcf86cd799439012"
      }
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    const next = vi.fn();

    await removeCartItem(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        code: "CART_ITEM_NOT_FOUND"
      })
    );

    expect(res.status).not.toHaveBeenCalled();
  });

  it("removes the cart item successfully", async () => {
    const productId = "507f1f77bcf86cd799439011";

    const itemToRemove = {
      product: {
        toString: () => productId
      },
      quantity: 2
    };

    const remainingItem = {
      product: {
        toString: () => "507f1f77bcf86cd799439099"
      },
      quantity: 1
    };

    const cart = {
      items: [
        itemToRemove,
        remainingItem
      ],
      save: vi.fn().mockResolvedValue(true)
    };

    vi.spyOn(Cart, "findOne")
      .mockResolvedValue(cart);

    const req = {
      params: {
        productId
      },
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

    await removeCartItem(req, res, next);

    expect(cart.items).toHaveLength(1);

    expect(
      cart.items[0].product.toString()
    ).toBe("507f1f77bcf86cd799439099");

    expect(cart.save).toHaveBeenCalledTimes(1);

    expect(res.status).toHaveBeenCalledWith(200);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Product removed from cart successfully",
      data: {
        cart
      },
      requestId: "test-request-id"
    });

    expect(next).not.toHaveBeenCalled();
  });

  it("removes only the matching product when the cart has multiple items", async () => {
    const productId = "507f1f77bcf86cd799439011";

    const cart = {
      items: [
        {
          product: {
            toString: () => productId
          },
          quantity: 2
        },
        {
          product: {
            toString: () => "507f1f77bcf86cd799439099"
          },
          quantity: 3
        },
        {
          product: {
            toString: () => "507f1f77bcf86cd799439088"
          },
          quantity: 1
        }
      ],
      save: vi.fn().mockResolvedValue(true)
    };

    vi.spyOn(Cart, "findOne")
      .mockResolvedValue(cart);

    const req = {
      params: {
        productId
      },
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

    await removeCartItem(req, res, next);

    expect(cart.items).toHaveLength(2);

    expect(
      cart.items.some(
        (item) =>
          item.product.toString() === productId
      )
    ).toBe(false);

    expect(
      cart.items.some(
        (item) =>
          item.product.toString() ===
          "507f1f77bcf86cd799439099"
      )
    ).toBe(true);

    expect(
      cart.items.some(
        (item) =>
          item.product.toString() ===
          "507f1f77bcf86cd799439088"
      )
    ).toBe(true);

    expect(cart.save).toHaveBeenCalledTimes(1);

    expect(next).not.toHaveBeenCalled();
  });
});