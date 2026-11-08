import { Router } from "express";

import authMiddleware from "../common/middleware/auth.middleware.js";

import authorize from "../common/middleware/authorize.middleware.js";

import validate from "../common/middleware/validate.middleware.js";

import getAdminOrders from "../modules/orders/get-admin-orders.controller.js";
import { getAdminOrdersSchema } from "../modules/orders/order.validator.js";
import adminCouponRoutes from "../modules/coupons/admin-coupon.routes.js";
import adminCustomerRoutes from "../modules/users/admin-customer.routes.js";
import adminUserRoutes from "../modules/users/admin-user.routes.js";
import adminDashboardRoutes from "../modules/dashboard/admin-dashboard.routes.js";
import adminInventoryRoutes from "../modules/inventory/admin-inventory.routes.js";
import adminProductRoutes from "../modules/products/admin-product.routes.js";
import adminAuditLogRoutes from "../modules/audit/admin-audit-log.routes.js";
import adminReturnRoutes from "../modules/returns/admin-return.routes.js";
import adminRefundRoutes from "../modules/refunds/admin-refund.routes.js";
import adminCategoryRoutes from "../modules/products/admin-category.routes.js";
import adminBrandRoutes from "../modules/brands/admin-brand.routes.js";
import adminSettingsRoutes from "../modules/settings/admin-settings.routes.js";
import adminBannerRoutes from "../modules/banners/admin-banner.routes.js";
import adminReviewRoutes from "../modules/reviews/admin-review.routes.js";
import adminCampaignRoutes from "../modules/campaigns/admin-campaign.routes.js";

const router = Router();

router.get(
  "/test",
  authMiddleware,
  authorize("admin"),
  function (
    req,
    res
  ) {
    return res.status(200).json({
      success: true,

      message:
        "Welcome Admin",

      data: {
        user: {
          id: req.user._id,
          email: req.user.email,
          role: req.user.role
        }
      },

      requestId:
        req.requestId
    });
  }
);

router.get(
  "/orders",
  authMiddleware,
  authorize("admin"),
  validate(getAdminOrdersSchema),
  getAdminOrders
);

router.use("/coupons", adminCouponRoutes);
router.use("/customers", adminCustomerRoutes);
router.use("/dashboard", adminDashboardRoutes);
router.use("/inventory", adminInventoryRoutes);
router.use("/products", adminProductRoutes);
router.use("/users", adminUserRoutes);
router.use("/audit-logs", adminAuditLogRoutes);
router.use("/returns", adminReturnRoutes);
router.use("/refunds", adminRefundRoutes);
router.use("/categories", adminCategoryRoutes);
router.use("/brands", adminBrandRoutes);
router.use("/settings", adminSettingsRoutes);
router.use("/banners", adminBannerRoutes);
router.use("/reviews", adminReviewRoutes);
router.use("/campaigns", adminCampaignRoutes);

export default router;
