import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("CI/CD Workflow Configuration & Safety Gates", () => {
  const workflowPath = path.resolve(process.cwd(), ".github/workflows/ci.yml");

  it("workflow file exists in .github/workflows/ci.yml", () => {
    expect(fs.existsSync(workflowPath)).toBe(true);
  });

  it("verifies backend test and security audit steps are present", () => {
    const content = fs.readFileSync(workflowPath, "utf8");

    // Must run backend test
    expect(content).toMatch(/npm test/);
    // Must run npm audit for dependency vulnerability scanning
    expect(content).toMatch(/npm audit/);
  });

  it("verifies backend replica-set provisioning and test environment configuration", () => {
    const content = fs.readFileSync(workflowPath, "utf8");

    // Must provision mongo:7.0 with rs0 replica set
    expect(content).toMatch(/mongo:7\.0\s+--replSet\s+rs0/);
    // Must initiate replica set
    expect(content).toMatch(/rs\.initiate/);
    // Must wait for writable primary readiness
    expect(content).toMatch(/isWritablePrimary === true/);
    // Must enforce CI=true and replica-set MONGODB_URI
    expect(content).toMatch(/CI:\s*true/);
    expect(content).toMatch(/replicaSet=rs0/);
  });
});
