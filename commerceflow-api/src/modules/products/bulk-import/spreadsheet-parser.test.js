import { describe, it, expect } from "vitest";
import {
  parseCsv,
  serializeCsv,
  sanitizeFormulaCell,
  buildXlsx,
  parseXlsx,
  parseSpreadsheet,
  buildZip,
  readZip
} from "./spreadsheet-parser.js";
import AppError from "../../../common/errors/app-error.js";

describe("Spreadsheet Parser & Generator (CSV & XLSX)", () => {
  describe("sanitizeFormulaCell (CWE-1236 Formula Injection Defense)", () => {
    it("neutralizes formula execution triggers by prepending a single quote", () => {
      expect(sanitizeFormulaCell("=SUM(A1:B10)")).toBe("'=SUM(A1:B10)");
      expect(sanitizeFormulaCell("+cmd|' /C calc'!A0")).toBe("'+cmd|' /C calc'!A0");
      expect(sanitizeFormulaCell("-10+20")).toBe("'-10+20");
      expect(sanitizeFormulaCell("@SUM(1,2)")).toBe('"\'@SUM(1,2)"');
      expect(sanitizeFormulaCell("\t=1+1")).toBe("'\t=1+1");
      expect(sanitizeFormulaCell("  =dangerous")).toBe("'  =dangerous");
    });

    it("preserves safe strings and standard numbers", () => {
      expect(sanitizeFormulaCell("iPhone 15 Pro")).toBe("iPhone 15 Pro");
      expect(sanitizeFormulaCell(49999)).toBe("49999");
      expect(sanitizeFormulaCell(0)).toBe("0");
      expect(sanitizeFormulaCell("SKU-1001_A")).toBe("SKU-1001_A");
    });

    it("handles quotes, commas, and newlines per RFC-4180", () => {
      expect(sanitizeFormulaCell('Hello, "World"')).toBe('"Hello, ""World"""');
      expect(sanitizeFormulaCell("Line 1\nLine 2")).toBe('"Line 1\nLine 2"');
    });
  });

  describe("CSV Serialization & Parsing", () => {
    it("round-trips standard headers and rows through serializeCsv and parseCsv", () => {
      const headers = ["SKU", "Name", "Price", "Stock", "Category"];
      const rows = [
        ["PROD-001", "Smartphone X", "29999", "50", "Electronics"],
        ["PROD-002", 'T-Shirt, "Organic Cotton"', "999", "100", "Apparel"]
      ];

      const csv = serializeCsv(headers, rows);
      expect(csv.charCodeAt(0)).toBe(0xfeff); // Starts with UTF-8 BOM

      const parsed = parseCsv(csv);
      expect(parsed.length).toBe(3);
      expect(parsed[0]).toEqual(headers);
      expect(parsed[1]).toEqual(rows[0]);
      expect(parsed[2]).toEqual(rows[1]);
    });

    it("handles embedded newlines and CRLF line endings", () => {
      const csv = "SKU,Description\r\nSKU-1,\"Multi-line\r\ndescription text\"\r\nSKU-2,Simple";
      const parsed = parseCsv(csv);
      expect(parsed.length).toBe(3);
      expect(parsed[1][1]).toBe("Multi-line\r\ndescription text");
      expect(parsed[2][1]).toBe("Simple");
    });
  });

  describe("XLSX Generation & Parsing", () => {
    it("builds a valid XLSX buffer and parses it back into rows", () => {
      const headers = ["SKU", "Name", "Price", "Stock", "Category"];
      const rows = [
        ["ELEC-01", "Wireless Earbuds", 3499, 80, "Audio"],
        ["ELEC-02", "Noise Cancelling Headphones", 12999, 25, "Audio"]
      ];

      const xlsxBuf = buildXlsx(headers, rows);
      expect(Buffer.isBuffer(xlsxBuf)).toBe(true);
      expect(xlsxBuf[0]).toBe(0x50); // 'P'
      expect(xlsxBuf[1]).toBe(0x4b); // 'K'

      const parsed = parseXlsx(xlsxBuf);
      expect(parsed.length).toBe(3);
      expect(parsed[0]).toEqual(headers);
      expect(parsed[1][0]).toBe("ELEC-01");
      expect(parsed[1][1]).toBe("Wireless Earbuds");
      expect(parsed[1][2]).toBe("3499");
      expect(parsed[1][3]).toBe("80");
      expect(parsed[1][4]).toBe("Audio");
    });

    it("parseSpreadsheet automatically identifies XLSX buffer by magic bytes", () => {
      const headers = ["SKU", "Name"];
      const rows = [["SKU-TEST", "Test Item"]];
      const xlsxBuf = buildXlsx(headers, rows);

      const parsed = parseSpreadsheet(xlsxBuf, "products.xlsx");
      expect(parsed.length).toBe(2);
      expect(parsed[0]).toEqual(headers);
      expect(parsed[1]).toEqual(["SKU-TEST", "Test Item"]);
    });

    it("parseSpreadsheet automatically identifies CSV text and base64 payloads", () => {
      const csvText = "SKU,Name\r\nSKU-CSV,CSV Item";
      const parsedFromText = parseSpreadsheet(csvText, "products.csv");
      expect(parsedFromText).toEqual([["SKU", "Name"], ["SKU-CSV", "CSV Item"]]);

      const base64Data = `data:text/csv;base64,${Buffer.from(csvText).toString("base64")}`;
      const parsedFromBase64 = parseSpreadsheet(base64Data, "upload.csv");
      expect(parsedFromBase64).toEqual([["SKU", "Name"], ["SKU-CSV", "CSV Item"]]);
    });

    it("preserves legitimate numeric negative values without formula quote while neutralizing negative strings", () => {
      // Numeric negatives should be preserved as strings without leading quote
      expect(sanitizeFormulaCell(-19.99)).toBe("-19.99");
      expect(sanitizeFormulaCell(-0.01)).toBe("-0.01");
      expect(sanitizeFormulaCell(-500)).toBe("-500");

      // String values starting with '-' are potential formulas and must be neutralized
      expect(sanitizeFormulaCell("-19.99")).toBe("'-19.99");
      expect(sanitizeFormulaCell("-1+2")).toBe("'-1+2");
    });

    it("parses sparse XLSX worksheets where omitted blank cells do not shift columns", () => {
      // XML with A1 and C1, omitting B1 (B1 is a blank cell)
      const sparseSheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="inlineStr"><is><t>SKU</t></is></c>
      <c r="C1" t="inlineStr"><is><t>Price</t></is></c>
    </row>
    <row r="2">
      <c r="A2" t="inlineStr"><is><t>ITEM-01</t></is></c>
      <c r="C2"><v>299</v></c>
    </row>
  </sheetData>
</worksheet>`;

      const zipBuf = buildZip([
        { name: "xl/worksheets/sheet1.xml", data: sparseSheetXml }
      ]);

      const rows = parseXlsx(zipBuf);
      expect(rows.length).toBe(2);
      // Row 1: column A='SKU', column B='', column C='Price'
      expect(rows[0]).toEqual(["SKU", "", "Price"]);
      // Row 2: column A='ITEM-01', column B='', column C='299'
      expect(rows[1]).toEqual(["ITEM-01", "", "299"]);
    });

    it("parses shared strings table with rich text / multiple text runs", () => {
      const sstXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <si><t>Simple Shared SKU</t></si>
  <si><r><t>Rich </t></r><r><t>Product Name</t></r></si>
</sst>`;

      const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="s"><v>0</v></c>
      <c r="B1" t="s"><v>1</v></c>
    </row>
  </sheetData>
</worksheet>`;

      const zipBuf = buildZip([
        { name: "xl/sharedStrings.xml", data: sstXml },
        { name: "xl/worksheets/sheet1.xml", data: sheetXml }
      ]);

      const rows = parseXlsx(zipBuf);
      expect(rows.length).toBe(1);
      expect(rows[0]).toEqual(["Simple Shared SKU", "Rich Product Name"]);
    });

    it("rejects encrypted or password-protected PKZip archives", () => {
      // Create a ZIP entry with general purpose bit 0 set (encrypted)
      const nameBuf = Buffer.from("test.txt", "utf8");
      const local = Buffer.alloc(30 + nameBuf.length);
      local.writeUInt32LE(0x04034b50, 0); // signature
      local.writeUInt16LE(20, 4);
      local.writeUInt16LE(1, 6);          // bit 0 set = encrypted!
      local.writeUInt16LE(0, 8);          // stored
      local.writeUInt16LE(nameBuf.length, 26);
      nameBuf.copy(local, 30);

      expect(() => readZip(local)).toThrow("Encrypted or password-protected archives are not supported");
    });

    it("rejects archives exceeding the entry limit (> 50 entries)", () => {
      const entries = [];
      for (let i = 0; i < 51; i++) {
        entries.push({ name: `file_${i}.xml`, data: "content" });
      }
      const zipBuf = buildZip(entries);

      expect(() => readZip(zipBuf)).toThrow("Archive contains too many entries");
    });

    it("rejects archives with truncated file boundaries", () => {
      const zipBuf = buildZip([{ name: "test.txt", data: "some data" }]);
      // Truncate the buffer midway through the local entry
      const truncated = zipBuf.subarray(0, 40);

      expect(() => readZip(truncated)).toThrow("Corrupted archive data boundary");
    });

    it("rejects archives with unsupported compression methods", () => {
      const nameBuf = Buffer.from("test.txt", "utf8");
      const local = Buffer.alloc(30 + nameBuf.length + 10);
      local.writeUInt32LE(0x04034b50, 0); // signature
      local.writeUInt16LE(20, 4);
      local.writeUInt16LE(0, 6);
      local.writeUInt16LE(9, 8);          // compression method: 9 (Deflate64 - unsupported)
      local.writeUInt32LE(10, 18);        // compressed size
      local.writeUInt16LE(nameBuf.length, 26);
      nameBuf.copy(local, 30);

      expect(() => readZip(local)).toThrow("Unsupported archive compression method: 9");
    });

    it("rejects non-buffer or undersized payloads as invalid archive", () => {
      expect(() => readZip(Buffer.alloc(10))).toThrow("Invalid or corrupted spreadsheet archive");
      expect(() => readZip("not-a-buffer")).toThrow("Invalid or corrupted spreadsheet archive");
    });
  });
});
