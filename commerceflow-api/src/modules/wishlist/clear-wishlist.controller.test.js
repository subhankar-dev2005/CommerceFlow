import { describe, it, expect, beforeEach, vi } from "vitest";

import clearWishlist from "./clear-wishlist.controller.js";
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

describe("clearWishlist", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 200 success and clears all items", async () => {
    vi.spyOn(WishlistItem, "deleteMany").mockResolvedValue({ deletedCount: 3 });

    const req  = makeReq();
    const res  = makeRes();
    const next = vi.fn();

    await clearWishlist(req, res, next);

    expect(WishlistItem.deleteMany).toHaveBeenCalledWith({ user: USER_A_ID });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: "Wishlist cleared"
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 200 success when wishlist is already empty (idempotent)", async () => {
    vi.spyOn(WishlistItem, "deleteMany").mockResolvedValue({ deletedCount: 0 });

    const req  = makeReq();
    const res  = makeRes();
    const next = vi.fn();

    await clearWishlist(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it("scopes deleteMany to the authenticated user (User B cannot clear User A's wishlist)", async () => {
    vi.spyOn(WishlistItem, "deleteMany").mockResolvedValue({ deletedCount: 0 });

    const req  = makeReq(USER_B_ID);
    const res  = makeRes();
    const next = vi.fn();

    await clearWishlist(req, res, next);

    expect(WishlistItem.deleteMany).toHaveBeenCalledWith({ user: USER_B_ID });
    /* Only User B's items are targeted — never USER_A_ID */
    expect(WishlistItem.deleteMany).not.toHaveBeenCalledWith({ user: USER_A_ID });
  });

  it("forwards unexpected errors to next()", async () => {
    vi.spyOn(WishlistItem, "deleteMany").mockRejectedValue(new Error("DB error"));

    const req  = makeReq();
    const res  = makeRes();
    const next = vi.fn();

    await clearWishlist(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.status).not.toHaveBeenCalled();
  });
});
