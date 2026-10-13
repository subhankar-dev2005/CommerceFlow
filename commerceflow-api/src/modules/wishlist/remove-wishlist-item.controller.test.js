import { describe, it, expect, beforeEach, vi } from "vitest";

import removeWishlistItem from "./remove-wishlist-item.controller.js";
import WishlistItem from "./wishlist-item.model.js";

const PRODUCT_ID = "507f1f77bcf86cd799439011";
const USER_A_ID  = "507f1f77bcf86cd799439012";
const USER_B_ID  = "507f1f77bcf86cd799439099";

function makeReq(userId = USER_A_ID, productId = PRODUCT_ID) {
  return {
    params: { productId },
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

describe("removeWishlistItem", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 200 success when the item exists", async () => {
    vi.spyOn(WishlistItem, "deleteOne").mockResolvedValue({ deletedCount: 1 });

    const req  = makeReq();
    const res  = makeRes();
    const next = vi.fn();

    await removeWishlistItem(req, res, next);

    expect(WishlistItem.deleteOne).toHaveBeenCalledWith({
      user: USER_A_ID,
      product: PRODUCT_ID
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: "Product removed from wishlist"
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 200 success even when the item does not exist (idempotent)", async () => {
    vi.spyOn(WishlistItem, "deleteOne").mockResolvedValue({ deletedCount: 0 });

    const req  = makeReq();
    const res  = makeRes();
    const next = vi.fn();

    await removeWishlistItem(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it("scopes deleteOne to the authenticated user only (IDOR protection)", async () => {
    vi.spyOn(WishlistItem, "deleteOne").mockResolvedValue({ deletedCount: 0 });

    /*
     * User B cannot delete User A's wishlist item.
     * The controller always uses req.user._id — never a client-supplied userId.
     */
    const req  = makeReq(USER_B_ID, PRODUCT_ID);
    const res  = makeRes();
    const next = vi.fn();

    await removeWishlistItem(req, res, next);

    expect(WishlistItem.deleteOne).toHaveBeenCalledWith({
      user: USER_B_ID,   // only User B's own record
      product: PRODUCT_ID
    });
  });

  it("returns 200 when productId corresponds to a soft-deleted product", async () => {
    /* Remove does not check product existence; productId is enough. */
    vi.spyOn(WishlistItem, "deleteOne").mockResolvedValue({ deletedCount: 1 });

    const req  = makeReq();
    const res  = makeRes();
    const next = vi.fn();

    await removeWishlistItem(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("forwards unexpected errors to next()", async () => {
    vi.spyOn(WishlistItem, "deleteOne").mockRejectedValue(new Error("DB error"));

    const req  = makeReq();
    const res  = makeRes();
    const next = vi.fn();

    await removeWishlistItem(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.status).not.toHaveBeenCalled();
  });
});
