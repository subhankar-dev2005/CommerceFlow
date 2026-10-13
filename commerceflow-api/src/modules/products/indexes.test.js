import { describe, it, expect } from "vitest";
import Product from "./product.model.js";

describe("Product Schema Indexes", () => {
  it("defines expected indexes on product schema", () => {
    const indexes = Product.schema.indexes();

    expect(indexes).toContainEqual([
      { name: "text", description: "text" },
      {}
    ]);

    expect(indexes).toContainEqual([
      { isActive: 1, createdAt: -1 },
      {}
    ]);

    expect(indexes).toContainEqual([
      { category: 1, isActive: 1, createdAt: -1 },
      {}
    ]);

    expect(indexes).toContainEqual([
      { isActive: 1, price: 1 },
      {}
    ]);
  });
});
