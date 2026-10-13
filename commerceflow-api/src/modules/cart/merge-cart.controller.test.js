import {
  describe,
  it,
  expect,
  beforeEach,
  vi
} from "vitest";

import mergeCart from "./merge-cart.controller.js";
import Cart from "./cart.model.js";
import Product from "../products/product.model.js";

describe("mergeCart controller", () => {
  const userId = "507f1f77bcf86cd799439012";
  const productAId = "507f1f77bcf86cd7994390a1";
  const productBId = "507f1f77bcf86cd7994390b2";
  const productCId = "507f1f77bcf86cd7994390c3";

  let req;
  let res;
  let next;

  beforeEach(() => {
    vi.restoreAllMocks();

    req = {
      body: {
        items: []
      },
      user: {
        _id: userId
      },
      requestId: "test-merge-req-123"
    };

    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    next = vi.fn();
  });

  it("merges guest items into an empty existing cart", async () => {
    req.body.items = [
      { productId: productAId, quantity: 2 },
      { productId: productBId, quantity: 1 }
    ];

    const mockProducts = [
      {
        _id: productAId,
        name: "Product A",
        price: 1000,
        stock: 10,
        isActive: true
      },
      {
        _id: productBId,
        name: "Product B",
        price: 2500,
        stock: 5,
        isActive: true
      }
    ];

    const mockCartInstance = {
      user: userId,
      items: [],
      save: vi.fn().mockResolvedValue(true),
      populate: vi.fn().mockImplementation(function () {
        this.items = [
          { product: mockProducts[0], quantity: 2 },
          { product: mockProducts[1], quantity: 1 }
        ];
        return Promise.resolve(this);
      })
    };

    vi.spyOn(Cart, "findOne").mockResolvedValue(null);
    vi.spyOn(Cart, "create").mockResolvedValue(mockCartInstance);
    vi.spyOn(Product, "find").mockResolvedValue(mockProducts);

    await mergeCart(req, res, next);

    expect(Product.find).toHaveBeenCalledWith({
      _id: { $in: [productAId, productBId] }
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: "Cart merged successfully",
        data: expect.objectContaining({
          mergeReport: {
            added: [
              { productId: productAId, quantity: 2 },
              { productId: productBId, quantity: 1 }
            ],
            updated: [],
            clamped: [],
            omitted: []
          },
          totals: expect.objectContaining({
            itemCount: 2,
            totalQuantity: 3,
            subtotal: 4500
          })
        })
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("adds quantities additively when products overlap and stock is sufficient", async () => {
    req.body.items = [
      { productId: productAId, quantity: 2 }
    ];

    const mockProductA = {
      _id: productAId,
      name: "Product A",
      price: 1000,
      stock: 10,
      isActive: true
    };

    const existingCart = {
      user: userId,
      items: [
        { product: productAId, quantity: 3 }
      ],
      save: vi.fn().mockResolvedValue(true),
      populate: vi.fn().mockImplementation(function () {
        this.items = [{ product: mockProductA, quantity: 5 }];
        return Promise.resolve(this);
      })
    };

    vi.spyOn(Cart, "findOne").mockResolvedValue(existingCart);
    vi.spyOn(Product, "find").mockResolvedValue([mockProductA]);

    await mergeCart(req, res, next);

    expect(existingCart.items[0].quantity).toBe(5);
    expect(existingCart.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          mergeReport: {
            added: [],
            updated: [
              {
                productId: productAId,
                previousQuantity: 3,
                finalQuantity: 5
              }
            ],
            clamped: [],
            omitted: []
          },
          totals: expect.objectContaining({
            itemCount: 1,
            totalQuantity: 5,
            subtotal: 5000
          })
        })
      })
    );
  });

  it("clamps combined quantity when it exceeds available stock", async () => {
    req.body.items = [
      { productId: productAId, quantity: 4 }
    ];

    const mockProductA = {
      _id: productAId,
      name: "Product A",
      price: 1000,
      stock: 5,
      isActive: true
    };

    const existingCart = {
      user: userId,
      items: [
        { product: productAId, quantity: 3 }
      ],
      save: vi.fn().mockResolvedValue(true),
      populate: vi.fn().mockImplementation(function () {
        this.items = [{ product: mockProductA, quantity: 5 }];
        return Promise.resolve(this);
      })
    };

    vi.spyOn(Cart, "findOne").mockResolvedValue(existingCart);
    vi.spyOn(Product, "find").mockResolvedValue([mockProductA]);

    await mergeCart(req, res, next);

    expect(existingCart.items[0].quantity).toBe(5);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          mergeReport: {
            added: [],
            updated: [
              {
                productId: productAId,
                previousQuantity: 3,
                finalQuantity: 5
              }
            ],
            clamped: [
              {
                productId: productAId,
                requested: 7,
                finalQuantity: 5,
                availableStock: 5
              }
            ],
            omitted: []
          }
        })
      })
    );
  });

  it("clamps guest-only item quantity when it exceeds available stock", async () => {
    req.body.items = [
      { productId: productBId, quantity: 10 }
    ];

    const mockProductB = {
      _id: productBId,
      name: "Product B",
      price: 500,
      stock: 4,
      isActive: true
    };

    const existingCart = {
      user: userId,
      items: [],
      save: vi.fn().mockResolvedValue(true),
      populate: vi.fn().mockImplementation(function () {
        this.items = [{ product: mockProductB, quantity: 4 }];
        return Promise.resolve(this);
      })
    };

    vi.spyOn(Cart, "findOne").mockResolvedValue(existingCart);
    vi.spyOn(Product, "find").mockResolvedValue([mockProductB]);

    await mergeCart(req, res, next);

    expect(existingCart.items[0].quantity).toBe(4);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mergeReport: {
            added: [{ productId: productBId, quantity: 4 }],
            updated: [],
            clamped: [
              {
                productId: productBId,
                requested: 10,
                finalQuantity: 4,
                availableStock: 4
              }
            ],
            omitted: []
          }
        })
      })
    );
  });

  it("omits inactive products and records PRODUCT_INACTIVE", async () => {
    req.body.items = [
      { productId: productAId, quantity: 2 }
    ];

    const mockProductA = {
      _id: productAId,
      name: "Deactivated Product",
      price: 1000,
      stock: 10,
      isActive: false
    };

    const existingCart = {
      user: userId,
      items: [],
      save: vi.fn().mockResolvedValue(true),
      populate: vi.fn().mockResolvedValue(true)
    };

    vi.spyOn(Cart, "findOne").mockResolvedValue(existingCart);
    vi.spyOn(Product, "find").mockResolvedValue([mockProductA]);

    await mergeCart(req, res, next);

    expect(existingCart.items).toHaveLength(0);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mergeReport: {
            added: [],
            updated: [],
            clamped: [],
            omitted: [
              {
                productId: productAId,
                reason: "PRODUCT_INACTIVE"
              }
            ]
          }
        })
      })
    );
  });

  it("omits non-existent products and records PRODUCT_NOT_FOUND", async () => {
    req.body.items = [
      { productId: productAId, quantity: 1 }
    ];

    const existingCart = {
      user: userId,
      items: [],
      save: vi.fn().mockResolvedValue(true),
      populate: vi.fn().mockResolvedValue(true)
    };

    vi.spyOn(Cart, "findOne").mockResolvedValue(existingCart);
    vi.spyOn(Product, "find").mockResolvedValue([]);

    await mergeCart(req, res, next);

    expect(existingCart.items).toHaveLength(0);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mergeReport: {
            added: [],
            updated: [],
            clamped: [],
            omitted: [
              {
                productId: productAId,
                reason: "PRODUCT_NOT_FOUND"
              }
            ]
          }
        })
      })
    );
  });

  it("omits zero-stock products and records OUT_OF_STOCK", async () => {
    req.body.items = [
      { productId: productAId, quantity: 1 }
    ];

    const mockProductA = {
      _id: productAId,
      name: "Sold Out Product",
      price: 1000,
      stock: 0,
      isActive: true
    };

    const existingCart = {
      user: userId,
      items: [],
      save: vi.fn().mockResolvedValue(true),
      populate: vi.fn().mockResolvedValue(true)
    };

    vi.spyOn(Cart, "findOne").mockResolvedValue(existingCart);
    vi.spyOn(Product, "find").mockResolvedValue([mockProductA]);

    await mergeCart(req, res, next);

    expect(existingCart.items).toHaveLength(0);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mergeReport: {
            added: [],
            updated: [],
            clamped: [],
            omitted: [
              {
                productId: productAId,
                reason: "OUT_OF_STOCK"
              }
            ]
          }
        })
      })
    );
  });

  it("preserves existing server-cart items that were not in the guest cart", async () => {
    req.body.items = [
      { productId: productBId, quantity: 1 }
    ];

    const mockProductB = {
      _id: productBId,
      name: "Product B",
      price: 200,
      stock: 10,
      isActive: true
    };

    const existingCart = {
      user: userId,
      items: [
        { product: productCId, quantity: 2 }
      ],
      save: vi.fn().mockResolvedValue(true),
      populate: vi.fn().mockImplementation(function () {
        this.items = [
          { product: { _id: productCId, price: 100, name: "Product C" }, quantity: 2 },
          { product: mockProductB, quantity: 1 }
        ];
        return Promise.resolve(this);
      })
    };

    vi.spyOn(Cart, "findOne").mockResolvedValue(existingCart);
    vi.spyOn(Product, "find").mockResolvedValue([mockProductB]);

    await mergeCart(req, res, next);

    expect(existingCart.items).toHaveLength(2);
    expect(existingCart.items[0].product._id).toBe(productCId);
    expect(existingCart.items[0].quantity).toBe(2);
    expect(existingCart.items[1].product._id).toBe(mockProductB._id);
    expect(existingCart.items[1].quantity).toBe(1);
  });

  it("maintains single-product invariant and does not create duplicate entries", async () => {
    req.body.items = [
      { productId: productAId, quantity: 2 }
    ];

    const mockProductA = {
      _id: productAId,
      name: "Product A",
      price: 500,
      stock: 20,
      isActive: true
    };

    const existingCart = {
      user: userId,
      items: [
        { product: productAId, quantity: 3 }
      ],
      save: vi.fn().mockResolvedValue(true),
      populate: vi.fn().mockImplementation(function () {
        this.items = [{ product: mockProductA, quantity: 5 }];
        return Promise.resolve(this);
      })
    };

    vi.spyOn(Cart, "findOne").mockResolvedValue(existingCart);
    vi.spyOn(Product, "find").mockResolvedValue([mockProductA]);

    await mergeCart(req, res, next);

    const productAEntries = existingCart.items.filter(
      (item) => (item.product?._id || item.product).toString() === productAId
    );
    expect(productAEntries).toHaveLength(1);
    expect(productAEntries[0].quantity).toBe(5);
  });

  it("forwards persistence errors to next() and sends no response", async () => {
    req.body.items = [
      { productId: productAId, quantity: 1 }
    ];

    const mockProductA = {
      _id: productAId,
      name: "Product A",
      price: 500,
      stock: 10,
      isActive: true
    };

    const dbError = new Error("Database connection lost");
    const existingCart = {
      user: userId,
      items: [],
      save: vi.fn().mockRejectedValue(dbError)
    };

    vi.spyOn(Cart, "findOne").mockResolvedValue(existingCart);
    vi.spyOn(Product, "find").mockResolvedValue([mockProductA]);

    await mergeCart(req, res, next);

    expect(next).toHaveBeenCalledWith(dbError);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  describe("variant support in mergeCart", () => {
    const variantAId = "var_aaaaaaaa-1111-2222-3333-444444444444";
    const variantBId = "var_bbbbbbbb-5555-6666-7777-888888888888";

    const makeVariantProduct = (overrides = {}) => ({
      _id: productAId,
      name: "Trail Running Shoe",
      price: 2000,
      stock: 15,
      isActive: true,
      variants: [
        {
          variantId: variantAId,
          sku: "TRS-BLK-S",
          price: null,
          stock: 10,
          isActive: true
        },
        {
          variantId: variantBId,
          sku: "TRS-WHT-M",
          price: 2500,
          stock: 5,
          isActive: true
        }
      ],
      ...overrides
    });

    it("omits item with VARIANT_REQUIRED when variant product is submitted without variantId", async () => {
      req.body.items = [
        { productId: productAId, quantity: 1, variantId: null }
      ];

      const mockProduct = makeVariantProduct();
      const existingCart = {
        user: userId,
        items: [],
        save: vi.fn().mockResolvedValue(true),
        populate: vi.fn().mockResolvedValue(true)
      };

      vi.spyOn(Cart, "findOne").mockResolvedValue(existingCart);
      vi.spyOn(Product, "find").mockResolvedValue([mockProduct]);

      await mergeCart(req, res, next);

      expect(existingCart.items).toHaveLength(0);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mergeReport: expect.objectContaining({
              omitted: [
                {
                  productId: productAId,
                  reason: "VARIANT_REQUIRED"
                }
              ]
            })
          })
        })
      );
    });

    it("omits item with PRODUCT_HAS_NO_VARIANTS when non-variant product is submitted with variantId", async () => {
      req.body.items = [
        { productId: productAId, quantity: 1, variantId: variantAId }
      ];

      const mockSimpleProduct = {
        _id: productAId,
        name: "Simple Tee",
        price: 500,
        stock: 10,
        isActive: true,
        variants: []
      };

      const existingCart = {
        user: userId,
        items: [],
        save: vi.fn().mockResolvedValue(true),
        populate: vi.fn().mockResolvedValue(true)
      };

      vi.spyOn(Cart, "findOne").mockResolvedValue(existingCart);
      vi.spyOn(Product, "find").mockResolvedValue([mockSimpleProduct]);

      await mergeCart(req, res, next);

      expect(existingCart.items).toHaveLength(0);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mergeReport: expect.objectContaining({
              omitted: [
                {
                  productId: productAId,
                  variantId: variantAId,
                  reason: "PRODUCT_HAS_NO_VARIANTS"
                }
              ]
            })
          })
        })
      );
    });

    it("omits item with VARIANT_NOT_FOUND when requested variantId does not exist on product", async () => {
      const nonExistentVariant = "var_99999999-9999-9999-9999-999999999999";
      req.body.items = [
        { productId: productAId, quantity: 1, variantId: nonExistentVariant }
      ];

      const mockProduct = makeVariantProduct();
      const existingCart = {
        user: userId,
        items: [],
        save: vi.fn().mockResolvedValue(true),
        populate: vi.fn().mockResolvedValue(true)
      };

      vi.spyOn(Cart, "findOne").mockResolvedValue(existingCart);
      vi.spyOn(Product, "find").mockResolvedValue([mockProduct]);

      await mergeCart(req, res, next);

      expect(existingCart.items).toHaveLength(0);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mergeReport: expect.objectContaining({
              omitted: [
                {
                  productId: productAId,
                  variantId: nonExistentVariant,
                  reason: "VARIANT_NOT_FOUND"
                }
              ]
            })
          })
        })
      );
    });

    it("omits item with VARIANT_INACTIVE when variant has isActive: false", async () => {
      req.body.items = [
        { productId: productAId, quantity: 1, variantId: variantAId }
      ];

      const mockProduct = makeVariantProduct({
        variants: [
          {
            variantId: variantAId,
            sku: "TRS-BLK-S",
            stock: 10,
            isActive: false
          }
        ]
      });

      const existingCart = {
        user: userId,
        items: [],
        save: vi.fn().mockResolvedValue(true),
        populate: vi.fn().mockResolvedValue(true)
      };

      vi.spyOn(Cart, "findOne").mockResolvedValue(existingCart);
      vi.spyOn(Product, "find").mockResolvedValue([mockProduct]);

      await mergeCart(req, res, next);

      expect(existingCart.items).toHaveLength(0);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mergeReport: expect.objectContaining({
              omitted: [
                {
                  productId: productAId,
                  variantId: variantAId,
                  reason: "VARIANT_INACTIVE"
                }
              ]
            })
          })
        })
      );
    });

    it("omits item with OUT_OF_STOCK when variant stock is 0 even if root stock > 0", async () => {
      req.body.items = [
        { productId: productAId, quantity: 1, variantId: variantAId }
      ];

      const mockProduct = makeVariantProduct({
        stock: 10, // root stock positive
        variants: [
          {
            variantId: variantAId,
            sku: "TRS-BLK-S",
            stock: 0, // variant stock zero
            isActive: true
          }
        ]
      });

      const existingCart = {
        user: userId,
        items: [],
        save: vi.fn().mockResolvedValue(true),
        populate: vi.fn().mockResolvedValue(true)
      };

      vi.spyOn(Cart, "findOne").mockResolvedValue(existingCart);
      vi.spyOn(Product, "find").mockResolvedValue([mockProduct]);

      await mergeCart(req, res, next);

      expect(existingCart.items).toHaveLength(0);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mergeReport: expect.objectContaining({
              omitted: [
                {
                  productId: productAId,
                  variantId: variantAId,
                  reason: "OUT_OF_STOCK"
                }
              ]
            })
          })
        })
      );
    });

    it("merges valid variant item into an empty cart", async () => {
      req.body.items = [
        { productId: productAId, quantity: 2, variantId: variantAId }
      ];

      const mockProduct = makeVariantProduct();
      const mockCart = {
        user: userId,
        items: [],
        save: vi.fn().mockResolvedValue(true),
        populate: vi.fn().mockImplementation(function () {
          this.items = [{ product: mockProduct, variantId: variantAId, quantity: 2 }];
          return Promise.resolve(this);
        })
      };

      vi.spyOn(Cart, "findOne").mockResolvedValue(null);
      vi.spyOn(Cart, "create").mockResolvedValue(mockCart);
      vi.spyOn(Product, "find").mockResolvedValue([mockProduct]);

      await mergeCart(req, res, next);

      expect(mockCart.items).toHaveLength(1);
      expect((mockCart.items[0].product._id || mockCart.items[0].product).toString()).toBe(productAId);
      expect(mockCart.items[0].variantId).toBe(variantAId);
      expect(mockCart.items[0].quantity).toBe(2);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            mergeReport: expect.objectContaining({
              added: [
                {
                  productId: productAId,
                  variantId: variantAId,
                  quantity: 2
                }
              ]
            })
          })
        })
      );
    });

    it("clamps variant quantity when requested exceeds variant stock, proving variant stock controls quantity", async () => {
      req.body.items = [
        { productId: productAId, quantity: 8, variantId: variantBId }
      ];

      // variantB has stock: 5, while product has stock: 15
      const mockProduct = makeVariantProduct();
      const existingCart = {
        user: userId,
        items: [],
        save: vi.fn().mockResolvedValue(true),
        populate: vi.fn().mockImplementation(function () {
          this.items = [{ product: mockProduct, variantId: variantBId, quantity: 5 }];
          return Promise.resolve(this);
        })
      };

      vi.spyOn(Cart, "findOne").mockResolvedValue(existingCart);
      vi.spyOn(Product, "find").mockResolvedValue([mockProduct]);

      await mergeCart(req, res, next);

      expect(existingCart.items[0].quantity).toBe(5);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mergeReport: expect.objectContaining({
              clamped: [
                {
                  productId: productAId,
                  variantId: variantBId,
                  requested: 8,
                  finalQuantity: 5,
                  availableStock: 5
                }
              ],
              added: [
                {
                  productId: productAId,
                  variantId: variantBId,
                  quantity: 5
                }
              ]
            })
          })
        })
      );
    });

    it("preserves two different variants of the same product as separate cart lines", async () => {
      req.body.items = [
        { productId: productAId, quantity: 2, variantId: variantAId },
        { productId: productAId, quantity: 1, variantId: variantBId }
      ];

      const mockProduct = makeVariantProduct();
      const existingCart = {
        user: userId,
        items: [],
        save: vi.fn().mockResolvedValue(true),
        populate: vi.fn().mockImplementation(function () {
          this.items = [
            { product: mockProduct, variantId: variantAId, quantity: 2 },
            { product: mockProduct, variantId: variantBId, quantity: 1 }
          ];
          return Promise.resolve(this);
        })
      };

      vi.spyOn(Cart, "findOne").mockResolvedValue(existingCart);
      vi.spyOn(Product, "find").mockResolvedValue([mockProduct]);

      await mergeCart(req, res, next);

      expect(existingCart.items).toHaveLength(2);
      expect((existingCart.items[0].product._id || existingCart.items[0].product).toString()).toBe(productAId);
      expect(existingCart.items[0].variantId).toBe(variantAId);
      expect(existingCart.items[0].quantity).toBe(2);
      expect((existingCart.items[1].product._id || existingCart.items[1].product).toString()).toBe(productAId);
      expect(existingCart.items[1].variantId).toBe(variantBId);
      expect(existingCart.items[1].quantity).toBe(1);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mergeReport: expect.objectContaining({
              added: [
                { productId: productAId, variantId: variantAId, quantity: 2 },
                { productId: productAId, variantId: variantBId, quantity: 1 }
              ]
            })
          })
        })
      );
    });

    it("merges quantities additively when identical variant is already in authenticated cart", async () => {
      req.body.items = [
        { productId: productAId, quantity: 3, variantId: variantAId }
      ];

      const mockProduct = makeVariantProduct(); // variantA stock = 10
      const existingCart = {
        user: userId,
        items: [
          { product: productAId, variantId: variantAId, quantity: 4 }
        ],
        save: vi.fn().mockResolvedValue(true),
        populate: vi.fn().mockImplementation(function () {
          this.items = [{ product: mockProduct, variantId: variantAId, quantity: 7 }];
          return Promise.resolve(this);
        })
      };

      vi.spyOn(Cart, "findOne").mockResolvedValue(existingCart);
      vi.spyOn(Product, "find").mockResolvedValue([mockProduct]);

      await mergeCart(req, res, next);

      expect(existingCart.items[0].quantity).toBe(7);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mergeReport: expect.objectContaining({
              updated: [
                {
                  productId: productAId,
                  variantId: variantAId,
                  previousQuantity: 4,
                  finalQuantity: 7
                }
              ]
            })
          })
        })
      );
    });

    it("clamps combined quantity when identical variant additively exceeds variant stock", async () => {
      req.body.items = [
        { productId: productAId, quantity: 4, variantId: variantBId }
      ];

      const mockProduct = makeVariantProduct(); // variantB stock = 5
      const existingCart = {
        user: userId,
        items: [
          { product: productAId, variantId: variantBId, quantity: 3 }
        ],
        save: vi.fn().mockResolvedValue(true),
        populate: vi.fn().mockImplementation(function () {
          this.items = [{ product: mockProduct, variantId: variantBId, quantity: 5 }];
          return Promise.resolve(this);
        })
      };

      vi.spyOn(Cart, "findOne").mockResolvedValue(existingCart);
      vi.spyOn(Product, "find").mockResolvedValue([mockProduct]);

      await mergeCart(req, res, next);

      expect(existingCart.items[0].quantity).toBe(5);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mergeReport: expect.objectContaining({
              clamped: [
                {
                  productId: productAId,
                  variantId: variantBId,
                  requested: 7,
                  finalQuantity: 5,
                  availableStock: 5
                }
              ],
              updated: [
                {
                  productId: productAId,
                  variantId: variantBId,
                  previousQuantity: 3,
                  finalQuantity: 5
                }
              ]
            })
          })
        })
      );
    });

    it("preserves simple product and variant lines for the same product without collision", async () => {
      req.body.items = [
        { productId: productAId, quantity: 2, variantId: variantAId }
      ];

      const mockProduct = makeVariantProduct();
      const existingCart = {
        user: userId,
        items: [
          { product: productAId, variantId: null, quantity: 1 }
        ],
        save: vi.fn().mockResolvedValue(true),
        populate: vi.fn().mockImplementation(function () {
          this.items = [
            { product: mockProduct, variantId: null, quantity: 1 },
            { product: mockProduct, variantId: variantAId, quantity: 2 }
          ];
          return Promise.resolve(this);
        })
      };

      vi.spyOn(Cart, "findOne").mockResolvedValue(existingCart);
      vi.spyOn(Product, "find").mockResolvedValue([mockProduct]);

      await mergeCart(req, res, next);

      expect(existingCart.items).toHaveLength(2);
      expect((existingCart.items[0].product._id || existingCart.items[0].product).toString()).toBe(productAId);
      expect(existingCart.items[0].variantId).toBeNull();
      expect(existingCart.items[0].quantity).toBe(1);
      expect((existingCart.items[1].product._id || existingCart.items[1].product).toString()).toBe(productAId);
      expect(existingCart.items[1].variantId).toBe(variantAId);
      expect(existingCart.items[1].quantity).toBe(2);
    });

    it("preserves existing server cart variant lines that were not in guest cart", async () => {
      req.body.items = [
        { productId: productAId, quantity: 1, variantId: variantAId }
      ];

      const mockProduct = makeVariantProduct();
      const existingCart = {
        user: userId,
        items: [
          { product: productAId, variantId: variantBId, quantity: 3 }
        ],
        save: vi.fn().mockResolvedValue(true),
        populate: vi.fn().mockImplementation(function () {
          this.items = [
            { product: mockProduct, variantId: variantBId, quantity: 3 },
            { product: mockProduct, variantId: variantAId, quantity: 1 }
          ];
          return Promise.resolve(this);
        })
      };

      vi.spyOn(Cart, "findOne").mockResolvedValue(existingCart);
      vi.spyOn(Product, "find").mockResolvedValue([mockProduct]);

      await mergeCart(req, res, next);

      expect(existingCart.items).toHaveLength(2);
      expect(existingCart.items[0].variantId).toBe(variantBId);
      expect(existingCart.items[0].quantity).toBe(3);
      expect(existingCart.items[1].variantId).toBe(variantAId);
      expect(existingCart.items[1].quantity).toBe(1);
    });

    it("calculates totals using variant price overrides when available", async () => {
      req.body.items = [
        { productId: productAId, quantity: 2, variantId: variantBId }
      ];

      // variantB has price: 2500 (override), product.price is 2000
      const mockProduct = makeVariantProduct();
      const existingCart = {
        user: userId,
        items: [],
        save: vi.fn().mockResolvedValue(true),
        populate: vi.fn().mockImplementation(function () {
          this.items = [
            { product: mockProduct, variantId: variantBId, quantity: 2 }
          ];
          return Promise.resolve(this);
        })
      };

      vi.spyOn(Cart, "findOne").mockResolvedValue(existingCart);
      vi.spyOn(Product, "find").mockResolvedValue([mockProduct]);

      await mergeCart(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totals: expect.objectContaining({
              itemCount: 1,
              totalQuantity: 2,
              subtotal: 5000 // 2500 * 2, not 2000 * 2
            })
          })
        })
      );
    });

    it("ensures malformed or stale guest entries cannot corrupt or delete existing cart items", async () => {
      req.body.items = [
        { productId: productAId, quantity: 1, variantId: "var_nonexistent" },
        { productId: productBId, quantity: 2 }
      ];

      const mockProductA = makeVariantProduct();
      const existingCart = {
        user: userId,
        items: [
          { product: productCId, variantId: null, quantity: 5 }
        ],
        save: vi.fn().mockResolvedValue(true),
        populate: vi.fn().mockImplementation(function () {
          this.items = [
            { product: { _id: productCId, price: 100 }, variantId: null, quantity: 5 }
          ];
          return Promise.resolve(this);
        })
      };

      vi.spyOn(Cart, "findOne").mockResolvedValue(existingCart);
      // Product B does not exist in DB
      vi.spyOn(Product, "find").mockResolvedValue([mockProductA]);

      await mergeCart(req, res, next);

      // Existing item survives untouched
      expect(existingCart.items).toHaveLength(1);
      expect((existingCart.items[0].product._id || existingCart.items[0].product).toString()).toBe(productCId);
      expect(existingCart.items[0].quantity).toBe(5);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mergeReport: expect.objectContaining({
              omitted: [
                {
                  productId: productAId,
                  variantId: "var_nonexistent",
                  reason: "VARIANT_NOT_FOUND"
                },
                {
                  productId: productBId,
                  reason: "PRODUCT_NOT_FOUND"
                }
              ]
            })
          })
        })
      );
    });
  });
});
