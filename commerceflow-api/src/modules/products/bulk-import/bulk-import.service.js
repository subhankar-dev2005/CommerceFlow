import crypto from "node:crypto";
import mongoose from "mongoose";
import Product from "../product.model.js";
import SkuRegistry from "../sku-registry.model.js";
import { reserveProductSkus, releaseProductSkus } from "../sku-registry.service.js";
import { recordAdminAuditEvent, AUDIT_EVENT_TYPES } from "../../audit/admin-audit.service.js";
import AppError from "../../../common/errors/app-error.js";
import {
  parseSpreadsheet,
  serializeCsv,
  buildXlsx
} from "./spreadsheet-parser.js";
import {
  EXPECTED_HEADERS,
  IMPORT_MODES,
  mapSpreadsheetRows,
  validateProductRow
} from "./bulk-import.validator.js";

const SESSION_TTL_MS = 15 * 60 * 1000; // 15 minutes
const IMPORT_BATCH_CHUNK_SIZE = 25;

// In-memory cache for import preview sessions
const importSessions = new Map();

/**
 * Periodically purges expired import sessions from memory.
 */
function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [id, session] of importSessions.entries()) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      importSessions.delete(id);
    }
  }
}

/**
 * Generates downloadable spreadsheet template with documented headers and sample rows.
 *
 * @param {"csv"|"xlsx"} [format="csv"]
 * @returns {{ buffer: Buffer|string, contentType: string, filename: string }}
 */
export function generateTemplate(format = "csv") {
  const headers = [...EXPECTED_HEADERS];
  const sampleRows = [
    [
      "CF-HEADPHONES-01",
      "Wireless Noise-Canceling Headphones",
      "High-fidelity wireless Bluetooth over-ear headphones with 30-hour battery life",
      4999.00,
      50,
      "Electronics",
      "https://images.unsplash.com/photo-1505740420928-5e560c06d30e",
      "active"
    ],
    [
      "CF-SHIRT-BLK-01",
      "Organic Cotton Classic Tee",
      "Premium 100% organic ring-spun cotton everyday casual crewneck shirt",
      899.00,
      120,
      "Apparel",
      "https://images.unsplash.com/photo-1521572267360-ee0c2909d518",
      "active"
    ],
    [
      "CF-MUG-CERAMIC",
      "Ceramic Coffee Mug 350ml",
      "Handcrafted matte finish ceramic coffee mug suitable for hot and cold beverages",
      349.00,
      75,
      "Home & Kitchen",
      "",
      "active"
    ]
  ];

  if (format === "xlsx") {
    const buffer = buildXlsx(headers, sampleRows);
    return {
      buffer,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      filename: "commerceflow-products-template.xlsx"
    };
  }

  const csvString = serializeCsv(headers, sampleRows);
  return {
    buffer: Buffer.from(csvString, "utf8"),
    contentType: "text/csv; charset=utf-8",
    filename: "commerceflow-products-template.csv"
  };
}

/**
 * Previews and validates an uploaded spreadsheet against the catalog and SkuRegistry.
 *
 * @param {object} params
 * @param {string|Buffer} params.fileData - File data payload (CSV string, base64 or buffer)
 * @param {string} [params.filename=""] - Filename
 * @param {string} [params.mode="create"] - "create" | "update"
 * @param {object} [params.user] - Authenticated admin user
 * @returns {Promise<object>} Preview summary and rows
 */
export async function createPreviewSession({
  fileData,
  filename = "products.csv",
  mode = IMPORT_MODES.CREATE,
  user = null
}) {
  cleanupExpiredSessions();

  const parsedRawRows = parseSpreadsheet(fileData, filename);
  const { missingCoreHeaders, dataRows } = mapSpreadsheetRows(parsedRawRows);

  if (mode === IMPORT_MODES.CREATE && missingCoreHeaders.length > 0) {
    throw new AppError(
      `Spreadsheet is missing required columns for creation: ${missingCoreHeaders.join(", ")}`,
      400,
      [],
      "MISSING_REQUIRED_COLUMNS"
    );
  }

  // 1. Identify all non-empty SKUs to query database in bulk
  const candidateSkus = [];
  for (const { raw } of dataRows) {
    const sku = (raw.sku ?? "").trim().toUpperCase();
    if (sku) candidateSkus.push(sku);
  }

  const uniqueSkus = [...new Set(candidateSkus)];
  const existingRegistries = await SkuRegistry.find({
    sku: { $in: uniqueSkus }
  }).select("sku product variantId").lean();

  const existingSkuMap = new Map();
  for (const entry of existingRegistries) {
    existingSkuMap.set(entry.sku.toUpperCase(), entry);
  }

  // 2. Validate each row and track in-file duplicates
  const seenSkusInFile = new Set();
  const previewRows = [];
  const validRowsData = [];
  let validCount = 0;
  let invalidCount = 0;
  let createCandidates = 0;
  let updateCandidates = 0;

  for (const { rowNumber, raw } of dataRows) {
    const rowValidation = validateProductRow(raw, mode);
    const sku = rowValidation.parsedData.sku;

    // In-file duplicate check
    if (sku) {
      if (seenSkusInFile.has(sku)) {
        rowValidation.isValid = false;
        rowValidation.errors.push(`Duplicate SKU '${sku}' found within this upload file`);
      } else {
        seenSkusInFile.add(sku);
      }
    }

    let action = "skip";
    let productId = null;

    if (rowValidation.isValid) {
      const existingEntry = existingSkuMap.get(sku);

      if (mode === IMPORT_MODES.CREATE) {
        if (existingEntry) {
          rowValidation.isValid = false;
          rowValidation.errors.push(`SKU '${sku}' is already registered to product ID ${existingEntry.product}`);
        } else {
          action = "create";
          createCandidates++;
          validCount++;
          validRowsData.push({
            rowNumber,
            parsedData: rowValidation.parsedData,
            raw
          });
        }
      } else if (mode === IMPORT_MODES.UPDATE) {
        if (!existingEntry) {
          rowValidation.isValid = false;
          rowValidation.errors.push(`SKU '${sku}' does not exist in catalog`);
        } else if (existingEntry.variantId !== null && existingEntry.variantId !== undefined) {
          rowValidation.isValid = false;
          rowValidation.errors.push(`SKU '${sku}' belongs to a product variant. Variant products cannot be modified via simple bulk import.`);
        } else {
          action = "update";
          productId = existingEntry.product;
          updateCandidates++;
          validCount++;
          validRowsData.push({
            rowNumber,
            parsedData: rowValidation.parsedData,
            productId,
            raw
          });
        }
      }
    }

    if (!rowValidation.isValid) {
      invalidCount++;
    }

    previewRows.push({
      rowNumber,
      sku: sku || (raw.sku ?? "—"),
      name: rowValidation.parsedData.name || raw.name || "—",
      category: rowValidation.parsedData.category || raw.category || "—",
      price: rowValidation.parsedData.price !== undefined ? rowValidation.parsedData.price : raw.price || "—",
      stock: rowValidation.parsedData.stock !== undefined ? rowValidation.parsedData.stock : raw.stock || "—",
      action,
      isValid: rowValidation.isValid,
      errors: rowValidation.errors,
      warnings: rowValidation.warnings
    });
  }

  const importId = crypto.randomUUID();
  const summary = {
    totalRows: dataRows.length,
    validRows: validCount,
    invalidRows: invalidCount,
    createCandidates,
    updateCandidates
  };

  const session = {
    importId,
    mode,
    filename,
    user: user ? { _id: user._id, email: user.email, role: user.role } : null,
    createdAt: Date.now(),
    status: "preview",
    summary,
    previewRows,
    validRowsData,
    failedRows: previewRows.filter((r) => !r.isValid).map((r) => ({
      rowNumber: r.rowNumber,
      sku: r.sku,
      name: r.name,
      error: r.errors.join("; ")
    })),
    errorReportCsv: null,
    results: null
  };

  importSessions.set(importId, session);

  return {
    importId,
    mode,
    filename,
    summary,
    previewRows: previewRows.slice(0, 100), // Bounded sample for preview UI
    hasMoreRows: previewRows.length > 100
  };
}

/**
 * Executes a previously previewed import session with duplicate protection and error tracking.
 *
 * @param {object} params
 * @param {string} params.importId - Import ID
 * @param {string} params.mode - "create" | "update"
 * @param {object} params.user - Authenticated admin user
 * @param {object} [params.req] - Express request for audit logging
 * @returns {Promise<object>} Execution results
 */
export async function executeImport({
  importId,
  mode,
  user,
  req = null
}) {
  cleanupExpiredSessions();

  const session = importSessions.get(importId);
  if (!session) {
    throw new AppError(
      "Import session expired or not found. Please upload the file again to preview.",
      400,
      [],
      "IMPORT_SESSION_EXPIRED"
    );
  }

  if (mode && mode !== session.mode) {
    throw new AppError(
      `Import mode mismatch: preview session was created for '${session.mode}' mode, but confirmation was submitted with '${mode}' mode`,
      400,
      [],
      "IMPORT_MODE_MISMATCH"
    );
  }

  if (session.status === "processing") {
    throw new AppError(
      "Import is currently processing. Please wait for completion.",
      409,
      [],
      "IMPORT_ALREADY_IN_PROGRESS"
    );
  }

  if (session.status === "completed") {
    return session.results;
  }

  session.status = "processing";

  let createdCount = 0;
  let updatedCount = 0;
  let executionFailedCount = 0;
  const executionFailedRows = [];

  const validRows = session.validRowsData;

  try {
    // Process rows in bounded sequential chunks
    for (let i = 0; i < validRows.length; i += IMPORT_BATCH_CHUNK_SIZE) {
      const chunk = validRows.slice(i, i + IMPORT_BATCH_CHUNK_SIZE);

      for (const item of chunk) {
        const { rowNumber, parsedData, productId } = item;

        if (mode === IMPORT_MODES.CREATE) {
          const newProductId = new mongoose.Types.ObjectId();
          let reserved = false;

          try {
            await reserveProductSkus(newProductId, parsedData.sku);
            reserved = true;

            await Product.create({
              _id: newProductId,
              name: parsedData.name,
              description: parsedData.description,
              price: parsedData.price,
              stock: parsedData.stock,
              category: parsedData.category,
              image: parsedData.image ?? null,
              isActive: parsedData.isActive !== false
            });

            createdCount++;
          } catch (err) {
            if (reserved) {
              await releaseProductSkus(newProductId, parsedData.sku).catch(() => {});
            }
            executionFailedCount++;
            executionFailedRows.push({
              rowNumber,
              sku: parsedData.sku,
              name: parsedData.name,
              error: err.message || "Failed to create product"
            });
          }
        } else if (mode === IMPORT_MODES.UPDATE) {
          try {
            const product = await Product.findById(productId);
            if (!product) {
              throw new Error(`Product not found for SKU '${parsedData.sku}'`);
            }

            if (product.variants && product.variants.length > 0) {
              throw new Error(`Product '${product.name}' has variant SKUs and cannot be modified via simple bulk import`);
            }

            if (parsedData.name !== undefined) product.name = parsedData.name;
            if (parsedData.description !== undefined) product.description = parsedData.description;
            if (parsedData.price !== undefined) product.price = parsedData.price;
            if (parsedData.stock !== undefined) product.stock = parsedData.stock;
            if (parsedData.category !== undefined) product.category = parsedData.category;
            if (parsedData.image !== undefined) product.image = parsedData.image;
            if (parsedData.isActive !== undefined) product.isActive = parsedData.isActive;

            product.changeToken = new mongoose.Types.ObjectId().toHexString();
            await product.save();
            updatedCount++;
          } catch (err) {
            executionFailedCount++;
            executionFailedRows.push({
              rowNumber,
              sku: parsedData.sku,
              name: parsedData.name || "—",
              error: err.message || "Failed to update product"
            });
          }
        }
      }
    }
  } catch (fatalError) {
    session.status = "failed";
    throw fatalError;
  }

  // Combine validation errors from preview with runtime execution failures
  const allFailedRows = [
    ...session.failedRows,
    ...executionFailedRows
  ];

  // Sort by row number
  allFailedRows.sort((a, b) => a.rowNumber - b.rowNumber);

  const totalFailedOrSkipped = session.summary.invalidRows + executionFailedCount;
  const results = {
    importId,
    mode,
    filename: session.filename,
    totalRows: session.summary.totalRows,
    createdCount,
    updatedCount,
    skippedCount: session.summary.invalidRows,
    failedCount: totalFailedOrSkipped,
    hasErrors: allFailedRows.length > 0,
    failedRows: allFailedRows
  };

  // Compile CSV error report
  const errorReportHeaders = ["Row Number", "SKU", "Product Name", "Error Reason"];
  const errorReportRows = allFailedRows.map((f) => [
    f.rowNumber,
    f.sku,
    f.name,
    f.error
  ]);
  session.errorReportCsv = serializeCsv(errorReportHeaders, errorReportRows);

  session.status = "completed";
  session.results = results;

  // Audit event
  if (req && user) {
    await recordAdminAuditEvent({
      eventType: AUDIT_EVENT_TYPES.PRODUCT_CREATED,
      resourceType: "bulk_product_import",
      resourceId: importId,
      metadata: {
        importId,
        mode,
        filename: session.filename,
        totalRows: results.totalRows,
        createdCount,
        updatedCount,
        skippedCount: results.skippedCount,
        failedCount: results.failedCount
      },
      req
    }).catch(() => {});
  }

  return results;
}

/**
 * Retrieves the compiled CSV error report for a completed or previewed import session.
 *
 * @param {string} importId
 * @returns {{ filename: string, csv: string }}
 */
export function getErrorReportCsv(importId) {
  cleanupExpiredSessions();
  const session = importSessions.get(importId);
  if (!session) {
    throw new AppError("Import error report not found or expired", 404, [], "REPORT_NOT_FOUND");
  }

  if (!session.errorReportCsv) {
    const errorReportHeaders = ["Row Number", "SKU", "Product Name", "Error Reason"];
    const errorReportRows = (session.failedRows || []).map((f) => [
      f.rowNumber,
      f.sku,
      f.name,
      f.error
    ]);
    session.errorReportCsv = serializeCsv(errorReportHeaders, errorReportRows);
  }

  return {
    filename: `commerceflow-import-errors-${importId.slice(0, 8)}.csv`,
    csv: session.errorReportCsv
  };
}

/**
 * Resets or clears import sessions (primarily for unit test isolation).
 */
export function _resetSessions() {
  importSessions.clear();
}
