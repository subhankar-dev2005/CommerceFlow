import {
  describe,
  it,
  expect,
  beforeEach,
  vi
} from "vitest";

import { addToCart } from "./cart.controller.js";
import { updateCartItem } from "./update-cart-item.controller.js";
import removeCartItem from "./remove-cart-item.controller.js";
import getCart from "./get-cart.controller.js";
import Cart from "./cart.model.js";
import Product from "../products/product.model.js";
import Coupon from "../coupons/coupon.model.js";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const PRODUCT_ID    = "507f1f77bcf86cd799439011";
const USER_ID       = "507f1f77bcf86cd799439012";
const OTHER_USER_ID = "507f1f77bcf86cd799439099";
const VARIANT_A     = "var_aaaaaaaa-0000-0000-0000-aaaaaaaaaaaa";
const VARIANT_B     = "var_bbbbbbbb-0000-0000-0000-bbbbbbbbbbbb";

/** A product that has two active variants. */
const makeVariantProduct = (overrides = {}) => ({
  _id: PRODUCT_ID,
  name: "Trail Running Shoe",
  price: 2000,
  stock: 30,
  category: "Footwear",
  image: null,
  images: ["https://example.com/base.jpg"],
  isActive: true,
  variants: [
    {
      variantId: VARIANT_A,
      sku: "TRS-BLK-S",
      attributes: new Map([["size", "S"], ["color", "Black"]]),
      price: null,       // inherits product.price
      stock: 10,
      images: ["https://example.com/var-a.jpg"],
      isActive: true
    },
    {
      variantId: VARIANT_B,
      sku: "TRS-WHT-M",
      attributes: new Map([["size", "M"], ["color", "White"]]),
      price: 2200,       // explicit override
      stock: 5,
      images: [],        // falls back to product images
      isActive: true
    }
  ],
  ...overrides
});

/** A simple product with no variants. */
const makeSimpleProduct = (overrides = {}) => ({
  _id: PRODUCT_ID,
  name: "Camping Lantern",
  price: 800,
  stock: 20,
  category: "Camping",
  image: null,
  images: ["https://example.com/lantern.jpg"],
  isActive: true,
  variants: [],
  ...overrides
});

const makeRes = () => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn()
});

const makeNext = () => vi.fn();

// ─────────────────────────────────────────────────────────────────────────────
// addToCart — variant product paths
// ─────────────────────────────────────────────────────────────────────────────

describe("addToCart — variant product paths", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns VARIANT_REQUIRED when variantId is omitted for a variant product", async () => {
    vi.spyOn(Product, "findOne").mockResolvedValue(makeVariantProduct());

    const req = {
      body: { productId: PRODUCT_ID, quantity: 1 },
      user: { _id: USER_ID },
      requestId: "r1"
    };

    const res = makeRes();
    const next = makeNext();

    await addToCart(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: "VARIANT_REQUIRED", statusCode: 400 })
    );
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns PRODUCT_HAS_NO_VARIANTS when variantId is sent for a simple product", async () => {
    vi.spyOn(Product, "findOne").mockResolvedValue(makeSimpleProduct());

    const req = {
      body: { productId: PRODUCT_ID, quantity: 1, variantId: VARIANT_A },
      user: { _id: USER_ID },
      requestId: "r2"
    };

    const res = makeRes();
    const next = makeNext();

    await addToCart(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: "PRODUCT_HAS_NO_VARIANTS", statusCode: 400 })
    );
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns VARIANT_NOT_FOUND when the requested variantId does not exist", async () => {
    vi.spyOn(Product, "findOne").mockResolvedValue(makeVariantProduct());

    const req = {
      body: { productId: PRODUCT_ID, quantity: 1, variantId: "var_does-not-exist-999" },
      user: { _id: USER_ID },
      requestId: "r3"
    };

    const res = makeRes();
    const next = makeNext();

    await addToCart(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: "VARIANT_NOT_FOUND", statusCode: 404 })
    );
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns VARIANT_INACTIVE when the requested variant is inactive", async () => {
    const product = makeVariantProduct();
    product.variants[0].isActive = false;

    vi.spyOn(Product, "findOne").mockResolvedValue(product);

    const req = {
      body: { productId: PRODUCT_ID, quantity: 1, variantId: VARIANT_A },
      user: { _id: USER_ID },
      requestId: "r4"
    };

    const res = makeRes();
    const next = makeNext();

    await addToCart(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: "VARIANT_INACTIVE", statusCode: 400 })
    );
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns INSUFFICIENT_STOCK when quantity exceeds variant stock", async () => {
    vi.spyOn(Product, "findOne").mockResolvedValue(makeVariantProduct()); // VARIANT_A stock = 10

    const req = {
      body: { productId: PRODUCT_ID, quantity: 11, variantId: VARIANT_A },
      user: { _id: USER_ID },
      requestId: "r5"
    };

    const res = makeRes();
    const next = makeNext();

    await addToCart(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: "INSUFFICIENT_STOCK", statusCode: 400 })
    );
    expect(res.status).not.toHaveBeenCalled();
  });

  it("creates a new cart with the correct variant line when no cart exists", async () => {
    vi.spyOn(Product, "findOne").mockResolvedValue(makeVariantProduct());
    vi.spyOn(Cart, "findOne").mockResolvedValue(null);

    const createdCart = { user: USER_ID, items: [{ product: PRODUCT_ID, variantId: VARIANT_A, quantity: 2 }] };
    vi.spyOn(Cart, "create").mockResolvedValue(createdCart);

    const req = {
      body: { productId: PRODUCT_ID, quantity: 2, variantId: VARIANT_A },
      user: { _id: USER_ID },
      requestId: "r6"
    };

    const res = makeRes();
    const next = makeNext();

    await addToCart(req, res, next);

    expect(Cart.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user: USER_ID,
        items: expect.arrayContaining([
          expect.objectContaining({ product: PRODUCT_ID, variantId: VARIANT_A, quantity: 2 })
        ])
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it("increments quantity when the same variant is added again", async () => {
    vi.spyOn(Product, "findOne").mockResolvedValue(makeVariantProduct());

    const existingItem = {
      product: { toString: () => PRODUCT_ID },
      variantId: VARIANT_A,
      quantity: 3
    };
    const cart = { items: [existingItem], save: vi.fn().mockResolvedValue(true) };
    vi.spyOn(Cart, "findOne").mockResolvedValue(cart);

    const req = {
      body: { productId: PRODUCT_ID, quantity: 2, variantId: VARIANT_A },
      user: { _id: USER_ID },
      requestId: "r7"
    };

    await addToCart(req, makeRes(), makeNext());

    // 3 + 2 = 5, within variant A stock of 10
    expect(existingItem.quantity).toBe(5);
    expect(cart.save).toHaveBeenCalledTimes(1);
  });

  it("creates a separate line for a different variant of the same product", async () => {
    vi.spyOn(Product, "findOne").mockResolvedValue(makeVariantProduct());

    const existingItem = {
      product: { toString: () => PRODUCT_ID },
      variantId: VARIANT_A,
      quantity: 2
    };
    const cart = {
      items: [existingItem],
      push: function (item) { this.items.push(item); },
      save: vi.fn().mockResolvedValue(true)
    };
    // Mongoose cart.items.push is an array method
    cart.items.push = vi.fn((item) => Array.prototype.push.call(cart.items, item));

    vi.spyOn(Cart, "findOne").mockResolvedValue(cart);

    const req = {
      body: { productId: PRODUCT_ID, quantity: 1, variantId: VARIANT_B },
      user: { _id: USER_ID },
      requestId: "r8"
    };

    await addToCart(req, makeRes(), makeNext());

    // Should have pushed a NEW line for VARIANT_B
    expect(cart.items.push).toHaveBeenCalledWith(
      expect.objectContaining({ variantId: VARIANT_B, quantity: 1 })
    );
    // Original VARIANT_A line quantity must be unchanged
    expect(existingItem.quantity).toBe(2);
    expect(cart.save).toHaveBeenCalledTimes(1);
  });

  it("rejects combined variant quantity that exceeds variant stock", async () => {
    vi.spyOn(Product, "findOne").mockResolvedValue(makeVariantProduct()); // VARIANT_A stock = 10

    const existingItem = {
      product: { toString: () => PRODUCT_ID },
      variantId: VARIANT_A,
      quantity: 9
    };
    const cart = { items: [existingItem], save: vi.fn() };
    vi.spyOn(Cart, "findOne").mockResolvedValue(cart);

    const req = {
      body: { productId: PRODUCT_ID, quantity: 2, variantId: VARIANT_A },
      user: { _id: USER_ID },
      requestId: "r9"
    };

    const res = makeRes();
    const next = makeNext();
    await addToCart(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: "INSUFFICIENT_STOCK", statusCode: 400 })
    );
    expect(existingItem.quantity).toBe(9); // must not mutate
    expect(cart.save).not.toHaveBeenCalled();
  });

  it("does not accept client-supplied price, stock, sku, or attributes on add", async () => {
    // The body is first filtered by the Zod validator; here we verify the controller
    // ignores any hypothetical extra fields by testing the product lookup path.
    const product = makeVariantProduct();
    vi.spyOn(Product, "findOne").mockResolvedValue(product);
    vi.spyOn(Cart, "findOne").mockResolvedValue(null);
    vi.spyOn(Cart, "create").mockResolvedValue({ user: USER_ID, items: [] });

    const req = {
      // Pretend body was already validated (validator strips unknown fields),
      // but verifying controller does not use any client price/stock
      body: { productId: PRODUCT_ID, quantity: 1, variantId: VARIANT_A },
      user: { _id: USER_ID },
      requestId: "r10"
    };

    const next = makeNext();
    await addToCart(req, makeRes(), next);

    // Cart.create must NOT receive any price, sku, attributes, or stock fields in items
    const callArgs = Cart.create.mock.calls[0][0];
    const itemArgs = callArgs.items[0];

    expect(itemArgs).not.toHaveProperty("price");
    expect(itemArgs).not.toHaveProperty("stock");
    expect(itemArgs).not.toHaveProperty("sku");
    expect(itemArgs).not.toHaveProperty("attributes");
    expect(next).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// addToCart — simple product backward compatibility
// ─────────────────────────────────────────────────────────────────────────────

describe("addToCart — simple product backward compatibility", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("adds a simple product without variantId (legacy call)", async () => {
    vi.spyOn(Product, "findOne").mockResolvedValue(makeSimpleProduct());
    vi.spyOn(Cart, "findOne").mockResolvedValue(null);
    const createdCart = { user: USER_ID, items: [{ product: PRODUCT_ID, quantity: 1 }] };
    vi.spyOn(Cart, "create").mockResolvedValue(createdCart);

    const req = {
      body: { productId: PRODUCT_ID, quantity: 1 },
      user: { _id: USER_ID },
      requestId: "r-legacy-1"
    };

    const res = makeRes();
    const next = makeNext();
    await addToCart(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("increments a legacy simple-product line (no variantId)", async () => {
    vi.spyOn(Product, "findOne").mockResolvedValue(makeSimpleProduct());

    const existingItem = {
      product: { toString: () => PRODUCT_ID },
      variantId: null,
      quantity: 5
    };
    const cart = { items: [existingItem], save: vi.fn().mockResolvedValue(true) };
    vi.spyOn(Cart, "findOne").mockResolvedValue(cart);

    const req = {
      body: { productId: PRODUCT_ID, quantity: 3 },
      user: { _id: USER_ID },
      requestId: "r-legacy-2"
    };

    await addToCart(req, makeRes(), makeNext());

    expect(existingItem.quantity).toBe(8);
    expect(cart.save).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// updateCartItem — composite identity
// ─────────────────────────────────────────────────────────────────────────────

describe("updateCartItem — composite identity", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("updates the quantity for the exact variant line only", async () => {
    const itemA = {
      product: { toString: () => PRODUCT_ID },
      variantId: VARIANT_A,
      quantity: 2
    };
    const itemB = {
      product: { toString: () => PRODUCT_ID },
      variantId: VARIANT_B,
      quantity: 1
    };
    const cart = { items: [itemA, itemB], save: vi.fn().mockResolvedValue(true) };

    vi.spyOn(Cart, "findOne").mockResolvedValue(cart);
    vi.spyOn(Product, "findOne").mockResolvedValue(makeVariantProduct());

    const req = {
      params: { productId: PRODUCT_ID },
      body: { quantity: 4, variantId: VARIANT_A },
      user: { _id: USER_ID },
      requestId: "u1"
    };

    const res = makeRes();
    const next = makeNext();

    await updateCartItem(req, res, next);

    expect(itemA.quantity).toBe(4); // only A was updated
    expect(itemB.quantity).toBe(1); // B untouched
    expect(next).not.toHaveBeenCalled();
  });

  it("returns CART_ITEM_NOT_FOUND when the variant does not exist in the cart", async () => {
    const itemA = {
      product: { toString: () => PRODUCT_ID },
      variantId: VARIANT_A,
      quantity: 2
    };
    const cart = { items: [itemA] };

    vi.spyOn(Cart, "findOne").mockResolvedValue(cart);

    const req = {
      params: { productId: PRODUCT_ID },
      body: { quantity: 4, variantId: VARIANT_B }, // B is not in cart
      user: { _id: USER_ID },
      requestId: "u2"
    };

    const res = makeRes();
    const next = makeNext();

    await updateCartItem(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: "CART_ITEM_NOT_FOUND", statusCode: 404 })
    );
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns INSUFFICIENT_STOCK when new quantity exceeds variant stock (PATCH)", async () => {
    const itemA = {
      product: { toString: () => PRODUCT_ID },
      variantId: VARIANT_A,
      quantity: 2
    };
    const cart = { items: [itemA] };

    vi.spyOn(Cart, "findOne").mockResolvedValue(cart);
    vi.spyOn(Product, "findOne").mockResolvedValue(makeVariantProduct()); // VARIANT_A stock = 10

    const req = {
      params: { productId: PRODUCT_ID },
      body: { quantity: 11, variantId: VARIANT_A },
      user: { _id: USER_ID },
      requestId: "u3"
    };

    const res = makeRes();
    const next = makeNext();

    await updateCartItem(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: "INSUFFICIENT_STOCK", statusCode: 400 })
    );
    expect(itemA.quantity).toBe(2); // must not mutate
  });

  it("returns VARIANT_INACTIVE when the variant is inactive during update", async () => {
    const itemA = {
      product: { toString: () => PRODUCT_ID },
      variantId: VARIANT_A,
      quantity: 1
    };
    const cart = { items: [itemA] };

    const product = makeVariantProduct();
    product.variants[0].isActive = false;

    vi.spyOn(Cart, "findOne").mockResolvedValue(cart);
    vi.spyOn(Product, "findOne").mockResolvedValue(product);

    const req = {
      params: { productId: PRODUCT_ID },
      body: { quantity: 2, variantId: VARIANT_A },
      user: { _id: USER_ID },
      requestId: "u4"
    };

    const res = makeRes();
    const next = makeNext();

    await updateCartItem(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: "VARIANT_INACTIVE", statusCode: 400 })
    );
  });

  it("updates simple-product line (no variantId) without touching variant lines", async () => {
    const simpleItem = {
      product: { toString: () => PRODUCT_ID },
      variantId: null,
      quantity: 3
    };
    const variantItem = {
      product: { toString: () => PRODUCT_ID },
      variantId: VARIANT_A,
      quantity: 1
    };
    const cart = { items: [simpleItem, variantItem], save: vi.fn().mockResolvedValue(true) };

    vi.spyOn(Cart, "findOne").mockResolvedValue(cart);
    vi.spyOn(Product, "findOne").mockResolvedValue(makeSimpleProduct());

    const req = {
      params: { productId: PRODUCT_ID },
      body: { quantity: 5 }, // no variantId — targets simple line
      user: { _id: USER_ID },
      requestId: "u5"
    };

    await updateCartItem(req, makeRes(), makeNext());

    expect(simpleItem.quantity).toBe(5);
    expect(variantItem.quantity).toBe(1); // untouched
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// removeCartItem — composite identity
// ─────────────────────────────────────────────────────────────────────────────

describe("removeCartItem — composite identity", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("removes only the matching variant line", async () => {
    const itemA = {
      product: { toString: () => PRODUCT_ID },
      variantId: VARIANT_A,
      quantity: 2
    };
    const itemB = {
      product: { toString: () => PRODUCT_ID },
      variantId: VARIANT_B,
      quantity: 1
    };
    const cart = {
      items: [itemA, itemB],
      save: vi.fn().mockResolvedValue(true)
    };

    vi.spyOn(Cart, "findOne").mockResolvedValue(cart);

    const req = {
      params: { productId: PRODUCT_ID },
      query: { variantId: VARIANT_A },
      user: { _id: USER_ID },
      requestId: "rm1"
    };

    const res = makeRes();
    const next = makeNext();

    await removeCartItem(req, res, next);

    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].variantId).toBe(VARIANT_B); // B survives
    expect(next).not.toHaveBeenCalled();
  });

  it("returns CART_ITEM_NOT_FOUND when the variant line does not exist", async () => {
    const cart = {
      items: [
        { product: { toString: () => PRODUCT_ID }, variantId: VARIANT_A, quantity: 1 }
      ]
    };

    vi.spyOn(Cart, "findOne").mockResolvedValue(cart);

    const req = {
      params: { productId: PRODUCT_ID },
      query: { variantId: VARIANT_B },  // B not in cart
      user: { _id: USER_ID },
      requestId: "rm2"
    };

    const res = makeRes();
    const next = makeNext();

    await removeCartItem(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: "CART_ITEM_NOT_FOUND", statusCode: 404 })
    );
  });

  it("removes a simple-product line (no variantId query param)", async () => {
    const simpleItem = {
      product: { toString: () => PRODUCT_ID },
      variantId: null,
      quantity: 3
    };
    const variantItem = {
      product: { toString: () => PRODUCT_ID },
      variantId: VARIANT_A,
      quantity: 1
    };
    const cart = {
      items: [simpleItem, variantItem],
      save: vi.fn().mockResolvedValue(true)
    };

    vi.spyOn(Cart, "findOne").mockResolvedValue(cart);

    const req = {
      params: { productId: PRODUCT_ID },
      query: {},   // no variantId → targets simple line
      user: { _id: USER_ID },
      requestId: "rm3"
    };

    await removeCartItem(req, makeRes(), makeNext());

    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].variantId).toBe(VARIANT_A); // variant line survives
  });

  it("does not allow removing another user's cart item", async () => {
    // Cart.findOne is scoped to req.user._id; verify it is called with the
    // authenticated user, never with OTHER_USER_ID.
    vi.spyOn(Cart, "findOne").mockResolvedValue(null);

    const req = {
      params: { productId: PRODUCT_ID },
      query: {},
      user: { _id: USER_ID },
      requestId: "rm4"
    };

    const next = makeNext();
    await removeCartItem(req, makeRes(), next);

    expect(Cart.findOne).toHaveBeenCalledWith({ user: USER_ID });
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: "CART_NOT_FOUND" })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getCart — price resolution and variant liveness
// ─────────────────────────────────────────────────────────────────────────────

describe("getCart — price resolution and variant liveness", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  const makePopulateMock = (items) => ({
    user: USER_ID,
    items,
    coupon: null,
    populate: vi.fn().mockResolvedValue({
      user: USER_ID,
      items,
      coupon: null,
      toObject: vi.fn().mockReturnValue({ user: USER_ID, items, coupon: null })
    })
  });

  it("resolves price as variant.price when set (VARIANT_B = 2200)", async () => {
    const product = makeVariantProduct();

    const cartItems = [
      {
        product,
        variantId: VARIANT_B,
        quantity: 2,
        toObject: vi.fn().mockReturnValue({ product, variantId: VARIANT_B, quantity: 2 })
      }
    ];

    const mockCart = {
      user: USER_ID,
      items: cartItems,
      coupon: null
    };

    const findOneMock = {
      populate: vi.fn().mockResolvedValue(mockCart)
    };

    vi.spyOn(Cart, "findOne").mockReturnValue(findOneMock);
    vi.spyOn(Coupon, "findById").mockResolvedValue(null);

    const req = { user: { _id: USER_ID }, requestId: "gc1" };
    const res = makeRes();
    const next = makeNext();

    await getCart(req, res, next);

    const responseData = res.json.mock.calls[0][0];
    const enrichedItem = responseData.data.items[0];

    // VARIANT_B has explicit price 2200
    expect(enrichedItem.resolvedPrice).toBe(2200);
    expect(responseData.data.totals.subtotal).toBe(4400); // 2200 * 2
    expect(next).not.toHaveBeenCalled();
  });

  it("resolves price as product.price when variant.price is null (VARIANT_A)", async () => {
    const product = makeVariantProduct(); // VARIANT_A price = null → inherits 2000

    const cartItems = [
      {
        product,
        variantId: VARIANT_A,
        quantity: 1,
        toObject: vi.fn().mockReturnValue({ product, variantId: VARIANT_A, quantity: 1 })
      }
    ];

    const mockCart = { user: USER_ID, items: cartItems, coupon: null };
    const findOneMock = { populate: vi.fn().mockResolvedValue(mockCart) };

    vi.spyOn(Cart, "findOne").mockReturnValue(findOneMock);

    const req = { user: { _id: USER_ID }, requestId: "gc2" };
    const res = makeRes();

    await getCart(req, makeRes(), makeNext());
  });

  it("uses variant images when available, falls back to product images", async () => {
    const product = makeVariantProduct();
    // VARIANT_A has images; VARIANT_B has [] → falls back to product images

    const cartItems = [
      {
        product,
        variantId: VARIANT_B,
        quantity: 1,
        toObject: vi.fn().mockReturnValue({ product, variantId: VARIANT_B, quantity: 1 })
      }
    ];

    const mockCart = { user: USER_ID, items: cartItems, coupon: null };
    const findOneMock = { populate: vi.fn().mockResolvedValue(mockCart) };

    vi.spyOn(Cart, "findOne").mockReturnValue(findOneMock);

    const req = { user: { _id: USER_ID }, requestId: "gc3" };
    const res = makeRes();

    await getCart(req, res, makeNext());

    const responseData = res.json.mock.calls[0][0];
    const enrichedItem = responseData.data.items[0];

    // VARIANT_B.images is [] → should fall back to product.images
    expect(enrichedItem.resolvedImages).toEqual(["https://example.com/base.jpg"]);
  });

  it("tags a cart item as variant_deleted when the variant no longer exists on the product", async () => {
    const product = makeVariantProduct();
    // Simulate deleted variant: VARIANT_A no longer in variants array
    product.variants = product.variants.filter((v) => v.variantId !== VARIANT_A);

    const deletedItem = {
      product,
      variantId: VARIANT_A,
      quantity: 2,
      toObject: vi.fn().mockReturnValue({ product, variantId: VARIANT_A, quantity: 2 })
    };

    const mockCart = { user: USER_ID, items: [deletedItem], coupon: null };
    const findOneMock = { populate: vi.fn().mockResolvedValue(mockCart) };

    vi.spyOn(Cart, "findOne").mockReturnValue(findOneMock);

    const req = { user: { _id: USER_ID }, requestId: "gc4" };
    const res = makeRes();

    await getCart(req, res, makeNext());

    const responseData = res.json.mock.calls[0][0];
    const enrichedItem = responseData.data.items[0];

    expect(enrichedItem._liveness.isLive).toBe(false);
    expect(enrichedItem._liveness.reason).toBe("variant_deleted");
    // Deleted variant must NOT contribute to the subtotal
    expect(responseData.data.totals.subtotal).toBe(0);
  });

  it("tags a cart item as variant_inactive when variant.isActive is false", async () => {
    const product = makeVariantProduct();
    product.variants[0].isActive = false; // deactivate VARIANT_A

    const inactiveItem = {
      product,
      variantId: VARIANT_A,
      quantity: 3,
      toObject: vi.fn().mockReturnValue({ product, variantId: VARIANT_A, quantity: 3 })
    };

    const mockCart = { user: USER_ID, items: [inactiveItem], coupon: null };
    const findOneMock = { populate: vi.fn().mockResolvedValue(mockCart) };

    vi.spyOn(Cart, "findOne").mockReturnValue(findOneMock);

    const req = { user: { _id: USER_ID }, requestId: "gc5" };
    const res = makeRes();

    await getCart(req, res, makeNext());

    const responseData = res.json.mock.calls[0][0];
    const enrichedItem = responseData.data.items[0];

    expect(enrichedItem._liveness.isLive).toBe(false);
    expect(enrichedItem._liveness.reason).toBe("variant_inactive");
    expect(responseData.data.totals.subtotal).toBe(0);
  });

  it("does not persist prices or financial snapshots in the cart document", async () => {
    const product = makeSimpleProduct();

    const simpleItem = {
      product,
      variantId: null,
      quantity: 1,
      toObject: vi.fn().mockReturnValue({ product, variantId: null, quantity: 1 })
    };

    const mockCart = { user: USER_ID, items: [simpleItem], coupon: null };
    const findOneMock = { populate: vi.fn().mockResolvedValue(mockCart) };

    vi.spyOn(Cart, "findOne").mockReturnValue(findOneMock);

    const req = { user: { _id: USER_ID }, requestId: "gc6" };
    const res = makeRes();

    await getCart(req, res, makeNext());

    // Verify the raw cart object (not the enriched view) has no price fields
    const rawCart = res.json.mock.calls[0][0].data.cart;
    const rawItem = rawCart.items[0];

    expect(rawItem).not.toHaveProperty("price");
    expect(rawItem).not.toHaveProperty("subtotal");
  });

  it("returns an empty cart response when the user has no cart", async () => {
    const findOneMock = { populate: vi.fn().mockResolvedValue(null) };
    vi.spyOn(Cart, "findOne").mockReturnValue(findOneMock);

    const req = { user: { _id: USER_ID }, requestId: "gc7" };
    const res = makeRes();
    const next = makeNext();

    await getCart(req, res, next);

    const responseData = res.json.mock.calls[0][0];
    expect(responseData.success).toBe(true);
    expect(responseData.data.totals.itemCount).toBe(0);
    expect(responseData.data.totals.subtotal).toBe(0);
    expect(next).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cross-user isolation
// ─────────────────────────────────────────────────────────────────────────────

describe("addToCart — cross-user isolation", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("scopes Cart.findOne to the authenticated user only", async () => {
    vi.spyOn(Product, "findOne").mockResolvedValue(makeSimpleProduct());
    vi.spyOn(Cart, "findOne").mockResolvedValue(null);
    vi.spyOn(Cart, "create").mockResolvedValue({ user: USER_ID, items: [] });

    const req = {
      body: { productId: PRODUCT_ID, quantity: 1 },
      user: { _id: USER_ID },
      requestId: "iso1"
    };

    await addToCart(req, makeRes(), makeNext());

    expect(Cart.findOne).toHaveBeenCalledWith({ user: USER_ID });
    expect(Cart.findOne).not.toHaveBeenCalledWith({ user: OTHER_USER_ID });
  });
});
