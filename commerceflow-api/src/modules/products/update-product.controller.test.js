import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./sku-registry.service.js", () => ({
  reconcileProductSkus: vi.fn(),
  reserveProductSkus: vi.fn(),
  releaseProductSkus: vi.fn()
}));

import Product from "./product.model.js";
import updateProduct from "./update-product.controller.js";
import AppError from "../../common/errors/app-error.js";
import { reconcileProductSkus } from "./sku-registry.service.js";

describe("updateProduct controller - variant update wiring (P2.1.3)", () => {
  const productId = "507f1f77bcf86cd799439011";
  let req;
  let res;
  let next;
  let mockCompensate;
  let mockCommitRelease;

  const existingVariant1 = {
    variantId: "var_existing_11111",
    sku: "SW-BLK-S",
    attributes: { size: "S", color: "Black" },
    price: 1299,
    stock: 10,
    images: ["https://example.com/s-black.jpg"],
    isActive: true
  };

  const existingVariant2 = {
    variantId: "var_existing_22222",
    sku: "SW-BLK-M",
    attributes: { size: "M", color: "Black" },
    price: 1299,
    stock: 15,
    images: ["https://example.com/m-black.jpg"],
    isActive: true
  };

  const existingVariant3 = {
    variantId: "var_existing_33333",
    sku: "SW-BLK-L",
    attributes: { size: "L", color: "Black" },
    price: 1399,
    stock: 20,
    images: ["https://example.com/l-black.jpg"],
    isActive: true
  };

  const mockExistingProduct = {
    _id: productId,
    name: "Classic Sweatshirt",
    price: 1299,
    stock: 45,
    variants: [existingVariant1, existingVariant2, existingVariant3]
  };

  beforeEach(() => {
    vi.restoreAllMocks();

    mockCompensate = vi.fn().mockResolvedValue(undefined);
    mockCommitRelease = vi.fn().mockResolvedValue(undefined);

    reconcileProductSkus.mockResolvedValue({
      reservedSkus: [],
      skusToRelease: [],
      skusToKeep: [],
      releasedSkus: [],
      compensate: mockCompensate,
      commitRelease: mockCommitRelease
    });

    req = {
      params: { id: productId },
      body: {},
      requestId: "req-update-variant-123"
    };

    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };

    next = vi.fn();
  });

  describe("Variant creation during update", () => {
    it("adds a single new variant and assigns a server-generated var_ ID", async () => {
      vi.spyOn(Product, "findById").mockResolvedValue(mockExistingProduct);
      const findByIdAndUpdateSpy = vi.spyOn(Product, "findByIdAndUpdate").mockImplementation(
        async (id, updateData) => ({
          ...mockExistingProduct,
          ...updateData
        })
      );

      req.body = {
        variants: [
          existingVariant1,
          {
            sku: "SW-RED-XL",
            attributes: { size: "XL", color: "Red" },
            stock: 30
          }
        ]
      };

      await updateProduct(req, res, next);

      expect(findByIdAndUpdateSpy).toHaveBeenCalledTimes(1);
      const passedUpdate = findByIdAndUpdateSpy.mock.calls[0][1];
      expect(passedUpdate.variants).toHaveLength(2);

      const newVariant = passedUpdate.variants[1];
      expect(newVariant.sku).toBe("SW-RED-XL");
      expect(newVariant.variantId).toMatch(/^var_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(newVariant.isActive).toBe(true);

      expect(reconcileProductSkus).toHaveBeenCalledWith(
        productId,
        expect.any(Array),
        expect.arrayContaining([
          expect.objectContaining({ sku: "SW-RED-XL", variantId: newVariant.variantId })
        ]),
        { autoRelease: false }
      );
      expect(mockCommitRelease).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(next).not.toHaveBeenCalled();
    });

    it("adds multiple new variants with distinct backend-generated IDs", async () => {
      vi.spyOn(Product, "findById").mockResolvedValue(mockExistingProduct);
      const findByIdAndUpdateSpy = vi.spyOn(Product, "findByIdAndUpdate").mockImplementation(
        async (id, updateData) => ({
          ...mockExistingProduct,
          ...updateData
        })
      );

      req.body = {
        variants: [
          { sku: "SW-WHT-S", attributes: { size: "S", color: "White" }, stock: 12 },
          { sku: "SW-WHT-M", attributes: { size: "M", color: "White" }, stock: 14 }
        ]
      };

      await updateProduct(req, res, next);

      const passedVariants = findByIdAndUpdateSpy.mock.calls[0][1].variants;
      expect(passedVariants).toHaveLength(2);
      expect(passedVariants[0].variantId).toMatch(/^var_/);
      expect(passedVariants[1].variantId).toMatch(/^var_/);
      expect(passedVariants[0].variantId).not.toBe(passedVariants[1].variantId);
    });

    it("rejects an unknown client-supplied variantId that does not exist on this product", async () => {
      vi.spyOn(Product, "findById").mockResolvedValue(mockExistingProduct);
      const findByIdAndUpdateSpy = vi.spyOn(Product, "findByIdAndUpdate");

      req.body = {
        variants: [
          {
            variantId: "var_unknown_99999",
            sku: "SW-BLK-S",
            attributes: { size: "S" },
            stock: 10
          }
        ]
      };

      await updateProduct(req, res, next);

      expect(findByIdAndUpdateSpy).not.toHaveBeenCalled();
      expect(reconcileProductSkus).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
      const error = next.mock.calls[0][0];
      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe("INVALID_VARIANT_ID");
      expect(error.message).toContain("var_unknown_99999");
    });

    it("rejects a variantId belonging to another product (cross-product injection)", async () => {
      vi.spyOn(Product, "findById").mockResolvedValue(mockExistingProduct);
      const findByIdAndUpdateSpy = vi.spyOn(Product, "findByIdAndUpdate");

      req.body = {
        variants: [
          {
            variantId: "var_productB_variant_777",
            sku: "OTHER-PROD-SKU",
            attributes: { color: "Green" },
            stock: 5
          }
        ]
      };

      await updateProduct(req, res, next);

      expect(findByIdAndUpdateSpy).not.toHaveBeenCalled();
      expect(reconcileProductSkus).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
      const error = next.mock.calls[0][0];
      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe("INVALID_VARIANT_ID");
      expect(error.message).toContain("does not belong to this product");
    });

    it("rejects duplicate variant IDs in update payload", async () => {
      vi.spyOn(Product, "findById").mockResolvedValue(mockExistingProduct);
      const findByIdAndUpdateSpy = vi.spyOn(Product, "findByIdAndUpdate");

      req.body = {
        variants: [
          {
            variantId: "var_existing_11111",
            sku: "SW-BLK-S",
            attributes: { size: "S" },
            stock: 10
          },
          {
            variantId: "var_existing_11111",
            sku: "SW-BLK-S-DUP",
            attributes: { size: "S-Dup" },
            stock: 5
          }
        ]
      };

      await updateProduct(req, res, next);

      expect(findByIdAndUpdateSpy).not.toHaveBeenCalled();
      expect(reconcileProductSkus).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
      const error = next.mock.calls[0][0];
      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe("INVALID_VARIANT_ID");
      expect(error.message).toContain("Duplicate variant ID");
    });
  });

  describe("Existing variant preservation", () => {
    it("unchanged variant retains its original variantId", async () => {
      vi.spyOn(Product, "findById").mockResolvedValue(mockExistingProduct);
      const findByIdAndUpdateSpy = vi.spyOn(Product, "findByIdAndUpdate").mockResolvedValue({
        ...mockExistingProduct
      });

      req.body = {
        variants: [existingVariant1, existingVariant2, existingVariant3]
      };

      await updateProduct(req, res, next);

      const passedVariants = findByIdAndUpdateSpy.mock.calls[0][1].variants;
      expect(passedVariants[0].variantId).toBe("var_existing_11111");
      expect(passedVariants[1].variantId).toBe("var_existing_22222");
      expect(passedVariants[2].variantId).toBe("var_existing_33333");
    });

    it("editing price preserves variantId", async () => {
      vi.spyOn(Product, "findById").mockResolvedValue(mockExistingProduct);
      const findByIdAndUpdateSpy = vi.spyOn(Product, "findByIdAndUpdate").mockResolvedValue({
        ...mockExistingProduct
      });

      req.body = {
        variants: [
          {
            ...existingVariant1,
            price: 1999
          }
        ]
      };

      await updateProduct(req, res, next);

      const passedVariants = findByIdAndUpdateSpy.mock.calls[0][1].variants;
      expect(passedVariants[0].variantId).toBe("var_existing_11111");
      expect(passedVariants[0].price).toBe(1999);
    });

    it("editing attributes preserves variantId", async () => {
      vi.spyOn(Product, "findById").mockResolvedValue(mockExistingProduct);
      const findByIdAndUpdateSpy = vi.spyOn(Product, "findByIdAndUpdate").mockResolvedValue({
        ...mockExistingProduct
      });

      req.body = {
        variants: [
          {
            ...existingVariant1,
            attributes: { size: "XS", color: "Pitch Black" }
          }
        ]
      };

      await updateProduct(req, res, next);

      const passedVariants = findByIdAndUpdateSpy.mock.calls[0][1].variants;
      expect(passedVariants[0].variantId).toBe("var_existing_11111");
      expect(passedVariants[0].attributes).toEqual({ size: "XS", color: "Pitch Black" });
    });

    it("editing stock preserves variantId", async () => {
      vi.spyOn(Product, "findById").mockResolvedValue(mockExistingProduct);
      const findByIdAndUpdateSpy = vi.spyOn(Product, "findByIdAndUpdate").mockResolvedValue({
        ...mockExistingProduct
      });

      req.body = {
        variants: [
          {
            ...existingVariant1,
            stock: 99
          }
        ]
      };

      await updateProduct(req, res, next);

      const passedVariants = findByIdAndUpdateSpy.mock.calls[0][1].variants;
      expect(passedVariants[0].variantId).toBe("var_existing_11111");
      expect(passedVariants[0].stock).toBe(99);
    });

    it("editing images preserves variantId", async () => {
      vi.spyOn(Product, "findById").mockResolvedValue(mockExistingProduct);
      const findByIdAndUpdateSpy = vi.spyOn(Product, "findByIdAndUpdate").mockResolvedValue({
        ...mockExistingProduct
      });

      req.body = {
        variants: [
          {
            ...existingVariant1,
            images: ["https://example.com/new-pic.jpg"]
          }
        ]
      };

      await updateProduct(req, res, next);

      const passedVariants = findByIdAndUpdateSpy.mock.calls[0][1].variants;
      expect(passedVariants[0].variantId).toBe("var_existing_11111");
      expect(passedVariants[0].images).toEqual(["https://example.com/new-pic.jpg"]);
    });

    it("toggling isActive preserves variantId and updates status", async () => {
      vi.spyOn(Product, "findById").mockResolvedValue(mockExistingProduct);
      const findByIdAndUpdateSpy = vi.spyOn(Product, "findByIdAndUpdate").mockResolvedValue({
        ...mockExistingProduct
      });

      req.body = {
        variants: [
          {
            ...existingVariant1,
            isActive: false
          }
        ]
      };

      await updateProduct(req, res, next);

      const passedVariants = findByIdAndUpdateSpy.mock.calls[0][1].variants;
      expect(passedVariants[0].variantId).toBe("var_existing_11111");
      expect(passedVariants[0].isActive).toBe(false);
    });
  });

  describe("SKU registry synchronization", () => {
    it("unchanged SKU remains valid and retains registry entry", async () => {
      vi.spyOn(Product, "findById").mockResolvedValue(mockExistingProduct);
      vi.spyOn(Product, "findByIdAndUpdate").mockResolvedValue(mockExistingProduct);

      req.body = {
        variants: [existingVariant1]
      };

      await updateProduct(req, res, next);

      expect(reconcileProductSkus).toHaveBeenCalledWith(
        productId,
        [
          { sku: "SW-BLK-S", variantId: "var_existing_11111" },
          { sku: "SW-BLK-M", variantId: "var_existing_22222" },
          { sku: "SW-BLK-L", variantId: "var_existing_33333" }
        ],
        [
          { sku: "SW-BLK-S", variantId: "var_existing_11111" }
        ],
        { autoRelease: false }
      );
      expect(mockCommitRelease).toHaveBeenCalledTimes(1);
    });

    it("changing an existing variant SKU reconciles registry entries", async () => {
      vi.spyOn(Product, "findById").mockResolvedValue(mockExistingProduct);
      vi.spyOn(Product, "findByIdAndUpdate").mockResolvedValue(mockExistingProduct);

      req.body = {
        variants: [
          {
            ...existingVariant1,
            sku: "SW-BLK-S-V2"
          }
        ]
      };

      await updateProduct(req, res, next);

      expect(reconcileProductSkus).toHaveBeenCalledWith(
        productId,
        expect.any(Array),
        [
          { sku: "SW-BLK-S-V2", variantId: "var_existing_11111" }
        ],
        { autoRelease: false }
      );
      expect(mockCommitRelease).toHaveBeenCalledTimes(1);
    });

    it("removed variant SKU is released via commitRelease", async () => {
      vi.spyOn(Product, "findById").mockResolvedValue(mockExistingProduct);
      vi.spyOn(Product, "findByIdAndUpdate").mockResolvedValue(mockExistingProduct);

      // Submit only variant 1 and 3 (omitting variant 2)
      req.body = {
        variants: [existingVariant1, existingVariant3]
      };

      await updateProduct(req, res, next);

      expect(reconcileProductSkus).toHaveBeenCalledWith(
        productId,
        expect.arrayContaining([
          expect.objectContaining({ sku: "SW-BLK-M" })
        ]),
        [
          expect.objectContaining({ sku: "SW-BLK-S" }),
          expect.objectContaining({ sku: "SW-BLK-L" })
        ],
        { autoRelease: false }
      );
      expect(mockCommitRelease).toHaveBeenCalledTimes(1);
    });

    it("rejects when SKU belongs to another product (409 conflict)", async () => {
      vi.spyOn(Product, "findById").mockResolvedValue(mockExistingProduct);
      const findByIdAndUpdateSpy = vi.spyOn(Product, "findByIdAndUpdate");

      reconcileProductSkus.mockRejectedValueOnce(
        new AppError("SKU 'CONFLICT-SKU' is already registered", 409, [], "SKU_ALREADY_EXISTS")
      );

      req.body = {
        variants: [
          {
            sku: "CONFLICT-SKU",
            attributes: { size: "XL" },
            stock: 10
          }
        ]
      };

      await updateProduct(req, res, next);

      expect(findByIdAndUpdateSpy).not.toHaveBeenCalled();
      expect(mockCommitRelease).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
      const error = next.mock.calls[0][0];
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe("SKU_ALREADY_EXISTS");
    });
  });

  describe("Stock aggregation invariants", () => {
    it("sums stock of active variants into root product stock", async () => {
      vi.spyOn(Product, "findById").mockResolvedValue(mockExistingProduct);
      const findByIdAndUpdateSpy = vi.spyOn(Product, "findByIdAndUpdate").mockResolvedValue(mockExistingProduct);

      req.body = {
        variants: [
          { ...existingVariant1, stock: 10, isActive: true },
          { ...existingVariant2, stock: 15, isActive: true },
          { ...existingVariant3, stock: 20, isActive: true }
        ]
      };

      await updateProduct(req, res, next);

      expect(findByIdAndUpdateSpy).toHaveBeenCalledWith(
        productId,
        expect.objectContaining({
          stock: 45
        }),
        { new: true, runValidators: true }
      );
    });

    it("excludes inactive variants from root stock calculation", async () => {
      vi.spyOn(Product, "findById").mockResolvedValue(mockExistingProduct);
      const findByIdAndUpdateSpy = vi.spyOn(Product, "findByIdAndUpdate").mockResolvedValue(mockExistingProduct);

      req.body = {
        variants: [
          { ...existingVariant1, stock: 10, isActive: true },
          { ...existingVariant2, stock: 15, isActive: false },
          { ...existingVariant3, stock: 20, isActive: true }
        ]
      };

      await updateProduct(req, res, next);

      expect(findByIdAndUpdateSpy).toHaveBeenCalledWith(
        productId,
        expect.objectContaining({
          stock: 30
        }),
        { new: true, runValidators: true }
      );
    });

    it("sets root stock to 0 when all variants are inactive", async () => {
      vi.spyOn(Product, "findById").mockResolvedValue(mockExistingProduct);
      const findByIdAndUpdateSpy = vi.spyOn(Product, "findByIdAndUpdate").mockResolvedValue(mockExistingProduct);

      req.body = {
        variants: [
          { ...existingVariant1, stock: 10, isActive: false },
          { ...existingVariant2, stock: 15, isActive: false }
        ]
      };

      await updateProduct(req, res, next);

      expect(findByIdAndUpdateSpy).toHaveBeenCalledWith(
        productId,
        expect.objectContaining({
          stock: 0
        }),
        { new: true, runValidators: true }
      );
    });

    it("removed variants no longer contribute to root stock", async () => {
      vi.spyOn(Product, "findById").mockResolvedValue(mockExistingProduct);
      const findByIdAndUpdateSpy = vi.spyOn(Product, "findByIdAndUpdate").mockResolvedValue(mockExistingProduct);

      // Omitting variant 3 (stock 20)
      req.body = {
        variants: [
          { ...existingVariant1, stock: 10, isActive: true },
          { ...existingVariant2, stock: 15, isActive: true }
        ]
      };

      await updateProduct(req, res, next);

      expect(findByIdAndUpdateSpy).toHaveBeenCalledWith(
        productId,
        expect.objectContaining({
          stock: 25
        }),
        { new: true, runValidators: true }
      );
    });

    it("client root stock cannot override calculated stock when variants are submitted", async () => {
      vi.spyOn(Product, "findById").mockResolvedValue(mockExistingProduct);
      const findByIdAndUpdateSpy = vi.spyOn(Product, "findByIdAndUpdate").mockResolvedValue(mockExistingProduct);

      req.body = {
        stock: 999, // Attempt to override
        variants: [
          { ...existingVariant1, stock: 10, isActive: true },
          { ...existingVariant2, stock: 15, isActive: true }
        ]
      };

      await updateProduct(req, res, next);

      expect(findByIdAndUpdateSpy).toHaveBeenCalledWith(
        productId,
        expect.objectContaining({
          stock: 25 // Calculated active variant sum, not 999
        }),
        { new: true, runValidators: true }
      );
    });

    it("client root stock cannot override stock on a variant product when variants is omitted", async () => {
      vi.spyOn(Product, "findById").mockResolvedValue(mockExistingProduct);
      const findByIdAndUpdateSpy = vi.spyOn(Product, "findByIdAndUpdate").mockResolvedValue(mockExistingProduct);

      req.body = {
        name: "Renamed Variant Product",
        stock: 999 // Attempt to override root stock without providing variants
      };

      await updateProduct(req, res, next);

      expect(findByIdAndUpdateSpy).toHaveBeenCalledWith(
        productId,
        {
          name: "Renamed Variant Product"
        },
        { new: true, runValidators: true }
      );
      // Ensure updateData.stock was deleted
      expect(findByIdAndUpdateSpy.mock.calls[0][1].stock).toBeUndefined();
    });
  });

  describe("Failure safety & rollback", () => {
    it("SKU reservation failure leaves Product unchanged", async () => {
      vi.spyOn(Product, "findById").mockResolvedValue(mockExistingProduct);
      const findByIdAndUpdateSpy = vi.spyOn(Product, "findByIdAndUpdate");

      reconcileProductSkus.mockRejectedValueOnce(new AppError("SKU reservation failed", 500));

      req.body = {
        variants: [
          { sku: "SW-NEW-SKU", attributes: { size: "M" }, stock: 10 }
        ]
      };

      await updateProduct(req, res, next);

      expect(findByIdAndUpdateSpy).not.toHaveBeenCalled();
      expect(mockCommitRelease).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
    });

    it("Product update failure rolls back newly reserved SKUs via compensate()", async () => {
      vi.spyOn(Product, "findById").mockResolvedValue(mockExistingProduct);
      vi.spyOn(Product, "findByIdAndUpdate").mockRejectedValueOnce(new Error("Mongoose update error"));

      req.body = {
        variants: [
          { sku: "SW-NEW-SKU", attributes: { size: "M" }, stock: 10 }
        ]
      };

      await updateProduct(req, res, next);

      expect(mockCompensate).toHaveBeenCalledTimes(1);
      expect(mockCommitRelease).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it("rolls back SKUs if Product is concurrently deleted (!product)", async () => {
      vi.spyOn(Product, "findById").mockResolvedValue(mockExistingProduct);
      vi.spyOn(Product, "findByIdAndUpdate").mockResolvedValueOnce(null);

      req.body = {
        variants: [
          { sku: "SW-NEW-SKU", attributes: { size: "M" }, stock: 10 }
        ]
      };

      await updateProduct(req, res, next);

      expect(mockCompensate).toHaveBeenCalledTimes(1);
      expect(mockCommitRelease).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
      const error = next.mock.calls[0][0];
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe("PRODUCT_NOT_FOUND");
    });
  });

  describe("Simple-product compatibility & regression", () => {
    it("updates simple product normally when variants is omitted", async () => {
      const simpleProduct = {
        _id: productId,
        name: "Simple Mug",
        stock: 50,
        variants: []
      };

      vi.spyOn(Product, "findById").mockResolvedValue(simpleProduct);
      const findByIdAndUpdateSpy = vi.spyOn(Product, "findByIdAndUpdate").mockResolvedValue({
        ...simpleProduct,
        name: "Updated Mug Name",
        stock: 75
      });

      req.body = {
        name: "Updated Mug Name",
        stock: 75
      };

      await updateProduct(req, res, next);

      expect(findByIdAndUpdateSpy).toHaveBeenCalledWith(
        productId,
        {
          name: "Updated Mug Name",
          stock: 75
        },
        { new: true, runValidators: true }
      );
      expect(reconcileProductSkus).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("intentionally clears variants and releases old SKUs when variants: [] is supplied", async () => {
      vi.spyOn(Product, "findById").mockResolvedValue(mockExistingProduct);
      const findByIdAndUpdateSpy = vi.spyOn(Product, "findByIdAndUpdate").mockResolvedValue({
        ...mockExistingProduct,
        variants: [],
        stock: 0
      });

      req.body = {
        variants: []
      };

      await updateProduct(req, res, next);

      expect(findByIdAndUpdateSpy).toHaveBeenCalledWith(
        productId,
        expect.objectContaining({ variants: [], stock: 0 }),
        { new: true, runValidators: true }
      );
      expect(reconcileProductSkus).toHaveBeenCalledWith(
        productId,
        expect.any(Array),
        [],
        { autoRelease: false }
      );
      expect(mockCommitRelease).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(next).not.toHaveBeenCalled();
    });

    it("clears variants and sets custom root stock when variants: [] and stock are supplied", async () => {
      vi.spyOn(Product, "findById").mockResolvedValue(mockExistingProduct);
      const findByIdAndUpdateSpy = vi.spyOn(Product, "findByIdAndUpdate").mockResolvedValue({
        ...mockExistingProduct,
        variants: [],
        stock: 50
      });

      req.body = {
        variants: [],
        stock: 50
      };

      await updateProduct(req, res, next);

      expect(findByIdAndUpdateSpy).toHaveBeenCalledWith(
        productId,
        expect.objectContaining({ variants: [], stock: 50 }),
        { new: true, runValidators: true }
      );
      expect(mockCommitRelease).toHaveBeenCalledTimes(1);
    });

    it("preserves 404 not-found behavior when product does not exist", async () => {
      vi.spyOn(Product, "findById").mockResolvedValue(null);
      const findByIdAndUpdateSpy = vi.spyOn(Product, "findByIdAndUpdate");

      req.body = {
        name: "Non-existent Product Update"
      };

      await updateProduct(req, res, next);

      expect(findByIdAndUpdateSpy).not.toHaveBeenCalled();
      expect(reconcileProductSkus).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
      const error = next.mock.calls[0][0];
      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe("PRODUCT_NOT_FOUND");
    });

    it("preserves updates to non-variant fields alongside valid variants", async () => {
      vi.spyOn(Product, "findById").mockResolvedValue(mockExistingProduct);
      const findByIdAndUpdateSpy = vi.spyOn(Product, "findByIdAndUpdate").mockResolvedValue({
        ...mockExistingProduct,
        name: "New Name",
        price: 1599
      });

      req.body = {
        name: "New Name",
        price: 1599,
        variants: [
          {
            variantId: "var_existing_11111",
            sku: "SW-BLK-S",
            attributes: { size: "S" },
            stock: 10
          }
        ]
      };

      await updateProduct(req, res, next);

      expect(findByIdAndUpdateSpy).toHaveBeenCalledWith(
        productId,
        expect.objectContaining({
          name: "New Name",
          price: 1599,
          stock: 10,
          variants: expect.any(Array)
        }),
        { new: true, runValidators: true }
      );
      expect(mockCommitRelease).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(next).not.toHaveBeenCalled();
    });
  });
});
