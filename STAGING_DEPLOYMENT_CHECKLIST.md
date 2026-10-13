# CommerceFlow Staging Deployment Checklist

This runbook and checklist defines the architecture, environment variables, security boundaries, and verification procedures required to deploy CommerceFlow to a staging environment.

> **CRITICAL SECURITY RULE**: Never place real credentials, production secrets, database URIs, API keys, or private URLs into this file or repository. Use placeholder values only.

---

## 1. Architecture

### Client Storefront Traffic Flow
```
[User Browser]
       │
       ▼ (HTTPS)
[Frontend Static Hosting / Edge CDN]
  (Serves cached assets from dist/; rewrites deep links to /index.html)
       │
       ▼ (HTTPS API requests with HttpOnly Cookie; credentials: include)
[Ingress / Reverse Proxy / Load Balancer] (TLS Termination)
       │
       ▼ (HTTP port 4000; TRUST_PROXY=1)
[Backend Container (Node 22 / Express)]
       │
       ▼ (TLS Connection Pool)
[Managed MongoDB Cluster (Staging Database)]
```

### Payment Webhook Traffic Flow
```
[Razorpay Infrastructure (Test Mode)]
       │
       ▼ (Inbound HTTPS POST with X-Razorpay-Signature)
[Ingress / Reverse Proxy] (TLS Termination)
       │
       ▼ (Raw Body Buffer preserved for HMAC SHA-256 verification)
[Backend Container: /api/v1/payments/webhook]
       │
       ▼ (Idempotent update & inventory status)
[Managed MongoDB Cluster (Staging Database)]
```

---

## 2. Backend Environment Variables

All backend environment variables must be injected securely at runtime via the hosting platform's secrets manager. Never commit a `.env` file to source control.

| Variable | Requirement | Type | Description | Staging Placeholder |
|---|---|---|---|---|
| `NODE_ENV` | **Required** | Public | Application execution mode (`development`, `test`, `staging`, `production`). | `staging` |
| `PORT` | Optional | Public | Internal HTTP listener port (defaults to `4000`). | `4000` |
| `MONGODB_URI` | **Required** | **Secret** | Connection string pointing to isolated staging MongoDB database. | `mongodb+srv://<STAGING_DB_USER>:<STAGING_DB_PASSWORD>@<STAGING_CLUSTER>.mongodb.net/commerceflow_staging?retryWrites=true&w=majority` |
| `JWT_SECRET` | **Required** | **Secret** | Cryptographic signing key for customer sessions. Must be >= 32 characters. | `<STAGING_RANDOM_SECRET_MIN_32_CHARS>` |
| `JWT_EXPIRES_IN` | Optional | Public | Token expiration duration (defaults to `20m`). | `20m` |
| `RAZORPAY_KEY_ID` | **Required** | Public | Razorpay Test Key ID (prefixed with `rzp_test_`). Returned to client on payment init. | `rzp_test_<STAGING_KEY_ID>` |
| `RAZORPAY_KEY_SECRET` | **Required** | **Secret** | Razorpay Test Key Secret for server-side order creation and signature verification. | `<STAGING_RAZORPAY_KEY_SECRET>` |
| `RAZORPAY_WEBHOOK_SECRET` | Optional* | **Secret** | Webhook signing secret configured in Razorpay dashboard (*required in production). | `<STAGING_WEBHOOK_SECRET>` |
| `CORS_ORIGIN` | **Required** | Public | Comma-separated list of allowed frontend origins. Wildcard `*` is forbidden. | `https://<STAGING_FRONTEND_DOMAIN>` |
| `TRUST_PROXY` | Optional | Public | Reverse proxy hop count (`1`) or trusted CIDR to enable client IP detection. | `1` |
| `LOG_LEVEL` | Optional | Public | Structured JSON logging verbosity (defaults to `info`). | `info` |
| `WEBHOOK_RATE_LIMIT` | Optional | Public | Webhook request quota per 15-minute window (defaults to `60`). | `60` |

---

## 3. Frontend Environment Variables

Frontend variables are prefixed with `VITE_` and are bundled directly into client-side static JavaScript during the `npm run build` process.

| Variable | Requirement | Type | Description | Staging Placeholder |
|---|---|---|---|---|
| `VITE_API_BASE_URL` | **Required** | Public | Publicly accessible base URL to the staging backend API. | `https://<STAGING_API_DOMAIN>/api/v1` |
| `VITE_RAZORPAY_KEY_ID` | Optional | Public | Fallback public key ID. The backend dynamically supplies the authoritative `keyId`. | `rzp_test_<STAGING_KEY_ID>` |

> **IMPORTANT**:
> - All `VITE_*` values are publicly readable by any user in their browser dev tools.
> - Backend secrets (`JWT_SECRET`, `MONGODB_URI`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`) must **NEVER** be placed in frontend files or frontend deployment environments.

---

## 4. MongoDB Staging Checklist

- [ ] **Database Isolation**: The staging environment connects to a dedicated staging database (e.g. `commerceflow_staging`).
- [ ] **No Production Data**: Staging must **never** connect to or share data with the production database.
- [ ] **No Local Database Reuse**: Staging must use a cloud-hosted or cluster instance, not developer workstations.
- [ ] **Secret Placement**: `MONGODB_URI` with credentials is stored solely in the backend hosting platform's encrypted environment settings.
- [ ] **Network Whitelisting**: Network access (IP access list / VPC peering) is restricted to the backend hosting platform's outbound IP addresses.
- [ ] **Replica-Set Topology**: A managed replica set (e.g., MongoDB Atlas M0/M10 cluster) is recommended to mirror production connectivity and oplog capabilities.
- [ ] **Backups**: Automated snapshot backups are enabled if non-ephemeral staging validation is required.
- [ ] **Data Reset Policy**: An agreed-upon policy must exist regarding whether staging test data can be wiped during validation cycles.

---

## 5. Razorpay Staging Checklist

- [ ] **Test Mode Strictly Enforced**: Confirm the Razorpay account is in **Test Mode** (Key ID must begin with `rzp_test_`).
- [ ] **No Live Transactions**: Live cards, real bank accounts, or real funds must never be used in staging.
- [ ] **Secret Placement**: `RAZORPAY_KEY_SECRET` resides strictly in the backend secrets configuration.
- [ ] **Webhook Endpoint**: Configured in Razorpay Test Dashboard as:
  ```
  https://<STAGING_API_DOMAIN>/api/v1/payments/webhook
  ```
- [ ] **HTTPS Enforced**: Razorpay requires a valid, publicly reachable HTTPS webhook URL with trusted TLS certificate.
- [ ] **Signature Verification**: Webhook secret configured in the dashboard must exactly match backend `RAZORPAY_WEBHOOK_SECRET`.
- [ ] **Raw Body Buffer**: Backend verifies HMAC SHA-256 against `req.rawBody` (already implemented in `src/app.js`).

---

## 6. Backend Deployment Checklist

- [ ] **Container Image**: Built using the repository's native `Dockerfile`.
- [ ] **Base Image**: Uses official `node:22-alpine` for minimal attack surface.
- [ ] **Production Dependencies**: Image built with `npm ci --omit=dev`.
- [ ] **Unprivileged User**: Drops privileges and executes as non-root `USER node` (UID 1000).
- [ ] **Container Port**: Listens internally on port `4000` (mapped to edge HTTPS `443`).
- [ ] **Liveness Probe**: Orchestrator queries `GET /api/v1/health/live` (expects HTTP 200).
- [ ] **Readiness Probe**: Load balancer queries `GET /api/v1/health/ready` (expects HTTP 200 and `status: "ready"`).
- [ ] **TLS Termination**: Ingress / Edge proxy terminates TLS; container receives plain HTTP traffic.
- [ ] **Proxy Configuration**: `TRUST_PROXY=1` configured to enable accurate client IP extraction for rate limiting.
- [ ] **CORS Restriction**: `CORS_ORIGIN` matches exact staging frontend URL (`https://<STAGING_FRONTEND_DOMAIN>`).
- [ ] **Observability**: Structured JSON logs emitted by Pino to stdout/stderr with request ID tracking.
- [ ] **Graceful Shutdown**: Termination grace period configured to >= 15 seconds to allow clean connection termination.

---

## 7. Frontend Deployment Checklist

- [ ] **Compilation**: Built with command `npm run build` (`vite build`).
- [ ] **Build Artifacts**: Compiled purely as static assets in `dist/`.
- [ ] **Zero Runtime Dependencies**: No Node.js server process required on the frontend host.
- [ ] **Environment Variable Injected at Build Time**: `VITE_API_BASE_URL` defined during compilation.
- [ ] **SPA Rewrite Rule**: Hosting platform / CDN configured to route all non-asset requests (`/*`) to `/index.html` with HTTP 200.
- [ ] **Static Asset Caching**: Cache headers on `/assets/*` configured with `public, max-age=31536000, immutable`.
- [ ] **HTTPS Enforced**: HSTS / HTTPS required for secure transmission of JWT Bearer tokens and payment metadata.

---

## 8. DNS & Domain Plan (Placeholders)

> **NOTE**: DNS records are not modified during preparation; they are established only upon infrastructure provisioning.

| Component | Protocol | Placeholder FQDN | Target Destination |
|---|---|---|---|
| **Frontend Storefront** | HTTPS | `https://<STAGING_FRONTEND_DOMAIN>` | Edge CDN / Static Hosting CNAME |
| **Backend API** | HTTPS | `https://<STAGING_API_DOMAIN>` | Backend Container Ingress / Load Balancer CNAME |

---

## 9. Secret Management Rules

1. **Zero Secrets in Git**: Never commit `.env`, test tokens, or credentials into source control.
2. **Platform Secret Storage**: In staging, inject credentials via platform-managed environment variables (e.g. Render/Railway/AWS Secrets).
3. **Frontend Boundary**: Never inject backend secrets into frontend build environments.
4. **Rotation Readiness**: All secrets (`JWT_SECRET`, database passwords, Razorpay API keys) must be rotatable without requiring codebase edits.

---

## 10. Staging Verification Checklist

### Backend Verification (Post-Deploy)
- [ ] `GET /api/v1/health/live` returns HTTP 200 `{"success": true, "data": {"status": "alive"}}`.
- [ ] `GET /api/v1/health/ready` returns HTTP 200 `{"status": "ready", "dependencies": {"mongodb": {"status": "connected"}}}`.
- [ ] Direct HTTPS requests to API succeed with valid SSL certificate.
- [ ] CORS preflight from authorized staging frontend origin succeeds (`Access-Control-Allow-Origin` present).
- [ ] CORS preflight from unauthorized origin is rejected.
- [ ] Customer registration (`POST /api/v1/users/register`) creates a user.
- [ ] Customer login (`POST /api/v1/users/login`) returns a valid JWT token.
- [ ] Protected endpoints (`GET /api/v1/users/me`) accept the JWT token.
- [ ] Product catalog (`GET /api/v1/products`) returns active products.
- [ ] Cart operations (`GET /api/v1/cart`, `POST /api/v1/cart/items`) calculate server-authoritative totals.
- [ ] Order creation (`POST /api/v1/orders`) decrements inventory and returns pending order.
- [ ] Razorpay payment order (`POST /api/v1/payments/orders/:id`) creates a test order with `keyId`.
- [ ] Inbound test webhook delivery (`POST /api/v1/payments/webhook`) validates HMAC signature and updates order status.

### Frontend Verification (Post-Deploy)
- [ ] Homepage loads cleanly without console errors.
- [ ] SPA deep links (`/shop`, `/cart`, `/checkout`, `/account/orders`, `/admin`) resolve on page reload without 404s.
- [ ] User login and registration flows authenticate and update UI state.
- [ ] Product catalog and product details render server data with images and INR pricing.
- [ ] Cart item additions, quantity modifications, and removals update navbar badge and cart page.
- [ ] Checkout flow validates delivery address and dispatches `{ addressId }` to place order.
- [ ] Order confirmation page opens Razorpay Checkout modal with test payment details.
- [ ] Payment completion verifies signature with backend and updates order status to "Paid".
- [ ] Order history (`/account/orders`) displays customer-scoped orders.
- [ ] Admin dashboard and product/order management remain restricted to admin role.
