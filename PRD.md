# Product Requirements Document (PRD): CommerceFlow

---

## 1. Document Overview

### 1.1 Product Name
**CommerceFlow** (Monorepo: `commerceflow-api` & `commerceflow-web`)

### 1.2 Document Purpose
This Product Requirements Document (PRD) defines the comprehensive product specification, functional and non-functional requirements, architectural foundation, data contracts, security posture, and release criteria for **CommerceFlow**. It serves as the authoritative single source of truth for software engineers, QA testers, security auditors, and product stakeholders.

### 1.3 Document Version and History
| Version | Date | Status | Author | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **1.0.0** | October 14, 2026 | Baseline Production Specification | Engineering & Product Architecture | Grounded in actual codebase audit (`feature/admin-expansion-staging-prep`) |

### 1.4 Product Scope
CommerceFlow is an enterprise-grade, single-merchant direct-to-consumer (D2C) e-commerce platform. The system encompasses:
1. **Customer Storefront (`commerceflow-web`):** A high-performance, responsive Single Page Application (SPA) offering catalog discovery, product variants, customer authentication, persistent cart and wishlist, order placement, Razorpay checkout, and self-service order tracking.
2. **Administrative Control Console (`commerceflow-web/src/pages/admin`):** A unified back-office management console for inventory control, product variants, order fulfillment, return/RMA processing, financial refund reconciliation, discount coupons, marketing banners, review moderation, customer accounts, and security audit logs.
3. **Backend Commerce Engine (`commerceflow-api`):** A RESTful API built on Node.js, Express, MongoDB, and Mongoose, enforcing server-authoritative financial calculation, atomic inventory reservation, timing-safe payment verification, structured Pino logging, and role-based access control.

### 1.5 Intended Audience
* **Backend & Frontend Engineers:** Implementation guidance, data validation schemas, API contracts, and business invariants.
* **Quality Assurance Engineers:** Test scenarios, state transition invariants, and acceptance criteria.
* **DevOps & Site Reliability Engineers:** Deployment topology, environment variables, health probes, and process lifecycle.
* **Product Owners & Security Officers:** Scope boundaries, authorization matrices, security safeguards, and product roadmap.

---

## 2. Product Vision

### 2.1 Product Summary
CommerceFlow delivers a dependable, transparent, and aesthetically refined shopping experience for customers while providing store operators with deterministic, server-authoritative control over catalog, stock, and orders.

### 2.2 Problem Statement
Modern e-commerce applications frequently suffer from architectural vulnerabilities:
* **Client-Side Pricing & Cart Tampering:** Insecure web stores trust client-submitted order totals or prices.
* **Inventory Inconsistencies & Overselling:** Non-atomic inventory operations cause race conditions during high-concurrency checkout.
* **Ambiguous Payment State:** Weak integration with payment gateways leads to unpaid order fulfillment or unverified webhook events.
* **Overly Complex Marketplace Bloat:** Many platforms introduce multi-vendor complexity before establishing robust single-merchant unit economics and inventory hygiene.

### 2.3 Product Goals
1. **Absolute Financial Integrity:** The server derives 100% of line item amounts, tax, shipping, discounts, and total payable amounts. Client-submitted prices are unconditionally discarded.
2. **Atomic Inventory Lifecycle:** Stock is reserved atomically on checkout, decremented on order placement, and restored automatically if an order is cancelled or a return is restocked.
3. **Cryptographically Secure Payments:** Gateway orders, HMAC SHA-256 signatures, and webhooks are verified with timing-safe operations and unique event idempotency.
4. **Actionable Operations Console:** Administrators manage catalog, stock adjustments with mandatory audit reasons, customer accounts, and marketing without third-party portal dependency.

### 2.4 Value Proposition
* **For Shoppers:** A fast, clutter-free storefront with real-time stock feedback, transparent checkout in Indian Rupees (INR), and reliable order lifecycle tracking.
* **For Store Operators:** Complete visibility into stock movements, customer orders, gateway reconciliations, and staff audit logs within a cohesive, single-merchant back office.

### 2.5 Target Users & Customer Segments
* **Consumers (Shoppers):** Retail buyers seeking reliable discovery, transparent pricing, secure online payment, and straightforward return management.
* **Store Administrators & Operations Staff:** Internal operations managers responsible for catalog curation, stock adjustments, order packing/dispatch, customer service, and promotional campaigns.

---

## 3. User Roles and Permissions

### 3.1 Implemented User Roles
CommerceFlow strictly enforces an **authoritative dual-role model** embedded in the `User` schema (`commerceflow-api/src/modules/users/user.model.js`):

```
Role Enum: ["customer", "admin"]
Default Role: "customer"
```

> [!IMPORTANT]
> **Single-Merchant Governance:** CommerceFlow does **not** implement a `superAdmin`, `vendor`, `merchant`, or `moderator` role. The codebase explicitly rejects arbitrary role escalation. Marketplace multi-vendor tenancy is not supported in the active architecture; CommerceFlow operates as a first-party, single-merchant retailer.

### 3.2 Role and Capability Matrix

| Capability / Resource Domain | `customer` | `admin` | Enforcement Mechanism |
| :--- | :---: | :---: | :--- |
| **Browse Active Catalog & Categories** | Granted | Granted | Public endpoints (`GET /api/v1/products`) |
| **Manage Personal Profile & Addresses** | Granted (Self only) | Granted (Self only) | `authMiddleware` + `req.user._id` ownership |
| **Manage Shopping Cart & Wishlist** | Granted (Self only) | Granted (Self only) | User-scoped document queries |
| **Place Orders & Pay via Gateway** | Granted | Granted | Server-authoritative checkout |
| **Cancel Personal Pending Orders** | Granted (Self only) | Granted (Any order) | Ownership check vs `authorize("admin")` |
| **Submit Product Reviews** | Granted (Verified purchase) | Granted | `review.service.js` order qualification |
| **Request Order Returns (RMA)** | Granted (Self only) | Granted (Any order) | `return.service.js` delivery qualification |
| **Create / Edit / Delete Products** | Denied (403) | Granted | `authorize("admin")` on `/api/v1/admin/products` |
| **Perform Inventory Adjustments** | Denied (403) | Granted | `authorize("admin")` on `/api/v1/admin/inventory` |
| **Manage Categories & Brands** | Denied (403) | Granted | `authorize("admin")` on `/api/v1/admin/categories` |
| **Process Returns & Restock Stock** | Denied (403) | Granted | `authorize("admin")` on `/api/v1/admin/returns` |
| **Initiate & Reconcile Refunds** | Denied (403) | Granted | `authorize("admin")` on `/api/v1/admin/refunds` |
| **Moderate & Delete Reviews** | Denied (403) | Granted | `authorize("admin")` on `/api/v1/admin/reviews` |
| **Create / Update Coupons & Banners** | Denied (403) | Granted | `authorize("admin")` on `/api/v1/admin/coupons` |
| **Inspect System Audit Logs** | Denied (403) | Granted | `authorize("admin")` on `/api/v1/admin/audit-logs` |
| **Modify Store Settings & Toggles** | Denied (403) | Granted | `authorize("admin")` on `/api/v1/admin/settings` |
| **Promote User to Admin Role** | Denied (403) | Granted | Backend admin user update or bootstrap scripts |

---

## 4. Functional Requirements

### 4.1 Authentication and Account Management

| ID | Feature & Purpose | Actor | Expected Behavior | Validation & Authorization | Implementation Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **FR-001** | **User Registration**<br>Allow new customers to create an account. | Guest | User provides name, email, and password. System creates user with role `customer`, hashes password with bcrypt (cost 12), and returns created user metadata. | Zod schema: email regex, min password length 6, name 2–100 chars. Unique index on `email`. Rate limit: 10 req/15 min. | **Implemented** |
| **FR-002** | **User Login**<br>Authenticate user and issue session token. | Customer, Admin | Validates credentials; returns signed JWT (`HS256`, 20m expiry) and sanitized user object. | Rate limit: 10 req/15 min (`authRateLimitMiddleware`). Timing-safe password comparison. | **Implemented** |
| **FR-003** | **Profile Inspection (`GET /me`)**<br>Retrieve authenticated account details. | Authenticated | Returns current user profile (ID, name, email, role, timestamps). Password is excluded (`select: false`). | Requires valid Bearer JWT. Rejects expired/tampered tokens with 401. | **Implemented** |
| **FR-004** | **Customer Address Management**<br>Maintain delivery addresses for checkout. | Customer | Customer can create, inspect, update, and delete shipping addresses. Default address flag supported. | Scoped strictly to `req.user._id`. Validation requires street, city, state, postal code, and country. | **Implemented** |
| **FR-005** | **Account Security & Password Update**<br>Self-service credential updates. | Authenticated | Allows authenticated user to update their password by confirming old password and supplying new compliant password. | Minimum 6 characters. Re-hashes password with bcrypt. | **Implemented** |

### 4.2 Product Catalog, Variants, Categories, and Brands

| ID | Feature & Purpose | Actor | Expected Behavior | Validation & Authorization | Implementation Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **FR-006** | **Public Product Browsing**<br>Expose active products with pagination and sorting. | Public | Returns paginated list of active products (`isActive: true`), including price, stock, categories, images, and ratings. | Query params: `page`, `limit`, `category`, `sort`, `search`. Inactive products excluded from public queries. | **Implemented** |
| **FR-007** | **Product Detail View**<br>Display single product with variants and specs. | Public | Returns detailed product record by ID or slug, including variant array, attribute maps, specifications, and rating summary. | Returns 404 for invalid ObjectId or inactive product (unless admin). | **Implemented** |
| **FR-008** | **Catalog Search & Filtering**<br>Discover products via text and attribute queries. | Public | Searches title and description using MongoDB full-text index. Filters by category, brand, price range, and stock status. | Query validation via Zod. Sanitizes special regex characters. | **Implemented** |
| **FR-009** | **Product Variants (Hybrid Embedded)**<br>Support size/color variants with individual stock. | Admin, Shopper | Products can embed variants with `variantId`, `sku`, `attributes` (Map), `price` override, and `stock`. Shoppers select variants in UI. | `variantSchema` validation. SKUs normalized to uppercase. | **Implemented** |
| **FR-010** | **SKU Registry & Uniqueness Enforcement**<br>Prevent duplicate SKUs catalog-wide. | System, Admin | `SkuRegistry` model and service reserve SKUs globally before product/variant insertion or update to circumvent embedded multikey limitations. | Throws 409 `SKU_ALREADY_EXISTS` upon collision. | **Implemented** |
| **FR-011** | **Category Management**<br>Hierarchical classification of catalog items. | Admin | Create, list, update, and deactivate product categories with slug generation and metadata. | Admin-only route (`/api/v1/admin/categories`). Unique category slug index. | **Implemented** |
| **FR-012** | **Brand Management**<br>Brand association for products. | Admin | Manage brands with logo URLs, website links, and active toggles. | Admin-only route (`/api/v1/admin/brands`). Unique brand name constraint. | **Implemented** |
| **FR-013** | **Administrative Product CRUD**<br>Full product lifecycle management. | Admin | Admin creates products with simple or variant inventory, sets pricing, tags, specifications, and images. Supports soft deletion (`isActive: false`). | Admin-only. Audited via `adminAuditService` (`PRODUCT_CREATED`, `PRODUCT_UPDATED`, `PRODUCT_DELETED`). | **Implemented** |

### 4.3 Shopping Cart, Wishlist, and Checkout

| ID | Feature & Purpose | Actor | Expected Behavior | Validation & Authorization | Implementation Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **FR-014** | **Server-Side Shopping Cart**<br>Maintain persistent customer shopping cart. | Customer | Customer adds items with quantity. Server verifies available stock, computes subtotal dynamically, and persists to `Cart` collection. | Cart scoped to user ID. Quantities must be positive integers <= available stock. | **Implemented** |
| **FR-015** | **Guest Cart & Login Merge**<br>Retain unauthenticated shopping items on login. | Customer | Client tracks unauthenticated items in browser localStorage; upon login, calls `POST /api/v1/cart/merge`. Server reconciles quantities and stock. | Server re-validates stock for all merged items. Caps quantities at current stock level. | **Implemented** |
| **FR-016** | **Customer Wishlist**<br>Bookmark products for future consideration. | Customer | Customer toggles items in personal wishlist. Database enforces `{ user: 1, product: 1 }` unique constraint. | Scoped to authenticated user. Duplicate adds return idempotent success or 409 conflict handled gracefully. | **Implemented** |
| **FR-017** | **Recently Viewed Products**<br>Track user browsing history. | Customer | Records visited product IDs. Returns ordered list of recently viewed products. | Validates product existence. Excludes inactive items. | **Implemented** |
| **FR-018** | **Checkout & Order Creation**<br>Convert cart into a pending order. | Customer | Customer provides `addressId` (and optional `couponCode`). Server verifies address ownership, validates stock, snapshots item names/prices, reserves coupon, clears cart, and creates order with status `pending`. | Stock decremented atomically via `$inc: { stock: -qty }`. Totals calculated server-side. | **Implemented** |

### 4.4 Payment Integration and Verification

| ID | Feature & Purpose | Actor | Expected Behavior | Validation & Authorization | Implementation Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **FR-019** | **Razorpay Order Initialization**<br>Generate authoritative gateway payment order. | Customer | `POST /api/v1/payments/orders/:orderId` converts server `order.total` to paise (`toPaise()`). Invokes Razorpay SDK `orders.create()`. Reuses existing order ID if present (idempotent). | Customer must own order. Order must be in `pending` payment state. Returns `keyId`, `razorpayOrderId`, amount in paise, currency `INR`. | **Implemented** |
| **FR-020** | **Payment Signature Verification**<br>Verify payment authenticity post-checkout. | Customer | `POST /api/v1/payments/orders/:orderId/verify` accepts `razorpayOrderId`, `paymentId`, and `signature`. Verifies HMAC SHA-256 using `crypto.timingSafeEqual`. Fetches payment from Razorpay API to confirm `captured` status and amount match. Updates order to `paid`. | Timing-safe HMAC check prevents timing leaks. Verifies currency is `INR` and amount in paise matches exact order total. | **Implemented** |
| **FR-021** | **Asynchronous Payment Webhooks**<br>Process gateway webhooks reliably. | Webhook Gateway | `POST /api/v1/payments/webhook` receives raw payload buffer. Validates `x-razorpay-signature` against raw buffer. Records event ID in `WebhookEvent` with unique constraint (idempotency). Updates order status to `paid` if not already updated. | Rate limit: 60 req/15 min (`webhookRateLimitMiddleware`). Raw buffer preserved via `req.rawBody`. | **Implemented** |

### 4.5 Order Management, Fulfillment, and Cancellation

| ID | Feature & Purpose | Actor | Expected Behavior | Validation & Authorization | Implementation Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **FR-022** | **Customer Order History & Details**<br>Self-service tracking of customer purchases. | Customer | `GET /api/v1/orders` and `GET /api/v1/orders/:id` return customer-owned orders with items, pricing snapshot, status, delivery address, and payment status. | Strictly scoped to `req.user._id`. Inaccessible by other customers. | **Implemented** |
| **FR-023** | **Customer Order Cancellation**<br>Allow customer to cancel unfulfilled orders. | Customer | `PATCH /api/v1/orders/:id/cancel` allows customer to cancel orders in `pending` or `processing` status. Restores product stock atomically via `$inc: { stock: item.quantity }`. Releases coupon reservations. | Customer ownership enforced. Terminal statuses (`shipped`, `delivered`, `cancelled`) cannot be cancelled by customer. | **Implemented** |
| **FR-024** | **Admin Order Oversight & Filtering**<br>Comprehensive order operations console. | Admin | `GET /api/v1/admin/orders` provides paginated, searchable, status-filtered order list with customer details, item counts, and payment indicators. | Admin-only. Filter by status (`pending`, `processing`, `shipped`, `delivered`, `cancelled`), date range, search query. | **Implemented** |
| **FR-025** | **Admin Order Status Transitions**<br>Advance order fulfillment lifecycle. | Admin | Admin advances status: `processing` -> `shipped` (records carrier & tracking ID) -> `delivered`. Admin can force cancellation with automated stock restoration. | Validates forward lifecycle transitions. Disallows transitions from terminal states (`delivered`, `cancelled`). | **Implemented** |

### 4.6 Returns, RMA, and Refunds

| ID | Feature & Purpose | Actor | Expected Behavior | Validation & Authorization | Implementation Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **FR-026** | **Customer Return Request (RMA)**<br>Self-service return request on delivered orders. | Customer | Customer requests return for delivered order items with reason, condition, and optional images. Creates `Return` record with status `requested`. | Order must be `delivered`. Item must exist in order. Scoped to customer. | **Implemented** |
| **FR-027** | **Admin Return Management & Restocking**<br>Approve, receive, and inspect returns. | Admin | Admin inspects RMA requests, transitions through `approved` -> `received` -> `inspected` -> `completed` or `rejected`. Upon approval/restock, atomically restores inventory. | Enforces valid forward state transitions. Recorded in inventory adjustment ledger with reason `return_restock`. | **Implemented** |
| **FR-028** | **Authoritative Refund Processing**<br>Gateway refund dispatch and ledger recording. | Admin | Admin initiates refund against paid orders/returns. Dispatches refund via Razorpay API or records manual settlement. Logs immutable record to `FinancialLedger`. | Prevents double-refunding: cumulative refund amount cannot exceed order total. Admin-only. | **Implemented** |

### 4.7 Reviews, Ratings, and Moderation

| ID | Feature & Purpose | Actor | Expected Behavior | Validation & Authorization | Implementation Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **FR-029** | **Customer Review Submission**<br>Submit verified rating and feedback. | Customer | Customer submits rating (1–5) and review text for a purchased product. System verifies qualifying delivered order (`isVerifiedPurchase: true`), persists review, and atomically updates `Product.ratings` (average and count). | One review per user per product (unique constraint). Customer must have purchased the product. | **Implemented** |
| **FR-030** | **Public Review Listing**<br>Display published reviews on product page. | Public | Returns published reviews for a product with pagination and rating breakdown. Hidden/pending reviews are excluded. | Read-only public endpoint (`GET /api/v1/products/:id/reviews`). | **Implemented** |
| **FR-031** | **Admin Review Moderation**<br>Moderate, hide, or delete abusive reviews. | Admin | Admin inspects all reviews across status (`published`, `hidden`, `flagged`). Can update status or delete review. On status change/deletion, product rating averages are automatically recalculated with rollback on failure. | Admin-only route (`/api/v1/admin/reviews`). Audited with automatic rollback if rating recomputation fails. | **Implemented** |

### 4.8 Coupons, Discounts, and Marketing Banners

| ID | Feature & Purpose | Actor | Expected Behavior | Validation & Authorization | Implementation Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **FR-032** | **Coupon Creation & Lifecycle**<br>Create promotional discount rules. | Admin | Admin creates coupons with code (uppercase), discount type (`percentage` or `fixed`), value, min order amount, max discount, start/end dates, total usage limit, and per-user limit. | Admin-only (`/api/v1/admin/coupons`). Unique uppercase coupon code index. | **Implemented** |
| **FR-033** | **Cart Coupon Validation & Reservation**<br>Validate and apply coupon at checkout. | Customer | Customer applies coupon code in cart. Server verifies date validity, min spend, and user usage limits. Computes discount amount and reserves usage. | Server computes discount authoritatively. Releases reservation on order cancellation or checkout abandonment. | **Implemented** |
| **FR-034** | **Storefront Banners Management**<br>Publish marketing banners across storefront. | Admin, Public | Admin creates, schedules, and orders banners with title, image URL, link, placement (`hero_carousel`, `top_bar`, `category_top`), and date range. Storefront displays active banners. | Admin-only management; public query (`GET /api/v1/banners`). Active status and date range filtering. | **Implemented** |
| **FR-035** | **Promotional Campaigns Console**<br>Coordinate multi-channel campaigns. | Admin | Manage marketing campaigns with start/end dates, banner associations, and target coupons. | **Preview / Demo:** Currently persisted in browser `localStorage` (`commerceflow_admin_campaigns_v1`); lacks dedicated backend Mongoose persistence. | **Preview/Demo** |

### 4.9 Administration, Operational Intelligence, and Settings

| ID | Feature & Purpose | Actor | Expected Behavior | Validation & Authorization | Implementation Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **FR-036** | **Operational Dashboard Metrics**<br>Real-time executive commerce statistics. | Admin | Returns aggregate metrics: total revenue, order count, active products, low-stock count, customer count, and daily sales trend. | Aggregated via MongoDB aggregation pipeline on `/api/v1/admin/dashboard`. Fast execution (<100ms). | **Implemented** |
| **FR-037** | **Inventory Management & Adjustments**<br>Centralized warehouse stock control. | Admin | View stock levels across simple products and variants. Perform stock adjustments (positive/negative) with mandatory reason documentation (`cycle_count`, `damage`, `restock`, `correction`). Logs to `InventoryAdjustment`. | Enforces non-negative stock invariants. Reason code strictly validated against enum. | **Implemented** |
| **FR-038** | **Customer Account Oversight**<br>Customer relationship and status governance. | Admin | View registered customer list, inspect order history, aggregate spending, and toggle active status (`isActive`). | Admin-only route (`/api/v1/admin/customers`). Cannot modify customer passwords directly. | **Implemented** |
| **FR-039** | **Employee / Admin User Governance**<br>Staff account directory and role assignment. | Admin | List administrative staff. Assign or revoke admin role. Prevents self-demotion (an admin cannot revoke their own admin role). | Admin-only route (`/api/v1/admin/users`). Escalation protection validates target user ID. | **Implemented** |
| **FR-040** | **System Audit Logs**<br>Tamper-resistant administrative activity tracking. | Admin | All administrative write actions (product create/edit, stock adjust, order update, refund, banner update) log structured entries to `AdminAuditLog` with actor ID, IP, event type, and diff payload. | Admin-only read interface (`/api/v1/admin/audit-logs`). Searchable and filterable. | **Implemented** |
| **FR-041** | **Operational Reports & CSV Export**<br>Business performance data extraction. | Admin | Filter and view sales, product, and tax reports. Export data to CSV. Protects against CSV Formula Injection (CWE-1236) by sanitizing leading `=`, `+`, `-`, `@`. | Validates dates. Sanitizes formula triggers before client file generation. | **Implemented** |
| **FR-042** | **Store Configuration & Maintenance Toggle**<br>Global operational settings. | Admin | Configure store name, currency, tax rates, free shipping thresholds, contact email, and maintenance mode toggle. Persisted in `StoreSettings` document. | Admin-only route (`/api/v1/admin/settings`). Single-document configuration model with schema validation. | **Implemented** |
| **FR-043** | **Operational Notifications Console**<br>Real-time system health and alert feed. | Admin | Synthesizes operational alerts from live database queries (low-stock products, failed gateway refunds, pending return RMAs). | Dynamically queries live models; no separate push notification server required. | **Implemented** |
| **FR-044** | **Staff Performance & Activity Metrics**<br>Accountability metrics per operator. | Admin | Computes action count per staff member by aggregating authoritative `AdminAuditLog` records. | Derived dynamically from verified audit log records. | **Implemented** |
| **FR-045** | **Staff Achievements Console**<br>Gamified operational milestone badges. | Admin | Displays staff recognition milestones (e.g. "Precision Inventory Steward", "Zero Security Escalation Streak"). | **Preview / Demo:** In-memory static catalog (`SYSTEM_ACHIEVEMENTS`); lacks backend persistence. | **Preview/Demo** |
| **FR-046** | **Customer Wallets & Manual Expenses**<br>Ledger accounting and store credits. | Admin | Admin manages customer store credits and logs operational business expenses with receipt references. | **Preview / Demo:** Persisted in browser `localStorage` (`commerceflow_admin_wallets_v1`, `commerceflow_admin_expenses_v1`); lacks backend persistence. | **Preview/Demo** |
| **FR-047** | **Vendors Directory & Tenancy Notice**<br>Store tenancy governance console. | Admin | Educational and governance console documenting single-merchant first-party architecture and outlining migration requirements for future multi-vendor marketplace expansion. | Informational / Architecture console (`/admin/vendors`). Authoritatively establishes single-merchant model. | **Implemented (Informational)** |

---

## 5. Non-Functional Requirements

### 5.1 Security and Authorization (`NFR-SEC`)
* **NFR-SEC-001 (Server-Authoritative Finances):** All order amounts, tax, shipping, and discounts must be derived exclusively by the backend. Client-submitted prices or totals are rejected or discarded.
* **NFR-SEC-002 (Password Hashing):** Passwords must be hashed using bcrypt with a minimum work factor (salt rounds) of 12. Plaintext passwords must never be stored, logged, or transmitted in responses.
* **NFR-SEC-003 (JWT Cryptography):** Customer and admin sessions must use JSON Web Tokens signed with HMAC SHA-256 (`HS256`). Signing secret (`JWT_SECRET`) must be at least 32 characters in length. Token lifetime defaults to 20 minutes.
* **NFR-SEC-004 (Payment Signature Integrity):** Payment webhook and checkout completion signatures must be verified against the raw request buffer using `crypto.timingSafeEqual` to eliminate timing side-channel attacks.
* **NFR-SEC-005 (HTTP Security Headers):** Express must register Helmet middleware, enforcing `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, Content Security Policy, and disabling `X-Powered-By`.
* **NFR-SEC-006 (Rate Limiting Defense):**
  * **Global API Limit:** 100 requests per 15-minute window per IP.
  * **Authentication Limit:** 10 requests per 15-minute window per IP (`authRateLimitMiddleware`).
  * **Webhook Limit:** 60 requests per 15-minute window (`webhookRateLimitMiddleware`).
* **NFR-SEC-007 (Payload Safety):** Inbound HTTP body sizes must be capped at 1MB to prevent heap memory exhaustion denial-of-service attacks.
* **NFR-SEC-008 (Bootstrap Target Safety):** Database mutation and administrative bootstrap scripts (`create-admin.js`, `promote-admin.js`) must strictly fail closed against remote or ambiguous databases via `safety-helper.js`. Mutations against `NODE_ENV=production` must be unconditionally locked out.

### 5.2 Data Privacy and Secret Management (`NFR-PRIV`)
* **NFR-PRIV-001 (Zero Secrets in Source Control):** Database URIs, JWT secrets, and payment API keys must never be committed to Git. Deployment environments must inject secrets via platform-managed environment variables.
* **NFR-PRIV-002 (Structured Log Redaction):** The Pino logging subsystem must automatically redact sensitive fields (`authorization`, `cookie`, `password`, `*.password`, `token`, `*.token`, `refreshToken`, `razorpaySignature`, `x-razorpay-signature`) replacing values with `"[REDACTED]"`.
* **NFR-PRIV-003 (Spreadsheet Injection Protection):** All administrative CSV export routines must sanitize cell contents conforming to CWE-1236, prepending single quotes to formula-trigger characters (`=`, `+`, `-`, `@`, `\t`, `\r`).

### 5.3 Performance and Scalability (`NFR-PERF`)
* **NFR-PERF-001 (API Latency):** Healthcheck endpoints (`/health/live`, `/health/ready`) must respond in <5ms under normal load. Catalog read queries (`GET /products`) must respond in <100ms on indexed MongoDB collections.
* **NFR-PERF-002 (Database Indexing):** All frequent query filters must be covered by compound or unique indexes (`users.email`, `products.isActive_createdAt`, `orders.user_createdAt`, `orders.payment.razorpayOrderId`). Collection scans on primary business flows are forbidden.
* **NFR-PERF-003 (Frontend Bundle Size):** Production Vite compilation must produce an optimized static bundle under 400 kB total core JavaScript and under 100 kB CSS (gzipped: ~80 kB JS, ~14 kB CSS).
* **NFR-PERF-004 (Caching Infrastructure Target):** Redis client dependency (`redis: ^6.2.1`) is installed. Application-level Redis caching for catalog queries and shared rate limiting is identified as an architectural expansion target.

### 5.4 Reliability and Error Handling (`NFR-REL`)
* **NFR-REL-001 (Graceful Process Termination):** The API must register `SIGTERM` and `SIGINT` handlers that cease accepting new HTTP connections, disconnect Mongoose cleanly, and enforce a 10-second bounded safety shutdown timer.
* **NFR-REL-002 (Standardized Error Schema):** Client error responses must conform to a predictable JSON contract:
  ```json
  {
    "success": false,
    "error": {
      "code": "ERROR_CODE_STRING",
      "message": "Human-readable safe explanation",
      "details": []
    },
    "requestId": "uuid-v4-string"
  }
  ```
  Internal database exceptions and stack traces must never be exposed to clients.
* **NFR-REL-003 (Webhook Idempotency):** Inbound payment webhooks must be tracked in `WebhookEvent` with unique constraints on `eventId`. Duplicate deliveries must return HTTP 200 without executing duplicate business logic.

### 5.5 Accessibility and Responsive Design (`NFR-A11Y`)
* **NFR-A11Y-001 (Responsive Viewport Support):** Both customer storefront and administrative console must provide fully responsive layouts supporting mobile (>=320px), tablet (>=768px), and desktop (>=1024px) viewports.
* **NFR-A11Y-002 (Semantic HTML & ARIA):** Interactive UI elements must employ accessible roles, `aria-label`, `aria-live` loading announcements, and keyboard navigable focus rings.
* **NFR-A11Y-003 (Visual Design Tokens):** The design system uses an emerald/forest-green color palette (`#123C32`, `#EEF5F1`), slate typography, and consistent badge states.

### 5.6 Maintainability and Testability (`NFR-QA`)
* **NFR-QA-001 (Automated Test Verification):**
  * Backend API: Verified baseline of **1,810 passing tests across 117 test files** in Vitest.
  * Frontend Web: Verified baseline of **733 passing tests across 191 test suites** in custom runner.
* **NFR-QA-002 (Linting Integrity):** Both repositories must maintain zero ESLint warnings and errors under strict modern ECMAScript configurations.

### 5.7 Logging, Monitoring, and Operational Health (`NFR-OPS`)
* **NFR-OPS-001 (Traceability):** Every HTTP request must receive a unique UUIDv4 `requestId` stamped on response headers (`x-request-id`) and embedded in all associated Pino log entries.
* **NFR-OPS-002 (Container Health Probes):**
  * `GET /api/v1/health/live`: Unconditional liveness probe returning HTTP 200.
  * `GET /api/v1/health/ready`: Dependency readiness probe evaluating Mongoose connection state (`readyState === 1`). Returns HTTP 503 `not_ready` if database is disconnected.

---

## 6. System Architecture and Technology

### 6.1 Architectural Topology

```
[ Customer Browser ]                 [ Admin Browser ]
         │                                   │
         ▼ (HTTPS)                           ▼ (HTTPS)
┌─────────────────────────────────────────────────────────────┐
│             Edge CDN / Static Web Host                      │
│             (Vite React 19 SPA - dist/)                     │
└─────────────────────────────────────────────────────────────┘
                               │
                               ▼ (HTTPS with Bearer Token / CORS)
┌─────────────────────────────────────────────────────────────┐
│          Ingress / Reverse Proxy (TLS Termination)          │
│          TRUST_PROXY=1, Port 4000                           │
└─────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│            CommerceFlow Backend API (Node.js 22)            │
│  - Express 5.2.1 REST Router & Zod Validation Middleware    │
│  - Pino JSON Structured Logger with Redaction               │
│  - Helmet Security Headers & Rate Limiters                  │
│  - Razorpay SDK & Webhook Raw Buffer Verification           │
└─────────────────────────────────────────────────────────────┘
                │                              │
                ▼ (Mongoose 9.10)              ▼ (Installed / Unwired)
┌──────────────────────────────┐ ┌────────────────────────────┐
│      MongoDB Cluster         │ │       Redis 6.2 Daemon     │
│  - users, products, carts    │ │  (Local Daemon Active;     │
│  - orders, returns, refunds  │ │   Client unwired in code)  │
│  - coupons, reviews, banners │ └────────────────────────────┘
│  - inventoryadjustments      │
│  - skuregistries, auditlogs  │
└──────────────────────────────┘
```

### 6.2 Technology Stack

| Layer | Component | Version | Role in CommerceFlow |
| :--- | :--- | :--- | :--- |
| **Frontend Framework** | React | 19.2.8 | Declarative component UI library |
| **Frontend Tooling** | Vite | 8.3.0 | Modern build tool, dev server, and production bundler |
| **Styling** | Tailwind CSS | v4 | Utility-first CSS engine with custom forest-green theme tokens |
| **Backend Runtime** | Node.js | >=20 (Engine 22) | Server-side JavaScript runtime (ES Modules) |
| **API Framework** | Express | 5.2.1 | HTTP routing, middleware pipeline, REST controllers |
| **Database** | MongoDB | >=6.0 | Primary document data store |
| **ODM** | Mongoose | 9.10.0 | Schema definition, model validation, and indexing |
| **Schema Validation** | Zod | 4.5.4 | Strict runtime request validation (body, query, params) |
| **Security Headers** | Helmet | 8.1.0 | Standard HTTP security headers enforcement |
| **Rate Limiting** | express-rate-limit | 8.3.1 | In-memory IP rate limiting |
| **Cryptography** | bcryptjs | 3.0.3 | Password hashing with cost factor 12 |
| **Token Auth** | jsonwebtoken | 9.0.3 | Session token generation and validation |
| **Payment SDK** | razorpay | 2.9.8 | Server-authoritative order creation and payment API |
| **Structured Logging** | Pino / pino-http | 10.3.1 | High-throughput structured JSON logging with redaction |
| **Backend Testing** | Vitest / Supertest | 5.0.0 / 7.2.2 | Fast unit, integration, and API testing |
| **Cache (Installed)** | redis | 6.2.1 | Installed dependency; **Application client code NOT implemented** |
| **Queues / Workers** | None | N/A | **NOT IMPLEMENTED** (Synchronous request handling) |

---

## 7. User Journeys

### 7.1 Customer Discovers and Purchases a Product
```
[Shopper browses /shop]
       │
       ▼
[Selects Product & Variant (e.g. Size/Color)]
       │
       ▼
[Adds to Cart: POST /cart/items] ──► (Server verifies available stock)
       │
       ▼
[Proceeds to /checkout] ──► (Selects shipping address, applies coupon)
       │
       ▼
[Places Order: POST /orders]
       │
       ├─► Server snapshots product name & price
       ├─► Server atomically decrements stock ($inc: -qty)
       ├─► Server reserves coupon usage
       └─► Server creates pending Order & clears Cart
       │
       ▼
[Initializes Payment: POST /payments/orders/:id] ──► (Razorpay Order created in paise)
       │
       ▼
[Completes Razorpay Modal] ──► (HMAC Signature verified: POST /payments/orders/:id/verify)
       │
       ▼
[Order marked "paid" & redirects to /order-confirmation]
```

### 7.2 Customer Reviews Orders and Requests an Eligible Return (RMA)
```
[Customer opens /account/orders]
       │
       ▼
[Selects Delivered Order]
       │
       ▼
[Clicks "Request Return" on eligible line item]
       │
       ▼
[Submits Return Form: POST /api/v1/orders/:id/returns]
       │
       ├─► Server verifies order is "delivered"
       └─► Creates Return record with status "requested"
       │
       ▼
[Admin inspects /admin/returns] ──► (Approves return: status "approved")
       │
       ▼
[Warehouse receives package] ──► (Admin marks "received" -> "inspected")
       │
       ▼
[Admin completes return & restocks]
       │
       ├─► Server restores stock ($inc: +qty)
       ├─► Creates InventoryAdjustment record ("return_restock")
       └─► Transitions Return to "completed"
```

### 7.3 Administrator Manages Catalog and Inventory
```
[Admin opens /admin/products/new]
       │
       ▼
[Defines Product Details, Pricing, Images, and Variants with SKUs]
       │
       ▼
[Submits Form: POST /api/v1/admin/products]
       │
       ├─► SkuRegistry reserves SKUs catalog-wide (prevents collisions)
       ├─► Product created with embedded variants
       └─► AdminAuditLog records "PRODUCT_CREATED"
       │
       ▼
[Admin navigates to /admin/inventory]
       │
       ▼
[Selects item & clicks "Adjust Stock"]
       │
       ▼
[Submits adjustment: delta +10, reason: "restock", note: "PO-4091"]
       │
       ├─► Atomically updates product/variant stock
       ├─► Creates InventoryAdjustment record
       └─► AdminAuditLog records "INVENTORY_ADJUSTED"
```

### 7.4 Administrator Manages Orders and Reviews
```
[Admin opens /admin/orders] ──► (Inspects new orders with payment status "paid")
       │
       ▼
[Updates status to "shipped" with carrier name & tracking code]
       │
       ▼
[Admin opens /admin/reviews] ──► (Inspects pending/flagged customer feedback)
       │
       ▼
[Admin moderates review: toggles "published" or "hidden"]
       │
       ├─► Product.ratings average & count recalculated automatically
       └─► AdminAuditLog records "REVIEW_MODERATED"
```

---

## 8. API and Integration Requirements

### 8.1 Public & Storefront Endpoints

| Method | Endpoint | Auth | Purpose & Validation Rules |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/v1/health/live` | None | Liveness healthcheck. Returns HTTP 200 `{ status: "alive" }`. |
| `GET` | `/api/v1/health/ready` | None | Readiness healthcheck. Evaluates Mongoose connection state. |
| `POST` | `/api/v1/users/register` | None | Customer registration. Validates email, password length >= 6, name. |
| `POST` | `/api/v1/users/login` | None | Authentication. Returns JWT and user payload. Rate limited (10/15 min). |
| `GET` | `/api/v1/users/me` | Bearer | Returns current authenticated profile. |
| `GET` | `/api/v1/products` | None | Paginated catalog search & filtering. Only active items returned. |
| `GET` | `/api/v1/products/:id` | None | Single product detail view by ID or slug. |
| `GET` | `/api/v1/products/:id/reviews` | None | Public reviews list for product. Only published reviews returned. |
| `POST` | `/api/v1/products/:id/reviews` | Bearer | Submit review. Validates 1–5 rating, text, and verified purchase. |
| `GET` | `/api/v1/cart` | Bearer | Get customer cart with calculated subtotal. |
| `POST` | `/api/v1/cart/items` | Bearer | Add item to cart. Validates product existence and stock availability. |
| `PATCH` | `/api/v1/cart/items/:id` | Bearer | Update item quantity. Enforces integer > 0 and stock ceiling. |
| `DELETE` | `/api/v1/cart/items/:id` | Bearer | Remove item from cart. Accepts optional body. |
| `POST` | `/api/v1/cart/merge` | Bearer | Merge guest cart items into authenticated cart. |
| `POST` | `/api/v1/orders` | Bearer | Place order from cart. Requires `addressId`. Decrements stock. |
| `GET` | `/api/v1/orders` | Bearer | List customer-owned orders. |
| `GET` | `/api/v1/orders/:id` | Bearer | View specific order details. Strictly customer-scoped. |
| `PATCH` | `/api/v1/orders/:id/cancel` | Bearer | Cancel pending/processing order. Restores stock. |
| `POST` | `/api/v1/payments/orders/:id` | Bearer | Generate Razorpay order for pending order. Amount in paise. |
| `POST` | `/api/v1/payments/orders/:id/verify`| Bearer | Verify HMAC SHA-256 signature and update order to paid. |
| `POST` | `/api/v1/payments/webhook` | Webhook | Inbound Razorpay webhook. Verifies raw body HMAC signature. |
| `GET` | `/api/v1/banners` | None | Active storefront marketing banners. Filtered by placement and date. |

### 8.2 Administrative Endpoints (`/api/v1/admin/*`)

| Method | Endpoint | Auth | Purpose & Validation Rules |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/v1/admin/dashboard` | Admin | Real-time sales, order, inventory, and customer metric aggregates. |
| `GET` | `/api/v1/admin/products` | Admin | Catalog management table with inactive/active indicators. |
| `POST` | `/api/v1/admin/products` | Admin | Create product with variants, specs, and global SKU reservations. |
| `PATCH` | `/api/v1/admin/products/:id` | Admin | Update product metadata, pricing, active status, or variants. |
| `DELETE` | `/api/v1/admin/products/:id` | Admin | Soft-delete product (`isActive: false`). Audited in log. |
| `GET` | `/api/v1/admin/inventory` | Admin | Multi-product stock levels. Filter by low-stock and type (simple/variant). |
| `POST` | `/api/v1/admin/inventory/adjust` | Admin | Manual stock adjustment. Requires delta, reason, and operational note. |
| `GET` | `/api/v1/admin/orders` | Admin | Master order fulfillment console with customer information and status filters. |
| `PATCH` | `/api/v1/admin/orders/:id/status`| Admin | Advance order lifecycle (`processing`, `shipped`, `delivered`, `cancelled`). |
| `GET` | `/api/v1/admin/returns` | Admin | Review customer return requests and manage RMA lifecycle. |
| `PATCH` | `/api/v1/admin/returns/:id/status`| Admin | Update return status; triggers stock restoration upon inspection. |
| `POST` | `/api/v1/admin/refunds` | Admin | Execute gateway refund or record manual settlement; logs to ledger. |
| `GET` | `/api/v1/admin/reviews` | Admin | Review moderation table across all statuses. |
| `PATCH` | `/api/v1/admin/reviews/:id/status`| Admin | Moderate review status (`published`, `hidden`, `flagged`). Recalculates rating. |
| `GET` | `/api/v1/admin/coupons` | Admin | List promotional discount coupons with redemption stats. |
| `POST` | `/api/v1/admin/coupons` | Admin | Create discount coupon with date limits, usage caps, and spend rules. |
| `GET` | `/api/v1/admin/banners` | Admin | Administrative banner management. |
| `POST` | `/api/v1/admin/banners` | Admin | Create marketing banner with scheduling and placement tags. |
| `GET` | `/api/v1/admin/customers` | Admin | View registered customer directory and lifetime order metrics. |
| `GET` | `/api/v1/admin/users` | Admin | Administrative staff directory and role governance. |
| `GET` | `/api/v1/admin/audit-logs` | Admin | Tamper-resistant log of all administrative actions. |
| `GET` | `/api/v1/admin/settings` | Admin | Retrieve store operational settings and maintenance toggle. |
| `PATCH` | `/api/v1/admin/settings` | Admin | Update store settings (currency, tax, shipping thresholds). |

---

## 9. Data and Business Rules

### 9.1 Product Availability & Inventory Invariants
1. **Stock Non-Negativity:** Product and variant `stock` must be non-negative integers (`stock >= 0`). Decrementing below 0 is rejected with HTTP 400 `INSUFFICIENT_STOCK`.
2. **Atomic Modification:** All stock alterations during order placement or cancellation must execute via atomic MongoDB operators (`$inc: { stock: -quantity }`).
3. **SKU Uniqueness:** Every SKU assigned to a simple product or variant must be unique catalog-wide, coordinated through `SkuRegistry`.

### 9.2 Order Lifecycle Invariants
1. **Price Snapshotting:** At the moment an order is created, the product title, SKU, variant attributes, and unit price are permanently snapshotted into the order line item document. Future catalog price edits do not mutate past orders.
2. **Status Transition Sequence:**
   * `pending` ➔ `processing` (upon verified payment)
   * `processing` ➔ `shipped` (carrier & tracking number required)
   * `shipped` ➔ `delivered`
   * `pending` | `processing` ➔ `cancelled` (triggers automatic atomic stock restoration)
   * `delivered` and `cancelled` are **terminal** states and cannot be re-opened.

### 9.3 Payment & Refund Invariants
1. **Currency Authority:** All payment orders must be calculated in Indian Rupees (`INR`) and converted to paise via `Math.round(order.total * 100)` to prevent floating-point inaccuracies.
2. **Refund Ceiling:** The cumulative refunded amount for any order must never exceed `order.total`. Over-refunding is rejected with HTTP 400 `REFUND_EXCEEDS_ORDER_TOTAL`.
3. **Ledger Immutability:** Every refund creates an immutable `FinancialLedger` entry with gateway transaction ID or manual reference.

### 9.4 Review Moderation & Rating Aggregation Invariants
1. **Verified Purchase Qualification:** A customer can only submit a review if they have at least one delivered order containing the product.
2. **Atomic Rating Cache Rollback:** When an admin moderates a review (e.g. hides or deletes it), the product's aggregate rating count and average score are recomputed. If database recalculation fails, the moderation action automatically rolls back to its prior state.

### 9.5 Coupon Eligibility & Usage Rules
1. **Expiration & Thresholds:** Coupons cannot be applied if `currentDate < startDate` or `currentDate > endDate`, or if cart subtotal is less than `minOrderAmount`.
2. **Redemption Limits:** Global `usageLimit` and per-user `userUsageLimit` are verified before order creation. Coupons are temporarily reserved during checkout and finalized upon payment.

---

## 10. UI/UX Requirements

### 10.1 Design System & Aesthetic Foundation
* **Theme Tokens:** Primary forest-green (`#123C32`), background sage tint (`#EEF5F1`), crisp white cards (`#FFFFFF`), border subtle slate (`#E4E8E5`), dark slate typography (`text-slate-900`, `text-slate-600`).
* **Typography:** Modern clean sans-serif stack with proportional numerals for currency displays (`formatPrice()` displaying `₹`).

### 10.2 Component State Requirements
Every data-driven view across storefront and admin must explicitly handle four distinct states:
1. **Loading State:** Render structured pulse skeletons ([Skeleton.jsx](./commerceflow-web/src/components/Skeleton.jsx), [AdminShellStates.jsx](./commerceflow-web/src/layouts/admin/AdminShellStates.jsx)) preserving page layout without content shifts.
2. **Empty State:** Branded empty state illustrations with clear guidance and actionable call-to-action buttons (e.g. "No products found", "Your cart is empty").
3. **Error State:** Human-friendly error notifications detailing the issue with a distinct "Try Again" / retry trigger.
4. **Data Presentation:** Accessible tables or responsive grids with badge indicators, formatted dates, and currency symbols.

### 10.3 Transparency of Preview / Client-Side Functionality
Administrative surfaces that operate with client-side browser storage (e.g. Wallets, Expenses, Campaigns, Achievements) must display informative notices to operators to prevent confusion with shared database persistence.

---

## 11. Testing and Quality Assurance

### 11.1 Test Organization and Verification
Both repositories include automated test suites:

| Project | Test Runner | Verified Files / Suites | Verified Passing Tests | Execution Command |
| :--- | :--- | :--- | :--- | :--- |
| **Backend API** | Vitest | **117 test files passed** (1 skipped) | **1,810 tests passed** (18 skipped) | `npm test` (or `npx vitest run`) |
| **Frontend Web** | Custom Node Test Runner | **191 test suites passed** | **733 tests passed** (0 failed) | `npm test` (or `node scripts/run-tests.js`) |

### 11.2 Key Coverage Domains Verified
* **Backend Security:** Auth rate limiters, webhook rate limiters, timing-safe signatures, JWT validation, role authorization, and database target safety helper.
* **Commerce Pipeline:** Order calculation, price snapshotting, atomic stock deduction, stock restoration on cancellation, coupon reservation release.
* **Data Models:** Mongoose schemas, indexes, embedded variants, SKU registry uniqueness, financial ledgers, and audit logs.
* **Frontend UI:** Route guards (`ProtectedRoute`, `AdminRoute`), cart and wishlist contexts, admin catalog management, return RMA state machines, and CSV export sanitization.

---

## 12. Security and Risk Considerations

### 12.1 Confirmed Risks and Mitigations

| Risk Domain | Potential Impact | Implemented Mitigation | Residual Recommendation |
| :--- | :--- | :--- | :--- |
| **In-Memory Rate Limiting** | When scaled across multiple API instances, rate limits are per-instance rather than global. | Strict per-instance limits currently active (100 req/15 min). | Connect `express-rate-limit` to a shared Redis store when multi-instance load balancing is deployed. |
| **Synchronous Processing Latency** | Heavy email notifications or PDF generation inside request handlers could delay responses. | Operations are kept lightweight; currently 0 queue dependencies. | Introduce a background job worker (BullMQ) when email or SMS integrations are introduced. |
| **Accidental Production DB Mutation** | Running CLI admin tools against production can corrupt live data. | `safety-helper.js` unconditionally blocks `NODE_ENV=production` and enforces fail-closed checks. | Eliminate cross-script override variable bleed and remove `0.0.0.0` from local hosts whitelist. |
| **CSV Formula Injection (CWE-1236)** | Exported customer reports could execute malicious formulas in Excel/Sheets. | `sanitizeCsvCell()` prepends single quotes to leading `=`, `+`, `-`, `@`. | Verified implemented in `AdminReportsPage.jsx`. |

---

## 13. Current Gaps and Limitations

### 13.1 Administrative Features with Client-Side (LocalStorage) Persistence
The following administrative modules feature interactive user interfaces but persist data in browser `localStorage` rather than server-side MongoDB collections:
1. **Customer Wallets (`/admin/wallets`):** Stored under `commerceflow_admin_wallets_v1`. Does not persist store credit to user documents on the backend.
2. **Operating Expenses (`/admin/finance/expenses`):** Stored under `commerceflow_admin_expenses_v1`.
3. **Marketing Campaigns (`/admin/campaigns`):** Stored under `commerceflow_admin_campaigns_v1`. Banners and coupons are persisted in MongoDB, but the unifying campaign container is client-side.
4. **Staff Achievements (`/admin/achievements`):** Utilizes static in-memory data definitions without backend CRUD endpoints.

### 13.2 Unwired Infrastructure
1. **Redis Caching:** Local Redis daemon runs on port 6379, and `redis: ^6.2.1` is in `package.json`, but `src/infrastructure/redis` is empty and no application code interfaces with Redis.
2. **Job Queue Architecture:** No background worker queue (Bull / BullMQ) is implemented.

### 13.3 API Schema Minor Nuance
* **HTTP DELETE Body Schema:** `removeCartItemSchema` in `cart.validator.js` and wishlist removal schemas specify `body: z.object({})` without `.optional()`. The web frontend provides `{ body: {} }` explicitly, but external or cURL consumers sending empty DELETE requests encounter a 400 validation error unless `{}` is supplied.

---

## 14. Roadmap and Priorities

### P0: Security, Data Integrity & Staging Blockers (Immediate)
* [ ] **Harden Safety Helper (`safety-helper.js`):** Remove cross-script staging override permission bleed (`ALLOW_STAGING_ADMIN_CREATION` permitting promotion), remove `0.0.0.0` from `LOCAL_HOSTS`, and include `"prod"` in production lockout.
* [ ] **Patch DELETE Validation Schemas:** Add `.optional()` to body schemas in `cart.validator.js` and `wishlist.validator.js`.
* [ ] **Staging Deployment Execution:** Deploy backend container and frontend static bundle to isolated staging environment following `STAGING_DEPLOYMENT_CHECKLIST.md`.

### P1: Core Commerce Completeness (Near-Term)
* [ ] **Server-Side Persistence for Wallets & Expenses:** Introduce Mongoose schemas and admin routes for customer store credit wallets and business expense ledgers.
* [ ] **Campaign Entity Persistence:** Introduce `Campaign` Mongoose model linking banners and coupons on the server.
* [ ] **Transactional Email Dispatch:** Integrate transactional notification service (e.g. Resend, SendGrid) for order confirmations, shipping updates, and password resets.

### P2: Operational Scaling & Performance (Medium-Term)
* [ ] **Redis Application Integration:** Connect `src/infrastructure/redis` to cache public product catalog queries and back `express-rate-limit` across distributed instances.
* [ ] **Background Job Queue:** Introduce BullMQ backed by Redis for asynchronous email dispatch, invoice generation, and audit archiving.
* [ ] **Local Docker Compose:** Create a unified `docker-compose.yml` orchestrating MongoDB, Redis, API, and Web for one-command local developer onboarding.

### P3: Platform Expansion (Long-Term)
* [ ] **Multi-Warehouse Inventory:** Expand inventory model from single-location stock to multi-location fulfillment hubs.
* [ ] **Automated Shipping Carrier API Integration:** Directly integrate logistics aggregators (e.g. Shiprocket, Bluedart) for automated label generation and tracking webhooks.

---

## 15. Acceptance and Release Readiness Criteria

### 15.1 Staging Release Gate
* [ ] All 1,810 backend Vitest tests pass with 0 failures.
* [ ] All 733 frontend tests pass with 0 failures.
* [ ] `safety-helper.js` regression tests pass with zero cross-script authorization leakage.
* [ ] Production frontend build compiles in Vite with 0 errors.
* [ ] Backend container boots cleanly under `node:22-alpine` as unprivileged user `node`.
* [ ] Database connects to isolated staging cluster (`commerceflow_staging`); no production credentials present.
* [ ] Razorpay runs strictly in Test Mode (`rzp_test_`).

### 15.2 Production Release Gate
* [ ] Staging end-to-end checkout, payment capture, and return flows successfully verified with real browser sessions.
* [ ] HTTPS enforced across edge CDN and API ingress with valid TLS certificates.
* [ ] Reverse proxy trust configured (`TRUST_PROXY=1`) and CORS restricted to production frontend FQDN.
* [ ] Automated database snapshot backups active on primary MongoDB replica set.
* [ ] All secrets injected securely via production secrets manager. Zero secrets in source repository.

---

## 16. Assumptions, Dependencies, and Open Questions

### 16.1 Architectural Assumptions
1. **Single-Merchant Operation:** The system operates exclusively as a first-party store. Multi-vendor marketplace capabilities are out of scope for the current architecture.
2. **Currency:** Primary currency is fixed to Indian Rupees (`INR`). International multi-currency conversion is not active in the current baseline.
3. **Database Topology:** MongoDB deployment supports document writes with schema validation. Transactions are omitted in favor of atomic document updates (`$inc`, `$set`, `$pull`) to avoid requiring multi-document replica set transactions in standalone development.

### 16.2 External Dependencies
* **Razorpay Payment Gateway:** External dependency for test and production payment capture, order generation, and webhook delivery.
* **Node.js Runtime:** Requires Node.js version 20 or 22 LTS with native ES Module support.
* **MongoDB:** Managed MongoDB 6.0+ instance (local standalone or cloud cluster).

### 16.3 Open Questions for Product Leadership
1. **Store Credit Integration:** Should customer wallet balances (currently preview-only) be redeemable directly as a payment method at checkout alongside Razorpay?
2. **Refund Automation:** Should completed return approvals automatically trigger an automated Razorpay gateway refund, or should refunds remain an explicit, separate administrative ledger action as currently implemented?
3. **Multi-Instance Deployment Schedule:** When will traffic demands require horizontal scaling of the API container, necessitating the activation of Redis for shared rate limiting?

---

*End of Product Requirements Document — CommerceFlow*
