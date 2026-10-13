import { describe, it, expect } from "vitest";
import CouponReservation from "./coupon-reservation.model.js";

describe("CouponReservation Model Unit Tests", () => {
  const validReservation = {
    coupon: "507f1f77bcf86cd799439011",
    user: "507f1f77bcf86cd799439012",
    slotNumber: 1,
    reservationId: "res-uuid-12345",
    status: "reserved"
  };

  it("validates successfully with valid required fields", async () => {
    const doc = new CouponReservation(validReservation);
    let error;
    try {
      await doc.validate();
    } catch (e) {
      error = e;
    }
    expect(error).toBeUndefined();
    expect(doc.status).toBe("reserved");
    expect(doc.order).toBeNull();
  });

  it("requires coupon reference", async () => {
    const doc = new CouponReservation({ ...validReservation, coupon: undefined });
    let error;
    try {
      await doc.validate();
    } catch (e) {
      error = e;
    }
    expect(error).toBeDefined();
    expect(error.errors.coupon).toBeDefined();
  });

  it("requires user reference", async () => {
    const doc = new CouponReservation({ ...validReservation, user: undefined });
    let error;
    try {
      await doc.validate();
    } catch (e) {
      error = e;
    }
    expect(error).toBeDefined();
    expect(error.errors.user).toBeDefined();
  });

  it("requires slotNumber >= 1", async () => {
    const doc = new CouponReservation({ ...validReservation, slotNumber: 0 });
    let error;
    try {
      await doc.validate();
    } catch (e) {
      error = e;
    }
    expect(error).toBeDefined();
    expect(error.errors.slotNumber).toBeDefined();
  });

  it("requires reservationId string", async () => {
    const doc = new CouponReservation({ ...validReservation, reservationId: undefined });
    let error;
    try {
      await doc.validate();
    } catch (e) {
      error = e;
    }
    expect(error).toBeDefined();
    expect(error.errors.reservationId).toBeDefined();
  });

  it("rejects invalid status enum", async () => {
    const doc = new CouponReservation({ ...validReservation, status: "cancelled" });
    let error;
    try {
      await doc.validate();
    } catch (e) {
      error = e;
    }
    expect(error).toBeDefined();
    expect(error.errors.status).toBeDefined();
  });

  it("accepts consumed status", async () => {
    const doc = new CouponReservation({
      ...validReservation,
      status: "consumed",
      order: "507f1f77bcf86cd799439013"
    });
    let error;
    try {
      await doc.validate();
    } catch (e) {
      error = e;
    }
    expect(error).toBeUndefined();
  });

  it("has correct indexes declared", () => {
    const indexes = CouponReservation.schema.indexes();
    const hasUniqueCompoundIndex = indexes.some(
      ([fields, opts]) =>
        fields.coupon === 1 &&
        fields.user === 1 &&
        fields.slotNumber === 1 &&
        opts.unique === true
    );
    const hasUniqueReservationIdIndex = indexes.some(
      ([fields, opts]) => fields.reservationId === 1 && opts.unique === true
    );

    expect(hasUniqueCompoundIndex).toBe(true);
    expect(hasUniqueReservationIdIndex).toBe(true);
  });
});
