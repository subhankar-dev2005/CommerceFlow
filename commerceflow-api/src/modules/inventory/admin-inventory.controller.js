import Product from "../products/product.model.js";
import InventoryAdjustment from "./inventory-adjustment.model.js";
import AppError from "../../common/errors/app-error.js";
import { DEFAULT_LOW_STOCK_THRESHOLD } from "./admin-inventory.validator.js";
import { recordAdminAuditEvent, AUDIT_EVENT_TYPES } from "../audit/admin-audit.service.js";

function escapeRegex(text) {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

/**
 * GET /api/v1/admin/inventory
 * List inventory items across simple products and variants with search, filters, and pagination.
 */
export async function getAdminInventory(req, res, next) {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 10, 1),
      100
    );
    const {
      search,
      status = "all",
      stock = "all",
      type = "all",
      sortBy = "createdAt",
      sortOrder = "desc"
    } = req.query;

    const filter = {};

    // 1. Status Filter
    if (status === "active") {
      filter.isActive = true;
    } else if (status === "inactive") {
      filter.isActive = false;
    }

    // 2. Type Filter
    if (type === "simple") {
      filter.$or = [
        { variants: { $exists: false } },
        { variants: { $size: 0 } }
      ];
    } else if (type === "variant") {
      filter["variants.0"] = { $exists: true };
    }

    // 3. Search Filter (Product Name, Product SKU, Variant SKU, Variant Name)
    if (search && typeof search === "string" && search.trim()) {
      const sanitized = escapeRegex(search.trim());
      const searchRegex = { $regex: sanitized, $options: "i" };

      const searchCondition = [
        { name: searchRegex },
        { sku: searchRegex },
        { "variants.sku": searchRegex },
        { "variants.variantName": searchRegex }
      ];

      if (filter.$or) {
        // If type filter already used $or, combine with $and
        filter.$and = [{ $or: filter.$or }, { $or: searchCondition }];
        delete filter.$or;
      } else {
        filter.$or = searchCondition;
      }
    }

    // 4. Stock State Filter
    if (stock !== "all") {
      const stockConditions = [];

      if (stock === "inStock") {
        stockConditions.push(
          {
            $and: [
              { $or: [{ variants: { $exists: false } }, { variants: { $size: 0 } }] },
              { stock: { $gt: 0 } }
            ]
          },
          { "variants.stock": { $gt: 0 } }
        );
      } else if (stock === "outOfStock") {
        stockConditions.push(
          {
            $and: [
              { $or: [{ variants: { $exists: false } }, { variants: { $size: 0 } }] },
              { stock: { $lte: 0 } }
            ]
          },
          { "variants.stock": { $lte: 0 } }
        );
      } else if (stock === "lowStock") {
        stockConditions.push(
          {
            $and: [
              { $or: [{ variants: { $exists: false } }, { variants: { $size: 0 } }] },
              { stock: { $gt: 0, $lte: DEFAULT_LOW_STOCK_THRESHOLD } }
            ]
          },
          { "variants.stock": { $gt: 0, $lte: DEFAULT_LOW_STOCK_THRESHOLD } }
        );
      }

      if (filter.$and) {
        filter.$and.push({ $or: stockConditions });
      } else if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: stockConditions }];
        delete filter.$or;
      } else {
        filter.$or = stockConditions;
      }
    }

    const sortDirection = sortOrder === "asc" ? 1 : -1;
    const sortOptions = {
      [sortBy]: sortDirection,
      _id: sortDirection
    };

    const skip = (page - 1) * limit;

    const [products, totalProductsCount, globalSummary] = await Promise.all([
      Product.find(filter)
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .select("_id name sku category price stock isActive variants image images createdAt updatedAt")
        .lean(),

      Product.countDocuments(filter),

      // Global Inventory Metrics
      Promise.all([
        Product.countDocuments({}),
        Product.countDocuments({ stock: { $gt: 0, $lte: DEFAULT_LOW_STOCK_THRESHOLD } }),
        Product.countDocuments({ stock: { $lte: 0 } }),
        Product.aggregate([
          {
            $group: {
              _id: null,
              totalAggregateStock: { $sum: "$stock" }
            }
          }
        ])
      ])
    ]);

    const [totalProducts, lowStockProductsCount, outOfStockProductsCount, aggregateStockResult] = globalSummary;
    const totalInventoryStock = aggregateStockResult[0]?.totalAggregateStock || 0;

    // Flatten products into granular line items (for both simple products and individual variants)
    const items = [];

    for (const p of products) {
      const hasVariants = Array.isArray(p.variants) && p.variants.length > 0;

      if (!hasVariants) {
        // Simple Product Item
        const itemStock = typeof p.stock === "number" ? p.stock : 0;
        const stockState =
          itemStock <= 0
            ? "outOfStock"
            : itemStock <= DEFAULT_LOW_STOCK_THRESHOLD
              ? "lowStock"
              : "inStock";

        items.push({
          id: p._id.toString(),
          productId: p._id.toString(),
          productName: p.name,
          productSku: p.sku || null,
          productImage: p.image || p.images?.[0] || null,
          category: p.category,
          type: "simple",
          variantId: null,
          variantName: null,
          sku: p.sku || "—",
          attributes: null,
          stock: itemStock,
          parentStock: itemStock,
          price: p.price,
          isActive: p.isActive,
          productIsActive: p.isActive,
          variantIsActive: null,
          stockState,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt
        });
      } else {
        // Variant Product Items
        for (const v of p.variants) {
          const variantStock = typeof v.stock === "number" ? v.stock : 0;
          const stockState =
            variantStock <= 0
              ? "outOfStock"
              : variantStock <= DEFAULT_LOW_STOCK_THRESHOLD
                ? "lowStock"
                : "inStock";

          const rawAttrs = v.attributes;
          let attributes = {};
          if (rawAttrs instanceof Map) {
            attributes = Object.fromEntries(rawAttrs);
          } else if (rawAttrs && typeof rawAttrs === "object" && !Array.isArray(rawAttrs)) {
            attributes = rawAttrs;
          }

          items.push({
            id: `${p._id}_${v.variantId || v._id}`,
            productId: p._id.toString(),
            productName: p.name,
            productSku: p.sku || null,
            productImage: v.images?.[0] || p.image || p.images?.[0] || null,
            category: p.category,
            type: "variant",
            variantId: v.variantId || v._id.toString(),
            variantName: v.variantName || v.sku,
            sku: v.sku,
            attributes,
            stock: variantStock,
            parentStock: p.stock,
            price: v.price ?? p.price,
            isActive: p.isActive && (v.isActive !== false),
            productIsActive: p.isActive,
            variantIsActive: v.isActive !== false,
            stockState,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt
          });
        }
      }
    }

    const totalPages = Math.ceil(totalProductsCount / limit) || 1;

    return res.status(200).json({
      success: true,
      data: {
        items,
        products,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          totalProducts: totalProductsCount,
          totalItems: items.length,
          totalPages
        },
        summary: {
          totalProducts,
          totalStock: totalInventoryStock,
          lowStockCount: lowStockProductsCount,
          outOfStockCount: outOfStockProductsCount,
          lowStockThreshold: DEFAULT_LOW_STOCK_THRESHOLD
        }
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/admin/inventory/adjust
 * Server-authoritative atomic stock adjustment for simple product or specific variant.
 */
export async function adjustInventoryStock(req, res, next) {
  try {
    const { productId, variantId, adjustment, reason, note = "" } = req.body;

    const product = await Product.findById(productId);
    if (!product) {
      throw new AppError("Product not found", 404, [], "PRODUCT_NOT_FOUND");
    }

    const hasVariants = Array.isArray(product.variants) && product.variants.length > 0;

    let previousStock;
    let resultingStock;
    let updatedProduct;
    let targetVariant = null;

    if (hasVariants) {
      // 1. Variant product branch
      if (!variantId || !variantId.trim()) {
        throw new AppError(
          "Product has variants. Please specify a variantId to adjust variant stock.",
          400,
          [],
          "VARIANT_ID_REQUIRED"
        );
      }

      targetVariant = product.variants.find(
        (v) => v.variantId === variantId || (v._id && v._id.toString() === variantId)
      );

      if (!targetVariant) {
        throw new AppError(
          `Variant '${variantId}' does not belong to this product`,
          404,
          [],
          "VARIANT_NOT_FOUND"
        );
      }

      previousStock = targetVariant.stock;

      if (adjustment < 0 && previousStock + adjustment < 0) {
        throw new AppError(
          `Cannot reduce stock below zero. Current stock is ${previousStock}, adjustment is ${adjustment}.`,
          400,
          [],
          "INSUFFICIENT_STOCK_FOR_ADJUSTMENT"
        );
      }

      // Atomic update targeting exact variant subdocument
      const query = {
        _id: productId,
        variants: {
          $elemMatch: {
            $or: [{ variantId: targetVariant.variantId }, { _id: targetVariant._id }],
            ...(adjustment < 0 ? { stock: { $gte: -adjustment } } : {})
          }
        }
      };

      updatedProduct = await Product.findOneAndUpdate(
        query,
        {
          $inc: { "variants.$.stock": adjustment }
        },
        { new: true }
      );

      if (!updatedProduct) {
        throw new AppError(
          "Variant stock was modified concurrently and cannot satisfy the adjustment.",
          409,
          [],
          "CONCURRENT_STOCK_CONFLICT"
        );
      }

      // Re-read updated variant stock
      const freshVariant = updatedProduct.variants.find(
        (v) => v.variantId === targetVariant.variantId || (v._id && v._id.toString() === targetVariant._id.toString())
      );
      resultingStock = freshVariant ? freshVariant.stock : previousStock + adjustment;
    } else {
      // 2. Simple product branch
      if (variantId && variantId.trim()) {
        throw new AppError(
          "Product does not have variants. variantId must not be specified.",
          400,
          [],
          "SIMPLE_PRODUCT_NO_VARIANTS"
        );
      }

      previousStock = product.stock;

      if (adjustment < 0 && previousStock + adjustment < 0) {
        throw new AppError(
          `Cannot reduce stock below zero. Current stock is ${previousStock}, adjustment is ${adjustment}.`,
          400,
          [],
          "INSUFFICIENT_STOCK_FOR_ADJUSTMENT"
        );
      }

      const query = {
        _id: productId,
        $or: [{ variants: { $exists: false } }, { variants: { $size: 0 } }],
        ...(adjustment < 0 ? { stock: { $gte: -adjustment } } : {})
      };

      updatedProduct = await Product.findOneAndUpdate(
        query,
        {
          $inc: { stock: adjustment }
        },
        { new: true }
      );

      if (!updatedProduct) {
        throw new AppError(
          "Product stock was modified concurrently and cannot satisfy the adjustment.",
          409,
          [],
          "CONCURRENT_STOCK_CONFLICT"
        );
      }

      resultingStock = updatedProduct.stock;
    }

    // 3. Durable adjustment audit record
    const adjustmentLog = await InventoryAdjustment.create({
      product: product._id,
      productName: product.name,
      variantId: targetVariant ? targetVariant.variantId : null,
      variantName: targetVariant ? (targetVariant.variantName || targetVariant.sku) : null,
      sku: targetVariant ? targetVariant.sku : (product.sku || null),
      previousStock,
      adjustment,
      resultingStock,
      reason,
      note: note.trim(),
      adminId: req.user._id,
      adminEmail: req.user.email
    });

    if (req.user) {
      await recordAdminAuditEvent({
        eventType: AUDIT_EVENT_TYPES.INVENTORY_ADJUSTED,
        resourceType: "inventory",
        resourceId: product._id?.toString(),
        metadata: {
          productName: product.name,
          variantId: adjustmentLog.variantId,
          sku: adjustmentLog.sku,
          previousStock,
          adjustment,
          resultingStock,
          reason,
          note: note.trim()
        },
        req
      }).catch((auditErr) => {
        req.log?.error?.({ err: auditErr }, "Failed to record inventory adjustment audit log");
      });
    }

    return res.status(200).json({
      success: true,
      message: "Stock adjusted successfully",
      data: {
        adjustment: {
          id: adjustmentLog._id,
          productId: product._id,
          productName: product.name,
          variantId: adjustmentLog.variantId,
          variantName: adjustmentLog.variantName,
          sku: adjustmentLog.sku,
          previousStock: adjustmentLog.previousStock,
          adjustment: adjustmentLog.adjustment,
          resultingStock: adjustmentLog.resultingStock,
          reason: adjustmentLog.reason,
          note: adjustmentLog.note,
          adjustedAt: adjustmentLog.createdAt,
          adjustedBy: {
            id: req.user._id,
            email: req.user.email
          }
        },
        product: updatedProduct
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/admin/inventory/adjustments
 * List historical adjustment records with optional product filtering.
 */
export async function getInventoryAdjustments(req, res, next) {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 20, 1),
      100
    );
    const { productId } = req.query;

    const filter = {};
    if (productId) {
      filter.product = productId;
    }

    const skip = (page - 1) * limit;

    const [adjustments, total] = await Promise.all([
      InventoryAdjustment.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      InventoryAdjustment.countDocuments(filter)
    ]);

    return res.status(200).json({
      success: true,
      data: {
        adjustments,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(Math.ceil(total / limit), 1)
        }
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}
