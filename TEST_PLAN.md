# CommerceFlow Testing Strategy and Verification Plan (TEST_PLAN.md)

> **Document Status**: Authoritative Testing & Verification Strategy
> **Repository Root**: repository root
> **Last-Reviewed Date**: October 14, 2026
> **Active Baseline Branch**: `feature/admin-expansion-staging-prep` (Target: `main`)
> **Related Architecture Documentation**: [`PRD.md`](./PRD.md) · [`ARCHITECTURE.md`](./ARCHITECTURE.md) · [`RULES.md`](./RULES.md) · [`TASKS.md`](./TASKS.md) · [`DECISIONS.md`](./DECISIONS.md) · [`MEMORY.md`](./MEMORY.md)

---

## 1. Document Information

### 1.1 Purpose and Scope
This document defines the comprehensive testing strategy, verification procedures, and release qualification criteria for the CommerceFlow platform. It establishes standards for local development verification, automated continuous integration (CI), and pre-release staging qualification across both [`commerceflow-api`](./commerceflow-api/) and [`commerceflow-web`](./commerceflow-web/).

### 1.2 Intended Readers
- Backend and frontend software engineers writing unit and integration tests.
- Code reviewers and maintainers evaluating pull request verification evidence.
- Quality assurance engineers and release managers conducting staging smoke tests.
- AI coding agents executing mandatory test workflows under [`RULES.md`](./RULES.md).

### 1.3 Classification of Test Statuses

| Status | Definition |
| :--- | :--- |
| **`Existing coverage`** | Verified test files actively exist in the repository tree and have documented execution patterns. |
| **`Planned tests`** | Recommended test scenarios or test files not yet implemented or merged. |
| **`Executed verification`** | Tests whose pass/fail execution results are verified and recorded from an actual run. |
| **`Release verification`** | Quality gates and smoke checks that must be executed directly in the target staging environment before production promotion. |

---

## 2. System Under Test (SUT)

| Component | Repository Subproject | Tech Stack | Test Framework | Test Boundary & Role |
| :--- | :--- | :--- | :--- | :--- |
| **Storefront SPA** | `commerceflow-web` | React 19, Vite 8, Tailwind v4 | Node Native Runner (`jiti/register`) | Browsing, catalog search, cart, checkout UI, customer auth |
| **Admin SPA** | `commerceflow-web` | React 19, Vite 8, Tailwind v4 | Node Native Runner (`jiti/register`) | AdminLayout, products, inventory, orders, reviews, banners, reports |
| **Backend API** | `commerceflow-api` | Node.js ESM, Express 5.2.1 | Vitest 5.0.0, Supertest 7.2.2 | REST endpoints under `/api/v1`, validation, business logic |
| **Persistence Layer** | `commerceflow-api` | MongoDB 7.0, Mongoose 9.9.5 | In-Memory / Docker Replica Set | Schema validation, unique/compound indexes, atomic `$inc` operations |
| **Auth & Security** | `commerceflow-api` | JWT, bcryptjs, Helmet | Vitest / Supertest | Bearer token auth, dual-role restrictions (`customer`, `admin`) |
| **Payment Gateway** | `commerceflow-api` | Razorpay Node SDK 2.9.8 | Mocked SDK in unit / Sandbox in E2E | Server paise calculation, timing-safe HMAC SHA-256, webhooks |
| **Deployment / CI** | Monorepo / GitHub | Docker, Alpine, GitHub Actions | CI Workflow (`.github/workflows/ci.yml`) | Container healthchecks, replica set startup, dependency audit |

---

## 3. Test Strategy

```mermaid
flowchart TD
    subgraph Level 1: Static Analysis & Fast Unit
        L1_A["ESLint (Frontend & Backend)"]
        L1_B["Zod Schema Unit Tests"]
        L1_C["Pure Utility & Calculation Tests (pricing.test.js)"]
    end

    subgraph Level 2: Component & Integration
        L2_A["Express Route + Supertest API Tests"]
        L2_B["React Component & Context Tests (jiti)"]
        L2_C["Mongoose Model Hooks & Index Tests"]
    end

    subgraph Level 3: Security & Data Integrity
        L3_A["Timing-Safe Signature Tests"]
        L3_B["Atomic Concurrency ($inc) & Rollback Tests"]
        L3_C["CLI Safety Helper Guard Tests"]
    end

    subgraph Level 4: Staging Smoke & Release Acceptance
        L4_A["Staging Container Healthcheck Probe"]
        L4_B["Live Razorpay Sandbox Checkout Journey"]
        L4_C["Webhook Idempotency & Raw Body Verification"]
    end

    Level 1 --> Level 2
    Level 2 --> Level 3
    Level 3 --> Level 4
```

1. **Unit Tests**: Verify isolated pure functions, domain calculations (paise conversion, order total summing), and Zod schema validation without database or network I/O.
2. **Integration Tests**: Verify Express routes with Supertest against in-memory or ephemeral MongoDB instances. Mongoose hooks, compound indexes, and atomic updates are asserted.
3. **Frontend Interaction Tests**: Execute via Node's native test runner (`node:test`) with `jiti/register` for JSX compilation. Tests assert component rendering, state transitions, context providers, and feature service communication.
4. **Security Tests**: Validate authorization boundaries, rate limiting enforcement, timing-safe cryptographic comparisons, and CLI bootstrap script fail-closed behavior.
5. **Staging Smoke Tests**: Conducted post-deployment on real cloud infrastructure with test credentials to verify edge TLS termination, webhook delivery, and database replica set connectivity.

---

## 4. Test Environments and Data Safety

### 4.1 Environments

| Environment | Purpose | Database | External Services | Data Safety Policy |
| :--- | :--- | :--- | :--- | :--- |
| **Local Dev / Test** | Developer testing, unit & integration test suites | Local standalone MongoDB (`mongodb://127.0.0.1:27017/commerceflow_test`) or in-memory | Mocked Razorpay SDK | Ephemeral test databases wiped between runs; developer data preserved. |
| **CI (GitHub Actions)** | Pull request validation on Ubuntu latest | Containerized MongoDB 7.0 Replica Set (`rs0`) | Mocked Razorpay SDK | Fully ephemeral container wiped after workflow completion. |
| **Staging** | Pre-release acceptance, smoke verification | Isolated managed MongoDB Replica Set (Atlas cluster) | Razorpay Test Mode (`rzp_test_*`) | Synthetic test data only; NO real customer data or live cards. |
| **Production** | Live customer operations | Production MongoDB Cluster | Razorpay Live Mode | **MUTATING TESTS STRICTLY FORBIDDEN**. |

### 4.2 Data Safety Rules `[Mandatory]`
1. **Never Test Mutations on Production**: Automated test suites and exploratory tests MUST NEVER run against production databases or live Razorpay credentials.
2. **Deterministic Test Isolation**: Every test creating database records MUST generate unique identifiers (e.g., `test-${Date.now()}-${Math.random()}@example.com`) and clean up created documents in `afterEach` or `afterAll` hooks.
3. **Zero Secrets in Test Code**: Tests MUST use dummy test keys (e.g., `rzp_test_mock_key_id`, `test-jwt-secret-key-at-least-32-chars-long`).

---

## 5. How to Run Tests

### 5.1 Verified Package Commands

| Project Area | Task | Verified Command Line | Working Directory | Prerequisites |
| :--- | :--- | :--- | :--- | :--- |
| **Backend API** | Run full test suite | `npm test` (`vitest run`) | `commerceflow-api/` | Dependencies installed (`npm ci`) |
| **Backend API** | Targeted single test file | `npx vitest run <path/to/test.js>` | `commerceflow-api/` | Dependencies installed |
| **Backend API** | Watch mode | `npm run test:watch` (`vitest`) | `commerceflow-api/` | Dependencies installed |
| **Backend API** | Dependency security audit | `npm audit` | `commerceflow-api/` | Active network connection |
| **Frontend Web** | Run full test suite | `npm test` (`node scripts/run-tests.js`) | `commerceflow-web/` | Dependencies installed (`npm ci`) |
| **Frontend Web** | Targeted single test file | `node scripts/run-tests.js <path/to/test.js>` | `commerceflow-web/` | Dependencies installed |
| **Frontend Web** | Linting verification | `npm run lint` (`eslint .`) | `commerceflow-web/` | Dependencies installed |
| **Frontend Web** | Production build check | `npm run build` (`vite build`) | `commerceflow-web/` | Dependencies installed |
| **Repository** | Git whitespace / conflict check | `git diff --check` | `.` | Git CLI available |

---

## 6. Backend Test Plan

| ID | Priority | Area | Scenario | Expected Result | Existing Coverage | Environment | Status |
| :--- | :---: | :--- | :--- | :--- | :--- | :---: | :---: |
| **BE-001** | **P0** | Auth | User registration with invalid email/password | HTTP 400 `VALIDATION_ERROR` with field details | [`register-rate-limit.test.js`](./commerceflow-api/src/modules/users/register-rate-limit.test.js) | Test DB | Existing coverage |
| **BE-002** | **P0** | Auth | User login with valid credentials | HTTP 200 returning signed JWT token and user profile | [`login-user.controller.test.js`](./commerceflow-api/src/modules/users/login-user.controller.test.js) | Test DB | Existing coverage |
| **BE-003** | **P0** | Auth | Rapid login attempts (>10 in 15 min) | HTTP 429 `AUTH_RATE_LIMIT_EXCEEDED` | [`login-rate-limit.test.js`](./commerceflow-api/src/modules/users/login-rate-limit.test.js) | Test DB | Existing coverage |
| **BE-004** | **P0** | Auth / Role | Customer accessing `/api/v1/admin/*` | HTTP 403 `FORBIDDEN_RESOURCE` | [`user-role-auth.test.js`](./commerceflow-api/src/modules/users/user-role-auth.test.js) | Test DB | Existing coverage |
| **BE-005** | **P0** | Auth / Role | Admin accessing `/api/v1/admin/test` | HTTP 200 `{ success: true, message: "Welcome Admin" }` | [`admin-login.test.js`](./commerceflow-api/src/modules/users/admin-login.test.js) | Test DB | Existing coverage |
| **BE-006** | **P1** | Cart | Add out-of-stock item (`stock = 0`) to cart | HTTP 400 `INSUFFICIENT_STOCK` | [`cart.controller.test.js`](./commerceflow-api/src/modules/cart/cart.controller.test.js) | Test DB | Existing coverage |
| **BE-007** | **P1** | Cart | Empty HTTP DELETE to `/api/v1/cart/items/:id` | HTTP 200 item removed (currently fails 400 due to schema) | [`cart-delete.route.test.js`](./commerceflow-api/src/modules/cart/cart-delete.route.test.js) | Test DB | Planned tests |
| **BE-008** | **P0** | Orders | Order checkout with atomic stock decrement | Product stock decremented via `$inc: -quantity`; order created | [`order.controller.test.js`](./commerceflow-api/src/modules/orders/order.controller.test.js) | Test DB | Existing coverage |
| **BE-009** | **P0** | Orders | Order cancellation lifecycle | Order status set to `'cancelled'`; stock restored via `$inc: quantity` | [`cancel-order.controller.test.js`](./commerceflow-api/src/modules/orders/cancel-order.controller.test.js) | Test DB | Existing coverage |
| **BE-010** | **P0** | Payments | Convert order total to paise | Floating point safe paise integer (`Math.round(total * 100)`) | [`pricing.test.js`](./commerceflow-api/src/utils/pricing.test.js) | Unit | Existing coverage |
| **BE-011** | **P0** | Payments | Verify client signature with invalid hash | Rejected with HTTP 400 via `crypto.timingSafeEqual` | [`verify-payment.controller.test.js`](./commerceflow-api/src/modules/payments/verify-payment.controller.test.js) | Mock SDK | Existing coverage |
| **BE-012** | **P0** | Payments | Webhook idempotency on duplicate event delivery | First delivery updates order; duplicate returns HTTP 200 without re-processing | [`webhook.controller.test.js`](./commerceflow-api/src/modules/payments/webhook.controller.test.js) | Test DB | Existing coverage |
| **BE-013** | **P1** | Reviews | Admin approves pending review | Review status becomes `'approved'`; product average rating recalculated | [`admin-review.controller.test.js`](./commerceflow-api/src/modules/reviews/admin-review.controller.test.js) | Test DB | Existing coverage |
| **BE-014** | **P1** | Banners | Admin creates banner with scheduling dates | Banner record saved; query filters active by current date | [`banner.test.js`](./commerceflow-api/src/modules/banners/banner.test.js) | Test DB | Existing coverage |
| **BE-015** | **P0** | Operations | CLI script execution with `NODE_ENV=production` | Script terminates non-zero with security warning | [`safety-helper.test.js`](./commerceflow-api/scripts/safety-helper.test.js) | Unit | Existing coverage |
| **BE-016** | **P0** | Health | Liveness probe `GET /api/v1/health/live` | HTTP 200 `{ status: "alive" }` | [`health.routes.test.js`](./commerceflow-api/src/routes/health.routes.test.js) | HTTP | Existing coverage |
| **BE-017** | **P0** | Health | Readiness probe `GET /api/v1/health/ready` | HTTP 200 if MongoDB connected; HTTP 503 if disconnected | [`health.routes.test.js`](./commerceflow-api/src/routes/health.routes.test.js) | HTTP | Existing coverage |

---

## 7. Frontend Test Plan

| ID | Priority | Area | Scenario | Expected Result | Existing Coverage | Status |
| :--- | :---: | :--- | :--- | :--- | :--- | :---: |
| **FE-001** | **P1** | Storefront | Render product details with image and price | Title, price, description, and "Add to Cart" button visible | [`ProductPage.test.js`](./commerceflow-web/src/pages/ProductPage.test.js) | Existing coverage |
| **FE-002** | **P1** | Storefront | Guest user adds item to cart | Item stored in guest local cart storage; counter badge increments | [`guestCart.ui.test.js`](./commerceflow-web/src/features/cart/guestCart.ui.test.js) | Existing coverage |
| **FE-003** | **P1** | Storefront | Guest cart merge upon customer login | Guest items dispatched to `/api/v1/cart/merge` and integrated into server cart | [`cart.context.test.js`](./commerceflow-web/src/features/cart/cart.context.test.js) | Existing coverage |
| **FE-004** | **P0** | Admin | Unauthenticated user navigates to `/admin` | Redirected to `/admin/login` or storefront login | [`AdminRoute.test.jsx`](./commerceflow-web/src/routes/AdminRoute.test.jsx) | Existing coverage |
| **FE-005** | **P1** | Admin | Admin layout responsive sidebar toggle | Sidebar collapses on mobile; breadcrumbs accurately reflect route | [`adminLayout.ui.test.js`](./commerceflow-web/src/layouts/admin/adminLayout.ui.test.js) | Existing coverage |
| **FE-006** | **P1** | Admin | Admin navigation items match route definitions | Active link highlighted; all 16 navigation paths correspond to valid routes | [`adminNavConfig.test.js`](./commerceflow-web/src/layouts/admin/adminNavConfig.test.js) | Existing coverage |
| **FE-007** | **P1** | Admin | Review moderation table actions | Admin can click "Approve" / "Reject"; service invokes backend endpoints | [`adminReview.service.test.js`](./commerceflow-web/src/features/admin/adminReview.service.test.js) | Existing coverage |
| **FE-008** | **P1** | Admin | Banner creation and active toggle | Admin creates banner; service dispatches to backend banner route | [`adminBanner.service.test.js`](./commerceflow-web/src/features/admin/adminBanner.service.test.js) | Existing coverage |
| **FE-009** | **P2** | Admin | Client prototype disclosure on Finance page | Clear visual prototype banner informing user that data is saved locally | [`AdminFinancePage.jsx`](./commerceflow-web/src/pages/admin/AdminFinancePage.jsx) | Planned tests |
| **FE-010** | **P2** | Shared | 5-State UI Handling on product list | Skeletons during loading, error banner on failure, empty view on 0 items | [`ProductPage.test.js`](./commerceflow-web/src/pages/ProductPage.test.js) | Existing coverage |
| **FE-011** | **P2** | A11y | Modal dialog keyboard navigation | Focus trapped inside modal; `Escape` key dismisses modal dialog | `AdminLayout` / Modal components | Planned tests |

---

## 8. API Contract and Integration Tests

### 8.1 Response Envelope Invariant `[Accepted]`
All API endpoints mounted under `/api/v1` MUST conform to standard contract envelopes:

- **Success Envelope (HTTP 200, 201)**:
  ```json
  {
    "success": true,
    "data": {},
    "message": "Optional descriptive string"
  }
  ```
- **Error Envelope (HTTP 400, 401, 403, 404, 409, 429, 500)**:
  ```json
  {
    "success": false,
    "error": {
      "code": "ERROR_CODE_STRING",
      "message": "Safe human-readable message",
      "details": []
    },
    "requestId": "uuid-string"
  }
  ```

### 8.2 Contract Integration Test Scenarios
- **Pagination Boundary Assertions**: `GET /api/v1/products?page=1&limit=10` returns `data.items`, `data.pagination.page`, `data.pagination.totalPages`. Requesting `limit=1000` is clamped to maximum limit 100.
- **ObjectId Format Validation**: Passing malformed IDs (`GET /api/v1/products/invalid-id-123`) is caught by Zod parameter validation and returns HTTP 400 `INVALID_ID` without executing database queries.
- **Header Propagation**: `x-request-id` header returned in HTTP response matches `requestId` in JSON error payload for log correlation.

---

## 9. Security and Data-Integrity Tests

| Security Domain | Threat / Vulnerability Vector | Test Scenario | Verified Mitigation |
| :--- | :--- | :--- | :--- |
| **Authentication** | Token forgery / Tampered payload | Send request with altered signature `Bearer header.payload.badsig` | Rejected HTTP 401 `INVALID_AUTH_TOKEN` via `auth.middleware.js`. |
| **Authorization** | Horizontal privilege escalation | Customer A requests `GET /api/v1/orders/:orderIdOfCustomerB` | Query scoped to `{ _id: orderId, user: req.user.id }`; returns 404. |
| **Admin Protection** | Vertical privilege escalation | Authenticated customer calls `DELETE /api/v1/admin/products/:id` | Intercepted by `authorize('admin')`; returns HTTP 403 `FORBIDDEN`. |
| **Input Validation** | NoSQL query injection | Send `{ email: { "$gt": "" } }` in registration body | Zod rejects non-string values with HTTP 400 `VALIDATION_ERROR`. |
| **Brute Force** | Credential stuffing / Dictionary attack | Send 11 rapid login attempts for a single IP within 15 minutes | `authRateLimitMiddleware` returns HTTP 429 `AUTH_RATE_LIMIT_EXCEEDED`. |
| **Payment Integrity** | Price / Amount tampering | Client creates order with manipulated `total: 1` | Server recalculates order total from DB product price; client total ignored. |
| **Payment Signature** | Timing side-channel attack | Signature comparison timing variance | `crypto.timingSafeEqual` prevents byte-by-byte timing leakage. |
| **Webhook Delivery** | Replay attack / Duplicate billing | Webhook sender re-transmits `payment.captured` event | Unique index on `WebhookEvent.eventId` blocks duplicate processing. |
| **CLI Admin Script** | Accidental production mutation | Execute `node scripts/create-admin.js` with `NODE_ENV=production` | `safety-helper.js` halts process with exit code 1 unless `--force-production` passed. |
| **Log Exposure** | Sensitive credential leakage | Customer registers with password or logs in | Pino redaction replaces passwords, JWTs, and payment secrets with `"[REDACTED]"`. |

---

## 10. End-to-End Critical User Journeys

### Journey 1: Storefront Browsing and Product Inspection
- **Preconditions**: Backend running, catalog populated with active products.
- **Steps**:
  1. Navigate to `/`.
  2. Verify StorefrontHero and catalog product cards render with title, image, and price.
  3. Click a product card to navigate to `/products/:id`.
- **Expected Result**: Product details, stock status, and variant options render cleanly.
- **Status**: Executable.

### Journey 2: Shopping Cart and Checkout in Test Mode
- **Preconditions**: In-stock product exists in database, user authenticated.
- **Steps**:
  1. Add product to cart with quantity 1.
  2. Navigate to `/cart`, verify subtotal.
  3. Click "Proceed to Checkout", select shipping address.
  4. Initiate Razorpay payment (sandbox modal opens with `rzp_test_*` key).
  5. Complete payment using Razorpay test success card.
- **Expected Result**: Order transitions to `'pending'`/`'processing'`; product stock decrements atomically; cart clears.
- **Status**: Executable in test mode.

### Journey 3: Customer Account Authentication Flow
- **Preconditions**: Database clean, user not registered.
- **Steps**:
  1. Navigate to `/register`, submit unique email and valid password.
  2. Receive HTTP 201; redirect to login or dashboard.
  3. Navigate to `/login`, submit credentials.
- **Expected Result**: JWT Bearer token received; customer profile loads on `/account` or `/profile`.
- **Status**: Executable.

### Journey 4: Unauthorized User Admin Boundary Rejection
- **Preconditions**: Registered customer user (role: `'customer'`).
- **Steps**:
  1. Log in as customer.
  2. Attempt to navigate directly to `/admin` or `/admin/products`.
  3. Send HTTP `GET /api/v1/admin/orders` carrying customer Bearer token.
- **Expected Result**: UI redirects away from admin shell; API returns HTTP 403 `FORBIDDEN_RESOURCE`.
- **Status**: Executable.

### Journey 5: Authorized Admin Management Operations
- **Preconditions**: Admin user created via `create-admin.js` (role: `'admin'`).
- **Steps**:
  1. Log in via `/admin/login`.
  2. Access `/admin/dashboard`, verify revenue metrics and quick actions render.
  3. Navigate to `/admin/inventory`, update stock for a product.
- **Expected Result**: Stock value updates in MongoDB; updated inventory reflected in storefront catalog.
- **Status**: Executable.

### Journey 6: Banner Publication and Visibility Scheduling
- **Preconditions**: Admin authenticated.
- **Steps**:
  1. Navigate to `/admin/banners`.
  2. Create a banner with `startDate` (yesterday) and `endDate` (tomorrow), `isActive: true`.
  3. Visit storefront `/`.
- **Expected Result**: Banner appears in storefront hero banner carousel.
- **Status**: Executable.

### Journey 7: Review Moderation and Product Rating Consistency
- **Preconditions**: Customer has purchased a product and submitted a review.
- **Steps**:
  1. Admin navigates to `/admin/reviews`.
  2. Review appears with status `'pending'`.
  3. Admin clicks "Approve".
- **Expected Result**: Review status updates to `'approved'`; product's `averageRating` and `reviewCount` recalculate accurately.
- **Status**: Executable.

### Journey 8: Promotional Coupon Application and Boundary Enforcement
- **Preconditions**: Coupon `SAVE10` configured in database (10% discount, min order ₹500).
- **Steps**:
  1. Add ₹300 item to cart; apply `SAVE10` -> Expected rejection: minimum order requirement not met.
  2. Add ₹600 item to cart; apply `SAVE10` -> Expected success: ₹60 discount applied to order subtotal.
- **Expected Result**: Discount calculated server-side; order total reflects applied discount.
- **Status**: Executable.

### Journey 9: Order Cancellation and Inventory Restoration
- **Preconditions**: Placed order in `'pending'` or `'processing'` status.
- **Steps**:
  1. Customer or Admin triggers order cancellation via `PATCH /api/v1/orders/:id/cancel`.
- **Expected Result**: Order status changes to `'cancelled'`; product stock restored via atomic `$inc`.
- **Status**: Executable.

### Journey 10: Staging Runtime Readiness and Health Probe Verification
- **Preconditions**: Staging container deployed.
- **Steps**:
  1. Send `GET /api/v1/health/live`.
  2. Send `GET /api/v1/health/ready`.
- **Expected Result**: `/live` returns HTTP 200; `/ready` returns HTTP 200 with `dependencies.mongodb.status: "connected"`.
- **Status**: Release verification.

---

## 11. Performance, Reliability, and Accessibility Checks

### 11.1 Performance & Load
- **Catalog Query Latency**: Catalog queries (`GET /api/v1/products`) should respond in $<100\text{ms}$ under normal local development conditions. *(Formal SLA thresholds require product owner approval).*
- **Pagination Protection**: Enforce that queries without explicit `limit` default safely to 10 or 20 items, with a strict ceiling of 100 items to prevent memory exhaustion.

### 11.2 Reliability & Fault Tolerance
- **Database Disconnect Graceful Recovery**: If MongoDB connection drops, `GET /api/v1/health/ready` must return HTTP 503 `not_ready` so upstream load balancers route traffic away.
- **Double-Click Submission Prevention**: Storefront checkout and admin mutation buttons must enter a `disabled` state with a loading indicator during in-flight network requests.

### 11.3 Accessibility (WCAG 2.1 AA Target)
- **Keyboard Trapping**: Admin modal dialogs must trap keyboard focus while open and close upon `Escape` keypress.
- **Form Labels**: Every input in storefront checkout and admin creation forms must have an explicit `<label>` or `aria-label`.
- **Contrast**: Text elements must satisfy minimum contrast ratios (4.5:1 for normal text) using Tailwind design system tokens.

---

## 12. Staging Smoke-Test Checklist

Before promoting a release candidate from staging to production, the release engineer must verify each item:

- [ ] **1. Public Domain & TLS**: Staging storefront (`https://<STAGING_FRONTEND_DOMAIN>`) and API (`https://<STAGING_API_DOMAIN>`) load over valid HTTPS without SSL/TLS certificate warnings.
- [ ] **2. Health Probes**: `GET /api/v1/health/live` returns HTTP 200; `GET /api/v1/health/ready` returns HTTP 200 and `readyState: 1`.
- [ ] **3. CORS Configuration**: Requests from staging frontend origin succeed; requests from unauthorized origins return `access-control-allow-origin: null`.
- [ ] **4. Database Isolation**: Verified staging backend connects to dedicated `commerceflow_staging` database on a replica set cluster, NOT local or production databases.
- [ ] **5. Razorpay Sandbox Mode**: Verified backend environment has `RAZORPAY_KEY_ID` starting with `rzp_test_`. Live payments are strictly prohibited.
- [ ] **6. Webhook Delivery**: Webhook URL configured in Razorpay Test Dashboard; test payment trigger updates staging order status to `'paid'` with valid HMAC verification.
- [ ] **7. Storefront Commerce Flow**: Complete Journey 1, Journey 2, and Journey 3 end-to-end on the staging URL.
- [ ] **8. Admin Back-Office Operations**: Admin logs in, updates product stock, moderates a review, and verifies storefront updates.
- [ ] **9. Log Redaction Verification**: Inspect staging container stdout logs; confirm passwords, authorization headers, and payment secrets appear as `"[REDACTED]"`.
- [ ] **10. Zero Secrets in Client Bundle**: Inspect compiled JavaScript files in browser dev tools Network tab; verify no `JWT_SECRET`, `MONGODB_URI`, or `RAZORPAY_KEY_SECRET` appear in frontend static assets.

---

## 13. Test Data Management and Cleanup

1. **Test User Conventions**: Test customer emails must use the pattern:
   `test.user.<timestamp>.<random>@example.com`
2. **Deterministic Fixtures**: Product fixtures for testing should use fixed category slugs (`test-category`) and SKUs (`TEST-SKU-001`).
3. **Automated Teardown**: Integration tests must delete test documents created during execution:
   ```javascript
   afterAll(async () => {
     await User.deleteMany({ email: /@example\.com$/ });
     await Product.deleteMany({ sku: /^TEST-/ });
   });
   ```
4. **No Destructive Database Commands**: Tests MUST NOT call `mongoose.connection.dropDatabase()` or `db.dropDatabase()` on remote or shared staging clusters.

---

## 14. Defect Severity and Triage Guidelines

| Severity Level | Definition | Response Expectation | Example Defect |
| :--- | :--- | :--- | :--- |
| **`Critical`** | Security vulnerability, customer credential exposure, financial calculation discrepancy, or unrecoverable database corruption. | Immediate release blocker. Fix before any deployment. | Payment verified with mismatched paise amount; customer able to access another customer's order. |
| **`High`** | Core commerce flow broken without a workaround; persistent application crash. | Must be resolved before staging release sign-off. | Cart checkout fails for all authenticated users; stock not restored upon cancellation. |
| **`Medium`** | Important feature impaired, but functional workaround exists. | Prioritized for next planned sprint or patch release. | Empty HTTP DELETE fails on cart API; coupon code error message unformatted. |
| **`Low`** | Minor visual defect, cosmetic alignment issue, or typo. | Scheduled according to regular roadmap capacity. | Breadcrumb typo on admin settings page; minor button padding inconsistency on mobile. |

### Standard Defect Report Template
```markdown
### Defect: [Short descriptive title]
- **Severity**: Critical / High / Medium / Low
- **Component**: Backend API / Storefront Web / Admin Web / Database
- **Affected Endpoints / Files**: `src/modules/...`
- **Reproduction Steps**:
  1. [Step 1]
  2. [Step 2]
- **Expected Result**: [What should have happened]
- **Actual Result**: [What actually happened, including HTTP status code]
- **Logs / Evidence**: [Sanitized error message, request ID, or test failure output]
- **Impact & Workaround**: [Business impact and whether workaround exists]
```

---

## 15. Exit Criteria (Release Qualification)

A release candidate is qualified for production deployment only when all of the following exit criteria are satisfied:

- [ ] **Zero Critical Defects**: No open Critical severity defects exist in the backlog.
- [ ] **High Defects Triaged**: All High severity defects are resolved or explicitly signed off by the engineering lead.
- [ ] **Test Suites Green**:
  - Backend Vitest suite passes without unexpected failures.
  - Frontend test suite (`node scripts/run-tests.js`) passes 100%.
  - Frontend linter (`npm run lint`) reports 0 errors and 0 warnings.
  - Frontend production build (`npm run build`) compiles cleanly without bundle errors.
- [ ] **Documented Skipped Tests**: All skipped tests (e.g., tests requiring live Redis) are explicitly documented with justifications.
- [ ] **Security Invariants Verified**: Password hashing, timing-safe payment comparisons, and Pino log redactions are confirmed.
- [ ] **Staging Smoke Checklist Complete**: All 10 items in Section 12 are verified and signed off.
- [ ] **Documentation Aligned**: Changes to schemas, endpoints, or design tokens are reflected in [`PRD.md`](./PRD.md), [`ARCHITECTURE.md`](./ARCHITECTURE.md), [`RULES.md`](./RULES.md), and [`DECISIONS.md`](./DECISIONS.md).

---

## 16. Test Coverage Gaps and Next Actions

The following high-priority testing tasks are tracked for immediate implementation:

| Action ID | Priority | Category | Required Outcome | Acceptance Criteria | Dependencies |
| :--- | :---: | :--- | :--- | :--- | :--- |
| **`BE-TEST-001`** | **P1** | Backend API | Regression test for empty HTTP DELETE on cart and wishlist | `DELETE /api/v1/cart/items/:id` with null body returns HTTP 200 | Fix schema in `cart.validator.js` ([`BLK-002`](./TASKS.md#blk-002)) |
| **`FE-TEST-001`** | **P1** | Frontend Web | Add frontend test and lint execution to GitHub Actions CI | `.github/workflows/ci.yml` runs `npm test` and `npm run lint` for `commerceflow-web` | CI Pipeline Configuration |
| **`SEC-TEST-001`** | **P1** | Security | Automated test asserting external URLs in banners use HTTPS | Banner validator rejects `http://` and `javascript:` URLs with HTTP 400 | Banner Validator Update |
| **`E2E-TEST-001`** | **P2** | E2E Tests | Automated Playwright / Cypress smoke test for checkout flow | Headless browser completes Journey 1 through Journey 3 against local servers | Test Tooling Selection |
| **`STAGE-TEST-001`** | **P1** | Staging | Post-deployment smoke script executing health probes and CORS checks | Script queries staging endpoints and validates JSON envelope schema | Staging Provisioning |

---

## 17. Evidence and References

### Inspected Test Files & Configurations
- **Backend Test Suite**: 117 test files in `commerceflow-api/src/` (covering modules, middleware, models, and scripts).
- **Frontend Test Suite**: 55+ test files in `commerceflow-web/src/` executed via [`scripts/run-tests.js`](./commerceflow-web/scripts/run-tests.js).
- **Backend CI Workflow**: [`commerceflow-api/.github/workflows/ci.yml`](./commerceflow-api/.github/workflows/ci.yml) (Node 22, Mongo 7.0 replica set `rs0`, `npm test`, `npm audit`).
- **Container Configuration**: [`commerceflow-api/Dockerfile`](./commerceflow-api/Dockerfile) (HTTP health check on `/api/v1/health/live`).

### Historical Test Baselines (Recorded from Previous Runs)
- **Backend Vitest Baseline**: 117 test files, 1,810 tests passing, 18 skipped.
- **Frontend Baseline**: 191 test suites, 733 tests passing, 0 failures.
- **System Audit Baseline (Sept 30, 2026)**: Backend 434 tests / 46 files; Frontend 199 tests / 45 files; ESLint clean; Vite build in 408ms.
