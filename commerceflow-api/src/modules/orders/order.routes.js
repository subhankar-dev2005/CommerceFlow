
import { Router } from "express";

import authMiddleware from "../../common/middleware/auth.middleware.js";
import validate from "../../common/middleware/validate.middleware.js";

import { createOrder } from "./order.controller.js";
import getOrders from "./get-orders.controller.js";
import getOrder from "./get-order.controller.js";
import updateOrderStatus from "./update-order-status.controller.js";
import cancelOrder from "./cancel-order.controller.js";
import updateShipment from "./update-shipment.controller.js";

import {
  createOrderSchema,
  getOrdersSchema,
  getOrderSchema,
  updateOrderStatusSchema,
  cancelOrderSchema,
  updateShipmentSchema
} from "./order.validator.js";

import adminMiddleware from "../../common/middleware/admin.middleware.js";

const router = Router();

router.post(
  "/",
  authMiddleware,
  validate(createOrderSchema),
  createOrder
);

router.get(
  "/",
  authMiddleware,
  validate(getOrdersSchema),
  getOrders
);

router.get(
  "/:orderId",
  authMiddleware,
  validate(getOrderSchema),
  getOrder
);

router.patch(
  "/:orderId/status",
  authMiddleware,
  adminMiddleware,
  validate(updateOrderStatusSchema),
  updateOrderStatus
);

router.patch(
  "/:orderId/cancel",
  authMiddleware,
  validate(cancelOrderSchema),
  cancelOrder
);

router.put(
  "/:orderId/shipment",
  authMiddleware,
  adminMiddleware,
  validate(updateShipmentSchema),
  updateShipment
);

export default router;
