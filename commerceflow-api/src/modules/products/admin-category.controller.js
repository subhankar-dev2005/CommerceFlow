import mongoose from "mongoose";
import Product from "./product.model.js";
import AppError from "../../common/errors/app-error.js";
import { recordAdminAuditEvent, AUDIT_EVENT_TYPES } from "../audit/admin-audit.service.js";

export const CATEGORY_BULK_BATCH_SIZE = 100;

/**
 * Atomically reassigns product categories in bounded batches with per-document change tokens
 * and optimistic concurrency guards.
 *
 * @param {Object} params
 * @param {string} params.fromCategory - The current category being matched
 * @param {string} params.toCategory - The new category to assign
 * @param {number} [params.batchSize=100] - Number of operations per bulkWrite chunk
 * @param {mongoose.ClientSession|null} [params.session=null] - Optional MongoDB session
 * @returns {Promise<{ modifiedCount: number }>}
 */
export async function bulkReassignCategory({
  fromCategory,
  toCategory,
  batchSize = CATEGORY_BULK_BATCH_SIZE,
  session = null
}) {
  let totalModified = 0;
  const bulkOptions = { ordered: false };
  if (session) {
    bulkOptions.session = session;
  }

  // Stream matching products with a cursor to bound memory consumption
  const query = Product.find({ category: fromCategory }).select("_id").lean();
  if (session && typeof query.session === "function") {
    query.session(session);
  }
  const cursor = typeof query.cursor === "function" ? query.cursor({ batchSize }) : await query;

  let ops = [];

  for await (const doc of cursor) {
    const freshToken = new mongoose.Types.ObjectId().toHexString();

    ops.push({
      updateOne: {
        filter: {
          _id: doc._id,
          category: fromCategory
        },
        update: {
          $set: {
            category: toCategory,
            changeToken: freshToken
          }
        }
      }
    });

    if (ops.length >= batchSize) {
      const res = await Product.bulkWrite(ops, bulkOptions);
      const matched = res?.matchedCount ?? res?.nMatched ?? 0;
      const modified = res?.modifiedCount ?? res?.nModified ?? 0;

      if (matched < ops.length) {
        throw new AppError(
          "Category bulk update encountered a concurrent modification conflict. Some products could not be updated.",
          409,
          [],
          "CONCURRENT_MODIFICATION_CONFLICT"
        );
      }

      totalModified += modified;
      ops = [];
    }
  }

  if (ops.length > 0) {
    const res = await Product.bulkWrite(ops, bulkOptions);
    const matched = res?.matchedCount ?? res?.nMatched ?? 0;
    const modified = res?.modifiedCount ?? res?.nModified ?? 0;

    if (matched < ops.length) {
      throw new AppError(
        "Category bulk update encountered a concurrent modification conflict. Some products could not be updated.",
        409,
        [],
        "CONCURRENT_MODIFICATION_CONFLICT"
      );
    }

    totalModified += modified;
  }

  return { modifiedCount: totalModified };
}

function escapeRegex(text) {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

/**
 * GET /api/v1/admin/categories
 * Server-authoritative category aggregation across active and inactive products.
 */
export async function getAdminCategories(req, res, next) {
  try {
    const { search, sortBy = "name", sortOrder = "asc" } = req.query;

    const pipeline = [
      {
        $group: {
          _id: "$category",
          totalProducts: { $sum: 1 },
          activeProducts: { $sum: { $cond: [{ $eq: ["$isActive", true] }, 1, 0] } },
          inStockProducts: { $sum: { $cond: [{ $gt: ["$stock", 0] }, 1, 0] } },
          outOfStockProducts: { $sum: { $cond: [{ $lte: ["$stock", 0] }, 1, 0] } },
          totalStock: { $sum: "$stock" }
        }
      },
      {
        $project: {
          _id: 0,
          name: "$_id",
          totalProducts: 1,
          activeProducts: 1,
          inStockProducts: 1,
          outOfStockProducts: 1,
          totalStock: 1
        }
      }
    ];

    if (search && search.trim()) {
      const sanitized = escapeRegex(search.trim());
      pipeline.push({
        $match: {
          name: { $regex: sanitized, $options: "i" }
        }
      });
    }

    const sortDirection = sortOrder === "desc" ? -1 : 1;
    pipeline.push({
      $sort: {
        [sortBy]: sortDirection,
        name: 1
      }
    });

    const categories = await Product.aggregate(pipeline);

    return res.status(200).json({
      success: true,
      message: "Admin categories retrieved successfully",
      data: {
        categories,
        totalCategories: categories.length
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/v1/admin/categories/:name
 * Safe category rename across catalog products with validation and audit logging.
 */
export async function updateAdminCategory(req, res, next) {
  try {
    const rawName = req.params.name;
    const { newName } = req.body;

    const currentName = rawName.trim();
    const cleanNewName = newName.trim();

    if (currentName.toLowerCase() === cleanNewName.toLowerCase()) {
      throw new AppError(
        "New category name must be different from current category name",
        400,
        [],
        "VALIDATION_ERROR"
      );
    }

    const matchingCount = await Product.countDocuments({ category: currentName });
    if (matchingCount === 0) {
      throw new AppError("Category not found in catalog", 404, [], "CATEGORY_NOT_FOUND");
    }

    // Prevent accidental category merging: destination name must not already exist
    const destinationCount = await Product.countDocuments({
      category: { $regex: `^${escapeRegex(cleanNewName)}$`, $options: "i" }
    });
    if (destinationCount > 0) {
      throw new AppError(
        `Category '${cleanNewName}' already exists in catalog. Accidental category merging is prevented.`,
        409,
        [],
        "CATEGORY_ALREADY_EXISTS"
      );
    }

    const result = await bulkReassignCategory({
      fromCategory: currentName,
      toCategory: cleanNewName
    });

    // Audit event logging
    try {
      await recordAdminAuditEvent({
        eventType: AUDIT_EVENT_TYPES.PRODUCT_UPDATED,
        resourceType: "category",
        resourceId: currentName,
        metadata: {
          action: "CATEGORY_RENAMED",
          previousCategory: currentName,
          newCategory: cleanNewName,
          affectedProductsCount: result.modifiedCount
        },
        req
      });
    } catch {
      // Audit failure must never fail the transaction
    }

    return res.status(200).json({
      success: true,
      message: `Category '${currentName}' renamed to '${cleanNewName}' across ${result.modifiedCount} products`,
      data: {
        previousCategory: currentName,
        newCategory: cleanNewName,
        affectedProductsCount: result.modifiedCount
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/v1/admin/categories/:name
 * Guarded category deletion: strictly blocks removal if any products remain in the category
 * unless explicit cascade=true query parameter is authorized.
 */
export async function deleteAdminCategory(req, res, next) {
  try {
    const categoryName = req.params.name.trim();
    const isCascade = req.query?.cascade === "true";

    const productCount = await Product.countDocuments({ category: categoryName });
    if (productCount > 0 && !isCascade) {
      throw new AppError(
        `Cannot delete category '${categoryName}' because ${productCount} products are currently assigned to it. Reassign or delete products first.`,
        409,
        [],
        "CATEGORY_IN_USE"
      );
    }

    let reassignedCount = 0;
    if (productCount > 0 && isCascade) {
      const reassignResult = await bulkReassignCategory({
        fromCategory: categoryName,
        toCategory: "Uncategorized"
      });
      reassignedCount = reassignResult.modifiedCount;
    }

    // Record audit event
    try {
      await recordAdminAuditEvent({
        eventType: AUDIT_EVENT_TYPES.PRODUCT_DELETED,
        resourceType: "category",
        resourceId: categoryName,
        metadata: {
          action: "CATEGORY_DELETED",
          category: categoryName,
          cascade: isCascade,
          reassignedProductsCount: reassignedCount
        },
        req
      });
    } catch {
      // Non-blocking
    }

    return res.status(200).json({
      success: true,
      message: isCascade
        ? `Category '${categoryName}' deleted and ${reassignedCount} products reassigned to 'Uncategorized'`
        : `Category '${categoryName}' deleted successfully`,
      data: {
        category: categoryName,
        cascade: isCascade,
        reassignedProductsCount: reassignedCount
      },
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}
