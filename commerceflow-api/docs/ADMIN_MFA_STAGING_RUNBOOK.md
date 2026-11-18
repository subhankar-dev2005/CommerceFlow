# CommerceFlow — Admin MFA Staging Deployment & Validation Runbook

**Audience**: Authorized DevOps Engineers, SREs, Security Administrators, QA Engineers  
**Scope**: Staging Environment (`NODE_ENV=staging`)  
**Target System**: CommerceFlow API (`commerceflow-api`) & Admin Console (`commerceflow-web`)  
**Document Classification**: Operational Deployment & Release-Gate Runbook  
**Parent Baseline Commit**: Commit `efd9d0189f714ea85550f263a56bfd7f084de965` (`feat(admin): add store settings and branding management`)  
**MFA Code Location**: Layered uncommitted worktree changes on `feature/admin-expansion-staging-prep` (requires an authorized release artifact/tag before deployment)

---

> [!CAUTION]
> **STAGING SCOPE ONLY — NOT AUTHORIZATION TO DEPLOY**  
> This runbook is strictly scoped to the staging environment and must never be applied directly to production. Completing readiness audits or reading this runbook does **NOT** constitute operational authorization to deploy. Actual deployment requires explicit stakeholder sign-off and authorized operator initiation.

---

## 1. Scope, Release Gates & Blockers

### 1.1 Scope Boundaries
This document guides an authorized operator through deploying and validating the Administrator Multi-Factor Authentication (MFA) system, including TOTP enrollment, challenge verification, recovery-code redemption/regeneration, database audit logging, and frontend security navigation guards.

### 1.2 Mandatory Release Gates & Blockers

| Gate ID | Condition / Requirement | Status | Operational Impact |
|---|---|---|---|
| **GATE-01** | **Multi-Instance Deployment Rate Limiting** | **BLOCKED** | Rate limiting in `authRateLimitMiddleware` uses in-memory `MemoryStore` ([auth-rate-limit.middleware.js](file:///d:/e-commerce/commerceflow-api/src/common/middleware/auth-rate-limit.middleware.js#L40-L54)). Multi-instance staging deployment is **STRICTLY BLOCKED** until a shared store (e.g., Redis via `rate-limit-redis`) is connected. **Deployment is permitted ONLY to a single backend container/instance.** |
| **GATE-02** | **Full Backend Test Suite Qualification** | **RECORDED EXCEPTION** | The full backend test suite (`npm --prefix commerceflow-api test`) currently reports **1 failed file out of 150** (`src/modules/returns/return.test.js` with 26 CSRF origin failures out of 2,549 tests) due to legacy test requests omitting `Origin` headers against the global CSRF middleware ([csrf.middleware.js](file:///d:/e-commerce/commerceflow-api/src/common/middleware/csrf.middleware.js)). All 134 focused MFA, login, token, and audit tests pass with 100% success. This is an accepted, documented test defect that does not block single-instance staging deployment. |
| **GATE-03** | **Staging `MFA_ENCRYPTION_KEY` Secret Injection** | **MANDATORY PREREQUISITE** | The staging secrets vault must inject a unique 256-bit (64-character hexadecimal) encryption key. Startup will fail closed if this key is missing or is a placeholder ([env.js](file:///d:/e-commerce/commerceflow-api/src/config/env.js#L136-L173)). |
| **GATE-04** | **Dedicated Staging Test Accounts** | **MANDATORY PREREQUISITE** | Testing must use dedicated staging test accounts created specifically for MFA verification. Real or production administrator credentials must never be used. |
| **GATE-05** | **Authorized Immutable Release Artifact** | **MANDATORY PREREQUISITE** | Parent baseline commit `efd9d01` does **NOT** contain the Admin MFA implementation, which currently resides in the uncommitted local working tree. Deploying directly from an uncommitted working tree or from clean `efd9d01` is strictly unauthorized. Staging rollout is **BLOCKED** until an authorized release process commits/tags or packages the reviewed MFA implementation into an immutable container image digest. |

---

## 2. Pre-Deployment Verification Checklist

Before initiating any deployment steps, the operator must verify each item and record status.

| Check ID | Verification Item | Required Evidence | Owner | Status |
|---|---|---|---|---|
| **PRE-01** | **`MFA_ENCRYPTION_KEY` Provisioning** | 64-character hex key present in staging secrets manager. Never print or log the key. Verified via startup regex: `/^[0-9a-fA-F]{64}$/`. | SecOps / DevOps | `NOT VERIFIED` |
| **PRE-02** | **Secret Backup & Key Lifecycle** | Secure backup of `MFA_ENCRYPTION_KEY` in organization's secrets vault. Loss of key renders all admin TOTP secrets permanently unrecoverable. | SecOps | `NOT VERIFIED` |
| **PRE-03** | **Environment Type (`NODE_ENV`)** | Target runtime environment configured explicitly to `NODE_ENV=staging`. | DevOps | `NOT VERIFIED` |
| **PRE-04** | **Reverse Proxy (`TRUST_PROXY`)** | `TRUST_PROXY` configured to match staging ingress hop count (e.g. `TRUST_PROXY=1` for single-hop load balancer) ([app.js:40-50](file:///d:/e-commerce/commerceflow-api/src/app.js#L40-L50)). | DevOps | `NOT VERIFIED` |
| **PRE-05** | **Allowed Origins (`CORS_ORIGIN`)** | Exact staging frontend URL set in `CORS_ORIGIN` (e.g. `https://admin.staging.example.com`). Wildcards (`*`) strictly rejected in staging/prod. | DevOps | `NOT VERIFIED` |
| **PRE-06** | **HTTPS & Secure Cookies** | Edge load balancer terminates TLS with valid certificates. In `staging`, `isSecureCookieEnvironment()` automatically sets `Secure=true` on auth cookies ([cookie.js:12-17](file:///d:/e-commerce/commerceflow-api/src/config/cookie.js#L12-L17)). | DevOps | `NOT VERIFIED` |
| **PRE-07** | **Database Topology & Connectivity** | Staging MongoDB cluster reachable. Atomic updates require no replica set transactions; standalone MongoDB, replica sets, or Atlas clusters are supported ([admin-mfa.controller.js](file:///d:/e-commerce/commerceflow-api/src/modules/users/admin-mfa.controller.js)). | DBA / SRE | `NOT VERIFIED` |
| **PRE-08** | **Single-Instance Deployment Cap** | Container orchestrator replica count set strictly to `1` (enforcing GATE-01). | DevOps | `NOT VERIFIED` |
| **PRE-09** | **Authorized Break-Glass Runbook** | Documented emergency protocol approved to recover admin access without disabling MFA across the cluster. | SecOps | `NOT VERIFIED` |
| **PRE-10** | **Audit Logging Retention & Alerts** | Audit collection verified in staging database. Alerts configured for `logger.error` failure messages. | SRE / SecOps | `NOT VERIFIED` |

---

## 3. Step-by-Step Deployment Procedure

> [!NOTE]
> These steps are for an authorized operator. Do **NOT** execute them automatically during preparation.

### Step 3.1: Artifact & Source Verification

> [!IMPORTANT]
> **Release Artifact Prerequisite**: The branch HEAD (`efd9d0189f714ea85550f263a56bfd7f084de965`) is only the parent baseline commit; all Admin MFA implementation files currently reside in the uncommitted working tree.
> - Deploying a clean checkout of `efd9d0189f714ea85550f263a56bfd7f084de965` will **NOT** deploy Admin MFA.
> - Direct deployment from an uncommitted or dirty working tree is strictly unauthorized for production-grade staging releases.
> - An authorized release workflow must create an approved release commit/tag or build an immutable container image digest incorporating the reviewed MFA implementation.

1. **Verify Release Artifact Provenance**:
   - If deploying from an authorized Git release commit or tag:
     ```bash
     git rev-parse HEAD
     # Ensure HEAD matches the authorized release commit hash (NOT raw efd9d0189f714ea85550f263a56bfd7f084de965)
     git status --short
     # Working tree must be completely clean (0 uncommitted changes)
     ```
   - If deploying via immutable container image:
     ```bash
     # Verify the immutable image digest and signature in the container registry:
     crane digest <staging-registry>/commerceflow-api:<release-tag>
     # Or docker/podman inspect to record sha256:...
     ```
2. **Record Artifact Evidence**:
   - The operator must record the exact immutable release commit/tag and/or container image digest in Section 6 (Sign-Off Record) before proceeding with rollout.
   - Verify artifact provenance, build metadata, and contents against reviewed commit history.
3. **Verify Dependencies and Build Artifacts**:
   - For backend:
     ```bash
     npm --prefix commerceflow-api ci
     ```
   - For frontend production distribution pointing to the staging API:
     ```powershell
     # PowerShell
     $env:VITE_API_BASE_URL="https://api.staging.example.com/api/v1"; npm --prefix commerceflow-web run build; Remove-Item Env:\VITE_API_BASE_URL
     ```
     ```bash
     # POSIX Shell
     VITE_API_BASE_URL="https://api.staging.example.com/api/v1" npm --prefix commerceflow-web run build
     ```

### Step 3.2: Staging Secrets & Environment Injection
1. Ensure the staging container or server process receives environment variables:
   - `NODE_ENV=staging`
   - `PORT=4000`
   - `MONGODB_URI=<staging_mongodb_connection_string>`
   - `JWT_SECRET=<staging_jwt_signing_secret_min_32_chars>`
   - `MFA_ENCRYPTION_KEY=<staging_unique_64_char_hex_key>`
   - `CORS_ORIGIN=https://admin.staging.example.com`
   - `TRUST_PROXY=1`
   - `LOG_LEVEL=info`
2. **Never** log, echo, or store secret values in shell history or ticket logs.

### Step 3.3: Single-Instance Service Rollout
1. Deploy exactly **1 replica** of `commerceflow-api` to the staging cluster.
2. Deploy the static `dist/` bundle of `commerceflow-web` to the staging static host / CDN.

### Step 3.4: Startup Health & Telemetry Verification
1. Query the operational health endpoints to independently verify process liveness and database readiness:
   - **Liveness Check** (Process is running, zero I/O or DB dependency):
     ```bash
     curl -i https://api.staging.example.com/api/v1/health/live
     # Expected: HTTP 200 {"success":true,"data":{"status":"alive"},"requestId":"..."}
     ```
   - **Readiness Check** (Mongoose connected and active 3s MongoDB driver ping):
     ```bash
     curl -i https://api.staging.example.com/api/v1/health/ready
     # Expected: HTTP 200 {"success":true,"data":{"status":"ready"},"requestId":"..."}
     # Note: Returns HTTP 503 {"success":false,"data":{"status":"not_ready"},"requestId":"..."} if disconnected.
     ```
   - **General Health Check**:
     ```bash
     curl -i https://api.staging.example.com/api/v1/health
     # Expected: HTTP 200 {"success":true,"data":{"status":"ok","timestamp":"..."},"requestId":"..."}
     ```
2. Inspect application startup logs for configuration validation errors:
   - Confirm **zero** `Invalid environment configuration` messages.
   - Confirm **zero** Mongoose connection errors.
   - Confirm log level is `info`.

---

## 4. Operational Security Smoke-Test Plan

The operator must execute these 12 manual and browser-driven smoke tests in a real browser using dedicated staging accounts.

### Test 4.1: Password-Only Login Challenges
- **Action**: In Chrome/Firefox, navigate to `https://admin.staging.example.com/admin/login`. Enter email and password for a staging admin account.
- **Expected Result**:
  - The UI presents the MFA challenge modal / prompt.
  - The browser is **not** redirected to `/admin/dashboard`.
  - In DevTools $\rightarrow$ Application $\rightarrow$ Cookies, verify `auth_token` and `refresh_token` are **NOT** set.

### Test 4.2: First-Time Authenticator Enrollment
- **Action**: Log in with an admin account whose `twoFactorEnabled` is `false`.
- **Expected Result**:
  - The enrollment view renders an alphanumeric TOTP secret and a QR code.
  - Scan QR code into a physical mobile authenticator (e.g. Google Authenticator).
  - Enter the 6-digit TOTP code and submit.
  - The UI displays exactly 8 single-use recovery codes.

### Test 4.3: Invalid TOTP Rejection
- **Action**: Attempt login on an MFA-enrolled account and enter an invalid code (e.g. `000000`).
- **Expected Result**:
  - Request is rejected with HTTP 401 (`INVALID_MFA_CODE`).
  - Error alert is rendered.
  - Challenge remains active (attempts counter incremented).

### Test 4.4: Replayed TOTP Code Rejection
- **Action**: Log in with a valid TOTP code. Immediately log out. Attempt login again within the same 30-second window using the identical TOTP code.
- **Expected Result**:
  - Request is rejected with HTTP 401 (`INVALID_MFA_CODE` or replay detection).
  - No new session cookies are issued.

### Test 4.5: Single-Use Recovery Code Redemption
- **Action**: In the login challenge, select "Use a recovery code". Enter Recovery Code #1.
- **Expected Result**:
  - Login succeeds; browser receives valid `auth_token` (`Secure`, `HttpOnly`, `SameSite=Lax`).
  - Log out. Attempt login again using Recovery Code #1.
  - Re-use attempt is rejected with HTTP 401 (`INVALID_MFA_CODE`).

### Test 4.6: Dual-Factor Conflict Rejection & Recovery-Code Regeneration
- **Action**: In Admin Settings $\rightarrow$ Security Settings (`/admin/settings/security`), enter password. Attempt to submit both TOTP and recovery code simultaneously. Then enter current password + valid TOTP code and click "Regenerate".
- **Expected Result**:
  - If client attempts to submit both TOTP and recovery code simultaneously, frontend blocks submission before dispatch.
  - Submitting current password + valid TOTP code succeeds (HTTP 200). Exactly 8 new Crockford Base32 recovery codes appear in the unacknowledged modal view.

### Test 4.7: Navigation-Loss Protection for Unacknowledged Codes
- **Action**: While the 8 newly generated recovery codes from Test 4.6 are visible on screen and unacknowledged:
  1. Click an internal navigation link (e.g. "Dashboard").
  2. Attempt browser back button (`popstate`).
  3. Attempt tab reload / close.
- **Expected Result**:
  - In-app modal warns that unacknowledged codes will be lost; dismissing the warning cancels navigation and retains the code view.
  - Browser `beforeunload` dialog triggers on reload.
  - After clicking "I have saved these codes", the modal closes and navigation proceeds normally.

### Test 4.8: Old Recovery Code Invalidation & New Code Verification
- **Action**: Following formal acknowledgment in Test 4.7, log out of the administrator console.
  1. Attempt MFA login using Recovery Code #1 from the original (pre-regeneration) set.
  2. Attempt MFA login using Recovery Code #1 from the newly generated set.
- **Expected Result**:
  - Original recovery code is rejected with HTTP 401 (`INVALID_MFA_CODE`).
  - Newly generated recovery code succeeds; valid session cookies issued; login successful.

### Test 4.9: Durable Audit Persistence & Queryability
- **Action**: In the Admin Console, navigate to `https://admin.staging.example.com/admin/audit-logs`.
- **Expected Result**:
  - Audit log entries exist for:
    - `ADMIN_MFA_LOGIN_SUCCESS`
    - `ADMIN_MFA_LOGIN_FAILED`
    - `ADMIN_MFA_ENROLLED`
    - `ADMIN_MFA_RECOVERY_CODES_REGENERATED`
  - Records contain correct timestamps, actor email, and sanitized metadata.

### Test 4.10: Database Disconnection Fail-Closed Durability
- **Action**: Inspect server log telemetry during simulated database degradation.
- **Expected Result**:
  - In staging (`NODE_ENV=staging`), database write failures log `logger.error` (`Failed to persist administrative audit log event`).
  - The service **never** returns a fake in-memory audit log `{ _id: "000000000000000000000000" }`.
  - Authentication errors are never replaced by audit errors.

### Test 4.11: Rate Limiting Enforcement
- **Action**: Submit 11 consecutive invalid passwords to `/api/v1/users/admin/login` from a single test workstation IP for a staging administrator account.
- **Expected Result**:
  - Requests 1 through 10 return HTTP 401 (`INVALID_CREDENTIALS`).
  - 11th request is throttled and returns HTTP 429 (`AUTH_RATE_LIMIT_EXCEEDED`).
  - Standard rate limit draft-7 headers are present: `RateLimit-Limit: 10`, `RateLimit-Remaining: 0`, `RateLimit-Reset: <seconds>`, `RateLimit-Policy: 10;w=900`.
  - Throttled response includes `Retry-After: 900` (or seconds remaining in 15-minute window).
  - Note: MFA challenge verification endpoints (`/api/v1/users/admin/mfa/verify`) enforce 30 requests/15m per IP and 5 attempts per challenge (aligning with the 5-attempt `MFA_CHALLENGE_LOCKED` security policy).

### Test 4.12: HTTPS Cookies & CSRF Protection
- **Action**: Inspect authenticated network responses in DevTools.
- **Expected Result**:
  - Cookies have flags: `HttpOnly; Secure; SameSite=Lax`.
  - Submitting a POST mutation without matching `Origin` or `Referer` returns HTTP 403 `CSRF_ORIGIN_INVALID`.

---

## 5. Rollback & Emergency Incident Response

### 5.1 Objective Rollback Triggers
An immediate rollback must be initiated if any of the following occur during staging validation:
1. **MFA Bypass**: Password verification issues session cookies without second-factor completion.
2. **Enrollment Lockout**: Legitimate administrators cannot complete first-time QR enrollment.
3. **Recovery Code Invalidation Failure**: Pre-existing recovery codes remain valid after regeneration.
4. **Silent Audit Dropping**: Audit events are dropped without error logging or in-memory fallback occurs in staging.
5. **Rate Limiting Failure**: Brute-force attacks are completely unthrottled under the staging proxy topology.

### 5.2 Safe Rollback Procedure
1. **Approval**: Obtain verbal or written authorization from the Lead SRE / Security Lead.
2. **Pre-Deployment Rollback Artifact Recording & Verification**:
   - Prior to initiating rollout, the operator must inspect the currently running staging deployment and record its immutable container image digest (or release commit/tag).
   - The operator must confirm that this prior known-good artifact exists in the container registry or deployment history and can be immediately pulled and redeployed.
   - Record the selected rollback artifact digest/revision in Section 6 (Sign-Off Record).
   - **HALT CONDITION**: If no verified prior rollback artifact is available or its provenance cannot be verified, **STOP** and escalate to the Lead SRE before initiating deployment.
3. **Rollback Execution**:
   - Redeploy the pre-deployment container image using its exact, recorded immutable digest (or checked-out release revision).
   - Do **NOT** rely on undocumented or non-existent commit hashes. Rollback must target solely the operator-verified prior artifact.
   - Verify that the rollback container starts up and reports healthy:
     ```bash
     curl -i https://api.staging.example.com/api/v1/health
     # Expected: HTTP 200 {"success":true,"data":{"status":"ok"},"requestId":"..."}
     ```
4. **Database Safety**:
   - > [!WARNING]
     > **DO NOT PERFORM AD HOC DATABASE WRITES**  
     > Never execute ad hoc `mongo` commands to drop user collections or manually wipe encryption keys.
   - Reverting the code leaves the new schema fields (`twoFactorSecret`, `twoFactorRecoveryCodes`) dormant and inert without breaking legacy login.
5. **Log Incident & Escalation**:
   - Record exact timestamps, symptom evidence, deployed digest, and rollback digest in the staging incident log.
   - Notify the security team and development team of the rollback cause.

### 5.3 Break-Glass Admin Access Recovery (Emergency Staging Protocol)

> [!CAUTION]
> **RESTRICTED TO DEDICATED STAGING TEST ADMINISTRATORS ONLY**  
> Direct database mutations are strictly prohibited except for controlled recovery drills on dedicated staging test accounts (e.g. `test-admin@staging.example.com`). Real or production credentials must never be modified. Every break-glass action requires written Lead SRE authorization and an immutable audit ticket.

If an authorized staging administrator is locked out during validation drills, the operator must execute the audited recovery procedure via the official MongoDB Shell (`mongosh`).

#### Progressive Verification Gates Framework
To ensure complete operational integrity and eliminate premature completion assumptions, the break-glass procedure enforces three sequential, progressive gates:
1. **Gate A — Driver Acknowledged:** Required writes are acknowledged by the MongoDB driver (`acknowledged === true`), `matchedCount === 1`, and immediate post-write state checks pass (such as zero remaining active challenges).
2. **Gate B — Database Postconditions Verified:** Account fields (`twoFactorEnabled === false`, envelope fields undefined), monotonic `tokenVersion` increment, challenge invalidation (`activeChallenges === 0`), and the exact newly inserted audit record (`_id: auditInsertResult.insertedId`) are verified via executable assertions.
3. **Gate C — Functional Recovery Complete:** The prescribed administrator password login and mandatory MFA enrollment flow succeed (Test 4.2), and previously issued sessions are rejected with HTTP 401 (`AUTH_TOKEN_REVOKED`).

> [!IMPORTANT]
> **GATE INDEPENDENCE RULE**  
> No gate may be described or treated as passed merely because an earlier gate passed. Gate A does not imply Gate B; Gate B does not imply Gate C. Functional smoke tests remain operator instructions and must never be assumed complete without manual execution.

#### Supported Invocation Environment
Execute commands from an authorized secure bastion workstation using `mongosh` and the standard staging connection string environment variable (`MONGODB_URI`):
```bash
# Verify mongosh is installed (MongoDB 4.0+ supported; MongoDB 5.0+ / 6.0+ recommended)
mongosh --version

# Interactive session:
mongosh "$MONGODB_URI"

# Or non-interactive script execution (fails closed on any thrown exception):
mongosh "$MONGODB_URI" --file break_glass_recovery.js
```
*(Never log, echo, or commit the actual connection string or embedded database credentials.)*

---

#### 1. Authorization & Pre-Recovery Account Verification
1. Obtain explicit written authorization from the Lead SRE and Security Lead.
2. Confirm the target user account exists and verify its identity and administrative role before modifying data:
   ```javascript
   // Verify account role and current state (read-only verification)
   const targetAdmin = db.users.findOne({ email: "test-admin@staging.example.com" });
   if (!targetAdmin) {
     throw new Error("Target account 'test-admin@staging.example.com' not found. Aborting.");
   }
   if (!["admin", "super_admin"].includes(targetAdmin.role)) {
     throw new Error(`Target account role is '${targetAdmin.role}', which is not an administrative role. Aborting.`);
   }
   const priorTokenVersion = targetAdmin.tokenVersion ?? 0;
   ```

#### 2. Atomic Account Reset & Session Revocation (Gate A)
Execute the audited database mutation against the verified administrator record, asserting exact single-document mutation and immediate challenge termination:
```javascript
// Step 2.1: Reset MFA state, clear cryptographic envelopes, and increment tokenVersion to revoke all active sessions
const userResetResult = db.users.updateOne(
  {
    _id: targetAdmin._id,
    email: "test-admin@staging.example.com",
    role: { $in: ["admin", "super_admin"] }
  },
  {
    $set: {
      twoFactorEnabled: false
    },
    $inc: {
      tokenVersion: 1 // Atomically invalidates all existing JWTs and refresh tokens across all devices
    },
    $unset: {
      twoFactorSecret: "",
      twoFactorPendingSecret: "",
      twoFactorPendingExpiresAt: "",
      twoFactorRecoveryCodes: "",
      twoFactorEnrolledAt: "",
      lastTotpStep: ""
    }
  }
);

// Assert Gate A driver acknowledgment and exact single-document modification
if (!userResetResult.acknowledged) {
  throw new Error("GATE A FAILURE: User update was not acknowledged by MongoDB driver. Halting.");
}
if (userResetResult.matchedCount !== 1) {
  throw new Error(`GATE A FAILURE: Expected exactly 1 target user to match, but matched ${userResetResult.matchedCount}. Halting.`);
}
if (userResetResult.modifiedCount !== 1) {
  throw new Error(`GATE A FAILURE: Target user matched but was not modified (modifiedCount: ${userResetResult.modifiedCount}). Halting.`);
}

// Step 2.2: Terminate any in-flight pending or claimed MFA challenges for this administrator
const challengeResetResult = db.admin_mfa_challenges.updateMany(
  {
    userId: targetAdmin._id,
    state: { $in: ["pending", "claimed"] }
  },
  {
    $set: {
      state: "failed",
      failedAt: new Date()
    }
  }
);

// Assert Gate A driver acknowledgment for challenge termination
if (!challengeResetResult.acknowledged) {
  throw new Error("GATE A FAILURE: Challenge termination was not acknowledged by MongoDB driver. Halting.");
}

// Immediately verify zero active challenges remain for this administrator before proceeding
const remainingActiveChallenges = db.admin_mfa_challenges.countDocuments({
  userId: targetAdmin._id,
  state: { $in: ["pending", "claimed"] }
});
if (remainingActiveChallenges !== 0) {
  throw new Error(`GATE A FAILURE: ${remainingActiveChallenges} active challenges still remain for target administrator. Halting.`);
}
```

#### 3. Mandatory Audit Trail Recording (Gate A)
Record an audited record of the emergency intervention in the staging incident management system and `adminauditlogs` collection.

> [!IMPORTANT]
> **EXPLICIT OPERATOR ATTRIBUTION REQUIRED**  
> The audit record MUST attribute the action to the actual executing authorized operator (`OPERATOR_USER_ID`, `OPERATOR_EMAIL`, `OPERATOR_ROLE`). Never silently attribute operator actions to the target account. If an authorized administrator performs self-recovery via a privileged CLI session, `actorUserId` matches `targetAdmin._id`. For operator-mediated recovery, the operator's verified identity must be recorded.

```javascript
// Replace with the verified ObjectId, email, and administrative role of the executing Lead SRE / operator
const OPERATOR_USER_ID = ObjectId("..."); // e.g., ObjectId("650000000000000000000099")
const OPERATOR_EMAIL = "sre-lead@staging.example.com";
const OPERATOR_ROLE = "super_admin";

const auditInsertResult = db.adminauditlogs.insertOne({
  eventType: "ADMIN_USER_STATUS_UPDATED",
  actorUserId: OPERATOR_USER_ID,
  actorEmail: OPERATOR_EMAIL,
  actorRole: OPERATOR_ROLE,
  targetUserId: targetAdmin._id,
  targetEmail: targetAdmin.email,
  resourceType: "user",
  resourceId: String(targetAdmin._id),
  metadata: {
    action: "BREAK_GLASS_MFA_RESET",
    reason: "Staging validation recovery drill / lockout resolution",
    ticketId: "STAGING-INCIDENT-MFA-001",
    priorTokenVersion: priorTokenVersion,
    newTokenVersion: priorTokenVersion + 1,
    challengesTerminated: challengeResetResult.modifiedCount
  },
  ipAddress: "127.0.0.1",
  userAgent: "staging-cli-break-glass",
  createdAt: new Date()
});

// Assert Gate A driver acknowledgment and capture unique inserted identifier
if (!auditInsertResult.acknowledged || !auditInsertResult.insertedId) {
  throw new Error("GATE A FAILURE: Audit log insertion was not acknowledged or missing insertedId. Halting.");
}
```

#### 4. Safe Partial-Failure Handling & Stop-and-Reconcile Protocol
This procedure is **NOT idempotent**. Re-running the full procedure blindly will bump `tokenVersion` a second time, insert duplicate audit entries, and distort incident telemetry.

> [!WARNING]
> **BLIND RETRIES STRICTLY PROHIBITED**  
> Never blindly re-execute the entire script if any step fails. Never treat `twoFactorEnabled === false` alone as evidence that recovery completed. Cryptographic envelopes, active challenges, or audit trails may remain in a partially modified state.

If any command halts or throws an exception, follow this stop-and-reconcile protocol:
1. **Immediate Halt**: Cease all writes immediately.
2. **Execute Read-Only State Diagnostics**:
   Inspect the exact current database state without mutating any document:
   ```javascript
   const diagUser = db.users.findOne({ _id: targetAdmin._id });
   const diagActiveChallenges = db.admin_mfa_challenges.countDocuments({
     userId: targetAdmin._id,
     state: { $in: ["pending", "claimed"] }
   });
   const diagAudit = db.adminauditlogs.findOne({
     _id: typeof auditInsertResult !== "undefined" ? auditInsertResult?.insertedId : null
   });
   ```
3. **Structured Remediation Decisions**:
   - **Case 1: User update failed (Step 2.1 halted)**:
     - `diagUser.twoFactorEnabled` is still `true`. Target state was untouched.
     - Action: Safe to retry Step 2 after verifying permissions and network.
   - **Case 2: User update succeeded, but challenge update failed (Step 2.2 halted)**:
     - `diagUser.twoFactorEnabled` is `false`, `tokenVersion` is incremented, but `diagActiveChallenges > 0`.
     - Action: Do **NOT** re-run Step 2.1 (which would bump `tokenVersion` again). Re-run **only** the scoped challenge termination query for `userId: targetAdmin._id`.
   - **Case 3: Challenge update succeeded, but audit logging failed (Step 3 halted)**:
     - User reset and challenge invalidation are confirmed, but `auditInsertResult` was not acknowledged.
     - Action: Do **NOT** re-run Step 2. Inspect the audit log collection. Manually re-attempt Step 3 using the verified `priorTokenVersion` and `challengesTerminated` counts.
   - **Case 4: Ambiguous or Inconsistent State**:
     - If `diagUser` fields disagree or audit status is uncertain, halt immediately. Escalate to the Lead SRE and document the anomaly in incident ticket `STAGING-INCIDENT-MFA-001` before performing any further writes.
4. **Collection-Wide Operation Prohibition**:
   - **NEVER** execute broad, collection-wide operations (`deleteMany({})` or `drop()`) to recover from a partial failure. All corrective actions must remain strictly scoped to `targetAdmin._id`.

#### 5. Executable Postcondition Verification (Gate B)
Before releasing the account for login testing, the operator must execute this read-only checklist in `mongosh`. All assertions are executable and will throw an error immediately upon any discrepancy:

```javascript
// --- GATE B VERIFICATION SUITE ---

// 1. Verify User Document Postconditions
const postUser = db.users.findOne({ _id: targetAdmin._id });
if (!postUser) {
  throw new Error("GATE B FAILURE: Target administrator user document not found.");
}
if (postUser.twoFactorEnabled !== false) {
  throw new Error(`GATE B FAILURE: twoFactorEnabled is ${postUser.twoFactorEnabled}, expected false.`);
}
if (postUser.tokenVersion !== priorTokenVersion + 1) {
  throw new Error(`GATE B FAILURE: tokenVersion is ${postUser.tokenVersion}, expected ${priorTokenVersion + 1}.`);
}
const envelopeFields = [
  "twoFactorSecret",
  "twoFactorPendingSecret",
  "twoFactorPendingExpiresAt",
  "twoFactorRecoveryCodes",
  "twoFactorEnrolledAt",
  "lastTotpStep"
];
for (const field of envelopeFields) {
  if (postUser[field] !== undefined) {
    throw new Error(`GATE B FAILURE: Cryptographic envelope field '${field}' is still present on user.`);
  }
}

// 2. Verify Challenge Invalidation Postconditions
const activeChallenges = db.admin_mfa_challenges.countDocuments({
  userId: targetAdmin._id,
  state: { $in: ["pending", "claimed"] }
});
if (activeChallenges !== 0) {
  throw new Error(`GATE B FAILURE: Found ${activeChallenges} active challenges; expected 0.`);
}

// 3. Verify Exact Audit Record Postconditions (Scoped by Inserted ID)
const postAudit = db.adminauditlogs.findOne({ _id: auditInsertResult.insertedId });
if (!postAudit) {
  throw new Error(`GATE B FAILURE: Exact audit record ${auditInsertResult.insertedId} was not found in adminauditlogs.`);
}
if (postAudit.eventType !== "ADMIN_USER_STATUS_UPDATED") {
  throw new Error(`GATE B FAILURE: Audit eventType is '${postAudit.eventType}', expected 'ADMIN_USER_STATUS_UPDATED'.`);
}
if (String(postAudit.actorUserId) !== String(OPERATOR_USER_ID)) {
  throw new Error(`GATE B FAILURE: Audit actorUserId mismatch (${postAudit.actorUserId} !== ${OPERATOR_USER_ID}).`);
}
if (String(postAudit.targetUserId) !== String(targetAdmin._id)) {
  throw new Error(`GATE B FAILURE: Audit targetUserId mismatch (${postAudit.targetUserId} !== ${targetAdmin._id}).`);
}
if (postAudit.metadata?.ticketId !== "STAGING-INCIDENT-MFA-001") {
  throw new Error(`GATE B FAILURE: Audit ticketId mismatch.`);
}
if (postAudit.metadata?.newTokenVersion !== priorTokenVersion + 1) {
  throw new Error(`GATE B FAILURE: Audit newTokenVersion mismatch.`);
}

print("GATE B SUCCESS: All database postconditions verified successfully.");
```

#### 6. Functional Verification Smoke Tests (Gate C)
Following Gate B verification, the operator must manually execute the functional smoke tests to achieve Gate C:

1. **Session Invalidation Check**:
   - Confirm that any browser sessions, JWTs, or refresh tokens issued prior to the reset return HTTP 401 (`AUTH_TOKEN_REVOKED`).
2. **Password Authentication & Mandatory Re-Enrollment**:
   - Administrator logs in at `/api/v1/users/admin/login` using username and password.
   - Verify server response returns HTTP 200 with `mfaRequired: true` and `mfaEnrollmentRequired: true` (Test 4.2).
   - System immediately routes administrator to Test 4.2 (mandatory first-time authenticator enrollment). The administrator cannot reach administrative dashboard routes until fresh MFA enrollment is completed.
3. **Gate C Sign-Off**:
   - Upon successful completion of re-enrollment, record completion in Section 6 (Sign-Off Record).

---

## 6. Staging Deployment Sign-Off Record

*To be completed by the authorized staging operator following deployment and smoke-test execution.*

| Field | Record / Value |
|---|---|
| **Deployment Operator** | `___________________________________` |
| **Reviewer / SRE Lead** | `___________________________________` |
| **Date & Time (UTC)** | `YYYY-MM-DD HH:MM UTC` |
| **Target Environment** | Staging (`api.staging.example.com` / `admin.staging.example.com`) |
| **Pre-Deployment Rollback Artifact** | `[ ] Verified Staging Image Digest Recorded: _____________________` |
| **Deployed Release Artifact** | `[ ] Verified Release Commit/Tag or Container Image Digest: _____________________` |
| **Deployment Topology** | Single-Instance Container (`replicas=1`) behind TLS Reverse Proxy |
| **`MFA_ENCRYPTION_KEY` Status** | `[ ] Verified 64-char Hex (Secret Value Not Disclosed)` |
| **`TRUST_PROXY` & CORS Verified** | `[ ] Yes   [ ] No` |
| **Smoke Tests Completed (1-12)** | `[ ] 12/12 PASS   [ ] Exceptions (see below)` |
| **Known Exceptions / Risks** | `1. Rate limiting restricted to single-instance (MemoryStore).`<br>`2. Pre-existing return.test.js CSRF test failure accepted.` |
| **Rollback Plan Tested / Ready** | `[ ] Prior known-good container image digest verified in registry and ready for instant redeploy` |
| **Final Deployment Decision** | `[ ] APPROVED FOR STAGING DRILLS   [ ] REJECTED / ROLLED BACK` |
| **Operator Signature** | `___________________________________` |
