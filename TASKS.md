# CommerceFlow Project Task Tracker (TASKS.md)

> **Document Status**: Authoritative Project Task Registry & Roadmap
> **Repository Root**: repository root
> **Last-Reviewed Date**: October 14, 2026
> **Active Baseline Branch**: `feature/admin-expansion-staging-prep` (Target: `main`)
> **Related Architecture Documentation**: [`PRD.md`](./PRD.md), [`ARCHITECTURE.md`](./ARCHITECTURE.md), [`DESIGN.md`](./DESIGN.md), [`RULES.md`](./RULES.md)

---

## 1. Document Overview

### 1.1 Purpose
This document provides a single, evidence-backed source of truth for all outstanding development, testing, security, infrastructure, and staging preparation tasks across CommerceFlow (`commerceflow-api` and `commerceflow-web`).

### 1.2 Status Definitions
Every task in this tracker is classified strictly according to verified evidence:

| Status | Definition |
| :--- | :--- |
| **`Done`** | Implementation is complete, and verified by passing test suites or direct codebase inspection. |
| **`In progress`** | Implementation or test verification has begun and code exists in the working tree, but full verification or review remains incomplete. |
| **`Blocked`** | Cannot proceed until an external dependency, architectural decision, or infrastructure requirement (e.g., MongoDB Replica Set, payment webhook tunnel) is resolved. |
| **`Not started`** | Confirmed outstanding requirement or defect identified by audit or specification, with zero active implementation. |
| **`Needs verification`** | Implementation appears present or documented, but cannot be confirmed without live runtime execution or staging access. |
| **`Proposed`** | A forward-looking technical or UX improvement; not a current release blocker. |

### 1.3 Priority Definitions

| Priority | Level | Definition |
| :--- | :--- | :--- |
| **P0** | **Critical** | Security vulnerability, data loss risk, or immediate release blocker with verified evidence. Must be resolved before any deployment. |
| **P1** | **High** | Essential core feature completion, significant reliability concern, or required staging-readiness prerequisite. |
| **P2** | **Medium** | Important functional polish, accessibility improvement, test coverage expansion, or maintainability task. |
| **P3** | **Low** | Non-blocking enhancement, performance optimization, or optional developer convenience. |

> [!NOTE]
> **Dynamic Status Policy**: Task statuses and metrics MUST be updated only when new, verified evidence (such as test runs, git diff reviews, or infrastructure provisioning) is produced. Never mark a task `Done` without tangible evidence.

---

## 2. Current Project Snapshot

### 2.1 Git and Working Tree State (As of October 14, 2026)
- **Active Branch**: `feature/admin-expansion-staging-prep`
- **Git Index**: Clean (0 staged files, `git diff --cached --stat` empty).
- **Working Tree Context**:
  - Tracked modifications in `commerceflow-api/scripts/` (`safety-helper.js`, `create-admin.js`, `promote-admin.js`), `commerceflow-api/src/modules/reviews/`, `commerceflow-api/src/routes/admin.routes.js`, and `commerceflow-web/src/layouts/admin/`.
  - Untracked architectural documentation: [`PRD.md`](./PRD.md), [`ARCHITECTURE.md`](./ARCHITECTURE.md), [`DESIGN.md`](./DESIGN.md), [`RULES.md`](./RULES.md).
  - Untracked expansion modules: Banner routes/controllers (`commerceflow-api/src/modules/banners/`), admin review routes (`commerceflow-api/src/modules/reviews/`), and new admin frontend views (`AdminBannersPage.jsx`, `AdminReviewsPage.jsx`, `AdminCouponsPage.jsx`, `AdminFinancePage.jsx`, etc.).
  - All existing changes are preserved.

### 2.2 Technology Stack
- **Backend API (`commerceflow-api`)**: Node.js `>=20` (Node 22 runtime in Docker), Express `5.2.1` (native ESM `"type": "module"`), Mongoose `9.9.5`, Zod `4.5.4`, Pino `10.3.1`, Razorpay `2.9.8`, Vitest `5.0.0`, Supertest `7.2.2`.
- **Frontend SPA (`commerceflow-web`)**: React `19.2.8`, Vite `8.3.0`, Tailwind CSS `4.3.3` (`@tailwindcss/vite`), ESLint `10.11.0`.
- **Database & Storage**: MongoDB 7.0 (local standalone on port 27017 / Replica Set `rs0` in CI).
- **Payment Gateway**: Razorpay (server-authoritative order creation, HMAC SHA-256 signature verification, raw body webhook validation).

### 2.3 Major Implemented Areas
- **Storefront & Customer Commerce**: User authentication (JWT, bcrypt), product catalog with text search/category filtering, shopping cart with atomic stock checks, wishlist, shipping address management, checkout, order lifecycle (pending $\rightarrow$ processing $\rightarrow$ shipped $\rightarrow$ delivered / cancelled with atomic stock restoration).
- **Payment Pipeline**: Server-side paise conversion (`toPaise`), Razorpay order generation, timing-safe HMAC verification (`crypto.timingSafeEqual`), and raw-buffer webhook processing with `WebhookEvent` idempotency tracking.
- **Admin Core**: Protected `/api/v1/admin/*` endpoints (`authorize('admin')`), admin dashboard metrics, product management, inventory management, customer management, order fulfillment, audit logs, returns, and refunds.

### 2.4 Historical Test Baselines (From Previous Verifications)
The following figures represent recorded historical test results from the test suites and system audit; they are **not** freshly executed tests in this documentation turn:
- **Backend Vitest Historical Baseline**: 117 test files, 1,810 tests passing, 18 skipped (tests requiring live Redis or MongoDB replica sets).
- **Frontend Test Historical Baseline**: 191 test suites, 733 tests passing, 0 failures.
- **System Audit Historical Baseline (Sept 30, 2026)**: Backend (46 suites / 434 tests passing), Frontend (45 suites / 199 tests passing), ESLint (0 errors, 0 warnings), Vite build (408ms, 275 kB JS bundle).

### 2.5 Confirmed Limitations & Known Gaps
1. **Redis Not Connected in Code**: While `"redis": "^6.2.1"` is in backend `package.json` and a local Redis daemon runs on port 6379, directory `commerceflow-api/src/infrastructure/redis` is empty. The application currently operates with zero Redis caching or queue backing.
2. **Rate Limiting is In-Memory**: Global and auth rate limiters use memory stores, meaning hit counts are per-instance and not shared across horizontally scaled containers.
3. **No Background Workers / Queues**: No Bull/BullMQ or Agenda queue exists; all email, webhook, and stock operations run synchronously.
4. **Client-Side Prototypes in Admin UI**: Admin Finance (`AdminFinancePage.jsx`) and Campaigns (`AdminCampaignsPage.jsx`) use browser `localStorage`. Achievements (`AdminAchievementsPage.jsx`) uses in-memory state. No backend persistence exists for these three modules.
5. **Strict DELETE Body Schema**: `DELETE /api/v1/cart/items/:productId` and wishlist delete endpoints require `body: z.object({})` without `.optional()`, failing standard empty HTTP DELETE calls from non-browser clients.
6. **No Frontend CI Job**: GitHub Actions workflow (`.github/workflows/ci.yml`) only runs backend tests; frontend build, lint, and tests are not currently verified in CI.

---

## 3. Release Blockers and Critical Risks

| Task ID | Priority | Status | Risk / Blocker | Evidence & File Paths | Required Action | Acceptance Criteria | Dependencies |
| :--- | :---: | :---: | :--- | :--- | :--- | :--- | :--- |
| **BLK-001** | **P0** | **In progress** | Accidental CLI database mutation on staging or production databases | [`commerceflow-api/scripts/create-admin.js`](./commerceflow-api/scripts/create-admin.js), [`safety-helper.js`](./commerceflow-api/scripts/safety-helper.js) | Verify that `safety-helper.js` fail-closed checks prevent non-interactive or production runs without explicit safety flags. | Script exits with non-zero code when `NODE_ENV=production` without override flags; verified via `safety-helper.test.js`. | None |
| **BLK-002** | **P1** | **In progress** | Breaking HTTP DELETE requests for third-party or mobile API consumers | [`commerceflow-api/src/modules/cart/cart.validator.js`](./commerceflow-api/src/modules/cart/cart.validator.js) (line 51), wishlist validator | Modify schema from `body: z.object({})` to `body: z.object({}).optional()` across cart and wishlist item deletion. | `DELETE /api/v1/cart/items/:id` with no `Content-Type` header and null body returns HTTP 200 rather than 400. | None |
| **BLK-003** | **P1** | **Blocked** | Multi-document transactions require MongoDB Replica Set topology | [`commerceflow-api/.github/workflows/ci.yml`](./commerceflow-api/.github/workflows/ci.yml), [`src/database/mongodb.js`](./commerceflow-api/src/database/mongodb.js) | Ensure staging deployment uses a managed MongoDB cluster with replica set (`rs0` or Atlas cluster) before enabling multi-document transactions. | Staging database URI contains `replicaSet` parameter; transactions succeed without `Transaction numbers are only allowed on a replica set member` error. | Staging Infrastructure Provisioning |
| **BLK-004** | **P1** | **Needs verification** | Razorpay webhook signature verification failure on staging edge proxies | [`STAGING_DEPLOYMENT_CHECKLIST.md`](./STAGING_DEPLOYMENT_CHECKLIST.md), [`commerceflow-api/src/app.js`](./commerceflow-api/src/app.js) | Validate that staging load balancer/ingress preserves raw request body buffer on `req.rawBody` without UTF-8 re-encoding. | Webhook test payload signed with `RAZORPAY_WEBHOOK_SECRET` returns HTTP 200 and records `WebhookEvent`. | Staging Ingress / TLS Setup |

---

## 4. Security and Data Integrity Tasks

### 4.1 Authentication and Privilege Enforcement
- [x] **`SEC-001` [P1] [Done]**: Dual-role authorization model strictly enforced in backend middleware (`authenticate`, `authorize('admin')`) in [`user.model.js`](./commerceflow-api/src/modules/users/user.model.js) and [`auth.middleware.js`](./commerceflow-api/src/common/middleware/auth.middleware.js).
- [x] **`SEC-002` [P1] [Done]**: Timing-safe HMAC signature verification for Razorpay payments using `crypto.timingSafeEqual` in [`razorpay.service.js`](./commerceflow-api/src/modules/payments/razorpay.service.js).
- [x] **`SEC-003` [P1] [Done]**: Sensitive field redaction in Pino logging (`password`, `token`, `cookie`, `razorpaySignature`, `authorization`).
- [ ] **`SEC-004` [P1] [In progress]**: Audit CLI admin bootstrap scripts (`create-admin.js`, `promote-admin.js`) against staging environment variables to prevent unauthorized privilege escalation.
- [ ] **`SEC-005` [P2] [Not started]**: Run `npm audit fix` in `commerceflow-api` to address moderate-severity advisory for indirect dependency `ip-address` ($\le 10.7.0$).
- [ ] **`SEC-006` [P2] [Needs verification]**: Verify URL inputs and external image URLs in banner creation to ensure safe protocol restrictions (`https://` only, preventing `javascript:` URI injection).

### 4.2 Data Integrity and Concurrency
- [x] **`DATA-001` [P1] [Done]**: Atomic inventory decrement on order creation and atomic restoration on cancellation via MongoDB `$inc` operators.
- [x] **`DATA-002` [P1] [Done]**: Price and product name snapshotting into order items at checkout time, preventing retroactive price mutations.
- [x] **`DATA-003` [P1] [Done]**: Webhook idempotency enforcement using unique compound index on `WebhookEvent.eventId`.
- [ ] **`DATA-004` [P1] [In progress]**: Review rating average recalculation hook in [`review.service.js`](./commerceflow-api/src/modules/reviews/review.service.js) to guarantee mathematical consistency upon review approval, modification, or soft-deletion.

---

## 5. Backend Tasks (`commerceflow-api`)

### 5.1 API Routes, Validation & Controllers
- [x] **`API-001` [P1] [Done]**: Core REST endpoints mounted under `/api/v1` for Auth, Users, Products, Cart, Wishlist, Addresses, Orders, Payments, and Admin Core.
- [ ] **`API-002` [P1] [In progress]**: Integrate and verify admin review moderation routes (`commerceflow-api/src/modules/reviews/admin-review.routes.js`) under `/api/v1/admin/reviews`.
- [ ] **`API-003` [P1] [In progress]**: Integrate and verify admin banner routes (`commerceflow-api/src/modules/banners/admin-banner.routes.js`) under `/api/v1/admin/banners`.
- [ ] **`API-004` [P1] [Not started]**: Fix DELETE body validation schema in `cart.validator.js` and `wishlist.validator.js` (see `BLK-002`).
- [ ] **`API-005` [P2] [Proposed]**: Design and implement backend REST endpoints for Admin Finance & Wallet Ledger (`/api/v1/admin/finance`).
- [ ] **`API-006` [P2] [Proposed]**: Design and implement backend REST endpoints for Admin Marketing Campaigns (`/api/v1/admin/campaigns`).
- [ ] **`API-007` [P2] [Not started]**: Implement direct automated refund dispatch via Razorpay Refund API (`POST /api/v1/admin/refunds/:id/process`).

### 5.2 Background Services & Caching
- [ ] **`API-008` [P2] [Proposed]**: Implement application-level Redis connection module in `src/infrastructure/redis/` to cache catalog queries (`GET /api/v1/products`).
- [ ] **`API-009` [P2] [Proposed]**: Migrate `express-rate-limit` from memory store to Redis store (`rate-limit-redis`) to support multi-container deployments.
- [ ] **`API-010` [P3] [Proposed]**: Integrate background job queue (BullMQ) for asynchronous order confirmation email notifications and report generation.

---

## 6. Frontend Tasks (`commerceflow-web`)

### 6.1 Admin Interface & Navigation
- [x] **`WEB-001` [P1] [Done]**: Responsive admin layout with persistent sidebar, mobile drawer, breadcrumbs, and profile bar in [`AdminLayout.jsx`](./commerceflow-web/src/layouts/AdminLayout.jsx).
- [x] **`WEB-002` [P1] [Done]**: Admin navigation configuration with active route highlighting in [`adminNavConfig.js`](./commerceflow-web/src/layouts/admin/adminNavConfig.js).
- [ ] **`WEB-003` [P1] [In progress]**: Connect `AdminReviewsPage.jsx` to real backend endpoints using [`adminReview.service.js`](./commerceflow-web/src/features/admin/adminReview.service.js).
- [ ] **`WEB-004` [P1] [In progress]**: Connect `AdminBannersPage.jsx` to real backend endpoints using [`adminBanner.service.js`](./commerceflow-web/src/features/admin/adminBanner.service.js).
- [ ] **`WEB-005` [P1] [In progress]**: Connect `AdminCouponsPage.jsx` to real backend endpoints using [`adminCoupon.service.js`](./commerceflow-web/src/features/admin/adminCoupon.service.js).
- [ ] **`WEB-006` [P2] [In progress]**: Add visible "Client Prototype / Non-Persistent" disclosure badges to `AdminFinancePage.jsx`, `AdminCampaignsPage.jsx`, and `AdminAchievementsPage.jsx` to avoid misleading administrative users.

### 6.2 UI Polish, Feedback & Accessibility
- [ ] **`WEB-007` [P2] [In progress]**: Enforce consistent 5-state UI handling (Loading, Error, Empty, Success, Disabled) across all admin data tables.
- [ ] **`WEB-008` [P2] [In progress]**: Accessibility audit: Ensure modal dialogs trap keyboard focus and dismiss on `Escape` keypress across all admin forms.
- [ ] **`WEB-009` [P2] [Not started]**: Ensure all form inputs have associated `<label>` or `aria-label` attributes for WCAG 2.1 AA compliance.

---

## 7. Testing and Quality Assurance Tasks

### 7.1 Automated Test Execution & Coverage
- [x] **`TEST-001` [P1] [Done]**: Verified test scripts configured in `package.json`:
  - Backend: `npm test` (`vitest run`), `npm run test:watch`
  - Frontend: `npm test` (`node scripts/run-tests.js`), `npm run lint` (`eslint .`), `npm run build` (`vite build`)
- [ ] **`TEST-002` [P1] [Not started]**: Add frontend test and lint job to GitHub Actions CI workflow in [`commerceflow-api/.github/workflows/ci.yml`](./commerceflow-api/.github/workflows/ci.yml).
- [ ] **`TEST-003` [P1] [In progress]**: Run targeted test suite for review and banner admin services:
  - Backend: `npx vitest run src/modules/reviews/` and `src/modules/banners/`
  - Frontend: `node scripts/run-tests.js` targeting admin review and banner test files.
- [ ] **`TEST-004` [P2] [Not started]**: Add end-to-end regression tests verifying that empty HTTP `DELETE` requests succeed on cart and wishlist endpoints.

---

## 8. Staging and Deployment Readiness

| Requirement | Implementation Status | Verified Evidence | Outstanding Action |
| :--- | :---: | :--- | :--- |
| **Backend Dockerfile** | **Done** | [`commerceflow-api/Dockerfile`](./commerceflow-api/Dockerfile) uses `node:22-alpine`, non-root `USER node`, port 4000. | Build and run container locally to verify healthcheck command. |
| **Health Endpoints** | **Done** | `GET /api/v1/health/live` and `GET /api/v1/health/ready` verified during system audit. | Connect staging orchestrator liveness/readiness probes. |
| **Frontend Production Build** | **Done** | `npm run build` compiles clean static assets to `dist/` in 408ms with zero errors. | Configure edge CDN / Nginx SPA fallback rewrite (`/* -> /index.html`). |
| **Staging Environment Schema** | **Done** | Fully documented in [`STAGING_DEPLOYMENT_CHECKLIST.md`](./STAGING_DEPLOYMENT_CHECKLIST.md). | Inject secrets securely into staging platform secrets vault. |
| **MongoDB Staging Cluster** | **Blocked** | Schema and indexes verified on local MongoDB 7.0. | Provision isolated cloud MongoDB replica set (Atlas cluster) for staging. |
| **Razorpay Test Gateway** | **Needs verification** | SDK, signature verification, and webhook rawBody logic verified in audit. | Configure live test webhook URL in Razorpay Dashboard pointing to staging domain. |
| **Docker Compose Local Stack** | **Proposed** | Backend Dockerfile exists, but no `docker-compose.yml` in repository root. | Create `docker-compose.yml` orchestrating API, Web, Mongo, and Redis for local staging mimicry. |

---

## 9. Admin Feature Completion Matrix

| Feature Module | Frontend Status | Backend Status | Persistence Verified? | Tests Status | Outstanding Work |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Products** | **Done** | **Done** | **Verified** (MongoDB `products`) | **Passing** (Unit & Integration) | None; core functionality operational. |
| **Inventory** | **Done** | **Done** | **Verified** (MongoDB `products.stock`) | **Passing** (Atomic decrements) | Batch restock UI optimization. |
| **Orders** | **Done** | **Done** | **Verified** (MongoDB `orders`) | **Passing** (Lifecycle & cancel) | Advanced export format handling (CSV/PDF). |
| **Customers** | **Done** | **Done** | **Verified** (MongoDB `users`) | **Passing** (Role & profile) | None. |
| **Reviews Moderation** | **In progress** | **In progress** | **Verified** (MongoDB `reviews`) | **Passing** (Controller & Service) | Wire frontend approval buttons to API; merge pending branch changes. |
| **Banners Management** | **In progress** | **In progress** | **Verified** (MongoDB `banners`) | **Passing** (Service tests) | Finalize cloud image upload pipeline (CDN storage). |
| **Coupons** | **In progress** | **Done** | **Verified** (MongoDB `coupons`) | **Passing** (Backend validation) | Frontend discount code redemption testing. |
| **Returns** | **Done** | **Done** | **Verified** (MongoDB `returns`) | **Passing** (Status flow) | None. |
| **Refunds** | **Done** | **Done** | **Verified** (MongoDB `refunds`) | **Passing** (Status tracking) | Direct automated Razorpay refund dispatch API integration. |
| **Audit Logs** | **Done** | **Done** | **Verified** (MongoDB `auditlogs`) | **Passing** (Pino / DB logs) | None. |
| **Dashboard / Reports** | **Done** | **Done** | **Verified** (MongoDB aggregations) | **Passing** (Analytics queries) | Custom date range filtering in frontend. |
| **Campaigns** | **In progress** | **Not started** | **No** (Browser `localStorage`) | **Partial** (UI test only) | Implement backend data model and REST API (`/api/v1/admin/campaigns`). |
| **Finance / Wallets** | **In progress** | **Not started** | **No** (Browser `localStorage`) | **Partial** (UI test only) | Implement backend ledger and financial transaction service. |
| **Notifications** | **In progress** | **Not started** | **No** (In-memory mock) | **Needs verification** | Implement real-time WebSocket or database notification system. |
| **Roles & Permissions** | **In progress** | **N/A** (Dual-role) | **No** (Dual-role only) | **Passing** (Role middleware) | Maintainer decision: retain simple dual-role or expand to granular RBAC. |
| **Achievements** | **In progress** | **Not started** | **No** (In-memory mock) | **Needs verification** | Maintainer decision: retain as illustrative demo or build customer loyalty API. |
| **Performance** | **In progress** | **Not started** | **No** (Browser metrics) | **Needs verification** | Integrate real APM / OpenTelemetry monitoring endpoint. |

---

## 10. Accessibility, UX, and Maintainability

- [ ] **`UX-001` [P2] [In progress]**: Standardize button loading states and prevent double-clicks across all storefront and admin mutation buttons.
- [ ] **`UX-002` [P2] [In progress]**: Audit modal focus trapping and `Escape` key dismissals in `commerceflow-web/src/components/` and `src/layouts/admin/`.
- [ ] **`UX-003` [P2] [In progress]**: Replace arbitrary CSS color classes with Tailwind CSS v4 design tokens defined in [`DESIGN.md`](./DESIGN.md).
- [ ] **`UX-004` [P3] [Proposed]**: Add breadcrumb navigation schema metadata (JSON-LD) for enhanced storefront SEO.
- [ ] **`MAINT-001` [P2] [Proposed]**: Evaluate introducing npm workspaces at repository root to allow unified `npm test` and `npm run lint` commands across both packages.

---

## 11. Recommended Implementation Roadmap

```mermaid
flowchart TD
    subgraph Phase 1: Critical Verification & Release Blockers
        P1_1["BLK-001: Safety Helper Staging Check"]
        P1_2["BLK-002: Fix DELETE Body Schemas"]
        P1_3["TEST-002: Add Frontend CI Job"]
    end

    subgraph Phase 2: Core Admin Integration & Reliability
        P2_1["API-002 / WEB-003: Review Moderation Integration"]
        P2_2["API-003 / WEB-004: Banner Management Integration"]
        P2_3["WEB-006: Prototype Badges on Finance/Campaigns"]
        P2_4["SEC-005: Dependency Vulnerability Audit"]
    end

    subgraph Phase 3: Staging Validation & Deployment Prep
        P3_1["BLK-003: MongoDB Staging Replica Set Setup"]
        P3_2["BLK-004: Razorpay Webhook Ingress Verification"]
        P3_3["DEPLOY-001: Staging Secret Injection"]
        P3_4["TEST-003: E2E Checkout Smoke Tests"]
    end

    subgraph Phase 4: Enhancements & Technical Debt
        P4_1["API-008: Redis Caching Layer"]
        P4_2["API-009: Distributed Rate Limiting"]
        P4_3["API-005: Backend Finance & Wallet Ledger"]
        P4_4["DEPLOY-002: Root docker-compose.yml"]
    end

    Phase 1 --> Phase 2
    Phase 2 --> Phase 3
    Phase 3 --> Phase 4
```

---

## 12. Master Task Registry

| ID | Priority | Status | Task Description | Source Evidence | Acceptance Criteria | Dependencies |
| :--- | :---: | :---: | :--- | :--- | :--- | :--- |
| **`BLK-001`** | **P0** | **In progress** | Verify CLI admin bootstrap safety gates | `scripts/safety-helper.js` | Scripts exit non-zero when `NODE_ENV=production` without override flags. | None |
| **`BLK-002`** | **P1** | **In progress** | Fix strict body schema on HTTP DELETE | `src/modules/cart/cart.validator.js` | Empty HTTP `DELETE` to `/cart/items/:id` returns HTTP 200 without payload. | None |
| **`BLK-003`** | **P1** | **Blocked** | Staging MongoDB Replica Set configuration | `src/database/mongodb.js` | Staging URI supports replica set for transactions. | Staging Infrastructure |
| **`BLK-004`** | **P1** | **Needs verification** | Webhook raw body preservation on edge ingress | `src/app.js`, `STAGING_DEPLOYMENT_CHECKLIST.md` | Staging webhook endpoint successfully validates HMAC signature. | Staging TLS Ingress |
| **`SEC-001`** | **P1** | **Done** | Dual-role authentication & authorization | `src/models/user.model.js`, `auth.middleware.js` | Unit & integration tests pass for role boundaries. | None |
| **`SEC-002`** | **P1** | **Done** | Timing-safe Razorpay payment HMAC verification | `src/modules/payments/razorpay.service.js` | Invalid signature rejected via `crypto.timingSafeEqual`. | None |
| **`SEC-003`** | **P1** | **Done** | Structured logging sensitive field redaction | `src/common/logger.js`, Pino config | Passwords, tokens, and payment secrets redacted from logs. | None |
| **`SEC-004`** | **P1** | **In progress** | CLI Admin script execution review | `scripts/create-admin.js` | Pre-staging audit verifies safe execution parameters. | `BLK-001` |
| **`SEC-005`** | **P2** | **Not started** | Dependency security audit (`ip-address`) | `commerceflow-api/package.json`, `npm audit` | `npm audit` passes with 0 moderate or high vulnerabilities. | None |
| **`SEC-006`** | **P2** | **Needs verification** | Banner and review URL input validation | `src/modules/banners/banner.validator.js` | Protocol restricted to safe HTTPS URLs only. | None |
| **`DATA-001`** | **P1** | **Done** | Atomic inventory decrement and restoration | `src/modules/orders/order.service.js` | Concurrent tests verify stock never goes below zero. | None |
| **`DATA-002`** | **P1** | **Done** | Order item price snapshotting | `src/modules/orders/order.model.js` | Order totals independent of subsequent product price changes. | None |
| **`DATA-003`** | **P1** | **Done** | Webhook event idempotency tracking | `src/models/webhook-event.model.js` | Duplicate webhook payloads processed once without side-effects. | None |
| **`DATA-004`** | **P1** | **In progress** | Review aggregate rating consistency hook | `src/modules/reviews/review.service.js` | Product `averageRating` and `reviewCount` mathematically accurate. | None |
| **`API-001`** | **P1** | **Done** | Mount core REST API endpoints under `/api/v1` | `src/routes/index.js` | All core routes return standardized JSON envelopes. | None |
| **`API-002`** | **P1** | **In progress** | Admin review moderation routes & controllers | `src/modules/reviews/admin-review.routes.js` | Admin can approve, reject, and delete customer reviews via API. | None |
| **`API-003`** | **P1** | **In progress** | Admin banner routes & controllers | `src/modules/banners/admin-banner.routes.js` | Admin can create, toggle active state, and delete banners via API. | None |
| **`API-004`** | **P1** | **In progress** | Make DELETE body schemas optional | `src/modules/cart/cart.validator.js` | Schema schema tests pass for empty body. | `BLK-002` |
| **`API-005`** | **P2** | **Proposed** | Backend Admin Finance & Wallet ledger | `src/modules/finance/` (unimplemented) | Full double-entry financial ledger API operational. | Maintainer Approval |
| **`API-006`** | **P2** | **Proposed** | Backend Admin Marketing Campaigns module | `src/modules/campaigns/` (unimplemented) | Campaign CRUD and promotional discount engine operational. | Maintainer Approval |
| **`API-007`** | **P2** | **Not started** | Automated Razorpay refund integration | `src/modules/refunds/refund.service.js` | Calling refund API initiates real gateway refund in test mode. | Razorpay Test Keys |
| **`API-008`** | **P2** | **Proposed** | Redis caching for catalog queries | `src/infrastructure/redis/` | Product catalog cached with TTL; cache invalidated on updates. | Redis Infrastructure |
| **`API-009`** | **P2** | **Proposed** | Distributed rate limiting via Redis store | `src/middleware/rate-limiter.js` | Rate limits synchronized across multiple API container instances. | `API-008` |
| **`API-010`** | **P3** | **Proposed** | Background queue architecture (BullMQ) | `package.json` | Email and webhook background jobs process asynchronously. | Redis Infrastructure |
| **`WEB-001`** | **P1** | **Done** | Admin responsive navigation and layout | `src/layouts/AdminLayout.jsx` | Navigation highlights active routes and scales cleanly to mobile. | None |
| **`WEB-002`** | **P1** | **Done** | Admin nav config synchronization | `src/layouts/admin/adminNavConfig.js` | Nav items match implemented views with test coverage. | None |
| **`WEB-003`** | **P1** | **In progress** | Connect Admin Reviews view to API | `src/pages/admin/AdminReviewsPage.jsx` | Review moderation table fetches and mutates real DB records. | `API-002` |
| **`WEB-004`** | **P1** | **In progress** | Connect Admin Banners view to API | `src/pages/admin/AdminBannersPage.jsx` | Banner list and create form mutate real DB records. | `API-003` |
| **`WEB-005`** | **P1** | **In progress** | Connect Admin Coupons view to API | `src/pages/admin/AdminCouponsPage.jsx` | Coupon management form interacts with backend coupons route. | None |
| **`WEB-006`** | **P2** | **In progress** | Add prototype disclosure badges to client views | `AdminFinancePage.jsx`, `AdminCampaignsPage.jsx` | Clear badges inform users data is stored locally. | None |
| **`WEB-007`** | **P2** | **In progress** | Consistent 5-state UI handling on tables | `src/pages/admin/` | Loading, error, empty, success, and disabled states rendered. | None |
| **`WEB-008`** | **P2** | **In progress** | Modal dialog keyboard focus trapping | `src/components/`, `src/pages/admin/` | Tab key remains trapped inside active modal; Escape dismisses. | None |
| **`WEB-009`** | **P2** | **Not started** | WCAG 2.1 AA form input labeling audit | `src/pages/` | All inputs pass axe-core / lighthouse accessibility audit. | None |
| **`TEST-001`** | **P1** | **Done** | Document verified package test commands | `package.json` (API & Web) | Commands run without errors on developer environments. | None |
| **`TEST-002`** | **P1** | **Not started** | Add Frontend CI test & lint job | `.github/workflows/ci.yml` | Pull requests execute `npm test` and `npm run lint` for frontend. | None |
| **`TEST-003`** | **P1** | **In progress** | Review and Banner test suite execution | `review.service.test.js`, `adminBanner.service.test.js` | Targeted tests pass with 100% assertions satisfied. | None |
| **`TEST-004`** | **P2** | **Not started** | Regression tests for empty HTTP DELETE | `cart.test.js`, `wishlist.test.js` | Supertest asserts HTTP 200 on empty DELETE requests. | `BLK-002` |
| **`DEPLOY-001`** | **P1** | **Needs verification** | Staging environment secrets configuration | `STAGING_DEPLOYMENT_CHECKLIST.md` | Staging hosting platform contains all required env variables. | Staging Hosting |
| **`DEPLOY-002`** | **P2** | **Proposed** | Multi-container local `docker-compose.yml` | Monorepo root | `docker compose up` starts API, Web, Mongo, and Redis. | None |
| **`DEPLOY-003`** | **P1** | **Needs verification** | Container build and health probe verification | `commerceflow-api/Dockerfile` | Docker container starts and passes healthcheck on port 4000. | Docker daemon |
| **`DEPLOY-004`** | **P1** | **Needs verification** | Razorpay test webhook tunnel verification | Staging Ingress | Inbound webhook test event successfully verified and processed. | Public Staging Domain |

---

## 13. Definition of Done (DoD)

A task in CommerceFlow can be marked **`Done`** only when all of the following criteria are met:

1. **Acceptance Criteria Satisfied**: The implementation satisfies the explicit acceptance criteria listed in Section 12.
2. **Evidence Verified**: Changes are verified through targeted test runs, direct source inspection, or live HTTP verification.
3. **No Phantom Testing**: If tests could not be run due to missing infrastructure, the task is marked `In progress` or `Needs verification`, NOT `Done`.
4. **Zero Unrelated Changes**: Working tree cleanliness is verified with `git status --short`; no unrelated files were touched or formatted.
5. **Documentation Synchronized**: If endpoints, schemas, or behaviors changed, [`PRD.md`](./PRD.md), [`ARCHITECTURE.md`](./ARCHITECTURE.md), and [`DESIGN.md`](./DESIGN.md) are updated in the same change.
6. **Git Safety Upheld**: Staging and committing are performed only upon explicit user instruction.

---

## 14. Open Questions and External Dependencies

The following architectural decisions and infrastructure provisions are required to advance blocked and in-progress tasks:

1. **MongoDB Staging Replica Set Provisioning**:
   - *Question*: Will staging use a managed MongoDB Atlas cluster (M0 or M10) configured as a replica set, or a custom containerized replica set?
   - *Impact*: Required to resolve `BLK-003` and test multi-document transactions.
2. **Razorpay Webhook Endpoint Provisioning**:
   - *Question*: What is the public FQDN for the staging API (`https://<STAGING_API_DOMAIN>`) to register in the Razorpay Test Dashboard?
   - *Impact*: Required to resolve `BLK-004` and `DEPLOY-004`.
3. **Admin Finance & Campaigns Roadmap**:
   - *Question*: Should the administrative Finance/Wallet and Marketing Campaign modules be built out with persistent MongoDB collections and REST APIs in this release cycle, or kept as documented client-side prototypes?
   - *Impact*: Governs whether `API-005` and `API-006` remain `Proposed` or move to active development.
4. **Role Granularity Decision**:
   - *Question*: Does CommerceFlow intend to remain strictly a single-merchant dual-role system (`customer`, `admin`), or will fine-grained roles (e.g., `support_agent`, `finance_manager`) be introduced?
   - *Impact*: Governs whether `AdminRolesPage.jsx` should be backed by a new backend RBAC schema or labeled as a future concept.
