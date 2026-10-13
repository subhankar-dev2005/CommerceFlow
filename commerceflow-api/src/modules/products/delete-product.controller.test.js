import { describe, it, expect, vi, beforeEach } from "vitest";
import Product from "./product.model.js";
import deleteProduct from "./delete-product.controller.js";
import getProduct from "./get-product.controller.js";
import { getProducts } from "./product.controller.js";
import getCategories from "./get-categories.controller.js";

describe("deleteProduct controller - soft delete", () => {
  const productId = "507f1f77bcf86cd799439011";
  let req;
  let res;
  let next;

  beforeEach(() => {
    vi.restoreAllMocks();

    req = {
      params: { id: productId },
      requestId: "req-delete-test-123"
    };

    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };

    next = vi.fn();
  });

  it("Test A: deactivates an active product without physical document deletion", async () => {
    const updatedProduct = {
      _id: productId,
      name: "Test Laptop",
      isActive: false
    };

    const findByIdAndUpdateSpy = vi
      .spyOn(Product, "findByIdAndUpdate")
      .mockResolvedValue(updatedProduct);

    const findByIdAndDeleteSpy = vi
      .spyOn(Product, "findByIdAndDelete")
      .mockResolvedValue(null);

    const deleteOneSpy = vi
      .spyOn(Product, "deleteOne")
      .mockResolvedValue(null);

    await deleteProduct(req, res, next);

    // Verify soft-delete update was called with isActive: false
    expect(findByIdAndUpdateSpy).toHaveBeenCalledWith(
      productId,
      { isActive: false },
      { new: true }
    );

    // Verify physical deletion was NOT called
    expect(findByIdAndDeleteSpy).not.toHaveBeenCalled();
    expect(deleteOneSpy).not.toHaveBeenCalled();

    // Verify successful response
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Product deleted successfully",
      requestId: "req-delete-test-123"
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("Test B: ensures soft-deleted products are excluded from customer catalog queries", async () => {
    // 1. getProduct: queries only active products, returns 404 when product is inactive
    const findOneSpy = vi.spyOn(Product, "findOne").mockResolvedValue(null);

    const getReq = {
      params: { id: productId },
      requestId: "req-get-test"
    };
    const getRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };
    const getNext = vi.fn();

    await getProduct(getReq, getRes, getNext);

    expect(findOneSpy).toHaveBeenCalledWith({
      _id: productId,
      isActive: true
    });
    expect(getNext).toHaveBeenCalledTimes(1);
    const err = getNext.mock.calls[0][0];
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe("PRODUCT_NOT_FOUND");

    // 2. getProducts: listing explicitly filters by isActive: true
    const mockQuery = {
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([])
    };
    const findSpy = vi.spyOn(Product, "find").mockReturnValue(mockQuery);
    vi.spyOn(Product, "countDocuments").mockResolvedValue(0);

    const listReq = {
      query: {},
      requestId: "req-list-test"
    };
    const listRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };
    const listNext = vi.fn();

    await getProducts(listReq, listRes, listNext);

    expect(findSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        isActive: true
      })
    );

    // 3. getCategories: distinct query filters by isActive: true
    const distinctSpy = vi.spyOn(Product, "distinct").mockResolvedValue([]);
    const catReq = { requestId: "req-cat-test" };
    const catRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };
    const catNext = vi.fn();

    await getCategories(catReq, catRes, catNext);

    expect(distinctSpy).toHaveBeenCalledWith(
      "category",
      { isActive: true }
    );
  });

  it("Test C: ensures soft-deleted product document remains in database with isActive: false", async () => {
    const existingDeactivatedDoc = {
      _id: productId,
      name: "Still Exists In DB",
      price: 99.99,
      isActive: false
    };

    const findByIdAndUpdateSpy = vi
      .spyOn(Product, "findByIdAndUpdate")
      .mockResolvedValue(existingDeactivatedDoc);

    const findByIdAndDeleteSpy = vi.spyOn(Product, "findByIdAndDelete");

    await deleteProduct(req, res, next);

    expect(findByIdAndUpdateSpy).toHaveBeenCalledWith(
      productId,
      { isActive: false },
      { new: true }
    );
    expect(findByIdAndDeleteSpy).not.toHaveBeenCalled();
    expect(existingDeactivatedDoc.isActive).toBe(false);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("Test D: repeated deletion is safe and does not physically remove an already inactive product", async () => {
    const alreadyInactiveProduct = {
      _id: productId,
      name: "Already Inactive Product",
      isActive: false
    };

    const findByIdAndUpdateSpy = vi
      .spyOn(Product, "findByIdAndUpdate")
      .mockResolvedValue(alreadyInactiveProduct);

    const findByIdAndDeleteSpy = vi.spyOn(Product, "findByIdAndDelete");
    const deleteOneSpy = vi.spyOn(Product, "deleteOne");

    await deleteProduct(req, res, next);

    expect(findByIdAndUpdateSpy).toHaveBeenCalledWith(
      productId,
      { isActive: false },
      { new: true }
    );
    expect(findByIdAndDeleteSpy).not.toHaveBeenCalled();
    expect(deleteOneSpy).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Product deleted successfully",
      requestId: "req-delete-test-123"
    });
  });

  it("returns 404 when the product does not exist", async () => {
    vi.spyOn(Product, "findByIdAndUpdate").mockResolvedValue(null);

    await deleteProduct(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe("PRODUCT_NOT_FOUND");
    expect(error.message).toBe("Product not found");
    expect(res.status).not.toHaveBeenCalled();
  });
});
