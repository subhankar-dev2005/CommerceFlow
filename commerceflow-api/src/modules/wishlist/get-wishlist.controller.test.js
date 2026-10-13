import { describe, it, expect, beforeEach, vi } from "vitest";

import getWishlist from "./get-wishlist.controller.js";
import WishlistItem from "./wishlist-item.model.js";

const USER_A_ID = "507f1f77bcf86cd799439012";
const USER_B_ID = "507f1f77bcf86cd799439099";

function makeReq(userId = USER_A_ID) {
  return {
    user: { _id: userId },
    requestId: "test-request-id"
  };
}

function makeRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn()
  };
}

/*
 * Chainable mock for WishlistItem.find().populate().sort().lean()
 */
function mockFind(resolvedItems) {
  const chain = {
    populate: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(resolvedItems)
  };
  vi.spyOn(WishlistItem, "find").mockReturnValue(chain);
  return chain;
}

describe("getWishlist", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns empty items array when wishlist is empty", async () => {
    mockFind([]);

    const req  = makeReq();
    const res  = makeRes();
    const next = vi.fn();

    await getWishlist(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: { items: [], totalItems: 0 }
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("queries only by the authenticated user's ID", async () => {
    mockFind([]);

    const req  = makeReq(USER_A_ID);
    const res  = makeRes();
    const next = vi.fn();

    await getWishlist(req, res, next);

    expect(WishlistItem.find).toHaveBeenCalledWith({ user: USER_A_ID });
  });

  it("returns active products in the wishlist", async () => {
    const activeProduct = {
      _id: "507f1f77bcf86cd799439011",
      name: "Widget",
      price: 500,
      stock: 10,
      category: "Electronics",
      image: null,
      images: [],
      isActive: true
    };

    mockFind([
      { addedAt: new Date("2026-01-01"), product: activeProduct }
    ]);

    const req  = makeReq();
    const res  = makeRes();
    const next = vi.fn();

    await getWishlist(req, res, next);

    const { data } = res.json.mock.calls[0][0];
    expect(data.totalItems).toBe(1);
    expect(data.items[0].product._id).toBe(activeProduct._id);
  });

  it("includes out-of-stock active products", async () => {
    const outOfStockProduct = {
      _id: "507f1f77bcf86cd799439011",
      name: "Sold Out Widget",
      price: 500,
      stock: 0,          // out of stock
      category: "Electronics",
      image: null,
      images: [],
      isActive: true     // still active
    };

    mockFind([
      { addedAt: new Date(), product: outOfStockProduct }
    ]);

    const req  = makeReq();
    const res  = makeRes();
    const next = vi.fn();

    await getWishlist(req, res, next);

    const { data } = res.json.mock.calls[0][0];
    expect(data.totalItems).toBe(1);
    expect(data.items[0].product.stock).toBe(0);
  });

  it("omits items where product is inactive (isActive: false)", async () => {
    const inactiveProduct = {
      _id: "507f1f77bcf86cd799439011",
      name: "Old Widget",
      price: 500,
      stock: 5,
      isActive: false
    };

    mockFind([
      { addedAt: new Date(), product: inactiveProduct }
    ]);

    const req  = makeReq();
    const res  = makeRes();
    const next = vi.fn();

    await getWishlist(req, res, next);

    const { data } = res.json.mock.calls[0][0];
    expect(data.totalItems).toBe(0);
    expect(data.items).toHaveLength(0);
  });

  it("omits items where product reference is null (soft-deleted)", async () => {
    mockFind([
      { addedAt: new Date(), product: null }
    ]);

    const req  = makeReq();
    const res  = makeRes();
    const next = vi.fn();

    await getWishlist(req, res, next);

    const { data } = res.json.mock.calls[0][0];
    expect(data.totalItems).toBe(0);
    expect(data.items).toHaveLength(0);
  });

  it("returns a mix of active and inactive, only including active", async () => {
    const active   = { _id: "aaa", name: "Active", price: 100, stock: 5, isActive: true, category: "A", image: null, images: [] };
    const inactive = { _id: "bbb", name: "Inactive", price: 200, stock: 2, isActive: false, category: "B", image: null, images: [] };

    mockFind([
      { addedAt: new Date("2026-01-02"), product: active },
      { addedAt: new Date("2026-01-01"), product: inactive }
    ]);

    const req  = makeReq();
    const res  = makeRes();
    const next = vi.fn();

    await getWishlist(req, res, next);

    const { data } = res.json.mock.calls[0][0];
    expect(data.totalItems).toBe(1);
    expect(data.items[0].product._id).toBe("aaa");
  });

  it("response shape contains only addedAt and product per item (no user field)", async () => {
    const product = {
      _id: "507f1f77bcf86cd799439011",
      name: "Widget",
      price: 500,
      stock: 10,
      category: "Electronics",
      image: null,
      images: [],
      isActive: true
    };

    mockFind([{ addedAt: new Date("2026-01-01"), product }]);

    const req  = makeReq();
    const res  = makeRes();
    const next = vi.fn();

    await getWishlist(req, res, next);

    const { data } = res.json.mock.calls[0][0];
    const item = data.items[0];

    expect(item).toHaveProperty("addedAt");
    expect(item).toHaveProperty("product");
    expect(item).not.toHaveProperty("user");
    expect(item).not.toHaveProperty("_id");
  });

  it("forwards unexpected errors to next()", async () => {
    vi.spyOn(WishlistItem, "find").mockImplementation(() => {
      throw new Error("DB error");
    });

    const req  = makeReq();
    const res  = makeRes();
    const next = vi.fn();

    await getWishlist(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.status).not.toHaveBeenCalled();
  });
});
