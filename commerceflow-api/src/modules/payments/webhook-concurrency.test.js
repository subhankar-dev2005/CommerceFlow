import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";
import request from "supertest";

import { createApp } from "../../app.js";
import { env } from "../../config/env.js";
import Order from "../orders/order.model.js";
import WebhookEvent from "./webhook-event.model.js";

const TEST_SECRET = env.RAZORPAY_WEBHOOK_SECRET || "test_secret_for_concurrency";
if (!env.RAZORPAY_WEBHOOK_SECRET) {
  env.RAZORPAY_WEBHOOK_SECRET = TEST_SECRET;
}

describe("Webhook concurrency and race condition hardening", () => {
  let app;

  beforeEach(() => {
    vi.restoreAllMocks();
    app = createApp();
  });

  it("handles concurrent deliveries of the same eventId with exactly one mutation and safe acknowledgment", async () => {
    const rawPayload = JSON.stringify({
      id: "evt_concurrent_race_123",
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: "pay_concurrent_123",
            order_id: "order_concurrent_123",
            amount: 5000,
            currency: "INR"
          }
        }
      }
    });

    const signature = crypto
      .createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET)
      .update(Buffer.from(rawPayload))
      .digest("hex");

    const order = {
      _id: "507f1f77bcf86cd799439011",
      status: "pending",
      subtotal: 50,
      payment: {
        status: "pending",
        transactionId: "",
        razorpayOrderId: "order_concurrent_123"
      },
      save: vi.fn().mockImplementation(async () => {
        // Add a slight async delay to simulate realistic database I/O window
        await new Promise((resolve) => setTimeout(resolve, 20));
        order.payment.status = "paid";
        order.status = "confirmed";
      })
    };

    vi.spyOn(Order, "findOne").mockResolvedValue(order);

    // Simulate MongoDB unique index race behavior:
    // First atomic claim succeeds; concurrent duplicate with same eventId hits E11000 duplicate key error
    let claimCount = 0;
    vi.spyOn(WebhookEvent, "create").mockImplementation(async (doc) => {
      claimCount += 1;
      if (claimCount === 1) {
        return {
          _id: "507f1f77bcf86cd799439099",
          eventId: doc.eventId,
          provider: "razorpay",
          event: doc.event
        };
      }
      const duplicateError = new Error("E11000 duplicate key error collection");
      duplicateError.code = 11000;
      throw duplicateError;
    });

    vi.spyOn(WebhookEvent, "deleteOne").mockResolvedValue({ acknowledged: true });

    // Send two concurrent webhook requests with the identical eventId simultaneously
    const [resA, resB] = await Promise.all([
      request(app)
        .post("/api/v1/payments/webhook")
        .set("x-razorpay-signature", signature)
        .set("Content-Type", "application/json")
        .send(rawPayload),
      request(app)
        .post("/api/v1/payments/webhook")
        .set("x-razorpay-signature", signature)
        .set("Content-Type", "application/json")
        .send(rawPayload)
    ]);

    // Both requests must receive 200 OK
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);

    const messages = [resA.body.message, resB.body.message];
    expect(messages).toContain("Webhook processed successfully");
    expect(messages).toContain("Webhook already processed");

    // The business mutation (order.save) must be executed exactly ONCE
    expect(order.save).toHaveBeenCalledTimes(1);
    expect(order.payment.status).toBe("paid");
    expect(order.status).toBe("confirmed");
  });
});
