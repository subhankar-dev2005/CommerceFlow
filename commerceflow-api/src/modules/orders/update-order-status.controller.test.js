import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi
} from "vitest";

import mongoose from "mongoose";
import updateOrderStatus from "./update-order-status.controller.js";
import Order from "./order.model.js";
import Product from "../products/product.model.js";

describe("updateOrderStatus", () => {
  let mockSession;

  beforeEach(() => {
    vi.restoreAllMocks();

    mockSession = {
      id: "mock-session-status-test",
      withTransaction: vi.fn(async (fn) => fn()),
      endSession: vi.fn().mockResolvedValue(undefined)
    };

    vi.spyOn(mongoose, "startSession").mockResolvedValue(mockSession);
    vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(1);
    vi.spyOn(Product, "findByIdAndUpdate").mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 404 when order does not exist", async () => {
    vi.spyOn(Order, "findById").mockResolvedValue(null);

    const req = {
      params: {
        orderId: "507f1f77bcf86cd799439011"
      },
      body: {
        status: "processing"
      },
      requestId: "test-request-id"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    const next = vi.fn();

    await updateOrderStatus(req, res, next);

    expect(Order.findById).toHaveBeenCalledWith(
      "507f1f77bcf86cd799439011"
    );

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        code: "ORDER_NOT_FOUND"
      })
    );

    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects an invalid order status transition", async () => {
    const order = {
      _id: "507f1f77bcf86cd799439011",
      status: "pending"
    };

    vi.spyOn(Order, "findById").mockResolvedValue(order);

    const req = {
      params: {
        orderId: "507f1f77bcf86cd799439011"
      },
      body: {
        status: "shipped"
      },
      requestId: "test-request-id"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    const next = vi.fn();

    await updateOrderStatus(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        code: "INVALID_ORDER_STATUS_TRANSITION"
      })
    );

    expect(order.status).toBe("pending");
    expect(res.status).not.toHaveBeenCalled();
  });

  it("updates the order status when the transition is valid", async () => {
    const order = {
      _id: "507f1f77bcf86cd799439011",
      status: "pending",
      save: vi.fn().mockResolvedValue(true)
    };

    vi.spyOn(Order, "findById").mockResolvedValue(order);

    const req = {
      params: {
        orderId: "507f1f77bcf86cd799439011"
      },
      body: {
        status: "processing"
      },
      requestId: "test-request-id"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    const next = vi.fn();

    await updateOrderStatus(req, res, next);

    expect(Order.findById).toHaveBeenCalledWith(
      "507f1f77bcf86cd799439011"
    );

    expect(order.status).toBe("processing");

    expect(order.save).toHaveBeenCalledTimes(1);

    expect(res.status).toHaveBeenCalledWith(200);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Order status updated successfully",
      data: {
        order
      },
      requestId: "test-request-id"
    });

    expect(next).not.toHaveBeenCalled();
  });

  it("allows all valid status transitions", async () => {
    const transitions = [
      ["pending", "processing"],
      ["pending", "cancelled"],
      ["confirmed", "processing"],
      ["confirmed", "cancelled"],
      ["processing", "shipped"],
      ["processing", "cancelled"],
      ["shipped", "delivered"]
    ];

    for (const [currentStatus, nextStatus] of transitions) {
      const order = {
        _id: "507f1f77bcf86cd799439011",
        status: currentStatus,
        items: [],
        save: vi.fn().mockResolvedValue(true)
      };

      if (nextStatus === "cancelled") {
        const updatedOrder = {
          ...order,
          status: "cancelled"
        };
        vi.spyOn(Order, "findOneAndUpdate").mockImplementation(() => Promise.resolve(updatedOrder));
      } else {
        vi.spyOn(Order, "findById").mockResolvedValueOnce(order);
      }

      const req = {
        params: {
          orderId: "507f1f77bcf86cd799439011"
        },
        body: {
          status: nextStatus
        },
        requestId: "test-request-id"
      };

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };

      const next = vi.fn();

      await updateOrderStatus(req, res, next);

      if (nextStatus === "cancelled") {
        expect(Order.findOneAndUpdate).toHaveBeenCalledWith(
          {
            _id: "507f1f77bcf86cd799439011",
            status: { $in: ["pending", "confirmed", "processing"] }
          },
          {
            $set: {
              status: "cancelled",
              cancellation: {
                reason: "other",
                reasonDetail: "",
                cancelledBy: "admin",
                cancelledAt: expect.any(Date)
              }
            }
          },
          {
            new: true,
            session: mockSession
          }
        );
      } else {
        expect(order.status).toBe(nextStatus);
        expect(order.save).toHaveBeenCalledTimes(1);
      }

      expect(res.status).toHaveBeenCalledWith(200);
      expect(next).not.toHaveBeenCalled();

      Order.findOneAndUpdate?.mockRestore?.();
      Order.findById?.mockRestore?.();
    }
  });

  it("rejects invalid status transitions from confirmed status", async () => {
    const invalidStatuses = ["shipped", "delivered", "pending"];

    for (const targetStatus of invalidStatuses) {
      const order = {
        _id: "507f1f77bcf86cd799439011",
        status: "confirmed",
        save: vi.fn()
      };

      vi.spyOn(Order, "findById").mockResolvedValueOnce(order);

      const req = {
        params: {
          orderId: "507f1f77bcf86cd799439011"
        },
        body: {
          status: targetStatus
        },
        requestId: "test-request-id"
      };

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };

      const next = vi.fn();

      await updateOrderStatus(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          code: "INVALID_ORDER_STATUS_TRANSITION"
        })
      );

      expect(order.status).toBe("confirmed");
      expect(order.save).not.toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();

      vi.restoreAllMocks();
    }
  });

  it("rejects transitions from delivered and cancelled orders", async () => {
    const terminalStatuses = [
      "delivered",
      "cancelled"
    ];

    for (const currentStatus of terminalStatuses) {
      const order = {
        _id: "507f1f77bcf86cd799439011",
        status: currentStatus,
        save: vi.fn()
      };

      vi.spyOn(Order, "findById")
        .mockResolvedValueOnce(order);

      const req = {
        params: {
          orderId: "507f1f77bcf86cd799439011"
        },
        body: {
          status: "processing"
        },
        requestId: "test-request-id"
      };

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };

      const next = vi.fn();

      await updateOrderStatus(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          code: "INVALID_ORDER_STATUS_TRANSITION"
        })
      );

      expect(order.status).toBe(currentStatus);
      expect(order.save).not.toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();

      vi.restoreAllMocks();
    }
  });

  it("handles unknown or undefined order status using fallback without crashing", async () => {
    const order = {
      _id: "507f1f77bcf86cd799439011",
      status: "non_existent_status",
      save: vi.fn()
    };

    vi.spyOn(Order, "findById").mockResolvedValueOnce(order);

    const req = {
      params: {
        orderId: "507f1f77bcf86cd799439011"
      },
      body: {
        status: "processing"
      },
      requestId: "test-request-id"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    const next = vi.fn();

    await updateOrderStatus(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        code: "INVALID_ORDER_STATUS_TRANSITION"
      })
    );

    expect(order.save).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("restores stock for every order item when admin cancellation occurs", async () => {
    const order = {
      _id: "507f1f77bcf86cd799439011",
      status: "confirmed",
      items: [
        {
          product: "507f1f77bcf86cd799439013",
          quantity: 2
        },
        {
          product: "507f1f77bcf86cd799439014",
          quantity: 5
        }
      ]
    };

    const updatedOrder = {
      ...order,
      status: "cancelled"
    };

    vi.spyOn(Order, "findOneAndUpdate").mockResolvedValue(updatedOrder);
    vi.spyOn(Product, "findByIdAndUpdate").mockResolvedValue(true);

    const req = {
      params: {
        orderId: "507f1f77bcf86cd799439011"
      },
      body: {
        status: "cancelled"
      },
      requestId: "test-request-id"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    const next = vi.fn();

    await updateOrderStatus(req, res, next);

    expect(Order.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: "507f1f77bcf86cd799439011",
        status: { $in: ["pending", "confirmed", "processing"] }
      },
      {
        $set: {
          status: "cancelled",
          cancellation: {
            reason: "other",
            reasonDetail: "",
            cancelledBy: "admin",
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
          stock: 5
        }
      },
      { session: mockSession }
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Order status updated successfully",
      data: {
        order: updatedOrder
      },
      requestId: "test-request-id"
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("does not restore stock for non-cancellation transitions", async () => {
    const order = {
      _id: "507f1f77bcf86cd799439011",
      status: "confirmed",
      items: [
        {
          product: "507f1f77bcf86cd799439013",
          quantity: 2
        }
      ],
      save: vi.fn().mockResolvedValue(true)
    };

    vi.spyOn(Order, "findById").mockResolvedValue(order);
    vi.spyOn(Product, "findByIdAndUpdate");

    const req = {
      params: {
        orderId: "507f1f77bcf86cd799439011"
      },
      body: {
        status: "processing"
      },
      requestId: "test-request-id"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    const next = vi.fn();

    await updateOrderStatus(req, res, next);

    expect(Product.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(order.status).toBe("processing");
    expect(order.save).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it("does not restore stock if order persistence fails during cancellation", async () => {
    const saveError = new Error("Database persistence failed");

    vi.spyOn(Order, "findOneAndUpdate").mockRejectedValue(saveError);
    vi.spyOn(Product, "findByIdAndUpdate");

    const req = {
      params: {
        orderId: "507f1f77bcf86cd799439011"
      },
      body: {
        status: "cancelled"
      },
      requestId: "test-request-id"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    const next = vi.fn();

    await updateOrderStatus(req, res, next);

    expect(Order.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(Product.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(saveError);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("guarantees atomic single-winner cancellation under concurrent race and restores stock exactly once", async () => {
    const orderId = "507f1f77bcf86cd799439011";
    const cancelledOrderDoc = {
      _id: orderId,
      status: "cancelled",
      items: [
        {
          product: "507f1f77bcf86cd799439013",
          quantity: 3
        }
      ]
    };

    // First request wins the atomic conditional transition
    // Second concurrent request sees the order is no longer cancellable (matches 0 documents -> null)
    let winnerChosen = false;
    vi.spyOn(Order, "findOneAndUpdate").mockImplementation((query) => {
      if (query.status === "cancelled") {
        return Promise.resolve(cancelledOrderDoc);
      }
      if (query.status && query.status.$in) {
        if (!winnerChosen) {
          winnerChosen = true;
          return Promise.resolve(cancelledOrderDoc);
        }
        return Promise.resolve(null);
      }
      return Promise.resolve(null);
    });

    // Losing request inspects the order to distinguish 404 vs invalid transition
    vi.spyOn(Order, "findById").mockResolvedValue(cancelledOrderDoc);
    vi.spyOn(Product, "findByIdAndUpdate").mockResolvedValue(true);

    const req1 = {
      params: { orderId },
      body: { status: "cancelled" },
      requestId: "req-race-1"
    };
    const res1 = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const next1 = vi.fn();

    const req2 = {
      params: { orderId },
      body: { status: "cancelled" },
      requestId: "req-race-2"
    };
    const res2 = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const next2 = vi.fn();

    // Execute concurrently
    await Promise.all([
      updateOrderStatus(req1, res1, next1),
      updateOrderStatus(req2, res2, next2)
    ]);

    // Request 1 succeeded
    expect(res1.status).toHaveBeenCalledWith(200);
    expect(res1.json).toHaveBeenCalledWith({
      success: true,
      message: "Order status updated successfully",
      data: {
        order: cancelledOrderDoc
      },
      requestId: "req-race-1"
    });
    expect(next1).not.toHaveBeenCalled();

    // Request 2 lost the race and was rejected with INVALID_ORDER_STATUS_TRANSITION
    expect(res2.status).not.toHaveBeenCalled();
    expect(next2).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        code: "INVALID_ORDER_STATUS_TRANSITION",
        message: "Cannot change order status from cancelled to cancelled"
      })
    );

    // Both calls attempted the atomic conditional update
    const casCalls = Order.findOneAndUpdate.mock.calls.filter(
      (c) => c[0].status && c[0].status.$in
    );
    expect(casCalls).toHaveLength(2);
    for (const call of casCalls) {
      expect(call).toEqual([
        {
          _id: orderId,
          status: { $in: ["pending", "confirmed", "processing"] }
        },
        {
          $set: {
            status: "cancelled",
            cancellation: {
              reason: "other",
              reasonDetail: "",
              cancelledBy: "admin",
              cancelledAt: expect.any(Date)
            }
          }
        },
        {
          new: true,
          session: mockSession
        }
      ]);
    }

    // Stock restoration occurred EXACTLY ONCE for the items, not twice
    expect(Product.findByIdAndUpdate).toHaveBeenCalledTimes(1);
    expect(Product.findByIdAndUpdate).toHaveBeenCalledWith(
      "507f1f77bcf86cd799439013",
      {
        $inc: {
          stock: 3
        }
      },
      { session: mockSession }
    );
  });

  it("prevents duplicate cancellation on an already-cancelled order and does not touch Product stock", async () => {
    const orderId = "507f1f77bcf86cd799439011";
    const alreadyCancelledOrder = {
      _id: orderId,
      status: "cancelled",
      items: [
        {
          product: "507f1f77bcf86cd799439013",
          quantity: 2
        }
      ]
    };

    // First request succeeds
    let firstCallDone = false;
    vi.spyOn(Order, "findOneAndUpdate").mockImplementation((query) => {
      if (query.status === "cancelled") {
        return Promise.resolve(alreadyCancelledOrder);
      }
      if (query.status && query.status.$in) {
        if (!firstCallDone) {
          firstCallDone = true;
          return Promise.resolve(alreadyCancelledOrder);
        }
        return Promise.resolve(null);
      }
      return Promise.resolve(null);
    });

    vi.spyOn(Order, "findById").mockResolvedValue(alreadyCancelledOrder);
    vi.spyOn(Product, "findByIdAndUpdate").mockResolvedValue(true);

    const req1 = {
      params: { orderId },
      body: { status: "cancelled" },
      requestId: "cancel-req-1"
    };
    const res1 = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const next1 = vi.fn();

    // First cancellation
    await updateOrderStatus(req1, res1, next1);

    expect(res1.status).toHaveBeenCalledWith(200);
    expect(Product.findByIdAndUpdate).toHaveBeenCalledTimes(1);
    expect(next1).not.toHaveBeenCalled();

    // Clear spy history to strictly verify second cancellation
    Product.findByIdAndUpdate.mockClear();

    const req2 = {
      params: { orderId },
      body: { status: "cancelled" },
      requestId: "cancel-req-2"
    };
    const res2 = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const next2 = vi.fn();

    // Second cancellation attempt
    await updateOrderStatus(req2, res2, next2);

    expect(next2).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        code: "INVALID_ORDER_STATUS_TRANSITION",
        message: "Cannot change order status from cancelled to cancelled"
      })
    );
    expect(res2.status).not.toHaveBeenCalled();
    expect(Product.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("rejects cancellation of a shipped order and does not restore stock", async () => {
    const orderId = "507f1f77bcf86cd799439011";
    vi.spyOn(Order, "findOneAndUpdate").mockResolvedValue(null);
    vi.spyOn(Order, "findById").mockResolvedValue({
      _id: orderId,
      status: "shipped",
      items: [{ product: "507f1f77bcf86cd799439013", quantity: 2 }]
    });
    vi.spyOn(Product, "findByIdAndUpdate");

    const req = {
      params: { orderId },
      body: { status: "cancelled" },
      requestId: "req-shipped"
    };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const next = vi.fn();

    await updateOrderStatus(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        code: "INVALID_ORDER_STATUS_TRANSITION",
        message: "Cannot change order status from shipped to cancelled"
      })
    );
    expect(Product.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects cancellation of a delivered order and does not restore stock", async () => {
    const orderId = "507f1f77bcf86cd799439011";
    vi.spyOn(Order, "findOneAndUpdate").mockResolvedValue(null);
    vi.spyOn(Order, "findById").mockResolvedValue({
      _id: orderId,
      status: "delivered",
      items: [{ product: "507f1f77bcf86cd799439013", quantity: 2 }]
    });
    vi.spyOn(Product, "findByIdAndUpdate");

    const req = {
      params: { orderId },
      body: { status: "cancelled" },
      requestId: "req-delivered"
    };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const next = vi.fn();

    await updateOrderStatus(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        code: "INVALID_ORDER_STATUS_TRANSITION",
        message: "Cannot change order status from delivered to cancelled"
      })
    );
    expect(Product.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 404 when order does not exist during cancellation", async () => {
    const orderId = "507f1f77bcf86cd799439011";
    vi.spyOn(Order, "findOneAndUpdate").mockResolvedValue(null);
    vi.spyOn(Order, "findById").mockResolvedValue(null);
    vi.spyOn(Product, "findByIdAndUpdate");

    const req = {
      params: { orderId },
      body: { status: "cancelled" },
      requestId: "req-not-found"
    };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const next = vi.fn();

    await updateOrderStatus(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        code: "ORDER_NOT_FOUND",
        message: "Order not found"
      })
    );
    expect(Product.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  describe("P1.5.4 Admin Cancellation Reason Persistence", () => {
    const orderId = "507f1f77bcf86cd799439011";

    it("persists cancellation reason with customer_request for pending -> cancelled", async () => {
      const mockOrder = {
        _id: orderId,
        status: "pending",
        items: [{ product: "507f1f77bcf86cd799439013", quantity: 2 }]
      };

      let currentOrder = { ...mockOrder, status: "cancelled" };
      vi.spyOn(Order, "findOneAndUpdate").mockImplementation((query, update) => {
        if (update?.$set) {
          currentOrder = {
            ...currentOrder,
            ...update.$set,
            cancellation: update.$set.cancellation || currentOrder.cancellation
          };
        }
        return Promise.resolve(currentOrder);
      });
      Product.findByIdAndUpdate.mockResolvedValue(true);

      const req = {
        params: { orderId },
        body: {
          status: "cancelled",
          reason: "customer_request",
          reasonDetail: "Customer phoned support to cancel order"
        },
        requestId: "test-req-admin-1"
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await updateOrderStatus(req, res, next);

      expect(Order.findOneAndUpdate).toHaveBeenCalledWith(
        {
          _id: orderId,
          status: { $in: ["pending", "confirmed", "processing"] }
        },
        {
          $set: {
            status: "cancelled",
            cancellation: {
              reason: "customer_request",
              reasonDetail: "Customer phoned support to cancel order",
              cancelledBy: "admin",
              cancelledAt: expect.any(Date)
            }
          }
        },
        { new: true, session: mockSession }
      );

      const returnedOrder = res.json.mock.calls[0][0].data.order;
      expect(returnedOrder.cancellation.reason).toBe("customer_request");
      expect(returnedOrder.cancellation.reasonDetail).toBe("Customer phoned support to cancel order");
      expect(returnedOrder.cancellation.cancelledBy).toBe("admin");
      expect(returnedOrder.cancellation.cancelledAt).toBeInstanceOf(Date);
      expect(next).not.toHaveBeenCalled();
    });

    it("persists cancellation reason with item_unavailable for confirmed -> cancelled", async () => {
      const mockOrder = {
        _id: orderId,
        status: "confirmed",
        items: [{ product: "507f1f77bcf86cd799439013", quantity: 1 }]
      };

      let currentOrder = { ...mockOrder, status: "cancelled" };
      vi.spyOn(Order, "findOneAndUpdate").mockImplementation((query, update) => {
        if (update?.$set) {
          currentOrder = {
            ...currentOrder,
            ...update.$set,
            cancellation: update.$set.cancellation || currentOrder.cancellation
          };
        }
        return Promise.resolve(currentOrder);
      });
      Product.findByIdAndUpdate.mockResolvedValue(true);

      const req = {
        params: { orderId },
        body: {
          status: "cancelled",
          reason: "item_unavailable",
          reasonDetail: "Item was found damaged during quality inspection"
        },
        requestId: "test-req-admin-2"
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await updateOrderStatus(req, res, next);

      expect(Order.findOneAndUpdate).toHaveBeenCalledWith(
        expect.anything(),
        {
          $set: {
            status: "cancelled",
            cancellation: {
              reason: "item_unavailable",
              reasonDetail: "Item was found damaged during quality inspection",
              cancelledBy: "admin",
              cancelledAt: expect.any(Date)
            }
          }
        },
        { new: true, session: mockSession }
      );
      expect(next).not.toHaveBeenCalled();
    });

    it("persists cancellation reason with fraud_suspected for processing -> cancelled", async () => {
      const mockOrder = {
        _id: orderId,
        status: "processing",
        items: [{ product: "507f1f77bcf86cd799439013", quantity: 1 }]
      };

      let currentOrder = { ...mockOrder, status: "cancelled" };
      vi.spyOn(Order, "findOneAndUpdate").mockImplementation((query, update) => {
        if (update?.$set) {
          currentOrder = {
            ...currentOrder,
            ...update.$set,
            cancellation: update.$set.cancellation || currentOrder.cancellation
          };
        }
        return Promise.resolve(currentOrder);
      });
      Product.findByIdAndUpdate.mockResolvedValue(true);

      const req = {
        params: { orderId },
        body: {
          status: "cancelled",
          reason: "fraud_suspected",
          reasonDetail: "Billing address mismatch flagged by risk system"
        },
        requestId: "test-req-admin-3"
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await updateOrderStatus(req, res, next);

      expect(Order.findOneAndUpdate).toHaveBeenCalledWith(
        expect.anything(),
        {
          $set: {
            status: "cancelled",
            cancellation: {
              reason: "fraud_suspected",
              reasonDetail: "Billing address mismatch flagged by risk system",
              cancelledBy: "admin",
              cancelledAt: expect.any(Date)
            }
          }
        },
        { new: true, session: mockSession }
      );
      expect(next).not.toHaveBeenCalled();
    });

    it("defaults reason to 'other' and reasonDetail to '' when omitted", async () => {
      const mockOrder = {
        _id: orderId,
        status: "pending",
        items: [{ product: "507f1f77bcf86cd799439013", quantity: 1 }]
      };

      vi.spyOn(Order, "findOneAndUpdate").mockImplementation((query, update) => {
        return Promise.resolve({
          ...mockOrder,
          status: "cancelled",
          cancellation: update.$set.cancellation
        });
      });
      Product.findByIdAndUpdate.mockResolvedValue(true);

      const req = {
        params: { orderId },
        body: {
          status: "cancelled"
        },
        requestId: "test-req-admin-default"
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await updateOrderStatus(req, res, next);

      expect(Order.findOneAndUpdate).toHaveBeenCalledWith(
        expect.anything(),
        {
          $set: {
            status: "cancelled",
            cancellation: {
              reason: "other",
              reasonDetail: "",
              cancelledBy: "admin",
              cancelledAt: expect.any(Date)
            }
          }
        },
        { new: true, session: mockSession }
      );
    });

    it("records a server-generated Date for cancelledAt", async () => {
      const mockOrder = {
        _id: orderId,
        status: "pending",
        items: []
      };

      vi.spyOn(Order, "findOneAndUpdate").mockResolvedValue({
        ...mockOrder,
        status: "cancelled"
      });

      const beforeTime = Date.now();

      const req = {
        params: { orderId },
        body: {
          status: "cancelled",
          reason: "customer_request"
        },
        requestId: "test-req-admin-time"
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await updateOrderStatus(req, res, next);

      const afterTime = Date.now();

      const updateCall = Order.findOneAndUpdate.mock.calls[0][1];
      const cancelledAt = updateCall.$set.cancellation.cancelledAt;
      expect(cancelledAt).toBeInstanceOf(Date);
      expect(cancelledAt.getTime()).toBeGreaterThanOrEqual(beforeTime);
      expect(cancelledAt.getTime()).toBeLessThanOrEqual(afterTime);
      expect(updateCall.$set.cancellation.cancelledBy).toBe("admin");
    });

    it("security: ignores client-supplied cancelledBy and cancelledAt", async () => {
      const mockOrder = {
        _id: orderId,
        status: "pending",
        items: []
      };

      vi.spyOn(Order, "findOneAndUpdate").mockResolvedValue({
        ...mockOrder,
        status: "cancelled"
      });

      const fakePastDate = new Date("2021-06-15T00:00:00.000Z");

      const req = {
        params: { orderId },
        body: {
          status: "cancelled",
          reason: "customer_request",
          cancelledBy: "customer",
          cancelledAt: fakePastDate
        },
        requestId: "test-req-admin-sec"
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await updateOrderStatus(req, res, next);

      const updateCall = Order.findOneAndUpdate.mock.calls[0][1];
      expect(updateCall.$set.cancellation.cancelledBy).toBe("admin");
      expect(updateCall.$set.cancellation.cancelledAt).not.toEqual(fakePastDate);
      expect(updateCall.$set.cancellation.cancelledAt.getTime()).toBeGreaterThan(fakePastDate.getTime());
    });

    it("atomicity: verifies cancellation is a single atomic update containing status and cancellation object", async () => {
      const mockOrder = {
        _id: orderId,
        status: "processing",
        items: []
      };

      vi.spyOn(Order, "findOneAndUpdate").mockResolvedValue({
        ...mockOrder,
        status: "cancelled"
      });

      const req = {
        params: { orderId },
        body: {
          status: "cancelled",
          reason: "delivery_address_undeliverable",
          reasonDetail: "Address does not exist"
        },
        requestId: "test-req-admin-atomic"
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await updateOrderStatus(req, res, next);

      expect(Order.findOneAndUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { new: true, session: mockSession }
      );
      const updateArg = Order.findOneAndUpdate.mock.calls[0][1];
      expect(Object.keys(updateArg)).toEqual(["$set"]);
      expect(updateArg.$set).toHaveProperty("status", "cancelled");
      expect(updateArg.$set).toHaveProperty("cancellation");
      expect(updateArg.$set.cancellation).toEqual({
        reason: "delivery_address_undeliverable",
        reasonDetail: "Address does not exist",
        cancelledBy: "admin",
        cancelledAt: expect.any(Date)
      });
    });

    it("duplicate/race: does not overwrite cancellation on already-cancelled order and does not restore stock", async () => {
      const alreadyCancelledOrder = {
        _id: orderId,
        status: "cancelled",
        cancellation: {
          reason: "customer_request",
          reasonDetail: "Original reason",
          cancelledBy: "admin",
          cancelledAt: new Date("2026-01-01T00:00:00.000Z")
        }
      };

      vi.spyOn(Order, "findOneAndUpdate").mockResolvedValue(null);
      vi.spyOn(Order, "findById").mockResolvedValue(alreadyCancelledOrder);

      const req = {
        params: { orderId },
        body: {
          status: "cancelled",
          reason: "fraud_suspected",
          reasonDetail: "Attempted override"
        },
        requestId: "test-req-admin-race"
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await updateOrderStatus(req, res, next);

      expect(Product.findByIdAndUpdate).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          code: "INVALID_ORDER_STATUS_TRANSITION",
          message: "Cannot change order status from cancelled to cancelled"
        })
      );
    });

    describe("non-cancellation transitions: do not create or modify cancellation metadata", () => {
      const nonCancellationTransitions = [
        { from: "pending", to: "processing" },
        { from: "confirmed", to: "processing" },
        { from: "processing", to: "shipped" },
        { from: "shipped", to: "delivered" }
      ];

      for (const { from, to } of nonCancellationTransitions) {
        it(`${from} -> ${to} preserves null cancellation`, async () => {
          const orderDoc = {
            _id: orderId,
            status: from,
            cancellation: null,
            save: vi.fn().mockResolvedValue(true)
          };

          vi.spyOn(Order, "findById").mockResolvedValue(orderDoc);
          vi.spyOn(Order, "findOneAndUpdate");

          const req = {
            params: { orderId },
            body: { status: to },
            requestId: `test-transition-${from}-${to}`
          };
          const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
          const next = vi.fn();

          await updateOrderStatus(req, res, next);

          expect(Order.findOneAndUpdate).not.toHaveBeenCalled();
          expect(orderDoc.status).toBe(to);
          expect(orderDoc.cancellation).toBeNull();
          expect(orderDoc.save).toHaveBeenCalledTimes(1);
          expect(res.status).toHaveBeenCalledWith(200);
          expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
              success: true,
              data: { order: orderDoc }
            })
          );
          expect(next).not.toHaveBeenCalled();
        });
      }
    });

    it("cannot overwrite cancellation on an order previously cancelled by customer or system", async () => {
      const customerCancelledOrder = {
        _id: orderId,
        status: "cancelled",
        cancellation: {
          reason: "changed_mind",
          reasonDetail: "Customer cancelled previously",
          cancelledBy: "customer",
          cancelledAt: new Date("2026-01-01T00:00:00.000Z")
        }
      };

      vi.spyOn(Order, "findOneAndUpdate").mockResolvedValue(null);
      vi.spyOn(Order, "findById").mockResolvedValue(customerCancelledOrder);

      const req = {
        params: { orderId },
        body: {
          status: "cancelled",
          reason: "fraud_suspected",
          reasonDetail: "Admin overwrite attempt"
        },
        requestId: "test-req-admin-customer-preserve"
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await updateOrderStatus(req, res, next);

      expect(Product.findByIdAndUpdate).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          code: "INVALID_ORDER_STATUS_TRANSITION",
          message: "Cannot change order status from cancelled to cancelled"
        })
      );
      expect(customerCancelledOrder.cancellation.cancelledBy).toBe("customer");
      expect(customerCancelledOrder.cancellation.reason).toBe("changed_mind");
    });
  });
});
