import { Router } from "express";
import authMiddleware from "../../common/middleware/auth.middleware.js";
import authorize from "../../common/middleware/authorize.middleware.js";
import validate from "../../common/middleware/validate.middleware.js";
import {
  getAdminInventory,
  adjustInventoryStock,
  getInventoryAdjustments
} from "./admin-inventory.controller.js";
import {
  getAdminInventorySchema,
  adjustStockSchema,
  getInventoryAdjustmentsSchema
} from "./admin-inventory.validator.js";

const router = Router();

// Protect all admin inventory endpoints with authentication and admin role authorization
router.use(authMiddleware, authorize("admin"));

// List inventory items with filters, search, and pagination
router.get("/", validate(getAdminInventorySchema), getAdminInventory);

// Adjust inventory stock for a simple product or variant
router.post("/adjust", validate(adjustStockSchema), adjustInventoryStock);

// Query historical inventory adjustment log records
router.get("/adjustments", validate(getInventoryAdjustmentsSchema), getInventoryAdjustments);

export default router;
