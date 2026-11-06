import { describe, it, expect } from "vitest";
import { parseMongoTarget, verifyDatabaseTarget } from "./safety-helper.js";

describe("Admin Bootstrap Database Target & Safety Helper Tests", () => {
  describe("parseMongoTarget URI Sanitization & Host Parsing", () => {
    it("parses local loopback URI and correctly identifies it as local", () => {
      const target = parseMongoTarget("mongodb://127.0.0.1:27017/commerceflow");
      expect(target.host).toBe("127.0.0.1");
      expect(target.database).toBe("commerceflow");
      expect(target.isLocal).toBe(true);
      expect(target.sanitizedUri).toBe("mongodb://127.0.0.1:27017/commerceflow");
    });

    it("parses localhost URI and correctly identifies it as local", () => {
      const target = parseMongoTarget("mongodb://localhost:27017/commerceflow_dev");
      expect(target.host).toBe("localhost");
      expect(target.database).toBe("commerceflow_dev");
      expect(target.isLocal).toBe(true);
    });

    it("parses IPv6 loopback URI and identifies it as local", () => {
      const targetBracketed = parseMongoTarget("mongodb://[::1]:27017/commerceflow_dev");
      expect(targetBracketed.host).toBe("::1");
      expect(targetBracketed.database).toBe("commerceflow_dev");
      expect(targetBracketed.isLocal).toBe(true);

      const targetRaw = parseMongoTarget("mongodb://::1:27017/commerceflow_dev");
      expect(targetRaw.isLocal).toBe(true);
    });

    it("parses remote IPv6 host and flags as non-local", () => {
      const target = parseMongoTarget("mongodb://[2001:db8::1]:27017/commerceflow_staging");
      expect(target.host).toBe("2001:db8::1");
      expect(target.database).toBe("commerceflow_staging");
      expect(target.isLocal).toBe(false);
    });

    it("parses remote MongoDB SRV URI, flags as non-local, and masks credentials", () => {
      const target = parseMongoTarget(
        "mongodb+srv://admin_user:SuperSecretPassword123@cluster0.abcde.mongodb.net/staging_db?retryWrites=true"
      );
      expect(target.host).toBe("cluster0.abcde.mongodb.net");
      expect(target.database).toBe("staging_db");
      expect(target.isLocal).toBe(false);
      expect(target.sanitizedUri).not.toContain("SuperSecretPassword123");
      expect(target.sanitizedUri).not.toContain("admin_user");
      expect(target.sanitizedUri).toContain("****:****@");
    });

    it("parses multi-host replica set URIs safely", () => {
      const remoteRepl = parseMongoTarget(
        "mongodb://host1:27017,host2:27017/staging_db?replicaSet=rs0"
      );
      expect(remoteRepl.host).toBe("host1,host2");
      expect(remoteRepl.database).toBe("staging_db");
      expect(remoteRepl.isLocal).toBe(false);

      const localRepl = parseMongoTarget(
        "mongodb://127.0.0.1:27017,localhost:27018/dev_db"
      );
      expect(localRepl.isLocal).toBe(true);
      expect(localRepl.database).toBe("dev_db");
    });

    it("handles query parameters correctly when extracting database name", () => {
      const target = parseMongoTarget(
        "mongodb://127.0.0.1:27017/commerceflow_test?authSource=admin&w=majority"
      );
      expect(target.database).toBe("commerceflow_test");
    });

    it("handles empty or invalid URI safely without throwing", () => {
      const emptyTarget = parseMongoTarget("");
      expect(emptyTarget.isLocal).toBe(false);
      expect(emptyTarget.host).toBe("none");
      expect(emptyTarget.database).toBe("none");

      const invalidTarget = parseMongoTarget("not-a-valid-uri");
      expect(invalidTarget.isLocal).toBe(false);
      expect(invalidTarget.host).toBe("unparseable");
      expect(invalidTarget.database).toBe("unknown");

      const invalidScheme = parseMongoTarget("http://127.0.0.1:27017/db");
      expect(invalidScheme.isLocal).toBe(false);
      expect(invalidScheme.host).toBe("unparseable");
    });
  });

  describe("verifyDatabaseTarget Fail-Closed Safety Verification", () => {
    const localUri = "mongodb://127.0.0.1:27017/commerceflow";
    const remoteStagingUri = "mongodb+srv://admin:pass@remote-cluster.mongodb.net/commerceflow_staging";
    const remoteProdUri = "mongodb+srv://admin:pass@remote-cluster.mongodb.net/commerceflow_production";
    const remoteIpUri = "mongodb://192.168.1.100:27017/commerceflow_staging";

    it("allows local development MongoDB without override", () => {
      const resultDev = verifyDatabaseTarget({
        mongoUri: localUri,
        nodeEnv: "development",
      });
      expect(resultDev.allowed).toBe(true);
      expect(resultDev.isProductionOverride).toBe(false);
      expect(resultDev.isStagingOverride).toBe(false);

      const resultEmpty = verifyDatabaseTarget({
        mongoUri: localUri,
        nodeEnv: "",
      });
      expect(resultEmpty.allowed).toBe(true);
      expect(resultEmpty.environment).toBe("development (inferred local)");

      const resultUndefined = verifyDatabaseTarget({
        mongoUri: "mongodb://localhost:27017/commerceflow_dev",
        nodeEnv: undefined,
      });
      expect(resultUndefined.allowed).toBe(true);
    });

    it("blocks NODE_ENV=production unconditionally (production lockout)", () => {
      // Local target with production env
      const localProdResult = verifyDatabaseTarget({
        mongoUri: localUri,
        nodeEnv: "production",
      });
      expect(localProdResult.allowed).toBe(false);
      expect(localProdResult.reason).toContain('NODE_ENV is set to "production"');

      // Remote target with production env
      const remoteProdResult = verifyDatabaseTarget({
        mongoUri: remoteStagingUri,
        nodeEnv: "production",
      });
      expect(remoteProdResult.allowed).toBe(false);
      expect(remoteProdResult.reason).toContain('NODE_ENV is set to "production"');

      // Attempting to override production with staging flag MUST FAIL
      const stagingOverrideAttempt = verifyDatabaseTarget({
        mongoUri: remoteStagingUri,
        nodeEnv: "production",
        stagingOverrideValue: "true",
        confirmDatabase: "commerceflow_staging",
      });
      expect(stagingOverrideAttempt.allowed).toBe(false);
      expect(stagingOverrideAttempt.reason).toContain('NODE_ENV is set to "production"');

      // Attempting to override production with legacy flag MUST FAIL
      const legacyOverrideAttempt = verifyDatabaseTarget({
        mongoUri: localUri,
        nodeEnv: "production",
        overrideEnvVar: "ALLOW_PRODUCTION_ADMIN_CREATION",
        overrideValue: "true",
      });
      expect(legacyOverrideAttempt.allowed).toBe(false);
      expect(legacyOverrideAttempt.reason).toContain('NODE_ENV is set to "production"');
    });

    it("rejects database names indicating production regardless of environment or confirmation", () => {
      const prodNames = [
        "commerceflow_production",
        "commerceflow_prod",
        "commerceflow-production",
        "commerceflow-prod",
        "prod_database",
        "production",
      ];

      for (const dbName of prodNames) {
        const uri = `mongodb+srv://admin:pass@remote-cluster.mongodb.net/${dbName}`;
        const result = verifyDatabaseTarget({
          mongoUri: uri,
          nodeEnv: "staging",
          stagingOverrideValue: "true",
          confirmDatabase: dbName,
        });
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("indicates a production database");
      }
    });

    it("blocks remote targets when NODE_ENV is not staging", () => {
      const resultDev = verifyDatabaseTarget({
        mongoUri: remoteStagingUri,
        nodeEnv: "development",
        stagingOverrideValue: "true",
        confirmDatabase: "commerceflow_staging",
      });
      expect(resultDev.allowed).toBe(false);
      expect(resultDev.reason).toContain('requires NODE_ENV to be explicitly set to "staging"');

      const resultEmpty = verifyDatabaseTarget({
        mongoUri: remoteStagingUri,
        nodeEnv: "",
        stagingOverrideValue: "true",
        confirmDatabase: "commerceflow_staging",
      });
      expect(resultEmpty.allowed).toBe(false);
      expect(resultEmpty.reason).toContain('requires NODE_ENV to be explicitly set to "staging"');
    });

    it("blocks remote staging target if staging override permission is missing", () => {
      const resultMissing = verifyDatabaseTarget({
        mongoUri: remoteStagingUri,
        nodeEnv: "staging",
        confirmDatabase: "commerceflow_staging",
      });
      expect(resultMissing.allowed).toBe(false);
      expect(resultMissing.reason).toContain("requires explicit staging override permission");

      // Legacy broad override alone MUST NOT authorize remote staging
      const resultLegacy = verifyDatabaseTarget({
        mongoUri: remoteStagingUri,
        nodeEnv: "staging",
        overrideEnvVar: "ALLOW_PRODUCTION_ADMIN_CREATION",
        overrideValue: "true",
        confirmDatabase: "commerceflow_staging",
      });
      expect(resultLegacy.allowed).toBe(false);
      expect(resultLegacy.reason).toContain("requires explicit staging override permission");
    });

    it("blocks remote staging target if database confirmation is missing", () => {
      const result = verifyDatabaseTarget({
        mongoUri: remoteStagingUri,
        nodeEnv: "staging",
        stagingOverrideValue: "true",
        confirmDatabase: "",
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("requires explicit database confirmation via CONFIRM_TARGET_DB");
    });

    it("blocks remote staging target on database confirmation mismatch", () => {
      const result = verifyDatabaseTarget({
        mongoUri: remoteStagingUri,
        nodeEnv: "staging",
        stagingOverrideValue: "true",
        confirmDatabase: "wrong_staging_db",
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Database confirmation mismatch");
    });

    it("blocks remote staging target if URI does not specify an explicit database", () => {
      const noDbUri = "mongodb+srv://admin:pass@remote-cluster.mongodb.net/";
      const result = verifyDatabaseTarget({
        mongoUri: noDbUri,
        nodeEnv: "staging",
        stagingOverrideValue: "true",
        confirmDatabase: "default",
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("URI must include an explicit database name");
    });

    it("allows explicitly confirmed remote staging target", () => {
      const result = verifyDatabaseTarget({
        mongoUri: remoteStagingUri,
        nodeEnv: "staging",
        stagingOverrideValue: "true",
        confirmDatabase: "commerceflow_staging",
      });
      expect(result.allowed).toBe(true);
      expect(result.isStagingOverride).toBe(true);
      expect(result.environment).toBe("staging");
      expect(result.target.host).toBe("remote-cluster.mongodb.net");
      expect(result.target.database).toBe("commerceflow_staging");
    });

    it("fails closed on unparseable or ambiguous targets", () => {
      const result = verifyDatabaseTarget({
        mongoUri: "not-a-mongo-uri",
        nodeEnv: "development",
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Unable to reliably parse target MongoDB");
    });
  });
});
