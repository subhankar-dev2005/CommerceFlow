import { Router } from "express";
import authMiddleware from "../../common/middleware/auth.middleware.js";
import authorize from "../../common/middleware/authorize.middleware.js";
import validate from "../../common/middleware/validate.middleware.js";
import {
  getAdminBanners,
  getBannerById,
  createBanner,
  updateBanner,
  updateBannerStatus,
  reorderBanners,
  uploadDesktopImage,
  uploadMobileImage,
  deleteBanner
} from "./banner.controller.js";
import {
  getAdminBannersSchema,
  bannerIdParamSchema,
  createBannerSchema,
  updateBannerSchema,
  updateBannerStatusSchema,
  reorderBannersSchema,
  uploadBannerImageSchema
} from "./banner.validator.js";

const router = Router();

// Protect all admin banner endpoints with authentication and admin role authorization
router.use(authMiddleware);
router.use(authorize("admin"));

// List admin banners
router.get("/", validate(getAdminBannersSchema), getAdminBanners);

// Create banner
router.post("/", validate(createBannerSchema), createBanner);

// Reorder banners (must be registered before /:id)
router.patch("/reorder", validate(reorderBannersSchema), reorderBanners);

// Get single banner
router.get("/:id", validate(bannerIdParamSchema), getBannerById);

// Update banner fields
router.patch("/:id", validate(updateBannerSchema), updateBanner);

// Upload/replace desktop image
router.post("/:id/desktop-image", validate(uploadBannerImageSchema), uploadDesktopImage);

// Upload/replace mobile image
router.post("/:id/mobile-image", validate(uploadBannerImageSchema), uploadMobileImage);

// Toggle/update banner status
router.patch("/:id/status", validate(updateBannerStatusSchema), updateBannerStatus);

// Delete banner and clean up associated storage assets
router.delete("/:id", validate(bannerIdParamSchema), deleteBanner);

export default router;
