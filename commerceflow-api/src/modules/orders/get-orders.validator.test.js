import { describe, it, expect, vi } from "vitest";
import { getOrdersSchema, getAdminOrdersSchema, updateShipmentSchema } from "./order.validator.js";
import Order from "./order.model.js";
import validate from "../../common/middleware/validate.middleware.js";

describe("getOrdersSchema & validation boundary", () => {
  it("1. accepts a valid request with no query parameters and applies defaults", () => {
    const result = getOrdersSchema.safeParse({
      query: {}
    });

    expect(result.success).toBe(true);
    expect(result.data.query.page).toBe(1);
    expect(result.data.query.limit).toBe(10);
    expect(result.data.query.sortOrder).toBe("desc");
    expect(result.data.query.status).toBeUndefined();
  });

  it("2. accepts all valid supported order statuses", () => {
    const validStatuses = [
      "pending",
      "confirmed",
      "processing",
      "shipped",
      "delivered",
      "cancelled"
    ];

    for (const status of validStatuses) {
      const result = getOrdersSchema.safeParse({
        query: { status }
      });
      expect(result.success).toBe(true);
      expect(result.data.query.status).toBe(status);
    }
  });

  it("3. rejects invalid order status", () => {
    const result = getOrdersSchema.safeParse({
      query: { status: "unknown_status" }
    });

    expect(result.success).toBe(false);
    expect(
      result.error.issues.some((i) => i.path.includes("status"))
    ).toBe(true);
  });

  it("4. rejects invalid/non-positive page values", () => {
    const invalidPages = [0, -1, -10, "abc", 1.5];

    for (const page of invalidPages) {
      const result = getOrdersSchema.safeParse({
        query: { page }
      });
      expect(result.success).toBe(false);
      expect(
        result.error.issues.some((i) => i.path.includes("page"))
      ).toBe(true);
    }
  });

  it("5. rejects invalid/non-positive limit values and limit > 100", () => {
    const invalidLimits = [0, -5, 101, "xyz", 10.5];

    for (const limit of invalidLimits) {
      const result = getOrdersSchema.safeParse({
        query: { limit }
      });
      expect(result.success).toBe(false);
      expect(
        result.error.issues.some((i) => i.path.includes("limit"))
      ).toBe(true);
    }
  });

  it("verifies invalid input is rejected at the validation boundary and does not reach the controller", () => {
    const middleware = validate(getOrdersSchema);

    const req = {
      body: {},
      query: { status: "invalid_status", page: -1 },
      params: {}
    };
    const res = {};
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeDefined();
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "query.status" }),
        expect.objectContaining({ field: "query.page" })
      ])
    );
  });

  it("verifies valid input passes through the validation boundary and populates req.query", () => {
    const middleware = validate(getOrdersSchema);

    const req = {
      body: {},
      query: { status: "processing", page: "2", limit: "25" },
      params: {}
    };
    const res = {};
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.query.page).toBe(2);
    expect(req.query.limit).toBe(25);
    expect(req.query.status).toBe("processing");
    expect(req.query.sortOrder).toBe("desc");
  });
});

describe("getAdminOrdersSchema & validation boundary", () => {
  it("applies defaults for empty query", () => {
    const result = getAdminOrdersSchema.safeParse({ query: {} });
    expect(result.success).toBe(true);
    expect(result.data.query.page).toBe(1);
    expect(result.data.query.limit).toBe(10);
    expect(result.data.query.sortBy).toBe("createdAt");
    expect(result.data.query.sortOrder).toBe("desc");
    expect(result.data.query.status).toBeUndefined();
    expect(result.data.query.paymentStatus).toBeUndefined();
  });

  it("accepts all valid payment statuses", () => {
    const validPaymentStatuses = ["pending", "paid", "failed", "refunded"];
    for (const paymentStatus of validPaymentStatuses) {
      const result = getAdminOrdersSchema.safeParse({ query: { paymentStatus } });
      expect(result.success).toBe(true);
      expect(result.data.query.paymentStatus).toBe(paymentStatus);
    }
  });

  it("rejects invalid payment status", () => {
    const result = getAdminOrdersSchema.safeParse({ query: { paymentStatus: "captured" } });
    expect(result.success).toBe(false);
    expect(result.error.issues.some((i) => i.path.includes("paymentStatus"))).toBe(true);
  });

  it("accepts valid sort fields", () => {
    const validSortFields = ["createdAt", "updatedAt", "subtotal", "totalQuantity"];
    for (const sortBy of validSortFields) {
      const result = getAdminOrdersSchema.safeParse({ query: { sortBy } });
      expect(result.success).toBe(true);
      expect(result.data.query.sortBy).toBe(sortBy);
    }
  });

  it("rejects invalid sort fields", () => {
    const result = getAdminOrdersSchema.safeParse({ query: { sortBy: "unsupported_field" } });
    expect(result.success).toBe(false);
    expect(result.error.issues.some((i) => i.path.includes("sortBy"))).toBe(true);
  });

  it("rejects malicious query inputs such as operator injection, excessive limits, and non-string search", () => {
    // 1. Operator injection in status
    const statusResult = getAdminOrdersSchema.safeParse({
      query: { status: { $ne: "cancelled" } }
    });
    expect(statusResult.success).toBe(false);

    // 2. Operator injection in paymentStatus
    const paymentResult = getAdminOrdersSchema.safeParse({
      query: { paymentStatus: { $ne: "pending" } }
    });
    expect(paymentResult.success).toBe(false);

    // 3. Operator injection in sortBy
    const sortResult = getAdminOrdersSchema.safeParse({
      query: { sortBy: { $ne: "createdAt" } }
    });
    expect(sortResult.success).toBe(false);

    // 4. Operator injection in search (regex object instead of string)
    const searchResult = getAdminOrdersSchema.safeParse({
      query: { search: { $regex: ".*" } }
    });
    expect(searchResult.success).toBe(false);

    // 5. Excessive limit
    const limitResult = getAdminOrdersSchema.safeParse({
      query: { limit: 999999 }
    });
    expect(limitResult.success).toBe(false);

    // 6. Negative page
    const pageResult = getAdminOrdersSchema.safeParse({
      query: { page: -1 }
    });
    expect(pageResult.success).toBe(false);
  });
});

describe("updateShipmentSchema (Step 74.1)", () => {
  const validOrderId = "507f1f77bcf86cd799439011";

  const validBasePayload = {
    params: {
      orderId: validOrderId
    },
    body: {
      carrier: "Blue Dart",
      trackingNumber: "BD-123456789",
      trackingUrl: "https://www.bluedart.com/tracking?track=BD-123456789",
      status: "in_transit",
      estimatedDelivery: "2026-10-02T18:00:00.000Z"
    }
  };

  it("1. accepts a valid complete shipment payload", () => {
    const result = updateShipmentSchema.safeParse(validBasePayload);
    expect(result.success).toBe(true);
    expect(result.data.body.carrier).toBe("Blue Dart");
    expect(result.data.body.trackingNumber).toBe("BD-123456789");
    expect(result.data.body.trackingUrl).toBe("https://www.bluedart.com/tracking?track=BD-123456789");
    expect(result.data.body.status).toBe("in_transit");
    expect(result.data.body.estimatedDelivery).toBe("2026-10-02T18:00:00.000Z");
  });

  it("2. accepts a valid payload without optional tracking URL and defaults to empty string", () => {
    const payload = {
      params: { orderId: validOrderId },
      body: {
        carrier: "Delhivery",
        trackingNumber: "DEL123456"
      }
    };
    const result = updateShipmentSchema.safeParse(payload);
    expect(result.success).toBe(true);
    expect(result.data.body.trackingUrl).toBe("");
    expect(result.data.body.status).toBe("in_transit");
  });

  it("3. accepts a valid payload with empty tracking URL", () => {
    const payload = {
      params: { orderId: validOrderId },
      body: {
        carrier: "FedEx",
        trackingNumber: "FX-998877",
        trackingUrl: ""
      }
    };
    const result = updateShipmentSchema.safeParse(payload);
    expect(result.success).toBe(true);
    expect(result.data.body.trackingUrl).toBe("");
  });

  it("4. accepts valid nullable estimatedDelivery", () => {
    const payload = {
      params: { orderId: validOrderId },
      body: {
        carrier: "India Post",
        trackingNumber: "IP123456789IN",
        estimatedDelivery: null
      }
    };
    const result = updateShipmentSchema.safeParse(payload);
    expect(result.success).toBe(true);
    expect(result.data.body.estimatedDelivery).toBeNull();
  });

  it("5. rejects missing carrier", () => {
    const payload = {
      params: { orderId: validOrderId },
      body: {
        trackingNumber: "TRK123456"
      }
    };
    const result = updateShipmentSchema.safeParse(payload);
    expect(result.success).toBe(false);
    expect(result.error.issues.some((i) => i.path.includes("carrier"))).toBe(true);
  });

  it("6. rejects carrier shorter than 2 characters", () => {
    const invalidCarriers = ["A", " ", "   A   ", ""];
    for (const carrier of invalidCarriers) {
      const payload = {
        params: { orderId: validOrderId },
        body: {
          carrier,
          trackingNumber: "TRK123456"
        }
      };
      const result = updateShipmentSchema.safeParse(payload);
      expect(result.success).toBe(false);
      expect(result.error.issues.some((i) => i.path.includes("carrier"))).toBe(true);
    }
  });

  it("7. rejects carrier longer than 60 characters", () => {
    const payload = {
      params: { orderId: validOrderId },
      body: {
        carrier: "A".repeat(61),
        trackingNumber: "TRK123456"
      }
    };
    const result = updateShipmentSchema.safeParse(payload);
    expect(result.success).toBe(false);
    expect(result.error.issues.some((i) => i.path.includes("carrier"))).toBe(true);
  });

  it("8. rejects missing tracking number", () => {
    const payload = {
      params: { orderId: validOrderId },
      body: {
        carrier: "Blue Dart"
      }
    };
    const result = updateShipmentSchema.safeParse(payload);
    expect(result.success).toBe(false);
    expect(result.error.issues.some((i) => i.path.includes("trackingNumber"))).toBe(true);
  });

  it("9. rejects tracking number shorter than 3 characters", () => {
    const invalidNumbers = ["AB", " A ", "", "  "];
    for (const trackingNumber of invalidNumbers) {
      const payload = {
        params: { orderId: validOrderId },
        body: {
          carrier: "Blue Dart",
          trackingNumber
        }
      };
      const result = updateShipmentSchema.safeParse(payload);
      expect(result.success).toBe(false);
      expect(result.error.issues.some((i) => i.path.includes("trackingNumber"))).toBe(true);
    }
  });

  it("10. rejects tracking number longer than 100 characters", () => {
    const payload = {
      params: { orderId: validOrderId },
      body: {
        carrier: "Blue Dart",
        trackingNumber: "T".repeat(101)
      }
    };
    const result = updateShipmentSchema.safeParse(payload);
    expect(result.success).toBe(false);
    expect(result.error.issues.some((i) => i.path.includes("trackingNumber"))).toBe(true);
  });

  it("11. rejects invalid tracking-number characters", () => {
    const invalidNumbers = [
      "TRACK 123",
      "TRACK#123",
      "TRACK$123",
      "TRACK@123",
      "TRACK!123",
      "<script>alert(1)</script>"
    ];
    for (const trackingNumber of invalidNumbers) {
      const payload = {
        params: { orderId: validOrderId },
        body: {
          carrier: "Blue Dart",
          trackingNumber
        }
      };
      const result = updateShipmentSchema.safeParse(payload);
      expect(result.success).toBe(false);
      expect(result.error.issues.some((i) => i.path.includes("trackingNumber"))).toBe(true);
    }
  });

  it("12. accepts valid tracking-number punctuation (_ - . /)", () => {
    const validNumbers = [
      "TRK_123456",
      "TRK-123-456",
      "TRK.123.456",
      "TRK/123/456",
      "A_B-C.D/123"
    ];
    for (const trackingNumber of validNumbers) {
      const payload = {
        params: { orderId: validOrderId },
        body: {
          carrier: "Blue Dart",
          trackingNumber
        }
      };
      const result = updateShipmentSchema.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data.body.trackingNumber).toBe(trackingNumber);
    }
  });

  it("13. rejects invalid tracking URL", () => {
    const invalidUrls = ["not-a-url", "ftp://bluedart.com/track", "httpp://bluedart.com"];
    for (const trackingUrl of invalidUrls) {
      const payload = {
        params: { orderId: validOrderId },
        body: {
          carrier: "Blue Dart",
          trackingNumber: "TRK123456",
          trackingUrl
        }
      };
      const result = updateShipmentSchema.safeParse(payload);
      expect(result.success).toBe(false);
      expect(result.error.issues.some((i) => i.path.includes("trackingUrl"))).toBe(true);
    }
  });

  it("14. rejects javascript: URL", () => {
    const payload = {
      params: { orderId: validOrderId },
      body: {
        carrier: "Blue Dart",
        trackingNumber: "TRK123456",
        trackingUrl: "javascript:alert(1)"
      }
    };
    const result = updateShipmentSchema.safeParse(payload);
    expect(result.success).toBe(false);
    expect(result.error.issues.some((i) => i.path.includes("trackingUrl"))).toBe(true);
  });

  it("15. rejects data: URL", () => {
    const payload = {
      params: { orderId: validOrderId },
      body: {
        carrier: "Blue Dart",
        trackingNumber: "TRK123456",
        trackingUrl: "data:text/html,<script>alert(1)</script>"
      }
    };
    const result = updateShipmentSchema.safeParse(payload);
    expect(result.success).toBe(false);
    expect(result.error.issues.some((i) => i.path.includes("trackingUrl"))).toBe(true);
  });

  it("16. rejects relative URL", () => {
    const payload = {
      params: { orderId: validOrderId },
      body: {
        carrier: "Blue Dart",
        trackingNumber: "TRK123456",
        trackingUrl: "/orders/tracking/123456"
      }
    };
    const result = updateShipmentSchema.safeParse(payload);
    expect(result.success).toBe(false);
    expect(result.error.issues.some((i) => i.path.includes("trackingUrl"))).toBe(true);
  });

  it("17. rejects invalid shipment status", () => {
    const invalidStatuses = ["dispatched", "pending", "unknown", "shipped", 123];
    for (const status of invalidStatuses) {
      const payload = {
        params: { orderId: validOrderId },
        body: {
          carrier: "Blue Dart",
          trackingNumber: "TRK123456",
          status
        }
      };
      const result = updateShipmentSchema.safeParse(payload);
      expect(result.success).toBe(false);
      expect(result.error.issues.some((i) => i.path.includes("status"))).toBe(true);
    }
  });

  it("18. rejects invalid ISO datetime", () => {
    const invalidDates = ["2026-13-45", "not-a-date", "2026/10/02", "tomorrow"];
    for (const estimatedDelivery of invalidDates) {
      const payload = {
        params: { orderId: validOrderId },
        body: {
          carrier: "Blue Dart",
          trackingNumber: "TRK123456",
          estimatedDelivery
        }
      };
      const result = updateShipmentSchema.safeParse(payload);
      expect(result.success).toBe(false);
      expect(result.error.issues.some((i) => i.path.includes("estimatedDelivery"))).toBe(true);
    }
  });

  it("19. rejects unknown body fields", () => {
    const payload = {
      params: { orderId: validOrderId },
      body: {
        carrier: "Blue Dart",
        trackingNumber: "TRK123456",
        extraField: "not_allowed"
      }
    };
    const result = updateShipmentSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("20. rejects client-supplied shippedAt", () => {
    const payload = {
      params: { orderId: validOrderId },
      body: {
        carrier: "Blue Dart",
        trackingNumber: "TRK123456",
        shippedAt: "2026-09-27T10:00:00.000Z"
      }
    };
    const result = updateShipmentSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("21. rejects client-supplied deliveredAt", () => {
    const payload = {
      params: { orderId: validOrderId },
      body: {
        carrier: "Blue Dart",
        trackingNumber: "TRK123456",
        deliveredAt: "2026-09-27T10:00:00.000Z"
      }
    };
    const result = updateShipmentSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("22. rejects client-supplied updatedAt", () => {
    const payload = {
      params: { orderId: validOrderId },
      body: {
        carrier: "Blue Dart",
        trackingNumber: "TRK123456",
        updatedAt: "2026-09-27T10:00:00.000Z"
      }
    };
    const result = updateShipmentSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("23. rejects invalid order ID", () => {
    const invalidIds = ["123", "507f1f77bcf86cd79943901z", "not-a-valid-object-id", ""];
    for (const orderId of invalidIds) {
      const payload = {
        params: { orderId },
        body: {
          carrier: "Blue Dart",
          trackingNumber: "TRK123456"
        }
      };
      const result = updateShipmentSchema.safeParse(payload);
      expect(result.success).toBe(false);
      expect(result.error.issues.some((i) => i.path.includes("orderId"))).toBe(true);
    }
  });

  it("24. accepts valid 24-character hexadecimal order ID", () => {
    const payload = {
      params: { orderId: "507f1f77bcf86cd799439011" },
      body: {
        carrier: "Blue Dart",
        trackingNumber: "TRK123456"
      }
    };
    const result = updateShipmentSchema.safeParse(payload);
    expect(result.success).toBe(true);
    expect(result.data.params.orderId).toBe("507f1f77bcf86cd799439011");
  });
});

describe("Order Model - Shipment Embedded Subdocument Schema (Step 74.1)", () => {
  it("defaults shipment to null when not provided on order creation", () => {
    const order = new Order({
      user: "507f1f77bcf86cd799439011",
      items: [
        {
          product: "507f1f77bcf86cd799439012",
          name: "Test Product",
          price: 100,
          quantity: 1,
          subtotal: 100
        }
      ],
      totalQuantity: 1,
      subtotal: 100,
      payment: { provider: "razorpay" },
      shippingAddress: {
        fullName: "Test User",
        phone: "1234567890",
        addressLine1: "123 Test St",
        city: "Test City",
        state: "Test State",
        postalCode: "123456",
        country: "India"
      }
    });

    expect(order.shipment).toBeNull();
  });

  it("correctly populates shipment subdocument with defaults when valid data is provided", () => {
    const order = new Order({
      user: "507f1f77bcf86cd799439011",
      items: [
        {
          product: "507f1f77bcf86cd799439012",
          name: "Test Product",
          price: 100,
          quantity: 1,
          subtotal: 100
        }
      ],
      totalQuantity: 1,
      subtotal: 100,
      payment: { provider: "razorpay" },
      shippingAddress: {
        fullName: "Test User",
        phone: "1234567890",
        addressLine1: "123 Test St",
        city: "Test City",
        state: "Test State",
        postalCode: "123456",
        country: "India"
      },
      shipment: {
        carrier: "Blue Dart",
        trackingNumber: "BD-123456"
      }
    });

    expect(order.shipment).toBeDefined();
    expect(order.shipment.carrier).toBe("Blue Dart");
    expect(order.shipment.trackingNumber).toBe("BD-123456");
    expect(order.shipment.trackingUrl).toBe("");
    expect(order.shipment.status).toBe("in_transit");
    expect(order.shipment.shippedAt).toBeInstanceOf(Date);
    expect(order.shipment.estimatedDelivery).toBeNull();
    expect(order.shipment.deliveredAt).toBeNull();
    expect(order.shipment.updatedAt).toBeInstanceOf(Date);
  });

  it("rejects invalid shipment subdocument via Mongoose validation", async () => {
    const order = new Order({
      user: "507f1f77bcf86cd799439011",
      items: [
        {
          product: "507f1f77bcf86cd799439012",
          name: "Test Product",
          price: 100,
          quantity: 1,
          subtotal: 100
        }
      ],
      totalQuantity: 1,
      subtotal: 100,
      payment: { provider: "razorpay" },
      shippingAddress: {
        fullName: "Test User",
        phone: "1234567890",
        addressLine1: "123 Test St",
        city: "Test City",
        state: "Test State",
        postalCode: "123456",
        country: "India"
      },
      shipment: {
        carrier: "A",
        trackingNumber: "AB",
        status: "unsupported_status"
      }
    });

    let validationError = null;
    try {
      await order.validate();
    } catch (err) {
      validationError = err;
    }
    expect(validationError).toBeDefined();
    expect(validationError.errors["shipment.carrier"]).toBeDefined();
    expect(validationError.errors["shipment.trackingNumber"]).toBeDefined();
    expect(validationError.errors["shipment.status"]).toBeDefined();
  });
});
