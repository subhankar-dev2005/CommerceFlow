import { Router } from "express";
import authMiddleware from "../../common/middleware/auth.middleware.js";
import authorize from "../../common/middleware/authorize.middleware.js";
import validate from "../../common/middleware/validate.middleware.js";
import {
  getStoreSettings,
  updateStoreSettings,
  uploadStoreLogo,
  resetStoreLogo,
  resetAnnouncement
} from "./admin-settings.controller.js";
import { updateStoreSettingsSchema, uploadLogoSchema } from "./store-settings.validator.js";

const router = Router();

// Protect all admin settings endpoints with authentication and admin role authorization
router.use(authMiddleware, authorize("admin"));

// Retrieve current persisted settings and safe diagnostics
router.get("/", getStoreSettings);

// Update and persist settings
router.patch("/", validate(updateStoreSettingsSchema), updateStoreSettings);

// Upload and persist custom website logo
router.post("/logo", validate(uploadLogoSchema), uploadStoreLogo);

// Reset website logo to original default
router.post("/logo/reset", resetStoreLogo);
router.delete("/logo", resetStoreLogo);

// Reset storefront announcement to default
router.post("/announcement/reset", resetAnnouncement);
router.delete("/announcement", resetAnnouncement);

export default router;
