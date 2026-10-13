
import { Router } from "express";
import { z } from "zod";

import validate from "../../common/middleware/validate.middleware.js";
import authMiddleware from "../../common/middleware/auth.middleware.js";
import authorizeRoles from "../../common/middleware/authorize.middleware.js";
import { catalogRateLimitMiddleware } from "../../common/middleware/auth-rate-limit.middleware.js";

import getProduct from "./get-product.controller.js";
import getCategories from "./get-categories.controller.js";
import updateProduct from "./update-product.controller.js";
import deleteProduct from "./delete-product.controller.js";

import updateProductSchema from "./update-product.validator.js";

import {
  createProduct,
  getProducts
} from "./product.controller.js";

import createProductSchema from "./product.validator.js";
import productQuerySchema from "./product-query.validator.js";

import reviewRoutes from "../reviews/review.routes.js";

const router = Router();

router.use("/:productId/reviews", reviewRoutes);

const productIdSchema = z.object({
  body: z.object({}).optional(),
  query: z.object({}).optional(),
  params: z.object({
    id: z
      .string()
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid product ID")
  })
});

router.get(
  "/",
  catalogRateLimitMiddleware,
  validate(productQuerySchema),
  getProducts
);

router.get(
  "/categories",
  catalogRateLimitMiddleware,
  getCategories
);

router.post(
  "/",
  authMiddleware,
  authorizeRoles("admin"),
  validate(createProductSchema),
  createProduct
);

router.get(
  "/:id",
  catalogRateLimitMiddleware,
  validate(productIdSchema),
  getProduct
);

router.patch(
  "/:id",
  authMiddleware,
  authorizeRoles("admin"),
  validate(updateProductSchema),
  updateProduct
);

router.delete(
  "/:id",
  authMiddleware,
  authorizeRoles("admin"),
  validate(productIdSchema),
  deleteProduct
);

export { productIdSchema };
export default router;
