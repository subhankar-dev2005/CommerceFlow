/**
 * Phase 3 & Step 4A: Auth Context and Admin MFA Integration Tests
 *
 * Verifies:
 * - Cookie-based authentication contract (no tokens in storage, no tokens in React state)
 * - Admin login decoupling: password-only login returns MFA challenge metadata without establishing session
 * - Dedicated MFA service methods for verification, recovery, setup, and activation
 * - completeAdminMfaSession for finalizing authentication after MFA success
 * - Error propagation on invalid MFA codes, rate limits, and expired challenges
 */

import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import React, { act, useContext } from "react";
import { createRoot } from "react-dom/client";

import authService, {
  loginUser,
  logoutUser,
  getCurrentUser,
  loginAdmin,
  registerUser,
  verifyAdminMfa,
  verifyAdminMfaRecovery,
  setupAdminMfa,
  activateAdminMfa,
} from "./auth.service.js";
import authContextModule from "./auth.context.jsx";

const AuthContext = authContextModule.AuthContext || authContextModule.default || authContextModule;
const AuthProvider = authContextModule.AuthProvider || authContextModule.default?.AuthProvider;
import { apiClient, ApiError } from "../../lib/apiClient.js";
import { getAccessToken, setAccessToken, removeAccessToken } from "../../lib/storage.js";
import { request as apiRequest } from "../../lib/apiClient.js";

// ── Mock DOM for React 19 act() testing in Node ──────────────────────────────
globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

class MockNode {}
class MockElement extends MockNode {}
class MockHTMLElement extends MockElement {}
class MockHTMLIFrameElement extends MockHTMLElement {}

function createMockElement(tag, doc) {
  const el = new MockHTMLElement();
  const children = [];
  const attributes = {};
  const listeners = {};

  Object.assign(el, {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    nodeName: tag.toUpperCase(),
    ownerDocument: doc,
    style: {},
    childNodes: children,
    focus: () => {},
    setAttribute: (name, val) => {
      attributes[name] = String(val);
    },
    getAttribute: (name) => {
      if (name in attributes) return attributes[name];
      return null;
    },
    hasAttribute: (name) => name in attributes,
    removeAttribute: (name) => {
      delete attributes[name];
    },
    addEventListener: (type, handler) => {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(handler);
    },
    removeEventListener: (type, handler) => {
      if (listeners[type]) {
        listeners[type] = listeners[type].filter((h) => h !== handler);
      }
    },
    appendChild: (c) => {
      c.parentNode = el;
      children.push(c);
      return c;
    },
    removeChild: (c) => {
      const idx = children.indexOf(c);
      if (idx !== -1) children.splice(idx, 1);
      return c;
    },
    insertBefore: (c, ref) => {
      c.parentNode = el;
      const idx = children.indexOf(ref);
      if (idx !== -1) {
        children.splice(idx, 0, c);
      } else {
        children.push(c);
      }
      return c;
    },
  });

  Object.defineProperty(el, "firstChild", {
    get: () => children[0] || null,
  });
  Object.defineProperty(el, "lastChild", {
    get: () => children[children.length - 1] || null,
  });
  Object.defineProperty(el, "children", {
    get: () => children.filter((c) => c.nodeType === 1),
  });
  Object.defineProperty(el, "textContent", {
    get: () => children.map((c) => c.textContent || "").join(""),
    set: (val) => {
      children.length = 0;
      if (val) {
        const textNode = new MockNode();
        textNode.nodeType = 3;
        textNode.nodeValue = String(val);
        textNode.ownerDocument = doc;
        Object.defineProperty(textNode, "textContent", {
          get: () => textNode.nodeValue,
          set: (v) => {
            textNode.nodeValue = String(v);
          },
        });
        textNode.parentNode = el;
        children.push(textNode);
      }
    },
  });

  return el;
}

function createMockDocument() {
  const doc = {
    nodeType: 9,
    createElement: (tag) => createMockElement(tag, doc),
    createElementNS: (_ns, tag) => createMockElement(tag, doc),
    createTextNode: (text) => {
      const t = new MockNode();
      t.nodeType = 3;
      t.nodeValue = String(text);
      t.ownerDocument = doc;
      Object.defineProperty(t, "textContent", {
        get: () => t.nodeValue,
        set: (v) => {
          t.nodeValue = String(v);
        },
      });
      return t;
    },
    createComment: () => ({ nodeType: 8, ownerDocument: doc }),
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  return doc;
}

const mockDoc = createMockDocument();
const mockWin = {
  document: mockDoc,
  Node: MockNode,
  Element: MockElement,
  HTMLElement: MockHTMLElement,
  HTMLIFrameElement: MockHTMLIFrameElement,
  location: { pathname: "/", search: "" },
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
  localStorage: {
    getItem: () => null,
    setItem: () => {
      throw new Error("localStorage must not be used for session tokens or MFA secrets!");
    },
    removeItem: () => {},
  },
  sessionStorage: {
    getItem: () => null,
    setItem: () => {
      throw new Error("sessionStorage must not be used for session tokens or MFA secrets!");
    },
    removeItem: () => {},
  },
  CustomEvent: class MockCustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init?.detail;
    }
  },
};
mockDoc.defaultView = mockWin;

if (!globalThis.window) globalThis.window = mockWin;
if (!globalThis.document) globalThis.document = mockDoc;
if (!globalThis.Node) globalThis.Node = MockNode;
if (!globalThis.Element) globalThis.Element = MockElement;
if (!globalThis.HTMLElement) globalThis.HTMLElement = MockHTMLElement;
if (!globalThis.HTMLIFrameElement) globalThis.HTMLIFrameElement = MockHTMLIFrameElement;

// ── Verify auth.service.js contract ──────────────────────────────────────────

describe("auth.service.js — Phase 3 & Step 4A contract", () => {
  it("loginUser function is exported", () => {
    assert.strictEqual(typeof authService.loginUser, "function", "loginUser must be exported");
    assert.strictEqual(typeof loginUser, "function", "loginUser must be named export");
  });

  it("logoutUser function is exported (required for cookie clearing)", () => {
    assert.strictEqual(typeof authService.logoutUser, "function", "logoutUser must be exported");
    assert.strictEqual(typeof logoutUser, "function", "logoutUser must be named export");
  });

  it("getCurrentUser function is exported (cookie session check)", () => {
    assert.strictEqual(typeof authService.getCurrentUser, "function", "getCurrentUser must be exported");
    assert.strictEqual(typeof getCurrentUser, "function", "getCurrentUser must be named export");
  });

  it("getCurrentUser deduplicates concurrent in-flight requests during bootstrap", async () => {
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
    const originalGet = apiClient.get;
    try {
      for (const code of ["AUTH_TOKEN_EXPIRED", "INVALID_AUTH_TOKEN", "AUTH_TOKEN_REVOKED", "USER_NOT_FOUND", "ACCOUNT_DEACTIVATED"]) {
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
    assert.strictEqual(typeof loginAdmin, "function", "loginAdmin must be named export");
  });

  it("loginAdmin returns MFA challenge metadata without treating password verification as completed login", async () => {
    const originalPost = apiClient.post;
    let postArgs = null;
    try {
      apiClient.post = async (path, body, options) => {
        postArgs = { path, body, options };
        return {
          success: true,
          data: {
            mfaRequired: true,
            mfaEnrollmentRequired: false,
            challengeToken: "test-challenge-token-xyz",
            expiresInSeconds: 300,
          },
        };
      };

      const result = await authService.loginAdmin({
        email: "admin@example.com",
        password: "Password123!",
      });

      assert.strictEqual(postArgs.path, "users/admin/login");
      assert.deepStrictEqual(postArgs.body, {
        email: "admin@example.com",
        password: "Password123!",
      });
      assert.deepStrictEqual(postArgs.options, { token: null });

      assert.deepStrictEqual(result, {
        mfaRequired: true,
        mfaEnrollmentRequired: false,
        challengeToken: "test-challenge-token-xyz",
        expiresInSeconds: 300,
        user: undefined,
      });
    } finally {
      apiClient.post = originalPost;
    }
  });

  it("loginAdmin deduplicates concurrent in-flight requests and preserves challenge metadata", async () => {
    const originalPost = apiClient.post;
    let callCount = 0;
    try {
      apiClient.post = async () => {
        callCount++;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return {
          success: true,
          data: {
            mfaRequired: true,
            mfaEnrollmentRequired: true,
            challengeToken: "in-flight-challenge-token",
            expiresInSeconds: 300,
          },
        };
      };

      const [res1, res2] = await Promise.all([
        authService.loginAdmin({ email: "admin@example.com", password: "Password123!" }),
        authService.loginAdmin({ email: "admin@example.com", password: "Password123!" }),
      ]);

      assert.strictEqual(callCount, 1, "Concurrent loginAdmin calls must share a single network request");
      assert.deepStrictEqual(res1, {
        mfaRequired: true,
        mfaEnrollmentRequired: true,
        challengeToken: "in-flight-challenge-token",
        expiresInSeconds: 300,
        user: undefined,
      });
      assert.deepStrictEqual(res2, {
        mfaRequired: true,
        mfaEnrollmentRequired: true,
        challengeToken: "in-flight-challenge-token",
        expiresInSeconds: 300,
        user: undefined,
      });
    } finally {
      apiClient.post = originalPost;
    }
  });

  it("registerUser function is exported", () => {
    assert.strictEqual(typeof authService.registerUser, "function", "registerUser must be exported");
    assert.strictEqual(typeof registerUser, "function", "registerUser must be named export");
  });
});

// ── Verify Step 4A Admin MFA service methods ─────────────────────────────────

describe("auth.service.js — Step 4A Admin MFA methods", () => {
  it("verifyAdminMfa function is exported", () => {
    assert.strictEqual(typeof authService.verifyAdminMfa, "function", "verifyAdminMfa must be on authService");
    assert.strictEqual(typeof verifyAdminMfa, "function", "verifyAdminMfa must be named export");
  });

  it("verifyAdminMfa posts to users/admin/mfa/verify with challengeToken, totpCode, and token: null", async () => {
    const originalPost = apiClient.post;
    let recordedCall = null;
    try {
      apiClient.post = async (path, body, options) => {
        recordedCall = { path, body, options };
        return {
          success: true,
          data: {
            user: {
              id: "adm-001",
              name: "Operations Admin",
              email: "admin@example.com",
              role: "admin",
            },
          },
        };
      };

      const result = await authService.verifyAdminMfa({
        challengeToken: "challenge-token-verify-123",
        totpCode: "123456",
      });

      assert.strictEqual(recordedCall.path, "users/admin/mfa/verify");
      assert.deepStrictEqual(recordedCall.body, {
        challengeToken: "challenge-token-verify-123",
        totpCode: "123456",
      });
      assert.deepStrictEqual(recordedCall.options, { token: null });
      assert.deepStrictEqual(result, {
        user: {
          id: "adm-001",
          name: "Operations Admin",
          email: "admin@example.com",
          role: "admin",
        },
      });
    } finally {
      apiClient.post = originalPost;
    }
  });

  it("verifyAdminMfaRecovery function is exported", () => {
    assert.strictEqual(typeof authService.verifyAdminMfaRecovery, "function", "verifyAdminMfaRecovery must be on authService");
    assert.strictEqual(typeof verifyAdminMfaRecovery, "function", "verifyAdminMfaRecovery must be named export");
  });

  it("verifyAdminMfaRecovery posts to users/admin/mfa/recovery with challengeToken, recoveryCode, and token: null", async () => {
    const originalPost = apiClient.post;
    let recordedCall = null;
    try {
      apiClient.post = async (path, body, options) => {
        recordedCall = { path, body, options };
        return {
          success: true,
          data: {
            user: {
              id: "adm-001",
              name: "Admin User",
              email: "admin@example.com",
              role: "admin",
            },
          },
        };
      };

      const result = await authService.verifyAdminMfaRecovery({
        challengeToken: "challenge-token-recovery-123",
        recoveryCode: "RC12-ABCD-EFGH",
      });

      assert.strictEqual(recordedCall.path, "users/admin/mfa/recovery");
      assert.deepStrictEqual(recordedCall.body, {
        challengeToken: "challenge-token-recovery-123",
        recoveryCode: "RC12-ABCD-EFGH",
      });
      assert.deepStrictEqual(recordedCall.options, { token: null });
      assert.deepStrictEqual(result, {
        user: {
          id: "adm-001",
          name: "Admin User",
          email: "admin@example.com",
          role: "admin",
        },
      });
    } finally {
      apiClient.post = originalPost;
    }
  });

  it("setupAdminMfa function is exported", () => {
    assert.strictEqual(typeof authService.setupAdminMfa, "function", "setupAdminMfa must be on authService");
    assert.strictEqual(typeof setupAdminMfa, "function", "setupAdminMfa must be named export");
  });

  it("setupAdminMfa posts to users/admin/mfa/setup with challengeToken and token: null", async () => {
    const originalPost = apiClient.post;
    let recordedCall = null;
    try {
      apiClient.post = async (path, body, options) => {
        recordedCall = { path, body, options };
        return {
          success: true,
          data: {
            secret: "JBSWY3DPEHPK3PXP",
            otpauthUri: "otpauth://totp/CommerceFlow:admin@example.com?secret=JBSWY3DPEHPK3PXP&issuer=CommerceFlow",
            expiresInSeconds: 600,
          },
        };
      };

      const result = await authService.setupAdminMfa({
        challengeToken: "challenge-token-setup-123",
      });

      assert.strictEqual(recordedCall.path, "users/admin/mfa/setup");
      assert.deepStrictEqual(recordedCall.body, {
        challengeToken: "challenge-token-setup-123",
      });
      assert.deepStrictEqual(recordedCall.options, { token: null });
      assert.strictEqual(result.secret, "JBSWY3DPEHPK3PXP");
      assert.strictEqual(result.otpauthUri, "otpauth://totp/CommerceFlow:admin@example.com?secret=JBSWY3DPEHPK3PXP&issuer=CommerceFlow");
      assert.strictEqual(result.expiresInSeconds, 600);
    } finally {
      apiClient.post = originalPost;
    }
  });

  it("activateAdminMfa function is exported", () => {
    assert.strictEqual(typeof authService.activateAdminMfa, "function", "activateAdminMfa must be on authService");
    assert.strictEqual(typeof activateAdminMfa, "function", "activateAdminMfa must be named export");
  });

  it("activateAdminMfa posts to users/admin/mfa/activate with challengeToken, totpCode, and token: null", async () => {
    const originalPost = apiClient.post;
    let recordedCall = null;
    try {
      apiClient.post = async (path, body, options) => {
        recordedCall = { path, body, options };
        return {
          success: true,
          data: {
            user: {
              id: "adm-001",
              name: "Operations Admin",
              email: "admin@example.com",
              role: "admin",
            },
            recoveryCodes: [
              "1111-2222-3333-4444",
              "5555-6666-7777-8888",
            ],
          },
        };
      };

      const result = await authService.activateAdminMfa({
        challengeToken: "challenge-token-activate-123",
        totpCode: "654321",
      });

      assert.strictEqual(recordedCall.path, "users/admin/mfa/activate");
      assert.deepStrictEqual(recordedCall.body, {
        challengeToken: "challenge-token-activate-123",
        totpCode: "654321",
      });
      assert.deepStrictEqual(recordedCall.options, { token: null });
      assert.strictEqual(result.user.id, "adm-001");
      assert.strictEqual(result.recoveryCodes.length, 2);
    } finally {
      apiClient.post = originalPost;
    }
  });

  it("MFA methods propagate ApiErrors (401 INVALID_MFA_CODE, 400 MFA_CHALLENGE_EXPIRED, 429 AUTH_RATE_LIMIT_EXCEEDED) without swallowing", async () => {
    const originalPost = apiClient.post;
    try {
      // 1. verifyAdminMfa on 401 INVALID_MFA_CODE
      apiClient.post = async () => {
        throw new ApiError({
          message: "Invalid MFA verification code",
          status: 401,
          code: "INVALID_MFA_CODE",
        });
      };
      await assert.rejects(
        () => authService.verifyAdminMfa({ challengeToken: "c-tok", totpCode: "000000" }),
        (err) => err instanceof ApiError && err.status === 401 && err.code === "INVALID_MFA_CODE"
      );

      // 2. verifyAdminMfaRecovery on 400 MFA_CHALLENGE_EXPIRED
      apiClient.post = async () => {
        throw new ApiError({
          message: "MFA challenge expired",
          status: 400,
          code: "MFA_CHALLENGE_EXPIRED",
        });
      };
      await assert.rejects(
        () => authService.verifyAdminMfaRecovery({ challengeToken: "c-tok", recoveryCode: "RC12-ABCD" }),
        (err) => err instanceof ApiError && err.status === 400 && err.code === "MFA_CHALLENGE_EXPIRED"
      );

      // 3. setupAdminMfa on 429 AUTH_RATE_LIMIT_EXCEEDED
      apiClient.post = async () => {
        throw new ApiError({
          message: "Too many authentication requests",
          status: 429,
          code: "AUTH_RATE_LIMIT_EXCEEDED",
        });
      };
      await assert.rejects(
        () => authService.setupAdminMfa({ challengeToken: "c-tok" }),
        (err) => err instanceof ApiError && err.status === 429 && err.code === "AUTH_RATE_LIMIT_EXCEEDED"
      );

      // 4. activateAdminMfa on 400 MFA_ALREADY_CONFIGURED
      apiClient.post = async () => {
        throw new ApiError({
          message: "MFA already configured for administrator",
          status: 400,
          code: "MFA_ALREADY_CONFIGURED",
        });
      };
      await assert.rejects(
        () => authService.activateAdminMfa({ challengeToken: "c-tok", totpCode: "123456" }),
        (err) => err instanceof ApiError && err.status === 400 && err.code === "MFA_ALREADY_CONFIGURED"
      );
    } finally {
      apiClient.post = originalPost;
    }
  });
});

// ── Verify storage.js is a no-op ─────────────────────────────────────────────

describe("storage.js — no-op after Phase 3 migration", () => {
  it("getAccessToken always returns null (no localStorage reads)", () => {
    const result = getAccessToken();
    assert.strictEqual(result, null, "getAccessToken must return null — no JWT in localStorage");
  });

  it("setAccessToken is a no-op (does not write to localStorage)", () => {
    assert.doesNotThrow(() => setAccessToken("some-jwt-token"));
    assert.strictEqual(getAccessToken(), null, "getAccessToken must still return null after setAccessToken");
  });

  it("removeAccessToken is a no-op (does not interact with localStorage)", () => {
    assert.doesNotThrow(() => removeAccessToken());
  });
});

// ── Verify apiClient.js does not auto-inject Bearer from storage ──────────────

describe("apiClient.js — no automatic Bearer token injection from storage", () => {
  it("request function is exported", () => {
    assert.strictEqual(typeof apiRequest, "function");
  });

  it("apiClient module does not import getAccessToken or setAccessToken", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const apiClientPath = join(__dirname, "../../lib/apiClient.js");
    const source = readFileSync(apiClientPath, "utf8");

    assert.ok(
      !source.includes("getAccessToken()"),
      "apiClient.js must not call getAccessToken() — browser auth is via cookie"
    );
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

// ── Verify auth.context.jsx static security contract ─────────────────────────

describe("auth.context.jsx — security & storage contract", () => {
  it("auth.context.jsx source does not contain setToken or token state", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const contextPath = join(__dirname, "auth.context.jsx");
    const source = readFileSync(contextPath, "utf8");

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
    assert.ok(!source.includes("getAccessToken"), "auth.context.jsx must not call getAccessToken");
    assert.ok(!source.includes("setAccessToken"), "auth.context.jsx must not call setAccessToken");
    assert.ok(!source.includes("removeAccessToken"), "auth.context.jsx must not call removeAccessToken");
  });

  it("auth.context.jsx does not store challenge tokens or MFA credentials in browser storage", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const contextPath = join(__dirname, "auth.context.jsx");
    const source = readFileSync(contextPath, "utf8");

    assert.ok(
      !source.includes("localStorage.setItem") && !source.includes("sessionStorage.setItem"),
      "auth.context.jsx must never store credentials or tokens in browser storage"
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

    assert.ok(
      !source.includes("receivedToken"),
      "auth.context.jsx must not extract receivedToken from login response"
    );
    assert.ok(
      !source.includes("token: receivedToken"),
      "auth.context.jsx must not store receivedToken from login"
    );
  });

  it("auth.context.jsx defines completeAdminMfaSession and exposes it in context", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const contextPath = join(__dirname, "auth.context.jsx");
    const source = readFileSync(contextPath, "utf8");

    assert.ok(
      source.includes("completeAdminMfaSession"),
      "auth.context.jsx must declare completeAdminMfaSession"
    );
    assert.ok(
      source.includes("completeAdminMfaSession,") || source.includes("completeAdminMfaSession:"),
      "completeAdminMfaSession must be included in AuthContext value"
    );
  });
});

// ── Verify auth.context.jsx React Provider & MFA Lifecycle ───────────────────

describe("auth.context.jsx — React Provider & MFA Lifecycle", () => {
  let originalGet = null;
  let originalPost = null;
  let currentAuthContext = null;
  let root = null;
  let container = null;

  function ContextConsumer() {
    currentAuthContext = useContext(AuthContext);
    return null;
  }

  async function mountProvider() {
    currentAuthContext = null;
    container = mockDoc.createElement("div");
    root = createRoot(container);
    await act(async () => {
      root.render(
        React.createElement(
          AuthProvider,
          null,
          React.createElement(ContextConsumer, null)
        )
      );
    });
  }

  async function unmountProvider() {
    if (root) {
      await act(async () => {
        root.unmount();
      });
      root = null;
      container = null;
      currentAuthContext = null;
    }
  }

  beforeEach(() => {
    originalGet = apiClient.get;
    originalPost = apiClient.post;
  });

  afterEach(async () => {
    apiClient.get = originalGet;
    apiClient.post = originalPost;
    await unmountProvider();
  });

  it("bootstraps unauthenticated state cleanly when no active cookie exists", async () => {
    apiClient.get = async () => ({ user: null });
    await mountProvider();

    assert.strictEqual(currentAuthContext.isLoading, false);
    assert.strictEqual(currentAuthContext.isAuthenticated, false);
    assert.strictEqual(currentAuthContext.user, null);
    assert.strictEqual(currentAuthContext.error, null);
    assert.strictEqual(typeof currentAuthContext.loginAdmin, "function");
    assert.strictEqual(typeof currentAuthContext.completeAdminMfaSession, "function");
  });

  it("loginAdmin returns MFA challenge metadata without establishing an authenticated session", async () => {
    apiClient.get = async () => ({ user: null });
    await mountProvider();

    apiClient.post = async () => ({
      success: true,
      data: {
        mfaRequired: true,
        mfaEnrollmentRequired: false,
        challengeToken: "mfa-challenge-tok-456",
        expiresInSeconds: 300,
      },
    });

    let loginResult = null;
    await act(async () => {
      loginResult = await currentAuthContext.loginAdmin({
        email: "admin@example.com",
        password: "AdminPassword123!",
      });
    });

    // Returned challenge payload matches backend contract
    assert.deepStrictEqual(loginResult, {
      mfaRequired: true,
      mfaEnrollmentRequired: false,
      challengeToken: "mfa-challenge-tok-456",
      expiresInSeconds: 300,
      user: undefined,
    });

    // State MUST NOT be marked authenticated or populated with user
    assert.strictEqual(
      currentAuthContext.isAuthenticated,
      false,
      "isAuthenticated must remain false when mfaRequired is true"
    );
    assert.strictEqual(
      currentAuthContext.user,
      null,
      "user must remain null when mfaRequired is true"
    );
  });

  it("completeAdminMfaSession establishes authenticated session upon MFA verification success", async () => {
    apiClient.get = async () => ({ user: null });
    await mountProvider();

    assert.strictEqual(currentAuthContext.isAuthenticated, false);
    assert.strictEqual(currentAuthContext.user, null);

    const verifiedAdmin = {
      id: "admin-verified-1",
      email: "security-lead@example.com",
      role: "admin",
      name: "Security Lead",
    };

    await act(async () => {
      currentAuthContext.completeAdminMfaSession(verifiedAdmin);
    });

    assert.strictEqual(currentAuthContext.isAuthenticated, true, "isAuthenticated must be true after completeAdminMfaSession");
    assert.deepStrictEqual(currentAuthContext.user, verifiedAdmin, "user state must match verifiedAdmin");
    assert.strictEqual(currentAuthContext.error, null, "error must be cleared upon session completion");
  });

  it("completeAdminMfaSession safely rejects invalid or non-object arguments", async () => {
    apiClient.get = async () => ({ user: null });
    await mountProvider();

    await act(async () => {
      currentAuthContext.completeAdminMfaSession(null);
    });
    assert.strictEqual(currentAuthContext.isAuthenticated, false);
    assert.strictEqual(currentAuthContext.user, null);

    await act(async () => {
      currentAuthContext.completeAdminMfaSession(undefined);
    });
    assert.strictEqual(currentAuthContext.isAuthenticated, false);
    assert.strictEqual(currentAuthContext.user, null);

    await act(async () => {
      currentAuthContext.completeAdminMfaSession("not-an-object");
    });
    assert.strictEqual(currentAuthContext.isAuthenticated, false);
    assert.strictEqual(currentAuthContext.user, null);
  });

  it("loginAdmin clears prior error state on new login attempt", async () => {
    // Bootstrap with error
    apiClient.get = async () => {
      throw new ApiError({
        message: "Failed to connect",
        status: 500,
        code: "SERVER_ERROR",
      });
    };
    await mountProvider();
    assert.strictEqual(currentAuthContext.error, "Failed to connect");

    // Attempting loginAdmin clears previous error
    apiClient.post = async () => ({
      success: true,
      data: {
        mfaRequired: true,
        mfaEnrollmentRequired: false,
        challengeToken: "tok-clear-err",
        expiresInSeconds: 300,
      },
    });

    await act(async () => {
      await currentAuthContext.loginAdmin({
        email: "admin@example.com",
        password: "ValidPassword123!",
      });
    });

    assert.strictEqual(currentAuthContext.error, null, "Prior error must be cleared when loginAdmin is invoked");
  });

  it("customer login and logout lifecycle remains unaffected", async () => {
    apiClient.get = async () => ({ user: null });
    await mountProvider();

    const customerUser = {
      id: "cust-1",
      email: "buyer@example.com",
      role: "customer",
    };

    apiClient.post = async (path) => {
      if (path === "users/login") {
        return {
          success: true,
          data: { user: customerUser },
        };
      }
      if (path === "users/logout") {
        return {
          success: true,
          data: {},
        };
      }
      throw new Error(`Unexpected path: ${path}`);
    };

    // 1. Customer login
    await act(async () => {
      await currentAuthContext.login({ email: "buyer@example.com", password: "Password123!" });
    });

    assert.strictEqual(currentAuthContext.isAuthenticated, true);
    assert.deepStrictEqual(currentAuthContext.user, customerUser);

    // 2. Customer logout
    await act(async () => {
      await currentAuthContext.logout();
    });

    assert.strictEqual(currentAuthContext.isAuthenticated, false);
    assert.strictEqual(currentAuthContext.user, null);
  });
});
