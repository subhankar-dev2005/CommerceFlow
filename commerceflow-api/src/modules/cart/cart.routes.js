import { Router } from "express";

import authMiddleware from "../../common/middleware/auth.middleware.js";
import validate from "../../common/middleware/validate.middleware.js";

import {
  addToCart
} from "./cart.controller.js";

import {
  addToCartSchema,
  updateCartItemSchema,
  removeCartItemSchema
} from "./cart.validator.js";

import getCart from "./get-cart.controller.js";
import { updateCartItem } from "./update-cart-item.controller.js";
import removeCartItem from "./remove-cart-item.controller.js";
import clearCart from "./clear-cart.controller.js";
import mergeCart from "./merge-cart.controller.js";
import mergeCartSchema from "./merge-cart.validator.js";
import applyCoupon from "./apply-coupon.controller.js";
import removeCoupon from "./remove-coupon.controller.js";
import {
  applyCouponSchema,
  removeCouponSchema
} from "./apply-coupon.validator.js";

const router = Router();

router.get(
  "/",
  authMiddleware,
  getCart
);

router.post(
  "/coupon",
  authMiddleware,
  validate(applyCouponSchema),
  applyCoupon
);

router.delete(
  "/coupon",
  authMiddleware,
  validate(removeCouponSchema),
  removeCoupon
);

router.post(
  "/merge",
  authMiddleware,
  validate(mergeCartSchema),
  mergeCart
);

router.post(
  "/items",
  authMiddleware,
  validate(addToCartSchema),
  addToCart
);

router.patch(
  "/items/:productId",
  authMiddleware,
  validate(updateCartItemSchema),
  updateCartItem
);

router.delete(
  "/items/:productId",
  authMiddleware,
  validate(removeCartItemSchema),
  removeCartItem
);

router.delete(
  "/",
  authMiddleware,
  clearCart
);

export default router;