import { Router } from "express";
import {
  getPublicBranding,
  getPublicAnnouncement,
  serveStoreLogo,
  getPublicPaymentMethods
} from "./public-settings.controller.js";

const router = Router();

// Retrieve public store branding metadata
router.get("/branding", getPublicBranding);

// Retrieve public payment methods availability
router.get("/payment-methods", getPublicPaymentMethods);

// Retrieve public storefront announcement text
router.get("/announcement", getPublicAnnouncement);

// Serve active custom logo asset with cross-origin access for storefront <img> display
router.get(
  "/logo",
  (req, res, next) => {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  },
  serveStoreLogo
);

export default router;
