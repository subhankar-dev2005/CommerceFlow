import { describe, it, expect } from "vitest";
import WishlistItem from "./wishlist-item.model.js";

describe("WishlistItem model", () => {
  it("has a user field of ObjectId type", () => {
    const userPath = WishlistItem.schema.path("user");
    expect(userPath).toBeDefined();
    expect(userPath.instance).toBe("ObjectId");
  });

  it("has a product field of ObjectId type", () => {
    const productPath = WishlistItem.schema.path("product");
    expect(productPath).toBeDefined();
    expect(productPath.instance).toBe("ObjectId");
  });

  it("has an addedAt Date field with a default", () => {
    const addedAtPath = WishlistItem.schema.path("addedAt");
    expect(addedAtPath).toBeDefined();
    expect(addedAtPath.instance).toBe("Date");
    expect(addedAtPath.defaultValue).toBeDefined();
  });

  it("does not have a price field", () => {
    expect(WishlistItem.schema.path("price")).toBeUndefined();
  });

  it("does not have a stock field", () => {
    expect(WishlistItem.schema.path("stock")).toBeUndefined();
  });

  it("does not have a name field", () => {
    expect(WishlistItem.schema.path("name")).toBeUndefined();
  });

  it("does not have a quantity field", () => {
    expect(WishlistItem.schema.path("quantity")).toBeUndefined();
  });

  it("does not have a category field", () => {
    expect(WishlistItem.schema.path("category")).toBeUndefined();
  });

  it("has compound unique index { user: 1, product: 1 }", () => {
    const indexes = WishlistItem.schema.indexes();
    const compoundUnique = indexes.find(([fields, opts]) => {
      return (
        fields.user === 1 &&
        fields.product === 1 &&
        opts.unique === true
      );
    });
    expect(compoundUnique).toBeDefined();
  });

  it("has secondary index on product", () => {
    const indexes = WishlistItem.schema.indexes();
    const productIndex = indexes.find(([fields]) => {
      return (
        fields.product === 1 &&
        Object.keys(fields).length === 1
      );
    });
    expect(productIndex).toBeDefined();
  });

  it("does not have timestamps enabled", () => {
    expect(WishlistItem.schema.options.timestamps).toBeFalsy();
  });
});
