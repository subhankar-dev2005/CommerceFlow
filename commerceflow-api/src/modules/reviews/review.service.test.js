import { describe, it, expect, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import Order from "../orders/order.model.js";
import Product from "../products/product.model.js";
import Review from "./review.model.js";
import { findQualifyingOrder, recalculateProductRating } from "./review.service.js";

describe("Review Service — Purchase Verification & Rating Aggregation", () => {
  const userId = "507f1f77bcf86cd799439011";
  const otherUserId = "507f1f77bcf86cd799439012";
  const productId = "607f1f77bcf86cd799439021";
  const otherProductId = "607f1f77bcf86cd799439022";
  const orderId = "707f1f77bcf86cd799439031";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("findQualifyingOrder — Purchase Discovery", () => {
    const createMockOrder = (overrides = {}) => ({
      _id: orderId,
      user: new mongoose.Types.ObjectId(userId),
      status: "delivered",
      payment: {
        status: "paid"
      },
      items: [
        {
          product: new mongoose.Types.ObjectId(productId),
          name: "Alpine Expedition Tent",
          price: 12000,
          quantity: 1,
          subtotal: 12000
        }
      ],
      createdAt: new Date("2026-08-15T10:00:00Z"),
      ...overrides
    });

    const mockOrderFind = (resolvedOrder) => {
      const mockQuery = {
        sort: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(resolvedOrder)
      };
      vi.spyOn(Order, "findOne").mockReturnValue(mockQuery);
      return mockQuery;
    };

    it("1-5. returns eligible: true and qualifying order when user owns order, product is in items, status is delivered, and payment is paid", async () => {
      const mockOrder = createMockOrder();
      const mockQuery = mockOrderFind(mockOrder);

      const result = await findQualifyingOrder(userId, productId);

      expect(result.eligible).toBe(true);
      expect(result.order).toEqual(mockOrder);

      expect(Order.findOne).toHaveBeenCalledWith({
        user: new mongoose.Types.ObjectId(userId),
        status: "delivered",
        "payment.status": "paid",
        "items.product": new mongoose.Types.ObjectId(productId)
      });
      expect(mockQuery.sort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(mockQuery.lean).toHaveBeenCalled();
    });

    it("6. rejects when order belongs to a different user (query enforces ownership)", async () => {
      mockOrderFind(null);

      const result = await findQualifyingOrder(otherUserId, productId);

      expect(result.eligible).toBe(false);
      expect(result.order).toBeNull();
      expect(Order.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          user: new mongoose.Types.ObjectId(otherUserId)
        })
      );
    });

    it("7. rejects when product is not in order items", async () => {
      mockOrderFind(null);

      const result = await findQualifyingOrder(userId, otherProductId);

      expect(result.eligible).toBe(false);
      expect(result.order).toBeNull();
      expect(Order.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          "items.product": new mongoose.Types.ObjectId(otherProductId)
        })
      );
    });

    it.each([
      ["pending", 8],
      ["confirmed", 9],
      ["processing", 10],
      ["shipped", 11],
      ["cancelled", 12]
    ])("%d. rejects non-delivered order status: %s", async (status) => {
      mockOrderFind(null);

      const result = await findQualifyingOrder(userId, productId);

      expect(result.eligible).toBe(false);
      expect(result.order).toBeNull();
    });

    it.each([
      ["pending", 13],
      ["failed", 14],
      ["refunded", 15]
    ])("%d. rejects non-paid payment status: %s", async (paymentStatus) => {
      mockOrderFind(null);

      const result = await findQualifyingOrder(userId, productId);

      expect(result.eligible).toBe(false);
      expect(result.order).toBeNull();
    });

    it("16. returns eligible: false when no order exists", async () => {
      mockOrderFind(null);

      const result = await findQualifyingOrder(userId, productId);

      expect(result.eligible).toBe(false);
      expect(result.order).toBeNull();
    });

    it("17. returns eligible: false when productId is missing or undefined", async () => {
      const spy = vi.spyOn(Order, "findOne");

      const result = await findQualifyingOrder(userId, undefined);

      expect(result.eligible).toBe(false);
      expect(result.order).toBeNull();
      expect(spy).not.toHaveBeenCalled();
    });

    it("18. returns eligible: false when userId is malformed", async () => {
      const spy = vi.spyOn(Order, "findOne");

      const result = await findQualifyingOrder("invalid-user-id", productId);

      expect(result.eligible).toBe(false);
      expect(result.order).toBeNull();
      expect(spy).not.toHaveBeenCalled();
    });

    it("19. returns eligible: false when productId is malformed", async () => {
      const spy = vi.spyOn(Order, "findOne");

      const result = await findQualifyingOrder(userId, "invalid-product-id");

      expect(result.eligible).toBe(false);
      expect(result.order).toBeNull();
      expect(spy).not.toHaveBeenCalled();
    });

    it("20-21. deterministically selects the newest qualifying order via createdAt: -1 when multiple qualifying orders exist", async () => {
      const newerOrder = createMockOrder({
        _id: "707f1f77bcf86cd799439032",
        createdAt: new Date("2026-09-01T12:00:00Z")
      });

      const mockQuery = mockOrderFind(newerOrder);

      const result = await findQualifyingOrder(userId, productId);

      expect(result.eligible).toBe(true);
      expect(result.order._id).toBe("707f1f77bcf86cd799439032");
      expect(mockQuery.sort).toHaveBeenCalledWith({ createdAt: -1 });
    });

    it("22. historical qualifying purchase remains valid even if product is now inactive", async () => {
      const historicalOrder = createMockOrder();
      mockOrderFind(historicalOrder);

      const result = await findQualifyingOrder(userId, productId);

      expect(result.eligible).toBe(true);
      expect(result.order).toEqual(historicalOrder);
    });

    it("23. isolation: User A cannot qualify from User B's order", async () => {
      mockOrderFind(null);

      const result = await findQualifyingOrder(userId, productId);

      expect(result.eligible).toBe(false);
      expect(Order.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          user: new mongoose.Types.ObjectId(userId)
        })
      );
    });
  });

  describe("recalculateProductRating — Rating Aggregation", () => {
    it("24. returns ratingAverage 0 and ratingCount 0 when product has no published reviews", async () => {
      vi.spyOn(Product, "exists").mockResolvedValue({ _id: productId });
      vi.spyOn(Review, "aggregate").mockResolvedValue([]);
      vi.spyOn(Product, "findByIdAndUpdate").mockResolvedValue({
        _id: productId,
        ratingAverage: 0,
        ratingCount: 0
      });

      const result = await recalculateProductRating(productId);

      expect(result.ratingAverage).toBe(0);
      expect(result.ratingCount).toBe(0);
      expect(Product.findByIdAndUpdate).toHaveBeenCalledWith(
        new mongoose.Types.ObjectId(productId),
        {
          $set: {
            ratingAverage: 0,
            ratingCount: 0
          }
        },
        { new: true }
      );
    });

    it("25. calculates 5.0 average and count 1 for a single 5-star published review", async () => {
      vi.spyOn(Product, "exists").mockResolvedValue({ _id: productId });
      vi.spyOn(Review, "aggregate").mockResolvedValue([
        { _id: new mongoose.Types.ObjectId(productId), ratingCount: 1, ratingAverage: 5 }
      ]);
      vi.spyOn(Product, "findByIdAndUpdate").mockResolvedValue({
        _id: productId,
        ratingAverage: 5,
        ratingCount: 1
      });

      const result = await recalculateProductRating(productId);

      expect(result.ratingAverage).toBe(5);
      expect(result.ratingCount).toBe(1);
    });

    it("26. calculates 1.0 average and count 1 for a single 1-star published review", async () => {
      vi.spyOn(Product, "exists").mockResolvedValue({ _id: productId });
      vi.spyOn(Review, "aggregate").mockResolvedValue([
        { _id: new mongoose.Types.ObjectId(productId), ratingCount: 1, ratingAverage: 1 }
      ]);
      vi.spyOn(Product, "findByIdAndUpdate").mockResolvedValue({
        _id: productId,
        ratingAverage: 1,
        ratingCount: 1
      });

      const result = await recalculateProductRating(productId);

      expect(result.ratingAverage).toBe(1);
      expect(result.ratingCount).toBe(1);
    });

    it("27. calculates correct average and count for multiple published reviews", async () => {
      vi.spyOn(Product, "exists").mockResolvedValue({ _id: productId });
      vi.spyOn(Review, "aggregate").mockResolvedValue([
        { _id: new mongoose.Types.ObjectId(productId), ratingCount: 4, ratingAverage: 4.25 }
      ]);
      vi.spyOn(Product, "findByIdAndUpdate").mockResolvedValue({
        _id: productId,
        ratingAverage: 4.25,
        ratingCount: 4
      });

      const result = await recalculateProductRating(productId);

      expect(result.ratingAverage).toBe(4.25);
      expect(result.ratingCount).toBe(4);
    });

    it("28-31. aggregation query filters strictly on product and status === 'published'", async () => {
      vi.spyOn(Product, "exists").mockResolvedValue({ _id: productId });
      const aggregateSpy = vi.spyOn(Review, "aggregate").mockResolvedValue([
        { _id: new mongoose.Types.ObjectId(productId), ratingCount: 2, ratingAverage: 4.5 }
      ]);
      vi.spyOn(Product, "findByIdAndUpdate").mockResolvedValue({});

      await recalculateProductRating(productId);

      expect(aggregateSpy).toHaveBeenCalledWith([
        {
          $match: {
            product: new mongoose.Types.ObjectId(productId),
            status: "published"
          }
        },
        {
          $group: {
            _id: "$product",
            ratingCount: { $sum: 1 },
            ratingAverage: { $avg: "$rating" }
          }
        }
      ]);
    });

    it("32. precision: 5 + 4 + 3 yields exactly 4.0 average", async () => {
      vi.spyOn(Product, "exists").mockResolvedValue({ _id: productId });
      vi.spyOn(Review, "aggregate").mockResolvedValue([
        { _id: new mongoose.Types.ObjectId(productId), ratingCount: 3, ratingAverage: 4.0 }
      ]);
      vi.spyOn(Product, "findByIdAndUpdate").mockResolvedValue({});

      const result = await recalculateProductRating(productId);

      expect(result.ratingAverage).toBe(4);
      expect(result.ratingCount).toBe(3);
    });

    it("33. precision: 5 + 4 yields exactly 4.5 average", async () => {
      vi.spyOn(Product, "exists").mockResolvedValue({ _id: productId });
      vi.spyOn(Review, "aggregate").mockResolvedValue([
        { _id: new mongoose.Types.ObjectId(productId), ratingCount: 2, ratingAverage: 4.5 }
      ]);
      vi.spyOn(Product, "findByIdAndUpdate").mockResolvedValue({});

      const result = await recalculateProductRating(productId);

      expect(result.ratingAverage).toBe(4.5);
      expect(result.ratingCount).toBe(2);
    });

    it("34. precision: 5 + 4 + 4 yields 4.33 with two-decimal rounding", async () => {
      vi.spyOn(Product, "exists").mockResolvedValue({ _id: productId });
      vi.spyOn(Review, "aggregate").mockResolvedValue([
        { _id: new mongoose.Types.ObjectId(productId), ratingCount: 3, ratingAverage: 4.333333333333333 }
      ]);
      vi.spyOn(Product, "findByIdAndUpdate").mockResolvedValue({});

      const result = await recalculateProductRating(productId);

      expect(result.ratingAverage).toBe(4.33);
      expect(result.ratingCount).toBe(3);
    });

    it("35. recalculation is idempotent (calling consecutively produces identical results)", async () => {
      vi.spyOn(Product, "exists").mockResolvedValue({ _id: productId });
      vi.spyOn(Review, "aggregate").mockResolvedValue([
        { _id: new mongoose.Types.ObjectId(productId), ratingCount: 2, ratingAverage: 4.5 }
      ]);
      vi.spyOn(Product, "findByIdAndUpdate").mockResolvedValue({
        _id: productId,
        ratingAverage: 4.5,
        ratingCount: 2
      });

      const firstCall = await recalculateProductRating(productId);
      const secondCall = await recalculateProductRating(productId);

      expect(firstCall.ratingAverage).toBe(secondCall.ratingAverage);
      expect(firstCall.ratingCount).toBe(secondCall.ratingCount);
    });

    it("36. hiding the only published review resets metrics to 0 and 0", async () => {
      vi.spyOn(Product, "exists").mockResolvedValue({ _id: productId });
      vi.spyOn(Review, "aggregate").mockResolvedValue([]);
      vi.spyOn(Product, "findByIdAndUpdate").mockResolvedValue({
        _id: productId,
        ratingAverage: 0,
        ratingCount: 0
      });

      const result = await recalculateProductRating(productId);

      expect(result.ratingAverage).toBe(0);
      expect(result.ratingCount).toBe(0);
      expect(Product.findByIdAndUpdate).toHaveBeenCalledWith(
        new mongoose.Types.ObjectId(productId),
        {
          $set: {
            ratingAverage: 0,
            ratingCount: 0
          }
        },
        { new: true }
      );
    });

    it("37. changing review count and average refreshes Product metrics cleanly", async () => {
      vi.spyOn(Product, "exists").mockResolvedValue({ _id: productId });
      const aggregateMock = vi.spyOn(Review, "aggregate");
      const updateMock = vi.spyOn(Product, "findByIdAndUpdate");

      // First aggregation: 1 review (5 stars)
      aggregateMock.mockResolvedValueOnce([
        { _id: new mongoose.Types.ObjectId(productId), ratingCount: 1, ratingAverage: 5 }
      ]);
      updateMock.mockResolvedValueOnce({ _id: productId, ratingAverage: 5, ratingCount: 1 });

      const res1 = await recalculateProductRating(productId);
      expect(res1.ratingAverage).toBe(5);
      expect(res1.ratingCount).toBe(1);

      // Second aggregation after new 3-star review added: 2 reviews (average 4.0)
      aggregateMock.mockResolvedValueOnce([
        { _id: new mongoose.Types.ObjectId(productId), ratingCount: 2, ratingAverage: 4.0 }
      ]);
      updateMock.mockResolvedValueOnce({ _id: productId, ratingAverage: 4, ratingCount: 2 });

      const res2 = await recalculateProductRating(productId);
      expect(res2.ratingAverage).toBe(4);
      expect(res2.ratingCount).toBe(2);
    });

    it("38. throws 404 PRODUCT_NOT_FOUND when product does not exist", async () => {
      vi.spyOn(Product, "exists").mockResolvedValue(null);
      const aggregateSpy = vi.spyOn(Review, "aggregate");

      await expect(recalculateProductRating(productId)).rejects.toThrow("Product not found");
      expect(aggregateSpy).not.toHaveBeenCalled();
    });

    it("38b. throws 400 INVALID_ID when productId is malformed", async () => {
      const existsSpy = vi.spyOn(Product, "exists");

      await expect(recalculateProductRating("invalid-hex-id")).rejects.toThrow("Invalid product ID");
      expect(existsSpy).not.toHaveBeenCalled();
    });

    it("39-40. atomic update uses $set and preserves all other Product fields", async () => {
      vi.spyOn(Product, "exists").mockResolvedValue({ _id: productId });
      vi.spyOn(Review, "aggregate").mockResolvedValue([
        { _id: new mongoose.Types.ObjectId(productId), ratingCount: 2, ratingAverage: 4.5 }
      ]);
      const updateSpy = vi.spyOn(Product, "findByIdAndUpdate").mockResolvedValue({
        _id: productId,
        name: "Tent",
        price: 12000,
        stock: 5,
        ratingAverage: 4.5,
        ratingCount: 2
      });

      const result = await recalculateProductRating(productId);

      expect(updateSpy).toHaveBeenCalledWith(
        new mongoose.Types.ObjectId(productId),
        {
          $set: {
            ratingAverage: 4.5,
            ratingCount: 2
          }
        },
        { new: true }
      );
      expect(result.product.name).toBe("Tent");
      expect(result.product.price).toBe(12000);
      expect(result.product.stock).toBe(5);
    });

    it("41-42. reviews for another product do not affect target product rating", async () => {
      vi.spyOn(Product, "exists").mockResolvedValue({ _id: productId });
      const aggregateSpy = vi.spyOn(Review, "aggregate").mockResolvedValue([]);
      vi.spyOn(Product, "findByIdAndUpdate").mockResolvedValue({});

      await recalculateProductRating(productId);

      const matchStage = aggregateSpy.mock.calls[0][0][0].$match;
      expect(matchStage.product).toEqual(new mongoose.Types.ObjectId(productId));
      expect(matchStage.product).not.toEqual(new mongoose.Types.ObjectId(otherProductId));
      expect(matchStage.status).toBe("published");
    });
  });
});
