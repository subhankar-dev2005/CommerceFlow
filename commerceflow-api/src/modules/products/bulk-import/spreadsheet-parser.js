import zlib from "node:zlib";
import AppError from "../../../common/errors/app-error.js";

/**
 * Standard CRC32 table calculation for PKZip archives.
 */
function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (-306674912 ^ (c >>> 1)) : (c >>> 1);
      }
      table[i] = c;
    }
    crc32.table = table;
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

/**
 * Builds an unencrypted PKZip archive Buffer containing the given entries.
 *
 * @param {Array<{ name: string, data: Buffer|string }>} entries
 * @returns {Buffer}
 */
export function buildZip(entries) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, "utf8");
    const dataBuf = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, "utf8");
    const uncompressedSize = dataBuf.length;
    const entryCrc = crc32(dataBuf);
    const deflated = zlib.deflateRawSync(dataBuf);
    const compressedSize = deflated.length;

    // Local file header (30 bytes + name + data)
    const local = Buffer.alloc(30 + nameBuf.length + compressedSize);
    local.writeUInt32LE(0x04034b50, 0); // Local header signature
    local.writeUInt16LE(20, 4);         // Version needed: 2.0
    local.writeUInt16LE(0, 6);          // General purpose bit flags
    local.writeUInt16LE(8, 8);          // Compression method: 8 (Deflate)
    local.writeUInt16LE(0, 10);         // Last mod time
    local.writeUInt16LE(0, 12);         // Last mod date
    local.writeUInt32LE(entryCrc, 14);
    local.writeUInt32LE(compressedSize, 18);
    local.writeUInt32LE(uncompressedSize, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);         // Extra field length
    nameBuf.copy(local, 30);
    deflated.copy(local, 30 + nameBuf.length);
    localHeaders.push(local);

    // Central directory header (46 bytes + name)
    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0); // Central directory header signature
    central.writeUInt16LE(20, 4);         // Version made by: 2.0
    central.writeUInt16LE(20, 6);         // Version needed: 2.0
    central.writeUInt16LE(0, 8);          // General purpose flags
    central.writeUInt16LE(8, 10);         // Compression method: 8 (Deflate)
    central.writeUInt16LE(0, 12);         // Last mod time
    central.writeUInt16LE(0, 14);         // Last mod date
    central.writeUInt32LE(entryCrc, 16);
    central.writeUInt32LE(compressedSize, 20);
    central.writeUInt32LE(uncompressedSize, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);         // Extra field length
    central.writeUInt16LE(0, 32);         // File comment length
    central.writeUInt16LE(0, 34);         // Disk number start
    central.writeUInt16LE(0, 36);         // Internal file attributes
    central.writeUInt32LE(0, 38);         // External file attributes
    central.writeUInt32LE(offset, 42);    // Relative offset of local header
    nameBuf.copy(central, 46);
    centralHeaders.push(central);

    offset += local.length;
  }

  const centralDirOffset = offset;
  const centralDirSize = centralHeaders.reduce((s, b) => s + b.length, 0);

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);      // EOCD signature
  eocd.writeUInt16LE(0, 4);               // Disk number
  eocd.writeUInt16LE(0, 6);               // Disk with start of central directory
  eocd.writeUInt16LE(entries.length, 8);  // Number of entries on disk
  eocd.writeUInt16LE(entries.length, 10); // Total number of entries
  eocd.writeUInt32LE(centralDirSize, 12); // Size of central directory
  eocd.writeUInt32LE(centralDirOffset, 16);// Offset of central directory
  eocd.writeUInt16LE(0, 20);              // Comment length

  return Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
}

/**
 * Extracts all files from a PKZip archive buffer.
 *
 * @param {Buffer} buf
 * @returns {Record<string, Buffer>}
 */
export function readZip(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) {
    throw new AppError("Invalid or corrupted spreadsheet archive", 400, [], "INVALID_ARCHIVE");
  }

  const files = {};
  let pos = 0;
  let totalDecompressedBytes = 0;
  const MAX_TOTAL_DECOMPRESSED_BYTES = 30 * 1024 * 1024; // 30 MB aggregate
  const MAX_ENTRY_DECOMPRESSED_BYTES = 20 * 1024 * 1024; // 20 MB per file entry
  const MAX_ARCHIVE_ENTRIES = 50;

  while (pos < buf.length - 4) {
    const sig = buf.readUInt32LE(pos);
    if (sig === 0x04034b50) {
      if (Object.keys(files).length >= MAX_ARCHIVE_ENTRIES) {
        throw new AppError("Archive contains too many entries", 400, [], "ARCHIVE_ENTRY_LIMIT_EXCEEDED");
      }

      const flags = buf.readUInt16LE(pos + 6);
      if ((flags & 1) !== 0) {
        throw new AppError("Encrypted or password-protected archives are not supported", 400, [], "ENCRYPTED_ARCHIVE");
      }

      // Local file header
      const compMethod = buf.readUInt16LE(pos + 8);
      const compSize = buf.readUInt32LE(pos + 18);
      const nameLen = buf.readUInt16LE(pos + 26);
      const extraLen = buf.readUInt16LE(pos + 28);
      const name = buf.toString("utf8", pos + 30, pos + 30 + nameLen);
      const dataStart = pos + 30 + nameLen + extraLen;

      if (dataStart + compSize > buf.length) {
        throw new AppError("Corrupted archive data boundary", 400, [], "CORRUPTED_ARCHIVE");
      }

      const compData = buf.subarray(dataStart, dataStart + compSize);
      let data;
      if (compMethod === 0) {
        data = compData;
      } else if (compMethod === 8) {
        try {
          data = zlib.inflateRawSync(compData, { maxOutputLength: MAX_ENTRY_DECOMPRESSED_BYTES });
        } catch {
          throw new AppError("Failed to decompress archive content or archive entry exceeds size limits", 400, [], "DECOMPRESS_FAILED");
        }
      } else {
        throw new AppError(`Unsupported archive compression method: ${compMethod}`, 400, [], "UNSUPPORTED_COMPRESSION");
      }

      totalDecompressedBytes += data.length;
      if (totalDecompressedBytes > MAX_TOTAL_DECOMPRESSED_BYTES) {
        throw new AppError("Total decompressed archive size exceeds 30MB safety limit", 400, [], "DECOMPRESS_LIMIT_EXCEEDED");
      }

      files[name.replace(/\\/g, "/")] = data;
      pos = dataStart + compSize;
    } else {
      break;
    }
  }

  return files;
}

/**
 * Sanitize a CSV or spreadsheet cell value against formula injection (CWE-1236)
 * while preserving standard CSV quote escaping.
 *
 * @param {unknown} val
 * @returns {string}
 */
export function sanitizeFormulaCell(val) {
  if (val === null || val === undefined) {
    return "";
  }
  if (typeof val === "number" && Number.isFinite(val)) {
    return String(val);
  }
  let str = String(val);

  // Check for leading formula execution triggers: '=', '+', '-', '@', '\t', '\r'
  const trimmed = str.replace(/^[\s\u0000-\u001F]+/, "");
  const isFormula = /^[=+\-@\t\r]/.test(str) || /^[=+\-@]/.test(trimmed);

  if (isFormula) {
    str = `'${str}`;
  }

  // Wrap in double quotes if it contains commas, double quotes, or newlines
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Serializes headers and rows into an RFC-4180 CSV string with UTF-8 BOM.
 *
 * @param {string[]} headers
 * @param {Array<Array<unknown>>} rows
 * @returns {string}
 */
export function serializeCsv(headers, rows) {
  const headerLine = headers.map(sanitizeFormulaCell).join(",");
  const rowLines = rows.map((row) => row.map(sanitizeFormulaCell).join(","));
  return `\uFEFF${[headerLine, ...rowLines].join("\r\n")}`;
}

/**
 * Parses an RFC-4180 compliant CSV string or Buffer into an array of row string arrays.
 * Handles quoted fields, embedded newlines, commas, escaped quotes, and trims UTF-8 BOM.
 *
 * @param {string|Buffer} input
 * @returns {string[][]}
 */
export function parseCsv(input) {
  let text = Buffer.isBuffer(input) ? input.toString("utf8") : String(input || "");
  // Strip UTF-8 BOM if present
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  const rows = [];
  let currentRow = [];
  let currentField = "";
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  while (i < len) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < len && text[i + 1] === '"') {
          // Escaped quote: ""
          currentField += '"';
          i += 2;
          continue;
        } else {
          // Closing quote
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (char === ",") {
        currentRow.push(currentField.trim());
        currentField = "";
        i++;
        continue;
      } else if (char === "\r") {
        if (i + 1 < len && text[i + 1] === "\n") {
          i++; // Skip \n
        }
        currentRow.push(currentField.trim());
        if (currentRow.some((f) => f.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = "";
        i++;
        continue;
      } else if (char === "\n") {
        currentRow.push(currentField.trim());
        if (currentRow.some((f) => f.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = "";
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    }
  }

  // Final field and row if any
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((f) => f.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Escapes XML text entities.
 */
function escapeXml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Generates an OpenXML (.xlsx) workbook Buffer containing a single worksheet with headers and rows.
 *
 * @param {string[]} headers
 * @param {Array<Array<unknown>>} rows
 * @returns {Buffer}
 */
export function buildXlsx(headers, rows) {
  const allRows = [headers, ...rows];
  let sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>`;

  for (let r = 0; r < allRows.length; r++) {
    const rowNum = r + 1;
    const row = allRows[r];
    sheetXml += `<row r="${rowNum}">`;
    for (let c = 0; c < row.length; c++) {
      const colLetter = String.fromCharCode(65 + (c % 26)); // Supports up to 26 columns cleanly
      const cellRef = `${colLetter}${rowNum}`;
      const val = row[c];
      const isNum = typeof val === "number" && Number.isFinite(val);
      if (isNum) {
        sheetXml += `<c r="${cellRef}"><v>${val}</v></c>`;
      } else {
        const strVal = escapeXml(val ?? "");
        sheetXml += `<c r="${cellRef}" t="inlineStr"><is><t>${strVal}</t></is></c>`;
      }
    }
    sheetXml += `</row>`;
  }
  sheetXml += `</sheetData></worksheet>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Products" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;

  return buildZip([
    { name: "[Content_Types].xml", data: contentTypesXml },
    { name: "_rels/.rels", data: rootRelsXml },
    { name: "xl/workbook.xml", data: workbookXml },
    { name: "xl/_rels/workbook.xml.rels", data: workbookRelsXml },
    { name: "xl/worksheets/sheet1.xml", data: sheetXml }
  ]);
}

/**
 * Converts spreadsheet column letter(s) (A, B, ..., Z, AA, AB, ...) into 0-indexed column integer.
 */
function colLetterToIndex(col) {
  let idx = 0;
  for (let i = 0; i < col.length; i++) {
    idx = idx * 26 + (col.charCodeAt(i) - 64);
  }
  return idx - 1;
}

/**
 * Parses an OpenXML (.xlsx) buffer into rows of strings.
 *
 * @param {Buffer} buf
 * @returns {string[][]}
 */
export function parseXlsx(buf) {
  const files = readZip(buf);
  // Locate primary worksheet: prefer sheet1.xml or first matching sheet*.xml
  let sheetXmlBuf = files["xl/worksheets/sheet1.xml"];
  if (!sheetXmlBuf) {
    const sheetKey = Object.keys(files).find((k) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(k));
    if (sheetKey) {
      sheetXmlBuf = files[sheetKey];
    }
  }

  if (!sheetXmlBuf) {
    throw new AppError("Uploaded spreadsheet does not contain a valid worksheet", 400, [], "INVALID_WORKSHEET");
  }

  // Parse shared strings table if present
  const sharedStrings = [];
  const sharedStringsBuf = files["xl/sharedStrings.xml"];
  if (sharedStringsBuf) {
    const sstXml = sharedStringsBuf.toString("utf8");
    const siRegex = /<si>(.*?)<\/si>/gs;
    let match;
    while ((match = siRegex.exec(sstXml)) !== null) {
      const textMatch = match[1].match(/<t[^>]*>(.*?)<\/t>/gs);
      if (textMatch) {
        const fullText = textMatch
          .map((t) => t.replace(/<[^>]+>/g, ""))
          .join("");
        sharedStrings.push(fullText);
      } else {
        sharedStrings.push("");
      }
    }
  }

  const sheetXml = sheetXmlBuf.toString("utf8");
  const rows = [];
  const rowRegex = /<row[^>]*>(.*?)<\/row>/gs;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(sheetXml)) !== null) {
    const rowContent = rowMatch[1];
    const cellRegex = /<c\b([^>]*)>(.*?)<\/c>/gs;
    let cellMatch;
    const rowCells = [];

    while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
      const attrs = cellMatch[1];
      const body = cellMatch[2];

      // Align sparse cells using explicit cell reference (e.g. r="C2" pads column B with "")
      const refMatch = attrs.match(/\br="([A-Za-z]+)\d+"/);
      if (refMatch) {
        const targetColIdx = colLetterToIndex(refMatch[1].toUpperCase());
        while (rowCells.length < targetColIdx) {
          rowCells.push("");
        }
      }

      const isSharedString = /t="s"/i.test(attrs);
      const isInlineString = /t="inlineStr"/i.test(attrs);

      let cellValue = "";
      if (isSharedString) {
        const vMatch = body.match(/<v>(\d+)<\/v>/);
        if (vMatch) {
          const sstIdx = parseInt(vMatch[1], 10);
          cellValue = sharedStrings[sstIdx] ?? "";
        }
      } else if (isInlineString) {
        const tMatch = body.match(/<t[^>]*>(.*?)<\/t>/s);
        cellValue = tMatch ? tMatch[1] : "";
      } else {
        const vMatch = body.match(/<v>(.*?)<\/v>/s);
        cellValue = vMatch ? vMatch[1] : "";
      }

      // Decode basic xml entities
      cellValue = cellValue
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .trim();

      rowCells.push(cellValue);
    }

    if (rowCells.some((c) => c.length > 0)) {
      rows.push(rowCells);
    }
  }

  return rows;
}

/**
 * Sniffs buffer magic bytes and decodes spreadsheet into normalized string[][] rows.
 *
 * @param {Buffer|string} input - Uploaded file Buffer or string
 * @param {string} [filename=""] - Filename for format hint/logging
 * @returns {string[][]}
 */
export function parseSpreadsheet(input, filename = "") {
  let buf;
  if (Buffer.isBuffer(input)) {
    buf = input;
  } else if (typeof input === "string") {
    // Check if input is base64 encoded or data url
    const trimmed = input.trim();
    const dataUrlMatch = trimmed.match(/^data:([^;]+);base64,(.+)$/s);
    if (dataUrlMatch) {
      buf = Buffer.from(dataUrlMatch[2].replace(/\s+/g, ""), "base64");
    } else if (trimmed.startsWith("PK\x03\x04") || trimmed.includes(",") || trimmed.includes("\n")) {
      buf = Buffer.from(input, "utf8");
    } else if (/^[A-Za-z0-9+/=]+$/.test(trimmed.replace(/\s+/g, "")) && trimmed.length > 30) {
      buf = Buffer.from(trimmed.replace(/\s+/g, ""), "base64");
    } else {
      buf = Buffer.from(input, "utf8");
    }
  } else {
    throw new AppError("Invalid file content payload", 400, [], "INVALID_FILE_CONTENT");
  }

  if (buf.length === 0) {
    throw new AppError("Uploaded file is empty", 400, [], "EMPTY_FILE");
  }

  // Sniff magic bytes: PK\x03\x04 indicates ZIP/XLSX
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
    return parseXlsx(buf);
  }

  // Non-zip text/CSV
  return parseCsv(buf);
}
