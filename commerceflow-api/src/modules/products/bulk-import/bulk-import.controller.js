import {
  generateTemplate,
  createPreviewSession,
  executeImport,
  getErrorReportCsv
} from "./bulk-import.service.js";
import AppError from "../../../common/errors/app-error.js";

/**
 * GET /api/v1/admin/products/import/template
 * Downloads a spreadsheet template for bulk product import (CSV or XLSX).
 */
export async function downloadImportTemplate(req, res, next) {
  try {
    const rawFormat = (req.query.format ?? "csv").toString().toLowerCase().trim();
    const format = rawFormat === "xlsx" ? "xlsx" : "csv";

    const { buffer, contentType, filename } = generateTemplate(format);

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(buffer);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/admin/products/import/preview
 * Validates spreadsheet rows and creates a short-lived preview session.
 */
export async function previewProductImport(req, res, next) {
  try {
    const { fileData, filename, mode } = req.body;

    const result = await createPreviewSession({
      fileData,
      filename,
      mode,
      user: req.user
    });

    return res.status(200).json({
      success: true,
      message: "Import preview generated successfully",
      data: result,
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/admin/products/import/confirm
 * Executes the confirmed import session.
 */
export async function confirmProductImport(req, res, next) {
  try {
    const { importId, mode } = req.body;

    const results = await executeImport({
      importId,
      mode,
      user: req.user,
      req
    });

    return res.status(200).json({
      success: true,
      message: "Bulk product import executed successfully",
      data: results,
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/admin/products/import/errors/:importId
 * Downloads the error report CSV for a previewed or executed import.
 */
export async function downloadImportErrors(req, res, next) {
  try {
    const { importId } = req.params;
    if (!importId) {
      throw new AppError("Import ID is required", 400, [], "INVALID_IMPORT_ID");
    }

    const { filename, csv } = getErrorReportCsv(importId);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(Buffer.from(csv, "utf8"));
  } catch (error) {
    next(error);
  }
}
