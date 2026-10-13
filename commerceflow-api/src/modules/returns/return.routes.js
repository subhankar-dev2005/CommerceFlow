import { Router } from "express";
import authMiddleware from "../../common/middleware/auth.middleware.js";
import validate from "../../common/middleware/validate.middleware.js";
import {
  createReturn,
  getOrderReturns,
  getReturnById,
  cancelReturn
} from "./return.controller.js";
import {
  createReturnSchema,
  getOrderReturnsSchema,
  getReturnByIdSchema,
  cancelReturnSchema
} from "./return.validator.js";

const router = Router();

// Customer Return endpoints
router.post(
  "/orders/:orderId/returns",
  authMiddleware,
  validate(createReturnSchema),
  createReturn
);

router.get(
  "/orders/:orderId/returns",
  authMiddleware,
  validate(getOrderReturnsSchema),
  getOrderReturns
);

router.get(
  "/returns/:returnId",
  authMiddleware,
  validate(getReturnByIdSchema),
  getReturnById
);

router.post(
  "/returns/:returnId/cancel",
  authMiddleware,
  validate(cancelReturnSchema),
  cancelReturn
);

export default router;
