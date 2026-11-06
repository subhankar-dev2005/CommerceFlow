import { fileURLToPath } from "node:url";
import path from "node:path";
import mongoose from "mongoose";
import dotenv from "dotenv";
import Vendor from "../src/modules/vendors/vendor.model.js";
import { verifyDatabaseTarget } from "./safety-helper.js";

/**
 * Standard proposed first-party platform vendor identity.
 */
export const DEFAULT_FIRST_PARTY_VENDOR = Object.freeze({
  name: "CommerceFlow Retail",
  slug: "commerceflow-retail",
  status: "active",
  isFirstParty: true,
});

/**
 * Inspects existing Vendor documents in the database to detect current first-party
 * state or potential naming/slug conflicts.
 *
 * Guaranteed to NEVER mutate, create, or delete documents.
 *
 * @param {Object} options
 * @param {Object} [options.vendorModel=Vendor] - Mongoose Vendor model
 * @param {string} [options.proposedSlug=DEFAULT_FIRST_PARTY_VENDOR.slug] - Proposed slug to check
 * @returns {Promise<{ status: string, vendor?: Object, vendors?: Object[], conflictVendor?: Object, message: string }>}
 */
export async function inspectFirstPartyVendorState({
  vendorModel = Vendor,
  proposedSlug = DEFAULT_FIRST_PARTY_VENDOR.slug,
  proposedName = DEFAULT_FIRST_PARTY_VENDOR.name,
  proposedStatus = DEFAULT_FIRST_PARTY_VENDOR.status,
} = {}) {
  const [firstPartyVendors, slugMatchVendors] = await Promise.all([
    vendorModel.find({ isFirstParty: true }),
    vendorModel.find({ slug: proposedSlug }),
  ]);

  // State 1: Ambiguity — Multiple vendors marked as first-party
  if (firstPartyVendors.length > 1) {
    return {
      status: "AMBIGUOUS_MULTIPLE_FIRST_PARTY",
      vendors: firstPartyVendors,
      message: `Ambiguity detected: Multiple (${firstPartyVendors.length}) vendors have isFirstParty: true. Manual resolution required.`,
    };
  }

  // State 2: Exactly one first-party vendor already exists
  if (firstPartyVendors.length === 1) {
    const existing = firstPartyVendors[0];
    const mismatches = [];

    if (existing.name !== proposedName) {
      mismatches.push({
        field: "name",
        expected: proposedName,
        actual: existing.name,
      });
    }

    if (existing.slug !== proposedSlug) {
      mismatches.push({
        field: "slug",
        expected: proposedSlug,
        actual: existing.slug,
      });
    }

    if (existing.status !== proposedStatus) {
      mismatches.push({
        field: "status",
        expected: proposedStatus,
        actual: existing.status,
      });
    }

    if (mismatches.length > 0) {
      const mismatchSummary = mismatches
        .map((m) => `${m.field} (expected: "${m.expected}", actual: "${m.actual}")`)
        .join(", ");

      return {
        status: "EXISTS_MISMATCH",
        vendor: existing,
        mismatches,
        message: `Existing first-party vendor (${existing._id}) has identity mismatches: ${mismatchSummary}. Manual review required.`,
      };
    }

    return {
      status: "EXISTS",
      vendor: existing,
      mismatches: [],
      message: `First-party vendor already exists and matches proposed identity: "${existing.name}" (${existing.slug}) with ID: ${existing._id}.`,
    };
  }

  // State 3: No first-party vendor found, but proposed slug is already taken by a non-first-party vendor
  if (slugMatchVendors.length > 0) {
    const conflict = slugMatchVendors[0];
    return {
      status: "SLUG_CONFLICT",
      conflictVendor: conflict,
      message: `Conflict detected: A vendor with slug "${proposedSlug}" already exists with isFirstParty: false (ID: ${conflict._id}). Manual resolution required.`,
    };
  }

  // State 4: Clean state — No first-party vendor exists, proposed slug is available
  return {
    status: "NONE_FOUND",
    message: `No first-party vendor found and slug "${proposedSlug}" is available for bootstrapping.`,
  };
}

/**
 * Formats a summary of proposed or existing first-party vendor parameters.
 *
 * @param {Object} vendor - Vendor object or proposed config
 * @returns {string} Formatted string
 */
export function formatVendorSummary(vendor) {
  return [
    `  • ID:           ${vendor._id || "[Not Yet Created]"}`,
    `  • Name:         ${vendor.name}`,
    `  • Slug:         ${vendor.slug}`,
    `  • Status:       ${vendor.status}`,
    `  • isFirstParty: ${vendor.isFirstParty}`,
  ].join("\n");
}

/**
 * Executes the first-party vendor bootstrap workflow with comprehensive safeguards.
 *
 * @param {Object} options
 * @param {string[]} [options.argv] - Command line arguments
 * @param {Object} [options.env] - Environment variables
 * @param {Function} [options.connectFn] - MongoDB connection function
 * @param {Function} [options.disconnectFn] - MongoDB disconnection function
 * @param {Object} [options.logger] - Logger interface
 * @param {Object} [options.vendorModel] - Vendor model
 * @param {Object} [options.proposedVendor] - Proposed vendor identity parameters
 * @returns {Promise<{ success: boolean, reason: string, exitCode: number, vendor?: Object, proposedVendor?: Object }>}
 */
export async function executeBootstrap({
  argv = process.argv.slice(2),
  env = process.env,
  connectFn = mongoose.connect.bind(mongoose),
  disconnectFn = mongoose.disconnect.bind(mongoose),
  logger = console,
  vendorModel = Vendor,
  proposedVendor = DEFAULT_FIRST_PARTY_VENDOR,
} = {}) {
  const hasRunFlag = argv.includes("--run");
  const isDryRun = argv.includes("--dry-run");

  // Safeguard 1: Disconnected Dry-Run Guard (Default mode without --run)
  if (!hasRunFlag) {
    logger.error("================================================================================");
    logger.error("FIRST-PARTY VENDOR BOOTSTRAP: EXECUTION HALTED (DRY-RUN MODE)");
    logger.error("================================================================================");
    logger.error("Error: The '--run' flag is required before attempting any database connection or write.");
    logger.error("");
    logger.error("Proposed First-Party Vendor Identity:");
    logger.error(formatVendorSummary(proposedVendor));
    logger.error("");
    logger.error("Usage:");
    logger.error("  node scripts/bootstrap-first-party-vendor.js --run");
    logger.error("  node scripts/bootstrap-first-party-vendor.js --run --dry-run   (Connect & inspect without writing)");
    logger.error("");
    logger.error("Safety Guarantees:");
    logger.error("  - Zero connection: No database connection attempted without --run.");
    logger.error("  - Zero writes: Default execution never modifies or creates data.");
    logger.error("  - Verified targets only: Production environments are strictly locked out.");
    logger.error("  - Ambiguity protected: Detects existing or multiple first-party vendors.");
    logger.error("================================================================================");
    return { success: false, reason: "DRY_RUN_NO_RUN_FLAG", exitCode: 1, proposedVendor };
  }

  const mongoUri = env.MONGODB_URI || "mongodb://127.0.0.1:27017/commerceflow";

  // Safeguard 2: Database target verification using repository safety helper
  const safetyCheck = verifyDatabaseTarget({
    mongoUri,
    nodeEnv: env.NODE_ENV,
    stagingOverrideEnvVar: "ALLOW_STAGING_VENDOR_BOOTSTRAP",
    stagingOverrideValue: env.ALLOW_STAGING_VENDOR_BOOTSTRAP,
    confirmDatabase: env.CONFIRM_TARGET_DB,
  });

  if (!safetyCheck.allowed) {
    logger.error("================================================================================");
    logger.error("FIRST-PARTY VENDOR BOOTSTRAP: DATABASE TARGET BLOCKED");
    logger.error("================================================================================");
    logger.error(`Refusing to connect: ${safetyCheck.reason}`);
    logger.error(`Target Host: ${safetyCheck.target.host}`);
    logger.error(`Target DB:   ${safetyCheck.target.database}`);
    logger.error(`Environment: ${safetyCheck.environment}`);
    logger.error("");
    logger.error("Requirements for remote staging bootstrap:");
    logger.error("  NODE_ENV=staging");
    logger.error("  ALLOW_STAGING_VENDOR_BOOTSTRAP=true");
    logger.error(
      `  CONFIRM_TARGET_DB=${
        safetyCheck.target.database !== "unknown" && safetyCheck.target.database !== "none"
          ? safetyCheck.target.database
          : "<database_name>"
      }`
    );
    logger.error("");
    logger.error("Note: Production administrative mutation is strictly locked out.");
    logger.error("================================================================================");
    return { success: false, reason: "TARGET_VERIFICATION_FAILED", exitCode: 1 };
  }

  let isConnected = false;
  try {
    await connectFn(mongoUri);
    isConnected = true;

    // Inspect database state
    const state = await inspectFirstPartyVendorState({
      vendorModel,
      proposedSlug: proposedVendor.slug,
      proposedName: proposedVendor.name,
      proposedStatus: proposedVendor.status || "active",
    });

    // Case 1: Ambiguity — multiple first-party vendors exist
    if (state.status === "AMBIGUOUS_MULTIPLE_FIRST_PARTY") {
      logger.error("================================================================================");
      logger.error("FIRST-PARTY VENDOR BOOTSTRAP: AMBIGUITY DETECTED (BLOCKED)");
      logger.error("================================================================================");
      logger.error(state.message);
      state.vendors.forEach((v, idx) => {
        logger.error(`  [${idx + 1}] ID: ${v._id} | Name: "${v.name}" | Slug: "${v.slug}" | Status: ${v.status}`);
      });
      logger.error("");
      logger.error("Action blocked: Multiple vendors cannot have isFirstParty: true.");
      logger.error("Manual database reconciliation is required before proceeding.");
      logger.error("================================================================================");
      return { success: false, reason: "AMBIGUOUS_MULTIPLE_FIRST_PARTY", exitCode: 1 };
    }

    // Case 2A: First-party vendor exists but has identity mismatches — Block & require manual review
    if (state.status === "EXISTS_MISMATCH") {
      logger.error("================================================================================");
      logger.error("FIRST-PARTY VENDOR BOOTSTRAP: IDENTITY MISMATCH DETECTED (MANUAL REVIEW REQUIRED)");
      logger.error("================================================================================");
      logger.error(state.message);
      logger.error("");
      logger.error("Mismatched Fields:");
      state.mismatches.forEach((m) => {
        logger.error(`  • ${m.field}: expected "${m.expected}", actual "${m.actual}"`);
      });
      logger.error("");
      logger.error("Existing First-Party Vendor Details:");
      logger.error(formatVendorSummary(state.vendor));
      logger.error("");
      logger.error("Safety Invariants:");
      logger.error("  - Zero mutations: The existing vendor was NOT renamed, modified, or replaced.");
      logger.error("  - Zero duplicates: No secondary first-party vendor was created.");
      logger.error("  - Action blocked: Manual review is required before proceeding.");
      logger.error("================================================================================");
      return {
        success: false,
        reason: "EXISTS_MISMATCH",
        exitCode: 1,
        vendor: state.vendor,
        mismatches: state.mismatches,
      };
    }

    // Case 2B: First-party vendor already exists and matches proposed identity — Idempotent no-op
    if (state.status === "EXISTS") {
      logger.log("================================================================================");
      logger.log("FIRST-PARTY VENDOR BOOTSTRAP: ALREADY CONFIGURED (IDEMPOTENT NO-OP)");
      logger.log("================================================================================");
      logger.log("A first-party vendor matching the proposed identity is already established.");
      logger.log("No creation or modification was performed.");
      logger.log("");
      logger.log("Configured First-Party Vendor:");
      logger.log(formatVendorSummary(state.vendor));
      logger.log("================================================================================");
      return { success: true, reason: "ALREADY_EXISTS", vendor: state.vendor, exitCode: 0 };
    }

    // Case 3: Proposed slug is taken by a non-first-party vendor
    if (state.status === "SLUG_CONFLICT") {
      logger.error("================================================================================");
      logger.error("FIRST-PARTY VENDOR BOOTSTRAP: SLUG CONFLICT DETECTED (BLOCKED)");
      logger.error("================================================================================");
      logger.error(state.message);
      logger.error(`Conflicting Vendor ID:   ${state.conflictVendor._id}`);
      logger.error(`Conflicting Vendor Name: ${state.conflictVendor.name}`);
      logger.error("");
      logger.error("Action blocked: Proposed first-party slug collides with an existing third-party vendor.");
      logger.error("================================================================================");
      return { success: false, reason: "SLUG_CONFLICT", exitCode: 1 };
    }

    // Case 4: None found — either connected dry-run or live write
    if (isDryRun) {
      logger.log("================================================================================");
      logger.log("FIRST-PARTY VENDOR BOOTSTRAP: CONNECTED DRY-RUN REPORT");
      logger.log("================================================================================");
      logger.log("Verified database target has 0 first-party vendors and the proposed slug is free.");
      logger.log("Because --dry-run was specified, NO vendor document was created.");
      logger.log("");
      logger.log("Proposed Vendor That Would Be Created:");
      logger.log(formatVendorSummary(proposedVendor));
      logger.log("================================================================================");
      return { success: true, reason: "DRY_RUN_PROPOSED_REPORTED", proposedVendor, exitCode: 0 };
    }

    // Live Write Path on verified target
    const created = await vendorModel.create({
      name: proposedVendor.name,
      slug: proposedVendor.slug,
      status: proposedVendor.status || "active",
      isFirstParty: true,
    });

    logger.log("================================================================================");
    logger.log("FIRST-PARTY VENDOR BOOTSTRAP: SUCCESSFULLY CREATED");
    logger.log("================================================================================");
    logger.log("Successfully bootstrapped the platform first-party vendor.");
    logger.log("");
    logger.log("Created Vendor Details:");
    logger.log(formatVendorSummary(created));
    logger.log("================================================================================");
    return { success: true, reason: "BOOTSTRAPPED_SUCCESSFULLY", vendor: created, exitCode: 0 };
  } catch (error) {
    logger.error("Bootstrap execution failed with error:", error?.message || error);
    return { success: false, reason: "EXECUTION_ERROR", exitCode: 1, error };
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
    process.argv[1].endsWith("bootstrap-first-party-vendor.js"));

if (isDirectExecution) {
  dotenv.config();
  executeBootstrap()
    .then((result) => {
      process.exit(result.exitCode);
    })
    .catch((err) => {
      console.error("Fatal error during first-party vendor bootstrap:", err?.message || err);
      process.exit(1);
    });
}
