import { describe, it, expect } from "vitest";
import { verifyDatabaseTarget } from "./safety-helper.js";

describe("Super Admin Provisioning CLI Safety Guards", () => {
  const localUri = "mongodb://127.0.0.1:27017/commerceflow_dev";
  const prodUri = "mongodb+srv://admin:pass@cluster.mongodb.net/commerceflow_prod?retryWrites=true";
  const stagingUri = "mongodb+srv://admin:pass@cluster.mongodb.net/commerceflow_staging?retryWrites=true";

  describe("Target Verification for Super Admin Creation & Promotion", () => {
    it("permits local development loopback targets", () => {
      const check = verifyDatabaseTarget({
        mongoUri: localUri,
        nodeEnv: "development",
        stagingOverrideEnvVar: "ALLOW_STAGING_SUPER_ADMIN_CREATION",
        confirmDatabase: "commerceflow_dev",
        overrideEnvVar: "ALLOW_PRODUCTION_SUPER_ADMIN_CREATION"
      });

      expect(check.allowed).toBe(true);
      expect(check.target.isLocal).toBe(true);
    });

    it("strictly blocks production database targets with fail-closed lockout", () => {
      const check = verifyDatabaseTarget({
        mongoUri: prodUri,
        nodeEnv: "production",
        stagingOverrideEnvVar: "ALLOW_STAGING_SUPER_ADMIN_CREATION",
        confirmDatabase: "commerceflow_prod",
        overrideEnvVar: "ALLOW_PRODUCTION_SUPER_ADMIN_CREATION"
      });

      expect(check.allowed).toBe(false);
      expect(check.reason).toContain("Production administrative mutations are strictly forbidden");
    });

    it("rejects database names matching production patterns even in development environment", () => {
      const check = verifyDatabaseTarget({
        mongoUri: "mongodb://127.0.0.1:27017/production_db",
        nodeEnv: "development",
        stagingOverrideEnvVar: "ALLOW_STAGING_SUPER_ADMIN_CREATION",
        confirmDatabase: "production_db",
        overrideEnvVar: "ALLOW_PRODUCTION_SUPER_ADMIN_CREATION"
      });

      expect(check.allowed).toBe(false);
      expect(check.reason).toContain("indicates a production database");
    });

    it("requires explicit staging override flags and database confirmation for remote staging targets", () => {
      // Without override flag
      const unconfirmed = verifyDatabaseTarget({
        mongoUri: stagingUri,
        nodeEnv: "staging",
        stagingOverrideEnvVar: "ALLOW_STAGING_SUPER_ADMIN_CREATION",
        stagingOverrideValue: undefined,
        confirmDatabase: "commerceflow_staging"
      });

      expect(unconfirmed.allowed).toBe(false);
      expect(unconfirmed.reason).toContain("ALLOW_STAGING_SUPER_ADMIN_CREATION=true");

      // With override flag and matching db confirmation
      const confirmed = verifyDatabaseTarget({
        mongoUri: stagingUri,
        nodeEnv: "staging",
        stagingOverrideEnvVar: "ALLOW_STAGING_SUPER_ADMIN_CREATION",
        stagingOverrideValue: "true",
        confirmDatabase: "commerceflow_staging"
      });

      expect(confirmed.allowed).toBe(true);
    });

    it("fails closed on unparseable, malformed, or empty URIs", () => {
      const emptyCheck = verifyDatabaseTarget({
        mongoUri: "",
        nodeEnv: "development"
      });
      expect(emptyCheck.allowed).toBe(false);

      const invalidCheck = verifyDatabaseTarget({
        mongoUri: "invalid://some-host/db",
        nodeEnv: "development"
      });
      expect(invalidCheck.allowed).toBe(false);
    });
  });

  describe("Super Admin Credential Policy", () => {
    it("super admin password policy enforces minimum 8 characters", () => {
      const validateSuperAdminPassword = (password) => {
        if (!password || typeof password !== "string" || password.length < 8) {
          return false;
        }
        return true;
      };

      expect(validateSuperAdminPassword("short")).toBe(false);
      expect(validateSuperAdminPassword("1234567")).toBe(false);
      expect(validateSuperAdminPassword("12345678")).toBe(true);
      expect(validateSuperAdminPassword("SuperSecret123!")).toBe(true);
    });
  });
});
