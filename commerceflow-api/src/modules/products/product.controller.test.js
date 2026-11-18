import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./product.model.js", () => ({
  default: {
    create: vi.fn(),
    countDocuments: vi.fn(),
    find: vi.fn(),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findOne: vi.fn()
  }
}));

vi.mock("./sku-registry.service.js", () => ({
  reserveProductSkus: vi.fn(),
  releaseProductSkus: vi.fn()
}));

import Product from "./product.model.js";
import { reserveProductSkus, releaseProductSkus } from "./sku-registry.service.js";
import { getProducts, createProduct } from "./product.controller.js";
import updateProduct from "./update-product.controller.js";
import getProduct from "./get-product.controller.js";
import AppError from "../../common/errors/app-error.js";
import createProductSchema from "./product.validator.js";

describe("product.controller - getProducts search sanitization", () => {
  let req;
  let res;
  let next;
  let mockQuery;

  beforeEach(() => {
    vi.clearAllMocks();

    mockQuery = {
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([])
    };

    Product.find.mockReturnValue(mockQuery);
    Product.countDocuments.mockResolvedValue(0);

    req = {
      query: {},
      requestId: "test-request-id"
    };

    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };

    next = vi.fn();
  });

  it("handles normal search correctly", async () => {
    req.query.search = "laptop";

    await getProducts(req, res, next);

    expect(Product.find).toHaveBeenCalledWith(
      expect.objectContaining({
        isActive: true,
        $or: [
          { name: { $regex: "laptop", $options: "i" } },
          { description: { $regex: "laptop", $options: "i" } }
        ]
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it("treats regex metacharacters literally", async () => {
    req.query.search = "item.*+?^${}()|[]\\test";

    await getProducts(req, res, next);

    const expectedEscaped = "item\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\test";

    expect(Product.find).toHaveBeenCalledWith(
      expect.objectContaining({
        isActive: true,
        $or: [
          { name: { $regex: expectedEscaped, $options: "i" } },
          { description: { $regex: expectedEscaped, $options: "i" } }
        ]
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("does not produce an invalid-regex error with unclosed parenthesis or bracket", async () => {
    req.query.search = "phone (black [128gb";

    await getProducts(req, res, next);

    const expectedEscaped = "phone \\(black \\[128gb";

    expect(Product.find).toHaveBeenCalledWith(
      expect.objectContaining({
        isActive: true,
        $or: [
          { name: { $regex: expectedEscaped, $options: "i" } },
          { description: { $regex: expectedEscaped, $options: "i" } }
        ]
      })
    );

    // Verify the escaped string can actually compile into a valid RegExp without throwing
    expect(() => new RegExp(expectedEscaped, "i")).not.toThrow();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it("ensures both name and description search use the sanitized value", async () => {
    req.query.search = "test+product(v1)";

    await getProducts(req, res, next);

    const expectedEscaped = "test\\+product\\(v1\\)";

    expect(Product.find).toHaveBeenCalledWith(
      expect.objectContaining({
        $or: [
          { name: { $regex: expectedEscaped, $options: "i" } },
          { description: { $regex: expectedEscaped, $options: "i" } }
        ]
      })
    );
  });
});

describe("product.controller - createProduct images support", () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    vi.clearAllMocks();

    req = {
      body: {
        name: "Mechanical Keyboard",
        description: "High quality mechanical keyboard with tactile switches",
        price: 3499,
        stock: 20,
        category: "Peripherals",
        image: "https://example.com/main.jpg",
        images: [
          "https://example.com/gallery1.jpg",
          "https://example.com/gallery2.jpg"
        ]
      },
      requestId: "req-create-product-123"
    };

    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };

    next = vi.fn();
  });

  it("persists and returns images array when provided", async () => {
    const mockCreatedProduct = {
      _id: "507f1f77bcf86cd799439011",
      ...req.body
    };

    Product.create.mockResolvedValue(mockCreatedProduct);

    await createProduct(req, res, next);

    expect(Product.create).toHaveBeenCalledWith({
      name: "Mechanical Keyboard",
      description: "High quality mechanical keyboard with tactile switches",
      price: 3499,
      stock: 20,
      category: "Peripherals",
      image: "https://example.com/main.jpg",
      images: [
        "https://example.com/gallery1.jpg",
        "https://example.com/gallery2.jpg"
      ]
    });

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Product created successfully",
      data: {
        product: mockCreatedProduct
      },
      requestId: "req-create-product-123"
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("persists product with legacy primary image only when images is omitted", async () => {
    delete req.body.images;

    const mockCreatedProduct = {
      _id: "507f1f77bcf86cd799439011",
      ...req.body,
      images: []
    };

    Product.create.mockResolvedValue(mockCreatedProduct);

    await createProduct(req, res, next);

    expect(Product.create).toHaveBeenCalledWith({
      name: "Mechanical Keyboard",
      description: "High quality mechanical keyboard with tactile switches",
      price: 3499,
      stock: 20,
      category: "Peripherals",
      image: "https://example.com/main.jpg"
    });

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Product created successfully",
      data: {
        product: mockCreatedProduct
      },
      requestId: "req-create-product-123"
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("persists and returns specifications array when provided", async () => {
    req.body.specifications = [
      { label: "Switch Type", value: "Tactile Brown" },
      { label: "Connectivity", value: "USB-C" }
    ];

    const mockCreatedProduct = {
      _id: "507f1f77bcf86cd799439011",
      ...req.body
    };

    Product.create.mockResolvedValue(mockCreatedProduct);

    await createProduct(req, res, next);

    expect(Product.create).toHaveBeenCalledWith({
      name: "Mechanical Keyboard",
      description: "High quality mechanical keyboard with tactile switches",
      price: 3499,
      stock: 20,
      category: "Peripherals",
      image: "https://example.com/main.jpg",
      images: [
        "https://example.com/gallery1.jpg",
        "https://example.com/gallery2.jpg"
      ],
      specifications: [
        { label: "Switch Type", value: "Tactile Brown" },
        { label: "Connectivity", value: "USB-C" }
      ]
    });

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Product created successfully",
      data: {
        product: mockCreatedProduct
      },
      requestId: "req-create-product-123"
    });
    expect(next).not.toHaveBeenCalled();
  });
});

describe("product.controller - updateProduct specifications support", () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    vi.clearAllMocks();

    req = {
      params: {
        id: "507f1f77bcf86cd799439011"
      },
      body: {},
      requestId: "req-update-product-456"
    };

    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };

    Product.findById.mockResolvedValue({
      _id: "507f1f77bcf86cd799439011",
      variants: []
    });

    next = vi.fn();
  });

  it("updates and returns specifications when provided", async () => {
    req.body = {
      specifications: [
        { label: "Battery Life", value: "80 hours" },
        { label: "Weight", value: "60g" }
      ]
    };

    const mockUpdatedProduct = {
      _id: "507f1f77bcf86cd799439011",
      name: "Gaming Mouse",
      specifications: req.body.specifications
    };

    Product.findByIdAndUpdate.mockResolvedValue(mockUpdatedProduct);

    await updateProduct(req, res, next);

    expect(Product.findByIdAndUpdate).toHaveBeenCalledWith(
      "507f1f77bcf86cd799439011",
      {
        specifications: req.body.specifications,
        changeToken: expect.stringMatching(/^[0-9a-fA-F]{24}$/)
      },
      { new: true, runValidators: true }
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Product updated successfully",
      data: {
        product: mockUpdatedProduct
      },
      requestId: "req-update-product-456"
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("clears specifications when an empty array is provided", async () => {
    req.body = {
      specifications: []
    };

    const mockUpdatedProduct = {
      _id: "507f1f77bcf86cd799439011",
      name: "Gaming Mouse",
      specifications: []
    };

    Product.findByIdAndUpdate.mockResolvedValue(mockUpdatedProduct);

    await updateProduct(req, res, next);

    expect(Product.findByIdAndUpdate).toHaveBeenCalledWith(
      "507f1f77bcf86cd799439011",
      {
        specifications: [],
        changeToken: expect.stringMatching(/^[0-9a-fA-F]{24}$/)
      },
      { new: true, runValidators: true }
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Product updated successfully",
      data: {
        product: mockUpdatedProduct
      },
      requestId: "req-update-product-456"
    });
    expect(next).not.toHaveBeenCalled();
  });
});

describe("product.controller - retrieval with specifications", () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    vi.clearAllMocks();

    req = {
      params: {
        id: "507f1f77bcf86cd799439011"
      },
      query: {},
      requestId: "req-get-product-789"
    };

    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };

    next = vi.fn();
  });

  it("getProduct returns product with specifications", async () => {
    const mockProduct = {
      _id: "507f1f77bcf86cd799439011",
      name: "Wireless Headset",
      isActive: true,
      specifications: [
        { label: "Driver Size", value: "50mm" },
        { label: "Frequency Response", value: "20Hz-20kHz" }
      ]
    };

    Product.findOne.mockResolvedValue(mockProduct);

    await getProduct(req, res, next);

    expect(Product.findOne).toHaveBeenCalledWith({
      _id: "507f1f77bcf86cd799439011",
      isActive: true
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Product retrieved successfully",
      data: {
        product: mockProduct
      },
      requestId: "req-get-product-789"
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("getProducts includes specifications in product list", async () => {
    const mockProducts = [
      {
        _id: "507f1f77bcf86cd799439011",
        name: "Wireless Headset",
        isActive: true,
        specifications: [{ label: "Driver Size", value: "50mm" }]
      }
    ];

    const mockQuery = {
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(mockProducts)
    };

    Product.find.mockReturnValue(mockQuery);
    Product.countDocuments.mockResolvedValue(1);

    await getProducts(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Products retrieved successfully",
      data: {
        products: mockProducts,
        pagination: expect.objectContaining({
          totalProducts: 1
        })
      },
      requestId: "req-get-product-789"
    });
    expect(next).not.toHaveBeenCalled();
  });
});

describe("product.controller - createProduct variant wiring (P2.1.2)", () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    vi.clearAllMocks();

    reserveProductSkus.mockResolvedValue([]);
    releaseProductSkus.mockResolvedValue({ releasedCount: 0, releasedSkus: [] });

    req = {
      body: {
        name: "Trail Pro Running Shoe",
        description: "High performance all-weather trail running shoes",
        price: 2499,
        stock: 0, // Should be computed for variant products
        category: "Footwear",
        image: "https://example.com/shoe-main.jpg",
        variants: [
          {
            sku: "TRS-BLK-S",
            attributes: { size: "S", color: "Black" },
            price: null,
            stock: 10,
            images: ["https://example.com/trs-black.jpg"],
            isActive: true
          },
          {
            sku: "TRS-WHT-M",
            attributes: { size: "M", color: "White" },
            price: 2699,
            stock: 20,
            images: ["https://example.com/trs-white.jpg"],
            isActive: true
          },
          {
            sku: "TRS-BLU-L",
            attributes: { size: "L", color: "Blue" },
            price: 2799,
            stock: 5,
            images: [],
            isActive: false // Inactive variant
          }
        ]
      },
      requestId: "req-variant-create-456"
    };

    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };

    next = vi.fn();
  });

  it("1. simple product creation remains unchanged (omitted variants)", async () => {
    delete req.body.variants;
    req.body.stock = 15;

    const mockCreated = {
      _id: "507f1f77bcf86cd799439011",
      ...req.body
    };
    Product.create.mockResolvedValue(mockCreated);

    await createProduct(req, res, next);

    expect(reserveProductSkus).not.toHaveBeenCalled();
    expect(Product.create).toHaveBeenCalledWith({
      name: "Trail Pro Running Shoe",
      description: "High performance all-weather trail running shoes",
      price: 2499,
      stock: 15,
      category: "Footwear",
      image: "https://example.com/shoe-main.jpg"
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(next).not.toHaveBeenCalled();
  });

  it("1b. simple product creation with empty variants array does not call SKU reservation", async () => {
    req.body.variants = [];
    req.body.stock = 25;

    const mockCreated = {
      _id: "507f1f77bcf86cd799439011",
      ...req.body
    };
    Product.create.mockResolvedValue(mockCreated);

    await createProduct(req, res, next);

    expect(reserveProductSkus).not.toHaveBeenCalled();
    expect(Product.create).toHaveBeenCalledWith({
      name: "Trail Pro Running Shoe",
      description: "High performance all-weather trail running shoes",
      price: 2499,
      stock: 25,
      category: "Footwear",
      image: "https://example.com/shoe-main.jpg"
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("2. variant product creation persists all variants", async () => {
    Product.create.mockImplementation(async (payload) => ({
      ...payload
    }));

    await createProduct(req, res, next);

    expect(Product.create).toHaveBeenCalledTimes(1);
    const createCall = Product.create.mock.calls[0][0];
    expect(createCall.variants).toHaveLength(3);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(next).not.toHaveBeenCalled();
  });

  it("3. backend generates immutable var_<randomUUID> IDs for all variants", async () => {
    Product.create.mockImplementation(async (payload) => ({
      ...payload
    }));

    await createProduct(req, res, next);

    const createCall = Product.create.mock.calls[0][0];
    const generatedIds = new Set();
    for (const variant of createCall.variants) {
      expect(variant.variantId).toMatch(/^var_[0-9a-fA-F-]{36}$/);
      expect(generatedIds.has(variant.variantId)).toBe(false);
      generatedIds.add(variant.variantId);
    }
    expect(generatedIds.size).toBe(createCall.variants.length);
  });

  it("4. rejects client-supplied variantId during product creation", async () => {
    req.body.variants[0].variantId = "malicious_client_supplied_id";

    await createProduct(req, res, next);

    expect(Product.create).not.toHaveBeenCalled();
    expect(reserveProductSkus).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe("INVALID_VARIANT_ID");
    expect(error.message).toContain("Client-supplied variantId is not allowed");
  });

  it("4b. rejects duplicate client variant IDs during product creation", async () => {
    req.body.variants[0].variantId = "dup_client_id";
    req.body.variants[1].variantId = "dup_client_id";

    await createProduct(req, res, next);

    expect(Product.create).not.toHaveBeenCalled();
    expect(reserveProductSkus).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe("INVALID_VARIANT_ID");
    expect(error.message).toContain("Duplicate variant ID");
  });

  it("5. all variant SKUs are registered via reserveProductSkus", async () => {
    Product.create.mockImplementation(async (payload) => ({
      ...payload
    }));

    await createProduct(req, res, next);

    expect(reserveProductSkus).toHaveBeenCalledTimes(1);
    const [productId, skuEntries] = reserveProductSkus.mock.calls[0];
    expect(productId).toBeDefined();
    expect(skuEntries).toEqual([
      { sku: "TRS-BLK-S", variantId: expect.stringMatching(/^var_/) },
      { sku: "TRS-WHT-M", variantId: expect.stringMatching(/^var_/) },
      { sku: "TRS-BLU-L", variantId: expect.stringMatching(/^var_/) }
    ]);
  });

  it("6. duplicate SKU across another product is rejected and Product.create is skipped", async () => {
    const skuError = new AppError("SKU 'TRS-BLK-S' is already registered", 409, [], "SKU_ALREADY_EXISTS");
    reserveProductSkus.mockRejectedValue(skuError);

    await createProduct(req, res, next);

    expect(Product.create).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(skuError);
  });

  it("7. duplicate SKUs within one product are rejected by existing validation layer", () => {
    const duplicateSkuPayload = {
      body: {
        name: "Trail Pro Running Shoe",
        description: "High performance all-weather trail running shoes",
        price: 2499,
        stock: 30,
        category: "Footwear",
        variants: [
          {
            sku: "TRS-DUP",
            attributes: { size: "S" },
            stock: 10
          },
          {
            sku: "TRS-DUP",
            attributes: { size: "M" },
            stock: 20
          }
        ]
      },
      query: {},
      params: {}
    };

    const parsed = createProductSchema.safeParse(duplicateSkuPayload);
    expect(parsed.success).toBe(false);
    const issue = parsed.error.issues.find((i) => i.message.includes("Duplicate SKU"));
    expect(issue).toBeDefined();
  });

  it("8. aggregate product.stock equals sum of active variant stock (overriding client value)", async () => {
    req.body.stock = 9999; // Client tries to supply inflated root stock

    Product.create.mockImplementation(async (payload) => ({
      ...payload
    }));

    await createProduct(req, res, next);

    const createCall = Product.create.mock.calls[0][0];
    // Active variants: TRS-BLK-S (10) + TRS-WHT-M (20) = 30. Inactive TRS-BLU-L (5) excluded.
    expect(createCall.stock).toBe(30);
    expect(createCall.stock).not.toBe(9999);
  });

  it("9. inactive variant stock is excluded from aggregate root stock", async () => {
    Product.create.mockImplementation(async (payload) => ({
      ...payload
    }));

    await createProduct(req, res, next);

    const createCall = Product.create.mock.calls[0][0];
    expect(createCall.stock).toBe(30);
  });

  it("9b. all-inactive variants produce root stock 0", async () => {
    req.body.variants = [
      {
        sku: "TRS-OFF-1",
        attributes: { size: "S" },
        stock: 10,
        isActive: false
      },
      {
        sku: "TRS-OFF-2",
        attributes: { size: "M" },
        stock: 20,
        isActive: false
      }
    ];

    Product.create.mockImplementation(async (payload) => ({
      ...payload
    }));

    await createProduct(req, res, next);

    const createCall = Product.create.mock.calls[0][0];
    expect(createCall.stock).toBe(0);
  });

  it("9c. unknown internal fields in variants are rejected by validator schema", () => {
    const invalidPayload = {
      body: {
        name: "Trail Pro Running Shoe",
        description: "High performance all-weather trail running shoes",
        price: 2499,
        stock: 30,
        category: "Footwear",
        variants: [
          {
            sku: "TRS-NEW-1",
            attributes: { size: "S" },
            stock: 10,
            unknownInternalField: "forbidden"
          }
        ]
      },
      query: {},
      params: {}
    };

    const parsed = createProductSchema.safeParse(invalidPayload);
    expect(parsed.success).toBe(false);
    const hasUnrecognized = parsed.error.issues.some(
      (i) => i.code === "unrecognized_keys" && i.keys?.includes("unknownInternalField")
    );
    expect(hasUnrecognized).toBe(true);
  });

  it("10. explicit variant prices are preserved", async () => {
    Product.create.mockImplementation(async (payload) => ({
      ...payload
    }));

    await createProduct(req, res, next);

    const createCall = Product.create.mock.calls[0][0];
    expect(createCall.variants[1].price).toBe(2699);
    expect(createCall.variants[2].price).toBe(2799);
  });

  it("11. price: null is preserved for inheritance", async () => {
    Product.create.mockImplementation(async (payload) => ({
      ...payload
    }));

    await createProduct(req, res, next);

    const createCall = Product.create.mock.calls[0][0];
    expect(createCall.variants[0].price).toBeNull();
  });

  it("12. variant attributes and images are persisted", async () => {
    Product.create.mockImplementation(async (payload) => ({
      ...payload
    }));

    await createProduct(req, res, next);

    const createCall = Product.create.mock.calls[0][0];
    expect(createCall.variants[0].attributes).toEqual({ size: "S", color: "Black" });
    expect(createCall.variants[0].images).toEqual(["https://example.com/trs-black.jpg"]);
  });

  it("13. maximum variant limit (50) remains enforced by validation schema", () => {
    const fiftyOneVariants = Array.from({ length: 51 }, (_, i) => ({
      sku: `SKU-${i}`,
      attributes: { option: `val-${i}` },
      stock: 1
    }));

    const overLimitPayload = {
      body: {
        name: "Over limit shoe",
        description: "Test description for product with too many variants",
        price: 1000,
        stock: 51,
        category: "Footwear",
        variants: fiftyOneVariants
      },
      query: {},
      params: {}
    };

    const parsed = createProductSchema.safeParse(overLimitPayload);
    expect(parsed.success).toBe(false);
    const issue = parsed.error.issues.find((i) => i.message.includes("cannot have more than 50 variants"));
    expect(issue).toBeDefined();
  });

  it("14. SKU reservation failure does not create an invalid product", async () => {
    reserveProductSkus.mockRejectedValue(new Error("Database connection dropped"));

    await createProduct(req, res, next);

    expect(Product.create).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it("15. product creation failure releases previously reserved SKUs", async () => {
    Product.create.mockRejectedValue(new Error("Mongoose validation failure"));

    await createProduct(req, res, next);

    expect(reserveProductSkus).toHaveBeenCalledTimes(1);
    expect(releaseProductSkus).toHaveBeenCalledTimes(1);
    const [productId, skuEntries] = releaseProductSkus.mock.calls[0];
    expect(productId).toBeDefined();
    expect(skuEntries).toHaveLength(3);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it("16. existing product creation error handling remains unchanged", async () => {
    delete req.body.variants;
    Product.create.mockRejectedValue(new Error("Mongo network error"));

    await createProduct(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
