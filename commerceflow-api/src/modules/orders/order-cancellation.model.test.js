import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import Order from "./order.model.js";
import { CANCELLATION_ACTORS } from "./order-cancellation.constants.js";

function createValidOrderData(overrides = {}) {
  return {
    user: new mongoose.Types.ObjectId(),
    items: [
      {
        product: new mongoose.Types.ObjectId(),
        name: "Test Product",
        price: 100,
        quantity: 1,
        subtotal: 100
      }
    ],
    totalQuantity: 1,
    subtotal: 100,
    shippingAmount: 0,
    taxAmount: 0,
    discountAmount: 0,
    total: 100,
    payment: {
      provider: "razorpay",
      status: "pending"
    },
    shippingAddress: {
      fullName: "Test User",
      phone: "1234567890",
      addressLine1: "123 Main St",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
      country: "India"
    },
    ...overrides
  };
}

describe("P1.5.2 Order Cancellation Model Tests", () => {
  describe("Schema Definition & Structure", () => {
    it("defines cancellation path on Order schema with default null", () => {
      const cancellationPath = Order.schema.path("cancellation");
      expect(cancellationPath).toBeDefined();
      expect(cancellationPath.defaultValue).toBe(null);
    });

    it("verifies orderCancellationSchema properties", () => {
      const cancellationPath = Order.schema.path("cancellation");
      const subschema = cancellationPath.schema;

      expect(subschema.options._id).toBe(false);

      const reasonPath = subschema.path("reason");
      expect(reasonPath.instance).toBe("String");
      expect(reasonPath.isRequired).toBe(true);

      const reasonDetailPath = subschema.path("reasonDetail");
      expect(reasonDetailPath.instance).toBe("String");
      expect(reasonDetailPath.options.trim).toBe(true);
      expect(reasonDetailPath.options.maxlength).toBe(500);
      expect(reasonDetailPath.defaultValue).toBe("");

      const cancelledByPath = subschema.path("cancelledBy");
      expect(cancelledByPath.instance).toBe("String");
      expect(cancelledByPath.isRequired).toBe(true);
      expect(cancelledByPath.enumValues).toEqual([...CANCELLATION_ACTORS]);

      const cancelledAtPath = subschema.path("cancelledAt");
      expect(cancelledAtPath.instance).toBe("Date");
      expect(cancelledAtPath.isRequired).toBe(true);
      expect(cancelledAtPath.defaultValue).toBeDefined();
    });
  });

  describe("Validation & Behavior", () => {
    it("sets cancellation to null by default for active or legacy orders", async () => {
      const order = new Order(createValidOrderData());
      await order.validate();
      expect(order.cancellation).toBeNull();
    });

    it("accepts a valid cancellation subdocument for every actor", async () => {
      for (const actor of CANCELLATION_ACTORS) {
        const order = new Order(
          createValidOrderData({
            status: "cancelled",
            cancellation: {
              reason: "other",
              reasonDetail: `Cancelled by ${actor}`,
              cancelledBy: actor
            }
          })
        );

        await order.validate();
        expect(order.cancellation).toBeDefined();
        expect(order.cancellation.reason).toBe("other");
        expect(order.cancellation.reasonDetail).toBe(`Cancelled by ${actor}`);
        expect(order.cancellation.cancelledBy).toBe(actor);
        expect(order.cancellation.cancelledAt).toBeInstanceOf(Date);
        expect(order.cancellation._id).toBeUndefined();
      }
    });

    it("preserves explicitly passed cancelledAt timestamp", async () => {
      const specificDate = new Date("2026-01-15T10:00:00.000Z");
      const order = new Order(
        createValidOrderData({
          status: "cancelled",
          cancellation: {
            reason: "changed_mind",
            cancelledBy: "customer",
            cancelledAt: specificDate
          }
        })
      );

      await order.validate();
      expect(order.cancellation.cancelledAt.toISOString()).toBe(specificDate.toISOString());
    });

    it("rejects an invalid cancelledBy actor", async () => {
      const order = new Order(
        createValidOrderData({
          status: "cancelled",
          cancellation: {
            reason: "changed_mind",
            cancelledBy: "hacker"
          }
        })
      );

      let validationError = null;
      try {
        await order.validate();
      } catch (err) {
        validationError = err;
      }

      expect(validationError).not.toBeNull();
      expect(validationError.errors["cancellation.cancelledBy"]).toBeDefined();
      expect(validationError.errors["cancellation.cancelledBy"].kind).toBe("enum");
    });

    it("enforces required reason field in cancellation", async () => {
      const order = new Order(
        createValidOrderData({
          status: "cancelled",
          cancellation: {
            cancelledBy: "customer"
          }
        })
      );

      let validationError = null;
      try {
        await order.validate();
      } catch (err) {
        validationError = err;
      }

      expect(validationError).not.toBeNull();
      expect(validationError.errors["cancellation.reason"]).toBeDefined();
      expect(validationError.errors["cancellation.reason"].kind).toBe("required");
    });

    it("enforces required cancelledBy field in cancellation", async () => {
      const order = new Order(
        createValidOrderData({
          status: "cancelled",
          cancellation: {
            reason: "changed_mind"
          }
        })
      );

      let validationError = null;
      try {
        await order.validate();
      } catch (err) {
        validationError = err;
      }

      expect(validationError).not.toBeNull();
      expect(validationError.errors["cancellation.cancelledBy"]).toBeDefined();
      expect(validationError.errors["cancellation.cancelledBy"].kind).toBe("required");
    });

    it("trims reasonDetail and defaults to empty string", async () => {
      const order = new Order(
        createValidOrderData({
          status: "cancelled",
          cancellation: {
            reason: "ordered_by_mistake",
            cancelledBy: "customer",
            reasonDetail: "   mistake in size   "
          }
        })
      );

      await order.validate();
      expect(order.cancellation.reasonDetail).toBe("mistake in size");

      const orderNoDetail = new Order(
        createValidOrderData({
          status: "cancelled",
          cancellation: {
            reason: "ordered_by_mistake",
            cancelledBy: "customer"
          }
        })
      );

      await orderNoDetail.validate();
      expect(orderNoDetail.cancellation.reasonDetail).toBe("");
    });

    it("accepts a 500-character reasonDetail", async () => {
      const longDetail = "z".repeat(500);
      const order = new Order(
        createValidOrderData({
          status: "cancelled",
          cancellation: {
            reason: "other",
            cancelledBy: "admin",
            reasonDetail: longDetail
          }
        })
      );

      await order.validate();
      expect(order.cancellation.reasonDetail).toBe(longDetail);
    });

    it("rejects reasonDetail exceeding 500 characters", async () => {
      const tooLongDetail = "z".repeat(501);
      const order = new Order(
        createValidOrderData({
          status: "cancelled",
          cancellation: {
            reason: "other",
            cancelledBy: "admin",
            reasonDetail: tooLongDetail
          }
        })
      );

      let validationError = null;
      try {
        await order.validate();
      } catch (err) {
        validationError = err;
      }

      expect(validationError).not.toBeNull();
      expect(validationError.errors["cancellation.reasonDetail"]).toBeDefined();
      expect(validationError.errors["cancellation.reasonDetail"].kind).toBe("maxlength");
    });

    it("includes cancellation subdocument in toJSON output", () => {
      const order = new Order(
        createValidOrderData({
          status: "cancelled",
          cancellation: {
            reason: "customer_request",
            cancelledBy: "admin",
            reasonDetail: "Requested via phone"
          }
        })
      );

      const json = order.toJSON();
      expect(json.cancellation).toBeDefined();
      expect(json.cancellation.reason).toBe("customer_request");
      expect(json.cancellation.cancelledBy).toBe("admin");
      expect(json.cancellation.reasonDetail).toBe("Requested via phone");
      expect(json.checkoutCompensation).toBeUndefined(); // Verify existing checkoutCompensation remains excluded
    });
  });
});
