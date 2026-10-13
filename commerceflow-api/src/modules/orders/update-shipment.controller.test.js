import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi
} from "vitest";
import request from "supertest";

import { createApp } from "../../app.js";
import updateShipment from "./update-shipment.controller.js";
import Order from "./order.model.js";
import User from "../users/user.model.js";
import generateToken from "../../utils/generate-token.js";

describe("updateShipment Controller Unit Tests", () => {
  const fixedNow = new Date("2026-09-27T12:00:00.000Z");

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createMockOrder = (overrides = {}) => ({
    _id: "507f1f77bcf86cd799439011",
    user: "507f1f77bcf86cd799439012",
    status: "processing",
    totalQuantity: 2,
    subtotal: 2500,
    payment: {
      provider: "razorpay",
      status: "paid"
    },
    shippingAddress: {
      fullName: "Jane Doe",
      phone: "+919876543210",
      addressLine1: "123 Tech Park",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
      country: "India"
    },
    items: [
      {
        product: "507f1f77bcf86cd799439013",
        name: "Wireless Mouse",
        price: 1250,
        quantity: 2,
        subtotal: 2500
      }
    ],
    shipment: null,
    save: vi.fn().mockResolvedValue(true),
    ...overrides
  });

  // 1. Admin creates shipment information successfully.
  it("1. Admin creates shipment information successfully", async () => {
    const order = createMockOrder();
    vi.spyOn(Order, "findById").mockResolvedValue(order);

    const req = {
      user: { _id: "507f1f77bcf86cd799439099", role: "admin" },
      params: { orderId: "507f1f77bcf86cd799439011" },
      body: {
        carrier: "Blue Dart",
        trackingNumber: "BD123456",
        trackingUrl: "https://bluedart.com/track/BD123456",
        status: "in_transit",
        estimatedDelivery: "2026-10-02T18:00:00.000Z"
      },
      requestId: "test-req-1"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const next = vi.fn();

    await updateShipment(req, res, next);

    expect(order.save).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Shipment tracking updated successfully",
      data: { order },
      requestId: "test-req-1"
    });
    expect(order.shipment).toEqual({
      carrier: "Blue Dart",
      trackingNumber: "BD123456",
      trackingUrl: "https://bluedart.com/track/BD123456",
      status: "in_transit",
      shippedAt: fixedNow,
      estimatedDelivery: new Date("2026-10-02T18:00:00.000Z"),
      deliveredAt: null,
      updatedAt: fixedNow
    });
  });

  // 2. Admin updates existing shipment information.
  it("2. Admin updates existing shipment information", async () => {
    const originalShippedAt = new Date("2026-09-25T08:00:00.000Z");
    const order = createMockOrder({
      shipment: {
        carrier: "Delhivery",
        trackingNumber: "DEL111",
        trackingUrl: "https://delhivery.com/track/DEL111",
        status: "label_created",
        shippedAt: originalShippedAt,
        estimatedDelivery: null,
        deliveredAt: null,
        updatedAt: originalShippedAt
      }
    });
    vi.spyOn(Order, "findById").mockResolvedValue(order);

    const req = {
      user: { role: "admin" },
      params: { orderId: order._id },
      body: {
        carrier: "Delhivery",
        trackingNumber: "DEL111",
        trackingUrl: "https://delhivery.com/track/DEL111",
        status: "out_for_delivery"
      },
      requestId: "test-req-2"
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const next = vi.fn();

    await updateShipment(req, res, next);

    expect(order.shipment.status).toBe("out_for_delivery");
    expect(order.shipment.shippedAt).toEqual(originalShippedAt);
    expect(order.shipment.updatedAt).toEqual(fixedNow);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // 3. Admin can correct carrier/tracking number.
  it("3. Admin can correct carrier/tracking number", async () => {
    const order = createMockOrder({
      shipment: {
        carrier: "Wrong Carrier",
        trackingNumber: "WRONG123",
        trackingUrl: "",
        status: "in_transit",
        shippedAt: new Date("2026-09-20T10:00:00.000Z"),
        estimatedDelivery: null,
        deliveredAt: null,
        updatedAt: new Date("2026-09-20T10:00:00.000Z")
      }
    });
    vi.spyOn(Order, "findById").mockResolvedValue(order);

    const req = {
      user: { role: "admin" },
      params: { orderId: order._id },
      body: {
        carrier: "DTDC",
        trackingNumber: "DTDC-CORRECT-999"
      }
    };

    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await updateShipment(req, res, next);

    expect(order.shipment.carrier).toBe("DTDC");
    expect(order.shipment.trackingNumber).toBe("DTDC-CORRECT-999");
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // 4. Customer receives 403.
  it("4. Customer receives 403", async () => {
    const req = {
      user: { _id: "507f1f77bcf86cd799439012", role: "customer" },
      params: { orderId: "507f1f77bcf86cd799439011" },
      body: { carrier: "Blue Dart", trackingNumber: "BD123" }
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await updateShipment(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        code: "ADMIN_ACCESS_REQUIRED"
      })
    );
    expect(res.status).not.toHaveBeenCalled();
  });

  // 6. Nonexistent order returns ORDER_NOT_FOUND.
  it("6. Nonexistent order returns ORDER_NOT_FOUND", async () => {
    vi.spyOn(Order, "findById").mockResolvedValue(null);

    const req = {
      user: { role: "admin" },
      params: { orderId: "507f1f77bcf86cd799439011" },
      body: { carrier: "Blue Dart", trackingNumber: "BD123" }
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await updateShipment(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        code: "ORDER_NOT_FOUND"
      })
    );
  });

  // 7. Cancelled order returns ORDER_CANCELLED.
  it("7. Cancelled order returns ORDER_CANCELLED", async () => {
    const order = createMockOrder({ status: "cancelled" });
    vi.spyOn(Order, "findById").mockResolvedValue(order);

    const req = {
      user: { role: "admin" },
      params: { orderId: order._id },
      body: { carrier: "Blue Dart", trackingNumber: "BD123" }
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await updateShipment(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        code: "ORDER_CANCELLED"
      })
    );
    expect(order.save).not.toHaveBeenCalled();
  });

  // 8. Shipment can be added while order is processing.
  it("8. Shipment can be added while order is processing", async () => {
    const order = createMockOrder({ status: "processing" });
    vi.spyOn(Order, "findById").mockResolvedValue(order);

    const req = {
      user: { role: "admin" },
      params: { orderId: order._id },
      body: { carrier: "Blue Dart", trackingNumber: "BD123" }
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await updateShipment(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(order.status).toBe("processing");
  });

  // Financial fields preservation: Shipment update does not recalculate or alter financials
  it("strictly preserves order financial fields (subtotal, shippingAmount, taxAmount, discountAmount, total) when updating shipment tracking", async () => {
    const order = createMockOrder({
      subtotal: 3500,
      shippingAmount: 0,
      taxAmount: 0,
      discountAmount: 0,
      total: 3500
    });
    vi.spyOn(Order, "findById").mockResolvedValue(order);

    const req = {
      user: { role: "admin" },
      params: { orderId: order._id },
      body: { carrier: "Blue Dart", trackingNumber: "BD999", status: "in_transit" }
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await updateShipment(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(order.subtotal).toBe(3500);
    expect(order.shippingAmount).toBe(0);
    expect(order.taxAmount).toBe(0);
    expect(order.discountAmount).toBe(0);
    expect(order.total).toBe(3500);
    expect(order.save).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
  });

  // 9. Shipment can be added while order is shipped.
  it("9. Shipment can be added while order is shipped", async () => {
    const order = createMockOrder({ status: "shipped" });
    vi.spyOn(Order, "findById").mockResolvedValue(order);

    const req = {
      user: { role: "admin" },
      params: { orderId: order._id },
      body: { carrier: "Blue Dart", trackingNumber: "BD123" }
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await updateShipment(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(order.status).toBe("shipped");
  });

  // 10. Shipment can be added to delivered order without changing order status.
  it("10. Shipment can be added to delivered order without changing order status", async () => {
    const order = createMockOrder({ status: "delivered" });
    vi.spyOn(Order, "findById").mockResolvedValue(order);

    const req = {
      user: { role: "admin" },
      params: { orderId: order._id },
      body: { carrier: "Blue Dart", trackingNumber: "BD123", status: "delivered" }
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await updateShipment(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(order.status).toBe("delivered");
  });

  // 11. Adding shipment does not change order.status.
  it("11. Adding shipment does not change order.status", async () => {
    const order = createMockOrder({ status: "confirmed" });
    vi.spyOn(Order, "findById").mockResolvedValue(order);

    const req = {
      user: { role: "admin" },
      params: { orderId: order._id },
      body: { carrier: "Blue Dart", trackingNumber: "BD123", status: "in_transit" }
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await updateShipment(req, res, next);

    expect(order.status).toBe("confirmed");
  });

  // 12. Updating shipment does not change order.status.
  it("12. Updating shipment does not change order.status", async () => {
    const order = createMockOrder({
      status: "processing",
      shipment: {
        carrier: "Blue Dart",
        trackingNumber: "BD123",
        trackingUrl: "",
        status: "in_transit",
        shippedAt: new Date("2026-09-26T10:00:00.000Z"),
        estimatedDelivery: null,
        deliveredAt: null,
        updatedAt: new Date("2026-09-26T10:00:00.000Z")
      }
    });
    vi.spyOn(Order, "findById").mockResolvedValue(order);

    const req = {
      user: { role: "admin" },
      params: { orderId: order._id },
      body: { carrier: "Blue Dart", trackingNumber: "BD123", status: "delivered" }
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await updateShipment(req, res, next);

    // Order status remains processing, despite shipment status becoming delivered!
    expect(order.status).toBe("processing");
    expect(order.shipment.status).toBe("delivered");
  });

  // 13. First shipment creation sets shippedAt.
  it("13. First shipment creation sets shippedAt", async () => {
    const order = createMockOrder({ shipment: null });
    vi.spyOn(Order, "findById").mockResolvedValue(order);

    const req = {
      user: { role: "admin" },
      params: { orderId: order._id },
      body: { carrier: "FedEx", trackingNumber: "FX123" }
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await updateShipment(req, res, next);

    expect(order.shipment.shippedAt).toEqual(fixedNow);
  });

  // 14. First shipment creation sets updatedAt.
  it("14. First shipment creation sets updatedAt", async () => {
    const order = createMockOrder({ shipment: null });
    vi.spyOn(Order, "findById").mockResolvedValue(order);

    const req = {
      user: { role: "admin" },
      params: { orderId: order._id },
      body: { carrier: "FedEx", trackingNumber: "FX123" }
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await updateShipment(req, res, next);

    expect(order.shipment.updatedAt).toEqual(fixedNow);
  });

  // 15. Existing shippedAt is preserved during updates.
  it("15. Existing shippedAt is preserved during updates", async () => {
    const earlierDate = new Date("2026-09-20T10:00:00.000Z");
    const order = createMockOrder({
      shipment: {
        carrier: "FedEx",
        trackingNumber: "FX123",
        status: "in_transit",
        shippedAt: earlierDate,
        updatedAt: earlierDate
      }
    });
    vi.spyOn(Order, "findById").mockResolvedValue(order);

    const req = {
      user: { role: "admin" },
      params: { orderId: order._id },
      body: { carrier: "FedEx", trackingNumber: "FX123", status: "out_for_delivery" }
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await updateShipment(req, res, next);

    expect(order.shipment.shippedAt).toEqual(earlierDate);
    expect(order.shipment.updatedAt).toEqual(fixedNow);
  });

  // 16. Delivered shipment receives deliveredAt.
  it("16. Delivered shipment receives deliveredAt", async () => {
    const order = createMockOrder({ shipment: null });
    vi.spyOn(Order, "findById").mockResolvedValue(order);

    const req = {
      user: { role: "admin" },
      params: { orderId: order._id },
      body: { carrier: "FedEx", trackingNumber: "FX123", status: "delivered" }
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await updateShipment(req, res, next);

    expect(order.shipment.deliveredAt).toEqual(fixedNow);
  });

  // 17. Existing deliveredAt is preserved.
  it("17. Existing deliveredAt is preserved", async () => {
    const historicalDelivery = new Date("2026-09-24T15:30:00.000Z");
    const historicalShipped = new Date("2026-09-22T08:00:00.000Z");
    const order = createMockOrder({
      shipment: {
        carrier: "FedEx",
        trackingNumber: "FX123",
        status: "delivered",
        shippedAt: historicalShipped,
        deliveredAt: historicalDelivery,
        updatedAt: historicalDelivery
      }
    });
    vi.spyOn(Order, "findById").mockResolvedValue(order);

    const req = {
      user: { role: "admin" },
      params: { orderId: order._id },
      body: {
        carrier: "FedEx Express",
        trackingNumber: "FX123",
        status: "delivered"
      }
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await updateShipment(req, res, next);

    expect(order.shipment.deliveredAt).toEqual(historicalDelivery);
    expect(order.shipment.updatedAt).toEqual(fixedNow);
  });

  // 18. Client cannot control shippedAt.
  it("18. Client cannot control shippedAt", async () => {
    const order = createMockOrder({ shipment: null });
    vi.spyOn(Order, "findById").mockResolvedValue(order);

    const req = {
      user: { role: "admin" },
      params: { orderId: order._id },
      body: {
        carrier: "FedEx",
        trackingNumber: "FX123",
        shippedAt: "1999-01-01T00:00:00.000Z"
      }
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await updateShipment(req, res, next);

    expect(order.shipment.shippedAt).toEqual(fixedNow);
  });

  // 19. Client cannot control deliveredAt.
  it("19. Client cannot control deliveredAt", async () => {
    const order = createMockOrder({ shipment: null });
    vi.spyOn(Order, "findById").mockResolvedValue(order);

    const req = {
      user: { role: "admin" },
      params: { orderId: order._id },
      body: {
        carrier: "FedEx",
        trackingNumber: "FX123",
        status: "in_transit",
        deliveredAt: "1999-01-01T00:00:00.000Z"
      }
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await updateShipment(req, res, next);

    // In transit must remain null, client timestamp ignored
    expect(order.shipment.deliveredAt).toBeNull();
  });

  // 20. Client cannot control updatedAt.
  it("20. Client cannot control updatedAt", async () => {
    const order = createMockOrder({ shipment: null });
    vi.spyOn(Order, "findById").mockResolvedValue(order);

    const req = {
      user: { role: "admin" },
      params: { orderId: order._id },
      body: {
        carrier: "FedEx",
        trackingNumber: "FX123",
        updatedAt: "1999-01-01T00:00:00.000Z"
      }
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await updateShipment(req, res, next);

    expect(order.shipment.updatedAt).toEqual(fixedNow);
  });

  // 21. Shipment status update works.
  it("21. Shipment status update works", async () => {
    const order = createMockOrder({
      shipment: {
        carrier: "FedEx",
        trackingNumber: "FX123",
        status: "label_created",
        shippedAt: fixedNow,
        updatedAt: fixedNow
      }
    });
    vi.spyOn(Order, "findById").mockResolvedValue(order);

    const req = {
      user: { role: "admin" },
      params: { orderId: order._id },
      body: { carrier: "FedEx", trackingNumber: "FX123", status: "exception" }
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await updateShipment(req, res, next);

    expect(order.shipment.status).toBe("exception");
  });

  // 22. Estimated delivery update works.
  it("22. Estimated delivery update works", async () => {
    const order = createMockOrder();
    vi.spyOn(Order, "findById").mockResolvedValue(order);

    const targetDateStr = "2026-10-15T12:00:00.000Z";
    const req = {
      user: { role: "admin" },
      params: { orderId: order._id },
      body: {
        carrier: "FedEx",
        trackingNumber: "FX123",
        estimatedDelivery: targetDateStr
      }
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await updateShipment(req, res, next);

    expect(order.shipment.estimatedDelivery).toEqual(new Date(targetDateStr));
  });

  // 23. Tracking URL update works.
  it("23. Tracking URL update works", async () => {
    const order = createMockOrder();
    vi.spyOn(Order, "findById").mockResolvedValue(order);

    const req = {
      user: { role: "admin" },
      params: { orderId: order._id },
      body: {
        carrier: "FedEx",
        trackingNumber: "FX123",
        trackingUrl: "https://fedex.com/track/123"
      }
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await updateShipment(req, res, next);

    expect(order.shipment.trackingUrl).toBe("https://fedex.com/track/123");
  });

  // 24. Existing order fields remain unchanged.
  it("24. Existing order fields remain unchanged", async () => {
    const order = createMockOrder({
      status: "processing",
      totalQuantity: 5,
      subtotal: 9999,
      payment: { provider: "razorpay", status: "paid", transactionId: "txn_1" }
    });
    vi.spyOn(Order, "findById").mockResolvedValue(order);

    const req = {
      user: { role: "admin" },
      params: { orderId: order._id },
      body: { carrier: "Blue Dart", trackingNumber: "BD999" }
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await updateShipment(req, res, next);

    expect(order.status).toBe("processing");
    expect(order.totalQuantity).toBe(5);
    expect(order.subtotal).toBe(9999);
    expect(order.payment).toEqual({
      provider: "razorpay",
      status: "paid",
      transactionId: "txn_1"
    });
    expect(order.user).toBe("507f1f77bcf86cd799439012");
  });
});

describe("PUT /api/v1/orders/:orderId/shipment (HTTP Integration & Route Middleware)", () => {
  let app;
  const adminId = "507f1f77bcf86cd799439001";
  const customerId = "507f1f77bcf86cd799439002";
  let adminToken;
  let customerToken;

  beforeEach(() => {
    vi.restoreAllMocks();
    app = createApp();
    adminToken = generateToken({ userId: adminId });
    customerToken = generateToken({ userId: customerId });
  });

  // 5. Unauthenticated request receives 401 through middleware behavior where applicable.
  it("5. Unauthenticated request receives 401 through auth middleware", async () => {
    const res = await request(app)
      .put("/api/v1/orders/507f1f77bcf86cd799439011/shipment")
      .send({ carrier: "Blue Dart", trackingNumber: "BD123" });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("AUTH_TOKEN_REQUIRED");
  });

  // 4 (HTTP). Non-admin customer receives 403 through admin middleware.
  it("4 (HTTP). Non-admin customer receives 403 through admin middleware", async () => {
    vi.spyOn(User, "findById").mockResolvedValue({
      _id: customerId,
      email: "customer@example.com",
      role: "customer",
      isActive: true
    });

    const res = await request(app)
      .put("/api/v1/orders/507f1f77bcf86cd799439011/shipment")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ carrier: "Blue Dart", trackingNumber: "BD123" });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("ADMIN_ACCESS_REQUIRED");
  });

  // Validation layer rejects unknown timestamps at HTTP route
  it("rejects client-supplied timestamps at validator layer with 400", async () => {
    vi.spyOn(User, "findById").mockResolvedValue({
      _id: adminId,
      email: "admin@example.com",
      role: "admin",
      isActive: true
    });

    const res = await request(app)
      .put("/api/v1/orders/507f1f77bcf86cd799439011/shipment")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        carrier: "Blue Dart",
        trackingNumber: "BD123",
        shippedAt: "2020-01-01T00:00:00.000Z"
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("handles valid admin request end-to-end through HTTP route", async () => {
    vi.spyOn(User, "findById").mockResolvedValue({
      _id: adminId,
      email: "admin@example.com",
      role: "admin",
      isActive: true
    });

    const mockOrder = {
      _id: "507f1f77bcf86cd799439011",
      user: customerId,
      status: "processing",
      shipment: null,
      save: vi.fn().mockResolvedValue(true)
    };
    vi.spyOn(Order, "findById").mockResolvedValue(mockOrder);

    const res = await request(app)
      .put("/api/v1/orders/507f1f77bcf86cd799439011/shipment")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        carrier: "Blue Dart",
        trackingNumber: "BD-98765",
        trackingUrl: "https://bluedart.com/track/BD-98765",
        status: "in_transit"
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("Shipment tracking updated successfully");
    expect(res.body.data.order.shipment.carrier).toBe("Blue Dart");
    expect(res.body.data.order.shipment.trackingNumber).toBe("BD-98765");
  });
});
