import { describe, it, expect, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import * as service from "./recently-viewed.service.js";
import RecentlyViewed from "./recently-viewed.model.js";
import Product from "../products/product.model.js";
import AppError from "../../common/errors/app-error.js";
import {
  DEFAULT_RECENTLY_VIEWED_LIMIT,
  MAX_RECENTLY_VIEWED_LIMIT,
  MAX_STORED_RECENTLY_VIEWED
} from "./recently-viewed.constants.js";

const USER_A_ID = "507f1f77bcf86cd799439011";
const USER_B_ID = "507f1f77bcf86cd799439012";
const PRODUCT_1_ID = "607f1f77bcf86cd799439021";
const PRODUCT_2_ID = "607f1f77bcf86cd799439022";
const INACTIVE_PRODUCT_ID = "607f1f77bcf86cd799439023";

describe("recently-viewed.service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("recordProductView", () => {
    it("successfully records a view for an active product", async () => {
      const mockProduct = { _id: PRODUCT_1_ID, isActive: true };
      const selectSpy = vi.fn().mockResolvedValue(mockProduct);
      vi.spyOn(Product, "findOne").mockReturnValue({ select: selectSpy });

      const mockDoc = {
        _id: new mongoose.Types.ObjectId(),
        user: USER_A_ID,
        product: PRODUCT_1_ID,
        viewedAt: new Date()
      };
      vi.spyOn(RecentlyViewed, "findOneAndUpdate").mockResolvedValue(mockDoc);
      vi.spyOn(RecentlyViewed, "countDocuments").mockResolvedValue(5);

      const result = await service.recordProductView(USER_A_ID, PRODUCT_1_ID);

      expect(Product.findOne).toHaveBeenCalledWith({
        _id: PRODUCT_1_ID,
        isActive: true
      });
      expect(RecentlyViewed.findOneAndUpdate).toHaveBeenCalledWith(
        { user: USER_A_ID, product: PRODUCT_1_ID },
        expect.objectContaining({ $set: expect.objectContaining({ viewedAt: expect.any(Date) }) }),
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      expect(result).toEqual({
        productId: PRODUCT_1_ID,
        viewedAt: mockDoc.viewedAt
      });
    });

    it("records a view for an active product even if out of stock (stock === 0)", async () => {
      const mockProduct = { _id: PRODUCT_1_ID, isActive: true, stock: 0 };
      const selectSpy = vi.fn().mockResolvedValue(mockProduct);
      vi.spyOn(Product, "findOne").mockReturnValue({ select: selectSpy });

      const mockDoc = {
        user: USER_A_ID,
        product: PRODUCT_1_ID,
        viewedAt: new Date()
      };
      vi.spyOn(RecentlyViewed, "findOneAndUpdate").mockResolvedValue(mockDoc);
      vi.spyOn(RecentlyViewed, "countDocuments").mockResolvedValue(1);

      const result = await service.recordProductView(USER_A_ID, PRODUCT_1_ID);
      expect(result.productId).toBe(PRODUCT_1_ID);
    });

    it("rejects with 404 PRODUCT_NOT_FOUND when product does not exist", async () => {
      const selectSpy = vi.fn().mockResolvedValue(null);
      vi.spyOn(Product, "findOne").mockReturnValue({ select: selectSpy });

      await expect(
        service.recordProductView(USER_A_ID, PRODUCT_1_ID)
      ).rejects.toThrowError(
        expect.objectContaining({
          statusCode: 404,
          code: "PRODUCT_NOT_FOUND"
        })
      );
    });

    it("rejects with 404 PRODUCT_NOT_FOUND when product is inactive", async () => {
      // Product.findOne({ _id, isActive: true }) returns null for inactive products
      const selectSpy = vi.fn().mockResolvedValue(null);
      vi.spyOn(Product, "findOne").mockReturnValue({ select: selectSpy });

      await expect(
        service.recordProductView(USER_A_ID, INACTIVE_PRODUCT_ID)
      ).rejects.toThrowError(
        expect.objectContaining({
          statusCode: 404,
          code: "PRODUCT_NOT_FOUND"
        })
      );
    });

    it("gracefully catches E11000 duplicate key race and retries update", async () => {
      const mockProduct = { _id: PRODUCT_1_ID, isActive: true };
      const selectSpy = vi.fn().mockResolvedValue(mockProduct);
      vi.spyOn(Product, "findOne").mockReturnValue({ select: selectSpy });

      const dupError = new Error("E11000 duplicate key error");
      dupError.code = 11000;

      const mockDoc = {
        user: USER_A_ID,
        product: PRODUCT_1_ID,
        viewedAt: new Date()
      };

      vi.spyOn(RecentlyViewed, "findOneAndUpdate")
        .mockRejectedValueOnce(dupError)
        .mockResolvedValueOnce(mockDoc);

      vi.spyOn(RecentlyViewed, "countDocuments").mockResolvedValue(2);

      const result = await service.recordProductView(USER_A_ID, PRODUCT_1_ID);

      expect(RecentlyViewed.findOneAndUpdate).toHaveBeenCalledTimes(2);
      expect(result.productId).toBe(PRODUCT_1_ID);
    });

    it("re-throws unexpected errors other than duplicate key during upsert", async () => {
      const mockProduct = { _id: PRODUCT_1_ID, isActive: true };
      const selectSpy = vi.fn().mockResolvedValue(mockProduct);
      vi.spyOn(Product, "findOne").mockReturnValue({ select: selectSpy });

      const dbError = new Error("Database connection lost");
      vi.spyOn(RecentlyViewed, "findOneAndUpdate").mockRejectedValue(dbError);

      await expect(
        service.recordProductView(USER_A_ID, PRODUCT_1_ID)
      ).rejects.toThrow("Database connection lost");
    });

    it("prunes surplus records when user document count exceeds 15", async () => {
      const mockProduct = { _id: PRODUCT_1_ID, isActive: true };
      const selectSpy = vi.fn().mockResolvedValue(mockProduct);
      vi.spyOn(Product, "findOne").mockReturnValue({ select: selectSpy });

      const mockDoc = {
        user: USER_A_ID,
        product: PRODUCT_1_ID,
        viewedAt: new Date()
      };
      vi.spyOn(RecentlyViewed, "findOneAndUpdate").mockResolvedValue(mockDoc);
      vi.spyOn(RecentlyViewed, "countDocuments").mockResolvedValue(16);

      const surplusItems = [
        { _id: new mongoose.Types.ObjectId() },
        { _id: new mongoose.Types.ObjectId() }
      ];

      const findChain = {
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(surplusItems)
      };
      vi.spyOn(RecentlyViewed, "find").mockReturnValue(findChain);
      vi.spyOn(RecentlyViewed, "deleteMany").mockResolvedValue({ deletedCount: 2 });

      await service.recordProductView(USER_A_ID, PRODUCT_1_ID);

      expect(RecentlyViewed.find).toHaveBeenCalledWith({ user: USER_A_ID });
      expect(findChain.skip).toHaveBeenCalledWith(MAX_STORED_RECENTLY_VIEWED);
      expect(RecentlyViewed.deleteMany).toHaveBeenCalledWith({
        _id: { $in: surplusItems.map((i) => i._id) }
      });
    });
  });

  describe("getRecentlyViewed", () => {
    it("returns valid active products ordered newest first", async () => {
      const mockRecords = [
        {
          viewedAt: new Date("2026-10-01T10:00:00Z"),
          product: {
            _id: PRODUCT_1_ID,
            name: "Tent",
            price: 5000,
            stock: 10,
            isActive: true
          }
        },
        {
          viewedAt: new Date("2026-10-01T09:00:00Z"),
          product: {
            _id: PRODUCT_2_ID,
            name: "Sleeping Bag",
            price: 2500,
            stock: 0,
            isActive: true
          }
        }
      ];

      const findChain = {
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(mockRecords)
      };
      vi.spyOn(RecentlyViewed, "find").mockReturnValue(findChain);

      const result = await service.getRecentlyViewed(USER_A_ID, 10);

      expect(RecentlyViewed.find).toHaveBeenCalledWith({ user: USER_A_ID });
      expect(findChain.sort).toHaveBeenCalledWith({ viewedAt: -1 });
      expect(result.totalItems).toBe(2);
      expect(result.items).toHaveLength(2);
      expect(result.items[0].product.name).toBe("Tent");
      expect(result.items[1].product.name).toBe("Sleeping Bag");
    });

    it("filters out deleted/null referenced products in memory without mutating database", async () => {
      const mockRecords = [
        {
          viewedAt: new Date("2026-10-01T10:00:00Z"),
          product: { _id: PRODUCT_1_ID, name: "Tent", isActive: true }
        },
        {
          viewedAt: new Date("2026-10-01T09:00:00Z"),
          product: null // Product was physically deleted
        }
      ];

      const findChain = {
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(mockRecords)
      };
      vi.spyOn(RecentlyViewed, "find").mockReturnValue(findChain);
      vi.spyOn(RecentlyViewed, "deleteMany");

      const result = await service.getRecentlyViewed(USER_A_ID, 10);

      expect(result.totalItems).toBe(1);
      expect(result.items[0].product._id).toBe(PRODUCT_1_ID);
      expect(RecentlyViewed.deleteMany).not.toHaveBeenCalled();
    });

    it("filters out inactive products in memory", async () => {
      const mockRecords = [
        {
          viewedAt: new Date("2026-10-01T10:00:00Z"),
          product: { _id: PRODUCT_1_ID, name: "Tent", isActive: true }
        },
        {
          viewedAt: new Date("2026-10-01T09:00:00Z"),
          product: { _id: INACTIVE_PRODUCT_ID, name: "Discontinued", isActive: false }
        }
      ];

      const findChain = {
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(mockRecords)
      };
      vi.spyOn(RecentlyViewed, "find").mockReturnValue(findChain);

      const result = await service.getRecentlyViewed(USER_A_ID, 10);

      expect(result.totalItems).toBe(1);
      expect(result.items[0].product._id).toBe(PRODUCT_1_ID);
    });

    it("respects boundary limits (e.g. limit=1)", async () => {
      const mockRecords = [
        {
          viewedAt: new Date("2026-10-01T10:00:00Z"),
          product: { _id: PRODUCT_1_ID, name: "Tent", isActive: true }
        },
        {
          viewedAt: new Date("2026-10-01T09:00:00Z"),
          product: { _id: PRODUCT_2_ID, name: "Backpack", isActive: true }
        }
      ];

      const findChain = {
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(mockRecords)
      };
      vi.spyOn(RecentlyViewed, "find").mockReturnValue(findChain);

      const result = await service.getRecentlyViewed(USER_A_ID, 1);

      expect(result.totalItems).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].product._id).toBe(PRODUCT_1_ID);
    });
  });

  describe("clearRecentlyViewed", () => {
    it("deletes all records for the authenticated user only", async () => {
      vi.spyOn(RecentlyViewed, "deleteMany").mockResolvedValue({ deletedCount: 4 });

      const result = await service.clearRecentlyViewed(USER_A_ID);

      expect(RecentlyViewed.deleteMany).toHaveBeenCalledWith({ user: USER_A_ID });
      expect(result).toEqual({ success: true });
    });

    it("succeeds idempotently when user has 0 records", async () => {
      vi.spyOn(RecentlyViewed, "deleteMany").mockResolvedValue({ deletedCount: 0 });

      const result = await service.clearRecentlyViewed(USER_B_ID);

      expect(RecentlyViewed.deleteMany).toHaveBeenCalledWith({ user: USER_B_ID });
      expect(result).toEqual({ success: true });
    });
  });

  describe("mergeRecentlyViewed", () => {
    it("returns mergedCount: 0 when productIds is empty or invalid", async () => {
      const resEmpty = await service.mergeRecentlyViewed(USER_A_ID, []);
      expect(resEmpty).toEqual({ mergedCount: 0 });

      const resNull = await service.mergeRecentlyViewed(USER_A_ID, null);
      expect(resNull).toEqual({ mergedCount: 0 });
    });

    it("filters active products and bulk upserts with staggered timestamps", async () => {
      const activeProducts = [{ _id: PRODUCT_1_ID }, { _id: PRODUCT_2_ID }];
      const selectSpy = vi.fn().mockReturnThis();
      const leanSpy = vi.fn().mockResolvedValue(activeProducts);
      vi.spyOn(Product, "find").mockReturnValue({ select: selectSpy, lean: leanSpy });

      vi.spyOn(RecentlyViewed, "bulkWrite").mockResolvedValue({});
      const findChain = {
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([])
      };
      vi.spyOn(RecentlyViewed, "find").mockReturnValue(findChain);

      const result = await service.mergeRecentlyViewed(USER_A_ID, [
        PRODUCT_1_ID,
        INACTIVE_PRODUCT_ID,
        PRODUCT_2_ID
      ]);

      expect(RecentlyViewed.bulkWrite).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            updateOne: expect.objectContaining({
              filter: { user: USER_A_ID, product: PRODUCT_1_ID },
              upsert: true
            })
          }),
          expect.objectContaining({
            updateOne: expect.objectContaining({
              filter: { user: USER_A_ID, product: PRODUCT_2_ID },
              upsert: true
            })
          })
        ]),
        { ordered: false }
      );
      expect(result).toEqual({ mergedCount: 2 });
    });

    it("prunes excess records beyond MAX_STORED_RECENTLY_VIEWED after merge", async () => {
      const activeProducts = [{ _id: PRODUCT_1_ID }];
      const selectSpy = vi.fn().mockReturnThis();
      const leanSpy = vi.fn().mockResolvedValue(activeProducts);
      vi.spyOn(Product, "find").mockReturnValue({ select: selectSpy, lean: leanSpy });
      vi.spyOn(RecentlyViewed, "bulkWrite").mockResolvedValue({});

      const surplusItems = [{ _id: new mongoose.Types.ObjectId() }];
      const findChain = {
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(surplusItems)
      };
      vi.spyOn(RecentlyViewed, "find").mockReturnValue(findChain);
      vi.spyOn(RecentlyViewed, "deleteMany").mockResolvedValue({ deletedCount: 1 });

      await service.mergeRecentlyViewed(USER_A_ID, [PRODUCT_1_ID]);

      expect(RecentlyViewed.deleteMany).toHaveBeenCalledWith({
        _id: { $in: surplusItems.map((i) => i._id) }
      });
    });
  });
});
