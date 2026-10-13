import { describe, it, expect, beforeEach, vi } from "vitest";

import addWishlistItem from "./add-wishlist-item.controller.js";
import WishlistItem from "./wishlist-item.model.js";
import Product from "../products/product.model.js";

const PRODUCT_ID = "507f1f77bcf86cd799439011";
const USER_ID    = "507f1f77bcf86cd799439012";
const REQUEST_ID = "test-request-id";

function makeReq(overrides = {}) {
  return {
    body: { productId: PRODUCT_ID },
    user: { _id: USER_ID },
    requestId: REQUEST_ID,
    ...overrides
  };
}

function makeRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn()
  };
}

describe("addWishlistItem", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns PRODUCT_NOT_FOUND when product does not exist", async () => {
    vi.spyOn(Product, "findOne").mockResolvedValue(null);

    const req  = makeReq();
    const res  = makeRes();
    const next = vi.fn();

    await addWishlistItem(req, res, next);

    expect(Product.findOne).toHaveBeenCalledWith({
      _id: PRODUCT_ID,
      isActive: true
    });
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        code: "PRODUCT_NOT_FOUND"
      })
    );
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns PRODUCT_NOT_FOUND when product is inactive", async () => {
    /* findOne({ _id, isActive: true }) returns null for inactive products */
    vi.spyOn(Product, "findOne").mockResolvedValue(null);

    const req  = makeReq();
    const res  = makeRes();
    const next = vi.fn();

    await addWishlistItem(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: "PRODUCT_NOT_FOUND" })
    );
  });

  it("creates a wishlist item for an active in-stock product", async () => {
    vi.spyOn(Product, "findOne").mockResolvedValue({
      _id: PRODUCT_ID,
      name: "Test Product",
      stock: 5,
      isActive: true
    });

    const createdItem = {
      user: USER_ID,
      product: PRODUCT_ID,
      addedAt: new Date("2026-01-01T00:00:00.000Z")
    };
    vi.spyOn(WishlistItem, "create").mockResolvedValue(createdItem);

    const req  = makeReq();
    const res  = makeRes();
    const next = vi.fn();

    await addWishlistItem(req, res, next);

    expect(WishlistItem.create).toHaveBeenCalledWith({
      user: USER_ID,
      product: PRODUCT_ID
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: "Product added to wishlist"
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("creates a wishlist item for an active OUT-OF-STOCK product (stock not required)", async () => {
    vi.spyOn(Product, "findOne").mockResolvedValue({
      _id: PRODUCT_ID,
      name: "Test Product",
      stock: 0,    // out of stock
      isActive: true
    });

    const createdItem = {
      user: USER_ID,
      product: PRODUCT_ID,
      addedAt: new Date()
    };
    vi.spyOn(WishlistItem, "create").mockResolvedValue(createdItem);

    const req  = makeReq();
    const res  = makeRes();
    const next = vi.fn();

    await addWishlistItem(req, res, next);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns WISHLIST_ITEM_EXISTS (409) on duplicate (unique index 11000 error)", async () => {
    vi.spyOn(Product, "findOne").mockResolvedValue({
      _id: PRODUCT_ID,
      isActive: true,
      stock: 10
    });

    const duplicateError = new Error("duplicate");
    duplicateError.code = 11000;
    vi.spyOn(WishlistItem, "create").mockRejectedValue(duplicateError);

    const req  = makeReq();
    const res  = makeRes();
    const next = vi.fn();

    await addWishlistItem(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 409,
        code: "WISHLIST_ITEM_EXISTS"
      })
    );
    expect(res.status).not.toHaveBeenCalled();
  });

  it("stored document does not contain price, stock, name, or image", async () => {
    vi.spyOn(Product, "findOne").mockResolvedValue({
      _id: PRODUCT_ID,
      name: "Test",
      price: 999,
      stock: 5,
      isActive: true
    });

    const capturedData = {};
    vi.spyOn(WishlistItem, "create").mockImplementation((data) => {
      Object.assign(capturedData, data);
      return Promise.resolve({ ...data, addedAt: new Date() });
    });

    const req  = makeReq();
    const res  = makeRes();
    const next = vi.fn();

    await addWishlistItem(req, res, next);

    expect(capturedData).not.toHaveProperty("price");
    expect(capturedData).not.toHaveProperty("stock");
    expect(capturedData).not.toHaveProperty("name");
    expect(capturedData).not.toHaveProperty("image");
    expect(capturedData).not.toHaveProperty("quantity");
    expect(capturedData).toHaveProperty("user", USER_ID);
    expect(capturedData).toHaveProperty("product", PRODUCT_ID);
  });

  it("forwards unexpected errors to next()", async () => {
    vi.spyOn(Product, "findOne").mockRejectedValue(new Error("DB down"));

    const req  = makeReq();
    const res  = makeRes();
    const next = vi.fn();

    await addWishlistItem(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.status).not.toHaveBeenCalled();
  });
});
