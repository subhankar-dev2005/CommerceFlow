import { Router } from "express";
import authMiddleware from "../../common/middleware/auth.middleware.js";
import validate from "../../common/middleware/validate.middleware.js";
import {
  createReview,
  getReviews,
  updateReview,
  deleteReview
} from "./review.controller.js";
import {
  createReviewSchema,
  updateReviewSchema,
  reviewQuerySchema,
  reviewParamsSchema
} from "./review.validator.js";

const router = Router({ mergeParams: true });

router.post(
  "/",
  authMiddleware,
  validate(createReviewSchema),
  createReview
);

router.get(
  "/",
  authMiddleware,
  validate(reviewQuerySchema),
  getReviews
);

router.patch(
  "/:reviewId",
  authMiddleware,
  validate(updateReviewSchema),
  updateReview
);

router.delete(
  "/:reviewId",
  authMiddleware,
  validate(reviewParamsSchema),
  deleteReview
);

export default router;
