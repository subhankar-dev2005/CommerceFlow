
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import Product from "./product.model.js";
import AppError from "../../common/errors/app-error.js";
import { reserveProductSkus, releaseProductSkus } from "./sku-registry.service.js";
import escapeRegex from "../../utils/escape-regex.js";
import { recordAdminAuditEvent, AUDIT_EVENT_TYPES } from "../audit/admin-audit.service.js";

async function createProduct(
  req,
  res,
  next
) {
  try {
    const {
      name,
      description,
      price,
      stock,
      category,
      image,
      images,
      specifications,
      variants
    } = req.body;

    const isVariantProduct = Array.isArray(variants) && variants.length > 0;

    let product;

    if (isVariantProduct) {
      const seenClientIds = new Set();
      let duplicateClientId = null;
      let hasClientSuppliedId = false;

      for (const variant of variants) {
        if (variant && variant.variantId !== undefined && variant.variantId !== null) {
          if (seenClientIds.has(variant.variantId)) {
            duplicateClientId = variant.variantId;
          }
          seenClientIds.add(variant.variantId);
          hasClientSuppliedId = true;
        }
      }

      if (duplicateClientId) {
        throw new AppError(
          `Duplicate variant ID '${duplicateClientId}' in creation payload`,
          400,
          [],
          "INVALID_VARIANT_ID"
        );
      }

      if (hasClientSuppliedId) {
        throw new AppError(
          "Client-supplied variantId is not allowed during product creation",
          400,
          [],
          "INVALID_VARIANT_ID"
        );
      }

      const productId = new mongoose.Types.ObjectId();

      const preparedVariants = variants.map((variant) => ({
        variantId: `var_${randomUUID()}`,
        sku: variant.sku,
        attributes: variant.attributes,
        price: variant.price !== undefined && variant.price !== null ? variant.price : null,
        stock: variant.stock,
        images: Array.isArray(variant.images) ? variant.images : [],
        isActive: variant.isActive !== false
      }));

      const activeStock = preparedVariants
        .filter((v) => v.isActive !== false)
        .reduce((sum, v) => sum + v.stock, 0);

      const skuEntries = preparedVariants.map((v) => ({
        sku: v.sku,
        variantId: v.variantId
      }));

      await reserveProductSkus(productId, skuEntries);

      try {
        product = await Product.create({
          _id: productId,
          name,
          description,
          price,
          stock: activeStock,
          category,
          image,
          ...(images !== undefined ? { images } : {}),
          ...(specifications !== undefined ? { specifications } : {}),
          variants: preparedVariants
        });
      } catch (err) {
        await releaseProductSkus(productId, skuEntries).catch(() => {});
        throw err;
      }
    } else {
      product = await Product.create({
        name,
        description,
        price,
        stock,
        category,
        image,
        ...(images !== undefined ? { images } : {}),
        ...(specifications !== undefined ? { specifications } : {})
      });
    }

    if (req.user) {
      await recordAdminAuditEvent({
        eventType: AUDIT_EVENT_TYPES.PRODUCT_CREATED,
        resourceType: "product",
        resourceId: product._id?.toString(),
        metadata: {
          name: product.name,
          price: product.price,
          stock: product.stock,
          category: product.category,
          hasVariants: isVariantProduct
        },
        req
      }).catch((auditErr) => {
        req.log?.error?.({ err: auditErr }, "Failed to record product creation audit log");
      });
    }

    return res
      .status(201)
      .json({
        success: true,

        message:
          "Product created successfully",

        data: {
          product
        },

        requestId:
          req.requestId
      });

  } catch (error) {
    next(error);
  }
}

async function getProducts(
  req,
  res,
  next
) {
  try {
    const page =
      Math.max(
        parseInt(req.query.page, 10) || 1,
        1
      );

    const limit =
      Math.min(
        Math.max(
          parseInt(req.query.limit, 10) || 10,
          1
        ),
        100
      );

    const skip =
      (page - 1) * limit;

    const filter = {
      isActive: true
    };

    if (req.query.search) {
      const sanitizedSearch =
        escapeRegex(req.query.search);

      filter.$or = [
        {
          name: {
            $regex: sanitizedSearch,
            $options: "i"
          }
        },
        {
          description: {
            $regex: sanitizedSearch,
            $options: "i"
          }
        }
      ];
    }

    if (req.query.category) {
      filter.category =
        req.query.category;
    }

    if (req.query.inStock === "true") {
      filter.stock = {
        $gt: 0
      };
    }

    if (req.query.inStock === "false") {
      filter.stock = {
        $lte: 0
      };
    }

    if (
      req.query.minPrice ||
      req.query.maxPrice
    ) {
      filter.price = {};

      if (req.query.minPrice) {
        filter.price.$gte =
          Number(req.query.minPrice);
      }

      if (req.query.maxPrice) {
        filter.price.$lte =
          Number(req.query.maxPrice);
      }
    }

    const allowedSortFields = [
      "price",
      "createdAt",
      "name"
    ];

    const sortBy =
      allowedSortFields.includes(
        req.query.sortBy
      )
        ? req.query.sortBy
        : "createdAt";

    const sortOrder =
      req.query.sortOrder === "asc"
        ? 1
        : -1;

    const sort = {
      [sortBy]: sortOrder,
      _id: sortOrder
    };


    const totalProducts =
      await Product.countDocuments(
        filter
      );

    const products =
      await Product.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit);

    const totalPages =
      Math.max(
        Math.ceil(
          totalProducts / limit
        ),
        1
      );

    return res
      .status(200)
      .json({
        success: true,

        message:
          "Products retrieved successfully",

        data: {
          products,

          pagination: {
            page,
            limit,
            totalProducts,
            totalPages
          }
        },

        requestId:
          req.requestId
      });

  } catch (error) {
    next(error);
  }
}

export {
  createProduct,
  getProducts
};
