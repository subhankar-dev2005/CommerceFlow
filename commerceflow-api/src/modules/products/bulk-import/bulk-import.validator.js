import { z } from "zod";
import AppError from "../../../common/errors/app-error.js";
import { SKU_REGEX } from "../product.validator.js";

export const MAX_IMPORT_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
export const MAX_IMPORT_ROWS = 500; // Configurable upper row limit per import

export const IMPORT_MODES = Object.freeze({
  CREATE: "create",
  UPDATE: "update"
});

export const EXPECTED_HEADERS = [
  "SKU",
  "Name",
  "Description",
  "Price",
  "Stock",
  "Category",
  "Image_URL",
  "Status"
];

/**
 * Normalizes header string to canonical key name.
 *
 * @param {string} rawHeader
 * @returns {string|null}
 */
export function normalizeHeader(rawHeader) {
  if (typeof rawHeader !== "string") return null;
  const clean = rawHeader.trim().toLowerCase().replace(/[\s_-]+/g, "");
  switch (clean) {
    case "sku":
    case "productsku":
    case "itemsku":
      return "sku";
    case "name":
    case "productname":
    case "title":
      return "name";
    case "description":
    case "desc":
      return "description";
    case "price":
    case "unitprice":
    case "sellingprice":
      return "price";
    case "stock":
    case "inventory":
    case "quantity":
    case "qty":
      return "stock";
    case "category":
    case "categoryname":
      return "category";
    case "image":
    case "imageurl":
    case "img":
      return "image";
    case "status":
    case "isactive":
    case "active":
      return "isActive";
    default:
      return null;
  }
}

/**
 * Parses and maps spreadsheet row arrays into typed field objects according to recognized headers.
 *
 * @param {string[][]} parsedRows
 * @returns {{ headers: string[], columnMap: Record<string, number>, dataRows: Array<{ rowNumber: number, raw: Record<string, string> }> }}
 */
export function mapSpreadsheetRows(parsedRows) {
  if (!Array.isArray(parsedRows) || parsedRows.length === 0) {
    throw new AppError("Uploaded spreadsheet contains no data", 400, [], "EMPTY_SPREADSHEET");
  }

  // First row is the header row
  const headerRow = parsedRows[0];
  const columnMap = {};

  for (let i = 0; i < headerRow.length; i++) {
    const canonicalKey = normalizeHeader(headerRow[i]);
    if (canonicalKey && columnMap[canonicalKey] === undefined) {
      columnMap[canonicalKey] = i;
    }
  }

  // SKU header is strictly mandatory in all modes
  if (columnMap.sku === undefined) {
    throw new AppError(
      "Missing required 'SKU' column header in spreadsheet",
      400,
      [],
      "MISSING_SKU_HEADER"
    );
  }

  // In create mode, essential fields are needed
  const missingCoreHeaders = [];
  for (const required of ["name", "description", "price", "stock", "category"]) {
    if (columnMap[required] === undefined) {
      missingCoreHeaders.push(required.toUpperCase());
    }
  }

  const rawDataRows = parsedRows.slice(1);

  if (rawDataRows.length === 0) {
    throw new AppError("Spreadsheet has headers but contains no product rows", 400, [], "NO_PRODUCT_ROWS");
  }

  if (rawDataRows.length > MAX_IMPORT_ROWS) {
    throw new AppError(
      `File row count (${rawDataRows.length}) exceeds maximum limit of ${MAX_IMPORT_ROWS} rows per import`,
      400,
      [],
      "ROW_LIMIT_EXCEEDED"
    );
  }

  const dataRows = [];
  for (let i = 0; i < rawDataRows.length; i++) {
    const rowNumber = i + 2; // 1-indexed, accounting for header row
    const row = rawDataRows[i];

    // Skip entirely empty rows
    if (!row || !row.some((cell) => typeof cell === "string" && cell.trim().length > 0)) {
      continue;
    }

    const raw = {};
    for (const [key, colIdx] of Object.entries(columnMap)) {
      raw[key] = (row[colIdx] ?? "").trim();
    }

    dataRows.push({ rowNumber, raw });
  }

  if (dataRows.length === 0) {
    throw new AppError("All data rows in the spreadsheet are empty", 400, [], "NO_DATA_ROWS");
  }

  return {
    headers: headerRow,
    columnMap,
    missingCoreHeaders,
    dataRows
  };
}

/**
 * Validates a single mapped product row against business invariants for the given mode.
 *
 * @param {Record<string, string>} raw - Raw mapped fields for the row
 * @param {string} mode - "create" | "update"
 * @returns {{ isValid: boolean, errors: string[], warnings: string[], parsedData: Record<string, unknown> }}
 */
export function validateProductRow(raw, mode = IMPORT_MODES.CREATE) {
  const errors = [];
  const warnings = [];
  const parsedData = {};

  // 1. SKU validation
  const rawSku = (raw.sku ?? "").trim().toUpperCase();
  if (!rawSku) {
    errors.push("SKU is required");
  } else if (!SKU_REGEX.test(rawSku)) {
    errors.push(`SKU '${rawSku}' is invalid. Only letters, numbers, hyphens, and underscores are allowed`);
  } else if (rawSku.length > 100) {
    errors.push("SKU cannot exceed 100 characters");
  } else {
    parsedData.sku = rawSku;
  }

  // 2. Name
  const rawName = (raw.name ?? "").trim();
  if (mode === IMPORT_MODES.CREATE) {
    if (!rawName) {
      errors.push("Product name is required");
    } else if (rawName.length < 2) {
      errors.push("Product name must be at least 2 characters");
    } else if (rawName.length > 200) {
      errors.push("Product name cannot exceed 200 characters");
    } else {
      parsedData.name = rawName;
    }
  } else {
    // In update mode, name is optional
    if (rawName.length > 0) {
      if (rawName.length < 2) {
        errors.push("Product name must be at least 2 characters");
      } else if (rawName.length > 200) {
        errors.push("Product name cannot exceed 200 characters");
      } else {
        parsedData.name = rawName;
      }
    }
  }

  // 3. Description
  const rawDesc = (raw.description ?? "").trim();
  if (mode === IMPORT_MODES.CREATE) {
    if (!rawDesc) {
      errors.push("Product description is required");
    } else if (rawDesc.length < 10) {
      errors.push("Product description must contain at least 10 characters");
    } else {
      parsedData.description = rawDesc;
    }
  } else {
    if (rawDesc.length > 0) {
      if (rawDesc.length < 10) {
        errors.push("Product description must contain at least 10 characters");
      } else {
        parsedData.description = rawDesc;
      }
    }
  }

  // 4. Price
  const rawPrice = (raw.price ?? "").trim();
  if (mode === IMPORT_MODES.CREATE) {
    if (rawPrice === "") {
      errors.push("Product price is required");
    } else {
      const numPrice = Number(rawPrice);
      if (isNaN(numPrice) || !isFinite(numPrice) || numPrice < 0) {
        errors.push("Price must be a valid non-negative number");
      } else {
        parsedData.price = Math.round(numPrice * 100) / 100;
      }
    }
  } else {
    if (rawPrice !== "") {
      const numPrice = Number(rawPrice);
      if (isNaN(numPrice) || !isFinite(numPrice) || numPrice < 0) {
        errors.push("Price must be a valid non-negative number");
      } else {
        parsedData.price = Math.round(numPrice * 100) / 100;
      }
    }
  }

  // 5. Stock
  const rawStock = (raw.stock ?? "").trim();
  if (mode === IMPORT_MODES.CREATE) {
    if (rawStock === "") {
      errors.push("Product stock is required");
    } else {
      const numStock = Number(rawStock);
      if (isNaN(numStock) || !Number.isInteger(numStock) || numStock < 0) {
        errors.push("Stock must be a whole non-negative integer");
      } else {
        parsedData.stock = numStock;
      }
    }
  } else {
    if (rawStock !== "") {
      const numStock = Number(rawStock);
      if (isNaN(numStock) || !Number.isInteger(numStock) || numStock < 0) {
        errors.push("Stock must be a whole non-negative integer");
      } else {
        parsedData.stock = numStock;
      }
    }
  }

  // 6. Category
  const rawCategory = (raw.category ?? "").trim();
  if (mode === IMPORT_MODES.CREATE) {
    if (!rawCategory) {
      errors.push("Category is required");
    } else if (rawCategory.length < 2) {
      errors.push("Category name must contain at least 2 characters");
    } else if (rawCategory.includes("/")) {
      errors.push("Category name cannot contain '/'");
    } else {
      parsedData.category = rawCategory;
    }
  } else {
    if (rawCategory.length > 0) {
      if (rawCategory.length < 2) {
        errors.push("Category name must contain at least 2 characters");
      } else if (rawCategory.includes("/")) {
        errors.push("Category name cannot contain '/'");
      } else {
        parsedData.category = rawCategory;
      }
    }
  }

  // 7. Image URL
  const rawImage = (raw.image ?? "").trim();
  if (rawImage.length > 0) {
    try {
      const parsedUrl = new URL(rawImage);
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        errors.push("Image URL must use http or https protocol");
      } else {
        parsedData.image = rawImage;
      }
    } catch {
      errors.push("Image must be a valid HTTP/HTTPS URL");
    }
  }

  // 8. Status / isActive
  const rawStatus = (raw.isActive ?? "").trim().toLowerCase();
  if (rawStatus.length > 0) {
    if (["active", "true", "1", "yes"].includes(rawStatus)) {
      parsedData.isActive = true;
    } else if (["inactive", "false", "0", "no"].includes(rawStatus)) {
      parsedData.isActive = false;
    } else {
      warnings.push(`Unrecognized status '${rawStatus}', defaulted to active`);
      parsedData.isActive = true;
    }
  } else if (mode === IMPORT_MODES.CREATE) {
    parsedData.isActive = true;
  }

  // Update mode requires at least one field to change besides SKU
  if (mode === IMPORT_MODES.UPDATE && Object.keys(parsedData).filter((k) => k !== "sku").length === 0) {
    errors.push("No updateable fields provided for this product row");
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    parsedData
  };
}

/**
 * Express Zod validation schema for preview endpoint.
 */
export const previewImportSchema = z.object({
  body: z.object({
    fileData: z.string({
      required_error: "File data payload is required"
    }).min(1, "File data payload cannot be empty"),
    filename: z.string().optional().default("products.csv"),
    mode: z.enum([IMPORT_MODES.CREATE, IMPORT_MODES.UPDATE], {
      invalid_type_error: "Mode must be either 'create' or 'update'"
    }).default(IMPORT_MODES.CREATE)
  }),
  query: z.object({}),
  params: z.object({})
});

/**
 * Express Zod validation schema for confirm endpoint.
 */
export const confirmImportSchema = z.object({
  body: z.object({
    importId: z.string({
      required_error: "Import ID is required"
    }).min(1, "Import ID cannot be empty"),
    mode: z.enum([IMPORT_MODES.CREATE, IMPORT_MODES.UPDATE], {
      invalid_type_error: "Mode must be either 'create' or 'update'"
    }).default(IMPORT_MODES.CREATE)
  }),
  query: z.object({}),
  params: z.object({})
});
