import {
  describe,
  it,
  expect,
  beforeEach,
  vi
} from "vitest";

import { addToCart } from "./cart.controller.js";
import Cart from "./cart.model.js";
import Product from "../products/product.model.js";

describe("addToCart", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns PRODUCT_NOT_FOUND when the product does not exist", async () => {
    vi.spyOn(Product, "findOne")
      .mockResolvedValue(null);

    const req = {
      body: {
        productId: "507f1f77bcf86cd799439011",
        quantity: 2
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

    await addToCart(req, res, next);

    expect(Product.findOne).toHaveBeenCalledWith({
      _id: "507f1f77bcf86cd799439011",
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

  it("returns INSUFFICIENT_STOCK when requested quantity exceeds stock", async () => {
    vi.spyOn(Product, "findOne")
      .mockResolvedValue({
        _id: "507f1f77bcf86cd799439011",
        name: "Test Product",
        stock: 1
      });

    const req = {
      body: {
        productId: "507f1f77bcf86cd799439011",
        quantity: 2
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

    await addToCart(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        code: "INSUFFICIENT_STOCK"
      })
    );

    expect(res.status).not.toHaveBeenCalled();
  });

  it("creates a new cart when the user does not have one", async () => {
    const product = {
      _id: "507f1f77bcf86cd799439011",
      name: "Test Product",
      stock: 10
    };

    const cart = {
      user: "507f1f77bcf86cd799439012",
      items: [
        {
          product: product._id,
          quantity: 2
        }
      ]
    };

    vi.spyOn(Product, "findOne")
      .mockResolvedValue(product);

    vi.spyOn(Cart, "findOne")
      .mockResolvedValue(null);

    vi.spyOn(Cart, "create")
      .mockResolvedValue(cart);

    const req = {
      body: {
        productId: product._id,
        quantity: 2
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

    await addToCart(req, res, next);

    expect(Cart.create).toHaveBeenCalledWith({
      user: "507f1f77bcf86cd799439012",
      items: [
        {
          product: product._id,
          quantity: 2
        }
      ]
    });

    expect(res.status).toHaveBeenCalledWith(200);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Product added to cart successfully",
      data: {
        cart
      },
      requestId: "test-request-id"
    });

    expect(next).not.toHaveBeenCalled();
  });

  it("adds quantity to an existing cart item", async () => {
    const productId = "507f1f77bcf86cd799439011";

    const existingItem = {
      product: {
        toString: () => productId
      },
      quantity: 2
    };

    const cart = {
      items: [existingItem],
      save: vi.fn().mockResolvedValue(true)
    };

    vi.spyOn(Product, "findOne")
      .mockResolvedValue({
        _id: productId,
        name: "Test Product",
        stock: 10
      });

    vi.spyOn(Cart, "findOne")
      .mockResolvedValue(cart);

    const req = {
      body: {
        productId,
        quantity: 3
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

    await addToCart(req, res, next);

    expect(existingItem.quantity).toBe(5);
    expect(cart.save).toHaveBeenCalledTimes(1);

    expect(res.status).toHaveBeenCalledWith(200);

    expect(next).not.toHaveBeenCalled();
  });

  it("rejects adding an existing cart item when combined quantity exceeds stock", async () => {
    const productId = "507f1f77bcf86cd799439011";

    const existingItem = {
      product: {
        toString: () => productId
      },
      quantity: 4
    };

    const cart = {
      items: [existingItem],
      save: vi.fn()
    };

    vi.spyOn(Product, "findOne")
      .mockResolvedValue({
        _id: productId,
        name: "Test Product",
        stock: 5
      });

    vi.spyOn(Cart, "findOne")
      .mockResolvedValue(cart);

    const req = {
      body: {
        productId,
        quantity: 2
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

    await addToCart(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        code: "INSUFFICIENT_STOCK"
      })
    );

    expect(existingItem.quantity).toBe(4);
    expect(cart.save).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});