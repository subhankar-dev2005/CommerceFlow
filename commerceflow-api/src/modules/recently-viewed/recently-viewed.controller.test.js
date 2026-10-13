import { describe, it, expect, beforeEach, vi } from "vitest";
import * as controller from "./recently-viewed.controller.js";
import * as service from "./recently-viewed.service.js";

const USER_ID = "507f1f77bcf86cd799439011";
const PRODUCT_ID = "607f1f77bcf86cd799439021";
const REQUEST_ID = "req-test-123";

function makeReq(overrides = {}) {
  return {
    user: { _id: USER_ID },
    body: {},
    query: {},
    params: {},
    requestId: REQUEST_ID,
    ...overrides
  };
}

function makeRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis()
  };
}

describe("recently-viewed.controller", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("recordProductView", () => {
    it("returns 200 with result when service succeeds", async () => {
      const mockResult = {
        productId: PRODUCT_ID,
        viewedAt: new Date("2026-10-01T10:00:00Z")
      };
      vi.spyOn(service, "recordProductView").mockResolvedValue(mockResult);

      const req = makeReq({ body: { productId: PRODUCT_ID } });
      const res = makeRes();
      const next = vi.fn();

      await controller.recordProductView(req, res, next);

      expect(service.recordProductView).toHaveBeenCalledWith(USER_ID, PRODUCT_ID);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Product view recorded successfully",
        data: mockResult,
        requestId: REQUEST_ID
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("forwards errors to next()", async () => {
      const err = new Error("Service error");
      vi.spyOn(service, "recordProductView").mockRejectedValue(err);

      const req = makeReq({ body: { productId: PRODUCT_ID } });
      const res = makeRes();
      const next = vi.fn();

      await controller.recordProductView(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe("getRecentlyViewed", () => {
    it("returns 200 with items when service succeeds", async () => {
      const mockResult = {
        items: [
          {
            viewedAt: new Date(),
            product: { _id: PRODUCT_ID, name: "Tent", price: 1000 }
          }
        ],
        totalItems: 1
      };
      vi.spyOn(service, "getRecentlyViewed").mockResolvedValue(mockResult);

      const req = makeReq({ query: { limit: 5 } });
      const res = makeRes();
      const next = vi.fn();

      await controller.getRecentlyViewed(req, res, next);

      expect(service.getRecentlyViewed).toHaveBeenCalledWith(USER_ID, 5);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Recently viewed products retrieved successfully",
        data: mockResult,
        requestId: REQUEST_ID
      });
    });

    it("forwards errors to next()", async () => {
      const err = new Error("Database error");
      vi.spyOn(service, "getRecentlyViewed").mockRejectedValue(err);

      const req = makeReq();
      const res = makeRes();
      const next = vi.fn();

      await controller.getRecentlyViewed(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe("clearRecentlyViewed", () => {
    it("returns 200 with clear message when service succeeds", async () => {
      vi.spyOn(service, "clearRecentlyViewed").mockResolvedValue({ success: true });

      const req = makeReq();
      const res = makeRes();
      const next = vi.fn();

      await controller.clearRecentlyViewed(req, res, next);

      expect(service.clearRecentlyViewed).toHaveBeenCalledWith(USER_ID);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Recently viewed history cleared successfully",
        requestId: REQUEST_ID
      });
    });

    it("forwards errors to next()", async () => {
      const err = new Error("Delete failed");
      vi.spyOn(service, "clearRecentlyViewed").mockRejectedValue(err);

      const req = makeReq();
      const res = makeRes();
      const next = vi.fn();

      await controller.clearRecentlyViewed(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe("mergeRecentlyViewed", () => {
    it("returns 200 with mergedCount when service succeeds", async () => {
      const mockResult = { mergedCount: 3 };
      vi.spyOn(service, "mergeRecentlyViewed").mockResolvedValue(mockResult);

      const req = makeReq({ body: { productIds: [PRODUCT_ID] } });
      const res = makeRes();
      const next = vi.fn();

      await controller.mergeRecentlyViewed(req, res, next);

      expect(service.mergeRecentlyViewed).toHaveBeenCalledWith(USER_ID, [PRODUCT_ID]);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Recently viewed products merged successfully",
        data: mockResult,
        requestId: REQUEST_ID
      });
    });

    it("forwards errors to next()", async () => {
      const err = new Error("Merge failed");
      vi.spyOn(service, "mergeRecentlyViewed").mockRejectedValue(err);

      const req = makeReq({ body: { productIds: [PRODUCT_ID] } });
      const res = makeRes();
      const next = vi.fn();

      await controller.mergeRecentlyViewed(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });
});
