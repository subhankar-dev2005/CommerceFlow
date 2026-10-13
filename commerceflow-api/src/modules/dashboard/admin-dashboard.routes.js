import { Router } from "express";
import authMiddleware from "../../common/middleware/auth.middleware.js";
import authorize from "../../common/middleware/authorize.middleware.js";
import validate from "../../common/middleware/validate.middleware.js";
import {
  getDashboardSummary,
  getDashboardSales,
  getDashboardTopProducts
} from "./admin-dashboard.controller.js";
import {
  getDashboardSalesSchema,
  getDashboardTopProductsSchema
} from "./admin-dashboard.validator.js";

const router = Router();

// Protect all dashboard endpoints with authentication and admin authorization
router.use(authMiddleware, authorize("admin"));

// Consolidated dashboard summary
router.get("/summary", getDashboardSummary);

// Period-specific sales overview (7d, 30d, 90d)
router.get("/sales", validate(getDashboardSalesSchema), getDashboardSales);

// Top selling products based on order line-item history
router.get(
  "/top-products",
  validate(getDashboardTopProductsSchema),
  getDashboardTopProducts
);

export default router;
