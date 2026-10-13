import { Router } from "express";

import { validate } from "../common/middleware/validate.middleware.js";

import {
  testRequestSchema
} from "../validators/test.validator.js";

const router = Router();

router.post(
  "/validation",
  validate(testRequestSchema),
  (req, res) => {
    return res.status(200).json({
      success: true,

      message:
        "Validation passed",

      data:
        req.body,

      requestId:
        req.requestId
    });
  }
);

export default router;
