import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import Product from "./product.model.js";
import AppError from "../../common/errors/app-error.js";
import { reconcileProductSkus } from "./sku-registry.service.js";
import { recordAdminAuditEvent, AUDIT_EVENT_TYPES } from "../audit/admin-audit.service.js";

async function updateProduct(
  req,
  res,
  next
) {
  try {
    const { id } = req.params;

    const existingProduct = await Product.findById(id);

    if (!existingProduct) {
      throw new AppError(
        "Product not found",
        404,
        [],
        "PRODUCT_NOT_FOUND"
      );
    }

    const updateData = {
      ...req.body
    };

    let skuReconciliation = null;

    if (req.body.variants !== undefined) {
      const existingVariants = Array.isArray(existingProduct.variants)
        ? existingProduct.variants
        : [];

      const existingVariantMap = new Map();
      for (const v of existingVariants) {
        if (v.variantId) {
          existingVariantMap.set(v.variantId, v);
        }
      }

      const seenIds = new Set();
      const reconciledVariants = [];

      for (let i = 0; i < req.body.variants.length; i++) {
        const variant = req.body.variants[i];
        let assignedId = variant.variantId;
        let existingVariant = null;

        if (assignedId !== undefined && assignedId !== null) {
          existingVariant = existingVariantMap.get(assignedId);
          if (!existingVariant) {
            throw new AppError(
              `Variant with ID '${assignedId}' does not belong to this product`,
              400,
              [],
              "INVALID_VARIANT_ID"
            );
          }

          if (seenIds.has(assignedId)) {
            throw new AppError(
              `Duplicate variant ID '${assignedId}' in update payload`,
              400,
              [],
              "INVALID_VARIANT_ID"
            );
          }

          seenIds.add(assignedId);
        } else {
          assignedId = `var_${randomUUID()}`;
          seenIds.add(assignedId);
        }

        const reconciled = {
          variantId: assignedId,
          sku: variant.sku,
          attributes: variant.attributes,
          price:
            variant.price !== undefined
              ? variant.price
              : (existingVariant?.price ?? null),
          stock: variant.stock,
          images:
            variant.images !== undefined
              ? variant.images
              : (existingVariant?.images ?? []),
          isActive:
            variant.isActive !== undefined
              ? variant.isActive
              : (existingVariant?.isActive ?? true)
        };

        reconciledVariants.push(reconciled);
      }

      updateData.variants = reconciledVariants;

      if (reconciledVariants.length > 0) {
        const activeStock = reconciledVariants
          .filter((v) => v.isActive !== false)
          .reduce((sum, v) => sum + v.stock, 0);
        updateData.stock = activeStock;
      } else {
        if (req.body.stock !== undefined) {
          updateData.stock = req.body.stock;
        } else if (existingVariants.length > 0) {
          updateData.stock = 0;
        }
      }

      const currentSkuEntries = existingVariants.map((v) => ({
        sku: v.sku,
        variantId: v.variantId
      }));

      const desiredSkuEntries = reconciledVariants.map((v) => ({
        sku: v.sku,
        variantId: v.variantId
      }));

      skuReconciliation = await reconcileProductSkus(
        id,
        currentSkuEntries,
        desiredSkuEntries,
        { autoRelease: false }
      );
    } else {
      const existingVariants = Array.isArray(existingProduct.variants)
        ? existingProduct.variants
        : [];
      if (existingVariants.length > 0) {
        delete updateData.stock;
      }
    }

    let product;
    try {
      updateData.changeToken = new mongoose.Types.ObjectId().toHexString();

      product = await Product.findByIdAndUpdate(
        id,
        updateData,
        {
          new: true,
          runValidators: true
        }
      );

      if (!product) {
        throw new AppError(
          "Product not found",
          404,
          [],
          "PRODUCT_NOT_FOUND"
        );
      }
    } catch (error) {
      if (skuReconciliation) {
        await skuReconciliation.compensate().catch(() => {});
      }
      throw error;
    }

    if (skuReconciliation) {
      await skuReconciliation.commitRelease();
    }

    if (req.user) {
      await recordAdminAuditEvent({
        eventType: AUDIT_EVENT_TYPES.PRODUCT_UPDATED,
        resourceType: "product",
        resourceId: id,
        metadata: {
          name: product.name,
          updatedFields: Object.keys(req.body || {})
        },
        req
      }).catch((auditErr) => {
        req.log?.error?.({ err: auditErr }, "Failed to record product update audit log");
      });
    }

    return res
      .status(200)
      .json({
        success: true,
        message:
          "Product updated successfully",
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

export default updateProduct;