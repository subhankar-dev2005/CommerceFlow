
import {
  describe,
  it,
  expect,
  beforeEach,
  vi
} from "vitest";

import createPaymentOrder from "./create-payment-order.controller.js";
import Order from "../orders/order.model.js";
import razorpay from "./razorpay.service.js";
import request from "supertest";
import { createApp } from "../../app.js";
import User from "../users/user.model.js";
import generateToken from "../../utils/generate-token.js";

describe("createPaymentOrder", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a Razorpay order successfully", async () => {
    const order = {
      _id: "507f1f77bcf86cd799439011",
      user: "507f1f77bcf86cd799439012",
      subtotal: 499,
      status: "pending",
      payment: {
        status: "pending",
        razorpayOrderId: ""
      },
      save: vi.fn().mockResolvedValue(true)
    };

    vi.spyOn(Order, "findOne")
      .mockResolvedValue(order);

    vi.spyOn(razorpay.orders, "create")
      .mockResolvedValue({
        id: "order_TEST123",
        amount: 49900,
        currency: "INR"
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

    await createPaymentOrder(req, res, next);

    expect(Order.findOne).toHaveBeenCalledWith({
      _id: "507f1f77bcf86cd799439011",
      user: "507f1f77bcf86cd799439012"
    });

    expect(razorpay.orders.create).toHaveBeenCalledWith({
      amount: 49900,
      currency: "INR",
      receipt: "507f1f77bcf86cd799439011"
    });

    expect(order.payment.razorpayOrderId)
      .toBe("order_TEST123");

    expect(order.save).toHaveBeenCalledTimes(1);

    expect(res.status).toHaveBeenCalledWith(201);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Payment order created successfully",
      data: {
        razorpayOrderId: "order_TEST123",
        amount: 49900,
        currency: "INR",
        keyId: process.env.RAZORPAY_KEY_ID
      },
      requestId: "test-request-id"
    });

    expect(next).not.toHaveBeenCalled();
  });

  it("creates a Razorpay order using authoritative order.total for new orders", async () => {
    const order = {
      _id: "507f1f77bcf86cd799439011",
      user: "507f1f77bcf86cd799439012",
      subtotal: 1500,
      shippingAmount: 0,
      taxAmount: 0,
      discountAmount: 0,
      total: 1500,
      status: "pending",
      payment: {
        status: "pending",
        razorpayOrderId: ""
      },
      save: vi.fn().mockResolvedValue(true)
    };

    vi.spyOn(Order, "findOne").mockResolvedValue(order);
    vi.spyOn(razorpay.orders, "create").mockResolvedValue({
      id: "order_NEW123",
      amount: 150000,
      currency: "INR"
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

    await createPaymentOrder(req, res, next);

    expect(razorpay.orders.create).toHaveBeenCalledWith({
      amount: 150000,
      currency: "INR",
      receipt: "507f1f77bcf86cd799439011"
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 150000
        })
      })
    );
  });

  it("safely falls back to order.subtotal when order.total is missing (legacy orders)", async () => {
    const legacyOrder = {
      _id: "507f1f77bcf86cd799439011",
      user: "507f1f77bcf86cd799439012",
      subtotal: 800,
      status: "pending",
      payment: {
        status: "pending",
        razorpayOrderId: ""
      },
      save: vi.fn().mockResolvedValue(true)
    };

    vi.spyOn(Order, "findOne").mockResolvedValue(legacyOrder);
    vi.spyOn(razorpay.orders, "create").mockResolvedValue({
      id: "order_LEGACY123",
      amount: 80000,
      currency: "INR"
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

    await createPaymentOrder(req, res, next);

    expect(razorpay.orders.create).toHaveBeenCalledWith({
      amount: 80000,
      currency: "INR",
      receipt: "507f1f77bcf86cd799439011"
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 80000
        })
      })
    );
  });

  it("ignores any client-provided amount in request body and strictly resolves amount from order.total", async () => {
    const order = {
      _id: "507f1f77bcf86cd799439011",
      user: "507f1f77bcf86cd799439012",
      subtotal: 2500,
      shippingAmount: 0,
      taxAmount: 0,
      discountAmount: 0,
      total: 2500,
      status: "pending",
      payment: {
        status: "pending",
        razorpayOrderId: ""
      },
      save: vi.fn().mockResolvedValue(true)
    };

    vi.spyOn(Order, "findOne").mockResolvedValue(order);
    vi.spyOn(razorpay.orders, "create").mockResolvedValue({
      id: "order_AUTH123",
      amount: 250000,
      currency: "INR"
    });

    // Malicious client tries to send fake amount in body
    const req = {
      params: { orderId: "507f1f77bcf86cd799439011" },
      body: { amount: 1, total: 1 },
      user: { _id: "507f1f77bcf86cd799439012" },
      requestId: "test-tamper-id"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const next = vi.fn();

    await createPaymentOrder(req, res, next);

    // Backend authoritatively used order.total: 2500 -> 250000 paise
    expect(razorpay.orders.create).toHaveBeenCalledWith({
      amount: 250000,
      currency: "INR",
      receipt: "507f1f77bcf86cd799439011"
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("returns ORDER_NOT_FOUND when the order does not exist", async () => {
    vi.spyOn(Order, "findOne")
      .mockResolvedValue(null);

    vi.spyOn(razorpay.orders, "create");

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

    await createPaymentOrder(req, res, next);

    expect(Order.findOne).toHaveBeenCalledWith({
      _id: "507f1f77bcf86cd799439011",
      user: "507f1f77bcf86cd799439012"
    });

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe("ORDER_NOT_FOUND");
    expect(error.message).toBe("Order not found");
    expect(error.errors).toEqual([]);

    expect(res.status).not.toHaveBeenCalled();
    expect(razorpay.orders.create)
      .not.toHaveBeenCalled();
  });

  it("returns ORDER_CANCELLED when the order is cancelled", async () => {
    const order = {
      _id: "507f1f77bcf86cd799439011",
      user: "507f1f77bcf86cd799439012",
      subtotal: 499,
      status: "cancelled",
      payment: {
        status: "pending",
        razorpayOrderId: ""
      }
    };

    vi.spyOn(Order, "findOne")
      .mockResolvedValue(order);

    vi.spyOn(razorpay.orders, "create");

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

    await createPaymentOrder(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe("ORDER_CANCELLED");
    expect(error.message).toBe("Cannot create payment for a cancelled order");
    expect(error.errors).toEqual([]);

    expect(res.status).not.toHaveBeenCalled();
    expect(razorpay.orders.create)
      .not.toHaveBeenCalled();
  });

  it("returns ORDER_CHECKOUT_IN_PROGRESS when the order checkoutState is in_progress", async () => {
    const order = {
      _id: "507f1f77bcf86cd799439011",
      user: "507f1f77bcf86cd799439012",
      status: "pending",
      checkoutState: "in_progress",
      payment: {
        status: "pending",
        razorpayOrderId: ""
      }
    };

    vi.spyOn(Order, "findOne").mockResolvedValue(order);
    vi.spyOn(razorpay.orders, "create");

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

    await createPaymentOrder(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe("ORDER_CHECKOUT_IN_PROGRESS");
    expect(error.message).toBe("Cannot create payment for an order with checkout in progress");
    expect(res.status).not.toHaveBeenCalled();
    expect(razorpay.orders.create).not.toHaveBeenCalled();
  });

  it("returns ORDER_ALREADY_PAID when the order is already paid", async () => {
    const order = {
      _id: "507f1f77bcf86cd799439011",
      user: "507f1f77bcf86cd799439012",
      subtotal: 499,
      status: "confirmed",
      payment: {
        status: "paid",
        razorpayOrderId: ""
      }
    };

    vi.spyOn(Order, "findOne")
      .mockResolvedValue(order);

    vi.spyOn(razorpay.orders, "create");

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

    await createPaymentOrder(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe("ORDER_ALREADY_PAID");
    expect(error.message).toBe("Order has already been paid");
    expect(error.errors).toEqual([]);

    expect(res.status).not.toHaveBeenCalled();
    expect(razorpay.orders.create)
      .not.toHaveBeenCalled();
  });

  it("returns the existing Razorpay order when one already exists", async () => {
    const order = {
      _id: "507f1f77bcf86cd799439011",
      user: "507f1f77bcf86cd799439012",
      subtotal: 499,
      status: "pending",
      payment: {
        status: "pending",
        razorpayOrderId: "order_existing123"
      }
    };

    vi.spyOn(Order, "findOne")
      .mockResolvedValue(order);

    vi.spyOn(razorpay.orders, "create");

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

    await createPaymentOrder(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Payment order already exists",
      data: {
        razorpayOrderId: "order_existing123",
        amount: 49900,
        currency: "INR",
        keyId: process.env.RAZORPAY_KEY_ID
      },
      requestId: "test-request-id"
    });

    expect(razorpay.orders.create)
      .not.toHaveBeenCalled();

    expect(next).not.toHaveBeenCalled();
  });

  it("passes Razorpay API errors to next", async () => {
    const order = {
      _id: "507f1f77bcf86cd799439011",
      user: "507f1f77bcf86cd799439012",
      subtotal: 499,
      status: "pending",
      payment: {
        status: "pending",
        razorpayOrderId: ""
      }
    };

    const razorpayError = new Error(
      "Razorpay API failed"
    );

    vi.spyOn(Order, "findOne")
      .mockResolvedValue(order);

    vi.spyOn(razorpay.orders, "create")
      .mockRejectedValue(razorpayError);

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

    await createPaymentOrder(req, res, next);

    expect(next).toHaveBeenCalledWith(
      razorpayError
    );

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/payments/orders/:orderId (HTTP integration)", () => {
  let app;
  const mockUserId = "507f1f77bcf86cd799439012";
  const validOrderId = "507f1f77bcf86cd799439011";
  let validToken;

  beforeEach(() => {
    vi.restoreAllMocks();
    app = createApp();
    validToken = generateToken({ userId: mockUserId });
  });

  it("rejects request with 401 when Authorization header is missing", async () => {
    const response = await request(app)
      .post(`/api/v1/payments/orders/${validOrderId}`)
      .send({});

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.error?.code).toBe("AUTH_TOKEN_REQUIRED");
  });

  it("rejects request with 401 when token is invalid", async () => {
    const response = await request(app)
      .post(`/api/v1/payments/orders/${validOrderId}`)
      .set("Authorization", "Bearer invalid.jwt.token")
      .send({});

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.error?.code).toBe("INVALID_AUTH_TOKEN");
  });

  it("rejects request with 400 when orderId is not a valid 24-character hex ObjectId", async () => {
    vi.spyOn(User, "findById").mockResolvedValue({
      _id: mockUserId,
      email: "test@example.com",
      role: "customer",
      isActive: true
    });

    const response = await request(app)
      .post("/api/v1/payments/orders/invalid-order-id")
      .set("Authorization", `Bearer ${validToken}`)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error?.code).toBe("VALIDATION_ERROR");
    expect(response.body.error?.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "params.orderId"
        })
      ])
    );
  });

  it("preserves order ownership requirement and returns 404 when order does not belong to authenticated user", async () => {
    vi.spyOn(User, "findById").mockResolvedValue({
      _id: mockUserId,
      email: "test@example.com",
      role: "customer",
      isActive: true
    });

    vi.spyOn(Order, "findOne").mockResolvedValue(null);

    const response = await request(app)
      .post(`/api/v1/payments/orders/${validOrderId}`)
      .set("Authorization", `Bearer ${validToken}`)
      .send({});

    expect(Order.findOne).toHaveBeenCalledWith({
      _id: validOrderId,
      user: mockUserId
    });
    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.error?.code).toBe("ORDER_NOT_FOUND");
  });

  it("reaches controller and returns 201 when authenticated request has valid orderId and user owns order", async () => {
    vi.spyOn(User, "findById").mockResolvedValue({
      _id: mockUserId,
      email: "test@example.com",
      role: "customer",
      isActive: true
    });

    const mockOrder = {
      _id: validOrderId,
      user: mockUserId,
      subtotal: 499,
      status: "pending",
      payment: {
        status: "pending",
        razorpayOrderId: ""
      },
      save: vi.fn().mockResolvedValue(true)
    };

    vi.spyOn(Order, "findOne").mockResolvedValue(mockOrder);
    vi.spyOn(razorpay.orders, "create").mockResolvedValue({
      id: "order_INT123456",
      amount: 49900,
      currency: "INR"
    });

    const response = await request(app)
      .post(`/api/v1/payments/orders/${validOrderId}`)
      .set("Authorization", `Bearer ${validToken}`)
      .send({});

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe("Payment order created successfully");
    expect(response.body.data.razorpayOrderId).toBe("order_INT123456");
    expect(response.body.data.amount).toBe(49900);
    expect(response.body.data.currency).toBe("INR");
    expect(razorpay.orders.create).toHaveBeenCalledWith({
      amount: 49900,
      currency: "INR",
      receipt: validOrderId
    });
    expect(mockOrder.save).toHaveBeenCalledTimes(1);
  });

  it("rejects payment creation with 400 when order.checkoutState is compensation_pending", async () => {
    vi.spyOn(User, "findById").mockResolvedValue({
      _id: mockUserId,
      email: "test@example.com",
      role: "customer",
      isActive: true
    });

    const mockOrder = {
      _id: validOrderId,
      user: mockUserId,
      subtotal: 499,
      status: "pending",
      checkoutState: "compensation_pending",
      payment: {
        status: "pending",
        razorpayOrderId: ""
      }
    };

    vi.spyOn(Order, "findOne").mockResolvedValue(mockOrder);
    const razorpayCreateSpy = vi.spyOn(razorpay.orders, "create");

    const response = await request(app)
      .post(`/api/v1/payments/orders/${validOrderId}`)
      .set("Authorization", `Bearer ${validToken}`)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error?.code).toBe("ORDER_COMPENSATION_PENDING");
    expect(razorpayCreateSpy).not.toHaveBeenCalled();
  });
});
