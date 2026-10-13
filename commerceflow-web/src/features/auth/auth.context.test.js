/**
 * Phase 3: Auth Context Cookie Migration Tests
 *
 * Verifies the cookie-based authentication contract in the frontend:
 * - No JWT is stored in React state
 * - No JWT is stored in localStorage
 * - No JWT is returned or consumed from login response
 * - AuthContext drives state from server session check (cookie-based)
 * - Logout calls the backend logout endpoint (not localStorage)
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

// ── Minimal mock for the auth service ────────────────────────────────────────
// We test auth.context behaviour by directly importing and inspecting the
// service module shape — we cannot render React in node:test without jsdom.
// These tests validate the CONTRACT (function signatures, no-token-in-payload)
// rather than React rendering.

import authService from "./auth.service.js";

// ── Verify auth.service.js contract ──────────────────────────────────────────

describe("auth.service.js — Phase 3 cookie contract", () => {
  it("loginUser function is exported", () => {
    assert.strictEqual(typeof authService.loginUser, "function", "loginUser must be exported");
  });

  it("logoutUser function is exported (required for cookie clearing)", () => {
    assert.strictEqual(typeof authService.logoutUser, "function", "logoutUser must be exported");
  });

  it("getCurrentUser function is exported (cookie session check)", () => {
    assert.strictEqual(typeof authService.getCurrentUser, "function", "getCurrentUser must be exported");
  });

  it("getCurrentUser deduplicates concurrent in-flight requests during bootstrap", async () => {
    const { apiClient } = await import("../../lib/apiClient.js");
    const originalGet = apiClient.get;
    let callCount = 0;
    try {
      apiClient.get = async () => {
        callCount++;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return {
          success: true,
          data: { user: { id: "u-123", email: "admin@example.com", role: "admin" } },
        };
      };

      const [res1, res2] = await Promise.all([
        authService.getCurrentUser(),
        authService.getCurrentUser(),
      ]);

      assert.strictEqual(callCount, 1, "Concurrent getCurrentUser calls must share a single network request");
      assert.deepStrictEqual(res1, { user: { id: "u-123", email: "admin@example.com", role: "admin" } });
      assert.deepStrictEqual(res2, { user: { id: "u-123", email: "admin@example.com", role: "admin" } });
    } finally {
      apiClient.get = originalGet;
    }
  });

  it("getCurrentUser handles unauthenticated 401 AUTH_TOKEN_REQUIRED as clean signed-out state { user: null }", async () => {
    const { apiClient, ApiError } = await import("../../lib/apiClient.js");
    const originalGet = apiClient.get;
    try {
      apiClient.get = async () => {
        throw new ApiError({
          message: "Authentication token is required",
          status: 401,
          code: "AUTH_TOKEN_REQUIRED",
        });
      };

      const result = await authService.getCurrentUser();
      assert.deepStrictEqual(result, { user: null }, "Unauthenticated /users/me must resolve to { user: null }");
    } finally {
      apiClient.get = originalGet;
    }
  });

  it("getCurrentUser handles expired or invalid session tokens as clean signed-out state { user: null }", async () => {
    const { apiClient, ApiError } = await import("../../lib/apiClient.js");
    const originalGet = apiClient.get;
    try {
      for (const code of ["AUTH_TOKEN_EXPIRED", "INVALID_AUTH_TOKEN", "USER_NOT_FOUND", "ACCOUNT_DEACTIVATED"]) {
        apiClient.get = async () => {
          throw new ApiError({
            message: "Session token invalid or expired",
            status: 401,
            code,
          });
        };

        const result = await authService.getCurrentUser();
        assert.deepStrictEqual(result, { user: null }, `${code} must resolve to { user: null }`);
      }
    } finally {
      apiClient.get = originalGet;
    }
  });

  it("loginAdmin function is exported", () => {
    assert.strictEqual(typeof authService.loginAdmin, "function", "loginAdmin must be exported");
  });

  it("loginAdmin deduplicates concurrent in-flight requests", async () => {
    const { apiClient } = await import("../../lib/apiClient.js");
    const originalPost = apiClient.post;
    let callCount = 0;
    try {
      apiClient.post = async () => {
        callCount++;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return {
          success: true,
          data: { user: { id: "u-123", email: "admin@example.com", role: "admin" } },
        };
      };

      const [res1, res2] = await Promise.all([
        authService.loginAdmin({ email: "admin@example.com", password: "Password123!" }),
        authService.loginAdmin({ email: "admin@example.com", password: "Password123!" }),
      ]);

      assert.strictEqual(callCount, 1, "Concurrent loginAdmin calls must share a single network request");
      assert.deepStrictEqual(res1, { user: { id: "u-123", email: "admin@example.com", role: "admin" } });
      assert.deepStrictEqual(res2, { user: { id: "u-123", email: "admin@example.com", role: "admin" } });
    } finally {
      apiClient.post = originalPost;
    }
  });

  it("registerUser function is exported", () => {
    assert.strictEqual(typeof authService.registerUser, "function", "registerUser must be exported");
  });
});

// ── Verify storage.js is a no-op ─────────────────────────────────────────────

import { getAccessToken, setAccessToken, removeAccessToken } from "../../lib/storage.js";

describe("storage.js — no-op after Phase 3 migration", () => {
  it("getAccessToken always returns null (no localStorage reads)", () => {
    const result = getAccessToken();
    assert.strictEqual(result, null, "getAccessToken must return null — no JWT in localStorage");
  });

  it("setAccessToken is a no-op (does not write to localStorage)", () => {
    // Should not throw and should not write any value
    assert.doesNotThrow(() => setAccessToken("some-jwt-token"));
    // After calling set, get still returns null
    assert.strictEqual(getAccessToken(), null, "getAccessToken must still return null after setAccessToken");
  });

  it("removeAccessToken is a no-op (does not interact with localStorage)", () => {
    assert.doesNotThrow(() => removeAccessToken());
  });
});

// ── Verify apiClient.js does not auto-inject Bearer from storage ──────────────

import { request as apiRequest } from "../../lib/apiClient.js";

describe("apiClient.js — no automatic Bearer token injection from storage", () => {
  it("request function is exported", () => {
    assert.strictEqual(typeof apiRequest, "function");
  });

  it("apiClient module does not import getAccessToken or setAccessToken", async () => {
    // Read the source text of apiClient.js to verify no storage reads for auth
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const apiClientPath = join(__dirname, "../../lib/apiClient.js");
    const source = readFileSync(apiClientPath, "utf8");

    // Must not call getAccessToken — tokens should not come from storage
    assert.ok(
      !source.includes("getAccessToken()"),
      "apiClient.js must not call getAccessToken() — browser auth is via cookie"
    );

    // Must not call setAccessToken — tokens must not be written to storage
    assert.ok(
      !source.includes("setAccessToken"),
      "apiClient.js must not call setAccessToken"
    );
  });

  it("apiClient.js does NOT automatically inject Authorization: Bearer from storage", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const apiClientPath = join(__dirname, "../../lib/apiClient.js");
    const source = readFileSync(apiClientPath, "utf8");

    // The token variable must be set to null when no explicit override is given
    // (not from getAccessToken/localStorage)
    assert.ok(
      source.includes("explicitToken !== undefined ? explicitToken : null"),
      "apiClient must default token to null (not storage), so no automatic Bearer injection"
    );
  });

  it("apiClient.js sends credentials: include for cookie transmission", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const apiClientPath = join(__dirname, "../../lib/apiClient.js");
    const source = readFileSync(apiClientPath, "utf8");

    assert.ok(
      source.includes("credentials: 'include'"),
      "apiClient must include credentials: 'include' so browser sends HttpOnly cookie"
    );
  });
});

// ── Verify auth.context.jsx does not hold token in state ─────────────────────

describe("auth.context.jsx — no JWT in React state", () => {
  it("auth.context.jsx source does not contain setToken or token state", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const contextPath = join(__dirname, "auth.context.jsx");
    const source = readFileSync(contextPath, "utf8");

    // Must not persist token in state
    assert.ok(
      !source.includes("setToken("),
      "auth.context.jsx must not call setToken() — no JWT in React state"
    );
    assert.ok(
      !source.includes("useState(token)") && !source.includes("[token,") && !source.includes("[token ,"),
      "auth.context.jsx must not have a token state variable"
    );
  });

  it("auth.context.jsx does not import from storage.js", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const contextPath = join(__dirname, "auth.context.jsx");
    const source = readFileSync(contextPath, "utf8");

    assert.ok(
      !source.includes("storage.js"),
      "auth.context.jsx must not import from storage.js — no localStorage auth"
    );
    assert.ok(
      !source.includes("getAccessToken"),
      "auth.context.jsx must not call getAccessToken"
    );
    assert.ok(
      !source.includes("setAccessToken"),
      "auth.context.jsx must not call setAccessToken"
    );
    assert.ok(
      !source.includes("removeAccessToken"),
      "auth.context.jsx must not call removeAccessToken"
    );
  });

  it("auth.context.jsx logout calls apiLogoutUser (not localStorage)", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const contextPath = join(__dirname, "auth.context.jsx");
    const source = readFileSync(contextPath, "utf8");

    assert.ok(
      source.includes("apiLogoutUser"),
      "auth.context.jsx logout must call apiLogoutUser() to clear the server cookie"
    );
  });

  it("auth.context.jsx login does not store a token from response", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const contextPath = join(__dirname, "auth.context.jsx");
    const source = readFileSync(contextPath, "utf8");

    // Must not extract receivedToken or token from login result
    assert.ok(
      !source.includes("receivedToken"),
      "auth.context.jsx must not extract receivedToken from login response"
    );
    assert.ok(
      !source.includes("token: receivedToken"),
      "auth.context.jsx must not store receivedToken from login"
    );
  });
});
