# CommerceFlow Frontend — Production Deployment Guide

This guide outlines the production deployment requirements, environment configurations, and single-page application (SPA) routing fallbacks for the CommerceFlow web client (`commerceflow-web`).

---

## 1. Single-Page Application (SPA) Routing & Fallback

CommerceFlow uses client-side routing based on the standard browser HTML5 History API (`window.history.pushState` and `window.history.replaceState`).

### The Deep-Linking Requirement
In development, the Vite development server automatically rewrites non-file URL requests to `index.html`. In a production deployment:
* Direct navigation or browser refresh on deep links (e.g., `/shop`, `/products/:id`, `/checkout`, `/account/orders`, `/admin`) must serve `/index.html`.
* Real static assets (`/assets/*.js`, `/assets/*.css`, images, fonts) must resolve directly to their static file paths.
* Failure to configure an SPA fallback rewrite on the web server will cause direct visits and page reloads to return HTTP 404 Not Found.

---

## 2. Web Server Configuration Examples

> **IMPORTANT**: The following configurations are reference examples and must be adapted to your infrastructure, domain names, SSL certificates, and security headers. CommerceFlow is infrastructure-agnostic and does not mandate a specific hosting provider.

### Nginx Example
For web servers running Nginx, configure `try_files` inside the root location block so that unmatched paths fall back to `index.html`:

```nginx
server {
    listen 80;
    server_name storefront.example.com;

    root /var/www/commerceflow-web/dist;
    index index.html;

    # Single-Page Application fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Static assets caching (Vite generates content-hashed assets)
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # Security headers
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
}
```

### Generic Cloud / Static Storage Hosting Example
When hosting built static assets (`dist/`) on cloud object storage, CDN distributions, or static edge platforms:
1. **Entry Document**: Configure `index.html` as the default index document.
2. **Error / Fallback Document**: Configure `index.html` as the custom error / rewrite fallback response for HTTP 404 responses, returning HTTP 200 with the `index.html` content.
3. **MIME Types**: Ensure modern MIME types are configured (especially `application/javascript` for `.js` and `text/css` for `.css`).

---

## 3. Environment Variables & Security Isolation

### Public vs. Private Variables
Vite bundles environment variables prefixed with `VITE_` into static client-side JavaScript files during the `npm run build` process. Consequently:
* **All `VITE_*` values are public** and visible to any visitor inspecting network requests or bundle code.
* **Build-Time Inlining**: In production builds, `VITE_API_BASE_URL` is baked directly into the generated assets. It must be provided at build time (e.g. via CI/CD environment variables or `.env.production`). The build will fail if this variable is missing or empty in production.
* **NEVER store secrets in the frontend**:
  * `JWT_SECRET` must **never** be placed in frontend files.
  * `MONGODB_URI` must **never** be placed in frontend files.
  * `RAZORPAY_KEY_SECRET` must **never** be placed in frontend files.
  * `RAZORPAY_WEBHOOK_SECRET` must **never** be placed in frontend files.

### Configuration Parameters
| Variable | Environment | Required | Description |
| :--- | :--- | :--- | :--- |
| `VITE_API_BASE_URL` | Production | **Yes** | Full public base URL to the deployed backend API (e.g. `https://example.com/api/v1` or `/api/v1`). **Do not use `localhost` in production.** |
| `VITE_RAZORPAY_KEY_ID` | Production | *Optional* | Fallback Razorpay public key ID. The CommerceFlow backend dynamically supplies the authoritative public `keyId` in payment order responses (`POST /api/v1/payments/orders/:orderId`). |

---

## 4. Production Deployment Topologies & Cookie Compatibility

CommerceFlow authenticates user sessions using secure, server-managed `HttpOnly` cookies (`auth_token`):
* `httpOnly: true` (prevents JavaScript access, mitigating XSS token theft)
* `secure: true` in production (requires TLS/HTTPS encryption)
* `sameSite: "lax"` (mitigates CSRF vulnerabilities)
* `credentials: 'include'` (browser attaches cookie with fetch requests)

### Topology 1: Unified Same-Origin Routing via Reverse Proxy (PREFERRED)

In this architecture, a reverse proxy (or cloud CDN / ingress gateway) serves both the frontend static application and forwards API traffic under a single public domain:

```
https://example.com/
        │
        ├── /*         ──► Static frontend hosting (serves dist/ with SPA fallback)
        └── /api/v1/*  ──► Backend API service (internal port 4000)
```

* **Frontend Origin**: `https://example.com`
* **API Base URL**: `https://example.com/api/v1` (or relative `/api/v1`)
* **Cookie Behavior**: Completely same-origin. The browser sends the `auth_token` cookie on all API requests without cross-site cookie restrictions.
* **CORS**: Not triggered for same-origin paths, but `CORS_ORIGIN=https://example.com` should be configured for strict defense-in-depth.
* **Reverse Proxy Trust**: Backend must configure `TRUST_PROXY=1` so client IPs are accurately detected for rate limiting.

### Topology 2: Shared Apex Domain (SUPPORTED)

In this architecture, the frontend and API reside on separate subdomains of the same registered apex domain:

```
Frontend: https://store.example.com
Backend:  https://api.example.com
```

* **Frontend Origin**: `https://store.example.com`
* **API Base URL**: `https://api.example.com/api/v1`
* **CORS Configuration**: Backend must set `CORS_ORIGIN=https://store.example.com` and `credentials: true`.
* **Cookie Configuration**: Requires secure HTTPS on both endpoints. Note that cross-site subresource requests in some browser privacy modes may treat subdomains with elevated restrictions. For optimal compatibility across all mobile and desktop browsers, Topology 1 is strongly recommended.

### Topology 3: Arbitrary Cross-Site Domains (UNSUPPORTED)

```
Frontend: https://storefront-client.com
Backend:  https://api-backend-service.net
```

* **STATUS: STRICTLY UNSUPPORTED**
* Modern browser security models block `SameSite=Lax` cookies on cross-site `fetch` subresource requests.
* CommerceFlow **refuses** to downgrade security to `SameSite=None` as a shortcut, as doing so exposes authenticated sessions to cross-site request forgery and third-party cookie blocking.

---

## 5. Reverse Proxy & Network Contract

When deploying the backend behind a reverse proxy (e.g., Nginx, AWS ALB, Cloudflare, Kubernetes Ingress):
1. **HTTPS Enforcement**: Reverse proxy must terminate TLS and forward requests to the Node backend over internal HTTP.
2. **Proxy Trust (`TRUST_PROXY`)**:
   * Direct-to-Node deployment: `TRUST_PROXY=false`
   * Single reverse proxy: `TRUST_PROXY=1`
   * Multiple proxy hops: Set exact integer hop count or trusted CIDR subnet.
   * *Never blindly set `TRUST_PROXY=true` in production*, as untrusted clients could spoof `X-Forwarded-For` and bypass IP-based rate limiters.
3. **Header Forwarding**: Proxy must forward:
   * `Host: $host`
   * `X-Real-IP: $remote_addr`
   * `X-Forwarded-For: $proxy_add_x_forwarded_for`
   * `X-Forwarded-Proto: https`

---

## 6. Production Build & Validation Workflow

Before deploying assets to any production hosting environment:

1. **Lint Inspection**:
   ```bash
   npm run lint
   ```
2. **Production Compilation with API Base URL**:
   ```bash
   VITE_API_BASE_URL="https://example.com/api/v1" npm run build
   ```
   Compiles optimized, minified, and code-split production assets into the `dist/` directory. Fails fast if `VITE_API_BASE_URL` is omitted.

3. **Local Production Preview**:
   ```bash
   npm run preview
   ```
   Serves the generated `dist/` folder locally to verify routes, lazy loading, and asset resolution prior to release.
