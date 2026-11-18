import { Router } from "express";
import authMiddleware from "../../../common/middleware/auth.middleware.js";
import authorize from "../../../common/middleware/authorize.middleware.js";
import validate from "../../../common/middleware/validate.middleware.js";
import {
  downloadImportTemplate,
  previewProductImport,
  confirmProductImport,
  downloadImportErrors
} from "./bulk-import.controller.js";
import {
  previewImportSchema,
  confirmImportSchema
} from "./bulk-import.validator.js";

const router = Router();

// Strictly protect all bulk import operations with authentication and admin role authorization
router.use(authMiddleware, authorize("admin"));

// 1. Download template (CSV or XLSX)
router.get("/template", downloadImportTemplate);

// 2. Upload spreadsheet & preview validation results
router.post("/preview", validate(previewImportSchema), previewProductImport);

// 3. Confirm and execute import
router.post("/confirm", validate(confirmImportSchema), confirmProductImport);

// 4. Download failed rows error report
router.get("/errors/:importId", downloadImportErrors);

export default router;
