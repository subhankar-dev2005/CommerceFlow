import { Router } from "express";

const router = Router();

/**
 * Obsolete Administrative MFA Endpoints.
 * In accordance with Owner Governance Amendment (DEC-03 Option 3D),
 * administrative MFA endpoints are permanently disabled and return HTTP 410 Gone.
 */
router.use((req, res) => {
  return res.status(410).json({
    success: false,
    error: {
      code: "MFA_FEATURE_DISABLED",
      message: "Administrative two-factor authentication has been retired and is disabled.",
      details: []
    },
    message: "Administrative two-factor authentication has been retired and is disabled.",
    code: "MFA_FEATURE_DISABLED",
    requestId: req.requestId || null
  });
});

export default router;

