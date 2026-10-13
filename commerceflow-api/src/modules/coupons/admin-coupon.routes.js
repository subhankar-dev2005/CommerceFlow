import { Router } from "express";
import authMiddleware from "../../common/middleware/auth.middleware.js";
import authorize from "../../common/middleware/authorize.middleware.js";
import validate from "../../common/middleware/validate.middleware.js";
import {
  createCoupon,
  getAdminCoupons,
  getCouponById,
  updateCoupon,
  updateCouponStatus
} from "./admin-coupon.controller.js";
import {
  createCouponSchema,
  updateCouponSchema,
  updateCouponStatusSchema,
  couponIdParamSchema,
  getAdminCouponsSchema
} from "./coupon.validator.js";

const router = Router();

// Protect all admin coupon endpoints with auth and admin role authorization
router.use(authMiddleware, authorize("admin"));

// Create a new coupon
router.post("/", validate(createCouponSchema), createCoupon);

// List coupons with pagination and filters
router.get("/", validate(getAdminCouponsSchema), getAdminCoupons);

// Get specific coupon details
router.get("/:couponId", validate(couponIdParamSchema), getCouponById);

// Update coupon configuration fields
router.patch("/:couponId", validate(updateCouponSchema), updateCoupon);

// Update coupon active status
router.patch("/:couponId/status", validate(updateCouponStatusSchema), updateCouponStatus);

export default router;
