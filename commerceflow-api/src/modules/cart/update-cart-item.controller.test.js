import {
  describe,
  it,
  expect,
  beforeEach,
  vi
} from "vitest";

import {
  updateCartItem
} from "./update-cart-item.controller.js";

import Cart from "./cart.model.js";
import Product from "../products/product.model.js";

describe("updateCartItem", () => {
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
      body: {
        quantity: 3
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

    await updateCartItem(req, res, next);

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
      body: {
        quantity: 3
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

    await updateCartItem(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        code: "CART_ITEM_NOT_FOUND"
      })
    );

    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns PRODUCT_NOT_FOUND when the product is inactive or missing", async () => {
    const productId = "507f1f77bcf86cd799439011";

    const cart = {
      items: [
        {
          product: {
            toString: () => productId
          },
          quantity: 2
        }
      ]
    };

    vi.spyOn(Cart, "findOne")
      .mockResolvedValue(cart);

    vi.spyOn(Product, "findOne")
      .mockResolvedValue(null);

    const req = {
      params: {
        productId
      },
      body: {
        quantity: 3
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

    await updateCartItem(req, res, next);

    expect(Product.findOne).toHaveBeenCalledWith({
      _id: productId,
      isActive: true
    });

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        code: "PRODUCT_NOT_FOUND"
      })
    );

    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns INSUFFICIENT_STOCK when quantity exceeds product stock", async () => {
    const productId = "507f1f77bcf86cd799439011";

    const cartItem = {
      product: {
        toString: () => productId
      },
      quantity: 2
    };

    const cart = {
      items: [cartItem]
    };

    vi.spyOn(Cart, "findOne")
      .mockResolvedValue(cart);

    vi.spyOn(Product, "findOne")
      .mockResolvedValue({
        _id: productId,
        name: "Test Product",
        stock: 2
      });

    const req = {
      params: {
        productId
      },
      body: {
        quantity: 3
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

    await updateCartItem(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        code: "INSUFFICIENT_STOCK"
      })
    );

    expect(cartItem.quantity).toBe(2);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("updates the cart item quantity successfully", async () => {
    const productId = "507f1f77bcf86cd799439011";

    const cartItem = {
      product: {
        toString: () => productId
      },
      quantity: 2
    };

    const cart = {
      items: [cartItem],
      save: vi.fn().mockResolvedValue(true)
    };

    vi.spyOn(Cart, "findOne")
      .mockResolvedValue(cart);

    vi.spyOn(Product, "findOne")
      .mockResolvedValue({
        _id: productId,
        name: "Test Product",
        stock: 10
      });

    const req = {
      params: {
        productId
      },
      body: {
        quantity: 5
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

    await updateCartItem(req, res, next);

    expect(cartItem.quantity).toBe(5);

    expect(cart.save).toHaveBeenCalledTimes(1);

    expect(res.status).toHaveBeenCalledWith(200);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Cart item updated successfully",
      data: {
        cart
      },
      requestId: "test-request-id"
    });

    expect(next).not.toHaveBeenCalled();
  });
});