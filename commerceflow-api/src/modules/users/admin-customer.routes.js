import { Router } from "express";
import authMiddleware from "../../common/middleware/auth.middleware.js";
import authorize from "../../common/middleware/authorize.middleware.js";
import validate from "../../common/middleware/validate.middleware.js";
import {
  getAdminCustomers,
  getAdminCustomerById,
  updateAdminCustomerStatus
} from "./admin-customer.controller.js";
import {
  getAdminCustomersSchema,
  customerIdParamSchema,
  updateCustomerStatusSchema
} from "./admin-customer.validator.js";

const router = Router();

// Protect all admin customer endpoints with auth and admin role authorization
router.use(authMiddleware, authorize("admin"));

// List customers with pagination, search, status, and sorting
router.get("/", validate(getAdminCustomersSchema), getAdminCustomers);

// Update customer active status (activate/deactivate)
router.patch(
  "/:customerId/status",
  validate(updateCustomerStatusSchema),
  updateAdminCustomerStatus
);

// Get detailed customer profile, addresses, order statistics, and recent orders
router.get("/:customerId", validate(customerIdParamSchema), getAdminCustomerById);

export default router;
