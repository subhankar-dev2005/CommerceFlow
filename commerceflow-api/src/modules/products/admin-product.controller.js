import Product from "./product.model.js";
import AppError from "../../common/errors/app-error.js";
import escapeRegex from "../../utils/escape-regex.js";
import { recordAdminAuditEvent, AUDIT_EVENT_TYPES } from "../audit/admin-audit.service.js";

/**
 * GET /api/v1/admin/products
 * Cross-catalog administrative product listing with active/inactive visibility,
 * variant filtering, stock level filtering, and deterministic sorting.
 */
export async function getAdminProducts(req, res, next) {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 10, 1),
      100
    );
    const skip = (page - 1) * limit;

    const filter = {};

    // 1. Status Filter (active / inactive / all)
    if (req.query.status === "active") {
      filter.isActive = true;
    } else if (req.query.status === "inactive") {
      filter.isActive = false;
    }

    // 2. Stock Level Filter
    if (req.query.stock === "inStock") {
      filter.stock = { $gt: 0 };
    } else if (req.query.stock === "outOfStock") {
      filter.stock = { $lte: 0 };
    } else if (req.query.stock === "lowStock") {
      filter.stock = { $gt: 0, $lte: 5 };
    }

    // 3. Variant Presence Filter
    if (req.query.hasVariants === "true") {
      filter["variants.0"] = { $exists: true };
    } else if (req.query.hasVariants === "false") {
      filter.$or = [
        { variants: { $exists: false } },
        { variants: { $size: 0 } }
      ];
    }

    // 4. Category Filter
    if (req.query.category && typeof req.query.category === "string") {
      const cleanCat = req.query.category.trim();
      if (cleanCat) {
        filter.category = cleanCat;
      }
    }

    // 5. Search Across Product Name, Description, and Variant SKUs
    if (req.query.search && typeof req.query.search === "string") {
      const cleanSearch = req.query.search.trim();
      if (cleanSearch) {
        const sanitized = escapeRegex(cleanSearch);
        const searchOr = [
          { name: { $regex: sanitized, $options: "i" } },
          { description: { $regex: sanitized, $options: "i" } },
          { sku: { $regex: sanitized, $options: "i" } },
          { "variants.sku": { $regex: sanitized, $options: "i" } }
        ];

        if (filter.$or) {
          filter.$and = [{ $or: filter.$or }, { $or: searchOr }];
          delete filter.$or;
        } else {
          filter.$or = searchOr;
        }
      }
    }

    const totalProducts = await Product.countDocuments(filter);

    let sortField = req.query.sortBy || "createdAt";
    let sortDirection = req.query.sortOrder === "asc" ? 1 : -1;

    if (req.query.sort) {
      switch (req.query.sort) {
        case "newest":
          sortField = "createdAt";
          sortDirection = -1;
          break;
        case "oldest":
          sortField = "createdAt";
          sortDirection = 1;
          break;
        case "price_asc":
          sortField = "price";
          sortDirection = 1;
          break;
        case "price_desc":
          sortField = "price";
          sortDirection = -1;
          break;
        case "name_asc":
          sortField = "name";
          sortDirection = 1;
          break;
        case "name_desc":
          sortField = "name";
          sortDirection = -1;
          break;
        case "stock_asc":
          sortField = "stock";
          sortDirection = 1;
          break;
        case "stock_desc":
          sortField = "stock";
          sortDirection = -1;
          break;
        default:
          break;
      }
    }

    const sortQuery = {
      [sortField]: sortDirection,
      _id: -1 // Deterministic tiebreaker
    };

    const products = await Product.find(filter)
      .select("-__v")
      .sort(sortQuery)
      .skip(skip)
      .limit(limit)
      .lean();

    const totalPages = Math.max(Math.ceil(totalProducts / limit), 1);

    return res.status(200).json({
      success: true,
      message: "Admin products retrieved successfully",
      data: {
        products,
        pagination: {
          page,
          limit,
          totalProducts,
          totalPages
        }
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/admin/products/:id
 * Retrieve product details for administration without storefront active-only gating.
 */
export async function getAdminProductById(req, res, next) {
  try {
    const { id } = req.params;

    const product = await Product.findById(id).select("-__v").lean();

    if (!product) {
      throw new AppError("Product not found", 404, [], "PRODUCT_NOT_FOUND");
    }

    return res.status(200).json({
      success: true,
      message: "Admin product retrieved successfully",
      data: {
        product
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/v1/admin/products/:id/status
 * Explicit active/inactive status toggle for catalog management.
 */
export async function updateAdminProductStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const product = await Product.findByIdAndUpdate(
      id,
      { isActive: Boolean(isActive) },
      { new: true, runValidators: true }
    )
      .select("-__v")
      .lean();

    if (!product) {
      throw new AppError("Product not found", 404, [], "PRODUCT_NOT_FOUND");
    }

    if (req.user) {
      await recordAdminAuditEvent({
        eventType: AUDIT_EVENT_TYPES.PRODUCT_STATUS_UPDATED,
        resourceType: "product",
        resourceId: id,
        metadata: {
          productName: product.name,
          isActive: product.isActive
        },
        req
      }).catch((auditErr) => {
        req.log?.error?.({ err: auditErr }, "Failed to record product status audit log");
      });
    }

    return res.status(200).json({
      success: true,
      message: `Product ${product.isActive ? "activated" : "deactivated"} successfully`,
      data: {
        product
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}
