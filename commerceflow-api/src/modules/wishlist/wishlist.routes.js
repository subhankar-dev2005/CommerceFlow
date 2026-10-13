import { Router } from "express";

import authMiddleware from "../../common/middleware/auth.middleware.js";
import validate from "../../common/middleware/validate.middleware.js";

import addWishlistItem from "./add-wishlist-item.controller.js";
import getWishlist from "./get-wishlist.controller.js";
import removeWishlistItem from "./remove-wishlist-item.controller.js";
import clearWishlist from "./clear-wishlist.controller.js";

import {
  addWishlistItemSchema,
  wishlistProductIdParamSchema
} from "./wishlist.validator.js";

const router = Router();

router.get(
  "/",
  authMiddleware,
  getWishlist
);

router.post(
  "/items",
  authMiddleware,
  validate(addWishlistItemSchema),
  addWishlistItem
);

router.delete(
  "/items/:productId",
  authMiddleware,
  validate(wishlistProductIdParamSchema),
  removeWishlistItem
);

router.delete(
  "/",
  authMiddleware,
  clearWishlist
);

export default router;
