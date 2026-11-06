import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { createApp } from "../../../app.js";
import { env } from "../../../config/env.js";
import User from "../../users/user.model.js";
import Product from "../product.model.js";
import SkuRegistry from "../sku-registry.model.js";
import {
  generateTemplate,
  createPreviewSession,
  executeImport,
  _resetSessions
} from "./bulk-import.service.js";
import { serializeCsv, buildXlsx } from "./spreadsheet-parser.js";
import { EXPECTED_HEADERS } from "./bulk-import.validator.js";

function generateTestToken(user) {
  return jwt.sign(
    {
      userId: user._id.toString(),
      email: user.email,
      role: user.role
    },
    env.JWT_SECRET || "test-jwt-secret-for-vitest-only",
    { expiresIn: "1h" }
  );
}

describe("Bulk Product Import Backend API & Service Tests", () => {
  let app;
  const adminUser = {
    _id: new mongoose.Types.ObjectId(),
    email: "admin@commerceflow.com",
    role: "admin"
  };
  const customerUser = {
    _id: new mongoose.Types.ObjectId(),
    email: "customer@example.com",
    role: "customer"
  };

  const adminToken = generateTestToken(adminUser);
  const customerToken = generateTestToken(customerUser);

  beforeEach(() => {
    vi.restoreAllMocks();
    _resetSessions();
    vi.spyOn(User, "findById").mockImplementation((id) => {
      const idStr = id?.toString ? id.toString() : String(id);
      if (idStr === adminUser._id.toString()) {
        return Promise.resolve(adminUser);
      }
      if (idStr === customerUser._id.toString()) {
        return Promise.resolve(customerUser);
      }
      return Promise.resolve(null);
    });
    app = createApp();
  });

  describe("1. Template Generation & Download", () => {
    it("generates CSV template with authoritative headers, BOM, and sample rows", () => {
      const { buffer, contentType, filename } = generateTemplate("csv");
      expect(contentType).toContain("text/csv");
      expect(filename).toBe("commerceflow-products-template.csv");

      const text = buffer.toString("utf8");
      expect(text.charCodeAt(0)).toBe(0xfeff); // UTF-8 BOM
      for (const header of EXPECTED_HEADERS) {
        expect(text).toContain(header);
      }
      expect(text).toContain("CF-HEADPHONES-01");
    });

    it("generates XLSX template with valid OpenXML ZIP binary structure", () => {
      const { buffer, contentType, filename } = generateTemplate("xlsx");
      expect(contentType).toContain("openxmlformats");
      expect(filename).toBe("commerceflow-products-template.xlsx");
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer[0]).toBe(0x50); // PK
      expect(buffer[1]).toBe(0x4b);
    });

    it("GET /api/v1/admin/products/import/template returns downloadable CSV for admin", async () => {
      const res = await request(app)
        .get("/api/v1/admin/products/import/template?format=csv")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("text/csv");
      expect(res.headers["content-disposition"]).toContain("attachment; filename=");
      expect(res.text).toContain("SKU");
      expect(res.text).toContain("Name");
    });

    it("GET /api/v1/admin/products/import/template returns downloadable XLSX for admin", async () => {
      const res = await request(app)
        .get("/api/v1/admin/products/import/template?format=xlsx")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("openxmlformats");
    });

    it("GET /api/v1/admin/products/import/template rejects unauthenticated requests with 401", async () => {
      const res = await request(app).get("/api/v1/admin/products/import/template");
      expect(res.status).toBe(401);
    });

    it("GET /api/v1/admin/products/import/template rejects customer role with 403", async () => {
      const res = await request(app)
        .get("/api/v1/admin/products/import/template")
        .set("Authorization", `Bearer ${customerToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe("2. Preview & Validation Logic", () => {
    it("rejects empty spreadsheet or spreadsheet with no data rows", async () => {
      const emptyCsv = "SKU,Name,Description,Price,Stock,Category\n";
      const res = await request(app)
        .post("/api/v1/admin/products/import/preview")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          fileData: emptyCsv,
          filename: "empty.csv",
          mode: "create"
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("NO_PRODUCT_ROWS");
    });

    it("rejects spreadsheet missing required SKU column header", async () => {
      const invalidHeaderCsv = "Name,Description,Price,Stock,Category\nItem 1,Desc,100,5,Cat\n";
      const res = await request(app)
        .post("/api/v1/admin/products/import/preview")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          fileData: invalidHeaderCsv,
          filename: "no_sku.csv",
          mode: "create"
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("MISSING_SKU_HEADER");
    });

    it("rejects files exceeding row limits (> 500 rows)", async () => {
      const rows = [EXPECTED_HEADERS];
      for (let i = 1; i <= 501; i++) {
        rows.push([`SKU-${i}`, `Product ${i}`, "Description at least 10 chars", "100", "10", "Category", "", "active"]);
      }
      const largeCsv = rows.map((r) => r.join(",")).join("\n");

      const res = await request(app)
        .post("/api/v1/admin/products/import/preview")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          fileData: largeCsv,
          filename: "oversized.csv",
          mode: "create"
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("ROW_LIMIT_EXCEEDED");
    });

    it("identifies in-file duplicate SKUs and flags duplicates as invalid", async () => {
      vi.spyOn(SkuRegistry, "find").mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([])
        })
      });

      const csv = [
        "SKU,Name,Description,Price,Stock,Category",
        "DUP-SKU,First Occurrence,Valid description 10 chars,100,10,Books",
        "DUP-SKU,Second Occurrence,Valid description 10 chars,200,20,Books"
      ].join("\n");

      const res = await request(app)
        .post("/api/v1/admin/products/import/preview")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          fileData: csv,
          filename: "dup.csv",
          mode: "create"
        });

      expect(res.status).toBe(200);
      expect(res.body.data.summary.totalRows).toBe(2);
      expect(res.body.data.summary.validRows).toBe(1);
      expect(res.body.data.summary.invalidRows).toBe(1);

      const rows = res.body.data.previewRows;
      expect(rows[0].isValid).toBe(true);
      expect(rows[1].isValid).toBe(false);
      expect(rows[1].errors[0]).toContain("Duplicate SKU");
    });

    it("in create mode: rejects SKUs already registered in SkuRegistry", async () => {
      const existingProductId = new mongoose.Types.ObjectId();
      vi.spyOn(SkuRegistry, "find").mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([
            { sku: "EXISTING-SKU", product: existingProductId, variantId: null }
          ])
        })
      });

      const csv = [
        "SKU,Name,Description,Price,Stock,Category",
        "EXISTING-SKU,Laptop Pro,High performance laptop 16GB,99999,10,Computers",
        "NEW-SKU,Laptop Air,Lightweight laptop 8GB RAM,69999,15,Computers"
      ].join("\n");

      const res = await request(app)
        .post("/api/v1/admin/products/import/preview")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          fileData: csv,
          filename: "import.csv",
          mode: "create"
        });

      expect(res.status).toBe(200);
      expect(res.body.data.summary.createCandidates).toBe(1);
      expect(res.body.data.summary.invalidRows).toBe(1);
      expect(res.body.data.previewRows[0].errors[0]).toContain("already registered");
      expect(res.body.data.previewRows[1].isValid).toBe(true);
    });

    it("in update mode: matches existing products by SKU and rejects uncataloged SKUs", async () => {
      const existingProductId = new mongoose.Types.ObjectId();
      vi.spyOn(SkuRegistry, "find").mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([
            { sku: "CATALOG-SKU", product: existingProductId, variantId: null }
          ])
        })
      });

      const csv = [
        "SKU,Price,Stock",
        "CATALOG-SKU,1299,40",
        "UNKNOWN-SKU,999,10"
      ].join("\n");

      const res = await request(app)
        .post("/api/v1/admin/products/import/preview")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          fileData: csv,
          filename: "update.csv",
          mode: "update"
        });

      expect(res.status).toBe(200);
      expect(res.body.data.summary.updateCandidates).toBe(1);
      expect(res.body.data.summary.invalidRows).toBe(1);
      expect(res.body.data.previewRows[0].isValid).toBe(true);
      expect(res.body.data.previewRows[0].action).toBe("update");
      expect(res.body.data.previewRows[1].isValid).toBe(false);
      expect(res.body.data.previewRows[1].errors[0]).toContain("does not exist in catalog");
    });

    it("validates field types: negative price, non-integer stock, invalid category with slash, and malformed image URL", async () => {
      vi.spyOn(SkuRegistry, "find").mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([])
        })
      });

      const csv = [
        "SKU,Name,Description,Price,Stock,Category,Image_URL",
        "BAD-FIELDS,A,Short,-50,2.5,Invalid/Category,not-a-valid-url"
      ].join("\n");

      const res = await request(app)
        .post("/api/v1/admin/products/import/preview")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          fileData: csv,
          filename: "bad_fields.csv",
          mode: "create"
        });

      expect(res.status).toBe(200);
      const row = res.body.data.previewRows[0];
      expect(row.isValid).toBe(false);
      expect(row.errors.some((e) => e.includes("Product name must be at least 2 characters"))).toBe(true);
      expect(row.errors.some((e) => e.includes("Price must be a valid non-negative number"))).toBe(true);
      expect(row.errors.some((e) => e.includes("Stock must be a whole non-negative integer"))).toBe(true);
      expect(row.errors.some((e) => e.includes("Category name cannot contain '/'"))).toBe(true);
      expect(row.errors.some((e) => e.includes("Image must be a valid HTTP/HTTPS URL"))).toBe(true);
    });
  });

  describe("3. Confirmation & Import Execution", () => {
    it("executes valid creation rows, reserves SKUs, and returns accurate created counts", async () => {
      vi.spyOn(SkuRegistry, "find").mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([])
        })
      });
      vi.spyOn(SkuRegistry, "create").mockResolvedValue({ sku: "NEW-PRODUCT-01" });
      vi.spyOn(Product, "create").mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        name: "Wireless Speaker",
        price: 2499,
        stock: 30
      });

      const csv = [
        "SKU,Name,Description,Price,Stock,Category",
        "NEW-PRODUCT-01,Wireless Speaker,High performance portable bluetooth speaker,2499,30,Audio"
      ].join("\n");

      // 1. Preview
      const previewRes = await request(app)
        .post("/api/v1/admin/products/import/preview")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ fileData: csv, filename: "speaker.csv", mode: "create" });

      const importId = previewRes.body.data.importId;
      expect(importId).toBeTruthy();

      // 2. Confirm
      const confirmRes = await request(app)
        .post("/api/v1/admin/products/import/confirm")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ importId, mode: "create" });

      expect(confirmRes.status).toBe(200);
      expect(confirmRes.body.data.createdCount).toBe(1);
      expect(confirmRes.body.data.failedCount).toBe(0);
      expect(confirmRes.body.data.hasErrors).toBe(false);
    });

    it("in update mode: updates existing product and preserves unspecified fields", async () => {
      const existingProductId = new mongoose.Types.ObjectId();
      vi.spyOn(SkuRegistry, "find").mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([
            { sku: "UPD-SKU-01", product: existingProductId, variantId: null }
          ])
        })
      });

      const mockProductDoc = {
        _id: existingProductId,
        name: "Original Name",
        description: "Original Description which is long enough",
        price: 1000,
        stock: 50,
        category: "Original Category",
        image: "https://example.com/original.jpg",
        isActive: true,
        changeToken: "old-token",
        save: vi.fn().mockResolvedValue(true)
      };
      vi.spyOn(Product, "findById").mockResolvedValue(mockProductDoc);

      const csv = [
        "SKU,Price,Stock",
        "UPD-SKU-01,1499,75"
      ].join("\n");

      const previewRes = await request(app)
        .post("/api/v1/admin/products/import/preview")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ fileData: csv, filename: "update_price.csv", mode: "update" });

      const importId = previewRes.body.data.importId;

      const confirmRes = await request(app)
        .post("/api/v1/admin/products/import/confirm")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ importId, mode: "update" });

      expect(confirmRes.status).toBe(200);
      expect(confirmRes.body.data.updatedCount).toBe(1);

      // Verify price and stock were updated, but name and category were preserved
      expect(mockProductDoc.price).toBe(1499);
      expect(mockProductDoc.stock).toBe(75);
      expect(mockProductDoc.name).toBe("Original Name");
      expect(mockProductDoc.category).toBe("Original Category");
      expect(mockProductDoc.changeToken).not.toBe("old-token");
      expect(mockProductDoc.save).toHaveBeenCalled();
    });

    it("prevents double-submission and replay of import sessions", async () => {
      vi.spyOn(SkuRegistry, "find").mockReturnValue({
        select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) })
      });
      vi.spyOn(SkuRegistry, "create").mockResolvedValue({ sku: "IDEM-SKU" });
      vi.spyOn(Product, "create").mockResolvedValue({ _id: new mongoose.Types.ObjectId() });

      const csv = "SKU,Name,Description,Price,Stock,Category\nIDEM-SKU,Item,Description is long enough,500,20,General";
      const previewRes = await request(app)
        .post("/api/v1/admin/products/import/preview")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ fileData: csv, mode: "create" });

      const importId = previewRes.body.data.importId;

      // First confirmation succeeds
      const firstRes = await request(app)
        .post("/api/v1/admin/products/import/confirm")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ importId, mode: "create" });
      expect(firstRes.status).toBe(200);

      // Repeated confirmation returns existing completed results cleanly
      const secondRes = await request(app)
        .post("/api/v1/admin/products/import/confirm")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ importId, mode: "create" });
      expect(secondRes.status).toBe(200);
      expect(secondRes.body.data.createdCount).toBe(1);
    });

    it("compiles downloadable CSV error report containing row numbers and sanitized error reasons", async () => {
      vi.spyOn(SkuRegistry, "find").mockReturnValue({
        select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) })
      });

      const csv = [
        "SKU,Name,Description,Price,Stock,Category",
        "VALID-SKU,Valid Product,Valid description text,100,5,General",
        "BAD-SKU,Bad,Short,-10,-5,General"
      ].join("\n");

      const previewRes = await request(app)
        .post("/api/v1/admin/products/import/preview")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ fileData: csv, mode: "create" });

      const importId = previewRes.body.data.importId;

      // Download errors
      const errorReportRes = await request(app)
        .get(`/api/v1/admin/products/import/errors/${importId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(errorReportRes.status).toBe(200);
      expect(errorReportRes.headers["content-type"]).toContain("text/csv");
      expect(errorReportRes.text).toContain("Row Number");
      expect(errorReportRes.text).toContain("BAD-SKU");
      expect(errorReportRes.text).toContain("3,BAD-SKU");
    });

    it("rejects confirmation with unknown import ID or expired session with 400", async () => {
      const res = await request(app)
        .post("/api/v1/admin/products/import/confirm")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ importId: "00000000-0000-0000-0000-000000000000", mode: "create" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("IMPORT_SESSION_EXPIRED");
    });

    it("rejects confirmation when mode mismatches the preview session mode", async () => {
      vi.spyOn(SkuRegistry, "find").mockReturnValue({
        select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) })
      });

      const csv = "SKU,Name,Description,Price,Stock,Category\nMODE-SKU,Mode Product,Valid description text,100,5,General";
      const previewRes = await request(app)
        .post("/api/v1/admin/products/import/preview")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ fileData: csv, mode: "create" });

      const importId = previewRes.body.data.importId;

      const confirmRes = await request(app)
        .post("/api/v1/admin/products/import/confirm")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ importId, mode: "update" }); // Mismatched mode!

      expect(confirmRes.status).toBe(400);
      expect(confirmRes.body.error.code).toBe("IMPORT_MODE_MISMATCH");
    });

    it("in update mode: rejects variant SKUs during preview to protect variant products", async () => {
      const parentProductId = new mongoose.Types.ObjectId();
      vi.spyOn(SkuRegistry, "find").mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([
            { sku: "VAR-SKU-RED-XL", product: parentProductId, variantId: "var-123" }
          ])
        })
      });

      const csv = [
        "SKU,Price,Stock",
        "VAR-SKU-RED-XL,999,10"
      ].join("\n");

      const res = await request(app)
        .post("/api/v1/admin/products/import/preview")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ fileData: csv, mode: "update" });

      expect(res.status).toBe(200);
      expect(res.body.data.summary.validRows).toBe(0);
      expect(res.body.data.summary.invalidRows).toBe(1);
      expect(res.body.data.previewRows[0].isValid).toBe(false);
      expect(res.body.data.previewRows[0].errors[0]).toContain("belongs to a product variant");
    });

    it("in update mode: prevents modifying parent products that have variants during execution", async () => {
      const parentProductId = new mongoose.Types.ObjectId();
      vi.spyOn(SkuRegistry, "find").mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([
            { sku: "PARENT-BASE-SKU", product: parentProductId, variantId: null }
          ])
        })
      });

      const mockProductWithVariants = {
        _id: parentProductId,
        name: "Parent Product with Variants",
        variants: [{ variantId: "v1", sku: "CHILD-1", stock: 10 }],
        save: vi.fn()
      };
      vi.spyOn(Product, "findById").mockResolvedValue(mockProductWithVariants);

      const csv = "SKU,Price,Stock\nPARENT-BASE-SKU,500,20";
      const previewRes = await request(app)
        .post("/api/v1/admin/products/import/preview")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ fileData: csv, mode: "update" });

      const importId = previewRes.body.data.importId;

      const confirmRes = await request(app)
        .post("/api/v1/admin/products/import/confirm")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ importId, mode: "update" });

      expect(confirmRes.status).toBe(200);
      expect(confirmRes.body.data.updatedCount).toBe(0);
      expect(confirmRes.body.data.failedCount).toBe(1);
      expect(confirmRes.body.data.failedRows[0].error).toContain("has variant SKUs and cannot be modified via simple bulk import");
      expect(mockProductWithVariants.save).not.toHaveBeenCalled();
    });

    it("strictly verifies unauthenticated and non-admin requests are rejected across all endpoints", async () => {
      // POST preview
      const previewUnauth = await request(app).post("/api/v1/admin/products/import/preview").send({});
      expect(previewUnauth.status).toBe(401);
      const previewCustomer = await request(app).post("/api/v1/admin/products/import/preview").set("Authorization", `Bearer ${customerToken}`).send({});
      expect(previewCustomer.status).toBe(403);

      // POST confirm
      const confirmUnauth = await request(app).post("/api/v1/admin/products/import/confirm").send({});
      expect(confirmUnauth.status).toBe(401);
      const confirmCustomer = await request(app).post("/api/v1/admin/products/import/confirm").set("Authorization", `Bearer ${customerToken}`).send({});
      expect(confirmCustomer.status).toBe(403);

      // GET errors
      const errorsUnauth = await request(app).get("/api/v1/admin/products/import/errors/dummy");
      expect(errorsUnauth.status).toBe(401);
      const errorsCustomer = await request(app).get("/api/v1/admin/products/import/errors/dummy").set("Authorization", `Bearer ${customerToken}`);
      expect(errorsCustomer.status).toBe(403);
    });

    it("rolls back SKU reservation when product creation fails midway", async () => {
      vi.spyOn(SkuRegistry, "find").mockReturnValue({
        select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) })
      });
      vi.spyOn(SkuRegistry, "create").mockResolvedValue({ sku: "FAIL-ROLLBACK-SKU" });
      const deleteManySpy = vi.spyOn(SkuRegistry, "deleteMany").mockResolvedValue({ deletedCount: 1 });
      vi.spyOn(Product, "create").mockRejectedValue(new Error("Simulated MongoDB write failure"));

      const csv = "SKU,Name,Description,Price,Stock,Category\nFAIL-ROLLBACK-SKU,Fail Item,Valid product description text,200,10,Books";
      const previewRes = await request(app)
        .post("/api/v1/admin/products/import/preview")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ fileData: csv, mode: "create" });

      const importId = previewRes.body.data.importId;

      const confirmRes = await request(app)
        .post("/api/v1/admin/products/import/confirm")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ importId, mode: "create" });

      expect(confirmRes.status).toBe(200);
      expect(confirmRes.body.data.createdCount).toBe(0);
      expect(confirmRes.body.data.failedCount).toBe(1);
      expect(confirmRes.body.data.failedRows[0].error).toContain("Simulated MongoDB write failure");
      // SkuRegistry.deleteMany must be called to release reserved SKU
      expect(deleteManySpy).toHaveBeenCalled();
    });

    it("in update mode: correctly persists explicit 0 price and 0 stock without preserving old values", async () => {
      const existingProductId = new mongoose.Types.ObjectId();
      vi.spyOn(SkuRegistry, "find").mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([
            { sku: "ZERO-TEST-SKU", product: existingProductId, variantId: null }
          ])
        })
      });

      const mockProductDoc = {
        _id: existingProductId,
        name: "Zero Test Product",
        price: 999,
        stock: 50,
        changeToken: "old-token",
        save: vi.fn().mockResolvedValue(true)
      };
      vi.spyOn(Product, "findById").mockResolvedValue(mockProductDoc);

      const csv = "SKU,Price,Stock\nZERO-TEST-SKU,0,0";
      const previewRes = await request(app)
        .post("/api/v1/admin/products/import/preview")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ fileData: csv, mode: "update" });

      const importId = previewRes.body.data.importId;
      expect(previewRes.body.data.previewRows[0].price).toBe(0);
      expect(previewRes.body.data.previewRows[0].stock).toBe(0);

      const confirmRes = await request(app)
        .post("/api/v1/admin/products/import/confirm")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ importId, mode: "update" });

      expect(confirmRes.status).toBe(200);
      expect(confirmRes.body.data.updatedCount).toBe(1);
      expect(mockProductDoc.price).toBe(0);
      expect(mockProductDoc.stock).toBe(0);
    });

    it("rejects duplicate SKUs with case-insensitivity against existing records", async () => {
      vi.spyOn(SkuRegistry, "find").mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([
            { sku: "UPPER-CASE-SKU", product: new mongoose.Types.ObjectId(), variantId: null }
          ])
        })
      });

      // Uploading lowercase "upper-case-sku"
      const csv = "SKU,Name,Description,Price,Stock,Category\nupper-case-sku,Item,Valid description text,100,5,General";
      const previewRes = await request(app)
        .post("/api/v1/admin/products/import/preview")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ fileData: csv, mode: "create" });

      expect(previewRes.status).toBe(200);
      expect(previewRes.body.data.summary.validRows).toBe(0);
      expect(previewRes.body.data.summary.invalidRows).toBe(1);
      expect(previewRes.body.data.previewRows[0].isValid).toBe(false);
      expect(previewRes.body.data.previewRows[0].errors[0]).toContain("already registered");
    });

    it("handles in-memory session loss gracefully after simulated server restart", async () => {
      vi.spyOn(SkuRegistry, "find").mockReturnValue({
        select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) })
      });

      const csv = "SKU,Name,Description,Price,Stock,Category\nRESTART-SKU,Item,Valid description text,100,5,General";
      const previewRes = await request(app)
        .post("/api/v1/admin/products/import/preview")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ fileData: csv, mode: "create" });

      const importId = previewRes.body.data.importId;

      // Simulate server restart or process memory wipe
      _resetSessions();

      const confirmRes = await request(app)
        .post("/api/v1/admin/products/import/confirm")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ importId, mode: "create" });

      expect(confirmRes.status).toBe(400);
      expect(confirmRes.body.error.code).toBe("IMPORT_SESSION_EXPIRED");
    });
  });
});
