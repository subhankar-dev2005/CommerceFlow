# CommerceFlow Web Frontend

Production-ready e-commerce client built with React, Vite, and Tailwind CSS.

---

## Environment Configuration

CommerceFlow Web communicates with the CommerceFlow API backend via the centralized `apiClient`. All environment variables prefixed with `VITE_` are embedded directly into the public client-side JavaScript bundle during the build step.

> [!WARNING]
> **Client-Side Security Warning**
> NEVER place backend secrets, JWT secrets, database connection strings, or payment secret keys (e.g., `RAZORPAY_KEY_SECRET`) in frontend environment files. Any `VITE_` variable is completely visible to visitors inspecting the browser bundle.

### 1. Local Development Configuration

For local development, create a `.env` or `.env.local` file in `commerceflow-web/` (or copy from `.env.example`):

```bash
VITE_API_BASE_URL=http://localhost:4000/api/v1
```

- When running `npm run dev`, Vite runs the local development server and proxies/connects to the local API at `http://localhost:4000/api/v1`.

### 2. Staging & Production Build Configuration

In production builds (`npm run build`), `VITE_API_BASE_URL` is baked into the static assets. You must supply a valid public non-localhost API URL before triggering the build.

#### Option A: Command Line / CI Environment (Recommended)

In CI/CD pipelines (e.g. GitHub Actions, Vercel, Netlify):

**Linux / macOS / Bash:**
```bash
VITE_API_BASE_URL=https://api.yourdomain.com/api/v1 npm run build
```

**Windows PowerShell:**
```powershell
$env:VITE_API_BASE_URL="https://api.yourdomain.com/api/v1"; npm run build
```

#### Option B: Production Environment File

Create `.env.production` (see [.env.production.example](file:///d:/e-commerce/commerceflow-web/.env.production.example)):

```bash
VITE_API_BASE_URL=https://api.yourdomain.com/api/v1
```

---

## Production Build Guard

The build configuration in [vite.config.js](file:///d:/e-commerce/commerceflow-web/vite.config.js) enforces strict validation for all production builds (`npm run build`):

1. **Required URL Guard**: Fails the build immediately if `VITE_API_BASE_URL` is omitted or empty.
2. **Loopback / Localhost Guard**: Fails the build immediately if `VITE_API_BASE_URL` points to:
   - `localhost`
   - `127.0.0.1`
   - `0.0.0.0`
   - `::1` or `[::1]`
   - `*.localhost` domains

This prevents shipping production bundles that accidentally attempt to query a client's local loopback interface.

---

## Available Scripts

- `npm run dev`: Start Vite local development server with HMR.
- `npm run build`: Compile and bundle frontend assets with production URL validation.
- `npm run preview`: Locally preview the production build output.
- `npm run lint`: Run ESLint across the codebase.
- `npm test`: Run the Vitest unit and integration test suite.
