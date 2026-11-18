import { describe, it, expect, vi } from "vitest";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_FIRST_PARTY_VENDOR,
  inspectFirstPartyVendorState,
  formatVendorSummary,
  executeBootstrap,
} from "./bootstrap-first-party-vendor.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Creates a mock Vendor model with customizable query responses
 * and spies to verify zero unauthorized writes.
 */
function createMockVendorModel({
  firstPartyList = [],
  slugMatchList = [],
  createFn = vi.fn(async (doc) => ({ _id: "mock_created_id_123", ...doc })),
} = {}) {
  return {
    find: vi.fn(async (query) => {
      if (query && query.isFirstParty === true) {
        return firstPartyList;
      }
      if (query && query.slug) {
        return slugMatchList.filter((v) => v.slug === query.slug);
      }
      return [];
    }),
    create: createFn,
    updateOne: vi.fn(() => {
      throw new Error("MUTATION_BLOCKED: updateOne called during bootstrap");
    }),
    updateMany: vi.fn(() => {
      throw new Error("MUTATION_BLOCKED: updateMany called during bootstrap");
    }),
    deleteOne: vi.fn(() => {
      throw new Error("MUTATION_BLOCKED: deleteOne called during bootstrap");
    }),
    deleteMany: vi.fn(() => {
      throw new Error("MUTATION_BLOCKED: deleteMany called during bootstrap");
    }),
  };
}

describe("CommerceFlow Stage 2.3B: First-Party Vendor Provisioning Tooling", () => {
  describe("Default Identity Parameters", () => {
    it("matches approved design specifications", () => {
      expect(DEFAULT_FIRST_PARTY_VENDOR).toEqual({
        name: "CommerceFlow Retail",
        slug: "commerceflow-retail",
        status: "active",
        isFirstParty: true,
      });
      expect(Object.isFrozen(DEFAULT_FIRST_PARTY_VENDOR)).toBe(true);
    });
  });

  describe("Vendor State Inspection (inspectFirstPartyVendorState)", () => {
    it("detects clean state when no first-party vendor and no slug collision exist", async () => {
      const mockVendor = createMockVendorModel({ firstPartyList: [], slugMatchList: [] });

      const state = await inspectFirstPartyVendorState({
        vendorModel: mockVendor,
        proposedSlug: "commerceflow-retail",
      });

      expect(state.status).toBe("NONE_FOUND");
      expect(state.message).toContain("available for bootstrapping");
      expect(mockVendor.find).toHaveBeenCalledTimes(2);
      expect(mockVendor.create).not.toHaveBeenCalled();
    });

    it("detects existing matching first-party vendor and returns its identity without writing", async () => {
      const existingVendor = {
        _id: "vendor_fp_001",
        name: "CommerceFlow Retail",
        slug: "commerceflow-retail",
        status: "active",
        isFirstParty: true,
      };

      const mockVendor = createMockVendorModel({
        firstPartyList: [existingVendor],
        slugMatchList: [existingVendor],
      });

      const state = await inspectFirstPartyVendorState({
        vendorModel: mockVendor,
        proposedSlug: "commerceflow-retail",
        proposedName: "CommerceFlow Retail",
        proposedStatus: "active",
      });

      expect(state.status).toBe("EXISTS");
      expect(state.vendor).toEqual(existingVendor);
      expect(state.mismatches).toEqual([]);
      expect(state.message).toContain("First-party vendor already exists and matches proposed identity");
      expect(mockVendor.create).not.toHaveBeenCalled();
    });

    it("detects identity mismatch when existing first-party vendor name differs", async () => {
      const existingVendor = {
        _id: "vendor_fp_002",
        name: "Legacy Platform Store",
        slug: "commerceflow-retail",
        status: "active",
        isFirstParty: true,
      };

      const mockVendor = createMockVendorModel({
        firstPartyList: [existingVendor],
        slugMatchList: [existingVendor],
      });

      const state = await inspectFirstPartyVendorState({
        vendorModel: mockVendor,
        proposedSlug: "commerceflow-retail",
        proposedName: "CommerceFlow Retail",
        proposedStatus: "active",
      });

      expect(state.status).toBe("EXISTS_MISMATCH");
      expect(state.vendor).toEqual(existingVendor);
      expect(state.mismatches).toEqual([
        { field: "name", expected: "CommerceFlow Retail", actual: "Legacy Platform Store" },
      ]);
      expect(state.message).toContain("identity mismatches: name");
      expect(mockVendor.create).not.toHaveBeenCalled();
    });

    it("detects identity mismatch when existing first-party vendor slug differs", async () => {
      const existingVendor = {
        _id: "vendor_fp_003",
        name: "CommerceFlow Retail",
        slug: "platform-store-legacy",
        status: "active",
        isFirstParty: true,
      };

      const mockVendor = createMockVendorModel({
        firstPartyList: [existingVendor],
        slugMatchList: [],
      });

      const state = await inspectFirstPartyVendorState({
        vendorModel: mockVendor,
        proposedSlug: "commerceflow-retail",
        proposedName: "CommerceFlow Retail",
        proposedStatus: "active",
      });

      expect(state.status).toBe("EXISTS_MISMATCH");
      expect(state.vendor).toEqual(existingVendor);
      expect(state.mismatches).toEqual([
        { field: "slug", expected: "commerceflow-retail", actual: "platform-store-legacy" },
      ]);
      expect(state.message).toContain("identity mismatches: slug");
      expect(mockVendor.create).not.toHaveBeenCalled();
    });

    it("detects identity mismatch when existing first-party vendor status is non-active (e.g. suspended)", async () => {
      const existingVendor = {
        _id: "vendor_fp_004",
        name: "CommerceFlow Retail",
        slug: "commerceflow-retail",
        status: "suspended",
        isFirstParty: true,
      };

      const mockVendor = createMockVendorModel({
        firstPartyList: [existingVendor],
        slugMatchList: [existingVendor],
      });

      const state = await inspectFirstPartyVendorState({
        vendorModel: mockVendor,
        proposedSlug: "commerceflow-retail",
        proposedName: "CommerceFlow Retail",
        proposedStatus: "active",
      });

      expect(state.status).toBe("EXISTS_MISMATCH");
      expect(state.vendor).toEqual(existingVendor);
      expect(state.mismatches).toEqual([
        { field: "status", expected: "active", actual: "suspended" },
      ]);
      expect(state.message).toContain("identity mismatches: status");
      expect(mockVendor.create).not.toHaveBeenCalled();
    });

    it("detects multiple simultaneous identity mismatches (name, slug, and status all differ)", async () => {
      const existingVendor = {
        _id: "vendor_fp_005",
        name: "Old Retail Depot",
        slug: "old-depot",
        status: "pending",
        isFirstParty: true,
      };

      const mockVendor = createMockVendorModel({
        firstPartyList: [existingVendor],
        slugMatchList: [],
      });

      const state = await inspectFirstPartyVendorState({
        vendorModel: mockVendor,
        proposedSlug: "commerceflow-retail",
        proposedName: "CommerceFlow Retail",
        proposedStatus: "active",
      });

      expect(state.status).toBe("EXISTS_MISMATCH");
      expect(state.vendor).toEqual(existingVendor);
      expect(state.mismatches).toHaveLength(3);
      expect(state.mismatches).toEqual([
        { field: "name", expected: "CommerceFlow Retail", actual: "Old Retail Depot" },
        { field: "slug", expected: "commerceflow-retail", actual: "old-depot" },
        { field: "status", expected: "active", actual: "pending" },
      ]);
      expect(state.message).toContain("identity mismatches");
      expect(mockVendor.create).not.toHaveBeenCalled();
    });

    it("detects and flags ambiguous state when multiple first-party vendors exist", async () => {
      const vendorA = { _id: "fp_1", name: "Store A", slug: "store-a", isFirstParty: true };
      const vendorB = { _id: "fp_2", name: "Store B", slug: "store-b", isFirstParty: true };

      const mockVendor = createMockVendorModel({
        firstPartyList: [vendorA, vendorB],
        slugMatchList: [],
      });

      const state = await inspectFirstPartyVendorState({
        vendorModel: mockVendor,
        proposedSlug: "commerceflow-retail",
      });

      expect(state.status).toBe("AMBIGUOUS_MULTIPLE_FIRST_PARTY");
      expect(state.vendors).toHaveLength(2);
      expect(state.message).toContain("Ambiguity detected: Multiple (2) vendors");
      expect(mockVendor.create).not.toHaveBeenCalled();
    });

    it("detects slug conflict when a non-first-party vendor already owns the slug", async () => {
      const thirdPartyVendor = {
        _id: "tp_99",
        name: "Third Party Retailer",
        slug: "commerceflow-retail",
        isFirstParty: false,
      };

      const mockVendor = createMockVendorModel({
        firstPartyList: [],
        slugMatchList: [thirdPartyVendor],
      });

      const state = await inspectFirstPartyVendorState({
        vendorModel: mockVendor,
        proposedSlug: "commerceflow-retail",
      });

      expect(state.status).toBe("SLUG_CONFLICT");
      expect(state.conflictVendor).toEqual(thirdPartyVendor);
      expect(state.message).toContain("Conflict detected: A vendor with slug");
      expect(mockVendor.create).not.toHaveBeenCalled();
    });
  });

  describe("Safety Enforcement & CLI Argument Guards (executeBootstrap)", () => {
    it("refuses to connect without the intentional '--run' flag (dry-run guard)", async () => {
      const connectFn = vi.fn();
      const disconnectFn = vi.fn();
      const logger = { error: vi.fn(), log: vi.fn() };
      const mockVendor = createMockVendorModel();

      const result = await executeBootstrap({
        argv: [], // No --run flag
        connectFn,
        disconnectFn,
        logger,
        vendorModel: mockVendor,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toBe("DRY_RUN_NO_RUN_FLAG");
      expect(result.exitCode).toBe(1);

      // Must never have attempted connection or write
      expect(connectFn).not.toHaveBeenCalled();
      expect(disconnectFn).not.toHaveBeenCalled();
      expect(mockVendor.create).not.toHaveBeenCalled();

      const errorText = logger.error.mock.calls.flat().join(" ");
      expect(errorText).toContain("EXECUTION HALTED (DRY-RUN MODE)");
      expect(errorText).toContain("'--run' flag is required");
      expect(errorText).toContain("CommerceFlow Retail");
    });

    it("refuses to connect when targeting a production environment (NODE_ENV=production)", async () => {
      const connectFn = vi.fn();
      const disconnectFn = vi.fn();
      const logger = { error: vi.fn(), log: vi.fn() };

      const result = await executeBootstrap({
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
      expect(connectFn).not.toHaveBeenCalled();

      const errorText = logger.error.mock.calls.flat().join(" ");
      expect(errorText).toContain("Production administrative mutations are strictly forbidden");
    });

    it("refuses to connect when database name indicates production", async () => {
      const connectFn = vi.fn();
      const disconnectFn = vi.fn();
      const logger = { error: vi.fn(), log: vi.fn() };

      const result = await executeBootstrap({
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

      const errorText = logger.error.mock.calls.flat().join(" ");
      expect(errorText).toContain("indicates a production database");
    });

    it("refuses to connect to remote targets without staging override and confirmation", async () => {
      const connectFn = vi.fn();
      const disconnectFn = vi.fn();
      const logger = { error: vi.fn(), log: vi.fn() };

      const result = await executeBootstrap({
        argv: ["--run"],
        env: {
          NODE_ENV: "staging",
          MONGODB_URI: "mongodb+srv://user:pass@cluster.mongodb.net/commerceflow_staging",
          // Missing ALLOW_STAGING_VENDOR_BOOTSTRAP and CONFIRM_TARGET_DB
        },
        connectFn,
        disconnectFn,
        logger,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toBe("TARGET_VERIFICATION_FAILED");
      expect(result.exitCode).toBe(1);
      expect(connectFn).not.toHaveBeenCalled();

      const errorText = logger.error.mock.calls.flat().join(" ");
      expect(errorText).toContain("ALLOW_STAGING_VENDOR_BOOTSTRAP=true");
    });

    it("never logs raw credentials or sensitive URIs", async () => {
      const connectFn = vi.fn();
      const logger = { error: vi.fn(), log: vi.fn() };

      const secretPassword = "super_secret_bootstrap_password_987!";
      const sensitiveUri = `mongodb+srv://admin:${secretPassword}@cluster.mongodb.net/production_db`;

      await executeBootstrap({
        argv: ["--run"],
        env: {
          NODE_ENV: "development",
          MONGODB_URI: sensitiveUri,
        },
        connectFn,
        logger,
      });

      const allLoggedText = logger.error.mock.calls.flat().join(" ");
      expect(allLoggedText).not.toContain(secretPassword);
      expect(allLoggedText).not.toContain(sensitiveUri);
    });
  });

  describe("State Handling on Verified Target", () => {
    it("reports ambiguity and exits with code 1 if multiple first-party vendors exist", async () => {
      const connectFn = vi.fn(async () => {});
      const disconnectFn = vi.fn(async () => {});
      const logger = { error: vi.fn(), log: vi.fn() };

      const v1 = { _id: "fp_1", name: "Store 1", slug: "store-1", isFirstParty: true, status: "active" };
      const v2 = { _id: "fp_2", name: "Store 2", slug: "store-2", isFirstParty: true, status: "active" };
      const mockVendor = createMockVendorModel({ firstPartyList: [v1, v2] });

      const result = await executeBootstrap({
        argv: ["--run"],
        env: {
          NODE_ENV: "development",
          MONGODB_URI: "mongodb://127.0.0.1:27017/commerceflow_dev",
        },
        connectFn,
        disconnectFn,
        logger,
        vendorModel: mockVendor,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toBe("AMBIGUOUS_MULTIPLE_FIRST_PARTY");
      expect(result.exitCode).toBe(1);
      expect(connectFn).toHaveBeenCalledTimes(1);
      expect(disconnectFn).toHaveBeenCalledTimes(1);
      expect(mockVendor.create).not.toHaveBeenCalled();

      const errorText = logger.error.mock.calls.flat().join(" ");
      expect(errorText).toContain("AMBIGUITY DETECTED (BLOCKED)");
      expect(errorText).toContain("fp_1");
      expect(errorText).toContain("fp_2");
    });

    it("detects existing matching first-party vendor, logs sanitized details, and does NOT mutate", async () => {
      const connectFn = vi.fn(async () => {});
      const disconnectFn = vi.fn(async () => {});
      const logger = { error: vi.fn(), log: vi.fn() };

      const existingVendor = {
        _id: "fp_established_999",
        name: "CommerceFlow Retail",
        slug: "commerceflow-retail",
        status: "active",
        isFirstParty: true,
      };
      const mockVendor = createMockVendorModel({
        firstPartyList: [existingVendor],
        slugMatchList: [existingVendor],
      });

      const result = await executeBootstrap({
        argv: ["--run"],
        env: {
          NODE_ENV: "development",
          MONGODB_URI: "mongodb://127.0.0.1:27017/commerceflow_dev",
        },
        connectFn,
        disconnectFn,
        logger,
        vendorModel: mockVendor,
      });

      expect(result.success).toBe(true);
      expect(result.reason).toBe("ALREADY_EXISTS");
      expect(result.exitCode).toBe(0);
      expect(result.vendor).toEqual(existingVendor);
      expect(connectFn).toHaveBeenCalledTimes(1);
      expect(disconnectFn).toHaveBeenCalledTimes(1);
      expect(mockVendor.create).not.toHaveBeenCalled();

      const logText = logger.log.mock.calls.flat().join(" ");
      expect(logText).toContain("ALREADY CONFIGURED (IDEMPOTENT NO-OP)");
      expect(logText).toContain("fp_established_999");
    });

    it("halts with EXISTS_MISMATCH when existing first-party vendor name differs (zero writes)", async () => {
      const connectFn = vi.fn(async () => {});
      const disconnectFn = vi.fn(async () => {});
      const logger = { error: vi.fn(), log: vi.fn() };

      const mismatchedVendor = {
        _id: "fp_diff_name_101",
        name: "Legacy Platform Enterprise",
        slug: "commerceflow-retail",
        status: "active",
        isFirstParty: true,
      };
      const mockVendor = createMockVendorModel({
        firstPartyList: [mismatchedVendor],
        slugMatchList: [mismatchedVendor],
      });

      const result = await executeBootstrap({
        argv: ["--run"],
        env: {
          NODE_ENV: "development",
          MONGODB_URI: "mongodb://127.0.0.1:27017/commerceflow_dev",
        },
        connectFn,
        disconnectFn,
        logger,
        vendorModel: mockVendor,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toBe("EXISTS_MISMATCH");
      expect(result.exitCode).toBe(1);
      expect(result.vendor).toEqual(mismatchedVendor);
      expect(result.mismatches).toEqual([
        { field: "name", expected: "CommerceFlow Retail", actual: "Legacy Platform Enterprise" },
      ]);
      expect(connectFn).toHaveBeenCalledTimes(1);
      expect(disconnectFn).toHaveBeenCalledTimes(1);
      expect(mockVendor.create).not.toHaveBeenCalled();

      const errorText = logger.error.mock.calls.flat().join(" ");
      expect(errorText).toContain("IDENTITY MISMATCH DETECTED (MANUAL REVIEW REQUIRED)");
      expect(errorText).toContain("fp_diff_name_101");
      expect(errorText).toContain("Legacy Platform Enterprise");
    });

    it("halts with EXISTS_MISMATCH when existing first-party vendor slug differs (zero writes)", async () => {
      const connectFn = vi.fn(async () => {});
      const disconnectFn = vi.fn(async () => {});
      const logger = { error: vi.fn(), log: vi.fn() };

      const mismatchedVendor = {
        _id: "fp_diff_slug_102",
        name: "CommerceFlow Retail",
        slug: "old-retail-slug",
        status: "active",
        isFirstParty: true,
      };
      const mockVendor = createMockVendorModel({
        firstPartyList: [mismatchedVendor],
        slugMatchList: [],
      });

      const result = await executeBootstrap({
        argv: ["--run"],
        env: {
          NODE_ENV: "development",
          MONGODB_URI: "mongodb://127.0.0.1:27017/commerceflow_dev",
        },
        connectFn,
        disconnectFn,
        logger,
        vendorModel: mockVendor,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toBe("EXISTS_MISMATCH");
      expect(result.exitCode).toBe(1);
      expect(result.vendor).toEqual(mismatchedVendor);
      expect(result.mismatches).toEqual([
        { field: "slug", expected: "commerceflow-retail", actual: "old-retail-slug" },
      ]);
      expect(connectFn).toHaveBeenCalledTimes(1);
      expect(disconnectFn).toHaveBeenCalledTimes(1);
      expect(mockVendor.create).not.toHaveBeenCalled();

      const errorText = logger.error.mock.calls.flat().join(" ");
      expect(errorText).toContain("IDENTITY MISMATCH DETECTED (MANUAL REVIEW REQUIRED)");
      expect(errorText).toContain("old-retail-slug");
    });

    it("halts with EXISTS_MISMATCH when existing first-party vendor status is non-active (zero writes)", async () => {
      const connectFn = vi.fn(async () => {});
      const disconnectFn = vi.fn(async () => {});
      const logger = { error: vi.fn(), log: vi.fn() };

      const mismatchedVendor = {
        _id: "fp_diff_status_103",
        name: "CommerceFlow Retail",
        slug: "commerceflow-retail",
        status: "suspended",
        isFirstParty: true,
      };
      const mockVendor = createMockVendorModel({
        firstPartyList: [mismatchedVendor],
        slugMatchList: [mismatchedVendor],
      });

      const result = await executeBootstrap({
        argv: ["--run"],
        env: {
          NODE_ENV: "development",
          MONGODB_URI: "mongodb://127.0.0.1:27017/commerceflow_dev",
        },
        connectFn,
        disconnectFn,
        logger,
        vendorModel: mockVendor,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toBe("EXISTS_MISMATCH");
      expect(result.exitCode).toBe(1);
      expect(result.vendor).toEqual(mismatchedVendor);
      expect(result.mismatches).toEqual([
        { field: "status", expected: "active", actual: "suspended" },
      ]);
      expect(connectFn).toHaveBeenCalledTimes(1);
      expect(disconnectFn).toHaveBeenCalledTimes(1);
      expect(mockVendor.create).not.toHaveBeenCalled();

      const errorText = logger.error.mock.calls.flat().join(" ");
      expect(errorText).toContain("IDENTITY MISMATCH DETECTED (MANUAL REVIEW REQUIRED)");
      expect(errorText).toContain("suspended");
    });

    it("halts with EXISTS_MISMATCH when multiple fields differ simultaneously (zero writes)", async () => {
      const connectFn = vi.fn(async () => {});
      const disconnectFn = vi.fn(async () => {});
      const logger = { error: vi.fn(), log: vi.fn() };

      const mismatchedVendor = {
        _id: "fp_diff_all_104",
        name: "Old Outpost",
        slug: "old-outpost",
        status: "pending",
        isFirstParty: true,
      };
      const mockVendor = createMockVendorModel({
        firstPartyList: [mismatchedVendor],
        slugMatchList: [],
      });

      const result = await executeBootstrap({
        argv: ["--run"],
        env: {
          NODE_ENV: "development",
          MONGODB_URI: "mongodb://127.0.0.1:27017/commerceflow_dev",
        },
        connectFn,
        disconnectFn,
        logger,
        vendorModel: mockVendor,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toBe("EXISTS_MISMATCH");
      expect(result.exitCode).toBe(1);
      expect(result.vendor).toEqual(mismatchedVendor);
      expect(result.mismatches).toHaveLength(3);
      expect(connectFn).toHaveBeenCalledTimes(1);
      expect(disconnectFn).toHaveBeenCalledTimes(1);
      expect(mockVendor.create).not.toHaveBeenCalled();

      const errorText = logger.error.mock.calls.flat().join(" ");
      expect(errorText).toContain("IDENTITY MISMATCH DETECTED (MANUAL REVIEW REQUIRED)");
      expect(errorText).toContain("Old Outpost");
    });

    it("strictly verifies zero writes/mutations in every existing-vendor case", async () => {
      const connectFn = vi.fn(async () => {});
      const disconnectFn = vi.fn(async () => {});
      const logger = { error: vi.fn(), log: vi.fn() };

      const scenarios = [
        { name: "CommerceFlow Retail", slug: "commerceflow-retail", status: "active", isFirstParty: true },
        { name: "Different Name", slug: "commerceflow-retail", status: "active", isFirstParty: true },
        { name: "CommerceFlow Retail", slug: "diff-slug", status: "active", isFirstParty: true },
        { name: "CommerceFlow Retail", slug: "commerceflow-retail", status: "suspended", isFirstParty: true },
        { name: "All Different", slug: "all-diff", status: "pending", isFirstParty: true },
      ];

      for (const scenario of scenarios) {
        const mockVendor = createMockVendorModel({
          firstPartyList: [scenario],
          slugMatchList: [scenario],
        });

        await executeBootstrap({
          argv: ["--run"],
          env: {
            NODE_ENV: "development",
            MONGODB_URI: "mongodb://127.0.0.1:27017/commerceflow_dev",
          },
          connectFn,
          disconnectFn,
          logger,
          vendorModel: mockVendor,
        });

        // Absolutely zero mutation methods invoked
        expect(mockVendor.create).not.toHaveBeenCalled();
        expect(mockVendor.updateOne).not.toHaveBeenCalled();
        expect(mockVendor.updateMany).not.toHaveBeenCalled();
        expect(mockVendor.deleteOne).not.toHaveBeenCalled();
        expect(mockVendor.deleteMany).not.toHaveBeenCalled();
      }
    });

    it("stops and reports conflict if proposed slug is already taken by a third-party vendor", async () => {
      const connectFn = vi.fn(async () => {});
      const disconnectFn = vi.fn(async () => {});
      const logger = { error: vi.fn(), log: vi.fn() };

      const thirdPartyVendor = {
        _id: "tp_collision_888",
        name: "Other Seller",
        slug: "commerceflow-retail",
        status: "active",
        isFirstParty: false,
      };
      const mockVendor = createMockVendorModel({
        firstPartyList: [],
        slugMatchList: [thirdPartyVendor],
      });

      const result = await executeBootstrap({
        argv: ["--run"],
        env: {
          NODE_ENV: "development",
          MONGODB_URI: "mongodb://127.0.0.1:27017/commerceflow_dev",
        },
        connectFn,
        disconnectFn,
        logger,
        vendorModel: mockVendor,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toBe("SLUG_CONFLICT");
      expect(result.exitCode).toBe(1);
      expect(connectFn).toHaveBeenCalledTimes(1);
      expect(disconnectFn).toHaveBeenCalledTimes(1);
      expect(mockVendor.create).not.toHaveBeenCalled();

      const errorText = logger.error.mock.calls.flat().join(" ");
      expect(errorText).toContain("SLUG CONFLICT DETECTED (BLOCKED)");
      expect(errorText).toContain("tp_collision_888");
    });

    it("in connected dry-run mode (--run --dry-run), inspects and reports proposed vendor without writing", async () => {
      const connectFn = vi.fn(async () => {});
      const disconnectFn = vi.fn(async () => {});
      const logger = { error: vi.fn(), log: vi.fn() };

      const mockVendor = createMockVendorModel({ firstPartyList: [], slugMatchList: [] });

      const result = await executeBootstrap({
        argv: ["--run", "--dry-run"],
        env: {
          NODE_ENV: "development",
          MONGODB_URI: "mongodb://127.0.0.1:27017/commerceflow_dev",
        },
        connectFn,
        disconnectFn,
        logger,
        vendorModel: mockVendor,
      });

      expect(result.success).toBe(true);
      expect(result.reason).toBe("DRY_RUN_PROPOSED_REPORTED");
      expect(result.exitCode).toBe(0);
      expect(connectFn).toHaveBeenCalledTimes(1);
      expect(disconnectFn).toHaveBeenCalledTimes(1);
      expect(mockVendor.create).not.toHaveBeenCalled();

      const logText = logger.log.mock.calls.flat().join(" ");
      expect(logText).toContain("CONNECTED DRY-RUN REPORT");
      expect(logText).toContain("NO vendor document was created");
      expect(logText).toContain("CommerceFlow Retail");
    });

    it("provisions the first-party vendor when verified target is clean and --run is provided", async () => {
      const connectFn = vi.fn(async () => {});
      const disconnectFn = vi.fn(async () => {});
      const logger = { error: vi.fn(), log: vi.fn() };

      const createSpy = vi.fn(async (doc) => ({
        _id: "new_fp_vendor_id_555",
        ...doc,
      }));

      const mockVendor = createMockVendorModel({
        firstPartyList: [],
        slugMatchList: [],
        createFn: createSpy,
      });

      const result = await executeBootstrap({
        argv: ["--run"],
        env: {
          NODE_ENV: "development",
          MONGODB_URI: "mongodb://127.0.0.1:27017/commerceflow_dev",
        },
        connectFn,
        disconnectFn,
        logger,
        vendorModel: mockVendor,
      });

      expect(result.success).toBe(true);
      expect(result.reason).toBe("BOOTSTRAPPED_SUCCESSFULLY");
      expect(result.exitCode).toBe(0);
      expect(result.vendor._id).toBe("new_fp_vendor_id_555");
      expect(createSpy).toHaveBeenCalledTimes(1);
      expect(createSpy).toHaveBeenCalledWith({
        name: "CommerceFlow Retail",
        slug: "commerceflow-retail",
        status: "active",
        isFirstParty: true,
      });
      expect(connectFn).toHaveBeenCalledTimes(1);
      expect(disconnectFn).toHaveBeenCalledTimes(1);

      const logText = logger.log.mock.calls.flat().join(" ");
      expect(logText).toContain("SUCCESSFULLY CREATED");
      expect(logText).toContain("new_fp_vendor_id_555");
    });

    it("handles connection or query errors gracefully, disconnects, and exits with code 1", async () => {
      const connectFn = vi.fn(async () => {});
      const disconnectFn = vi.fn(async () => {});
      const logger = { error: vi.fn(), log: vi.fn() };

      const failingVendorModel = {
        find: vi.fn().mockRejectedValue(new Error("Database connection dropped")),
      };

      const result = await executeBootstrap({
        argv: ["--run"],
        env: {
          NODE_ENV: "development",
          MONGODB_URI: "mongodb://127.0.0.1:27017/commerceflow_dev",
        },
        connectFn,
        disconnectFn,
        logger,
        vendorModel: failingVendorModel,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toBe("EXECUTION_ERROR");
      expect(result.exitCode).toBe(1);
      expect(disconnectFn).toHaveBeenCalledTimes(1);

      const errorText = logger.error.mock.calls.flat().join(" ");
      expect(errorText).toContain("Bootstrap execution failed with error: Database connection dropped");
    });
  });

  describe("CLI Subprocess Execution (Dry-Run Guard)", () => {
    it("exits with status 1 and halts execution when invoked directly without '--run'", async () => {
      const scriptPath = path.resolve(__dirname, "bootstrap-first-party-vendor.js");

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
      expect(stderr).toContain("CommerceFlow Retail");
    });
  });
});
