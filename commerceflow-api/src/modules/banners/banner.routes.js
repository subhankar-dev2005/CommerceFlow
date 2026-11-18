import { Router } from "express";
import validate from "../../common/middleware/validate.middleware.js";
import { getPublicBanners, serveBannerImage } from "./banner.controller.js";
import { getPublicBannersSchema, bannerFilenameParamSchema } from "./banner.validator.js";

const router = Router();

// Publicly list active published banners by placement
router.get("/", validate(getPublicBannersSchema), getPublicBanners);

// Alias endpoint for active public banners
router.get("/active", validate(getPublicBannersSchema), getPublicBanners);

// Stream persisted banner image
router.get("/images/:filename", validate(bannerFilenameParamSchema), serveBannerImage);

export default router;
