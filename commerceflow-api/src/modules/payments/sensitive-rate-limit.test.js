import { describe, it, expect } from "vitest";
import request from "supertest";

import { createApp } from "../../app.js";

describe("Sensitive endpoint protection audit (coupons & payment verify)", () => {
  it("enforces authentication protection on POST /api/v1/cart/coupon to block unauthenticated coupon probing", async () => {
    const app = createApp();

    const response = await request(app)
      .post("/api/v1/cart/coupon")
      .send({ couponCode: "DISCOUNT10" });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("AUTH_TOKEN_REQUIRED");
  });

  it("enforces authentication protection on POST /api/v1/payments/orders/:orderId/verify to prevent unauthorized payment verification", async () => {
    const app = createApp();

    const response = await request(app)
      .post("/api/v1/payments/orders/507f1f77bcf86cd799439011/verify")
      .send({});

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("AUTH_TOKEN_REQUIRED");
  });
});
