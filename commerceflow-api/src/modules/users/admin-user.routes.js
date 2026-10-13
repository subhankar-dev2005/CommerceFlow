import { Router } from "express";
import authMiddleware from "../../common/middleware/auth.middleware.js";
import authorize from "../../common/middleware/authorize.middleware.js";
import validate from "../../common/middleware/validate.middleware.js";
import { authRateLimitMiddleware } from "../../common/middleware/auth-rate-limit.middleware.js";
import {
  getAdminUsers,
  createAdminUser,
  updateAdminUserStatus,
  updateAdminUserRole
} from "./admin-user.controller.js";
import {
  getAdminUsersSchema,
  createAdminUserSchema,
  updateUserStatusSchema,
  updateUserRoleSchema
} from "./admin-user.validator.js";

const router = Router();

// Every admin-user management endpoint strictly requires valid admin credentials
router.use(authMiddleware, authorize("admin"));

// List users with pagination, bounded limit, search, role and status filtering
router.get("/", validate(getAdminUsersSchema), getAdminUsers);

// Create a new administrator account (rate-limited, server-authoritative role=admin)
router.post("/", authRateLimitMiddleware, validate(createAdminUserSchema), createAdminUser);

// Activate/deactivate user with last-admin and self-deactivation protection
router.patch("/:userId/status", validate(updateUserStatusSchema), updateAdminUserStatus);

// Promote/demote user between 'admin' and 'customer' with last-admin and self-demotion protection
router.patch("/:userId/role", validate(updateUserRoleSchema), updateAdminUserRole);

export default router;
