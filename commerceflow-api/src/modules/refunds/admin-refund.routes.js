import { Router } from "express";
import authMiddleware from "../../common/middleware/auth.middleware.js";
import authorize from "../../common/middleware/authorize.middleware.js";
import validate from "../../common/middleware/validate.middleware.js";
import {
  adminListRefunds,
  adminGetRefundDetail,
  adminCreateReturnRefund,
  adminRetryFailedRefund,
  adminReconcileRefund
} from "./refund.controller.js";
import {
  getRefundsQuerySchema,
  refundIdParamSchema,
  initiateReturnRefundSchema,
  retryRefundParamSchema
} from "./refund.validator.js";

const router = Router();

// All admin refund routes require authentication and admin authorization
router.use(authMiddleware);
router.use(authorize("admin"));

// List refunds
router.get("/", validate(getRefundsQuerySchema), adminListRefunds);

// Inspect refund by ID
router.get("/:refundId", validate(refundIdParamSchema), adminGetRefundDetail);

// Retry a failed refund
router.post("/:refundId/retry", validate(retryRefundParamSchema), adminRetryFailedRefund);

// Reconcile an ambiguous or post-crash refund
router.post("/:refundId/reconcile", validate(refundIdParamSchema), adminReconcileRefund);

// Initiate refund for a return
router.post("/returns/:returnId", validate(initiateReturnRefundSchema), adminCreateReturnRefund);

export default router;
