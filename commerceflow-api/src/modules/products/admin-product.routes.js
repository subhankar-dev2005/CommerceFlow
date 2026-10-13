import { Router } from "express";
import authMiddleware from "../../common/middleware/auth.middleware.js";
import authorize from "../../common/middleware/authorize.middleware.js";
import validate from "../../common/middleware/validate.middleware.js";
import {
  getAdminProducts,
  getAdminProductById,
  updateAdminProductStatus
} from "./admin-product.controller.js";
import {
  getAdminProductsSchema,
  updateProductStatusSchema
} from "./admin-product.validator.js";
import {
  createProduct
} from "./product.controller.js";
import createProductSchema from "./product.validator.js";
import updateProduct from "./update-product.controller.js";
import updateProductSchema from "./update-product.validator.js";
import deleteProduct from "./delete-product.controller.js";
import { productIdSchema } from "./product.routes.js";

const router = Router();

// Protect all admin product routes with auth and admin role authorization
router.use(authMiddleware, authorize("admin"));

// List products across entire catalog with admin filters
router.get("/", validate(getAdminProductsSchema), getAdminProducts);

// Create product (simple or variant-aware)
router.post("/", validate(createProductSchema), createProduct);

// Get single product for administration (active or inactive)
router.get("/:id", validate(productIdSchema), getAdminProductById);

// Update product (fields, stock, pricing, and variants)
router.patch("/:id", validate(updateProductSchema), updateProduct);

// Toggle product active/inactive status
router.patch("/:id/status", validate(updateProductStatusSchema), updateAdminProductStatus);

// Soft-delete product
router.delete("/:id", validate(productIdSchema), deleteProduct);

export default router;
