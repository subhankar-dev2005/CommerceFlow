import { Router } from "express";
import authMiddleware from "../../common/middleware/auth.middleware.js";
import validate from "../../common/middleware/validate.middleware.js";
import {
  recordProductView,
  getRecentlyViewed,
  clearRecentlyViewed,
  mergeRecentlyViewed
} from "./recently-viewed.controller.js";
import {
  recordProductViewSchema,
  getRecentlyViewedQuerySchema,
  mergeRecentlyViewedSchema
} from "./recently-viewed.validator.js";

const router = Router();

router.post(
  "/",
  authMiddleware,
  validate(recordProductViewSchema),
  recordProductView
);

router.get(
  "/",
  authMiddleware,
  validate(getRecentlyViewedQuerySchema),
  getRecentlyViewed
);

router.delete(
  "/",
  authMiddleware,
  clearRecentlyViewed
);

router.post(
  "/merge",
  authMiddleware,
  validate(mergeRecentlyViewedSchema),
  mergeRecentlyViewed
);

export default router;
