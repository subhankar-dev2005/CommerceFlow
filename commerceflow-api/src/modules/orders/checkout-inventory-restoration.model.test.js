import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import CheckoutInventoryRestoration from "./checkout-inventory-restoration.model.js";

function createValidRestorationData(overrides = {}) {
  return {
    order: new mongoose.Types.ObjectId(),
    product: new mongoose.Types.ObjectId(),
    quantity: 2,
    restorationKey: "restore_key_abc_123",
    status: "pending",
    ...overrides
  };
}

describe("P1.6.2 CheckoutInventoryRestoration Model — Variant Identity Tests", () => {
  describe("Schema Properties & Defaults", () => {
    it("defines variantId defaulting to null for legacy simple-product restorations", async () => {
      const record = new CheckoutInventoryRestoration(createValidRestorationData());
      await record.validate();

      expect(record.variantId).toBeNull();
      expect(record.status).toBe("pending");
      expect(record.quantity).toBe(2);
    });

    it("persists exact variantId for variant-specific inventory restoration", async () => {
      const record = new CheckoutInventoryRestoration(
        createValidRestorationData({
          variantId: "   var_restoration_uuid_99   "
        })
      );

      await record.validate();
      expect(record.variantId).toBe("var_restoration_uuid_99");
    });

    it("verifies restorationKey unique index is preserved", () => {
      const indexes = CheckoutInventoryRestoration.schema.indexes();
      expect(indexes).toContainEqual([
        { restorationKey: 1 },
        { unique: true }
      ]);
    });

    it("fails validation if required product is missing", async () => {
      const record = new CheckoutInventoryRestoration(
        createValidRestorationData({
          product: undefined
        })
      );

      await expect(record.validate()).rejects.toThrow();
    });

    it("fails validation if required order is missing", async () => {
      const record = new CheckoutInventoryRestoration(
        createValidRestorationData({
          order: undefined
        })
      );

      await expect(record.validate()).rejects.toThrow();
    });

    it("fails validation if quantity is less than 1", async () => {
      const record = new CheckoutInventoryRestoration(
        createValidRestorationData({
          quantity: 0
        })
      );

      await expect(record.validate()).rejects.toThrow();
    });

    it("fails validation if status is not an allowed enum value", async () => {
      const record = new CheckoutInventoryRestoration(
        createValidRestorationData({
          status: "completed"
        })
      );

      await expect(record.validate()).rejects.toThrow();
    });
  });
});
