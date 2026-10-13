
import {
  describe,
  it,
  expect,
  beforeEach,
  vi
} from "vitest";

import getOrders from "./get-orders.controller.js";
import Order from "./order.model.js";

describe("getOrders", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns orders with default pagination", async () => {
    const orders = [
      {
        _id: "507f1f77bcf86cd799439011",
        status: "pending"
      },
      {
        _id: "507f1f77bcf86cd799439012",
        status: "confirmed"
      }
    ];

    const query = {
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(orders)
    };

    vi.spyOn(Order, "countDocuments")
      .mockResolvedValue(2);

    vi.spyOn(Order, "find")
      .mockReturnValue(query);

    const req = {
      query: {},
      user: {
        _id: "507f1f77bcf86cd799439099"
      },
      requestId: "test-request-id"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    const next = vi.fn();

    await getOrders(req, res, next);

    expect(Order.countDocuments)
      .toHaveBeenCalledWith({
        user: "507f1f77bcf86cd799439099"
      });

    expect(Order.find)
      .toHaveBeenCalledWith({
        user: "507f1f77bcf86cd799439099"
      });

    expect(query.sort)
      .toHaveBeenCalledWith({
        createdAt: -1
      });

    expect(query.skip)
      .toHaveBeenCalledWith(0);

    expect(query.limit)
      .toHaveBeenCalledWith(10);

    expect(res.status)
      .toHaveBeenCalledWith(200);

    expect(res.json)
      .toHaveBeenCalledWith({
        success: true,
        message: "Orders retrieved successfully",
        data: {
          orders,
          pagination: {
            page: 1,
            limit: 10,
            totalOrders: 2,
            totalPages: 1
          }
        },
        requestId: "test-request-id"
      });

    expect(next)
      .not.toHaveBeenCalled();
  });

  it("filters by status, applies pagination, and sorts ascending", async () => {
    const orders = [
      {
        _id: "507f1f77bcf86cd799439011",
        status: "processing"
      }
    ];

    const query = {
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(orders)
    };

    vi.spyOn(Order, "countDocuments")
      .mockResolvedValue(6);

    vi.spyOn(Order, "find")
      .mockReturnValue(query);

    const req = {
      query: {
        page: "2",
        limit: "5",
        status: "processing",
        sortOrder: "asc"
      },
      user: {
        _id: "507f1f77bcf86cd799439099"
      },
      requestId: "test-request-id"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    const next = vi.fn();

    await getOrders(req, res, next);

    expect(Order.countDocuments)
      .toHaveBeenCalledWith({
        user: "507f1f77bcf86cd799439099",
        status: "processing"
      });

    expect(Order.find)
      .toHaveBeenCalledWith({
        user: "507f1f77bcf86cd799439099",
        status: "processing"
      });

    expect(query.sort)
      .toHaveBeenCalledWith({
        createdAt: 1
      });

    expect(query.skip)
      .toHaveBeenCalledWith(5);

    expect(query.limit)
      .toHaveBeenCalledWith(5);

    expect(res.status)
      .toHaveBeenCalledWith(200);

    expect(res.json)
      .toHaveBeenCalledWith({
        success: true,
        message: "Orders retrieved successfully",
        data: {
          orders,
          pagination: {
            page: 2,
            limit: 5,
            totalOrders: 6,
            totalPages: 2
          }
        },
        requestId: "test-request-id"
      });

    expect(next)
      .not.toHaveBeenCalled();
  });

  it("returns an empty order list when the user has no orders", async () => {
    const query = {
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([])
    };

    vi.spyOn(Order, "countDocuments")
      .mockResolvedValue(0);

    vi.spyOn(Order, "find")
      .mockReturnValue(query);

    const req = {
      query: {},
      user: {
        _id: "507f1f77bcf86cd799439099"
      },
      requestId: "test-request-id"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    const next = vi.fn();

    await getOrders(req, res, next);

    expect(res.status)
      .toHaveBeenCalledWith(200);

    expect(res.json)
      .toHaveBeenCalledWith({
        success: true,
        message: "Orders retrieved successfully",
        data: {
          orders: [],
          pagination: {
            page: 1,
            limit: 10,
            totalOrders: 0,
            totalPages: 1
          }
        },
        requestId: "test-request-id"
      });

    expect(next)
      .not.toHaveBeenCalled();
  });

  it("passes database errors to the error middleware", async () => {
    const databaseError =
      new Error("Database failure");

    vi.spyOn(Order, "countDocuments")
      .mockRejectedValue(databaseError);

    const req = {
      query: {},
      user: {
        _id: "507f1f77bcf86cd799439099"
      },
      requestId: "test-request-id"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    const next = vi.fn();

    await getOrders(req, res, next);

    expect(next)
      .toHaveBeenCalledWith(databaseError);

    expect(res.status)
      .not.toHaveBeenCalled();

    expect(res.json)
      .not.toHaveBeenCalled();
  });

  it("returns orders with checkoutState field so clients can observe order lifecycle state", async () => {
    const orders = [
      {
        _id: "507f1f77bcf86cd799439011",
        status: "pending",
        checkoutState: "in_progress"
      }
    ];

    const query = {
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(orders)
    };

    vi.spyOn(Order, "countDocuments").mockResolvedValue(1);
    vi.spyOn(Order, "find").mockReturnValue(query);

    const req = {
      query: {},
      user: { _id: "507f1f77bcf86cd799439099" },
      requestId: "test-request-id"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const next = vi.fn();

    await getOrders(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.data.orders[0].checkoutState).toBe("in_progress");
  });

  describe("P1.5.7 — Cancellation Metadata Read-Path Regression Tests", () => {
    it("preserves cancellation metadata in customer order list when order is cancelled", async () => {
      const orders = [
        {
          _id: "507f1f77bcf86cd799439011",
          status: "cancelled",
          cancellation: {
            reason: "system_checkout_failure",
            reasonDetail: "",
            cancelledBy: "system",
            cancelledAt: new Date("2026-10-01T12:00:00.000Z")
          }
        }
      ];

      const query = {
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue(orders)
      };

      vi.spyOn(Order, "countDocuments").mockResolvedValue(1);
      vi.spyOn(Order, "find").mockReturnValue(query);

      const req = {
        query: {},
        user: { _id: "507f1f77bcf86cd799439099" },
        requestId: "test-request-id"
      };

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await getOrders(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      const body = res.json.mock.calls[0][0];
      expect(body.data.orders).toHaveLength(1);
      expect(body.data.orders[0].status).toBe("cancelled");
      expect(body.data.orders[0].cancellation).toEqual({
        reason: "system_checkout_failure",
        reasonDetail: "",
        cancelledBy: "system",
        cancelledAt: new Date("2026-10-01T12:00:00.000Z")
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("returns cancellation as null in customer order list when order is active", async () => {
      const orders = [
        {
          _id: "507f1f77bcf86cd799439011",
          status: "processing",
          cancellation: null
        }
      ];

      const query = {
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue(orders)
      };

      vi.spyOn(Order, "countDocuments").mockResolvedValue(1);
      vi.spyOn(Order, "find").mockReturnValue(query);

      const req = {
        query: {},
        user: { _id: "507f1f77bcf86cd799439099" },
        requestId: "test-request-id"
      };

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await getOrders(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      const body = res.json.mock.calls[0][0];
      expect(body.data.orders).toHaveLength(1);
      expect(body.data.orders[0].status).toBe("processing");
      expect(body.data.orders[0].cancellation).toBeNull();
      expect(next).not.toHaveBeenCalled();
    });

    it("returns legacy cancelled order in customer order list without fabricated metadata", async () => {
      const orders = [
        {
          _id: "507f1f77bcf86cd799439011",
          status: "cancelled",
          cancellation: null
        }
      ];

      const query = {
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue(orders)
      };

      vi.spyOn(Order, "countDocuments").mockResolvedValue(1);
      vi.spyOn(Order, "find").mockReturnValue(query);

      const req = {
        query: {},
        user: { _id: "507f1f77bcf86cd799439099" },
        requestId: "test-request-id"
      };

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await getOrders(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      const body = res.json.mock.calls[0][0];
      expect(body.data.orders).toHaveLength(1);
      expect(body.data.orders[0].status).toBe("cancelled");
      expect(body.data.orders[0].cancellation).toBeNull();
      expect(next).not.toHaveBeenCalled();
    });

    it("customer sees cancellation metadata only for their own orders (enforced by user filter)", async () => {
      const userOrders = [
        {
          _id: "507f1f77bcf86cd799439011",
          user: "507f1f77bcf86cd799439099",
          status: "cancelled",
          cancellation: {
            reason: "ordered_by_mistake",
            reasonDetail: "Accidental purchase",
            cancelledBy: "customer",
            cancelledAt: new Date("2026-10-02T10:00:00.000Z")
          }
        }
      ];

      const query = {
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue(userOrders)
      };

      vi.spyOn(Order, "countDocuments").mockResolvedValue(1);
      const findSpy = vi.spyOn(Order, "find").mockReturnValue(query);

      const req = {
        query: {},
        user: { _id: "507f1f77bcf86cd799439099" },
        requestId: "test-req-user-filter"
      };

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await getOrders(req, res, next);

      expect(findSpy).toHaveBeenCalledWith({
        user: "507f1f77bcf86cd799439099"
      });
      expect(res.status).toHaveBeenCalledWith(200);
      const body = res.json.mock.calls[0][0];
      expect(body.data.orders[0].cancellation).toEqual({
        reason: "ordered_by_mistake",
        reasonDetail: "Accidental purchase",
        cancelledBy: "customer",
        cancelledAt: new Date("2026-10-02T10:00:00.000Z")
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("ensures internal checkoutCompensation checkpoints and reservation tokens are not exposed in customer order list", async () => {
      const orders = [
        {
          _id: "507f1f77bcf86cd799439011",
          status: "cancelled",
          cancellation: {
            reason: "system_checkout_failure",
            reasonDetail: "",
            cancelledBy: "system",
            cancelledAt: new Date("2026-10-01T12:00:00.000Z")
          }
        }
      ];

      const query = {
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue(orders)
      };

      vi.spyOn(Order, "countDocuments").mockResolvedValue(1);
      vi.spyOn(Order, "find").mockReturnValue(query);

      const req = {
        query: {},
        user: { _id: "507f1f77bcf86cd799439099" },
        requestId: "test-req-security-list"
      };

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await getOrders(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      const body = res.json.mock.calls[0][0];
      expect(body.data.orders[0].checkoutCompensation).toBeUndefined();
      expect(next).not.toHaveBeenCalled();
    });

    it("does not let request query or body parameters override cancellation data in customer order list", async () => {
      const cancelledAt = new Date("2026-10-01T12:00:00.000Z");
      const orders = [
        {
          _id: "507f1f77bcf86cd799439011",
          status: "cancelled",
          cancellation: {
            reason: "found_better_price",
            reasonDetail: "Found cheaper elsewhere",
            cancelledBy: "customer",
            cancelledAt
          }
        }
      ];

      const query = {
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue(orders)
      };

      vi.spyOn(Order, "countDocuments").mockResolvedValue(1);
      vi.spyOn(Order, "find").mockReturnValue(query);

      const req = {
        query: {
          cancellation: { reason: "fraud_suspected", cancelledBy: "admin" },
          status: "cancelled"
        },
        body: {
          cancellation: { reason: "hacked", cancelledBy: "system" }
        },
        user: { _id: "507f1f77bcf86cd799439099" },
        requestId: "test-req-tampering-list"
      };

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await getOrders(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      const body = res.json.mock.calls[0][0];
      expect(body.data.orders[0].cancellation).toEqual({
        reason: "found_better_price",
        reasonDetail: "Found cheaper elsewhere",
        cancelledBy: "customer",
        cancelledAt
      });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
