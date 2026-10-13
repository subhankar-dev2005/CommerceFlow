import Product from "./product.model.js";
import AppError from "../../common/errors/app-error.js";
import { recordAdminAuditEvent, AUDIT_EVENT_TYPES } from "../audit/admin-audit.service.js";

async function deleteProduct(
  req,
  res,
  next
) {
  try {
    const { id } = req.params;

    const product =
      await Product.findByIdAndUpdate(
        id,
        { isActive: false },
        { new: true }
      );

    if (!product) {
      throw new AppError(
        "Product not found",
        404,
        [],
        "PRODUCT_NOT_FOUND"
      );
    }

    if (req.user) {
      await recordAdminAuditEvent({
        eventType: AUDIT_EVENT_TYPES.PRODUCT_DELETED,
        resourceType: "product",
        resourceId: id,
        metadata: {
          productName: product.name,
          isActive: false
        },
        req
      }).catch((auditErr) => {
        req.log?.error?.({ err: auditErr }, "Failed to record product deletion audit log");
      });
    }

    return res
      .status(200)
      .json({
        success: true,

        message:
          "Product deleted successfully",

        requestId:
          req.requestId
      });
  } catch (error) {
    next(error);
  }
}

export default deleteProduct;