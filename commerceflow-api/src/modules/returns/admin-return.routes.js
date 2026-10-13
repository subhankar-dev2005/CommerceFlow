import { Router } from "express";
import authMiddleware from "../../common/middleware/auth.middleware.js";
import authorize from "../../common/middleware/authorize.middleware.js";
import validate from "../../common/middleware/validate.middleware.js";
import {
  adminGetReturns,
  adminGetReturnById,
  adminApproveReturn,
  adminRejectReturn,
  adminReceiveReturn,
  adminCompleteReturn
} from "./return.controller.js";
import {
  adminGetReturnsSchema,
  getReturnByIdSchema,
  adminApproveReturnSchema,
  adminRejectReturnSchema,
  adminReceiveReturnSchema,
  adminCompleteReturnSchema
} from "./return.validator.js";
import { adminCreateReturnRefund } from "../refunds/refund.controller.js";
import { initiateReturnRefundSchema } from "../refunds/refund.validator.js";

const router = Router();

router.use(authMiddleware, authorize("admin"));

router.get("/", validate(adminGetReturnsSchema), adminGetReturns);
router.get("/:returnId", validate(getReturnByIdSchema), adminGetReturnById);
router.patch("/:returnId/approve", validate(adminApproveReturnSchema), adminApproveReturn);
router.patch("/:returnId/reject", validate(adminRejectReturnSchema), adminRejectReturn);
router.patch("/:returnId/receive", validate(adminReceiveReturnSchema), adminReceiveReturn);
router.patch("/:returnId/complete", validate(adminCompleteReturnSchema), adminCompleteReturn);
router.post("/:returnId/refund", validate(initiateReturnRefundSchema), adminCreateReturnRefund);

export default router;
