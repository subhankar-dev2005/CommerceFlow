import {
  describe,
  it,
  expect,
  vi,
  beforeEach
} from "vitest";

import crypto from "crypto";

import Order from "../orders/order.model.js";
import WebhookEvent from "./webhook-event.model.js";

import handleRazorpayWebhook from "./webhook.controller.js";
import { env } from "../../config/env.js";
import request from "supertest";
import { createApp } from "../../app.js";

const TEST_WEBHOOK_SECRET =
  env.RAZORPAY_WEBHOOK_SECRET || "test_webhook_secret";

if (!env.RAZORPAY_WEBHOOK_SECRET) {
  env.RAZORPAY_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
}

describe("handleRazorpayWebhook", () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(WebhookEvent, "create").mockResolvedValue({
      _id: "507f1f77bcf86cd799439099",
      eventId: "evt_test123",
      provider: "razorpay",
      event: "payment.captured"
    });

    vi.spyOn(WebhookEvent, "deleteOne").mockResolvedValue({
      acknowledged: true,
      deletedCount: 1
    });
  });

  it("should process a valid payment.captured webhook", async () => {
    const rawBody = Buffer.from(
      JSON.stringify({
        id: "evt_test123",
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_test123",
              order_id: "order_test123",
              amount: 5000,
              currency: "INR"
            }
          }
        }
      })
    );

    const signature = crypto
      .createHmac("sha256", TEST_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");

    const order = {
      _id: "507f1f77bcf86cd799439011",
      status: "pending",
      subtotal: 50,
      payment: {
        status: "pending",
        transactionId: "",
        razorpayOrderId: "order_test123"
      },
      save: vi.fn().mockResolvedValue()
    };

    vi.spyOn(Order, "findOne").mockResolvedValue(order);

    const req = {
      headers: {
        "x-razorpay-signature": signature
      },
      rawBody,
      requestId: "test-request-id"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    const next = vi.fn();

    await handleRazorpayWebhook(req, res, next);

    expect(order.payment.status).toBe("paid");
    expect(order.payment.transactionId).toBe("pay_test123");
    expect(order.status).toBe("confirmed");
    expect(order.save).toHaveBeenCalled();

    expect(WebhookEvent.create).toHaveBeenCalledWith({
      eventId: "evt_test123",
      provider: "razorpay",
      event: "payment.captured"
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: "Webhook processed successfully"
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("should process a valid payment.captured webhook using authoritative order.total for new orders", async () => {
    const rawBody = Buffer.from(
      JSON.stringify({
        id: "evt_total123",
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_total123",
              order_id: "order_total_razorpay",
              amount: 150000,
              currency: "INR"
            }
          }
        }
      })
    );

    const signature = crypto
      .createHmac("sha256", TEST_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");

    const order = {
      _id: "507f1f77bcf86cd799439011",
      status: "pending",
      subtotal: 1500,
      shippingAmount: 0,
      taxAmount: 0,
      discountAmount: 0,
      total: 1500,
      payment: {
        status: "pending",
        transactionId: "",
        razorpayOrderId: "order_total_razorpay"
      },
      save: vi.fn().mockResolvedValue()
    };

    vi.spyOn(Order, "findOne").mockResolvedValue(order);

    const req = {
      headers: {
        "x-razorpay-signature": signature
      },
      rawBody,
      requestId: "test-request-id"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    const next = vi.fn();

    await handleRazorpayWebhook(req, res, next);

    expect(order.payment.status).toBe("paid");
    expect(order.payment.transactionId).toBe("pay_total123");
    expect(order.status).toBe("confirmed");
    expect(order.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it("should process a valid payment.captured webhook using fallback order.subtotal for legacy orders", async () => {
    const rawBody = Buffer.from(
      JSON.stringify({
        id: "evt_legacy123",
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_legacy123",
              order_id: "order_legacy_razorpay",
              amount: 80000,
              currency: "INR"
            }
          }
        }
      })
    );

    const signature = crypto
      .createHmac("sha256", TEST_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");

    const legacyOrder = {
      _id: "507f1f77bcf86cd799439011",
      status: "pending",
      subtotal: 800,
      payment: {
        status: "pending",
        transactionId: "",
        razorpayOrderId: "order_legacy_razorpay"
      },
      save: vi.fn().mockResolvedValue()
    };

    vi.spyOn(Order, "findOne").mockResolvedValue(legacyOrder);

    const req = {
      headers: {
        "x-razorpay-signature": signature
      },
      rawBody,
      requestId: "test-request-id"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    const next = vi.fn();

    await handleRazorpayWebhook(req, res, next);

    expect(legacyOrder.payment.status).toBe("paid");
    expect(legacyOrder.payment.transactionId).toBe("pay_legacy123");
    expect(legacyOrder.status).toBe("confirmed");
    expect(legacyOrder.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it("should mark the order payment as failed for valid payment.failed event", async () => {
    const rawBody = Buffer.from(
      JSON.stringify({
        id: "evt_failed123",
        event: "payment.failed",
        payload: {
          payment: {
            entity: {
              id: "pay_failed123",
              order_id: "order_test123"
            }
          }
        }
      })
    );

    const signature = crypto
      .createHmac("sha256", TEST_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");

    const order = {
      _id: "507f1f77bcf86cd799439011",
      status: "pending",
      payment: {
        status: "pending",
        transactionId: "",
        razorpayOrderId: "order_test123"
      },
      save: vi.fn().mockResolvedValue()
    };

    vi.spyOn(Order, "findOne").mockResolvedValue(order);

    const req = {
      headers: {
        "x-razorpay-signature": signature
      },
      rawBody,
      requestId: "test-request-id"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    const next = vi.fn();

    await handleRazorpayWebhook(req, res, next);

    expect(order.payment.status).toBe("failed");
    expect(order.save).toHaveBeenCalled();
    expect(WebhookEvent.create).toHaveBeenCalledWith({
      eventId: "evt_failed123",
      provider: "razorpay",
      event: "payment.failed"
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it("should return success when duplicate eventId throws 11000", async () => {
    const rawBody = Buffer.from(
      JSON.stringify({
        id: "evt_test123",
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_test123",
              order_id: "order_test123",
              amount: 5000,
              currency: "INR"
            }
          }
        }
      })
    );

    const signature = crypto
      .createHmac("sha256", TEST_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");

    const order = {
      _id: "507f1f77bcf86cd799439011",
      status: "confirmed",
      subtotal: 50,
      payment: {
        status: "paid",
        transactionId: "pay_test123",
        razorpayOrderId: "order_test123"
      },
      save: vi.fn()
    };

    vi.spyOn(Order, "findOne").mockResolvedValue(order);

    WebhookEvent.create.mockRejectedValueOnce({
      code: 11000
    });

    const req = {
      headers: {
        "x-razorpay-signature": signature
      },
      rawBody,
      requestId: "test-request-id"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    const next = vi.fn();

    await handleRazorpayWebhook(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: "Webhook already processed"
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("should reject amount mismatch and not mark order as paid", async () => {
    const rawBody = Buffer.from(
      JSON.stringify({
        id: "evt_amount_mismatch",
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_test123",
              order_id: "order_test123",
              amount: 4000,
              currency: "INR"
            }
          }
        }
      })
    );

    const signature = crypto
      .createHmac("sha256", TEST_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");

    const order = {
      _id: "507f1f77bcf86cd799439011",
      status: "pending",
      subtotal: 50,
      payment: {
        status: "pending",
        transactionId: "",
        razorpayOrderId: "order_test123"
      },
      save: vi.fn().mockResolvedValue()
    };

    vi.spyOn(Order, "findOne").mockResolvedValue(order);

    const req = {
      headers: {
        "x-razorpay-signature": signature
      },
      rawBody,
      requestId: "test-request-id"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    const next = vi.fn();

    await handleRazorpayWebhook(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: "PAYMENT_AMOUNT_MISMATCH"
        })
      })
    );
    expect(order.save).not.toHaveBeenCalled();
    expect(order.payment.status).toBe("pending");
    expect(WebhookEvent.create).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("should reject currency mismatch and not mark order as paid", async () => {
    const rawBody = Buffer.from(
      JSON.stringify({
        id: "evt_currency_mismatch",
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_test123",
              order_id: "order_test123",
              amount: 5000,
              currency: "USD"
            }
          }
        }
      })
    );

    const signature = crypto
      .createHmac("sha256", TEST_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");

    const order = {
      _id: "507f1f77bcf86cd799439011",
      status: "pending",
      subtotal: 50,
      payment: {
        status: "pending",
        transactionId: "",
        razorpayOrderId: "order_test123"
      },
      save: vi.fn().mockResolvedValue()
    };

    vi.spyOn(Order, "findOne").mockResolvedValue(order);

    const req = {
      headers: {
        "x-razorpay-signature": signature
      },
      rawBody,
      requestId: "test-request-id"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    const next = vi.fn();

    await handleRazorpayWebhook(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: "PAYMENT_AMOUNT_MISMATCH"
        })
      })
    );
    expect(order.save).not.toHaveBeenCalled();
    expect(order.payment.status).toBe("pending");
    expect(WebhookEvent.create).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("should reject payment.captured for a cancelled order and not mark it paid", async () => {
    const rawBody = Buffer.from(
      JSON.stringify({
        id: "evt_cancelled",
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_test123",
              order_id: "order_test123",
              amount: 5000,
              currency: "INR"
            }
          }
        }
      })
    );

    const signature = crypto
      .createHmac("sha256", TEST_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");

    const order = {
      _id: "507f1f77bcf86cd799439011",
      status: "cancelled",
      subtotal: 50,
      payment: {
        status: "pending",
        transactionId: "",
        razorpayOrderId: "order_test123"
      },
      save: vi.fn().mockResolvedValue()
    };

    vi.spyOn(Order, "findOne").mockResolvedValue(order);

    const req = {
      headers: {
        "x-razorpay-signature": signature
      },
      rawBody,
      requestId: "test-request-id"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    const next = vi.fn();

    await handleRazorpayWebhook(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: "ORDER_CANCELLED"
        })
      })
    );
    expect(order.save).not.toHaveBeenCalled();
    expect(order.payment.status).toBe("pending");
    expect(order.status).toBe("cancelled");
    expect(WebhookEvent.create).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 400 with INVALID_JSON_PAYLOAD when body is malformed JSON", async () => {
    const rawBody = Buffer.from("{malformed:json,");

    const signature = crypto
      .createHmac("sha256", TEST_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");

    const req = {
      headers: {
        "x-razorpay-signature": signature
      },
      rawBody,
      requestId: "test-request-id"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    const next = vi.fn();

    await handleRazorpayWebhook(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: "INVALID_JSON_PAYLOAD"
        })
      })
    );
    expect(WebhookEvent.create).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("should not permanently record webhook event if order processing fails, allowing retry", async () => {
    const rawBody = Buffer.from(
      JSON.stringify({
        id: "evt_fail_retry",
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_test123",
              order_id: "order_test123",
              amount: 5000,
              currency: "INR"
            }
          }
        }
      })
    );

    const signature = crypto
      .createHmac("sha256", TEST_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");

    const order = {
      _id: "507f1f77bcf86cd799439011",
      status: "pending",
      subtotal: 50,
      payment: {
        status: "pending",
        transactionId: "",
        razorpayOrderId: "order_test123"
      },
      save: vi.fn().mockRejectedValueOnce(new Error("Database connection lost"))
    };

    vi.spyOn(Order, "findOne").mockResolvedValue(order);

    const req = {
      headers: {
        "x-razorpay-signature": signature
      },
      rawBody,
      requestId: "test-request-id"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    const next = vi.fn();

    await handleRazorpayWebhook(req, res, next);

    expect(order.save).toHaveBeenCalled();
    expect(WebhookEvent.deleteOne).toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it("should safely handle concurrent/duplicate processing without duplicate payment state transition", async () => {
    const rawBody = Buffer.from(
      JSON.stringify({
        id: "evt_concurrent",
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_test123",
              order_id: "order_test123",
              amount: 5000,
              currency: "INR"
            }
          }
        }
      })
    );

    const signature = crypto
      .createHmac("sha256", TEST_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");

    const order = {
      _id: "507f1f77bcf86cd799439011",
      status: "confirmed",
      subtotal: 50,
      payment: {
        status: "paid",
        transactionId: "pay_test123",
        razorpayOrderId: "order_test123"
      },
      save: vi.fn()
    };

    vi.spyOn(Order, "findOne").mockResolvedValue(order);

    const req = {
      headers: {
        "x-razorpay-signature": signature
      },
      rawBody,
      requestId: "test-request-id"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    const next = vi.fn();

    await handleRazorpayWebhook(req, res, next);

    expect(order.save).not.toHaveBeenCalled();
    expect(WebhookEvent.create).toHaveBeenCalledWith({
      eventId: "evt_concurrent",
      provider: "razorpay",
      event: "payment.captured"
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it("should acknowledge an unknown webhook event", async () => {
    const rawBody = Buffer.from(
      JSON.stringify({
        id: "evt_unknown123",
        event: "some.unknown.event",
        payload: {}
      })
    );

    const signature = crypto
      .createHmac("sha256", TEST_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");

    const req = {
      headers: {
        "x-razorpay-signature": signature
      },
      rawBody,
      requestId: "test-request-id"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    const next = vi.fn();

    await handleRazorpayWebhook(req, res, next);

    expect(WebhookEvent.create).toHaveBeenCalledWith({
      eventId: "evt_unknown123",
      provider: "razorpay",
      event: "some.unknown.event"
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: "Webhook processed successfully"
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("should reject a webhook without a signature", async () => {
    const req = {
      headers: {},
      rawBody: Buffer.from(
        JSON.stringify({
          event: "payment.captured"
        })
      ),
      requestId: "test-request-id"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    const next = vi.fn();

    await handleRazorpayWebhook(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: "MISSING_WEBHOOK_SIGNATURE"
        })
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("should reject an invalid webhook signature", async () => {
    const req = {
      headers: {
        "x-razorpay-signature": "invalid_signature"
      },
      rawBody: Buffer.from(
        JSON.stringify({
          event: "payment.captured"
        })
      ),
      requestId: "test-request-id"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    const next = vi.fn();

    await handleRazorpayWebhook(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: "INVALID_WEBHOOK_SIGNATURE"
        })
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 500 when RAZORPAY_WEBHOOK_SECRET is not configured", async () => {
    const originalSecret = env.RAZORPAY_WEBHOOK_SECRET;
    env.RAZORPAY_WEBHOOK_SECRET = "";

    try {
      const req = {
        headers: {
          "x-razorpay-signature": "dummy_signature"
        },
        rawBody: Buffer.from("{}"),
        requestId: "test-request-id"
      };

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };

      const next = vi.fn();

      await handleRazorpayWebhook(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: "WEBHOOK_SECRET_NOT_CONFIGURED",
            message: "Razorpay webhook secret is not configured"
          })
        })
      );
      expect(next).not.toHaveBeenCalled();
    } finally {
      env.RAZORPAY_WEBHOOK_SECRET = originalSecret;
    }
  });
});

describe("POST /api/v1/payments/webhook (raw-body URL matching integration)", () => {
  let app;

  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(WebhookEvent, "create").mockResolvedValue({
      _id: "507f1f77bcf86cd799439099",
      eventId: "evt_test123",
      provider: "razorpay",
      event: "order.paid"
    });

    vi.spyOn(WebhookEvent, "deleteOne").mockResolvedValue({
      acknowledged: true,
      deletedCount: 1
    });

    app = createApp();
  });

  const payload = {
    id: "evt_test123",
    event: "order.paid",
    payload: {}
  };
  const payloadString = JSON.stringify(payload);
  const validSignature = crypto
    .createHmac("sha256", TEST_WEBHOOK_SECRET)
    .update(Buffer.from(payloadString))
    .digest("hex");

  it("captures raw body for canonical webhook path (/api/v1/payments/webhook)", async () => {
    const response = await request(app)
      .post("/api/v1/payments/webhook")
      .set("x-razorpay-signature", validSignature)
      .set("Content-Type", "application/json")
      .send(payloadString);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe("Webhook processed successfully");
  });

  it("captures raw body for trailing-slash variant (/api/v1/payments/webhook/)", async () => {
    const response = await request(app)
      .post("/api/v1/payments/webhook/")
      .set("x-razorpay-signature", validSignature)
      .set("Content-Type", "application/json")
      .send(payloadString);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe("Webhook processed successfully");
  });

  it("captures raw body for query-string variant (/api/v1/payments/webhook?source=razorpay)", async () => {
    const response = await request(app)
      .post("/api/v1/payments/webhook?source=razorpay")
      .set("x-razorpay-signature", validSignature)
      .set("Content-Type", "application/json")
      .send(payloadString);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe("Webhook processed successfully");
  });

  it("captures raw body for trailing-slash and query-string variant (/api/v1/payments/webhook/?source=razorpay)", async () => {
    const response = await request(app)
      .post("/api/v1/payments/webhook/?source=razorpay")
      .set("x-razorpay-signature", validSignature)
      .set("Content-Type", "application/json")
      .send(payloadString);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe("Webhook processed successfully");
  });

  it("does not capture raw body on unrelated routes", async () => {
    const response = await request(app)
      .post("/api/v1/payments/webhook/unrelated")
      .set("x-razorpay-signature", validSignature)
      .set("Content-Type", "application/json")
      .send(payloadString);

    expect(response.status).toBe(404);
    expect(response.body.error?.code).toBe("ROUTE_NOT_FOUND");
  });
});