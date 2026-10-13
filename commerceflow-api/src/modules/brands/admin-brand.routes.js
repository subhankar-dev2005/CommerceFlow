import { Router } from "express";
import authMiddleware from "../../common/middleware/auth.middleware.js";
import authorize from "../../common/middleware/authorize.middleware.js";
import validate from "../../common/middleware/validate.middleware.js";
import {
  getAdminBrands,
  getAdminBrandById,
  createAdminBrand,
  updateAdminBrand,
  deleteAdminBrand
} from "./admin-brand.controller.js";
import {
  brandIdSchema,
  getBrandsQuerySchema,
  createBrandSchema,
  updateBrandSchema
} from "./brand.validator.js";

const router = Router();

// Protect all admin brand endpoints with authentication and admin authorization
router.use(authMiddleware, authorize("admin"));

// List brands with search, pagination, and filters
router.get("/", validate(getBrandsQuerySchema), getAdminBrands);

// Create a new brand
router.post("/", validate(createBrandSchema), createAdminBrand);

// Get single brand by ID
router.get("/:id", validate(brandIdSchema), getAdminBrandById);

// Update brand
router.patch("/:id", validate(updateBrandSchema), updateAdminBrand);

// Delete brand
router.delete("/:id", validate(brandIdSchema), deleteAdminBrand);

export default router;
