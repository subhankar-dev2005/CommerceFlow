import { Router } from "express";
import authMiddleware from "../../common/middleware/auth.middleware.js";
import authorize from "../../common/middleware/authorize.middleware.js";
import validate from "../../common/middleware/validate.middleware.js";
import {
  getAdminCategories,
  updateAdminCategory,
  deleteAdminCategory
} from "./admin-category.controller.js";
import {
  getAdminCategoriesSchema,
  updateAdminCategorySchema,
  deleteAdminCategorySchema
} from "./admin-category.validator.js";

const router = Router();

// Enforce authentication and administrator authorization
router.use(authMiddleware, authorize("admin"));

// List categories with aggregated counts, search, and sorting
router.get("/", validate(getAdminCategoriesSchema), getAdminCategories);

// Rename category across catalog
router.patch("/:name", validate(updateAdminCategorySchema), updateAdminCategory);

// Guarded category delete (blocks if products exist)
router.delete("/:name", validate(deleteAdminCategorySchema), deleteAdminCategory);

export default router;
