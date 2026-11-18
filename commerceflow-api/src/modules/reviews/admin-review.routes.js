import { Router } from "express";
import authMiddleware from "../../common/middleware/auth.middleware.js";
import authorize from "../../common/middleware/authorize.middleware.js";
import validate from "../../common/middleware/validate.middleware.js";
import {
  getAdminReviews,
  updateAdminReviewStatus,
  deleteAdminReview,
  repairProductRatingHandler
} from "./admin-review.controller.js";
import {
  getAdminReviewsSchema,
  reviewIdParamSchema,
  updateAdminReviewStatusSchema,
  productIdParamSchema
} from "./admin-review.validator.js";

const router = Router();

// Protect all admin review endpoints with authentication and admin role authorization
router.use(authMiddleware);
router.use(authorize("admin"));

// List admin reviews across the store
router.get("/", validate(getAdminReviewsSchema), getAdminReviews);

// Moderate review status (published, hidden, flagged)
router.patch("/:id/status", validate(updateAdminReviewStatusSchema), updateAdminReviewStatus);

// Delete review
router.delete("/:id", validate(reviewIdParamSchema), deleteAdminReview);

// Repair / reconcile product rating metrics
router.post("/products/:productId/repair-rating", validate(productIdParamSchema), repairProductRatingHandler);

export default router;
