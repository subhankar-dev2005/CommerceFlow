import { fileURLToPath } from "node:url";
import path from "node:path";
import mongoose from "mongoose";
import dotenv from "dotenv";
import Product from "../src/modules/products/product.model.js";
import InventoryAdjustment from "../src/modules/inventory/inventory-adjustment.model.js";
import { verifyDatabaseTarget } from "./safety-helper.js";

/**
 * Standardized read-only query filters for vendor ownership categorization.
 */
export const OWNERSHIP_QUERIES = Object.freeze({
  MISSING: Object.freeze({ vendorId: { $exists: false } }),
  EXPLICIT_NULL: Object.freeze({ vendorId: { $type: "null" } }),
  NON_NULL: Object.freeze({ vendorId: { $exists: true, $ne: null } }),
  TOTAL: Object.freeze({}),
});

/**
 * Critical migration notice regarding legacy data ownership attribution.
 */
export const OWNERSHIP_POLICY_NOTICE = `
================================================================================
CRITICAL MIGRATION & OWNERSHIP POLICY NOTICE:
--------------------------------------------------------------------------------
Missing or null 'vendorId' is NOT automatically proof of first-party platform ownership.

Explanation:
1. Legacy Catalog & Inventory: Records created prior to multi-vendor capabilities
   may have 'vendorId' omitted (missing) or explicitly set to null.
2. Migration Risk: Assuming all unassigned records belong to the platform (first-party)
   without business verification can cause catalog misattribution or accidental exposure.
3. No Automatic Backfill: This tooling is strictly READ-ONLY. It does NOT assign
   ownership, create Vendor entities, or mutate any documents.
4. Action Required: A formal migration policy, seller agreement audit, and verified
   backfill strategy must precede any ownership assignment in future stages.
================================================================================
`.trim();

/**
 * Executes read-only queries to count Product and InventoryAdjustment records
 * categorized by vendor ownership status.
 *
 * Guaranteed to NEVER execute mutations, index operations, or write commands.
 *
 * @param {Object} options
 * @param {Object} [options.productModel=Product] - Mongoose model for products
 * @param {Object} [options.inventoryAdjustmentModel=InventoryAdjustment] - Mongoose model for inventory adjustments
 * @returns {Promise<Object>} Aggregated ownership metrics
 */
export async function runOwnershipAudit({
  productModel = Product,
  inventoryAdjustmentModel = InventoryAdjustment,
} = {}) {
  const [
    productsMissing,
    productsNull,
    productsAssigned,
    productsTotal,
    adjustmentsMissing,
    adjustmentsNull,
    adjustmentsAssigned,
    adjustmentsTotal,
  ] = await Promise.all([
    productModel.countDocuments(OWNERSHIP_QUERIES.MISSING),
    productModel.countDocuments(OWNERSHIP_QUERIES.EXPLICIT_NULL),
    productModel.countDocuments(OWNERSHIP_QUERIES.NON_NULL),
    productModel.countDocuments(OWNERSHIP_QUERIES.TOTAL),
    inventoryAdjustmentModel.countDocuments(OWNERSHIP_QUERIES.MISSING),
    inventoryAdjustmentModel.countDocuments(OWNERSHIP_QUERIES.EXPLICIT_NULL),
    inventoryAdjustmentModel.countDocuments(OWNERSHIP_QUERIES.NON_NULL),
    inventoryAdjustmentModel.countDocuments(OWNERSHIP_QUERIES.TOTAL),
  ]);

  return {
    products: {
      missing: productsMissing,
      explicitNull: productsNull,
      assigned: productsAssigned,
      total: productsTotal,
    },
    inventoryAdjustments: {
      missing: adjustmentsMissing,
      explicitNull: adjustmentsNull,
      assigned: adjustmentsAssigned,
      total: adjustmentsTotal,
    },
  };
}

/**
 * Formats structured audit results into a readable report string.
 *
 * @param {Object} params
 * @param {Object} params.targetInfo - Sanitized host, database name, and environment
 * @param {Object} params.metrics - Product and InventoryAdjustment metrics
 * @returns {string} Formatted report
 */
export function formatAuditReport({ targetInfo, metrics }) {
  const { host, database, environment } = targetInfo;
  const p = metrics.products;
  const a = metrics.inventoryAdjustments;

  const productSumMatch = p.missing + p.explicitNull + p.assigned === p.total;
  const adjustmentSumMatch = a.missing + a.explicitNull + a.assigned === a.total;

  const lines = [
    "================================================================================",
    "          COMMERCEFLOW MARKETPLACE OWNERSHIP AUDIT REPORT (READ-ONLY)           ",
    "================================================================================",
    `Target Host:   ${host}`,
    `Target DB:     ${database}`,
    `Environment:   ${environment}`,
    `Timestamp:     ${new Date().toISOString()}`,
    "--------------------------------------------------------------------------------",
    "PRODUCT CATALOG OWNERSHIP COUNTS:",
    `  • Missing vendorId (field not in document): ${p.missing}`,
    `  • Explicitly null vendorId:                 ${p.explicitNull}`,
    `  • Assigned non-null vendorId:               ${p.assigned}`,
    `  • Total Products:                           ${p.total}`,
    `  • Accounting Check (sum == total):          ${productSumMatch ? "PASS" : "FAIL (Discrepancy detected)"}`,
    "--------------------------------------------------------------------------------",
    "INVENTORY ADJUSTMENT RECORD COUNTS:",
    `  • Missing vendorId (field not in document): ${a.missing}`,
    `  • Explicitly null vendorId:                 ${a.explicitNull}`,
    `  • Assigned non-null vendorId:               ${a.assigned}`,
    `  • Total Inventory Adjustments:              ${a.total}`,
    `  • Accounting Check (sum == total):          ${adjustmentSumMatch ? "PASS" : "FAIL (Discrepancy detected)"}`,
    "--------------------------------------------------------------------------------",
    "MUTATION AUDIT CONFIRMATION:",
    "  • Writes/Inserts/Updates/Deletes:           0 (Strict read-only)",
    "  • Index changes:                            0",
    "  • Vendor documents created:                 0",
    "",
    OWNERSHIP_POLICY_NOTICE,
    "================================================================================",
  ];

  return lines.join("\n");
}

/**
 * Executes the ownership audit workflow with comprehensive safety checks.
 *
 * @param {Object} options
 * @param {string[]} [options.argv] - Command line arguments
 * @param {Object} [options.env] - Environment variables
 * @param {Function} [options.connectFn] - MongoDB connection function
 * @param {Function} [options.disconnectFn] - MongoDB disconnection function
 * @param {Object} [options.logger] - Logger interface
 * @param {Object} [options.productModel] - Product model
 * @param {Object} [options.inventoryAdjustmentModel] - InventoryAdjustment model
 * @returns {Promise<{ success: boolean, reason?: string, exitCode: number, metrics?: Object, error?: Error }>}
 */
export async function executeAudit({
  argv = process.argv.slice(2),
  env = process.env,
  connectFn = mongoose.connect.bind(mongoose),
  disconnectFn = mongoose.disconnect.bind(mongoose),
  logger = console,
  productModel = Product,
  inventoryAdjustmentModel = InventoryAdjustment,
} = {}) {
  // Guard 1: Require intentional --run flag
  const hasRunFlag = argv.includes("--run");

  if (!hasRunFlag) {
    logger.error("================================================================================");
    logger.error("COMMERCEFLOW VENDOR OWNERSHIP AUDIT: EXECUTION HALTED (DRY-RUN MODE)");
    logger.error("================================================================================");
    logger.error("Error: The '--run' flag is required before attempting any database connection.");
    logger.error("");
    logger.error("Usage:");
    logger.error("  node scripts/audit-vendor-ownership.js --run");
    logger.error("");
    logger.error("Safety Guarantees:");
    logger.error("  - Strictly READ-ONLY: Never creates, updates, deletes, or backfills data.");
    logger.error("  - Zero writes: Only runs read-only count queries.");
    logger.error("  - Verified targets only: Fails closed on production or unverified targets.");
    logger.error("================================================================================");
    return { success: false, reason: "MISSING_RUN_FLAG", exitCode: 1 };
  }

  const mongoUri = env.MONGODB_URI || "mongodb://127.0.0.1:27017/commerceflow";

  // Guard 2: Verify database target safety
  const safetyCheck = verifyDatabaseTarget({
    mongoUri,
    nodeEnv: env.NODE_ENV,
    stagingOverrideEnvVar: "ALLOW_STAGING_VENDOR_AUDIT",
    stagingOverrideValue: env.ALLOW_STAGING_VENDOR_AUDIT,
    confirmDatabase: env.CONFIRM_TARGET_DB,
  });

  if (!safetyCheck.allowed) {
    logger.error("================================================================================");
    logger.error("COMMERCEFLOW VENDOR OWNERSHIP AUDIT: DATABASE TARGET BLOCKED");
    logger.error("================================================================================");
    logger.error(`Refusing to connect: ${safetyCheck.reason}`);
    logger.error(`Target Host: ${safetyCheck.target.host}`);
    logger.error(`Target DB:   ${safetyCheck.target.database}`);
    logger.error(`Environment: ${safetyCheck.environment}`);
    logger.error("");
    logger.error("Requirements for remote staging audit:");
    logger.error("  NODE_ENV=staging");
    logger.error("  ALLOW_STAGING_VENDOR_AUDIT=true");
    logger.error(
      `  CONFIRM_TARGET_DB=${
        safetyCheck.target.database !== "unknown" && safetyCheck.target.database !== "none"
          ? safetyCheck.target.database
          : "<database_name>"
      }`
    );
    logger.error("");
    logger.error("Note: Production database targets are strictly locked out.");
    logger.error("================================================================================");
    return { success: false, reason: "TARGET_VERIFICATION_FAILED", exitCode: 1 };
  }

  let isConnected = false;
  try {
    await connectFn(mongoUri);
    isConnected = true;

    const metrics = await runOwnershipAudit({
      productModel,
      inventoryAdjustmentModel,
    });

    const report = formatAuditReport({
      targetInfo: {
        host: safetyCheck.target.host,
        database: safetyCheck.target.database,
        environment: safetyCheck.environment,
      },
      metrics,
    });

    logger.log(report);

    return { success: true, metrics, exitCode: 0 };
  } catch (error) {
    logger.error("Ownership audit failed with query/connection error:", error?.message || error);
    return { success: false, reason: "EXECUTION_ERROR", error, exitCode: 1 };
  } finally {
    if (isConnected) {
      await disconnectFn().catch(() => {});
    }
  }
}

// CLI entrypoint
const isDirectExecution =
  process.argv[1] &&
  (fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) ||
    process.argv[1].endsWith("audit-vendor-ownership.js"));

if (isDirectExecution) {
  dotenv.config();
  executeAudit()
    .then((result) => {
      process.exit(result.exitCode);
    })
    .catch((err) => {
      console.error("Fatal error during audit execution:", err?.message || err);
      process.exit(1);
    });
}
