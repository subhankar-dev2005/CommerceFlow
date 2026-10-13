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

    it("parses remote MongoDB SRV URI, flags as non-local, and masks credentials", () => {
      const target = parseMongoTarget(
        "mongodb+srv://admin_user:SuperSecretPassword123@cluster0.abcde.mongodb.net/production_db?retryWrites=true"
      );
      expect(target.host).toBe("cluster0.abcde.mongodb.net");
      expect(target.database).toBe("production_db");
      expect(target.isLocal).toBe(false);
      expect(target.sanitizedUri).not.toContain("SuperSecretPassword123");
      expect(target.sanitizedUri).toContain("admin_user:****@");
    });

    it("handles empty or invalid URI safely without throwing", () => {
      const emptyTarget = parseMongoTarget("");
      expect(emptyTarget.isLocal).toBe(false);
      expect(emptyTarget.host).toBe("none");

      const invalidTarget = parseMongoTarget("not-a-valid-uri");
      expect(invalidTarget.isLocal).toBe(false);
    });
  });

  describe("verifyDatabaseTarget Fail-Closed Safety Verification", () => {
    const localUri = "mongodb://127.0.0.1:27017/commerceflow";
    const remoteUri = "mongodb+srv://admin:pass@remote-cluster.mongodb.net/commerceflow";
    const remoteIpUri = "mongodb://192.168.1.100:27017/commerceflow";

    it("A. allows local development MongoDB without override", () => {
      const result = verifyDatabaseTarget({
        mongoUri: localUri,
        nodeEnv: "development",
        overrideEnvVar: "ALLOW_PRODUCTION_ADMIN_PROMOTION",
      });
      expect(result.allowed).toBe(true);
      expect(result.isProductionOverride).toBe(false);
    });

    it("B. allows NODE_ENV=development with local MongoDB", () => {
      const result = verifyDatabaseTarget({
        mongoUri: "mongodb://localhost:27017/commerceflow",
        nodeEnv: "development",
        overrideEnvVar: "ALLOW_PRODUCTION_ADMIN_PROMOTION",
      });
      expect(result.allowed).toBe(true);
      expect(result.environment).toBe("development");
    });

    it("C. blocks NODE_ENV=production with local MongoDB unless override is supplied", () => {
      const blockedResult = verifyDatabaseTarget({
        mongoUri: localUri,
        nodeEnv: "production",
        overrideEnvVar: "ALLOW_PRODUCTION_ADMIN_PROMOTION",
        overrideValue: undefined,
      });
      expect(blockedResult.allowed).toBe(false);
      expect(blockedResult.reason).toContain('NODE_ENV is set to "production"');

      // With explicit override
      const allowedResult = verifyDatabaseTarget({
        mongoUri: localUri,
        nodeEnv: "production",
        overrideEnvVar: "ALLOW_PRODUCTION_ADMIN_PROMOTION",
        overrideValue: "true",
      });
      expect(allowedResult.allowed).toBe(true);
      expect(allowedResult.isProductionOverride).toBe(true);
    });

    it("D. MUST be blocked when NODE_ENV is missing/empty and target is remote MongoDB", () => {
      const resultEmpty = verifyDatabaseTarget({
        mongoUri: remoteUri,
        nodeEnv: "",
        overrideEnvVar: "ALLOW_PRODUCTION_ADMIN_PROMOTION",
        overrideValue: undefined,
      });
      expect(resultEmpty.allowed).toBe(false);
      expect(resultEmpty.reason).toContain("not a recognized local development target");

      const resultUndefined = verifyDatabaseTarget({
        mongoUri: remoteIpUri,
        nodeEnv: undefined,
        overrideEnvVar: "ALLOW_PRODUCTION_ADMIN_CREATION",
        overrideValue: undefined,
      });
      expect(resultUndefined.allowed).toBe(false);
      expect(resultUndefined.reason).toContain("not a recognized local development target");
    });

    it("E. allows local MongoDB when NODE_ENV is missing/empty (inferred local dev)", () => {
      const result = verifyDatabaseTarget({
        mongoUri: localUri,
        nodeEnv: "",
        overrideEnvVar: "ALLOW_PRODUCTION_ADMIN_PROMOTION",
      });
      expect(result.allowed).toBe(true);
      expect(result.environment).toBe("development (inferred local)");
    });

    it("allows remote target ONLY when explicit override is provided", () => {
      const result = verifyDatabaseTarget({
        mongoUri: remoteUri,
        nodeEnv: "production",
        overrideEnvVar: "ALLOW_PRODUCTION_ADMIN_PROMOTION",
        overrideValue: "true",
      });
      expect(result.allowed).toBe(true);
      expect(result.isProductionOverride).toBe(true);
    });
  });
});
