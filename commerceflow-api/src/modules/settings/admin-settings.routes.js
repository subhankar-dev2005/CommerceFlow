import { Router } from "express";
import authMiddleware from "../../common/middleware/auth.middleware.js";
import authorize from "../../common/middleware/authorize.middleware.js";
import validate from "../../common/middleware/validate.middleware.js";
import {
  getStoreSettings,
  updateStoreSettings
} from "./admin-settings.controller.js";
import { updateStoreSettingsSchema } from "./store-settings.validator.js";

const router = Router();

// Protect all admin settings endpoints with authentication and admin role authorization
router.use(authMiddleware, authorize("admin"));

// Retrieve current persisted settings and safe diagnostics
router.get("/", getStoreSettings);

// Update and persist settings
router.patch("/", validate(updateStoreSettingsSchema), updateStoreSettings);

export default router;
