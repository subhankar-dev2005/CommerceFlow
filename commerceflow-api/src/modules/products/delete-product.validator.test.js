import { describe, it, expect, vi } from "vitest";
import { productIdSchema } from "./product.routes.js";
import validate from "../../common/middleware/validate.middleware.js";
import deleteProduct from "./delete-product.controller.js";
import Product from "./product.model.js";

describe("DELETE product validation & boundary", () => {
  const validId = "507f1f77bcf86cd799439011";

  it("1. accepts a valid 24-character hex ObjectId", () => {
    const result = productIdSchema.safeParse({
      params: { id: validId }
    });

    expect(result.success).toBe(true);
    expect(result.data.params.id).toBe(validId);
  });

  it("2. rejects invalid ObjectId format", () => {
    const result = productIdSchema.safeParse({
      params: { id: "not-an-id" }
    });

    expect(result.success).toBe(false);
    expect(
      result.error.issues.some(
        (i) => i.path.includes("id") && i.message === "Invalid product ID"
      )
    ).toBe(true);
  });

  it("3. rejects short, malformed, non-hex IDs", () => {
    const malformedIds = [
      "",
      "123",
      "507f1f77bcf86cd79943901", // 23 chars
      "507f1f77bcf86cd7994390112", // 25 chars
      "507f1f77bcf86cd79943901z", // non-hex character 'z'
      "------------------------"
    ];

    for (const id of malformedIds) {
      const result = productIdSchema.safeParse({
        params: { id }
      });
      expect(result.success).toBe(false);
      expect(
        result.error.issues.some((i) => i.message === "Invalid product ID")
      ).toBe(true);
    }
  });

  it("verifies invalid ID is blocked at the validation boundary before reaching the controller", () => {
    const middleware = validate(productIdSchema);

    const req = {
      body: {},
      query: {},
      params: { id: "invalid-id-123" }
    };
    const res = {};
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeDefined();
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "params.id",
          message: "Invalid product ID"
        })
      ])
    );
  });

  it("4. preserves existing soft-delete behavior for valid IDs passing through validation", async () => {
    const middleware = validate(productIdSchema);

    const req = {
      body: {},
      query: {},
      params: { id: validId },
      requestId: "req-valid-del-test"
    };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };
    const next = vi.fn();

    // Pass through validation
    middleware(req, res, next);
    expect(next).toHaveBeenCalledWith();

    // Now call deleteProduct controller as would happen next in the Express pipeline
    const updatedProduct = {
      _id: validId,
      name: "Valid Laptop",
      isActive: false
    };

    const findByIdAndUpdateSpy = vi
      .spyOn(Product, "findByIdAndUpdate")
      .mockResolvedValue(updatedProduct);

    const controllerNext = vi.fn();
    await deleteProduct(req, res, controllerNext);

    expect(findByIdAndUpdateSpy).toHaveBeenCalledWith(
      validId,
      { isActive: false },
      { new: true }
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Product deleted successfully",
      requestId: "req-valid-del-test"
    });
    expect(controllerNext).not.toHaveBeenCalled();
  });
});
