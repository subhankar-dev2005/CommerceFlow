
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach
} from "vitest";

import mongoose from "mongoose";
import Order from "./order.model.js";
import Product from "../products/product.model.js";

import cancelOrder from "./cancel-order.controller.js";

describe("cancelOrder", () => {
  let mockSession;

  beforeEach(() => {
    vi.restoreAllMocks();

    mockSession = {
      id: "mock-session-cancel-test",
      withTransaction: vi.fn(async (fn) => fn()),
      endSession: vi.fn().mockResolvedValue(undefined)
    };

    vi.spyOn(mongoose, "startSession").mockResolvedValue(mockSession);
    vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(1);
    vi.spyOn(Product, "findByIdAndUpdate");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return ORDER_NOT_FOUND when the order does not exist", async () => {
    vi.spyOn(Order, "findById").mockResolvedValue(null);

    const req = {
      params: {
        orderId: "507f1f77bcf86cd799439011"
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

    await cancelOrder(req, res, next);

    expect(Order.findById).toHaveBeenCalledWith(
      "507f1f77bcf86cd799439011"
    );

    expect(next).toHaveBeenCalledTimes(1);

    const error = next.mock.calls[0][0];

    expect(error.statusCode).toBe(404);
    expect(error.code).toBe("ORDER_NOT_FOUND");
    expect(error.message).toBe("Order not found");

    expect(res.status).not.toHaveBeenCalled();
  });

  it("should return ORDER_ACCESS_DENIED when the user does not own the order", async () => {
    vi.spyOn(Order, "findById").mockResolvedValue({
      _id: "507f1f77bcf86cd799439011",
      user: "507f1f77bcf86cd799439013",
      status: "pending",
      items: []
    });

    const req = {
      params: {
        orderId: "507f1f77bcf86cd799439011"
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

    await cancelOrder(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);

    const error = next.mock.calls[0][0];

    expect(error.statusCode).toBe(403);
    expect(error.code).toBe("ORDER_ACCESS_DENIED");
    expect(error.message).toBe(
      "You are not allowed to cancel this order"
    );

    expect(Product.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should return ORDER_CANNOT_BE_CANCELLED for a delivered order", async () => {
    vi.spyOn(Order, "findById").mockResolvedValue({
      _id: "507f1f77bcf86cd799439011",
      user: "507f1f77bcf86cd799439012",
      status: "delivered",
      items: []
    });

    const req = {
      params: {
        orderId: "507f1f77bcf86cd799439011"
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

    await cancelOrder(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);

    const error = next.mock.calls[0][0];

    expect(error.statusCode).toBe(400);
    expect(error.code).toBe(
      "ORDER_CANNOT_BE_CANCELLED"
    );
    expect(error.message).toBe(
      "Delivered orders cannot be cancelled"
    );

    expect(Product.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should return ORDER_ALREADY_CANCELLED when the order is already cancelled", async () => {
    vi.spyOn(Order, "findById").mockResolvedValue({
      _id: "507f1f77bcf86cd799439011",
      user: "507f1f77bcf86cd799439012",
      status: "cancelled",
      items: []
    });

    const req = {
      params: {
        orderId: "507f1f77bcf86cd799439011"
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

    await cancelOrder(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);

    const error = next.mock.calls[0][0];

    expect(error.statusCode).toBe(400);
    expect(error.code).toBe(
      "ORDER_ALREADY_CANCELLED"
    );
    expect(error.message).toBe(
      "Order is already cancelled"
    );

    expect(Product.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should return ORDER_CHECKOUT_IN_PROGRESS when checkoutState is in_progress", async () => {
    vi.spyOn(Order, "findById").mockResolvedValue({
      _id: "507f1f77bcf86cd799439011",
      user: "507f1f77bcf86cd799439012",
      status: "pending",
      checkoutState: "in_progress",
      items: [{ product: "507f1f77bcf86cd799439013", quantity: 2 }]
    });

    const req = {
      params: { orderId: "507f1f77bcf86cd799439011" },
      user: { _id: "507f1f77bcf86cd799439012" },
      requestId: "test-request-id"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const next = vi.fn();

    await cancelOrder(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe("ORDER_CHECKOUT_IN_PROGRESS");
    expect(error.message).toBe("Cannot cancel an order with checkout in progress");
    expect(Product.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should return ORDER_COMPENSATION_PENDING when checkoutState is compensation_pending", async () => {
    vi.spyOn(Order, "findById").mockResolvedValue({
      _id: "507f1f77bcf86cd799439011",
      user: "507f1f77bcf86cd799439012",
      status: "pending",
      checkoutState: "compensation_pending",
      items: [{ product: "507f1f77bcf86cd799439013", quantity: 2 }]
    });

    const req = {
      params: { orderId: "507f1f77bcf86cd799439011" },
      user: { _id: "507f1f77bcf86cd799439012" },
      requestId: "test-request-id"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const next = vi.fn();

    await cancelOrder(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe("ORDER_COMPENSATION_PENDING");
    expect(error.message).toBe("Cannot cancel an order requiring reconciliation");
    expect(Product.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should cancel the order atomically, restore stock, and return the updated order", async () => {
    const order = {
      _id: "507f1f77bcf86cd799439011",
      user: "507f1f77bcf86cd799439012",
      status: "pending",
      items: [
        {
          product: "507f1f77bcf86cd799439013",
          quantity: 2
        },
        {
          product: "507f1f77bcf86cd799439014",
          quantity: 3
        }
      ]
    };

    const updatedOrder = {
      ...order,
      status: "cancelled"
    };

    vi.spyOn(Order, "findById").mockResolvedValue(order);
    vi.spyOn(Order, "findOneAndUpdate").mockResolvedValue(updatedOrder);

    Product.findByIdAndUpdate
      .mockResolvedValueOnce({
        _id: "507f1f77bcf86cd799439013",
        stock: 12
      })
      .mockResolvedValueOnce({
        _id: "507f1f77bcf86cd799439014",
        stock: 8
      });

    const req = {
      params: {
        orderId: "507f1f77bcf86cd799439011"
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

    await cancelOrder(req, res, next);

    expect(Order.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: "507f1f77bcf86cd799439011",
        user: "507f1f77bcf86cd799439012",
        status: { $nin: ["delivered", "cancelled"] }
      },
      {
        $set: {
          status: "cancelled",
          cancellation: {
            reason: "other",
            reasonDetail: "",
            cancelledBy: "customer",
            cancelledAt: expect.any(Date)
          }
        }
      },
      {
        new: true,
        session: mockSession
      }
    );

    expect(Product.findByIdAndUpdate).toHaveBeenCalledTimes(2);
    expect(Product.findByIdAndUpdate).toHaveBeenNthCalledWith(
      1,
      "507f1f77bcf86cd799439013",
      {
        $inc: {
          stock: 2
        }
      },
      { session: mockSession }
    );

    expect(Product.findByIdAndUpdate).toHaveBeenNthCalledWith(
      2,
      "507f1f77bcf86cd799439014",
      {
        $inc: {
          stock: 3
        }
      },
      { session: mockSession }
    );

    expect(res.status).toHaveBeenCalledWith(200);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Order cancelled successfully",
      data: {
        order: updatedOrder
      },
      requestId: "test-request-id"
    });

    expect(next).not.toHaveBeenCalled();
  });

  it("should return ORDER_ALREADY_CANCELLED and not restore stock when a concurrent request cancels first", async () => {
    const order = {
      _id: "507f1f77bcf86cd799439011",
      user: "507f1f77bcf86cd799439012",
      status: "pending",
      items: [
        {
          product: "507f1f77bcf86cd799439013",
          quantity: 2
        }
      ]
    };

    vi.spyOn(Order, "findById").mockResolvedValue(order);
    vi.spyOn(Order, "findOneAndUpdate").mockResolvedValue(null);

    const req = {
      params: {
        orderId: "507f1f77bcf86cd799439011"
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

    await cancelOrder(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);

    const error = next.mock.calls[0][0];

    expect(error.statusCode).toBe(400);
    expect(error.code).toBe(
      "ORDER_ALREADY_CANCELLED"
    );
    expect(error.message).toBe(
      "Order is already cancelled"
    );

    expect(Product.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("restores stock correctly while strictly preserving financial fields without recalculation", async () => {
    const orderWithFinancials = {
      _id: "507f1f77bcf86cd799439011",
      user: "507f1f77bcf86cd799439012",
      status: "pending",
      subtotal: 1000,
      shippingAmount: 0,
      taxAmount: 0,
      discountAmount: 0,
      total: 1000,
      totalQuantity: 2,
      items: [
        {
          product: "507f1f77bcf86cd799439013",
          name: "Test Item",
          price: 500,
          quantity: 2,
          subtotal: 1000
        }
      ]
    };

    const updatedOrder = {
      ...orderWithFinancials,
      status: "cancelled"
    };

    vi.spyOn(Order, "findById").mockResolvedValue(orderWithFinancials);
    vi.spyOn(Order, "findOneAndUpdate").mockResolvedValue(updatedOrder);
    Product.findByIdAndUpdate.mockResolvedValue({ _id: "507f1f77bcf86cd799439013", stock: 10 });

    const req = {
      params: { orderId: "507f1f77bcf86cd799439011" },
      user: { _id: "507f1f77bcf86cd799439012" },
      requestId: "test-request-id"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const next = vi.fn();

    await cancelOrder(req, res, next);

    // Stock was restored
    expect(Product.findByIdAndUpdate).toHaveBeenCalledWith("507f1f77bcf86cd799439013", {
      $inc: { stock: 2 }
    }, { session: mockSession });

    // Verify financial fields were preserved exactly without recalculation or mutation
    const returnedOrder = res.json.mock.calls[0][0].data.order;
    expect(returnedOrder.subtotal).toBe(1000);
    expect(returnedOrder.total).toBe(1000);
    expect(returnedOrder.shippingAmount).toBe(0);
    expect(returnedOrder.taxAmount).toBe(0);
    expect(returnedOrder.discountAmount).toBe(0);
    expect(returnedOrder.status).toBe("cancelled");
  });

  describe("P1.5.3 Customer Cancellation Reason Persistence", () => {
    const mockOrder = {
      _id: "507f1f77bcf86cd799439011",
      user: "507f1f77bcf86cd799439012",
      status: "pending",
      items: [
        {
          product: "507f1f77bcf86cd799439013",
          quantity: 1
        }
      ]
    };

    it("persists cancellation reason with changed_mind and detail", async () => {
      vi.spyOn(Order, "findById").mockResolvedValue(mockOrder);
      let currentOrder = { ...mockOrder };
      vi.spyOn(Order, "findOneAndUpdate").mockImplementation((query, update) => {
        currentOrder = {
          ...currentOrder,
          ...update.$set,
          cancellation: update.$set.cancellation || currentOrder.cancellation
        };
        return Promise.resolve(currentOrder);
      });
      Product.findByIdAndUpdate.mockResolvedValue({ _id: "507f1f77bcf86cd799439013", stock: 10 });

      const req = {
        params: { orderId: "507f1f77bcf86cd799439011" },
        user: { _id: "507f1f77bcf86cd799439012" },
        body: {
          reason: "changed_mind",
          reasonDetail: "Changed my mind about this color"
        },
        requestId: "test-req-1"
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await cancelOrder(req, res, next);

      expect(Order.findOneAndUpdate).toHaveBeenCalledWith(
        {
          _id: "507f1f77bcf86cd799439011",
          user: "507f1f77bcf86cd799439012",
          status: { $nin: ["delivered", "cancelled"] }
        },
        {
          $set: {
            status: "cancelled",
            cancellation: {
              reason: "changed_mind",
              reasonDetail: "Changed my mind about this color",
              cancelledBy: "customer",
              cancelledAt: expect.any(Date)
            }
          }
        },
        { new: true, session: mockSession }
      );

      const returnedOrder = res.json.mock.calls[0][0].data.order;
      expect(returnedOrder.cancellation.reason).toBe("changed_mind");
      expect(returnedOrder.cancellation.reasonDetail).toBe("Changed my mind about this color");
      expect(returnedOrder.cancellation.cancelledBy).toBe("customer");
      expect(returnedOrder.cancellation.cancelledAt).toBeInstanceOf(Date);
      expect(next).not.toHaveBeenCalled();
    });

    it("persists cancellation reason with ordered_by_mistake and detail", async () => {
      vi.spyOn(Order, "findById").mockResolvedValue(mockOrder);
      vi.spyOn(Order, "findOneAndUpdate").mockImplementation((query, update) => {
        return Promise.resolve({
          ...mockOrder,
          status: "cancelled",
          cancellation: update.$set.cancellation
        });
      });
      Product.findByIdAndUpdate.mockResolvedValue({ _id: "507f1f77bcf86cd799439013", stock: 10 });

      const req = {
        params: { orderId: "507f1f77bcf86cd799439011" },
        user: { _id: "507f1f77bcf86cd799439012" },
        body: {
          reason: "ordered_by_mistake",
          reasonDetail: "Mistakenly bought 2 instead of 1"
        },
        requestId: "test-req-2"
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await cancelOrder(req, res, next);

      expect(Order.findOneAndUpdate).toHaveBeenCalledWith(
        expect.anything(),
        {
          $set: {
            status: "cancelled",
            cancellation: {
              reason: "ordered_by_mistake",
              reasonDetail: "Mistakenly bought 2 instead of 1",
              cancelledBy: "customer",
              cancelledAt: expect.any(Date)
            }
          }
        },
        { new: true, session: mockSession }
      );
      expect(next).not.toHaveBeenCalled();
    });

    it("persists cancellation reason with 'other' and server-generated Date", async () => {
      vi.spyOn(Order, "findById").mockResolvedValue(mockOrder);
      vi.spyOn(Order, "findOneAndUpdate").mockImplementation((query, update) => {
        return Promise.resolve({
          ...mockOrder,
          status: "cancelled",
          cancellation: update.$set.cancellation
        });
      });
      Product.findByIdAndUpdate.mockResolvedValue({ _id: "507f1f77bcf86cd799439013", stock: 10 });

      const beforeTime = Date.now();

      const req = {
        params: { orderId: "507f1f77bcf86cd799439011" },
        user: { _id: "507f1f77bcf86cd799439012" },
        body: {
          reason: "other",
          reasonDetail: "Custom unique reason"
        },
        requestId: "test-req-3"
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await cancelOrder(req, res, next);

      const afterTime = Date.now();

      const updateCall = Order.findOneAndUpdate.mock.calls[0][1];
      const cancelledAt = updateCall.$set.cancellation.cancelledAt;
      expect(cancelledAt).toBeInstanceOf(Date);
      expect(cancelledAt.getTime()).toBeGreaterThanOrEqual(beforeTime);
      expect(cancelledAt.getTime()).toBeLessThanOrEqual(afterTime);
      expect(updateCall.$set.cancellation.cancelledBy).toBe("customer");
      expect(updateCall.$set.cancellation.reason).toBe("other");
      expect(updateCall.$set.cancellation.reasonDetail).toBe("Custom unique reason");
    });

    it("persists normalized empty reasonDetail when reasonDetail is omitted", async () => {
      vi.spyOn(Order, "findById").mockResolvedValue(mockOrder);
      vi.spyOn(Order, "findOneAndUpdate").mockImplementation((query, update) => {
        return Promise.resolve({
          ...mockOrder,
          status: "cancelled",
          cancellation: update.$set.cancellation
        });
      });
      Product.findByIdAndUpdate.mockResolvedValue({ _id: "507f1f77bcf86cd799439013", stock: 10 });

      const req = {
        params: { orderId: "507f1f77bcf86cd799439011" },
        user: { _id: "507f1f77bcf86cd799439012" },
        body: {
          reason: "delivery_too_slow"
        },
        requestId: "test-req-4"
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await cancelOrder(req, res, next);

      const updateCall = Order.findOneAndUpdate.mock.calls[0][1];
      expect(updateCall.$set.cancellation.reasonDetail).toBe("");
    });

    it("backward compatibility: handles empty object {} body correctly", async () => {
      vi.spyOn(Order, "findById").mockResolvedValue(mockOrder);
      vi.spyOn(Order, "findOneAndUpdate").mockImplementation((query, update) => {
        return Promise.resolve({
          ...mockOrder,
          status: "cancelled",
          cancellation: update.$set.cancellation
        });
      });
      Product.findByIdAndUpdate.mockResolvedValue({ _id: "507f1f77bcf86cd799439013", stock: 10 });

      const req = {
        params: { orderId: "507f1f77bcf86cd799439011" },
        user: { _id: "507f1f77bcf86cd799439012" },
        body: {},
        requestId: "test-req-compat"
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await cancelOrder(req, res, next);

      expect(Order.findOneAndUpdate).toHaveBeenCalledWith(
        expect.anything(),
        {
          $set: {
            status: "cancelled",
            cancellation: {
              reason: "other",
              reasonDetail: "",
              cancelledBy: "customer",
              cancelledAt: expect.any(Date)
            }
          }
        },
        { new: true, session: mockSession }
      );
    });

    it("backward compatibility: handles missing req.body (undefined) correctly", async () => {
      vi.spyOn(Order, "findById").mockResolvedValue(mockOrder);
      vi.spyOn(Order, "findOneAndUpdate").mockImplementation((query, update) => {
        return Promise.resolve({
          ...mockOrder,
          status: "cancelled",
          cancellation: update.$set.cancellation
        });
      });
      Product.findByIdAndUpdate.mockResolvedValue({ _id: "507f1f77bcf86cd799439013", stock: 10 });

      const req = {
        params: { orderId: "507f1f77bcf86cd799439011" },
        user: { _id: "507f1f77bcf86cd799439012" },
        requestId: "test-req-no-body"
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await cancelOrder(req, res, next);

      expect(Order.findOneAndUpdate).toHaveBeenCalledWith(
        expect.anything(),
        {
          $set: {
            status: "cancelled",
            cancellation: {
              reason: "other",
              reasonDetail: "",
              cancelledBy: "customer",
              cancelledAt: expect.any(Date)
            }
          }
        },
        { new: true, session: mockSession }
      );
    });

    it("security: ignores client-supplied cancelledBy and cancelledAt", async () => {
      vi.spyOn(Order, "findById").mockResolvedValue(mockOrder);
      vi.spyOn(Order, "findOneAndUpdate").mockImplementation((query, update) => {
        return Promise.resolve({
          ...mockOrder,
          status: "cancelled",
          cancellation: update.$set.cancellation
        });
      });
      Product.findByIdAndUpdate.mockResolvedValue({ _id: "507f1f77bcf86cd799439013", stock: 10 });

      const pastDate = new Date("2020-01-01T00:00:00.000Z");

      const req = {
        params: { orderId: "507f1f77bcf86cd799439011" },
        user: { _id: "507f1f77bcf86cd799439012" },
        body: {
          reason: "changed_mind",
          reasonDetail: "Legitimate reason",
          cancelledBy: "admin",
          cancelledAt: pastDate
        },
        requestId: "test-req-security"
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await cancelOrder(req, res, next);

      const updateCall = Order.findOneAndUpdate.mock.calls[0][1];
      expect(updateCall.$set.cancellation.cancelledBy).toBe("customer");
      expect(updateCall.$set.cancellation.cancelledAt).not.toEqual(pastDate);
      expect(updateCall.$set.cancellation.cancelledAt.getTime()).toBeGreaterThan(pastDate.getTime());
    });

    it("atomicity: single atomic findOneAndUpdate contains both status and cancellation object", async () => {
      vi.spyOn(Order, "findById").mockResolvedValue(mockOrder);
      vi.spyOn(Order, "findOneAndUpdate").mockResolvedValue({
        ...mockOrder,
        status: "cancelled",
        cancellation: {
          reason: "other",
          reasonDetail: "",
          cancelledBy: "customer",
          cancelledAt: new Date()
        }
      });
      Product.findByIdAndUpdate.mockResolvedValue({ _id: "507f1f77bcf86cd799439013", stock: 10 });

      const req = {
        params: { orderId: "507f1f77bcf86cd799439011" },
        user: { _id: "507f1f77bcf86cd799439012" },
        body: { reason: "other" },
        requestId: "test-req-atomic"
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await cancelOrder(req, res, next);

      expect(Order.findOneAndUpdate).toHaveBeenCalledWith(
        expect.anything(),
        {
          $set: {
            status: "cancelled",
            cancellation: {
              reason: "other",
              reasonDetail: "",
              cancelledBy: "customer",
              cancelledAt: expect.any(Date)
            }
          }
        },
        { new: true, session: mockSession }
      );
      const updateArg = Order.findOneAndUpdate.mock.calls[0][1];
      expect(Object.keys(updateArg)).toEqual(["$set"]);
      expect(updateArg.$set).toHaveProperty("status", "cancelled");
      expect(updateArg.$set).toHaveProperty("cancellation");
      expect(updateArg.$set.cancellation).toEqual({
        reason: "other",
        reasonDetail: "",
        cancelledBy: "customer",
        cancelledAt: expect.any(Date)
      });
    });

    it("duplicate cancellation: does not overwrite existing cancellation when order is already cancelled", async () => {
      const alreadyCancelledOrder = {
        ...mockOrder,
        status: "cancelled",
        cancellation: {
          reason: "found_better_price",
          reasonDetail: "Initial cancellation reason",
          cancelledBy: "customer",
          cancelledAt: new Date("2026-01-01T12:00:00.000Z")
        }
      };

      vi.spyOn(Order, "findById").mockResolvedValue(alreadyCancelledOrder);
      vi.spyOn(Order, "findOneAndUpdate");

      const req = {
        params: { orderId: "507f1f77bcf86cd799439011" },
        user: { _id: "507f1f77bcf86cd799439012" },
        body: {
          reason: "changed_mind",
          reasonDetail: "New attempt to overwrite"
        },
        requestId: "test-req-dup"
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await cancelOrder(req, res, next);

      expect(Order.findOneAndUpdate).not.toHaveBeenCalled();
      expect(Product.findByIdAndUpdate).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          code: "ORDER_ALREADY_CANCELLED"
        })
      );
    });

    it("inventory: stock restoration occurs exactly once per item on winning cancellation", async () => {
      const multiItemOrder = {
        _id: "507f1f77bcf86cd799439011",
        user: "507f1f77bcf86cd799439012",
        status: "pending",
        items: [
          { product: "507f1f77bcf86cd799439013", quantity: 4 },
          { product: "507f1f77bcf86cd799439014", quantity: 1 }
        ]
      };

      vi.spyOn(Order, "findById").mockResolvedValue(multiItemOrder);
      vi.spyOn(Order, "findOneAndUpdate").mockResolvedValue({
        ...multiItemOrder,
        status: "cancelled",
        cancellation: {
          reason: "other",
          reasonDetail: "",
          cancelledBy: "customer",
          cancelledAt: new Date()
        }
      });
      Product.findByIdAndUpdate.mockResolvedValue({ stock: 20 });

      const req = {
        params: { orderId: "507f1f77bcf86cd799439011" },
        user: { _id: "507f1f77bcf86cd799439012" },
        requestId: "test-req-stock"
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await cancelOrder(req, res, next);

      expect(Product.findByIdAndUpdate).toHaveBeenCalledTimes(2);
      expect(Product.findByIdAndUpdate).toHaveBeenNthCalledWith(1, "507f1f77bcf86cd799439013", {
        $inc: { stock: 4 }
      }, { session: mockSession });
      expect(Product.findByIdAndUpdate).toHaveBeenNthCalledWith(2, "507f1f77bcf86cd799439014", {
        $inc: { stock: 1 }
      }, { session: mockSession });
    });

    it("inventory: stock restoration does NOT occur when atomic update returns null (concurrent race loser)", async () => {
      vi.spyOn(Order, "findById").mockResolvedValue(mockOrder);
      vi.spyOn(Order, "findOneAndUpdate").mockResolvedValue(null);

      const req = {
        params: { orderId: "507f1f77bcf86cd799439011" },
        user: { _id: "507f1f77bcf86cd799439012" },
        body: { reason: "changed_mind" },
        requestId: "test-req-loser"
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await cancelOrder(req, res, next);

      expect(Product.findByIdAndUpdate).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          code: "ORDER_ALREADY_CANCELLED"
        })
      );
    });

    it("cannot overwrite cancellation on an order previously cancelled by admin or system", async () => {
      const adminCancelledOrder = {
        ...mockOrder,
        status: "cancelled",
        cancellation: {
          reason: "fraud_suspected",
          reasonDetail: "Suspicious activity",
          cancelledBy: "admin",
          cancelledAt: new Date("2026-01-01T12:00:00.000Z")
        }
      };

      vi.spyOn(Order, "findById").mockResolvedValue(adminCancelledOrder);
      vi.spyOn(Order, "findOneAndUpdate");

      const req = {
        params: { orderId: "507f1f77bcf86cd799439011" },
        user: { _id: "507f1f77bcf86cd799439012" },
        body: { reason: "changed_mind" },
        requestId: "test-req-admin-cancelled-preservation"
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await cancelOrder(req, res, next);

      expect(Order.findOneAndUpdate).not.toHaveBeenCalled();
      expect(Product.findByIdAndUpdate).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          code: "ORDER_ALREADY_CANCELLED"
        })
      );
      expect(adminCancelledOrder.cancellation.cancelledBy).toBe("admin");
      expect(adminCancelledOrder.cancellation.reason).toBe("fraud_suspected");
    });
  });
});
