import { describe, it, expect, vi } from "vitest";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  OWNERSHIP_QUERIES,
  OWNERSHIP_POLICY_NOTICE,
  runOwnershipAudit,
  formatAuditReport,
  executeAudit,
} from "./audit-vendor-ownership.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Creates a mock Mongoose model for read-only count queries
 * that explicitly throws if ANY mutation/write method is invoked.
 */
function createMockModel(counts = {}) {
  const defaultCounts = {
    missing: 40,
    explicitNull: 10,
    assigned: 5,
    total: 55,
  };

  const resolved = { ...defaultCounts, ...counts };

  const queryFilterCalls = [];

  const mock = {
    queryFilterCalls,
    countDocuments: vi.fn(async (filter) => {
      queryFilterCalls.push(filter);
      if (filter && filter.vendorId && filter.vendorId.$exists === false) {
        return resolved.missing;
      }
      if (filter && filter.vendorId && filter.vendorId.$type === "null") {
        return resolved.explicitNull;
      }
      if (filter && filter.vendorId && filter.vendorId.$exists === true && filter.vendorId.$ne === null) {
        return resolved.assigned;
      }
      if (!filter || Object.keys(filter).length === 0) {
        return resolved.total;
      }
      return 0;
    }),

    // Strictly forbidden write/mutation methods
    create: vi.fn(() => {
      throw new Error("MUTATION_BLOCKED: Model.create called during read-only audit");
    }),
    insertMany: vi.fn(() => {
      throw new Error("MUTATION_BLOCKED: Model.insertMany called during read-only audit");
    }),
    updateOne: vi.fn(() => {
      throw new Error("MUTATION_BLOCKED: Model.updateOne called during read-only audit");
    }),
    updateMany: vi.fn(() => {
      throw new Error("MUTATION_BLOCKED: Model.updateMany called during read-only audit");
    }),
    deleteOne: vi.fn(() => {
      throw new Error("MUTATION_BLOCKED: Model.deleteOne called during read-only audit");
    }),
    deleteMany: vi.fn(() => {
      throw new Error("MUTATION_BLOCKED: Model.deleteMany called during read-only audit");
    }),
    findOneAndUpdate: vi.fn(() => {
      throw new Error("MUTATION_BLOCKED: Model.findOneAndUpdate called during read-only audit");
    }),
    save: vi.fn(() => {
      throw new Error("MUTATION_BLOCKED: Model.save called during read-only audit");
    }),
    bulkWrite: vi.fn(() => {
      throw new Error("MUTATION_BLOCKED: Model.bulkWrite called during read-only audit");
    }),
    syncIndexes: vi.fn(() => {
      throw new Error("MUTATION_BLOCKED: Model.syncIndexes called during read-only audit");
    }),
  };

  return mock;
}

describe("CommerceFlow Stage 2.2: Ownership Migration Audit Tooling", () => {
  describe("Read-Only Query Invariants (runOwnershipAudit)", () => {
    it("executes the exact 6 vendorId count queries plus totals", async () => {
      const mockProduct = createMockModel({
        missing: 100,
        explicitNull: 20,
        assigned: 5,
        total: 125,
      });

      const mockAdjustment = createMockModel({
        missing: 45,
        explicitNull: 15,
        assigned: 2,
        total: 62,
      });

      const metrics = await runOwnershipAudit({
        productModel: mockProduct,
        inventoryAdjustmentModel: mockAdjustment,
      });

      // Product queries
      expect(mockProduct.countDocuments).toHaveBeenCalledTimes(4);
      expect(mockProduct.queryFilterCalls).toEqual([
        OWNERSHIP_QUERIES.MISSING,
        OWNERSHIP_QUERIES.EXPLICIT_NULL,
        OWNERSHIP_QUERIES.NON_NULL,
        OWNERSHIP_QUERIES.TOTAL,
      ]);

      // Inventory adjustment queries
      expect(mockAdjustment.countDocuments).toHaveBeenCalledTimes(4);
      expect(mockAdjustment.queryFilterCalls).toEqual([
        OWNERSHIP_QUERIES.MISSING,
        OWNERSHIP_QUERIES.EXPLICIT_NULL,
        OWNERSHIP_QUERIES.NON_NULL,
        OWNERSHIP_QUERIES.TOTAL,
      ]);

      // Returned structure
      expect(metrics).toEqual({
        products: {
          missing: 100,
          explicitNull: 20,
          assigned: 5,
          total: 125,
        },
        inventoryAdjustments: {
          missing: 45,
          explicitNull: 15,
          assigned: 2,
          total: 62,
        },
      });
    });

    it("never invokes any mutation, write, or index creation methods", async () => {
      const mockProduct = createMockModel();
      const mockAdjustment = createMockModel();

      await runOwnershipAudit({
        productModel: mockProduct,
        inventoryAdjustmentModel: mockAdjustment,
      });

      // Assert zero calls to all write operations on Product
      expect(mockProduct.create).not.toHaveBeenCalled();
      expect(mockProduct.insertMany).not.toHaveBeenCalled();
      expect(mockProduct.updateOne).not.toHaveBeenCalled();
      expect(mockProduct.updateMany).not.toHaveBeenCalled();
      expect(mockProduct.deleteOne).not.toHaveBeenCalled();
      expect(mockProduct.deleteMany).not.toHaveBeenCalled();
      expect(mockProduct.findOneAndUpdate).not.toHaveBeenCalled();
      expect(mockProduct.bulkWrite).not.toHaveBeenCalled();
      expect(mockProduct.syncIndexes).not.toHaveBeenCalled();

      // Assert zero calls to all write operations on InventoryAdjustment
      expect(mockAdjustment.create).not.toHaveBeenCalled();
      expect(mockAdjustment.insertMany).not.toHaveBeenCalled();
      expect(mockAdjustment.updateOne).not.toHaveBeenCalled();
      expect(mockAdjustment.updateMany).not.toHaveBeenCalled();
      expect(mockAdjustment.deleteOne).not.toHaveBeenCalled();
      expect(mockAdjustment.deleteMany).not.toHaveBeenCalled();
      expect(mockAdjustment.findOneAndUpdate).not.toHaveBeenCalled();
      expect(mockAdjustment.bulkWrite).not.toHaveBeenCalled();
      expect(mockAdjustment.syncIndexes).not.toHaveBeenCalled();
    });

    it("verifies query filter shapes match expected MongoDB BSON operators", () => {
      expect(OWNERSHIP_QUERIES.MISSING).toEqual({ vendorId: { $exists: false } });
      expect(OWNERSHIP_QUERIES.EXPLICIT_NULL).toEqual({ vendorId: { $type: "null" } });
      expect(OWNERSHIP_QUERIES.NON_NULL).toEqual({ vendorId: { $exists: true, $ne: null } });
      expect(OWNERSHIP_QUERIES.TOTAL).toEqual({});
    });
  });

  describe("Safety Enforcement & CLI Argument Guards (executeAudit)", () => {
    it("refuses to connect without the intentional '--run' flag", async () => {
      const connectFn = vi.fn();
      const disconnectFn = vi.fn();
      const logger = { error: vi.fn(), log: vi.fn() };

      const result = await executeAudit({
        argv: [], // No --run flag
        connectFn,
        disconnectFn,
        logger,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toBe("MISSING_RUN_FLAG");
      expect(result.exitCode).toBe(1);

      // Must never have attempted connection
      expect(connectFn).not.toHaveBeenCalled();
      expect(disconnectFn).not.toHaveBeenCalled();

      // Explains '--run' requirement in error output
      const errorOutput = logger.error.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(errorOutput).toContain("'--run' flag is required");
      expect(errorOutput).toContain("DRY-RUN MODE");
    });

    it("refuses to connect when targeting a production environment (NODE_ENV=production)", async () => {
      const connectFn = vi.fn();
      const disconnectFn = vi.fn();
      const logger = { error: vi.fn(), log: vi.fn() };

      const result = await executeAudit({
        argv: ["--run"],
        env: {
          NODE_ENV: "production",
          MONGODB_URI: "mongodb://127.0.0.1:27017/commerceflow",
        },
        connectFn,
        disconnectFn,
        logger,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toBe("TARGET_VERIFICATION_FAILED");
      expect(result.exitCode).toBe(1);

      // Must never have attempted connection
      expect(connectFn).not.toHaveBeenCalled();

      const errorOutput = logger.error.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(errorOutput).toContain("Production administrative mutations are strictly forbidden");
    });

    it("refuses to connect when database name indicates production", async () => {
      const connectFn = vi.fn();
      const disconnectFn = vi.fn();
      const logger = { error: vi.fn(), log: vi.fn() };

      const result = await executeAudit({
        argv: ["--run"],
        env: {
          NODE_ENV: "development",
          MONGODB_URI: "mongodb://127.0.0.1:27017/commerceflow_prod",
        },
        connectFn,
        disconnectFn,
        logger,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toBe("TARGET_VERIFICATION_FAILED");
      expect(result.exitCode).toBe(1);
      expect(connectFn).not.toHaveBeenCalled();

      const errorOutput = logger.error.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(errorOutput).toContain("indicates a production database");
    });

    it("refuses to connect to remote databases without explicit staging environment and overrides", async () => {
      const connectFn = vi.fn();
      const disconnectFn = vi.fn();
      const logger = { error: vi.fn(), log: vi.fn() };

      // Remote host with development NODE_ENV
      const result = await executeAudit({
        argv: ["--run"],
        env: {
          NODE_ENV: "development",
          MONGODB_URI: "mongodb+srv://user:pass@cluster.mongodb.net/commerceflow_staging",
        },
        connectFn,
        disconnectFn,
        logger,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toBe("TARGET_VERIFICATION_FAILED");
      expect(result.exitCode).toBe(1);
      expect(connectFn).not.toHaveBeenCalled();

      const errorOutput = logger.error.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(errorOutput).toContain("requires NODE_ENV to be explicitly set to \"staging\"");
    });

    it("permits execution and runs queries on safe local targets with '--run'", async () => {
      const connectFn = vi.fn(async () => {});
      const disconnectFn = vi.fn(async () => {});
      const logger = { error: vi.fn(), log: vi.fn() };

      const mockProduct = createMockModel({ missing: 10, explicitNull: 2, assigned: 3, total: 15 });
      const mockAdjustment = createMockModel({ missing: 5, explicitNull: 1, assigned: 0, total: 6 });

      const result = await executeAudit({
        argv: ["--run"],
        env: {
          NODE_ENV: "development",
          MONGODB_URI: "mongodb://127.0.0.1:27017/commerceflow_dev",
        },
        connectFn,
        disconnectFn,
        logger,
        productModel: mockProduct,
        inventoryAdjustmentModel: mockAdjustment,
      });

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(connectFn).toHaveBeenCalledTimes(1);
      expect(disconnectFn).toHaveBeenCalledTimes(1);
      expect(mockProduct.countDocuments).toHaveBeenCalledTimes(4);
      expect(mockAdjustment.countDocuments).toHaveBeenCalledTimes(4);
    });

    it("permits execution on remote staging targets when properly overridden and confirmed", async () => {
      const connectFn = vi.fn(async () => {});
      const disconnectFn = vi.fn(async () => {});
      const logger = { error: vi.fn(), log: vi.fn() };

      const mockProduct = createMockModel();
      const mockAdjustment = createMockModel();

      const result = await executeAudit({
        argv: ["--run"],
        env: {
          NODE_ENV: "staging",
          MONGODB_URI: "mongodb+srv://user:pass@cluster.mongodb.net/commerceflow_staging",
          ALLOW_STAGING_VENDOR_AUDIT: "true",
          CONFIRM_TARGET_DB: "commerceflow_staging",
        },
        connectFn,
        disconnectFn,
        logger,
        productModel: mockProduct,
        inventoryAdjustmentModel: mockAdjustment,
      });

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(connectFn).toHaveBeenCalledTimes(1);
      expect(disconnectFn).toHaveBeenCalledTimes(1);
    });

    it("disconnects and exits with code 1 if a query fails", async () => {
      const connectFn = vi.fn(async () => {});
      const disconnectFn = vi.fn(async () => {});
      const logger = { error: vi.fn(), log: vi.fn() };

      const failingProductModel = {
        countDocuments: vi.fn().mockRejectedValue(new Error("Database connection dropped during query")),
      };
      const mockAdjustment = createMockModel();

      const result = await executeAudit({
        argv: ["--run"],
        env: {
          NODE_ENV: "development",
          MONGODB_URI: "mongodb://127.0.0.1:27017/commerceflow_dev",
        },
        connectFn,
        disconnectFn,
        logger,
        productModel: failingProductModel,
        inventoryAdjustmentModel: mockAdjustment,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toBe("EXECUTION_ERROR");
      expect(result.exitCode).toBe(1);
      expect(disconnectFn).toHaveBeenCalledTimes(1);
    });
  });

  describe("Credential Protection & URI Sanitization", () => {
    it("never exposes credentials or full raw URIs in output or logs", async () => {
      const connectFn = vi.fn();
      const logger = { error: vi.fn(), log: vi.fn() };

      // Malicious or accidental production URI with secret credentials
      const sensitivePassword = "super_secret_p@ssword_12345!";
      const sensitiveUri = `mongodb+srv://admin:${sensitivePassword}@cluster.mongodb.net/production_db`;

      await executeAudit({
        argv: ["--run"],
        env: {
          NODE_ENV: "development",
          MONGODB_URI: sensitiveUri,
        },
        connectFn,
        logger,
      });

      const allLoggedText = [
        ...logger.error.mock.calls.flat(),
        ...logger.log.mock.calls.flat(),
      ].join(" ");

      expect(allLoggedText).not.toContain(sensitivePassword);
      expect(allLoggedText).not.toContain(sensitiveUri);
    });
  });

  describe("Ownership Policy Notice & Report Formatting", () => {
    it("clearly explains that missing/null ownership is not proof of first-party ownership", () => {
      expect(OWNERSHIP_POLICY_NOTICE).toContain(
        "Missing or null 'vendorId' is NOT automatically proof of first-party platform ownership"
      );
      expect(OWNERSHIP_POLICY_NOTICE).toContain("Legacy Catalog & Inventory");
      expect(OWNERSHIP_POLICY_NOTICE).toContain("Migration Risk");
      expect(OWNERSHIP_POLICY_NOTICE).toContain("strictly READ-ONLY");
    });

    it("formats the audit report with all 6 categories, totals, and accounting check", () => {
      const report = formatAuditReport({
        targetInfo: {
          host: "127.0.0.1",
          database: "commerceflow_dev",
          environment: "development",
        },
        metrics: {
          products: {
            missing: 50,
            explicitNull: 20,
            assigned: 10,
            total: 80,
          },
          inventoryAdjustments: {
            missing: 30,
            explicitNull: 5,
            assigned: 15,
            total: 50,
          },
        },
      });

      // Target details
      expect(report).toContain("Target Host:   127.0.0.1");
      expect(report).toContain("Target DB:     commerceflow_dev");
      expect(report).toContain("Environment:   development");

      // Products breakdown
      expect(report).toContain("Missing vendorId (field not in document): 50");
      expect(report).toContain("Explicitly null vendorId:                 20");
      expect(report).toContain("Assigned non-null vendorId:               10");
      expect(report).toContain("Total Products:                           80");
      expect(report).toContain("Accounting Check (sum == total):          PASS");

      // Adjustments breakdown
      expect(report).toContain("Missing vendorId (field not in document): 30");
      expect(report).toContain("Explicitly null vendorId:                 5");
      expect(report).toContain("Assigned non-null vendorId:               15");
      expect(report).toContain("Total Inventory Adjustments:              50");

      // Zero mutation assertion
      expect(report).toContain("Writes/Inserts/Updates/Deletes:           0 (Strict read-only)");
      expect(report).toContain("Vendor documents created:                 0");

      // Notice included
      expect(report).toContain("Missing or null 'vendorId' is NOT automatically proof");
    });
  });

  describe("CLI Subprocess Execution (Dry-Run Guard)", () => {
    it("exits with status 1 and halts execution when invoked directly without '--run'", async () => {
      const scriptPath = path.resolve(__dirname, "audit-vendor-ownership.js");

      const executionPromise = new Promise((resolve) => {
        execFile("node", [scriptPath], { env: { ...process.env, NODE_ENV: "development" } }, (error, stdout, stderr) => {
          resolve({
            code: error ? error.code : 0,
            stdout,
            stderr,
          });
        });
      });

      const { code, stderr } = await executionPromise;

      expect(code).toBe(1);
      expect(stderr).toContain("EXECUTION HALTED (DRY-RUN MODE)");
      expect(stderr).toContain("The '--run' flag is required before attempting any database connection");
    });
  });
});
