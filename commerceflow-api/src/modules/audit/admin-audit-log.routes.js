import { Router } from "express";
import authMiddleware from "../../common/middleware/auth.middleware.js";
import authorize from "../../common/middleware/authorize.middleware.js";
import validate from "../../common/middleware/validate.middleware.js";
import { getAdminAuditLogs } from "./admin-audit-log.controller.js";
import { getAdminAuditLogsSchema } from "./admin-audit-log.validator.js";
import AppError from "../../common/errors/app-error.js";

const router = Router();

// Strictly require authenticated administrator
router.use(authMiddleware, authorize("admin"));

// Read-only endpoint for administrative audit logs
router.get("/", validate(getAdminAuditLogsSchema), getAdminAuditLogs);

// Explicitly guard immutability against write attempts on audit logs
router.all("/", (req, res, next) => {
  if (req.method !== "GET") {
    return next(new AppError("Method Not Allowed: Audit logs are strictly immutable", 405, [], "METHOD_NOT_ALLOWED"));
  }
  next();
});

router.all("/:id", (req, res, next) => {
  return next(new AppError("Method Not Allowed: Audit logs are strictly immutable", 405, [], "METHOD_NOT_ALLOWED"));
});

export default router;
