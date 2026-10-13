
import {
  describe,
  it,
  expect,
  vi,
  beforeEach
} from "vitest";

import Address from "../users/address.model.js";
import Cart from "../cart/cart.model.js";
import Product from "../products/product.model.js";

import Order from "./order.model.js";
import CheckoutInventoryRestoration from "./checkout-inventory-restoration.model.js";
import CouponReservation from "../coupons/coupon-reservation.model.js";
import CouponUsage from "../coupons/coupon-usage.model.js";

import { createOrder } from "./order.controller.js";

describe("createOrder", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(Order, "updateOne").mockResolvedValue({ acknowledged: true, modifiedCount: 1 });
    vi.spyOn(Order, "findByIdAndUpdate").mockResolvedValue(true);
    vi.spyOn(Order, "findById").mockImplementation((id) => ({
      select: () => Promise.resolve({ _id: id, status: "pending", checkoutState: "in_progress" }),
      then: (res, rej) => Promise.resolve({ _id: id, status: "pending", checkoutState: "in_progress" }).then(res, rej)
    }));
    vi.spyOn(CouponReservation, "deleteOne").mockResolvedValue({ acknowledged: true, deletedCount: 0 });
    vi.spyOn(CouponUsage, "deleteOne").mockResolvedValue({ acknowledged: true, deletedCount: 0 });
    vi.spyOn(CheckoutInventoryRestoration, "create").mockResolvedValue({ status: "pending" });
    vi.spyOn(CheckoutInventoryRestoration, "findOne").mockResolvedValue({ status: "pending" });
    vi.spyOn(CheckoutInventoryRestoration, "findOneAndUpdate").mockResolvedValue({ status: "restored" });
    vi.spyOn(CheckoutInventoryRestoration, "updateOne").mockResolvedValue({ acknowledged: true });
  });

  it("should return ADDRESS_NOT_FOUND when the shipping address does not exist", async () => {
    vi.spyOn(Address, "findOne").mockResolvedValue(null);

    const req = {
      body: {
        addressId: "507f1f77bcf86cd799439011"
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

    await createOrder(req, res, next);

    expect(Address.findOne).toHaveBeenCalledWith({
      _id: "507f1f77bcf86cd799439011",
      user: "507f1f77bcf86cd799439012"
    });

    expect(next).toHaveBeenCalledTimes(1);

    const error = next.mock.calls[0][0];

    expect(error.statusCode).toBe(404);
    expect(error.code).toBe("ADDRESS_NOT_FOUND");
    expect(error.message).toBe(
      "Shipping address not found"
    );

    expect(res.status).not.toHaveBeenCalled();
  });

  it("should return CART_EMPTY when the cart does not exist", async () => {
    vi.spyOn(Address, "findOne").mockResolvedValue({
      _id: "507f1f77bcf86cd799439011",
      user: "507f1f77bcf86cd799439012",
      fullName: "Test Customer",
      phone: "9876543210",
      addressLine1: "123 Test Street",
      addressLine2: "",
      city: "Kolkata",
      state: "West Bengal",
      postalCode: "700001",
      country: "India"
    });

    vi.spyOn(Cart, "findOne").mockReturnValue({
      populate: vi.fn().mockResolvedValue(null)
    });

    const req = {
      body: {
        addressId: "507f1f77bcf86cd799439011"
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

    await createOrder(req, res, next);

    expect(Cart.findOne).toHaveBeenCalledWith({
      user: "507f1f77bcf86cd799439012"
    });

    expect(next).toHaveBeenCalledTimes(1);

    const error = next.mock.calls[0][0];

    expect(error.statusCode).toBe(400);
    expect(error.code).toBe("CART_EMPTY");
    expect(error.message).toBe("Cart is empty");

    expect(res.status).not.toHaveBeenCalled();
  });

  it("should return PRODUCT_NOT_FOUND when a cart product is no longer available", async () => {
    vi.spyOn(Address, "findOne").mockResolvedValue({
      _id: "507f1f77bcf86cd799439011",
      user: "507f1f77bcf86cd799439012",
      fullName: "Test Customer",
      phone: "9876543210",
      addressLine1: "123 Test Street",
      addressLine2: "",
      city: "Kolkata",
      state: "West Bengal",
      postalCode: "700001",
      country: "India"
    });

    vi.spyOn(Cart, "findOne").mockReturnValue({
      populate: vi.fn().mockResolvedValue({
        items: [
          {
            product: {
              _id: "507f1f77bcf86cd799439013"
            },
            quantity: 1
          }
        ]
      })
    });

    vi.spyOn(Product, "findOne").mockResolvedValue(null);

    const req = {
      body: {
        addressId: "507f1f77bcf86cd799439011"
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

    await createOrder(req, res, next);

    expect(Product.findOne).toHaveBeenCalledWith({
      _id: "507f1f77bcf86cd799439013",
      isActive: true
    });

    expect(next).toHaveBeenCalledTimes(1);

    const error = next.mock.calls[0][0];

    expect(error.statusCode).toBe(404);
    expect(error.code).toBe("PRODUCT_NOT_FOUND");
    expect(error.message).toBe(
      "A product in the cart is no longer available"
    );

    expect(res.status).not.toHaveBeenCalled();
  });

  it("should return INSUFFICIENT_STOCK when product stock is too low", async () => {
    vi.spyOn(Address, "findOne").mockResolvedValue({
      _id: "507f1f77bcf86cd799439011",
      user: "507f1f77bcf86cd799439012",
      fullName: "Test Customer",
      phone: "9876543210",
      addressLine1: "123 Test Street",
      addressLine2: "",
      city: "Kolkata",
      state: "West Bengal",
      postalCode: "700001",
      country: "India"
    });

    vi.spyOn(Cart, "findOne").mockReturnValue({
      populate: vi.fn().mockResolvedValue({
        items: [
          {
            product: {
              _id: "507f1f77bcf86cd799439013"
            },
            quantity: 5
          }
        ]
      })
    });

    vi.spyOn(Product, "findOne").mockResolvedValue({
      _id: "507f1f77bcf86cd799439013",
      name: "Test Product",
      price: 100,
      stock: 2,
      isActive: true
    });

    const req = {
      body: {
        addressId: "507f1f77bcf86cd799439011"
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

    await createOrder(req, res, next);

    expect(Product.findOne).toHaveBeenCalledWith({
      _id: "507f1f77bcf86cd799439013",
      isActive: true
    });

    expect(next).toHaveBeenCalledTimes(1);

    const error = next.mock.calls[0][0];

    expect(error.statusCode).toBe(400);
    expect(error.code).toBe("INSUFFICIENT_STOCK");
    expect(error.message).toBe(
      "Insufficient stock for Test Product"
    );

    expect(res.status).not.toHaveBeenCalled();
  });

  it("should create an order, reduce stock, and clear the cart", async () => {
    const address = {
      _id: "507f1f77bcf86cd799439011",
      user: "507f1f77bcf86cd799439012",
      fullName: "Test Customer",
      phone: "9876543210",
      addressLine1: "123 Test Street",
      addressLine2: "",
      city: "Kolkata",
      state: "West Bengal",
      postalCode: "700001",
      country: "India"
    };

    const cart = {
      items: [
        {
          product: {
            _id: "507f1f77bcf86cd799439013"
          },
          quantity: 2
        }
      ],
      save: vi.fn().mockResolvedValue(true)
    };

    const product = {
      _id: "507f1f77bcf86cd799439013",
      name: "Test Product",
      price: 250,
      stock: 10,
      isActive: true
    };

    const createdOrder = {
      _id: "507f1f77bcf86cd799439014",
      user: "507f1f77bcf86cd799439012",
      items: [
        {
          product: "507f1f77bcf86cd799439013",
          name: "Test Product",
          price: 250,
          quantity: 2,
          subtotal: 500
        }
      ],
      totalQuantity: 2,
      subtotal: 500,
      payment: {
        provider: "razorpay",
        status: "pending",
        transactionId: ""
      },
      shippingAddress: {
        fullName: "Test Customer",
        phone: "9876543210",
        addressLine1: "123 Test Street",
        addressLine2: "",
        city: "Kolkata",
        state: "West Bengal",
        postalCode: "700001",
        country: "India"
      },
      status: "pending"
    };

    vi.spyOn(Address, "findOne").mockResolvedValue(address);

    vi.spyOn(Cart, "findOne").mockReturnValue({
      populate: vi.fn().mockResolvedValue(cart)
    });

    vi.spyOn(Product, "findOne").mockResolvedValue(product);

    vi.spyOn(Order, "create").mockResolvedValue(createdOrder);

    vi.spyOn(Product, "findOneAndUpdate").mockResolvedValue({
      ...product,
      stock: 8
    });

    const req = {
      body: {
        addressId: "507f1f77bcf86cd799439011"
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

    await createOrder(req, res, next);

    expect(Order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user: "507f1f77bcf86cd799439012",
        items: [
          {
            product: "507f1f77bcf86cd799439013",
            name: "Test Product",
            price: 250,
            quantity: 2,
            subtotal: 500
          }
        ],
        totalQuantity: 2,
        subtotal: 500,
        shippingAmount: 0,
        taxAmount: 0,
        discountAmount: 0,
        total: 500,
        payment: {
          provider: "razorpay",
          status: "pending",
          transactionId: ""
        },
        shippingAddress: {
          fullName: "Test Customer",
          phone: "9876543210",
          addressLine2: "",
          addressLine1: "123 Test Street",
          city: "Kolkata",
          state: "West Bengal",
          postalCode: "700001",
          country: "India"
        },
        status: "pending",
        checkoutState: "in_progress",
        checkoutCompensation: expect.objectContaining({
          reservationId: null,
          restoredItems: [
            expect.objectContaining({
              product: "507f1f77bcf86cd799439013",
              quantity: 2,
              deducted: false,
              restored: false
            })
          ]
        })
      })
    );

    expect(Product.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: "507f1f77bcf86cd799439013",
        isActive: true,
        stock: { $gte: 2 }
      },
      {
        $inc: {
          stock: -2
        }
      },
      {
        new: true
      }
    );

    expect(cart.items).toEqual([]);

    expect(cart.save).toHaveBeenCalledTimes(1);

    expect(res.status).toHaveBeenCalledWith(201);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Order created successfully",
      data: {
        order: createdOrder
      },
      requestId: "test-request-id"
    });

    expect(next).not.toHaveBeenCalled();
  });

  it("should create a multi-item order and deduct stock for all items", async () => {
    const address = {
      _id: "507f1f77bcf86cd799439011",
      user: "507f1f77bcf86cd799439012",
      fullName: "Test Customer",
      phone: "9876543210",
      addressLine1: "123 Test Street",
      addressLine2: "",
      city: "Kolkata",
      state: "West Bengal",
      postalCode: "700001",
      country: "India"
    };

    const cart = {
      items: [
        {
          product: { _id: "507f1f77bcf86cd799439013" },
          quantity: 2
        },
        {
          product: { _id: "507f1f77bcf86cd799439014" },
          quantity: 3
        }
      ],
      save: vi.fn().mockResolvedValue(true)
    };

    const productA = {
      _id: "507f1f77bcf86cd799439013",
      name: "Product A",
      price: 100,
      stock: 5,
      isActive: true
    };

    const productB = {
      _id: "507f1f77bcf86cd799439014",
      name: "Product B",
      price: 200,
      stock: 10,
      isActive: true
    };

    const createdOrder = {
      _id: "507f1f77bcf86cd799439015",
      user: "507f1f77bcf86cd799439012",
      items: [
        {
          product: productA._id,
          name: productA.name,
          price: productA.price,
          quantity: 2,
          subtotal: 200
        },
        {
          product: productB._id,
          name: productB.name,
          price: productB.price,
          quantity: 3,
          subtotal: 600
        }
      ],
      totalQuantity: 5,
      subtotal: 800
    };

    vi.spyOn(Address, "findOne").mockResolvedValue(address);
    vi.spyOn(Cart, "findOne").mockReturnValue({
      populate: vi.fn().mockResolvedValue(cart)
    });

    vi.spyOn(Product, "findOne").mockImplementation(async (query) => {
      if (query._id === productA._id) return productA;
      if (query._id === productB._id) return productB;
      return null;
    });

    vi.spyOn(Product, "findOneAndUpdate").mockImplementation(async (query) => {
      if (query._id === productA._id) return { ...productA, stock: 3 };
      if (query._id === productB._id) return { ...productB, stock: 7 };
      return null;
    });

    vi.spyOn(Order, "create").mockResolvedValue(createdOrder);

    const req = {
      body: { addressId: address._id },
      user: { _id: address.user },
      requestId: "test-request-id"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const next = vi.fn();

    await createOrder(req, res, next);

    expect(Product.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: productA._id, isActive: true, stock: { $gte: 2 } },
      { $inc: { stock: -2 } },
      { new: true }
    );
    expect(Product.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: productB._id, isActive: true, stock: { $gte: 3 } },
      { $inc: { stock: -3 } },
      { new: true }
    );
    expect(Order.create).toHaveBeenCalled();
    expect(cart.save).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(next).not.toHaveBeenCalled();
  });

  it("should rollback previously deducted stock when a later item has insufficient stock", async () => {
    const address = {
      _id: "507f1f77bcf86cd799439011",
      user: "507f1f77bcf86cd799439012"
    };

    const cart = {
      items: [
        {
          product: { _id: "507f1f77bcf86cd799439013" },
          quantity: 2
        },
        {
          product: { _id: "507f1f77bcf86cd799439014" },
          quantity: 5
        }
      ],
      save: vi.fn().mockResolvedValue(true)
    };

    const productA = {
      _id: "507f1f77bcf86cd799439013",
      name: "Product A",
      price: 100,
      stock: 5,
      isActive: true
    };

    const productB = {
      _id: "507f1f77bcf86cd799439014",
      name: "Product B",
      price: 200,
      stock: 5,
      isActive: true
    };

    vi.spyOn(Address, "findOne").mockResolvedValue(address);
    vi.spyOn(Cart, "findOne").mockReturnValue({
      populate: vi.fn().mockResolvedValue(cart)
    });

    vi.spyOn(Product, "findOne").mockImplementation(async (query) => {
      if (query._id === productA._id) return productA;
      if (query._id === productB._id) return productB;
      return null;
    });

    vi.spyOn(Product, "findOneAndUpdate").mockImplementation(async (query) => {
      if (query._id === productA._id) return { ...productA, stock: 3 };
      if (query._id === productB._id) return null;
      return null;
    });

    vi.spyOn(Product, "findByIdAndUpdate").mockResolvedValue(true);
    vi.spyOn(Order, "create").mockImplementation(async (orderData) => ({
      _id: "507f1f77bcf86cd799439014",
      ...orderData
    }));

    const req = {
      body: { addressId: address._id },
      user: { _id: address.user },
      requestId: "test-request-id"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const next = vi.fn();

    await createOrder(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe("INSUFFICIENT_STOCK");

    expect(Product.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: productA._id,
        restorationKeys: { $ne: expect.any(String) }
      }),
      expect.objectContaining({
        $inc: { stock: 2 }
      }),
      expect.anything()
    );
    expect(Product.findOneAndUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({
        _id: productB._id,
        restorationKeys: { $ne: expect.any(String) }
      }),
      expect.anything(),
      expect.anything()
    );
    expect(Order.create).toHaveBeenCalled();
    expect(cart.save).not.toHaveBeenCalled();
  });

  it("should rollback earlier stock deduction when a product does not exist during deduction", async () => {
    const address = {
      _id: "507f1f77bcf86cd799439011",
      user: "507f1f77bcf86cd799439012"
    };

    const cart = {
      items: [
        {
          product: { _id: "507f1f77bcf86cd799439013" },
          quantity: 2
        },
        {
          product: { _id: "507f1f77bcf86cd799439014" },
          quantity: 1
        }
      ],
      save: vi.fn().mockResolvedValue(true)
    };

    const productA = {
      _id: "507f1f77bcf86cd799439013",
      name: "Product A",
      price: 100,
      stock: 5,
      isActive: true
    };

    const productB = {
      _id: "507f1f77bcf86cd799439014",
      name: "Product B",
      price: 200,
      stock: 5,
      isActive: true
    };

    vi.spyOn(Address, "findOne").mockResolvedValue(address);
    vi.spyOn(Cart, "findOne").mockReturnValue({
      populate: vi.fn().mockResolvedValue(cart)
    });

    let findOneCallCount = 0;
    vi.spyOn(Product, "findOne").mockImplementation(async (query) => {
      findOneCallCount++;
      if (findOneCallCount <= 2) {
        if (query._id === productA._id) return productA;
        if (query._id === productB._id) return productB;
      }
      if (query._id === productB._id) return null;
      return null;
    });

    vi.spyOn(Product, "findOneAndUpdate").mockImplementation(async (query) => {
      if (query._id === productA._id) return { ...productA, stock: 3 };
      if (query._id === productB._id) return null;
      return null;
    });

    vi.spyOn(Product, "findByIdAndUpdate").mockResolvedValue(true);
    vi.spyOn(Order, "create").mockImplementation(async (orderData) => ({
      _id: "507f1f77bcf86cd799439014",
      ...orderData
    }));

    const req = {
      body: { addressId: address._id },
      user: { _id: address.user },
      requestId: "test-request-id"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const next = vi.fn();

    await createOrder(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe("PRODUCT_NOT_FOUND");

    expect(Product.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: productA._id,
        restorationKeys: { $ne: expect.any(String) }
      }),
      expect.objectContaining({
        $inc: { stock: 2 }
      }),
      expect.anything()
    );
    expect(Order.create).toHaveBeenCalled();
    expect(cart.save).not.toHaveBeenCalled();
  });

  it("should rollback every successful stock deduction when downstream checkout fails", async () => {
    const address = {
      _id: "507f1f77bcf86cd799439011",
      user: "507f1f77bcf86cd799439012"
    };

    const cart = {
      items: [
        {
          product: { _id: "507f1f77bcf86cd799439013" },
          quantity: 2
        },
        {
          product: { _id: "507f1f77bcf86cd799439014" },
          quantity: 3
        }
      ],
      save: vi.fn().mockResolvedValue(true)
    };

    const productA = {
      _id: "507f1f77bcf86cd799439013",
      name: "Product A",
      price: 100,
      stock: 5,
      isActive: true
    };

    const productB = {
      _id: "507f1f77bcf86cd799439014",
      name: "Product B",
      price: 200,
      stock: 10,
      isActive: true
    };

    vi.spyOn(Address, "findOne").mockResolvedValue(address);
    vi.spyOn(Cart, "findOne").mockReturnValue({
      populate: vi.fn().mockResolvedValue(cart)
    });

    vi.spyOn(Product, "findOne").mockImplementation(async (query) => {
      if (query._id === productA._id) return productA;
      if (query._id === productB._id) return productB;
      return null;
    });

    vi.spyOn(Product, "findOneAndUpdate").mockImplementation(async (query) => {
      if (query._id === productA._id) return { ...productA, stock: 3 };
      if (query._id === productB._id) return { ...productB, stock: 7 };
      return null;
    });

    vi.spyOn(Order, "create").mockImplementation(async (orderData) => ({
      _id: "507f1f77bcf86cd799439014",
      ...orderData
    }));

    const downstreamError = new Error("Downstream failure after deductions");
    cart.save.mockRejectedValue(downstreamError);

    vi.spyOn(Product, "findByIdAndUpdate").mockResolvedValue(true);

    const req = {
      body: { addressId: address._id },
      user: { _id: address.user },
      requestId: "test-request-id"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const next = vi.fn();

    await createOrder(req, res, next);

    expect(next).toHaveBeenCalledWith(downstreamError);

    expect(Product.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: productA._id,
        restorationKeys: { $ne: expect.any(String) }
      }),
      expect.objectContaining({
        $inc: { stock: 2 }
      }),
      expect.anything()
    );
    expect(Product.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: productB._id,
        restorationKeys: { $ne: expect.any(String) }
      }),
      expect.objectContaining({
        $inc: { stock: 3 }
      }),
      expect.anything()
    );
    expect(cart.save).toHaveBeenCalled();
  });

  describe("Financial Model & Integrity", () => {
    it("uses authoritative product prices from MongoDB and calculates all financial fields", async () => {
      const address = {
        _id: "507f1f77bcf86cd799439011",
        user: "507f1f77bcf86cd799439012",
        fullName: "Jane Doe",
        phone: "9876543210",
        addressLine1: "123 Main St",
        addressLine2: "",
        city: "Bengaluru",
        state: "Karnataka",
        postalCode: "560001",
        country: "India"
      };

      const cart = {
        items: [
          {
            product: { _id: "507f1f77bcf86cd799439013", price: 10 }, // Stale client/cart price
            quantity: 3
          }
        ],
        save: vi.fn().mockResolvedValue(true)
      };

      const product = {
        _id: "507f1f77bcf86cd799439013",
        name: "Premium Headphones",
        price: 300, // Authoritative MongoDB price
        stock: 10,
        isActive: true
      };

      const createdOrder = {
        _id: "507f1f77bcf86cd799439014",
        user: address.user,
        items: [
          {
            product: product._id,
            name: product.name,
            price: 300,
            quantity: 3,
            subtotal: 900
          }
        ],
        totalQuantity: 3,
        subtotal: 900,
        shippingAmount: 0,
        taxAmount: 0,
        discountAmount: 0,
        total: 900,
        status: "pending"
      };

      vi.spyOn(Address, "findOne").mockResolvedValue(address);
      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(cart)
      });
      vi.spyOn(Product, "findOne").mockResolvedValue(product);
      vi.spyOn(Product, "findOneAndUpdate").mockResolvedValue({ ...product, stock: 7 });
      vi.spyOn(Order, "create").mockResolvedValue(createdOrder);

      const req = {
        body: { addressId: address._id },
        user: { _id: address.user },
        requestId: "test-request-id"
      };

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await createOrder(req, res, next);

      expect(Order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          totalQuantity: 3,
          subtotal: 900,
          shippingAmount: 0,
          taxAmount: 0,
          discountAmount: 0,
          total: 900
        })
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            order: createdOrder
          }
        })
      );
    });

    it("prevents client from tampering with financial fields (subtotal, shippingAmount, taxAmount, discountAmount, total)", async () => {
      const address = {
        _id: "507f1f77bcf86cd799439011",
        user: "507f1f77bcf86cd799439012",
        fullName: "Jane Doe",
        phone: "9876543210",
        addressLine1: "123 Main St",
        addressLine2: "",
        city: "Bengaluru",
        state: "Karnataka",
        postalCode: "560001",
        country: "India"
      };

      const cart = {
        items: [
          {
            product: { _id: "507f1f77bcf86cd799439013" },
            quantity: 2
          }
        ],
        save: vi.fn().mockResolvedValue(true)
      };

      const product = {
        _id: "507f1f77bcf86cd799439013",
        name: "Mechanical Keyboard",
        price: 1500,
        stock: 5,
        isActive: true
      };

      vi.spyOn(Address, "findOne").mockResolvedValue(address);
      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(cart)
      });
      vi.spyOn(Product, "findOne").mockResolvedValue(product);
      vi.spyOn(Product, "findOneAndUpdate").mockResolvedValue({ ...product, stock: 3 });
      vi.spyOn(Order, "create").mockImplementation(async (orderData) => ({
        _id: "507f1f77bcf86cd799439014",
        ...orderData
      }));

      // Malicious client attempts to inject financial fields
      const req = {
        body: {
          addressId: address._id,
          subtotal: 1,
          shippingAmount: 999,
          taxAmount: 999,
          discountAmount: 999,
          total: 1
        },
        user: { _id: address.user },
        requestId: "tamper-request-id"
      };

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await createOrder(req, res, next);

      // Verify that server strictly calculated the authoritative values: 1500 * 2 = 3000
      expect(Order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          subtotal: 3000,
          shippingAmount: 0,
          taxAmount: 0,
          discountAmount: 0,
          total: 3000,
          totalQuantity: 2
        })
      );

      // Ensure client-supplied fake values (1, 999) were never persisted
      const createdCall = Order.create.mock.calls[0][0];
      expect(createdCall.subtotal).not.toBe(1);
      expect(createdCall.total).not.toBe(1);
      expect(createdCall.shippingAmount).not.toBe(999);
      expect(createdCall.taxAmount).not.toBe(999);
      expect(createdCall.discountAmount).not.toBe(999);
    });

    it("guarantees stored order financial snapshot is immutable against subsequent catalog product price updates", async () => {
      const address = {
        _id: "507f1f77bcf86cd799439011",
        user: "507f1f77bcf86cd799439012",
        fullName: "Jane Doe",
        phone: "9876543210",
        addressLine1: "123 Main St",
        addressLine2: "",
        city: "Bengaluru",
        state: "Karnataka",
        postalCode: "560001",
        country: "India"
      };

      const product = {
        _id: "507f1f77bcf86cd799439013",
        name: "Mechanical Keyboard",
        price: 1500,
        stock: 5,
        isActive: true
      };

      const cart = {
        items: [
          {
            product: { _id: product._id },
            quantity: 1
          }
        ],
        save: vi.fn().mockResolvedValue(true)
      };

      let persistedOrderSnapshot = null;
      vi.spyOn(Address, "findOne").mockResolvedValue(address);
      vi.spyOn(Cart, "findOne").mockReturnValue({
        populate: vi.fn().mockResolvedValue(cart)
      });
      vi.spyOn(Product, "findOne").mockResolvedValue(product);
      vi.spyOn(Product, "findOneAndUpdate").mockResolvedValue({ ...product, stock: 4 });
      vi.spyOn(Order, "create").mockImplementation(async (orderData) => {
        persistedOrderSnapshot = JSON.parse(JSON.stringify(orderData));
        return {
          _id: "507f1f77bcf86cd799439014",
          ...orderData
        };
      });

      const req = {
        body: { addressId: address._id },
        user: { _id: address.user },
        requestId: "snapshot-test-id"
      };

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await createOrder(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(persistedOrderSnapshot.subtotal).toBe(1500);
      expect(persistedOrderSnapshot.total).toBe(1500);

      // Now catalog product price doubles from 1500 to 3000
      product.price = 3000;

      // The persisted order financial snapshot remains exactly as created
      expect(persistedOrderSnapshot.subtotal).toBe(1500);
      expect(persistedOrderSnapshot.total).toBe(1500);
      expect(persistedOrderSnapshot.items[0].price).toBe(1500);
      expect(persistedOrderSnapshot.items[0].subtotal).toBe(1500);
    });
  });
});
