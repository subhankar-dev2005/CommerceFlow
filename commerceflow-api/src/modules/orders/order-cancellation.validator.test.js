import { describe, it, expect } from "vitest";
import {
  cancelOrderSchema,
  updateOrderStatusSchema
} from "./order.validator.js";
import {
  CUSTOMER_CANCELLATION_REASONS,
  ADMIN_CANCELLATION_REASONS
} from "./order-cancellation.constants.js";

const VALID_ORDER_ID = "507f1f77bcf86cd799439011";

describe("P1.5.2 Order Cancellation Validator Tests", () => {
  describe("Customer cancelOrderSchema Unit Tests", () => {
    it("accepts a valid customer reason and reasonDetail", () => {
      const payload = {
        params: { orderId: VALID_ORDER_ID },
        body: {
          reason: "changed_mind",
          reasonDetail: "Decided to buy a different color instead."
        }
      };

      const result = cancelOrderSchema.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data.body).toEqual({
        reason: "changed_mind",
        reasonDetail: "Decided to buy a different color instead."
      });
    });

    it("accepts every customer enum value", () => {
      for (const reason of CUSTOMER_CANCELLATION_REASONS) {
        const payload = {
          params: { orderId: VALID_ORDER_ID },
          body: { reason }
        };
        const result = cancelOrderSchema.safeParse(payload);
        expect(result.success).toBe(true);
        expect(result.data.body.reason).toBe(reason);
        expect(result.data.body.reasonDetail).toBe("");
      }
    });

    it("rejects an invalid customer cancellation reason", () => {
      const payload = {
        params: { orderId: VALID_ORDER_ID },
        body: { reason: "not_a_real_reason" }
      };

      const result = cancelOrderSchema.safeParse(payload);
      expect(result.success).toBe(false);
      const errors = result.error.flatten().fieldErrors["body.reason"] || [];
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("Invalid cancellation reason");
    });

    it("rejects admin-only cancellation reasons", () => {
      const adminOnlyReasons = [
        "customer_request",
        "item_unavailable",
        "fraud_suspected",
        "delivery_address_undeliverable",
        "payment_dispute"
      ];

      for (const reason of adminOnlyReasons) {
        const payload = {
          params: { orderId: VALID_ORDER_ID },
          body: { reason }
        };
        const result = cancelOrderSchema.safeParse(payload);
        expect(result.success).toBe(false);
        const messages = result.error.issues.map((i) => i.message);
        expect(messages).toContain("Invalid cancellation reason");
      }
    });

    it("defaults reason to 'other' when omitted", () => {
      const payload = {
        params: { orderId: VALID_ORDER_ID },
        body: { reasonDetail: "Some customer note" }
      };

      const result = cancelOrderSchema.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data.body.reason).toBe("other");
      expect(result.data.body.reasonDetail).toBe("Some customer note");
    });

    it("defaults reason to 'other' and reasonDetail to '' when empty object body is sent", () => {
      const payload = {
        params: { orderId: VALID_ORDER_ID },
        body: {}
      };

      const result = cancelOrderSchema.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data.body).toEqual({
        reason: "other",
        reasonDetail: ""
      });
    });

    it("defaults reason to 'other' and reasonDetail to '' when body is omitted entirely", () => {
      const payload = {
        params: { orderId: VALID_ORDER_ID }
      };

      const result = cancelOrderSchema.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data.body).toEqual({
        reason: "other",
        reasonDetail: ""
      });
    });

    it("defaults reasonDetail to empty string when omitted", () => {
      const payload = {
        params: { orderId: VALID_ORDER_ID },
        body: { reason: "ordered_by_mistake" }
      };

      const result = cancelOrderSchema.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data.body.reasonDetail).toBe("");
    });

    it("trims whitespace from reasonDetail", () => {
      const payload = {
        params: { orderId: VALID_ORDER_ID },
        body: {
          reason: "found_better_price",
          reasonDetail: "   Found lower price on another store   "
        }
      };

      const result = cancelOrderSchema.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data.body.reasonDetail).toBe("Found lower price on another store");
    });

    it("accepts a 500-character reasonDetail", () => {
      const maxDetail = "a".repeat(500);
      const payload = {
        params: { orderId: VALID_ORDER_ID },
        body: {
          reason: "other",
          reasonDetail: maxDetail
        }
      };

      const result = cancelOrderSchema.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data.body.reasonDetail).toBe(maxDetail);
    });

    it("rejects reasonDetail exceeding 500 characters", () => {
      const tooLongDetail = "a".repeat(501);
      const payload = {
        params: { orderId: VALID_ORDER_ID },
        body: {
          reason: "other",
          reasonDetail: tooLongDetail
        }
      };

      const result = cancelOrderSchema.safeParse(payload);
      expect(result.success).toBe(false);
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("Reason detail cannot exceed 500 characters");
    });

    it("rejects non-string reasonDetail", () => {
      const payload = {
        params: { orderId: VALID_ORDER_ID },
        body: {
          reason: "other",
          reasonDetail: 12345
        }
      };

      const result = cancelOrderSchema.safeParse(payload);
      expect(result.success).toBe(false);
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("Reason detail must be a string");
    });

    it("rejects unknown fields in payload", () => {
      const payload = {
        params: { orderId: VALID_ORDER_ID },
        body: {
          reason: "changed_mind",
          extraField: "not_allowed"
        }
      };

      const result = cancelOrderSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("rejects client attempting to provide cancelledBy", () => {
      const payload = {
        params: { orderId: VALID_ORDER_ID },
        body: {
          reason: "changed_mind",
          cancelledBy: "customer"
        }
      };

      const result = cancelOrderSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("rejects client attempting to provide cancelledAt", () => {
      const payload = {
        params: { orderId: VALID_ORDER_ID },
        body: {
          reason: "changed_mind",
          cancelledAt: new Date().toISOString()
        }
      };

      const result = cancelOrderSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("rejects client attempting to provide status in cancelOrderSchema", () => {
      const payload = {
        params: { orderId: VALID_ORDER_ID },
        body: {
          status: "cancelled",
          reason: "changed_mind"
        }
      };

      const result = cancelOrderSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("rejects client attempting to provide order or financial fields", () => {
      const payload = {
        params: { orderId: VALID_ORDER_ID },
        body: {
          total: 0,
          subtotal: 0,
          reason: "changed_mind"
        }
      };

      const result = cancelOrderSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe("Admin updateOrderStatusSchema Unit Tests", () => {
    it("accepts a valid admin cancellation reason and reasonDetail when status is 'cancelled'", () => {
      const payload = {
        params: { orderId: VALID_ORDER_ID },
        body: {
          status: "cancelled",
          reason: "item_unavailable",
          reasonDetail: "Warehouse reported stock damage."
        }
      };

      const result = updateOrderStatusSchema.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data.body).toEqual({
        status: "cancelled",
        reason: "item_unavailable",
        reasonDetail: "Warehouse reported stock damage."
      });
    });

    it("accepts every admin enum value when status is 'cancelled'", () => {
      for (const reason of ADMIN_CANCELLATION_REASONS) {
        const payload = {
          params: { orderId: VALID_ORDER_ID },
          body: {
            status: "cancelled",
            reason
          }
        };
        const result = updateOrderStatusSchema.safeParse(payload);
        expect(result.success).toBe(true);
        expect(result.data.body.status).toBe("cancelled");
        expect(result.data.body.reason).toBe(reason);
        expect(result.data.body.reasonDetail).toBe("");
      }
    });

    it("rejects an invalid cancellation reason for admin", () => {
      const payload = {
        params: { orderId: VALID_ORDER_ID },
        body: {
          status: "cancelled",
          reason: "arbitrary_reason"
        }
      };

      const result = updateOrderStatusSchema.safeParse(payload);
      expect(result.success).toBe(false);
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("Invalid cancellation reason");
    });

    it("rejects customer-only cancellation reasons in admin schema", () => {
      const customerOnlyReasons = [
        "changed_mind",
        "ordered_by_mistake",
        "found_better_price",
        "delivery_too_slow"
      ];

      for (const reason of customerOnlyReasons) {
        const payload = {
          params: { orderId: VALID_ORDER_ID },
          body: {
            status: "cancelled",
            reason
          }
        };
        const result = updateOrderStatusSchema.safeParse(payload);
        expect(result.success).toBe(false);
        const messages = result.error.issues.map((i) => i.message);
        expect(messages).toContain("Invalid cancellation reason");
      }
    });

    it("defaults reason to 'other' and reasonDetail to '' when status is 'cancelled' and reason is omitted", () => {
      const payload = {
        params: { orderId: VALID_ORDER_ID },
        body: {
          status: "cancelled"
        }
      };

      const result = updateOrderStatusSchema.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data.body).toEqual({
        status: "cancelled",
        reason: "other",
        reasonDetail: ""
      });
    });

    it("normalizes and trims reasonDetail for admin cancellation", () => {
      const payload = {
        params: { orderId: VALID_ORDER_ID },
        body: {
          status: "cancelled",
          reason: "customer_request",
          reasonDetail: "   Customer phoned in to cancel order   "
        }
      };

      const result = updateOrderStatusSchema.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data.body.reasonDetail).toBe("Customer phoned in to cancel order");
    });

    it("rejects reasonDetail exceeding 500 characters in admin cancellation", () => {
      const payload = {
        params: { orderId: VALID_ORDER_ID },
        body: {
          status: "cancelled",
          reason: "other",
          reasonDetail: "x".repeat(501)
        }
      };

      const result = updateOrderStatusSchema.safeParse(payload);
      expect(result.success).toBe(false);
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("Reason detail cannot exceed 500 characters");
    });

    it("rejects reason when status is NOT 'cancelled'", () => {
      const nonCancelledStatuses = [
        "pending",
        "confirmed",
        "processing",
        "shipped",
        "delivered"
      ];

      for (const status of nonCancelledStatuses) {
        const payload = {
          params: { orderId: VALID_ORDER_ID },
          body: {
            status,
            reason: "other"
          }
        };

        const result = updateOrderStatusSchema.safeParse(payload);
        expect(result.success).toBe(false);
        const messages = result.error.issues.map((i) => i.message);
        expect(messages).toContain("Reason can only be provided when status is 'cancelled'");
      }
    });

    it("rejects reasonDetail when status is NOT 'cancelled'", () => {
      const nonCancelledStatuses = [
        "pending",
        "confirmed",
        "processing",
        "shipped",
        "delivered"
      ];

      for (const status of nonCancelledStatuses) {
        const payload = {
          params: { orderId: VALID_ORDER_ID },
          body: {
            status,
            reasonDetail: "Package note"
          }
        };

        const result = updateOrderStatusSchema.safeParse(payload);
        expect(result.success).toBe(false);
        const messages = result.error.issues.map((i) => i.message);
        expect(messages).toContain("Reason detail can only be provided when status is 'cancelled'");
      }
    });

    it("allows non-cancelled statuses without reason or reasonDetail", () => {
      const nonCancelledStatuses = [
        "pending",
        "confirmed",
        "processing",
        "shipped",
        "delivered"
      ];

      for (const status of nonCancelledStatuses) {
        const payload = {
          params: { orderId: VALID_ORDER_ID },
          body: { status }
        };

        const result = updateOrderStatusSchema.safeParse(payload);
        expect(result.success).toBe(true);
        expect(result.data.body).toEqual({ status });
      }
    });

    it("rejects unknown fields in admin status payload", () => {
      const payload = {
        params: { orderId: VALID_ORDER_ID },
        body: {
          status: "cancelled",
          adminNote: "Internal only"
        }
      };

      const result = updateOrderStatusSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("rejects client attempting to provide cancelledBy in admin updateOrderStatusSchema", () => {
      const payload = {
        params: { orderId: VALID_ORDER_ID },
        body: {
          status: "cancelled",
          cancelledBy: "admin"
        }
      };

      const result = updateOrderStatusSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("rejects client attempting to provide cancelledAt in admin updateOrderStatusSchema", () => {
      const payload = {
        params: { orderId: VALID_ORDER_ID },
        body: {
          status: "cancelled",
          cancelledAt: new Date().toISOString()
        }
      };

      const result = updateOrderStatusSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });
});
