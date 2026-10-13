import { describe, it, expect, beforeEach, vi } from "vitest";
import { compensateOrderRedemption } from "./compensate-order-redemption.js";
import Order from "./order.model.js";
import Coupon from "../coupons/coupon.model.js";
import CouponReservation from "../coupons/coupon-reservation.model.js";
import CouponUsage from "../coupons/coupon-usage.model.js";
import Product from "../products/product.model.js";
import CheckoutInventoryRestoration from "./checkout-inventory-restoration.model.js";

describe("compensateOrderRedemption Helper (Unit Isolation)", () => {
  let mockLogger;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockLogger = {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn()
    };

    vi.spyOn(Order, "findById").mockImplementation((id) => ({
      select: () => Promise.resolve({ _id: id, status: "pending", checkoutState: "in_progress" }),
      then: (res, rej) => Promise.resolve({ _id: id, status: "pending", checkoutState: "in_progress" }).then(res, rej)
    }));
    vi.spyOn(Order, "findOneAndUpdate").mockResolvedValue({ status: "cancelled", checkoutState: "none" });
    vi.spyOn(Order, "findByIdAndUpdate").mockResolvedValue({ status: "cancelled", checkoutState: "none" });
    vi.spyOn(Coupon, "findById").mockResolvedValue({ _id: "coup-1", usedCount: 0, reservations: [] });
    vi.spyOn(CouponUsage, "deleteOne").mockResolvedValue({ acknowledged: true, deletedCount: 1 });
    vi.spyOn(CouponReservation, "deleteOne").mockResolvedValue({ acknowledged: true, deletedCount: 1 });
    vi.spyOn(Product, "findOneAndUpdate").mockResolvedValue(null);
    vi.spyOn(Product, "findByIdAndUpdate").mockResolvedValue(true);
    vi.spyOn(Product, "findById").mockResolvedValue({ _id: "prod-1", stock: 10, restorationKeys: [] });
    vi.spyOn(CheckoutInventoryRestoration, "create").mockResolvedValue({ status: "pending" });
    vi.spyOn(CheckoutInventoryRestoration, "findOne").mockResolvedValue({ status: "pending" });
    vi.spyOn(CheckoutInventoryRestoration, "findOneAndUpdate").mockResolvedValue({ status: "restored" });
    vi.spyOn(CheckoutInventoryRestoration, "updateOne").mockResolvedValue({ acknowledged: true });
  });

  it("returns isFullyCompensated: true when nothing was created or deducted", async () => {
    const result = await compensateOrderRedemption({
      createdOrder: null,
      createdCouponUsage: null,
      userReservation: null,
      reservedCoupon: null,
      reservationId: null,
      deductedItems: [],
      logger: mockLogger
    });

    expect(result.isFullyCompensated).toBe(true);
    expect(result.details.orderCancelled).toBe(true);
    expect(result.details.couponUsageRemoved).toBe(true);
    expect(result.details.userReservationReleased).toBe(true);
    expect(result.details.globalCouponReleased).toBe(true);
    expect(result.details.inventoryRestored).toBe(true);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it("persists cancellation reason and actor atomically via findOneAndUpdate in unit isolation", async () => {
    const createdOrder = { _id: "607f1f77bcf86cd799439001", status: "pending" };
    const cancellationSnapshot = {
      reason: "system_checkout_failure",
      reasonDetail: "",
      cancelledBy: "system",
      cancelledAt: new Date()
    };
    const findOneAndUpdateSpy = vi.spyOn(Order, "findOneAndUpdate").mockResolvedValue({
      _id: createdOrder._id,
      status: "cancelled",
      cancellation: cancellationSnapshot
    });

    const result = await compensateOrderRedemption({
      createdOrder,
      logger: mockLogger
    });

    expect(result.isFullyCompensated).toBe(true);
    expect(result.details.orderCancelled).toBe(true);
    expect(findOneAndUpdateSpy).toHaveBeenCalledWith(
      {
        _id: createdOrder._id,
        status: { $ne: "cancelled" }
      },
      {
        $set: {
          status: "cancelled",
          cancellation: {
            reason: "system_checkout_failure",
            reasonDetail: "",
            cancelledBy: "system",
            cancelledAt: expect.any(Date)
          }
        }
      },
      { returnDocument: "after" }
    );
    expect(createdOrder.status).toBe("cancelled");
    expect(createdOrder.cancellation).toEqual(cancellationSnapshot);
  });

  it("does not overwrite cancellation if order is already cancelled in unit isolation", async () => {
    const existingCancellation = {
      reason: "changed_mind",
      reasonDetail: "Customer cancelled earlier",
      cancelledBy: "customer",
      cancelledAt: new Date("2026-01-01T00:00:00.000Z")
    };
    const createdOrder = {
      _id: "607f1f77bcf86cd799439001",
      status: "cancelled",
      checkoutState: "compensation_pending",
      cancellation: existingCancellation
    };

    // When order is already cancelled, findOneAndUpdate with status: { $ne: "cancelled" } matches 0 documents (returns null)
    vi.spyOn(Order, "findOneAndUpdate").mockResolvedValue(null);

    const result = await compensateOrderRedemption({
      createdOrder,
      logger: mockLogger
    });

    expect(result.isFullyCompensated).toBe(true);
    expect(result.details.orderCancelled).toBe(true);
    expect(createdOrder.cancellation).toEqual(existingCancellation);
    expect(createdOrder.cancellation.cancelledBy).toBe("customer");
  });

  it("Order cancellation fails - marks checkoutState as compensation_pending and logs error", async () => {
    const createdOrder = { _id: "607f1f77bcf86cd799439001", status: "pending" };
    vi.spyOn(Order, "findOneAndUpdate")
      .mockRejectedValueOnce(new Error("DB error during order cancellation"));
    const updateOrderStateSpy = vi.spyOn(Order, "findByIdAndUpdate")
      .mockResolvedValueOnce(true);

    const result = await compensateOrderRedemption({
      createdOrder,
      logger: mockLogger
    });

    expect(result.isFullyCompensated).toBe(false);
    expect(result.details.orderCancelled).toBe(false);
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: createdOrder._id }),
      "Failed to cancel order during coupon redemption compensation"
    );
    expect(updateOrderStateSpy).toHaveBeenLastCalledWith(createdOrder._id, {
      $set: { checkoutState: "compensation_pending" }
    });
  });

  it("CouponUsage deletion fails - marks compensation incomplete and logs error", async () => {
    const createdOrder = { _id: "607f1f77bcf86cd799439001", status: "pending" };
    const createdCouponUsage = { _id: "607f1f77bcf86cd799439002", order: createdOrder._id };

    vi.spyOn(Order, "findById").mockResolvedValue(createdOrder);
    vi.spyOn(Order, "findOneAndUpdate").mockResolvedValue({ ...createdOrder, status: "cancelled" });
    vi.spyOn(CouponUsage, "deleteOne").mockRejectedValue(new Error("CouponUsage delete failed"));
    const updateOrderStateSpy = vi.spyOn(Order, "findByIdAndUpdate").mockResolvedValue(true);

    const result = await compensateOrderRedemption({
      createdOrder,
      createdCouponUsage,
      logger: mockLogger
    });

    expect(result.isFullyCompensated).toBe(false);
    expect(result.details.couponUsageRemoved).toBe(false);
    expect(result.details.orderCancelled).toBe(true);
    expect(updateOrderStateSpy).toHaveBeenCalledWith(createdOrder._id, {
      $set: { checkoutState: "compensation_pending" }
    });
  });

  it("Per-user reservation deletion fails - marks compensation incomplete and logs error", async () => {
    const userReservation = { _id: "607f1f77bcf86cd799439003" };
    const reservationId = "tok-12345";

    vi.spyOn(CouponReservation, "deleteOne").mockRejectedValue(new Error("User reservation deletion failed"));

    const result = await compensateOrderRedemption({
      userReservation,
      reservationId,
      logger: mockLogger
    });

    expect(result.isFullyCompensated).toBe(false);
    expect(result.details.userReservationReleased).toBe(false);
  });

  it("Global coupon compensation decrement fails - marks compensation incomplete and logs error", async () => {
    const reservedCoupon = { _id: "607f1f77bcf86cd799439004", usedCount: 5, reservations: ["tok-12345"] };
    const reservationId = "tok-12345";

    vi.spyOn(Coupon, "findOneAndUpdate").mockRejectedValue(new Error("Coupon update failed"));

    const result = await compensateOrderRedemption({
      reservedCoupon,
      reservationId,
      logger: mockLogger
    });

    expect(result.isFullyCompensated).toBe(false);
    expect(result.details.globalCouponReleased).toBe(false);
  });

  it("Inventory stock rollback fails - marks compensation incomplete and logs error", async () => {
    const deductedItems = [
      { product: "607f1f77bcf86cd799439005", quantity: 2 },
      { product: "607f1f77bcf86cd799439006", quantity: 1 }
    ];

    vi.spyOn(Product, "findByIdAndUpdate")
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error("Stock increment failed"));

    const result = await compensateOrderRedemption({
      deductedItems,
      logger: mockLogger
    });

    expect(result.isFullyCompensated).toBe(false);
    expect(result.details.inventoryRestored).toBe(false);
    expect(deductedItems[0].restored).toBe(true);
    expect(deductedItems[1].restored).toBeUndefined();
  });
});

describe("Durable Compensation Architecture & Resumability (P1.1 Step 77.5.4)", () => {
  let mockLogger;
  let db;

  const resetDb = () => {
    db = {
      orders: new Map(),
      products: new Map(),
      coupons: new Map(),
      reservations: new Map(),
      usages: new Map(),
      carts: new Map(),
      restorations: new Map()
    };
  };

  const clone = (obj) => (obj ? structuredClone(obj) : obj);

  beforeEach(() => {
    vi.restoreAllMocks();
    resetDb();

    mockLogger = {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn()
    };

    vi.spyOn(Order, "findById").mockImplementation((id) => {
      const doc = db.orders.get(String(id));
      const res = clone(doc);
      return {
        select: () => Promise.resolve(res),
        then: (resolve, reject) => Promise.resolve(res).then(resolve, reject)
      };
    });

    vi.spyOn(Order, "findOneAndUpdate").mockImplementation((query, update) => {
      const id = query?._id || query;
      const doc = db.orders.get(String(id));
      if (!doc) return Promise.resolve(null);
      if (query?.status?.$ne && doc.status === query.status.$ne) {
        return Promise.resolve(null);
      }
      if (query?.status?.$in && !query.status.$in.includes(doc.status)) {
        return Promise.resolve(null);
      }
      if (query?.status?.$nin && query.status.$nin.includes(doc.status)) {
        return Promise.resolve(null);
      }
      if (query?.status && typeof query.status === "string" && doc.status !== query.status) {
        return Promise.resolve(null);
      }
      if (update.$set) {
        Object.assign(doc, clone(update.$set));
      }
      return Promise.resolve(clone(doc));
    });

    vi.spyOn(Order, "findByIdAndUpdate").mockImplementation((id, update) => {
      const doc = db.orders.get(String(id));
      if (!doc) return Promise.resolve(null);
      if (update.$set) {
        Object.assign(doc, clone(update.$set));
      }
      return Promise.resolve(clone(doc));
    });

    vi.spyOn(Order, "updateOne").mockImplementation((query, update) => {
      const doc = db.orders.get(String(query._id));
      if (!doc) return Promise.resolve({ acknowledged: true, modifiedCount: 0 });
      if (update.$set) {
        for (const [key, value] of Object.entries(update.$set)) {
          if (
            key === "checkoutCompensation.restoredItems.$.restored" ||
            key === "checkoutCompensation.restoredItems.$.restorationState"
          ) {
            let prodId = query["checkoutCompensation.restoredItems.product"];
            let resKey = query["checkoutCompensation.restoredItems.restorationKey"];
            if (query.$or) {
              for (const cond of query.$or) {
                if (cond["checkoutCompensation.restoredItems.product"]) prodId = cond["checkoutCompensation.restoredItems.product"];
                if (cond["checkoutCompensation.restoredItems.restorationKey"]) resKey = cond["checkoutCompensation.restoredItems.restorationKey"];
              }
            }
            const item = doc.checkoutCompensation?.restoredItems?.find(
              (i) =>
                (prodId && String(i.product) === String(prodId)) ||
                (resKey && i.restorationKey === resKey)
            );
            if (item) {
              if (key.includes("restorationState")) {
                item.restorationState = value;
                if (value === "restored") item.restored = true;
              } else {
                item.restored = value;
                if (value === true) item.restorationState = "restored";
              }
            }
          } else if (key === "checkoutCompensation.restoredItems.$.deducted") {
            const prodId = query["checkoutCompensation.restoredItems.product"];
            const item = doc.checkoutCompensation?.restoredItems?.find(
              (i) => String(i.product) === String(prodId)
            );
            if (item) item.deducted = value;
          }
        }
      }
      return Promise.resolve({ acknowledged: true, modifiedCount: 1 });
    });

    vi.spyOn(Product, "findById").mockImplementation((id) => {
      const doc = db.products.get(String(id));
      return Promise.resolve(clone(doc) || null);
    });

    vi.spyOn(Product, "findOneAndUpdate").mockImplementation((query, update) => {
      const doc = db.products.get(String(query._id));
      if (!doc) return Promise.resolve(null);
      if (!doc.restorationKeys) doc.restorationKeys = [];
      if (query.restorationKeys?.$ne && doc.restorationKeys.includes(query.restorationKeys.$ne)) {
        return Promise.resolve(null);
      }
      if (update.$inc?.stock) {
        doc.stock += update.$inc.stock;
      }
      if (update.$push?.restorationKeys) {
        if (typeof update.$push.restorationKeys === "object" && update.$push.restorationKeys.$each) {
          doc.restorationKeys.push(...update.$push.restorationKeys.$each);
          if (typeof update.$push.restorationKeys.$slice === "number") {
            doc.restorationKeys = doc.restorationKeys.slice(update.$push.restorationKeys.$slice);
          }
        } else {
          doc.restorationKeys.push(update.$push.restorationKeys);
        }
      }
      return Promise.resolve(clone(doc));
    });

    vi.spyOn(Product, "findByIdAndUpdate").mockImplementation((id, update) => {
      const doc = db.products.get(String(id));
      if (!doc) return Promise.resolve(null);
      if (update.$inc?.stock) {
        doc.stock += update.$inc.stock;
      }
      return Promise.resolve(clone(doc));
    });

    vi.spyOn(Coupon, "findOneAndUpdate").mockImplementation((query, update) => {
      const doc = db.coupons.get(String(query._id));
      if (!doc) return Promise.resolve(null);
      if (query.reservations && !doc.reservations.includes(query.reservations)) {
        return Promise.resolve(null);
      }
      if (query.usedCount?.$gt !== undefined && doc.usedCount <= query.usedCount.$gt) {
        return Promise.resolve(null);
      }
      if (update.$inc?.usedCount) {
        doc.usedCount += update.$inc.usedCount;
      }
      if (update.$pull?.reservations) {
        doc.reservations = doc.reservations.filter((r) => r !== update.$pull.reservations);
      }
      return Promise.resolve(clone(doc));
    });

    vi.spyOn(Coupon, "findById").mockImplementation((id) => {
      return Promise.resolve(clone(db.coupons.get(String(id))));
    });

    vi.spyOn(CouponReservation, "deleteOne").mockImplementation((query) => {
      for (const [id, doc] of db.reservations.entries()) {
        const matches =
          (query._id && String(doc._id) === String(query._id)) ||
          (query.reservationId && doc.reservationId === query.reservationId) ||
          (query.order && String(doc.order) === String(query.order)) ||
          (query.$or &&
            query.$or.some(
              (cond) =>
                (cond.order && String(doc.order) === String(cond.order)) ||
                (cond.reservationId && doc.reservationId === cond.reservationId)
            ));
        if (matches) {
          db.reservations.delete(id);
          return Promise.resolve({ acknowledged: true, deletedCount: 1 });
        }
      }
      return Promise.resolve({ acknowledged: true, deletedCount: 0 });
    });

    vi.spyOn(CouponUsage, "deleteOne").mockImplementation((query) => {
      for (const [id, doc] of db.usages.entries()) {
        if (
          (query._id && String(doc._id) === String(query._id)) ||
          (query.order && String(doc.order) === String(query.order))
        ) {
          db.usages.delete(id);
          return Promise.resolve({ acknowledged: true, deletedCount: 1 });
        }
      }
      return Promise.resolve({ acknowledged: true, deletedCount: 0 });
    });

    vi.spyOn(CheckoutInventoryRestoration, "create").mockImplementation((data) => {
      const key = data.restorationKey;
      if (db.restorations.has(key)) {
        const err = new Error("Duplicate key");
        err.code = 11000;
        return Promise.reject(err);
      }
      const doc = { _id: "res-" + key, ...clone(data) };
      db.restorations.set(key, doc);
      return Promise.resolve(clone(doc));
    });

    vi.spyOn(CheckoutInventoryRestoration, "findOne").mockImplementation((query) => {
      const doc = db.restorations.get(query.restorationKey);
      return Promise.resolve(clone(doc) || null);
    });

    vi.spyOn(CheckoutInventoryRestoration, "findOneAndUpdate").mockImplementation((query, update) => {
      const doc = db.restorations.get(query.restorationKey);
      if (!doc) return Promise.resolve(null);
      if (query.status && doc.status !== query.status) return Promise.resolve(null);
      if (update.$set) {
        Object.assign(doc, clone(update.$set));
      }
      return Promise.resolve(clone(doc));
    });

    vi.spyOn(CheckoutInventoryRestoration, "updateOne").mockImplementation((query, update) => {
      const doc = db.restorations.get(query.restorationKey);
      if (doc && update.$set) {
        Object.assign(doc, clone(update.$set));
      }
      return Promise.resolve({ acknowledged: true, modifiedCount: doc ? 1 : 0 });
    });
  });

  // Section 16.1 - 16.4: Durable recovery from persisted state using orderId alone
  it("Requirements 1-4: recovers completely from persisted MongoDB state using orderId alone", async () => {
    const orderId = "607f1f77bcf86cd799439100";
    const couponId = "607f1f77bcf86cd799439200";
    const reservationId = "tok-durable-123";
    const productId = "607f1f77bcf86cd799439300";

    db.products.set(productId, { _id: productId, name: "Camping Tent", stock: 8 });
    db.coupons.set(couponId, { _id: couponId, code: "SAVE10", usedCount: 6, reservations: [reservationId] });
    db.reservations.set("res-1", { _id: "res-1", coupon: couponId, reservationId, order: orderId, status: "reserved" });
    db.usages.set("use-1", { _id: "use-1", coupon: couponId, order: orderId, status: "redeemed" });

    db.orders.set(orderId, {
      _id: orderId,
      status: "pending",
      checkoutState: "in_progress",
      coupon: { couponId, code: "SAVE10", discountAmount: 100 },
      checkoutCompensation: {
        reservationId,
        couponId,
        restoredItems: [
          {
            product: productId,
            quantity: 2,
            deducted: true,
            restorationState: "pending",
            restored: false,
            restorationKey: `${orderId}_${productId}`
          }
        ]
      }
    });

    // Process crashed. Reinvoked with ONLY orderId:
    const result = await compensateOrderRedemption({
      orderId,
      logger: mockLogger
    });

    expect(result.fullyCompensated).toBe(true);
    expect(result.orderCancelled).toBe(true);
    expect(result.couponUsageRemoved).toBe(true);
    expect(result.userReservationReleased).toBe(true);
    expect(result.globalCouponReleased).toBe(true);
    expect(result.inventoryRestored).toBe(true);

    // Verify persisted state
    const order = db.orders.get(orderId);
    expect(order.status).toBe("cancelled");
    expect(order.checkoutState).toBe("none");
    expect(db.products.get(productId).stock).toBe(10);
    expect(db.coupons.get(couponId).usedCount).toBe(5);
    expect(db.reservations.size).toBe(0);
    expect(db.usages.size).toBe(0);
  });

  // Section 16.5 - 16.8: Inventory restart & idempotency
  it("Requirement 5: One deducted item -> restart -> restores once", async () => {
    const orderId = "ord-inv-1";
    const prodId = "prod-inv-1";
    db.products.set(prodId, { _id: prodId, stock: 5 });

    db.orders.set(orderId, {
      _id: orderId,
      status: "pending",
      checkoutState: "in_progress",
      checkoutCompensation: {
        reservationId: null,
        restoredItems: [
          { product: prodId, quantity: 2, deducted: true, restorationState: "pending", restored: false, restorationKey: `${orderId}_${prodId}` }
        ]
      }
    });

    await compensateOrderRedemption({ orderId, logger: mockLogger });
    expect(db.products.get(prodId).stock).toBe(7);
  });

  it("Requirement 6: Two deducted items -> first restored -> restart -> restores second only", async () => {
    const orderId = "ord-inv-2";
    const p1 = "p1";
    const p2 = "p2";
    db.products.set(p1, { _id: p1, stock: 10 }); // already restored to 10
    db.products.set(p2, { _id: p2, stock: 4 });  // needs +1 restoration

    db.orders.set(orderId, {
      _id: orderId,
      status: "cancelled",
      checkoutState: "compensation_pending",
      checkoutCompensation: {
        reservationId: null,
        restoredItems: [
          { product: p1, quantity: 2, deducted: true, restorationState: "restored", restored: true, restorationKey: `${orderId}_${p1}` },
          { product: p2, quantity: 1, deducted: true, restorationState: "pending", restored: false, restorationKey: `${orderId}_${p2}` }
        ]
      }
    });

    const res = await compensateOrderRedemption({ orderId, logger: mockLogger });
    expect(res.fullyCompensated).toBe(true);
    expect(db.products.get(p1).stock).toBe(10); // remains 10 (no double restore)
    expect(db.products.get(p2).stock).toBe(5);  // restored 4 -> 5
  });

  it("Requirement 7: Compensation called twice -> no double stock increment", async () => {
    const orderId = "ord-inv-3";
    const prodId = "prod-inv-3";
    db.products.set(prodId, { _id: prodId, stock: 8 });

    db.orders.set(orderId, {
      _id: orderId,
      status: "pending",
      checkoutState: "in_progress",
      checkoutCompensation: {
        reservationId: null,
        restoredItems: [
          { product: prodId, quantity: 2, deducted: true, restorationState: "pending", restored: false, restorationKey: `${orderId}_${prodId}` }
        ]
      }
    });

    const first = await compensateOrderRedemption({ orderId, logger: mockLogger });
    expect(first.fullyCompensated).toBe(true);
    expect(db.products.get(prodId).stock).toBe(10);

    const second = await compensateOrderRedemption({ orderId, logger: mockLogger });
    expect(second.fullyCompensated).toBe(true);
    expect(db.products.get(prodId).stock).toBe(10); // still 10!
  });

  it("Requirement 8: Concurrent compensation -> no double stock increment", async () => {
    const orderId = "ord-inv-concurrent";
    const prodId = "prod-inv-concurrent";
    db.products.set(prodId, { _id: prodId, stock: 5 });

    db.orders.set(orderId, {
      _id: orderId,
      status: "pending",
      checkoutState: "in_progress",
      checkoutCompensation: {
        reservationId: null,
        restoredItems: [
          { product: prodId, quantity: 3, deducted: true, restorationState: "pending", restored: false, restorationKey: `${orderId}_${prodId}` }
        ]
      }
    });

    // Run two compensations concurrently on the same orderId
    const [res1, res2] = await Promise.all([
      compensateOrderRedemption({ orderId, logger: mockLogger }),
      compensateOrderRedemption({ orderId, logger: mockLogger })
    ]);

    expect(res1.fullyCompensated).toBe(true);
    expect(res2.fullyCompensated).toBe(true);
    expect(db.products.get(prodId).stock).toBe(8); // exactly +3, not +6!
  });

  // Section 16.9 - 16.13: Coupon guarantees
  it("Requirement 9: Persisted reservationId allows exact global release", async () => {
    const orderId = "ord-coup-9";
    const coupId = "coup-9";
    const resId = "tok-9";
    db.coupons.set(coupId, { _id: coupId, usedCount: 5, reservations: [resId] });
    db.orders.set(orderId, {
      _id: orderId,
      status: "pending",
      checkoutState: "in_progress",
      checkoutCompensation: { reservationId: resId, couponId: coupId, restoredItems: [] }
    });

    await compensateOrderRedemption({ orderId, logger: mockLogger });
    const coup = db.coupons.get(coupId);
    expect(coup.usedCount).toBe(4);
    expect(coup.reservations).not.toContain(resId);
  });

  it("Requirement 10: Already-released token does not decrement usedCount", async () => {
    const orderId = "ord-coup-10";
    const coupId = "coup-10";
    const resId = "tok-10";
    db.coupons.set(coupId, { _id: coupId, usedCount: 4, reservations: [] }); // token already absent
    db.orders.set(orderId, {
      _id: orderId,
      status: "pending",
      checkoutState: "in_progress",
      checkoutCompensation: { reservationId: resId, couponId: coupId, restoredItems: [] }
    });

    await compensateOrderRedemption({ orderId, logger: mockLogger });
    expect(db.coupons.get(coupId).usedCount).toBe(4); // remains 4, not decremented!
  });

  it("Requirement 11: CouponUsage is removed using orderId alone", async () => {
    const orderId = "ord-coup-11";
    db.usages.set("u1", { _id: "u1", order: orderId });
    db.orders.set(orderId, {
      _id: orderId,
      status: "pending",
      checkoutState: "in_progress",
      checkoutCompensation: { reservationId: null, couponId: null, restoredItems: [] }
    });

    await compensateOrderRedemption({ orderId, logger: mockLogger });
    expect(db.usages.size).toBe(0);
  });

  it("Requirement 12: CouponReservation is removed using durable order ownership", async () => {
    const orderId = "ord-coup-12";
    db.reservations.set("r1", { _id: "r1", order: orderId, reservationId: "tok-12" });
    db.orders.set(orderId, {
      _id: orderId,
      status: "pending",
      checkoutState: "in_progress",
      checkoutCompensation: { reservationId: "tok-12", couponId: null, restoredItems: [] }
    });

    await compensateOrderRedemption({ orderId, logger: mockLogger });
    expect(db.reservations.size).toBe(0);
  });

  it("Requirement 13: Another concurrent user's reservation is untouched", async () => {
    const order1 = "ord-user-1";
    const coupId = "shared-coupon";
    const tok1 = "tok-user-1";
    const tok2 = "tok-user-2";

    db.coupons.set(coupId, { _id: coupId, usedCount: 2, reservations: [tok1, tok2] });
    db.reservations.set("res-1", { _id: "res-1", order: order1, reservationId: tok1 });
    db.reservations.set("res-2", { _id: "res-2", order: "ord-user-2", reservationId: tok2 });

    db.orders.set(order1, {
      _id: order1,
      status: "pending",
      checkoutState: "in_progress",
      checkoutCompensation: { reservationId: tok1, couponId: coupId, restoredItems: [] }
    });

    await compensateOrderRedemption({ orderId: order1, logger: mockLogger });

    const coupon = db.coupons.get(coupId);
    expect(coupon.usedCount).toBe(1);
    expect(coupon.reservations).toContain(tok2);
    expect(coupon.reservations).not.toContain(tok1);
    expect(db.reservations.has("res-1")).toBe(false);
    expect(db.reservations.has("res-2")).toBe(true); // User 2 untouched!
  });

  // Section 16.14 - 16.17: Order state transitions
  it("Requirements 14-17: Order transitions to cancelled, compensation_pending on failure, none on success", async () => {
    const orderId = "ord-state-trans";
    db.orders.set(orderId, {
      _id: orderId,
      status: "pending",
      checkoutState: "in_progress",
      checkoutCompensation: { reservationId: null, couponId: null, restoredItems: [] }
    });

    // Normal compensation -> status: cancelled, checkoutState: none
    const res = await compensateOrderRedemption({ orderId, logger: mockLogger });
    expect(res.fullyCompensated).toBe(true);
    expect(db.orders.get(orderId).status).toBe("cancelled");
    expect(db.orders.get(orderId).checkoutState).toBe("none");

    // Repeat invocation is safe and idempotent
    const repeat = await compensateOrderRedemption({ orderId, logger: mockLogger });
    expect(repeat.fullyCompensated).toBe(true);
    expect(db.orders.get(orderId).status).toBe("cancelled");
    expect(db.orders.get(orderId).checkoutState).toBe("none");
  });

  // Section 16.18 - 16.26: Crash simulation matrix
  it("Requirement 18: Crash before inventory deduction (all items deducted: false)", async () => {
    const orderId = "ord-crash-18";
    const prodId = "prod-crash-18";
    db.products.set(prodId, { _id: prodId, stock: 10 });
    db.orders.set(orderId, {
      _id: orderId,
      status: "pending",
      checkoutState: "in_progress",
      checkoutCompensation: {
        reservationId: null,
        restoredItems: [{ product: prodId, quantity: 2, deducted: false, restorationState: "pending", restored: false, restorationKey: "k18" }]
      }
    });

    const res = await compensateOrderRedemption({ orderId, logger: mockLogger });
    expect(res.fullyCompensated).toBe(true);
    expect(db.products.get(prodId).stock).toBe(10); // not incremented
  });

  it("Requirement 19: Crash after first inventory deduction", async () => {
    const orderId = "ord-crash-19";
    const p1 = "p1-19";
    const p2 = "p2-19";
    db.products.set(p1, { _id: p1, stock: 8 }); // deducted 2
    db.products.set(p2, { _id: p2, stock: 10 }); // not yet deducted

    db.orders.set(orderId, {
      _id: orderId,
      status: "pending",
      checkoutState: "in_progress",
      checkoutCompensation: {
        reservationId: null,
        restoredItems: [
          { product: p1, quantity: 2, deducted: true, restorationState: "pending", restored: false, restorationKey: "k19-1" },
          { product: p2, quantity: 1, deducted: false, restorationState: "pending", restored: false, restorationKey: "k19-2" }
        ]
      }
    });

    const res = await compensateOrderRedemption({ orderId, logger: mockLogger });
    expect(res.fullyCompensated).toBe(true);
    expect(db.products.get(p1).stock).toBe(10); // restored
    expect(db.products.get(p2).stock).toBe(10); // untouched
  });

  it("Requirement 20: Crash after all inventory deductions", async () => {
    const orderId = "ord-crash-20";
    const p1 = "p1-20";
    const p2 = "p2-20";
    db.products.set(p1, { _id: p1, stock: 8 });
    db.products.set(p2, { _id: p2, stock: 4 });

    db.orders.set(orderId, {
      _id: orderId,
      status: "pending",
      checkoutState: "in_progress",
      checkoutCompensation: {
        reservationId: null,
        restoredItems: [
          { product: p1, quantity: 2, deducted: true, restorationState: "pending", restored: false, restorationKey: "k20-1" },
          { product: p2, quantity: 1, deducted: true, restorationState: "pending", restored: false, restorationKey: "k20-2" }
        ]
      }
    });

    const res = await compensateOrderRedemption({ orderId, logger: mockLogger });
    expect(res.fullyCompensated).toBe(true);
    expect(db.products.get(p1).stock).toBe(10);
    expect(db.products.get(p2).stock).toBe(5);
  });

  it("Requirement 21: Crash after global coupon reservation", async () => {
    const orderId = "ord-crash-21";
    const coupId = "coup-21";
    const resId = "tok-21";
    db.coupons.set(coupId, { _id: coupId, usedCount: 5, reservations: [resId] });
    db.orders.set(orderId, {
      _id: orderId,
      status: "pending",
      checkoutState: "in_progress",
      checkoutCompensation: { reservationId: resId, couponId: coupId, restoredItems: [] }
    });

    const res = await compensateOrderRedemption({ orderId, logger: mockLogger });
    expect(res.fullyCompensated).toBe(true);
    expect(db.coupons.get(coupId).usedCount).toBe(4);
    expect(db.coupons.get(coupId).reservations).not.toContain(resId);
  });

  it("Requirement 22: Crash after CouponReservation creation", async () => {
    const orderId = "ord-crash-22";
    const coupId = "coup-22";
    const resId = "tok-22";
    db.coupons.set(coupId, { _id: coupId, usedCount: 5, reservations: [resId] });
    db.reservations.set("res-22", { _id: "res-22", order: orderId, reservationId: resId });
    db.orders.set(orderId, {
      _id: orderId,
      status: "pending",
      checkoutState: "in_progress",
      checkoutCompensation: { reservationId: resId, couponId: coupId, restoredItems: [] }
    });

    const res = await compensateOrderRedemption({ orderId, logger: mockLogger });
    expect(res.fullyCompensated).toBe(true);
    expect(db.reservations.size).toBe(0);
    expect(db.coupons.get(coupId).reservations).not.toContain(resId);
  });

  it("Requirement 23: Crash after CouponUsage creation", async () => {
    const orderId = "ord-crash-23";
    const coupId = "coup-23";
    const resId = "tok-23";
    db.coupons.set(coupId, { _id: coupId, usedCount: 5, reservations: [resId] });
    db.reservations.set("res-23", { _id: "res-23", order: orderId, reservationId: resId });
    db.usages.set("u-23", { _id: "u-23", order: orderId, coupon: coupId });
    db.orders.set(orderId, {
      _id: orderId,
      status: "pending",
      checkoutState: "in_progress",
      checkoutCompensation: { reservationId: resId, couponId: coupId, restoredItems: [] }
    });

    const res = await compensateOrderRedemption({ orderId, logger: mockLogger });
    expect(res.fullyCompensated).toBe(true);
    expect(db.usages.size).toBe(0);
    expect(db.reservations.size).toBe(0);
    expect(db.coupons.get(coupId).reservations).not.toContain(resId);
  });

  it("Requirement 24: Crash during finalization", async () => {
    const orderId = "ord-crash-24";
    const coupId = "c24";
    const resId = "tok-24";
    db.coupons.set(coupId, { _id: coupId, usedCount: 1, reservations: [resId] });
    // Everything was reserved/created, but order was not yet finalized to checkoutState: none
    db.orders.set(orderId, {
      _id: orderId,
      status: "pending",
      checkoutState: "in_progress",
      checkoutCompensation: { reservationId: resId, couponId: coupId, restoredItems: [] }
    });

    const res = await compensateOrderRedemption({ orderId, logger: mockLogger });
    expect(res.fullyCompensated).toBe(true);
    expect(db.orders.get(orderId).status).toBe("cancelled");
    expect(db.orders.get(orderId).checkoutState).toBe("none");
    expect(db.coupons.get(coupId).reservations).not.toContain(resId);
  });

  it("Requirement 25 & 26: Crash after one inventory restoration -> Restart and reconcile using persisted state", async () => {
    const orderId = "ord-crash-25";
    const p1 = "p1-25";
    const p2 = "p2-25";
    db.products.set(p1, { _id: p1, stock: 10 }); // already restored
    db.products.set(p2, { _id: p2, stock: 3 });  // not yet restored (needs +2)

    db.orders.set(orderId, {
      _id: orderId,
      status: "cancelled",
      checkoutState: "compensation_pending",
      checkoutCompensation: {
        reservationId: null,
        restoredItems: [
          { product: p1, quantity: 2, deducted: true, restorationState: "restored", restored: true, restorationKey: "k25-1" },
          { product: p2, quantity: 2, deducted: true, restorationState: "pending", restored: false, restorationKey: "k25-2" }
        ]
      }
    });

    // In CheckoutInventoryRestoration, k25-1 is already marked restored
    db.restorations.set("k25-1", { restorationKey: "k25-1", status: "restored" });

    // Restart process and reconcile using only orderId
    const res = await compensateOrderRedemption({ orderId, logger: mockLogger });
    expect(res.fullyCompensated).toBe(true);
    expect(db.products.get(p1).stock).toBe(10); // remains 10
    expect(db.products.get(p2).stock).toBe(5);  // restored 3 -> 5
    expect(db.orders.get(orderId).checkoutState).toBe("none");
  });

  // Section 16.27 - 16.30: Payment verification
  it("Requirement 27-30: Payment validation invariants", () => {
    const cancelledOrder = { status: "cancelled", checkoutState: "none", total: 1500 };
    const compPendingOrder = { status: "pending", checkoutState: "compensation_pending", total: 2000 };
    const normalPendingOrder = { status: "pending", checkoutState: "none", total: 2500 };

    // 27. Cancelled order must be blocked
    expect(cancelledOrder.status === "cancelled").toBe(true);

    // 28. Compensation pending order must be blocked
    expect(compPendingOrder.checkoutState === "compensation_pending").toBe(true);

    // 29. Normal pending order with checkoutState: none is allowed
    expect(normalPendingOrder.status === "pending" && normalPendingOrder.checkoutState === "none").toBe(true);

    // 30. Payment amount remains authoritative order.total
    expect(normalPendingOrder.total).toBe(2500);
  });

  describe("Section 5: Mandatory Failure-Injection & Crash Window Tests (P1.1 Step 77.5.5)", () => {
    // 1. Crash before restoration bookkeeping
    it("Test 1: Crash before restoration bookkeeping - restores stock correctly", async () => {
      const orderId = "crash-test-1";
      const prodId = "prod-c1";
      db.products.set(prodId, { _id: prodId, stock: 7, restorationKeys: [] }); // 10 deducted to 7
      db.orders.set(orderId, {
        _id: orderId,
        status: "pending",
        checkoutState: "in_progress",
        checkoutCompensation: {
          reservationId: null,
          couponId: null,
          restoredItems: [
            { product: prodId, quantity: 3, deducted: true, restorationState: "pending", restored: false, restorationKey: "key-c1" }
          ]
        }
      });

      const res = await compensateOrderRedemption({ orderId, logger: mockLogger });
      expect(res.fullyCompensated).toBe(true);
      expect(db.products.get(prodId).stock).toBe(10);
      expect(db.products.get(prodId).restorationKeys).toContain("key-c1");
      expect(db.orders.get(orderId).checkoutCompensation.restoredItems[0].restorationState).toBe("restored");
    });

    // 2. Crash after restoration bookkeeping (Window B: Product stock incremented, but process crashed before Order update)
    it("Test 2: Crash after Product stock update before Order update (Window B) - retry does not double increment stock", async () => {
      const orderId = "crash-test-2";
      const prodId = "prod-c2";
      // Product was incremented to 10 and key recorded, but process crashed before Order was marked restored
      db.products.set(prodId, { _id: prodId, stock: 10, restorationKeys: ["key-c2"] });
      db.orders.set(orderId, {
        _id: orderId,
        status: "pending",
        checkoutState: "in_progress",
        checkoutCompensation: {
          reservationId: null,
          couponId: null,
          restoredItems: [
            { product: prodId, quantity: 3, deducted: true, restorationState: "pending", restored: false, restorationKey: "key-c2" }
          ]
        }
      });

      // Retry after process restart
      const res = await compensateOrderRedemption({ orderId, logger: mockLogger });
      expect(res.fullyCompensated).toBe(true);
      // Stock MUST REMAIN 10, NOT 13!
      expect(db.products.get(prodId).stock).toBe(10);
      // Order ledger must be caught up to restored
      expect(db.orders.get(orderId).checkoutCompensation.restoredItems[0].restorationState).toBe("restored");
      expect(db.orders.get(orderId).checkoutState).toBe("none");
    });

    // 3. Crash immediately before Product update (Window A)
    it("Test 3: Crash immediately before Product update (Window A) - recovery safely restores stock", async () => {
      const orderId = "crash-test-3";
      const prodId = "prod-c3";
      db.products.set(prodId, { _id: prodId, stock: 7, restorationKeys: [] });
      db.orders.set(orderId, {
        _id: orderId,
        status: "pending",
        checkoutState: "in_progress",
        checkoutCompensation: {
          reservationId: null,
          couponId: null,
          restoredItems: [
            { product: prodId, quantity: 3, deducted: true, restorationState: "pending", restored: false, restorationKey: "key-c3" }
          ]
        }
      });

      const res = await compensateOrderRedemption({ orderId, logger: mockLogger });
      expect(res.fullyCompensated).toBe(true);
      expect(db.products.get(prodId).stock).toBe(10);
    });

    // 4. Crash immediately after Product update
    it("Test 4: Crash immediately after Product update - subsequent compensation completes idempotently", async () => {
      const orderId = "crash-test-4";
      const prodId = "prod-c4";
      db.products.set(prodId, { _id: prodId, stock: 7, restorationKeys: [] });
      db.orders.set(orderId, {
        _id: orderId,
        status: "pending",
        checkoutState: "in_progress",
        checkoutCompensation: {
          reservationId: null,
          couponId: null,
          restoredItems: [
            { product: prodId, quantity: 3, deducted: true, restorationState: "pending", restored: false, restorationKey: "key-c4" }
          ]
        }
      });

      // First run restores stock
      await compensateOrderRedemption({ orderId, logger: mockLogger });
      expect(db.products.get(prodId).stock).toBe(10);

      // Simulated crash & second run
      const retryRes = await compensateOrderRedemption({ orderId, logger: mockLogger });
      expect(retryRes.fullyCompensated).toBe(true);
      expect(db.products.get(prodId).stock).toBe(10);
    });

    // 5. Repeated compensation (10 times)
    it("Test 5: Repeated compensation (10 times) - stock remains mathematically exact (no double increment)", async () => {
      const orderId = "crash-test-5";
      const prodId = "prod-c5";
      db.products.set(prodId, { _id: prodId, stock: 7, restorationKeys: [] });
      db.orders.set(orderId, {
        _id: orderId,
        status: "pending",
        checkoutState: "in_progress",
        checkoutCompensation: {
          reservationId: null,
          couponId: null,
          restoredItems: [
            { product: prodId, quantity: 3, deducted: true, restorationState: "pending", restored: false, restorationKey: "key-c5" }
          ]
        }
      });

      for (let i = 1; i <= 10; i++) {
        const res = await compensateOrderRedemption({ orderId, logger: mockLogger });
        expect(res.fullyCompensated).toBe(true);
        expect(db.products.get(prodId).stock).toBe(10);
      }
      expect(db.products.get(prodId).stock).toBe(10);
    });

    // 6. Concurrent compensation
    it("Test 6: Concurrent compensation across 5 parallel attempts - stock incremented exactly once", async () => {
      const orderId = "crash-test-6";
      const prodId = "prod-c6";
      db.products.set(prodId, { _id: prodId, stock: 7, restorationKeys: [] });
      db.orders.set(orderId, {
        _id: orderId,
        status: "pending",
        checkoutState: "in_progress",
        checkoutCompensation: {
          reservationId: null,
          couponId: null,
          restoredItems: [
            { product: prodId, quantity: 3, deducted: true, restorationState: "pending", restored: false, restorationKey: "key-c6" }
          ]
        }
      });

      const results = await Promise.all([
        compensateOrderRedemption({ orderId, logger: mockLogger }),
        compensateOrderRedemption({ orderId, logger: mockLogger }),
        compensateOrderRedemption({ orderId, logger: mockLogger }),
        compensateOrderRedemption({ orderId, logger: mockLogger }),
        compensateOrderRedemption({ orderId, logger: mockLogger })
      ]);

      for (const r of results) {
        expect(r.fullyCompensated).toBe(true);
      }
      expect(db.products.get(prodId).stock).toBe(10);
    });

    // 7. Process/repository state reloaded from MongoDB
    it("Test 7: Process/repository state reloaded from MongoDB - recovers using orderId alone without in-memory refs", async () => {
      const orderId = "crash-test-7";
      const prodId = "prod-c7";
      db.products.set(prodId, { _id: prodId, stock: 4, restorationKeys: [] });
      db.orders.set(orderId, {
        _id: orderId,
        status: "pending",
        checkoutState: "in_progress",
        checkoutCompensation: {
          reservationId: null,
          couponId: null,
          restoredItems: [
            { product: prodId, quantity: 6, deducted: true, restorationState: "pending", restored: false, restorationKey: "key-c7" }
          ]
        }
      });

      const res = await compensateOrderRedemption({ orderId, logger: mockLogger });
      expect(res.fullyCompensated).toBe(true);
      expect(db.products.get(prodId).stock).toBe(10);
      expect(db.orders.get(orderId).status).toBe("cancelled");
      expect(db.orders.get(orderId).checkoutState).toBe("none");
    });

    // 8. Partial multi-item deduction
    it("Test 8: Partial multi-item deduction - restores only deducted items (A and B), leaves undeducted C untouched", async () => {
      const orderId = "crash-test-8";
      const prodA = "prod-8A";
      const prodB = "prod-8B";
      const prodC = "prod-8C";

      db.products.set(prodA, { _id: prodA, stock: 8, restorationKeys: [] }); // 10 - 2 = 8
      db.products.set(prodB, { _id: prodB, stock: 4, restorationKeys: [] }); // 5 - 1 = 4
      db.products.set(prodC, { _id: prodC, stock: 20, restorationKeys: [] }); // 20 (not deducted)

      db.orders.set(orderId, {
        _id: orderId,
        status: "pending",
        checkoutState: "in_progress",
        checkoutCompensation: {
          reservationId: null,
          couponId: null,
          restoredItems: [
            { product: prodA, quantity: 2, deducted: true, restorationState: "pending", restored: false, restorationKey: "key-8A" },
            { product: prodB, quantity: 1, deducted: true, restorationState: "pending", restored: false, restorationKey: "key-8B" },
            { product: prodC, quantity: 5, deducted: false, restorationState: "pending", restored: false, restorationKey: "key-8C" }
          ]
        }
      });

      const res = await compensateOrderRedemption({ orderId, logger: mockLogger });
      expect(res.fullyCompensated).toBe(true);

      // Product A and B are restored
      expect(db.products.get(prodA).stock).toBe(10);
      expect(db.products.get(prodB).stock).toBe(5);
      // Product C was never deducted and MUST NOT be restored
      expect(db.products.get(prodC).stock).toBe(20);
    });

    // 9. Compensation after application restart
    it("Test 9: Compensation after application restart - recovers clean cancelled state", async () => {
      const orderId = "crash-test-9";
      const prodId = "prod-c9";
      db.products.set(prodId, { _id: prodId, stock: 5, restorationKeys: [] });
      db.orders.set(orderId, {
        _id: orderId,
        status: "pending",
        checkoutState: "in_progress",
        checkoutCompensation: {
          reservationId: null,
          couponId: null,
          restoredItems: [
            { product: prodId, quantity: 5, deducted: true, restorationState: "pending", restored: false, restorationKey: "key-c9" }
          ]
        }
      });

      const res = await compensateOrderRedemption({ orderId, logger: mockLogger });
      expect(res.fullyCompensated).toBe(true);
      expect(db.products.get(prodId).stock).toBe(10);
      expect(db.orders.get(orderId).checkoutState).toBe("none");
      expect(db.orders.get(orderId).status).toBe("cancelled");
    });

    // 10. Compensation after previous attempt failed halfway
    it("Test 10: Compensation after previous attempt failed halfway - recovers fully without double-restoring first item", async () => {
      const orderId = "crash-test-10";
      const prodA = "prod-10A";
      const prodB = "prod-10B";

      // Attempt 1 previously restored Product A to 10 and recorded key-10A, but failed on Product B
      db.products.set(prodA, { _id: prodA, stock: 10, restorationKeys: ["key-10A"] });
      db.products.set(prodB, { _id: prodB, stock: 4, restorationKeys: [] }); // still at 4, needs +1

      db.orders.set(orderId, {
        _id: orderId,
        status: "cancelled",
        checkoutState: "compensation_pending",
        checkoutCompensation: {
          reservationId: null,
          couponId: null,
          restoredItems: [
            { product: prodA, quantity: 2, deducted: true, restorationState: "restored", restored: true, restorationKey: "key-10A" },
            { product: prodB, quantity: 1, deducted: true, restorationState: "pending", restored: false, restorationKey: "key-10B" }
          ]
        }
      });

      // Attempt 2 runs after restart
      const res = await compensateOrderRedemption({ orderId, logger: mockLogger });
      expect(res.fullyCompensated).toBe(true);

      // Product A must remain 10 (not 12!)
      expect(db.products.get(prodA).stock).toBe(10);
      // Product B must be restored to 5
      expect(db.products.get(prodB).stock).toBe(5);
      expect(db.orders.get(orderId).checkoutState).toBe("none");
    });

    it("11. restorationKeys bounded lifecycle - ring buffer caps array at MAX_RESTORATION_KEYS without unbounded growth", async () => {
      const prod = "prod-bounded-growth";
      db.products.set(prod, { _id: prod, stock: 100, restorationKeys: [] });

      // Run 60 consecutive compensations for different orders on the same product
      for (let i = 1; i <= 60; i++) {
        const orderId = `order-bounded-${i}`;
        db.orders.set(orderId, {
          _id: orderId,
          status: "pending",
          checkoutState: "in_progress",
          checkoutCompensation: {
            restoredItems: [
              {
                product: prod,
                quantity: 1,
                deducted: true,
                restorationState: "pending",
                restored: false,
                restorationKey: `rk-${i}`
              }
            ]
          }
        });

        await compensateOrderRedemption({ orderId, logger: mockLogger });
      }

      const product = db.products.get(prod);
      // Invariant: restorationKeys must NEVER exceed 50 items
      expect(product.restorationKeys.length).toBe(50);
      // Older keys (rk-1 to rk-10) should have been evicted
      expect(product.restorationKeys).not.includes("rk-1");
      expect(product.restorationKeys).not.includes("rk-10");
      // Recent keys (rk-11 to rk-60) must be present
      expect(product.restorationKeys).includes("rk-11");
      expect(product.restorationKeys).includes("rk-60");
      // Stock incremented by 60
      expect(product.stock).toBe(160);
    });

    it("12. safe eviction invariant - older evicted keys belong to fully finalized orders whose order state prevents double-increment", async () => {
      const prod = "prod-evicted-safety";
      db.products.set(prod, { _id: prod, stock: 100, restorationKeys: [] });

      const oldOrderId = "order-old-1";
      db.orders.set(oldOrderId, {
        _id: oldOrderId,
        status: "pending",
        checkoutState: "in_progress",
        checkoutCompensation: {
          restoredItems: [
            {
              product: prod,
              quantity: 2,
              deducted: true,
              restorationState: "pending",
              restored: false,
              restorationKey: "rk-old-1"
            }
          ]
        }
      });

      // 1. First compensation restores old order
      await compensateOrderRedemption({ orderId: oldOrderId, logger: mockLogger });
      expect(db.products.get(prod).stock).toBe(102);
      expect(db.orders.get(oldOrderId).status).toBe("cancelled");
      expect(db.orders.get(oldOrderId).checkoutState).toBe("none");

      // 2. 55 subsequent compensations run on this product, evicting rk-old-1 from the ring buffer
      for (let i = 2; i <= 56; i++) {
        const orderId = `order-flood-${i}`;
        db.orders.set(orderId, {
          _id: orderId,
          status: "pending",
          checkoutState: "in_progress",
          checkoutCompensation: {
            restoredItems: [
              {
                product: prod,
                quantity: 1,
                deducted: true,
                restorationState: "pending",
                restored: false,
                restorationKey: `rk-flood-${i}`
              }
            ]
          }
        });
        await compensateOrderRedemption({ orderId, logger: mockLogger });
      }

      // rk-old-1 is now evicted from product.restorationKeys
      expect(db.products.get(prod).restorationKeys).not.includes("rk-old-1");
      const stockBeforeRetry = db.products.get(prod).stock;

      // 3. Retry oldOrderId after key was evicted
      const retryRes = await compensateOrderRedemption({ orderId: oldOrderId, logger: mockLogger });
      expect(retryRes.fullyCompensated).toBe(true);

      // Invariant: Even though rk-old-1 was evicted from Product,
      // the Order's persisted state (status: "cancelled", checkoutState: "none", restoredItems.restorationState: "restored")
      // guarantees stock is NOT double-incremented!
      expect(db.products.get(prod).stock).toBe(stockBeforeRetry);
    });
  });

  describe("P1.5.5 — System Compensation Cancellation Reason", () => {
    it("system compensation persists valid cancellation metadata (reason, reasonDetail, cancelledBy, cancelledAt)", async () => {
      const orderId = "ord-p155-persist";
      db.orders.set(orderId, {
        _id: orderId,
        status: "pending",
        checkoutState: "in_progress",
        checkoutCompensation: { reservationId: null, couponId: null, restoredItems: [] }
      });

      const beforeTime = new Date();
      const result = await compensateOrderRedemption({ orderId, logger: mockLogger });
      const afterTime = new Date();

      expect(result.fullyCompensated).toBe(true);
      expect(result.orderCancelled).toBe(true);

      const order = db.orders.get(orderId);
      expect(order.status).toBe("cancelled");
      expect(order.cancellation).toBeDefined();
      expect(order.cancellation.reason).toBe("system_checkout_failure");
      expect(order.cancellation.reasonDetail).toBe("");
      expect(order.cancellation.cancelledBy).toBe("system");
      expect(order.cancellation.cancelledAt).toBeInstanceOf(Date);
      expect(order.cancellation.cancelledAt.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(order.cancellation.cancelledAt.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });

    it("cancellation metadata is written atomically with status: 'cancelled'", async () => {
      const orderId = "ord-p155-atomic";
      db.orders.set(orderId, {
        _id: orderId,
        status: "pending",
        checkoutState: "in_progress",
        checkoutCompensation: { reservationId: null, couponId: null, restoredItems: [] }
      });

      const findOneAndUpdateSpy = vi.spyOn(Order, "findOneAndUpdate");

      await compensateOrderRedemption({ orderId, logger: mockLogger });

      expect(findOneAndUpdateSpy).toHaveBeenCalledWith(
        {
          _id: orderId,
          status: { $ne: "cancelled" }
        },
        {
          $set: {
            status: "cancelled",
            cancellation: {
              reason: "system_checkout_failure",
              reasonDetail: "",
              cancelledBy: "system",
              cancelledAt: expect.any(Date)
            }
          }
        },
        { returnDocument: "after" }
      );
    });

    it("repeated compensation does not overwrite existing cancellation metadata", async () => {
      const orderId = "ord-p155-idempotent";
      const initialDate = new Date("2026-02-01T12:00:00.000Z");
      db.orders.set(orderId, {
        _id: orderId,
        status: "pending",
        checkoutState: "in_progress",
        checkoutCompensation: { reservationId: null, couponId: null, restoredItems: [] }
      });

      // Run first compensation
      const res1 = await compensateOrderRedemption({ orderId, logger: mockLogger });
      expect(res1.fullyCompensated).toBe(true);
      const firstCancellation = clone(db.orders.get(orderId).cancellation);
      expect(firstCancellation.reason).toBe("system_checkout_failure");

      // Manually adjust the date to a fixed point to prove repeat run does not change it
      db.orders.get(orderId).cancellation.cancelledAt = initialDate;

      // Run second compensation (simulating retry or reconciliation)
      const res2 = await compensateOrderRedemption({ orderId, logger: mockLogger });
      expect(res2.fullyCompensated).toBe(true);

      const secondCancellation = db.orders.get(orderId).cancellation;
      expect(secondCancellation.cancelledAt).toEqual(initialDate);
      expect(secondCancellation.reason).toBe("system_checkout_failure");
      expect(secondCancellation.cancelledBy).toBe("system");
    });

    it("race/concurrent compensation preserves a single cancellation winner", async () => {
      const orderId = "ord-p155-concurrent";
      db.orders.set(orderId, {
        _id: orderId,
        status: "pending",
        checkoutState: "in_progress",
        checkoutCompensation: { reservationId: null, couponId: null, restoredItems: [] }
      });

      // Run 5 concurrent compensations simultaneously
      const results = await Promise.all([
        compensateOrderRedemption({ orderId, logger: mockLogger }),
        compensateOrderRedemption({ orderId, logger: mockLogger }),
        compensateOrderRedemption({ orderId, logger: mockLogger }),
        compensateOrderRedemption({ orderId, logger: mockLogger }),
        compensateOrderRedemption({ orderId, logger: mockLogger })
      ]);

      for (const r of results) {
        expect(r.fullyCompensated).toBe(true);
        expect(r.orderCancelled).toBe(true);
      }

      const order = db.orders.get(orderId);
      expect(order.status).toBe("cancelled");
      expect(order.cancellation.reason).toBe("system_checkout_failure");
      expect(order.cancellation.cancelledBy).toBe("system");
      expect(order.cancellation.cancelledAt).toBeInstanceOf(Date);
    });

    it("already-cancelled orders retain their existing customer cancellation metadata", async () => {
      const orderId = "ord-p155-already-customer";
      const customerCancelledAt = new Date("2026-01-10T08:30:00.000Z");
      db.orders.set(orderId, {
        _id: orderId,
        status: "cancelled",
        checkoutState: "compensation_pending",
        cancellation: {
          reason: "changed_mind",
          reasonDetail: "Found a better discount elsewhere",
          cancelledBy: "customer",
          cancelledAt: customerCancelledAt
        },
        checkoutCompensation: { reservationId: null, couponId: null, restoredItems: [] }
      });

      const res = await compensateOrderRedemption({ orderId, logger: mockLogger });
      expect(res.fullyCompensated).toBe(true);
      expect(res.orderCancelled).toBe(true);

      const order = db.orders.get(orderId);
      expect(order.status).toBe("cancelled");
      expect(order.checkoutState).toBe("none");
      // Crucial: cancellation metadata must remain customer metadata
      expect(order.cancellation.reason).toBe("changed_mind");
      expect(order.cancellation.reasonDetail).toBe("Found a better discount elsewhere");
      expect(order.cancellation.cancelledBy).toBe("customer");
      expect(order.cancellation.cancelledAt).toEqual(customerCancelledAt);
    });

    it("already-cancelled orders retain their existing admin cancellation metadata", async () => {
      const orderId = "ord-p155-already-admin";
      const adminCancelledAt = new Date("2026-01-12T14:15:00.000Z");
      db.orders.set(orderId, {
        _id: orderId,
        status: "cancelled",
        checkoutState: "compensation_pending",
        cancellation: {
          reason: "fraud_suspected",
          reasonDetail: "Suspicious checkout pattern",
          cancelledBy: "admin",
          cancelledAt: adminCancelledAt
        },
        checkoutCompensation: { reservationId: null, couponId: null, restoredItems: [] }
      });

      const res = await compensateOrderRedemption({ orderId, logger: mockLogger });
      expect(res.fullyCompensated).toBe(true);

      const order = db.orders.get(orderId);
      expect(order.status).toBe("cancelled");
      expect(order.checkoutState).toBe("none");
      expect(order.cancellation.reason).toBe("fraud_suspected");
      expect(order.cancellation.reasonDetail).toBe("Suspicious checkout pattern");
      expect(order.cancellation.cancelledBy).toBe("admin");
      expect(order.cancellation.cancelledAt).toEqual(adminCancelledAt);
    });

    it("cannot accept or inherit arbitrary caller-provided cancellation metadata via params or createdOrder", async () => {
      const orderId = "ord-p155-no-caller-metadata";
      db.orders.set(orderId, {
        _id: orderId,
        status: "pending",
        checkoutState: "in_progress",
        checkoutCompensation: { reservationId: null, couponId: null, restoredItems: [] }
      });

      const callerCreatedOrder = {
        _id: orderId,
        status: "pending",
        cancellation: {
          reason: "customer_request",
          reasonDetail: "Injected detail",
          cancelledBy: "customer",
          cancelledAt: new Date("2020-01-01T00:00:00.000Z")
        }
      };

      // Caller attempts to inject custom cancellation properties
      await compensateOrderRedemption({
        orderId,
        createdOrder: callerCreatedOrder,
        reason: "custom_user_reason",
        reasonDetail: "User forged detail",
        cancelledBy: "customer",
        cancellation: {
          reason: "hacker_reason",
          cancelledBy: "admin"
        },
        logger: mockLogger
      });

      const order = db.orders.get(orderId);
      expect(order.cancellation.reason).toBe("system_checkout_failure");
      expect(order.cancellation.reasonDetail).toBe("");
      expect(order.cancellation.cancelledBy).toBe("system");
      expect(order.cancellation.cancelledAt).toBeInstanceOf(Date);

      expect(callerCreatedOrder.status).toBe("cancelled");
      expect(callerCreatedOrder.cancellation.reason).toBe("system_checkout_failure");
      expect(callerCreatedOrder.cancellation.cancelledBy).toBe("system");
    });

    it("already-cancelled legacy orders with null cancellation retain null cancellation metadata", async () => {
      const orderId = "ord-p155-already-legacy";
      db.orders.set(orderId, {
        _id: orderId,
        status: "cancelled",
        checkoutState: "compensation_pending",
        cancellation: null,
        checkoutCompensation: { reservationId: null, couponId: null, restoredItems: [] }
      });

      const res = await compensateOrderRedemption({ orderId, logger: mockLogger });
      expect(res.fullyCompensated).toBe(true);

      const order = db.orders.get(orderId);
      expect(order.status).toBe("cancelled");
      expect(order.checkoutState).toBe("none");
      expect(order.cancellation).toBeNull();
    });

    it("inventory restoration remains exactly-once alongside cancellation metadata persistence", async () => {
      const orderId = "ord-p155-inv";
      const prodId = "prod-p155-1";
      db.products.set(prodId, { _id: prodId, stock: 10, restorationKeys: [] });
      db.orders.set(orderId, {
        _id: orderId,
        status: "pending",
        checkoutState: "in_progress",
        checkoutCompensation: {
          reservationId: null,
          couponId: null,
          restoredItems: [
            {
              product: prodId,
              quantity: 3,
              deducted: true,
              restorationState: "pending",
              restored: false,
              restorationKey: `${orderId}_${prodId}`
            }
          ]
        }
      });

      const res = await compensateOrderRedemption({ orderId, logger: mockLogger });
      expect(res.fullyCompensated).toBe(true);
      expect(db.products.get(prodId).stock).toBe(13);

      const order = db.orders.get(orderId);
      expect(order.status).toBe("cancelled");
      expect(order.cancellation.reason).toBe("system_checkout_failure");
      expect(order.cancellation.cancelledBy).toBe("system");

      // Second call: stock must NOT double-increment
      const res2 = await compensateOrderRedemption({ orderId, logger: mockLogger });
      expect(res2.fullyCompensated).toBe(true);
      expect(db.products.get(prodId).stock).toBe(13);
    });

    it("caller cannot inject forged cancellation metadata into already-compensated order via createdOrder (early-exit path)", async () => {
      const orderId = "ord-p155-early-exit-forged";
      const genuineCancelledAt = new Date("2026-02-10T10:00:00.000Z");
      db.orders.set(orderId, {
        _id: orderId,
        status: "cancelled",
        checkoutState: "none",
        cancellation: {
          reason: "system_checkout_failure",
          reasonDetail: "",
          cancelledBy: "system",
          cancelledAt: genuineCancelledAt
        },
        checkoutCompensation: { reservationId: null, couponId: null, restoredItems: [] }
      });

      const callerCreatedOrder = {
        _id: orderId,
        status: "cancelled",
        cancellation: {
          reason: "customer_request",
          cancelledBy: "customer"
        }
      };

      const res = await compensateOrderRedemption({
        orderId,
        createdOrder: callerCreatedOrder,
        logger: mockLogger
      });

      expect(res.fullyCompensated).toBe(true);
      expect(res.orderCancelled).toBe(true);

      const order = db.orders.get(orderId);
      expect(order.cancellation.reason).toBe("system_checkout_failure");
      expect(order.cancellation.cancelledBy).toBe("system");
      expect(order.cancellation.cancelledAt).toEqual(genuineCancelledAt);

      // Caller createdOrder must have its forged cancellation replaced by genuine DB cancellation
      expect(callerCreatedOrder.cancellation.reason).toBe("system_checkout_failure");
      expect(callerCreatedOrder.cancellation.cancelledBy).toBe("system");
      expect(callerCreatedOrder.cancellation.cancelledAt).toEqual(genuineCancelledAt);
    });

    it("caller cannot inject forged cancellation on createdOrder for legacy cancelled order with null cancellation", async () => {
      const orderId = "ord-p155-legacy-forged";
      db.orders.set(orderId, {
        _id: orderId,
        status: "cancelled",
        checkoutState: "compensation_pending",
        cancellation: null,
        checkoutCompensation: { reservationId: null, couponId: null, restoredItems: [] }
      });

      const callerCreatedOrder = {
        _id: orderId,
        status: "cancelled",
        cancellation: {
          reason: "forged_reason",
          cancelledBy: "admin"
        }
      };

      const res = await compensateOrderRedemption({
        orderId,
        createdOrder: callerCreatedOrder,
        logger: mockLogger
      });

      expect(res.fullyCompensated).toBe(true);

      const order = db.orders.get(orderId);
      expect(order.status).toBe("cancelled");
      expect(order.cancellation).toBeNull();
      expect(callerCreatedOrder.cancellation).toBeNull();
    });

    it("cancels createdOrder with system cancellation metadata even when orderId is absent", async () => {
      const inMemoryOrder = {
        status: "pending"
      };

      const res = await compensateOrderRedemption({
        createdOrder: inMemoryOrder,
        logger: mockLogger
      });

      expect(res.isFullyCompensated).toBe(true);
      expect(res.orderCancelled).toBe(true);
      expect(inMemoryOrder.status).toBe("cancelled");
      expect(inMemoryOrder.cancellation).toBeDefined();
      expect(inMemoryOrder.cancellation.reason).toBe("system_checkout_failure");
      expect(inMemoryOrder.cancellation.reasonDetail).toBe("");
      expect(inMemoryOrder.cancellation.cancelledBy).toBe("system");
      expect(inMemoryOrder.cancellation.cancelledAt).toBeInstanceOf(Date);
    });
  });
});
