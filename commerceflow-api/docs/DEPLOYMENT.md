# CommerceFlow API — Production Deployment

This runbook outlines the requirements, configuration, and operational procedures for deploying the CommerceFlow API to production environments based on the repository's current architecture and codebase.

---

## 1. Prerequisites

Before deploying the application, ensure the host environment meets the following requirements:

* **Node.js Runtime:** Node.js `>=20` (compatible with the package engine declaration `"engines": { "node": ">=20" }`).
* **Container Runtime:** Docker (or an OCI-compliant container orchestrator such as Kubernetes or ECS).
* **Database:** A reachable production MongoDB instance or cluster.
* **Reverse Proxy / Ingress:** An upstream reverse proxy or load balancer (e.g., Nginx, AWS ALB, Cloudflare) configured to terminate TLS/HTTPS before forwarding traffic to the container. The application serves HTTP on port `4000` and relies on the edge proxy for TLS termination.

---

## 2. Required Production Environment Variables

All production environment variables and secrets must be injected at runtime through the container orchestrator, hosting platform, or secrets manager. Never commit `.env` files or secret values to source control.

The application validates all environment variables at startup using Zod in `src/config/env.js`. If any required variable is missing or invalid, process startup fails immediately with an error log.

| Variable | Required in Production | Default | Description |
|---|---|---|---|
| `NODE_ENV` | Yes | `development` | Set to `production` (enforces strict production checks for CORS and webhook secrets). |
| `PORT` | Optional | `4000` | Port on which the HTTP server listens (`1`–`65535`). |
| `MONGODB_URI` | Yes | — | MongoDB connection string (e.g. `mongodb+srv://...`). |
| `JWT_SECRET` | Yes | — | Cryptographic secret for signing JWTs. Must be at least 32 characters long. |
| `JWT_EXPIRES_IN` | Optional | `20m` | Token expiration duration (e.g., `15m`, `1h`, `7d`). |
| `RAZORPAY_KEY_ID` | Yes | — | Razorpay API key ID for payment order creation. |
| `RAZORPAY_KEY_SECRET` | Yes | — | Razorpay API key secret. |
| `RAZORPAY_WEBHOOK_SECRET` | Yes | — | Webhook signing secret. Required in production; cannot use placeholder values. |
| `CORS_ORIGIN` | Yes | — | Comma-separated list of allowed origins. Wildcard (`*`) is strictly rejected in production. |
| `TRUST_PROXY` | Optional | `false` | Reverse proxy trust configuration (`false`, `true` / `1` for single hop, or trusted CIDR). |
| `LOG_LEVEL` | Optional | `info` | Logging verbosity: `fatal`, `error`, `warn`, `info`, `debug`, or `trace`. |
| `WEBHOOK_RATE_LIMIT` | Optional | `60` | Request limit per 15-minute window on `/api/v1/payments/webhook`. |

### Example Production `.env` Definition (Placeholders)

```env
NODE_ENV=production
PORT=4000
MONGODB_URI=mongodb+srv://USER:PASSWORD@cluster.mongodb.net/commerceflow_prod?retryWrites=true&w=majority
JWT_SECRET=production_super_secret_signing_key_at_least_32_chars
JWT_EXPIRES_IN=20m
RAZORPAY_KEY_ID=rzp_live_PLACEHOLDER_KEY
RAZORPAY_KEY_SECRET=PLACEHOLDER_RAZORPAY_SECRET
RAZORPAY_WEBHOOK_SECRET=PLACEHOLDER_WEBHOOK_SECRET
CORS_ORIGIN=https://app.example.com,https://admin.example.com
TRUST_PROXY=1
LOG_LEVEL=info
WEBHOOK_RATE_LIMIT=60
```

---

## 3. MongoDB

* **Startup Dependency:** During startup, `src/server.js` calls `connectMongoDB()` before calling `app.listen()`. If the initial MongoDB connection fails, the process logs a fatal error and terminates with exit code `1`.
* **Connection String:** Provide a high-availability MongoDB connection string in `MONGODB_URI`.
* **Deployment Topology:** For high availability and consistent data reliability, a managed MongoDB replica set or cluster is recommended.
* **Readiness Monitoring:** Real-time database connection status is evaluated on demand via the `/api/v1/health/ready` probe.

---

## 4. Razorpay

* **Credentials:** Supply live `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` securely through environment variables.
* **Webhook Endpoint:** Razorpay sends event notifications to:
  ```text
  POST /api/v1/payments/webhook
  ```
* **Webhook Signature Verification:** The application validates the HMAC SHA-256 signature in the `X-Razorpay-Signature` header against the raw body buffer.
* **Production Constraint:** In production mode (`NODE_ENV=production`), `RAZORPAY_WEBHOOK_SECRET` must be set and cannot be the default template value (`your_razorpay_webhook_secret`).
* **Rate Limiting:** Webhooks are exempted from the general global rate limiter and protected by their own dedicated limiter (`WEBHOOK_RATE_LIMIT`, default 60 requests per 15 minutes).

---

## 5. CORS and Cookie-Compatible Production Network Topology

CommerceFlow uses **HttpOnly, Secure, SameSite=Lax** cookies for authentication tokens (`token` and `admin_token`). To ensure reliable browser cookie transmission and prevent cross-site request forgery or silent session drops, the production network topology must strictly respect modern browser same-site cookie semantics.

### 5.1 Supported Production Topologies

Browser cookie handling under `SameSite=Lax` requires that authenticated API requests occur within the same site (matching registrable domain / eTLD+1).

#### Topology A: Unified Domain with Path Routing (Preferred & Recommended)
All traffic is routed through a single edge reverse proxy (e.g., Nginx, AWS ALB, Cloudflare):
* **Frontend Origin**: `https://example.com` (serves the static SPA)
* **Backend API Origin**: `https://example.com/api` (reverse-proxied to backend container port `4000`)
* **Why it works**: Both frontend and backend share the identical origin (`https://example.com`). All requests are same-origin; cookies are automatically included and transmitted without cross-origin or cross-site limitations.
* **CORS Setting**: `CORS_ORIGIN=https://example.com`

#### Topology B: Same-Site Subdomain Architecture (Supported)
* **Frontend Origin**: `https://app.example.com` (or `https://store.example.com`)
* **Backend API Origin**: `https://api.example.com`
* **Why it works**: Both origins share the identical registrable domain / eTLD+1 (`example.com`). Under browser specifications, requests between `app.example.com` and `api.example.com` are **Same-Site**. Cookies configured with `SameSite=Lax` and appropriate domain/path attributes are sent on same-site fetch requests when credentials are included.
* **CORS Setting**: `CORS_ORIGIN=https://app.example.com`

### 5.2 Strictly Unsupported Topologies (Cross-Site Prohibited)

> [!CAUTION]
> **Cross-Site Root Domains Are NOT Supported**:
> Topologies where the frontend and backend reside on completely separate root domains—such as:
> * Frontend: `https://frontend.example-a.com`
> * Backend: `https://backend.example-b.com`
> **ARE NOT SUPPORTED** under the current production security architecture.
> Modern browsers classify this as a cross-site context. Browsers will refuse to attach `SameSite=Lax` HttpOnly cookies to cross-site asynchronous fetch requests (`fetch()` / `axios`), causing silent authentication failure (`401 Unauthorized`).
>
> **Do NOT weaken `SameSite=Lax` to `SameSite=None`** merely to facilitate an incompatible multi-domain topology. Weakening `SameSite` exposes authenticated sessions to cross-site request forgery. The correct solution is deploying frontend and backend within the same site.

### 5.3 Production Cookie and CORS Requirements

1. **Exact Origin Whitelisting**: `CORS_ORIGIN` must match the frontend origin exactly (e.g. `https://app.example.com`). Wildcards (`*`) are prohibited and rejected at startup.
2. **Credentials Required**: The backend enables `credentials: true` in CORS, and the frontend client must issue requests with `credentials: 'include'`.
3. **Secure Cookies**: Production cookies require `Secure=true`, which mandates HTTPS for all production communication.

---

## 6. TRUST_PROXY Production Configuration

Express rate limiters (`express-rate-limit`) and audit logs rely on `req.ip` to identify client connections. In production, applications deployed behind reverse proxies, load balancers, or CDNs receive client traffic forwarded with `X-Forwarded-For` headers.

The application in `src/app.js` hardens `trust proxy` configuration and does NOT use naive `app.set('trust proxy', true)`, which would allow arbitrary spoofing of client IPs.

### Supported Production Configurations

| Network Architecture | `TRUST_PROXY` Setting | Description |
|---|---|---|
| **Direct Application Exposure** | `TRUST_PROXY=false` | No reverse proxy exists; application directly terminates external client TCP traffic. Express uses the socket remote address. |
| **Single Reverse Proxy (Standard)** | `TRUST_PROXY=1` (or `true`) | Application sits behind exactly one trusted edge proxy (e.g. AWS ALB, Heroku router, single Nginx instance, Cloudflare). Express trusts the immediate proxy hop. |
| **Multiple Trusted Proxy Hops** | `TRUST_PROXY=2` (or positive integer `N`) | Application sits behind multiple trusted hops (e.g., Cloudflare CDN $\rightarrow$ AWS ALB $\rightarrow$ Node.js container). Express trusts the specified count of upstream hops. |
| **Explicit Subnet / CIDR** | `TRUST_PROXY=10.0.0.0/8,172.16.0.0/12` | Express trusts only specific trusted internal IP ranges or CIDRs. |

> [!IMPORTANT]
> `TRUST_PROXY` must correspond accurately to the actual network topology. Never set an arbitrary hop count. If no proxy is present, leaving `TRUST_PROXY=false` prevents malicious clients from spoofing client IPs via forged `X-Forwarded-For` headers.

---

## 7. Build and Run with Docker

The repository includes a production-ready `Dockerfile` and `.dockerignore`.

### Dockerfile Specifications
* **Base Image:** `node:22-alpine`
* **Working Directory:** `/app`
* **Dependencies:** Installed using `npm ci --omit=dev` (excludes devDependencies such as Vitest and Supertest).
* **Source:** Copies `src` directory.
* **User:** Runs as non-root user `node` (UID 1000).
* **Port:** Exposes `4000`.
* **Healthcheck:** Configured with a 30s interval querying `/api/v1/health/live` using Node's built-in `http` module.
* **Entrypoint:** `CMD ["node", "src/server.js"]`

### Build the Image
```bash
docker build -t commerceflow-api:latest .
```

### Run the Container
```bash
docker run -d \
  --name commerceflow-api \
  -p 4000:4000 \
  -e NODE_ENV=production \
  -e PORT=4000 \
  -e MONGODB_URI="mongodb+srv://USER:PASSWORD@cluster.mongodb.net/commerceflow?retryWrites=true&w=majority" \
  -e JWT_SECRET="production_super_secret_signing_key_at_least_32_chars" \
  -e RAZORPAY_KEY_ID="rzp_live_PLACEHOLDER_KEY" \
  -e RAZORPAY_KEY_SECRET="PLACEHOLDER_RAZORPAY_SECRET" \
  -e RAZORPAY_WEBHOOK_SECRET="PLACEHOLDER_WEBHOOK_SECRET" \
  -e CORS_ORIGIN="https://store.example.com" \
  -e TRUST_PROXY="1" \
  commerceflow-api:latest
```

---

## 8. Health and Readiness Checks

The API exposes three health endpoints:

### 1. Liveness Probe (`GET /api/v1/health/live`)
* **Purpose:** Verifies that the Node.js process is active and responsive to HTTP traffic.
* **Response:** HTTP `200` with `{ "success": true, "data": { "status": "alive" } }`.
* **Usage:** Used by container orchestrators (and the internal Docker `HEALTHCHECK`) to decide whether to restart an unresponsive container.

### 2. Readiness Probe (`GET /api/v1/health/ready`)
* **Purpose:** Verifies whether the application's core dependency (MongoDB) is connected and ready to accept customer requests.
* **Response (Healthy):** HTTP `200` with `{ "success": true, "data": { "status": "ready", "dependencies": { "mongodb": { "status": "connected", "readyState": 1 } } } }`.
* **Response (Unhealthy):** HTTP `503` with `{ "success": false, "data": { "status": "not_ready", "dependencies": { "mongodb": { "status": "disconnected", "readyState": 0 } } } }`.
* **Usage:** Used by load balancers and orchestrators to route incoming traffic only to instances that can process queries.

### 3. General Status (`GET /api/v1/health/` or `GET /api/v1/health`)
* **Purpose:** Lightweight operational ping returning server timestamp and request ID.

### Rate Limiter Exemption
All `/api/v1/health/*` routes are excluded from the global API rate limiter in `src/app.js`. Frequent automated polling from load balancers or orchestrators will not trigger HTTP `429 Too Many Requests`.

---

## 9. Graceful Shutdown

Graceful shutdown handlers are registered in `src/common/process-handlers.js` on `SIGTERM` and `SIGINT`:

1. **Signal Received:** The application logs the incoming signal (`SIGTERM` or `SIGINT`) and marks shutdown as in-progress.
2. **Stop Accepting Traffic:** The HTTP server stops accepting new connections (`server.close()`).
3. **Database Cleanup:** MongoDB is disconnected cleanly (`disconnectMongoDB()`).
4. **Shutdown Timeout:** A bounded timer of 10 seconds (`timeoutMs: 10000`) is armed. If inflight requests or cleanup do not complete within 10 seconds, the process forces an exit with code `1`.
5. **Orchestration Requirement:** Configure the container orchestrator's termination grace period (e.g. Kubernetes `terminationGracePeriodSeconds`) to at least 15-30 seconds to allow the 10-second cleanup cycle to finish gracefully.

---

## 10. Logging and Observability

* **Structured Logging:** Powered by Pino (`pino` and `pino-http`). Logs are emitted in JSON format to `stdout`/`stderr`, suitable for collection by container logging agents.
* **Log Level:** Configurable through `LOG_LEVEL` (defaults to `info`).
* **Request Correlation:** Every incoming request receives a unique UUID in `x-request-id` (generated or propagated via `requestIdMiddleware`), included in all log entries and HTTP responses.
* **Sensitive-Field Redaction:** Pino automatically redacts sensitive attributes, including:
  * `authorization` / `req.headers.authorization`
  * `cookie` / `req.headers.cookie`
  * `password` / `*.password`
  * `token` / `refreshToken`
  * `razorpaySignature` / `req.headers['x-razorpay-signature']`
* **Error Handling:** Centralized error middleware formats operational and unexpected errors into uniform JSON responses while preventing stack traces from leaking to clients in production.

---

## 11. CI Workflow

Continuous integration is automated via GitHub Actions in `.github/workflows/ci.yml`:

* **Triggers:** Automated runs on every `push` to `main` and on all `pull_request` events targeting `main`.
* **Environment:** `ubuntu-latest` running Node.js `22`.
* **Jobs:**
  * **Backend (`backend-ci`):** Clean install (`npm ci`), security audit (`npm audit`), and test execution (`npm test`).
  * **Frontend (`frontend-ci`):** Clean install (`npm ci`), security audit (`npm audit`), test execution (`npm test`), and production bundle build (`npm run build` with dummy production URL validation).

---

## 12. Security Notes

* **No Secrets in Git:** Never commit `.env` or production credentials. Store secrets in your deployment platform or cloud secrets manager.
* **Edge TLS:** Ensure TLS is terminated at the edge proxy or load balancer.
* **Reverse Proxy Trust:** Set `TRUST_PROXY=1` (or your proxy's specific IP/subnet) when behind a reverse proxy so client IP detection and rate limiting function accurately without accepting spoofed `X-Forwarded-For` headers.
* **Non-Root Execution:** The Docker container drops privileges and executes as the unprivileged `USER node`. Do not run the container as root.
* **Production Dependencies:** Build images using `npm ci --omit=dev` to prevent test utilities and devDependencies from packaging into production artifacts.
* **Database Isolation:** Restrict MongoDB network access to authorized application VPCs or IP whitelists.
* **Maintenance:** Regularly rebuild the Docker image to inherit security patches from the upstream `node:alpine` base image.

---

## 13. Deployment Checklist

Before routing production traffic to a new deployment, verify:

- [ ] Production environment variables configured in deployment manager (no placeholder values).
- [ ] `NODE_ENV` is set to `production`.
- [ ] `MONGODB_URI` points to the production database and is reachable.
- [ ] `JWT_SECRET` is strong (minimum 32 characters).
- [ ] `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` are set with live keys.
- [ ] `RAZORPAY_WEBHOOK_SECRET` is configured and matches the webhook secret in the Razorpay dashboard.
- [ ] `CORS_ORIGIN` is configured with exact frontend production URLs (no `*`).
- [ ] `TRUST_PROXY` matches reverse-proxy topology.
- [ ] GitHub Actions CI workflow is green on the deployment commit.
- [ ] Docker container builds cleanly with `npm ci --omit=dev`.
- [ ] Container starts successfully as user `node`.
- [ ] Liveness check (`GET /api/v1/health/live`) responds with HTTP `200`.
- [ ] Readiness check (`GET /api/v1/health/ready`) responds with HTTP `200` and `status: "ready"`.
- [ ] Structured JSON logs are visible in stdout.
- [ ] Orchestrator termination grace period is configured to allow graceful shutdown (>= 15s).
