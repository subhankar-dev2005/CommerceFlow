# CommerceFlow — UI/UX Design System Documentation

---

## 1. Document Information

* **Product Name:** CommerceFlow
* **Document Purpose:** Authoritative UI/UX design system specification and component inventory for developers, designers, and QA engineers.
* **Scope:** Covers the client-side single-page application (`commerceflow-web`), including the customer-facing storefront, authentication flows, checkout pipeline, and the administrative operations control panel.
* **Review Date:** October 14, 2026
* **Evidence Base:** Grounded in static source code inspection of the `feature/admin-expansion-staging-prep` branch. Component states, tokens, and layouts are cited from repository source files.
* **Evidence Limitations:**
  * Browser rendering behavior and visual fidelity are inferred directly from JSX structures, CSS class declarations, and automated UI test suites (`commerceflow-web/scripts/run-tests.js`).
  * Dark mode theme variables exist in administrative headers but are not fully implemented across all views; the light theme is the authoritative baseline.
  * Preview-only administrative screens (e.g., Wallets, Expenses, Campaigns, Achievements) are documented as prototypes utilizing client-side storage rather than production server-backed modules.

---

## 2. Design Overview

### 2.1 Visual Direction & Brand Identity
CommerceFlow implements an **Outdoor Premium Retail** aesthetic. The visual tone balances rugged durability with clean e-commerce utility:
* **Primary Color Tone:** Deep forest green (`#123C32`, `#17483B`, `#0E332B`) evoking wilderness and stability.
* **Accent Highlight:** Warm outdoor orange (`#F97316`, `#FF7A1A`) directing attention to primary calls-to-action, promotions, and status highlights.
* **Base Surface:** Warm off-white / canvas cream (`#F7F6F1`, `#F2F1EC`) softening contrast compared to stark white.
* **Typography:** Modern, clean sans-serif stack led by `Inter`, prioritizing legibility in pricing and tabular data.

### 2.2 Interface Segmentation
CommerceFlow segregates user interfaces into four distinct operational environments:

```
┌────────────────────────────────────────────────────────────────────────┐
│                          COMMERCEFLOW INTERFACES                       │
├──────────────────────────┬─────────────────────────────────────────────┤
│ 1. Customer Storefront   │ Discovery-driven, product imagery focus,    │
│    (/, /shop, /products) │ marketing banners, trust indicators, cart.  │
├──────────────────────────┼─────────────────────────────────────────────┤
│ 2. Customer Auth & Self- │ Form-centric, distraction-free, validation- │
│    Service (/account)    │ heavy, order tracking & return requests.    │
├──────────────────────────┼─────────────────────────────────────────────┤
│ 3. Checkout Pipeline     │ Linear 2-step stepper, address selection,   │
│    (/checkout)           │ Razorpay gateway modal, stock safeguards.   │
├──────────────────────────┼─────────────────────────────────────────────┤
│ 4. Admin Control Panel   │ Data-dense SaaS layout, collapsible sidebar,│
│    (/admin/*)            │ quick search ('/'), audit logs, data tables.│
└──────────────────────────┴─────────────────────────────────────────────┘
```

### 2.3 Observed Design Principles
* **State Completeness:** Every asynchronous view explicitly handles four states: Initial Skeleton Loading, Empty Data, Error / Network Fault, and Active Content.
* **Predictable Hierarchy:** Elevated cards (`rounded-2xl`, `border`, `shadow-2xs`), clear section headers, and prominent badges.
* **Server-Authoritative Pricing Display:** Price displays format currency consistently via `formatPrice()` using the Indian Rupee symbol (`₹`) without client-side recalculation.

---

## 3. Technology and Styling Architecture

### 3.1 Styling Stack
* **CSS Framework:** Tailwind CSS `4.3.3`
* **Vite Integration:** `@tailwindcss/vite` plugin registered in [`vite.config.js`](./commerceflow-web/vite.config.js#L57)
* **Configuration Approach:** Tailwind CSS v4 CSS-first configuration via `@import "tailwindcss";` and `@theme` blocks in [`commerceflow-web/src/styles/index.css`](./commerceflow-web/src/styles/index.css). No standalone `tailwind.config.js` file is used.
* **Utility Combiner:** Shared `cn(...classes)` utility function in [`src/lib/utils.js`](./commerceflow-web/src/lib/utils.js#L10-L12) to merge class names conditionally.

### 3.2 Design Token Organization
Tokens are centralized in [`src/styles/index.css`](./commerceflow-web/src/styles/index.css#L8-L70):
1. **Master Brand Scale (`--color-brand-50` to `--color-brand-950`):** Defines the forest green continuum.
2. **Master Accent Scale (`--color-accent-50` to `--color-accent-900`):** Defines the warm orange action scale.
3. **Master Surfaces (`--color-surface-bg`, `--color-surface-card`, `--color-surface-green`, `--color-surface-muted`):** Background and elevation surfaces.
4. **Master Text (`--color-text-primary`, `--color-text-secondary`, `--color-text-muted`):** Content contrast tiers.
5. **Master Borders (`--color-border-subtle`, `--color-border-strong`):** Separation lines.
6. **Admin Tokens (`--color-admin-sidebar-bg`, `--color-admin-border`, `--color-admin-primary`):** Scoped control panel palette.

### 3.3 Implementation Observation on Token Usage
* **Dual Conventions:** In the codebase, token utility classes (e.g. `bg-brand-800`, `text-brand-700`) coexist alongside raw arbitrary hex values (e.g. `bg-[#123C32]`, `border-[#E4E8E5]`, `bg-[#F0FAF7]`). Both resolve to identical hex values.

---

## 4. Color System

### 4.1 Verified Color Palette

| Token / Value | Hex / Format | Intended Role | Source File & Evidence |
| :--- | :--- | :--- | :--- |
| `--color-brand-800` | `#123C32` | Primary brand color, primary buttons, admin header badges | [`index.css:18`](./commerceflow-web/src/styles/index.css#L18), [`Button.jsx:23`](./commerceflow-web/src/components/Button.jsx#L23) |
| `--color-brand-700` | `#17483B` | Brand hover state, focus outline ring | [`index.css:17`](./commerceflow-web/src/styles/index.css#L17), [`index.css:109`](./commerceflow-web/src/styles/index.css#L109) |
| `--color-brand-900` | `#0E332B` | Deep brand dark, footer background, primary button hover | [`index.css:19`](./commerceflow-web/src/styles/index.css#L19), [`Footer.jsx:25`](./commerceflow-web/src/components/Footer.jsx#L25) |
| `--color-brand-50` | `#EEF5F1` | Brand tint, icon badge backgrounds, soft button variant | [`index.css:10`](./commerceflow-web/src/styles/index.css#L10), [`Badge.jsx:17`](./commerceflow-web/src/components/Badge.jsx#L17) |
| `--color-brand-100` | `#D5E8DD` | Subtle brand border, footer text secondary | [`index.css:11`](./commerceflow-web/src/styles/index.css#L11), [`Footer.jsx:25`](./commerceflow-web/src/components/Footer.jsx#L25) |
| `--color-brand-200` | `#AED1BC` | Product card border hover state | [`index.css:12`](./commerceflow-web/src/styles/index.css#L12), [`ProductCard.jsx:72`](./commerceflow-web/src/components/ProductCard.jsx#L72) |
| `--color-accent-500` | `#F97316` | Primary action accent, sale tags, warning highlights | [`index.css:28`](./commerceflow-web/src/styles/index.css#L28), [`Button.jsx:25`](./commerceflow-web/src/components/Button.jsx#L25) |
| `--color-accent-400` | `#FF7A1A` | Accent focus ring, vibrant button highlight | [`index.css:27`](./commerceflow-web/src/styles/index.css#L27) |
| `--color-surface-bg` | `#F7F6F1` | Master page body background (warm canvas) | [`index.css:35`](./commerceflow-web/src/styles/index.css#L35), [`index.css:95`](./commerceflow-web/src/styles/index.css#L95) |
| `--color-surface-card` | `#FFFFFF` | Card surfaces, modals, popovers, dropdowns | [`index.css:36`](./commerceflow-web/src/styles/index.css#L36) |
| `--color-text-primary`| `#17201D` | Headings, titles, primary labels, price text | [`index.css:41`](./commerceflow-web/src/styles/index.css#L41), [`index.css:96`](./commerceflow-web/src/styles/index.css#L96) |
| `--color-text-secondary`| `#3D4D46`| Subtitles, supporting copy, navigation items | [`index.css:42`](./commerceflow-web/src/styles/index.css#L42) |
| `--color-text-muted` | `#66736D` | Captions, breadcrumb separators, timestamp labels | [`index.css:43`](./commerceflow-web/src/styles/index.css#L43) |
| `--color-border-subtle`| `#E5E9E6`| Default card and table container borders | [`index.css:46`](./commerceflow-web/src/styles/index.css#L46), [`ProductCard.jsx:72`](./commerceflow-web/src/components/ProductCard.jsx#L72) |
| `--color-border-strong`| `#CDD5CF`| Active input borders, card hover borders | [`index.css:47`](./commerceflow-web/src/styles/index.css#L47) |
| `--color-success-bg` | `#F0FDF4` | Success alerts, delivered order badge background | [`index.css:50`](./commerceflow-web/src/styles/index.css#L50), [`Badge.jsx:19`](./commerceflow-web/src/components/Badge.jsx#L19) |
| `--color-success-text`| `#15803D` | Success text, verified purchase badge icon | [`index.css:51`](./commerceflow-web/src/styles/index.css#L51) |
| `--color-warning-bg` | `#FFFBEB` | Low stock alert background, pending return status | [`index.css:52`](./commerceflow-web/src/styles/index.css#L52), [`Badge.jsx:20`](./commerceflow-web/src/components/Badge.jsx#L20) |
| `--color-warning-text`| `#B45309` | Warning text, low stock notice | [`index.css:53`](./commerceflow-web/src/styles/index.css#L53) |
| `--color-error-bg` | `#FEF2F2` | Out-of-stock badge background, error alert box | [`index.css:54`](./commerceflow-web/src/styles/index.css#L54), [`Badge.jsx:21`](./commerceflow-web/src/components/Badge.jsx#L21) |
| `--color-error-text` | `#B91C1C` | Form validation errors, destructive action text | [`index.css:55`](./commerceflow-web/src/styles/index.css#L55) |
| `--admin-sidebar-bg` | `#F0FAF7` | Admin sidebar background | [`index.css:58`](./commerceflow-web/src/styles/index.css#L58), [`AdminSidebar.jsx`](./commerceflow-web/src/layouts/admin/AdminSidebar.jsx) |
| `--admin-border` | `#D8ECE7` | Admin cards and table divider borders | [`index.css:65`](./commerceflow-web/src/styles/index.css#L65) |
| `--admin-primary` | `#063B32` | Admin action buttons, section headings | [`index.css:66`](./commerceflow-web/src/styles/index.css#L66) |

---

## 5. Typography

### 5.1 Font Family & Loading
* **Primary Family:** `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
* **Declaration:** Set on `body` in [`src/styles/index.css:97`](./commerceflow-web/src/styles/index.css#L97).
* **Rendering Optimizations:** `-webkit-font-smoothing: antialiased`, `-moz-osx-font-smoothing: grayscale`, `text-rendering: optimizeLegibility`.

### 5.2 Typography Scale & Hierarchy

| Typographic Level | Font Size | Line Height | Font Weight | Typical Usage |
| :--- | :--- | :--- | :--- | :--- |
| **Display / Hero** | `text-4xl` to `text-5xl` (36–48px) | `leading-tight` (1.1–1.2) | `font-black` (900) | Homepage hero slides, marketing headlines |
| **Page Title (H1)** | `text-2xl` to `text-3xl` (24–30px) | `leading-tight` | `font-bold` (700) | Storefront page titles, admin page headers |
| **Section Title (H2)** | `text-xl` to `text-2xl` (20–24px) | `leading-snug` | `font-bold` (700) | Storefront collection headings, card titles |
| **Subsection (H3)** | `text-base` to `text-lg` (16–18px) | `leading-normal` | `font-semibold` (600) | Form section headers, drawer titles |
| **Body Primary** | `text-sm` to `text-base` (14–16px) | `leading-relaxed` (1.6) | `font-normal` (400) | Product descriptions, articles, reviews |
| **Body Secondary** | `text-xs` to `text-sm` (12–14px) | `leading-normal` | `font-normal` (400) | Helper text, secondary specifications, table rows |
| **Micro / Metadata**| `text-[10px]` to `text-[11px]` | `leading-none` | `font-semibold` / `font-bold` | Status badges, timestamps, table column headers |
| **Numeric Currency** | `text-sm` to `text-xl` | `leading-none` | `font-bold` / `font-black` | Currency amounts via `formatPrice()` (`₹`) |

---

## 6. Spacing, Layout, and Responsive Behavior

### 6.1 Layout Containers & Max Widths
* **Storefront Container:** Standardized via [`src/components/Container.jsx`](./commerceflow-web/src/components/Container.jsx):
  ```jsx
  className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8"
  ```
* **Admin Layout Container:** [`AdminLayout.jsx`](./commerceflow-web/src/layouts/AdminLayout.jsx) provides a 2-column flex shell:
  * **Sidebar:** Fixed width `w-64` (256px) on desktop (`lg:block`), off-canvas drawer on mobile (`z-50`).
  * **Main Content Area:** Flexible width `flex-1 min-w-0 max-w-7xl mx-auto p-4 sm:p-6 lg:p-8`.

### 6.2 Responsive Breakpoints
Configured via standard Tailwind CSS v4 screen defaults:
* `sm`: `640px` (Mobile landscape / phablet adjustments)
* `md`: `768px` (Tablet layouts, 2-column grids)
* `lg`: `1024px` (Desktop layouts, admin sidebar expansion, 3-to-4 column product grids)
* `xl`: `1280px` (Wide desktop storefront container)

### 6.3 Grid Patterns
* **Product Catalog Grid ([`ShopPage.jsx`](./commerceflow-web/src/pages/ShopPage.jsx)):**
  `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6`
* **Admin Dashboard Metrics ([`AdminDashboardPage.jsx`](./commerceflow-web/src/pages/admin/AdminDashboardPage.jsx)):**
  `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6`
* **Admin Inventory / Catalog Tables:**
  Wrapped in `overflow-x-auto` to prevent horizontal clipping on narrow screens.

---

## 7. Component Design Inventory

| Component Name | Source Path | Variants / States | Intended Purpose | Implementation Status |
| :--- | :--- | :--- | :--- | :--- |
| **Button** | [`src/components/Button.jsx`](./commerceflow-web/src/components/Button.jsx) | `primary`, `accent`, `secondary`, `outline`, `ghost`, `soft`<br>Sizes: `sm`, `md`, `lg`, `xl`<br>States: default, hover, active (`scale-[0.98]`), focus-visible, disabled, loading spinner | Core interactive button across all views | **Implemented** |
| **Badge** | [`src/components/Badge.jsx`](./commerceflow-web/src/components/Badge.jsx) | `neutral`, `brand`, `accent`, `success`, `warning`, `danger`<br>Sizes: `sm`, `md` | Status flags, categories, stock indicators | **Implemented** |
| **ProductCard** | [`src/components/ProductCard.jsx`](./commerceflow-web/src/components/ProductCard.jsx) | Stock status badges, wishlist toggle button, inline Add-to-Cart with success animation, image fallback placeholder | Storefront product catalog card | **Implemented** |
| **Skeleton** | [`src/components/Skeleton.jsx`](./commerceflow-web/src/components/Skeleton.jsx) | Pulse animation (`animate-pulse bg-slate-200/80 rounded-xl`) | Placeholder loading surfaces across pages | **Implemented** |
| **SearchInput** | [`src/components/SearchInput.jsx`](./commerceflow-web/src/components/SearchInput.jsx) | Debounced input, loading indicator, clear button, suggestions dropdown, keyboard navigation | Header and catalog search bar | **Implemented** |
| **StorefrontHero** | [`src/components/StorefrontHero.jsx`](./commerceflow-web/src/components/StorefrontHero.jsx) | Carousel with slide transitions, autoplay, manual dot navigation, API-backed with fallback slides | Homepage hero carousel | **Implemented** |
| **TrustStrip** | [`src/components/TrustStrip.jsx`](./commerceflow-web/src/components/TrustStrip.jsx) | 4-pillar trust icons: Free Shipping, Secure Payment, Easy Returns, Support | Storefront value proposition banner | **Implemented** |
| **Breadcrumbs** | [`src/components/Breadcrumbs.jsx`](./commerceflow-web/src/components/Breadcrumbs.jsx) | Slash-separated navigation trail with home icon | Catalog and product detail navigation trail | **Implemented** |
| **EmptyState** | [`src/components/EmptyState.jsx`](./commerceflow-web/src/components/EmptyState.jsx) | Icon, title, description, optional action CTA | Storefront empty carts, empty search results | **Implemented** |
| **ErrorState** | [`src/components/ErrorState.jsx`](./commerceflow-web/src/components/ErrorState.jsx) | Warning icon, error title, retry button trigger | Network and API failure handling | **Implemented** |
| **AdminHeader** | [`src/layouts/admin/AdminHeader.jsx`](./commerceflow-web/src/layouts/admin/AdminHeader.jsx) | Global search with `'/'` shortcut, notification popover, profile menu popover, theme toggle | Administrative top navigation bar | **Implemented** |
| **AdminSidebar** | [`src/layouts/admin/AdminSidebar.jsx`](./commerceflow-web/src/layouts/admin/AdminSidebar.jsx) | 8 grouped navigation categories, active indicators, mobile slide-over drawer | Administrative navigation sidebar | **Implemented** |
| **AdminShellStates**| [`src/layouts/admin/AdminShellStates.jsx`](./commerceflow-web/src/layouts/admin/AdminShellStates.jsx) | `AdminLoadingState` (spinner), `AdminErrorState` (rose alert + retry), `AdminEmptyState` (clean CTA) | Standardized state views across admin screens | **Implemented** |
| **VariantManager** | [`src/components/admin/VariantManager.jsx`](./commerceflow-web/src/components/admin/VariantManager.jsx) | Variant attribute matrix, SKU generator, price overrides, stock counters, dynamic attributes modal | Admin product edit & creation screen | **Implemented** |

---

## 8. Storefront Design

### 8.1 Header & Navigation ([`Header.jsx`](./commerceflow-web/src/components/Header.jsx))
* **Top Banner:** High-contrast promotional announcement bar (`#0E332B`) with free shipping message.
* **Main Header:** Sticky header containing:
  * **Brand Mark:** Forest green mountain icon badge (`#123C32`) with "CommerceFlow" wordmark and tagline "Gear Up for Better Days".
  * **Search Input:** Centered input with clear button and keyboard navigation.
  * **Action Controls:** Customer Account link, Wishlist icon with count badge, and Shopping Cart icon with badge.
* **Category Quick Navigation:** Horizontal navigation bar linking to top product categories (Camping, Hiking, Apparel, Footwear, Brands).
* **Mobile Navigation:** Hamburger trigger opens a full-height off-canvas slide-over drawer with category links and account actions.

### 8.2 Product Catalog ([`ShopPage.jsx`](./commerceflow-web/src/pages/ShopPage.jsx))
* **Filter Sidebar:** Multi-facet filtering supporting Category selection, Stock status (`In Stock Only`), Price Range min/max inputs, and Sorting selector (`Price: Low to High`, `Newest Arrivals`, `Rating`).
* **Active Filter Chips:** Removable chips allowing customers to clear individual filters or reset all.
* **Product Card Presentation:**
  * Aspect ratio `4:3` product image container with smooth hover zoom (`card-hover`).
  * Stock badge overlays: `Out of Stock` (rose), `Low Stock` (amber).
  * Wishlist heart toggle button positioned at top-right of image.
  * Title clamped to 2 lines (`line-clamp-2`).
  * Price formatted via `formatPrice()` with bold font weight.
  * Inline Add to Cart button transitioning into a green checkmark confirmation for 2 seconds.

### 8.3 Product Detail Page ([`ProductPage.jsx`](./commerceflow-web/src/pages/ProductPage.jsx))
* **Media Gallery:** Large active image preview with thumbnail scroller supporting multiple product and variant images. Image error handling displays clean fallback icon.
* **Variant Selector:** Interactive attribute pill buttons (e.g. Size, Color). Updates selected price and SKU in real time.
* **Stock & Fulfillment Callout:** Displays real-time stock count, delivery estimate, and trust indicators.
* **Tabbed Information:** Tab bar switching between Description, Technical Specifications, and Customer Reviews.
* **Customer Reviews Section:**
  * Rating summary breakdown (average rating out of 5, star bars).
  * Verified purchase review list.
  * Interactive review submission modal (visible for eligible verified purchasers).

### 8.4 Checkout Experience ([`CheckoutPage.jsx`](./commerceflow-web/src/pages/CheckoutPage.jsx))
* **Linear Stepper Structure:**
  1. **Shipping Address Selection:** Grid of saved address cards with radio selector and "Add New Address" modal form.
  2. **Order Summary & Financials:** Server-authoritative subtotal, tax, shipping, and coupon discount breakdown.
  3. **Payment Execution:** Button triggering the Razorpay modal checkout workflow.
* **Stock Conflict Safety:** Cart pre-check verifies stock before order placement. If a stock conflict occurs, a clear warning banner prompts the user to adjust quantities.

---

## 9. Admin Dashboard Design

### 9.1 Control Panel Navigation ([`adminNavConfig.js`](./commerceflow-web/src/layouts/admin/adminNavConfig.js))
The control panel organizes 8 navigation categories:
1. **DASHBOARD:** Overview metrics and operational summaries.
2. **CATALOG & INVENTORY:** Products, Product Catalog, Categories, Brands, Product Variants, Inventory, Stock Movements.
3. **SALES & CUSTOMERS:** Orders, Customers, Returns & Refunds, Reviews.
4. **MARKETING:** Coupons, Banners, Campaigns, Promotions.
5. **WALLET & FINANCE:** Customer Wallets, Wallet Transactions, Payments, Expenses, Financial Reports.
6. **PEOPLE & ACHIEVEMENTS:** Employees, Roles & Permissions, Staff Performance, Achievements.
7. **REPORTS & ANALYTICS:** Sales Reports, Product Performance, Inventory Reports, Coupon Reports, Tax Reports.
8. **SYSTEM & SECURITY:** Audit Logs, Notifications, Store Settings, Security Settings, Maintenance Settings.

### 9.2 Dashboard Views & Metrics ([`AdminDashboardPage.jsx`](./commerceflow-web/src/pages/admin/AdminDashboardPage.jsx))
* **Metric Cards:** 4 top-level KPI cards displaying Total Revenue, Orders Count, Active Products, and Low Stock Alerts, with trend indicators.
* **Visual Charts:** Native SVG sales trend chart displaying daily revenue bars and order trajectories.
* **Recent Orders Table:** Compact table with customer avatars, payment status badges, order totals, and direct inspection links.
* **Quick Actions Panel:** Rapid navigation links to Add Product, Process Returns, Adjust Stock, and Create Coupons.

### 9.3 Prototype vs Production Transparency in Admin Views
* **Production-Backed Screens:** Products, Inventory, Orders, Returns, Refunds, Reviews, Coupons, Banners, Customers, Audit Logs, Settings.
* **LocalStorage Prototype Screens:**
  * **Customer Wallets (`/admin/wallets`):** Operates on `commerceflow_admin_wallets_v1` in browser `localStorage`.
  * **Business Expenses (`/admin/finance/expenses`):** Operates on `commerceflow_admin_expenses_v1` in `localStorage`.
  * **Campaigns (`/admin/campaigns`):** Operates on `commerceflow_admin_campaigns_v1` in `localStorage`.
* **In-Memory Static Screens:**
  * **Achievements (`/admin/achievements`):** Renders static catalog `SYSTEM_ACHIEVEMENTS`.
  * **Vendors Directory (`/admin/vendors`):** Architecture governance document explaining single-merchant boundaries.

---

## 10. Interaction and Motion

### 10.1 Interactive States
* **Hover Transitions:** Interactive cards utilize `.card-hover` ([`index.css:131-136`](./commerceflow-web/src/styles/index.css#L131-L136)) with `transition: transform 150ms ease, box-shadow 150ms ease`, applying `transform: translateY(-2px)` on hover.
* **Active Press Feedback:** Buttons include `active:scale-[0.98]` providing physical press feedback.
* **Focus Rings:** Form inputs and interactive controls apply `focus-visible:ring-2 focus-visible:ring-[#123C32] focus-visible:ring-offset-2`.
* **Disabled States:** Inactive buttons apply `disabled:opacity-50 disabled:pointer-events-none`.

### 10.2 Modals and Dialogs
* Modals (e.g. Address Form, Stock Adjustment, Review Form, Return Inspection) render with backdrop overlays (`bg-slate-900/50 backdrop-blur-xs`), keyboard Escape handlers, and focus trapping.

---

## 11. Iconography and Imagery

### 11.1 Iconography Implementation
* **No External Icon Package:** The frontend does **not** import Lucide, Heroicons, or FontAwesome packages.
* **Native Inline SVGs:** All icons are implemented as optimized inline SVG elements with `fill="none"`, `viewBox="0 0 24 24"`, and `stroke="currentColor"` with line weight `stroke-[1.8]` or `stroke-[2]`.
* **Sizing Conventions:** Micro icons use `w-3.5 h-3.5` or `w-4 h-4`; navigation icons use `w-5 h-5`; empty state illustrations use `w-12 h-12` or `w-14 h-14`.

### 11.2 Imagery and Aspect Ratios
* **Product Catalog Cards:** Container aspect ratio `4:3` with `object-cover`.
* **Storefront Hero Carousel:** Full-width container `min-h-[440px] sm:min-h-[520px] lg:min-h-[600px]` with gradient overlay (`.hero-overlay`).
* **Fallback Behavior:** Failed image loads trigger `onError` handlers, displaying a neutral mountain/package placeholder SVG.

---

## 12. Forms and Data Presentation

### 12.1 Form Design Standards
* **Input Styling:** Rounded borders (`rounded-xl`), neutral border (`border-[#E5E9E6]`), dark text (`text-slate-900`), and subtle placeholder (`placeholder:text-slate-400`).
* **Validation Feedback:** Field validation errors render directly beneath the input in small red text (`text-xs text-rose-600 font-medium`).
* **Required Indicators:** Required form labels include a subtle red asterisk (`<span className="text-rose-500">*</span>`).

### 12.2 Data Tables & Numerical Formatting
* **Currency Formatting:** Handled centrally by [`formatPrice()`](./commerceflow-web/src/lib/utils.js#L21-L33) using `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })`.
* **Date Formatting:** Dates are formatted with locale conventions (`toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })`).
* **Table Responsiveness:** Wide administrative data tables are wrapped in `overflow-x-auto` with sticky action columns where appropriate.

---

## 13. Accessibility Evaluation

| Accessibility Domain | Status | Evidence in Codebase |
| :--- | :---: | :--- |
| **Semantic HTML** | **Verified** | Uses native `<header>`, `<nav>`, `<main>`, `<aside>`, `<footer>`, `<article>`, `<button>`, `<table>`, `<th>`, `<td>`. |
| **Accessible Names & Labels** | **Verified** | Icon-only buttons include descriptive `aria-label` (e.g. cart button has `aria-label="Shopping cart — X items"`). |
| **Focus Visibility** | **Verified** | Global focus rule declared on `a:focus-visible`, `button:focus-visible`, `input:focus-visible` in [`index.css:104-111`](./commerceflow-web/src/styles/index.css#L104-L111) with 2px solid `#17483B`. |
| **Screen Reader Feedback** | **Verified** | Skeletons declare `role="status"` and `aria-live="polite"`. Error boxes declare `role="alert"`. |
| **Color Contrast** | **Partially Verified** | High-contrast pairings verified (`#17201D` text on `#FFFFFF` / `#F7F6F1` background; `#123C32` on white). Secondary muted text (`#66736D`) requires formal WCAG AA contrast ratio testing on mobile viewports. |
| **Keyboard Navigation** | **Partially Verified** | Global `'/'` shortcut focuses admin search; dropdown menus close on OutsideClick; modal dialogs require formal focus-trap verification. |
| **Reduced Motion** | **Not Verified** | No `@media (prefers-reduced-motion)` media queries are currently declared in `index.css`. Animations are limited to short transitions (150ms) and pulse skeletons. |

---

## 14. UX Consistency Audit

### 14.1 Findings and Observations

#### Finding 1: Coexistence of Design Tokens and Hardcoded Hex Colors
* **Severity:** LOW (Maintainability)
* **Affected Files:** Throughout storefront and admin JSX components (e.g., [`Header.jsx`](./commerceflow-web/src/components/Header.jsx), [`AdminSidebar.jsx`](./commerceflow-web/src/layouts/admin/AdminSidebar.jsx)).
* **Observation:** While `@theme` in `index.css` defines token classes like `bg-brand-800` and `border-brand-200`, many components use direct arbitrary values like `bg-[#123C32]` and `border-[#E4E8E5]`. Both resolve to the same color values.
* **Recommendation:** Gradually refactor arbitrary hex values to use the declared `@theme` tokens for easier global theming.

#### Finding 2: Unwired Theme State in Admin Header
* **Severity:** LOW (Visual Consistency)
* **Affected Files:** [`AdminHeader.jsx:17-26`](./commerceflow-web/src/layouts/admin/AdminHeader.jsx#L17-L26).
* **Observation:** The admin header manages a `theme` state (`light` vs `dark`) persisted in `localStorage.cf_theme`, but comprehensive dark mode CSS classes are not implemented across admin page tables and cards.
* **Recommendation:** Ensure the UI consistently indicates that the light theme is the active, supported appearance until dark mode tokens are fully rolled out.

#### Finding 3: Visual Distinction Between Prototype and Live Screens
* **Severity:** MEDIUM (User Expectation)
* **Affected Files:** [`AdminFinancePage.jsx`](./commerceflow-web/src/pages/admin/AdminFinancePage.jsx), [`AdminCampaignsPage.jsx`](./commerceflow-web/src/pages/admin/AdminCampaignsPage.jsx).
* **Observation:** Pages utilizing browser `localStorage` prototypes have polished UI identical to server-backed screens, which could lead operators to assume data is persisted globally to the database.
* **Recommendation:** Display an informational badge or banner on prototype pages clarifying that data is stored locally in the browser.

---

## 15. Design Implementation Guidelines

For developers adding new features or UI components to CommerceFlow:
1. **Reuse Core Primitives:** Use [`Button.jsx`](./commerceflow-web/src/components/Button.jsx) and [`Badge.jsx`](./commerceflow-web/src/components/Badge.jsx) rather than creating ad-hoc buttons or badges.
2. **Handle All 4 State Surfaces:** Always implement Skeleton Loading, Empty State, Error State, and Data presentation.
3. **Format Currency Consistently:** Never concatenate the rupee symbol manually. Use `formatPrice(amount)` from `src/lib/utils.js`.
4. **Follow Spacing Scale:** Use standard Tailwind padding (`p-4 sm:p-6 lg:p-8`) and card borders (`rounded-2xl border border-[#E5E9E6] shadow-2xs`).
5. **Preserve Accessible Focus Rings:** Never remove `focus:outline-none` without providing `focus-visible:ring-2`.
6. **Maintain Icon Conventions:** Use inline SVGs matching `stroke-[1.8]` and `stroke="currentColor"`. Do not install external icon libraries.

---

## 16. Recommended Improvements

### Priority 0: Usability & Safety
* [ ] **Add Prototype Disclosure Notice:** Add a clear notice to `AdminFinancePage` (Wallets/Expenses) and `AdminCampaignsPage` indicating that data is stored in local browser storage.

### Priority 1: Consistency & Accessibility
* [ ] **Declare `prefers-reduced-motion` Utilities:** Add CSS media query in `index.css` disabling pulse animations and card transforms when reduced motion is preferred by the user.
* [ ] **Centralize Hardcoded Colors:** Migrate arbitrary hex references (`#123C32`, `#0E332B`, `#E5E9E6`) to standard theme tokens (`brand-800`, `brand-900`, `border-subtle`).

### Priority 2: Polish & Visual Enhancement
* [ ] **Formal WCAG AA Contrast Validation:** Audit secondary text shades (`#66736D`) against muted canvas backgrounds (`#F7F6F1`) on small mobile displays.
* [ ] **Unified Modal Focus Trap Primitive:** Create a reusable modal wrapper enforcing programmatic focus trap and keyboard focus restoration.

---

## 17. Source References

### Styling & Configuration
* [`commerceflow-web/src/styles/index.css`](./commerceflow-web/src/styles/index.css) — Design tokens, `@theme`, base focus rules, custom utilities.
* [`commerceflow-web/vite.config.js`](./commerceflow-web/vite.config.js) — Tailwind CSS v4 Vite integration and environment validation.
* [`commerceflow-web/src/lib/utils.js`](./commerceflow-web/src/lib/utils.js) — `cn()` class combiner, `formatPrice()`, `normalizeOrderFinancials()`, `navigate()`.

### Shared Components
* [`src/components/Button.jsx`](./commerceflow-web/src/components/Button.jsx) — Primary, accent, outline, soft, ghost button variants.
* [`src/components/Badge.jsx`](./commerceflow-web/src/components/Badge.jsx) — Status indicator badge component.
* [`src/components/Skeleton.jsx`](./commerceflow-web/src/components/Skeleton.jsx) — Pulse loading placeholder.
* [`src/components/SearchInput.jsx`](./commerceflow-web/src/components/SearchInput.jsx) — Debounced search input.
* [`src/components/ProductCard.jsx`](./commerceflow-web/src/components/ProductCard.jsx) — Catalog product display card.
* [`src/components/EmptyState.jsx`](./commerceflow-web/src/components/EmptyState.jsx) — Storefront empty state surface.
* [`src/components/ErrorState.jsx`](./commerceflow-web/src/components/ErrorState.jsx) — Storefront error state surface.

### Storefront Layout & Pages
* [`src/components/Header.jsx`](./commerceflow-web/src/components/Header.jsx) — Storefront sticky navigation header and mobile drawer.
* [`src/components/Footer.jsx`](./commerceflow-web/src/components/Footer.jsx) — Storefront 5-column brand footer.
* [`src/components/StorefrontHero.jsx`](./commerceflow-web/src/components/StorefrontHero.jsx) — Hero promotional carousel with fallback slides.
* [`src/pages/ShopPage.jsx`](./commerceflow-web/src/pages/ShopPage.jsx) — Product catalog with filter sidebar.
* [`src/pages/ProductPage.jsx`](./commerceflow-web/src/pages/ProductPage.jsx) — Product detail page with gallery and variant selectors.
* [`src/pages/CheckoutPage.jsx`](./commerceflow-web/src/pages/CheckoutPage.jsx) — 2-step checkout flow.

### Admin Shell & Console
* [`src/layouts/AdminLayout.jsx`](./commerceflow-web/src/layouts/AdminLayout.jsx) — 2-column administrative shell.
* [`src/layouts/admin/AdminHeader.jsx`](./commerceflow-web/src/layouts/admin/AdminHeader.jsx) — Control panel header with shortcut search.
* [`src/layouts/admin/AdminSidebar.jsx`](./commerceflow-web/src/layouts/admin/AdminSidebar.jsx) — 8-section administrative navigation sidebar.
* [`src/layouts/admin/adminNavConfig.js`](./commerceflow-web/src/layouts/admin/adminNavConfig.js) — Master administrative navigation structure.
* [`src/layouts/admin/AdminShellStates.jsx`](./commerceflow-web/src/layouts/admin/AdminShellStates.jsx) — Standardized AdminLoadingState, AdminErrorState, AdminEmptyState.
* [`src/components/admin/VariantManager.jsx`](./commerceflow-web/src/components/admin/VariantManager.jsx) — Product variant configuration matrix.

---

*End of CommerceFlow UI/UX Design System Documentation*
