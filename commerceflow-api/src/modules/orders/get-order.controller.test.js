import { describe, it, expect, beforeEach, vi } from "vitest";

import getOrder from "./get-order.controller.js";
import Order from "./order.model.js";

describe("getOrder", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the order when the user owns it", async () => {
    const order = {
      _id: "507f1f77bcf86cd799439011",
      user: "507f1f77bcf86cd799439012",
      items: []
    };

    const populate = vi.fn().mockResolvedValue(order);

    vi.spyOn(Order, "findById")
      .mockReturnValue({
        populate
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

    await getOrder(req, res, next);

    expect(Order.findById).toHaveBeenCalledWith(
      "507f1f77bcf86cd799439011"
    );

    expect(populate).toHaveBeenCalledWith(
      "items.product",
      "name price image category"
    );

    expect(res.status).toHaveBeenCalledWith(200);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Order retrieved successfully",
      data: {
        order
      },
      requestId: "test-request-id"
    });

    expect(next).not.toHaveBeenCalled();
  });
});
  it("passes ORDER_NOT_FOUND to the error middleware when the order does not exist", async () => {
    const populate = vi.fn().mockResolvedValue(null);

    vi.spyOn(Order, "findById")
      .mockReturnValue({
        populate
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

    await getOrder(req, res, next);

    expect(Order.findById).toHaveBeenCalledWith(
      "507f1f77bcf86cd799439011"
    );

    expect(next).toHaveBeenCalledTimes(1);

    const error = next.mock.calls[0][0];

    expect(error).toMatchObject({
      statusCode: 404,
      code: "ORDER_NOT_FOUND"
    });

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
    it("rejects access when the order belongs to another user", async () => {
    const order = {
      _id: "507f1f77bcf86cd799439011",
      user: "507f1f77bcf86cd799439013",
      items: []
    };

    const populate = vi.fn().mockResolvedValue(order);

    vi.spyOn(Order, "findById")
      .mockReturnValue({
        populate
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

    await getOrder(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);

    const error = next.mock.calls[0][0];

    expect(error).toMatchObject({
      statusCode: 403,
      code: "ORDER_ACCESS_DENIED"
    });

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it("allows an admin to view an order belonging to another user", async () => {
    const order = {
      _id: "507f1f77bcf86cd799439011",
      user: "507f1f77bcf86cd799439013",
      items: []
    };

    const populate = vi.fn().mockResolvedValue(order);

    vi.spyOn(Order, "findById").mockReturnValue({ populate });

    const req = {
      params: {
        orderId: "507f1f77bcf86cd799439011"
      },
      user: {
        _id: "507f1f77bcf86cd799439012",
        role: "admin"
      },
      requestId: "test-request-id"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    const next = vi.fn();

    await getOrder(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Order retrieved successfully",
      data: {
        order
      },
      requestId: "test-request-id"
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("passes database errors to the error middleware", async () => {
    const databaseError = new Error("Database failure");

    const populate = vi.fn()
      .mockRejectedValue(databaseError);

    vi.spyOn(Order, "findById")
      .mockReturnValue({
        populate
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

    await getOrder(req, res, next);

    expect(next).toHaveBeenCalledWith(databaseError);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it("successfully returns a legacy order where newly added financial fields are absent", async () => {
    // Legacy order document without shippingAmount, taxAmount, discountAmount, total
    const legacyOrder = {
      _id: "507f1f77bcf86cd799439011",
      user: "507f1f77bcf86cd799439012",
      subtotal: 500,
      totalQuantity: 2,
      status: "confirmed",
      items: []
    };

    const populate = vi.fn().mockResolvedValue(legacyOrder);
    vi.spyOn(Order, "findById").mockReturnValue({ populate });

    const req = {
      params: { orderId: legacyOrder._id },
      user: { _id: legacyOrder.user },
      requestId: "test-request-id"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const next = vi.fn();

    await getOrder(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Order retrieved successfully",
      data: {
        order: legacyOrder
      },
      requestId: "test-request-id"
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("retrieves a legacy order (subtotal: 2500) without mutating the database document during read", async () => {
    const saveSpy = vi.fn();
    const legacyOrder = {
      _id: "507f1f77bcf86cd799439099",
      user: "507f1f77bcf86cd799439012",
      subtotal: 2500,
      totalQuantity: 2,
      status: "confirmed",
      items: [],
      save: saveSpy
    };

    const populate = vi.fn().mockResolvedValue(legacyOrder);
    vi.spyOn(Order, "findById").mockReturnValue({ populate });

    const req = {
      params: { orderId: legacyOrder._id },
      user: { _id: legacyOrder.user },
      requestId: "legacy-test-id"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const next = vi.fn();

    await getOrder(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    const returnedOrder = res.json.mock.calls[0][0].data.order;
    expect(returnedOrder.subtotal).toBe(2500);
    expect(returnedOrder.total).toBeUndefined();
    expect(returnedOrder.shippingAmount).toBeUndefined();
    expect(returnedOrder.taxAmount).toBeUndefined();
    expect(returnedOrder.discountAmount).toBeUndefined();
    // Document must not be mutated or saved during read
    expect(saveSpy).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("successfully returns a newly created order with all itemized financial fields", async () => {
    const itemizedOrder = {
      _id: "507f1f77bcf86cd799439011",
      user: "507f1f77bcf86cd799439012",
      subtotal: 750,
      shippingAmount: 0,
      taxAmount: 0,
      discountAmount: 0,
      total: 750,
      totalQuantity: 1,
      status: "confirmed",
      items: []
    };

    const populate = vi.fn().mockResolvedValue(itemizedOrder);
    vi.spyOn(Order, "findById").mockReturnValue({ populate });

    const req = {
      params: { orderId: itemizedOrder._id },
      user: { _id: itemizedOrder.user },
      requestId: "test-request-id"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const next = vi.fn();

    await getOrder(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Order retrieved successfully",
      data: {
        order: itemizedOrder
      },
      requestId: "test-request-id"
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns order with checkoutState 'in_progress' when retrieved by owner", async () => {
    const abandonedOrder = {
      _id: "507f1f77bcf86cd799439011",
      user: "507f1f77bcf86cd799439012",
      status: "pending",
      checkoutState: "in_progress",
      items: []
    };

    const populate = vi.fn().mockResolvedValue(abandonedOrder);
    vi.spyOn(Order, "findById").mockReturnValue({ populate });

    const req = {
      params: { orderId: abandonedOrder._id },
      user: { _id: abandonedOrder.user, role: "customer" },
      requestId: "test-request-id"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const next = vi.fn();

    await getOrder(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          order: expect.objectContaining({
            checkoutState: "in_progress"
          })
        }
      })
    );
  });

  describe("P1.5.7 — Cancellation Metadata Read-Path Regression Tests", () => {
    it("returns cancellation metadata in data.order when order is cancelled", async () => {
      const cancelledOrder = {
        _id: "507f1f77bcf86cd799439011",
        user: "507f1f77bcf86cd799439012",
        status: "cancelled",
        cancellation: {
          reason: "system_checkout_failure",
          reasonDetail: "",
          cancelledBy: "system",
          cancelledAt: new Date("2026-10-01T12:00:00.000Z")
        },
        items: []
      };

      const populate = vi.fn().mockResolvedValue(cancelledOrder);
      vi.spyOn(Order, "findById").mockReturnValue({ populate });

      const req = {
        params: { orderId: cancelledOrder._id },
        user: { _id: cancelledOrder.user, role: "customer" },
        requestId: "test-req-cancelled"
      };

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await getOrder(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      const body = res.json.mock.calls[0][0];
      expect(body.data.order.status).toBe("cancelled");
      expect(body.data.order.cancellation).toEqual({
        reason: "system_checkout_failure",
        reasonDetail: "",
        cancelledBy: "system",
        cancelledAt: new Date("2026-10-01T12:00:00.000Z")
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("returns cancellation as null in data.order when order is active", async () => {
      const activeOrder = {
        _id: "507f1f77bcf86cd799439011",
        user: "507f1f77bcf86cd799439012",
        status: "processing",
        cancellation: null,
        items: []
      };

      const populate = vi.fn().mockResolvedValue(activeOrder);
      vi.spyOn(Order, "findById").mockReturnValue({ populate });

      const req = {
        params: { orderId: activeOrder._id },
        user: { _id: activeOrder.user, role: "customer" },
        requestId: "test-req-active"
      };

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await getOrder(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      const body = res.json.mock.calls[0][0];
      expect(body.data.order.status).toBe("processing");
      expect(body.data.order.cancellation).toBeNull();
      expect(next).not.toHaveBeenCalled();
    });

    it("returns legacy cancelled order without fabricated cancellation metadata", async () => {
      const legacyCancelledOrder = {
        _id: "507f1f77bcf86cd799439011",
        user: "507f1f77bcf86cd799439012",
        status: "cancelled",
        cancellation: null,
        items: []
      };

      const populate = vi.fn().mockResolvedValue(legacyCancelledOrder);
      vi.spyOn(Order, "findById").mockReturnValue({ populate });

      const req = {
        params: { orderId: legacyCancelledOrder._id },
        user: { _id: legacyCancelledOrder.user, role: "customer" },
        requestId: "test-req-legacy-cancelled"
      };

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await getOrder(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      const body = res.json.mock.calls[0][0];
      expect(body.data.order.status).toBe("cancelled");
      expect(body.data.order.cancellation).toBeNull();
      expect(next).not.toHaveBeenCalled();
    });

    it("ensures internal checkoutCompensation checkpoints and reservation tokens are not exposed", async () => {
      const orderData = {
        _id: "507f1f77bcf86cd799439011",
        user: "507f1f77bcf86cd799439012",
        status: "cancelled",
        cancellation: {
          reason: "customer_request",
          reasonDetail: "Please cancel my order",
          cancelledBy: "customer",
          cancelledAt: new Date("2026-10-01T12:00:00.000Z")
        },
        items: []
      };

      const populate = vi.fn().mockResolvedValue(orderData);
      vi.spyOn(Order, "findById").mockReturnValue({ populate });

      const req = {
        params: { orderId: orderData._id },
        user: { _id: orderData.user, role: "customer" },
        requestId: "test-req-security"
      };

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await getOrder(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      const body = res.json.mock.calls[0][0];
      expect(body.data.order.checkoutCompensation).toBeUndefined();
      expect(body.data.order.cancellation).toMatchObject({
        reason: "customer_request",
        reasonDetail: "Please cancel my order",
        cancelledBy: "customer",
        cancelledAt: expect.any(Date)
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("rejects customer access to another user's cancelled order and prevents cancellation metadata leakage", async () => {
      const orderData = {
        _id: "507f1f77bcf86cd799439011",
        user: "507f1f77bcf86cd799439099",
        status: "cancelled",
        cancellation: {
          reason: "payment_issue",
          reasonDetail: "Failed card charge",
          cancelledBy: "customer",
          cancelledAt: new Date()
        },
        items: []
      };

      const populate = vi.fn().mockResolvedValue(orderData);
      vi.spyOn(Order, "findById").mockReturnValue({ populate });

      const req = {
        params: { orderId: orderData._id },
        user: { _id: "507f1f77bcf86cd799439012", role: "customer" },
        requestId: "test-req-isolation"
      };

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await getOrder(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      const error = next.mock.calls[0][0];
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe("ORDER_ACCESS_DENIED");
      expect(res.json).not.toHaveBeenCalled();
    });

    it("allows admin to view cancellation metadata on any user's cancelled order detail", async () => {
      const cancelledAt = new Date("2026-10-02T10:00:00.000Z");
      const orderData = {
        _id: "507f1f77bcf86cd799439011",
        user: "507f1f77bcf86cd799439099",
        status: "cancelled",
        cancellation: {
          reason: "delivery_too_slow",
          reasonDetail: "Customer requested cancellation via support",
          cancelledBy: "admin",
          cancelledAt
        },
        items: []
      };

      const populate = vi.fn().mockResolvedValue(orderData);
      vi.spyOn(Order, "findById").mockReturnValue({ populate });

      const req = {
        params: { orderId: orderData._id },
        user: { _id: "507f1f77bcf86cd799439001", role: "admin" },
        requestId: "test-req-admin-detail"
      };

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await getOrder(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      const body = res.json.mock.calls[0][0];
      expect(body.data.order.cancellation).toEqual({
        reason: "delivery_too_slow",
        reasonDetail: "Customer requested cancellation via support",
        cancelledBy: "admin",
        cancelledAt
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("allows admin to view legacy cancelled order and returns null cancellation", async () => {
      const orderData = {
        _id: "507f1f77bcf86cd799439011",
        user: "507f1f77bcf86cd799439099",
        status: "cancelled",
        cancellation: null,
        items: []
      };

      const populate = vi.fn().mockResolvedValue(orderData);
      vi.spyOn(Order, "findById").mockReturnValue({ populate });

      const req = {
        params: { orderId: orderData._id },
        user: { _id: "507f1f77bcf86cd799439001", role: "admin" },
        requestId: "test-req-admin-legacy-detail"
      };

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await getOrder(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      const body = res.json.mock.calls[0][0];
      expect(body.data.order.status).toBe("cancelled");
      expect(body.data.order.cancellation).toBeNull();
      expect(next).not.toHaveBeenCalled();
    });

    it("does not allow request query or body parameters to override cancellation data", async () => {
      const cancelledAt = new Date("2026-10-01T12:00:00.000Z");
      const orderData = {
        _id: "507f1f77bcf86cd799439011",
        user: "507f1f77bcf86cd799439012",
        status: "cancelled",
        cancellation: {
          reason: "changed_mind",
          reasonDetail: "Decided to wait",
          cancelledBy: "customer",
          cancelledAt
        },
        items: []
      };

      const populate = vi.fn().mockResolvedValue(orderData);
      vi.spyOn(Order, "findById").mockReturnValue({ populate });

      const req = {
        params: { orderId: orderData._id },
        query: {
          cancellation: { reason: "fraud_suspected", cancelledBy: "admin" },
          status: "confirmed"
        },
        body: {
          cancellation: { reason: "hacked", cancelledBy: "system" }
        },
        user: { _id: orderData.user, role: "customer" },
        requestId: "test-req-tampering"
      };

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await getOrder(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      const body = res.json.mock.calls[0][0];
      expect(body.data.order.cancellation).toEqual({
        reason: "changed_mind",
        reasonDetail: "Decided to wait",
        cancelledBy: "customer",
        cancelledAt
      });
      expect(next).not.toHaveBeenCalled();
    });
  });