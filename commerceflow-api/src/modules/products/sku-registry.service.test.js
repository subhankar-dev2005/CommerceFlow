import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";
import SkuRegistry from "./sku-registry.model.js";
import AppError from "../../common/errors/app-error.js";
import {
  normalizeSku,
  reserveProductSkus,
  releaseProductSkus,
  reconcileProductSkus
} from "./sku-registry.service.js";

describe("SKU Registry Service (P2.1.6)", () => {
  const productAId = new mongoose.Types.ObjectId().toString();
  const productBId = new mongoose.Types.ObjectId().toString();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("normalizeSku", () => {
    it("trims and uppercases lowercase or padded SKU strings", () => {
      expect(normalizeSku("  sw-navy-xl  ")).toBe("SW-NAVY-XL");
      expect(normalizeSku("tshirt_red-m")).toBe("TSHIRT_RED-M");
      expect(normalizeSku("LAPTOP-512")).toBe("LAPTOP-512");
    });

    it("returns null for empty string or whitespace-only inputs", () => {
      expect(normalizeSku("")).toBeNull();
      expect(normalizeSku("   ")).toBeNull();
    });

    it("returns null for non-string, null, or undefined values", () => {
      expect(normalizeSku(null)).toBeNull();
      expect(normalizeSku(undefined)).toBeNull();
      expect(normalizeSku(12345)).toBeNull();
      expect(normalizeSku({ sku: "SW-1" })).toBeNull();
    });
  });

  describe("reserveProductSkus", () => {
    it("throws 400 INVALID_PRODUCT_ID if productId is missing", async () => {
      await expect(reserveProductSkus(null, [{ sku: "SW-1" }])).rejects.toThrow(AppError);
      await expect(reserveProductSkus(null, [{ sku: "SW-1" }])).rejects.toMatchObject({
        statusCode: 400,
        code: "INVALID_PRODUCT_ID"
      });
    });

    it("ignores absent, null, or empty SKUs and returns empty array if none valid", async () => {
      const createSpy = vi.spyOn(SkuRegistry, "create");

      const result = await reserveProductSkus(productAId, [
        { sku: null },
        { sku: "   " },
        null,
        ""
      ]);

      expect(result).toEqual([]);
      expect(createSpy).not.toHaveBeenCalled();
    });

    it("reserves root product SKU with variantId set to null", async () => {
      const createdDoc = {
        _id: new mongoose.Types.ObjectId(),
        sku: "SIMPLE-SHIRT",
        product: productAId,
        variantId: null
      };

      const createSpy = vi.spyOn(SkuRegistry, "create").mockResolvedValue(createdDoc);

      const result = await reserveProductSkus(productAId, "simple-shirt");

      expect(createSpy).toHaveBeenCalledWith({
        sku: "SIMPLE-SHIRT",
        product: productAId,
        variantId: null
      });
      expect(result).toEqual([createdDoc]);
    });

    it("reserves variant SKUs with proper variantId mapping and normalized uppercase", async () => {
      const mockDoc1 = {
        sku: "SW-BLK-S",
        product: productAId,
        variantId: "var_1"
      };
      const mockDoc2 = {
        sku: "SW-BLK-M",
        product: productAId,
        variantId: "var_2"
      };

      const createSpy = vi
        .spyOn(SkuRegistry, "create")
        .mockResolvedValueOnce(mockDoc1)
        .mockResolvedValueOnce(mockDoc2);

      const result = await reserveProductSkus(productAId, [
        { sku: "  sw-blk-s  ", variantId: "var_1" },
        { sku: "SW-BLK-M", variantId: "var_2" }
      ]);

      expect(createSpy).toHaveBeenCalledTimes(2);
      expect(createSpy).toHaveBeenNthCalledWith(1, {
        sku: "SW-BLK-S",
        product: productAId,
        variantId: "var_1"
      });
      expect(createSpy).toHaveBeenNthCalledWith(2, {
        sku: "SW-BLK-M",
        product: productAId,
        variantId: "var_2"
      });
      expect(result).toEqual([mockDoc1, mockDoc2]);
    });

    it("rejects duplicate SKUs within the same reservation batch", async () => {
      const createSpy = vi.spyOn(SkuRegistry, "create");

      await expect(
        reserveProductSkus(productAId, [
          { sku: "SW-DUP", variantId: "var_1" },
          { sku: "  sw-dup  ", variantId: "var_2" }
        ])
      ).rejects.toMatchObject({
        statusCode: 409,
        code: "SKU_ALREADY_EXISTS"
      });

      expect(createSpy).not.toHaveBeenCalled();
    });

    it("translates MongoDB duplicate-key error 11000 into 409 SKU_ALREADY_EXISTS and rolls back newly created batch items", async () => {
      const mockDoc1 = { sku: "SW-ITEM-1", product: productAId };

      vi.spyOn(SkuRegistry, "create")
        .mockResolvedValueOnce(mockDoc1)
        .mockRejectedValueOnce({
          code: 11000,
          keyValue: { sku: "SW-ITEM-2" },
          message: "E11000 duplicate key error collection: skuregistries index: sku_1 dup key"
        });

      const deleteManySpy = vi.spyOn(SkuRegistry, "deleteMany").mockResolvedValue({ deletedCount: 1 });

      await expect(
        reserveProductSkus(productAId, [
          { sku: "SW-ITEM-1" },
          { sku: "SW-ITEM-2" }
        ])
      ).rejects.toMatchObject({
        statusCode: 409,
        code: "SKU_ALREADY_EXISTS",
        message: expect.stringContaining("SW-ITEM-2")
      });

      // Rollback must delete only newly created items from this invocation, scoped to productAId
      expect(deleteManySpy).toHaveBeenCalledWith({
        product: productAId,
        sku: { $in: ["SW-ITEM-1"] }
      });
    });

    it("rollback never deletes an entry owned by another product", async () => {
      // First item succeeds for productAId; second item collides with productBId's existing SKU
      const mockDoc1 = { sku: "PROD-A-NEW", product: productAId };

      vi.spyOn(SkuRegistry, "create")
        .mockResolvedValueOnce(mockDoc1)
        .mockRejectedValueOnce({
          code: 11000,
          keyValue: { sku: "PROD-B-EXISTING" }
        });

      const deleteManySpy = vi.spyOn(SkuRegistry, "deleteMany").mockResolvedValue({ deletedCount: 1 });

      await expect(
        reserveProductSkus(productAId, [
          { sku: "PROD-A-NEW" },
          { sku: "PROD-B-EXISTING" }
        ])
      ).rejects.toMatchObject({
        statusCode: 409,
        code: "SKU_ALREADY_EXISTS"
      });

      // Verify the deleteMany filter is strictly scoped to productAId
      expect(deleteManySpy).toHaveBeenCalledWith({
        product: productAId,
        sku: { $in: ["PROD-A-NEW"] }
      });
      // PROD-B-EXISTING is not in the rollback list because it was not created in this invocation
      expect(deleteManySpy.mock.calls[0][0].sku.$in).not.toContain("PROD-B-EXISTING");
    });

    it("propagates database errors other than duplicate-key errors after rolling back newly created items", async () => {
      const mockDoc1 = { sku: "SW-ITEM-1", product: productAId };
      const dbError = new Error("Database connection lost");

      vi.spyOn(SkuRegistry, "create")
        .mockResolvedValueOnce(mockDoc1)
        .mockRejectedValueOnce(dbError);

      const deleteManySpy = vi.spyOn(SkuRegistry, "deleteMany").mockResolvedValue({ deletedCount: 1 });

      await expect(
        reserveProductSkus(productAId, [
          { sku: "SW-ITEM-1" },
          { sku: "SW-ITEM-2" }
        ])
      ).rejects.toThrow("Database connection lost");

      expect(deleteManySpy).toHaveBeenCalledWith({
        product: productAId,
        sku: { $in: ["SW-ITEM-1"] }
      });
    });
  });

  describe("releaseProductSkus", () => {
    it("returns zero released count when given empty or missing inputs", async () => {
      const deleteSpy = vi.spyOn(SkuRegistry, "deleteMany");

      expect(await releaseProductSkus(productAId, [])).toEqual({ releasedCount: 0, releasedSkus: [] });
      expect(await releaseProductSkus(null, ["SW-1"])).toEqual({ releasedCount: 0, releasedSkus: [] });
      expect(await releaseProductSkus(productAId, [null, "   "])).toEqual({ releasedCount: 0, releasedSkus: [] });
      expect(deleteSpy).not.toHaveBeenCalled();
    });

    it("releases only entries matching both the SKU and expected product owner", async () => {
      const deleteSpy = vi.spyOn(SkuRegistry, "deleteMany").mockResolvedValue({ deletedCount: 2 });

      const result = await releaseProductSkus(productAId, [
        "  sw-old-1  ",
        "SW-OLD-2"
      ]);

      expect(deleteSpy).toHaveBeenCalledWith({
        product: productAId,
        sku: { $in: ["SW-OLD-1", "SW-OLD-2"] }
      });
      expect(result).toEqual({
        releasedCount: 2,
        releasedSkus: ["SW-OLD-1", "SW-OLD-2"]
      });
    });

    it("release scoped to expected owner does not affect another product's reservation", async () => {
      // Calling release for productAId with a SKU that belongs to productBId
      const deleteSpy = vi.spyOn(SkuRegistry, "deleteMany").mockResolvedValue({ deletedCount: 0 });

      const result = await releaseProductSkus(productAId, ["PROD-B-SKU"]);

      expect(deleteSpy).toHaveBeenCalledWith({
        product: productAId,
        sku: { $in: ["PROD-B-SKU"] }
      });
      expect(result.releasedCount).toBe(0);
    });
  });

  describe("reconcileProductSkus", () => {
    it("throws 400 INVALID_PRODUCT_ID if productId is missing", async () => {
      await expect(reconcileProductSkus(null, [], [])).rejects.toMatchObject({
        statusCode: 400,
        code: "INVALID_PRODUCT_ID"
      });
    });

    it("calculates newly added, removed, and kept SKU deltas accurately", async () => {
      const current = [
        { sku: "SW-KEEP", variantId: "var_1" },
        { sku: "SW-REMOVE", variantId: "var_2" }
      ];
      const desired = [
        { sku: "SW-KEEP", variantId: "var_1" },
        { sku: "SW-NEW", variantId: "var_3" }
      ];

      vi.spyOn(SkuRegistry, "create").mockResolvedValue({ sku: "SW-NEW", product: productAId, variantId: "var_3" });
      const deleteSpy = vi.spyOn(SkuRegistry, "deleteMany").mockResolvedValue({ deletedCount: 1 });

      const result = await reconcileProductSkus(productAId, current, desired);

      expect(result.skusToKeep).toEqual(["SW-KEEP"]);
      expect(result.reservedSkus).toEqual(["SW-NEW"]);
      expect(result.skusToRelease).toEqual(["SW-REMOVE"]);
      expect(result.releasedSkus).toEqual(["SW-REMOVE"]);
      expect(deleteSpy).toHaveBeenCalledWith({
        product: productAId,
        sku: { $in: ["SW-REMOVE"] }
      });
    });

    it("reserves newly desired SKUs before releasing removed SKUs", async () => {
      const executionOrder = [];

      vi.spyOn(SkuRegistry, "create").mockImplementation(async () => {
        executionOrder.push("reserve");
        return { sku: "SW-NEW" };
      });

      vi.spyOn(SkuRegistry, "deleteMany").mockImplementation(async () => {
        executionOrder.push("release");
        return { deletedCount: 1 };
      });

      await reconcileProductSkus(
        productAId,
        [{ sku: "SW-OLD" }],
        [{ sku: "SW-NEW" }]
      );

      expect(executionOrder).toEqual(["reserve", "release"]);
    });

    it("updates variant mapping for unchanged SKUs when variantId changes", async () => {
      const updateOneSpy = vi.spyOn(SkuRegistry, "updateOne").mockResolvedValue({ modifiedCount: 1 });

      const current = [{ sku: "SW-SHARED", variantId: "var_old" }];
      const desired = [{ sku: "SW-SHARED", variantId: "var_new" }];

      const result = await reconcileProductSkus(productAId, current, desired);

      expect(result.skusToKeep).toEqual(["SW-SHARED"]);
      expect(result.reservedSkus).toEqual([]);
      expect(result.skusToRelease).toEqual([]);
      expect(updateOneSpy).toHaveBeenCalledWith(
        { product: productAId, sku: "SW-SHARED" },
        { variantId: "var_new" }
      );
    });

    it("queries SkuRegistry when currentEntries is null or undefined", async () => {
      const existingInDb = [
        { sku: "DB-SKU-1", variantId: "var_1" },
        { sku: "DB-SKU-2", variantId: "var_2" }
      ];

      vi.spyOn(SkuRegistry, "find").mockReturnValue({
        lean: vi.fn().mockResolvedValue(existingInDb)
      });

      const desired = [
        { sku: "DB-SKU-1", variantId: "var_1" },
        { sku: "DB-SKU-3", variantId: "var_3" }
      ];

      vi.spyOn(SkuRegistry, "create").mockResolvedValue({ sku: "DB-SKU-3" });
      vi.spyOn(SkuRegistry, "deleteMany").mockResolvedValue({ deletedCount: 1 });

      const result = await reconcileProductSkus(productAId, null, desired);

      expect(result.skusToKeep).toEqual(["DB-SKU-1"]);
      expect(result.reservedSkus).toEqual(["DB-SKU-3"]);
      expect(result.skusToRelease).toEqual(["DB-SKU-2"]);
    });

    it("supports two-phase compensation when autoRelease is disabled", async () => {
      const current = [{ sku: "SW-REMOVE" }];
      const desired = [{ sku: "SW-NEW" }];

      vi.spyOn(SkuRegistry, "create").mockResolvedValue({ sku: "SW-NEW" });
      const deleteSpy = vi.spyOn(SkuRegistry, "deleteMany").mockResolvedValue({ deletedCount: 1 });

      const result = await reconcileProductSkus(productAId, current, desired, { autoRelease: false });

      // Released list should be empty initially because autoRelease is false
      expect(result.releasedSkus).toEqual([]);
      expect(result.skusToRelease).toEqual(["SW-REMOVE"]);
      expect(result.reservedSkus).toEqual(["SW-NEW"]);
      expect(deleteSpy).not.toHaveBeenCalled();

      // Test compensation function (reverts newly reserved SKUs)
      await result.compensate();
      expect(deleteSpy).toHaveBeenCalledWith({
        product: productAId,
        sku: { $in: ["SW-NEW"] }
      });

      // Test commitRelease function (commits removal of old SKUs)
      await result.commitRelease();
      expect(deleteSpy).toHaveBeenCalledWith({
        product: productAId,
        sku: { $in: ["SW-REMOVE"] }
      });
    });

    it("is idempotent when called repeatedly with identical inputs", async () => {
      const createSpy = vi.spyOn(SkuRegistry, "create");
      const deleteSpy = vi.spyOn(SkuRegistry, "deleteMany");
      const updateOneSpy = vi.spyOn(SkuRegistry, "updateOne");

      const current = [{ sku: "SW-STABLE", variantId: "var_1" }];
      const desired = [{ sku: "SW-STABLE", variantId: "var_1" }];

      const result = await reconcileProductSkus(productAId, current, desired);

      expect(result.skusToKeep).toEqual(["SW-STABLE"]);
      expect(result.reservedSkus).toEqual([]);
      expect(result.skusToRelease).toEqual([]);
      expect(createSpy).not.toHaveBeenCalled();
      expect(deleteSpy).not.toHaveBeenCalled();
      expect(updateOneSpy).not.toHaveBeenCalled();
    });
  });
});
