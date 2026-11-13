# SEO audit – prime7erp.com (2026-11-13)

Scope: the public marketing site (React + Vite single-page app served by Nginx). The ERP app (`/app/*`),
portals (`/portal/*`) and the backend were inspected only to confirm they stay private and to verify
product claims. Evidence comes from the repository, a local production build, Lighthouse runs and
read-only requests to the live site.

## 1. Architecture (as found)

| Part | Finding | Evidence |
|------|---------|----------|
| Rendering | Client-side React 18 SPA. Every route is `React.lazy`. The HTML has an empty `<div id="root">`. | `frontend/src/app/router.tsx`, `frontend/index.html` |
| Head tags | `react-helmet-async` in one global `<Seo />` (title, description, canonical, OG, Twitter, JSON-LD). | `frontend/src/components/Seo.tsx`, `src/config/seo.ts` |
| Build-time HTML | `inject-static-route-html.ts` wrote `dist/<path>/index.html` with only title, description, robots and canonical changed. | `frontend/scripts/inject-static-route-html.ts` (before this work) |
| Serving | Docker Nginx (`frontend/nginx.prod.conf`) behind the host Nginx that owns 80/443 (host config is not in the repo). | `.cursor/rules/production-architecture.mdc` |
| Sitemap | Generated at build (`scripts/generate-sitemap.ts`) from `publicMarketingPaths.ts` + all articles. | `frontend/public/sitemap.xml` |
| robots.txt | `Allow: /` and the sitemap line. | `frontend/public/robots.txt` |
| Analytics | No GA4 / GTM / Search Console tag in the code. `lib/analytics.ts` only forwards events to a `dataLayer` or Plausible that the owner installs. | `frontend/src/lib/analytics.ts` |

Public marketing routes: `/`, `/features`, `/pricing`, `/about`, `/contact`, `/book-demo`, `/roi-calculator`,
`/garments-erp`, `/buying-house-erp`, `/erp-bangladesh`, `/erp-comparison`, `/how-it-works`, `/security`,
`/trust-center`, `/resources` (+ 18 articles), `/support`, `/sitemap`, `/legal/*` (6). Private: `/app/*`,
`/portal/*`, `/verify/*`, auth helpers.

## 2. Critical findings

### C1 – Page HTML files were never served (live bug)
`nginx.prod.conf` used `try_files $uri /index.html;`. For `/pricing`, `$uri` is a folder, so Nginx fell
back to `/index.html` (the homepage file). The per-page files written at build time were never used.

Live evidence (`curl https://prime7erp.com/garments-erp`, 2026-11-13): title
`Prime7 ERP – Cloud ERP for Garments & Buying Houses` and `<link rel="canonical" href="https://prime7erp.com" />`,
empty `<div id="root">`.

### C2 – Conflicting canonicals on every inner page
Raw HTML said canonical = homepage; after JavaScript, Helmet added a second canonical for the real URL.
Lighthouse on the local build of `/garments-erp`: *"Document does not have a valid rel=canonical"* (SEO 92).
Google ignores or mis-resolves conflicting canonicals, which can keep inner pages out of the index.

### C3 – No crawlable content or share tags without JavaScript
Body empty; Open Graph, Twitter and JSON-LD only after JavaScript. Link previews (WhatsApp, Facebook,
LinkedIn, X) and most AI crawlers do not run JavaScript, so they saw the homepage title and no image.

### C4 – Duplicate host and URL variants (live)
`https://www.prime7erp.com/` answers **200** (no redirect to `prime7erp.com`). `/pricing/` (trailing slash),
`/blog` and unknown URLs answer 200. HTTP → HTTPS redirect works (301).

## 3. High findings

| ID | Finding | Evidence |
|----|---------|----------|
| H1 | No pages for module keywords (merchandising, production, inventory, BTB LC, costing, accounts, AI). Footer "Modules" links all pointed to plain `/features`. | `PublicLayout.tsx` footer |
| H2 | 14 of 18 articles were ~35-word stubs, indexed and in the sitemap, ending with a misleading "Full article content is available…" line. | `src/data/resourcesArticles.ts` |
| H3 | `/erp-bangladesh` (natural page for "Garments ERP Software Bangladesh") had about 100 words. | old `ErpBangladeshPage.tsx` |
| H4 | FAQ answers were not in the DOM until clicked (Landing, Garments ERP, Buying House). Landing also had FAQPage JSON-LD for those hidden answers. | `Landing.tsx`, `GarmentsErpPage.tsx`, `BuyingHouseErpPage.tsx` |
| H5 | Share image declared 1200×630 PNG but the file is 1376×768 and 1.1 MB (too large for many previews). | `public/images/og-default.png` |
| H6 | `SoftwareApplication` JSON-LD had `offers.price = 0`, which reads as "free software". | `Seo.tsx` |

## 4. Medium findings

- Unverifiable or conflicting claims (not all changed; see section 6):
  - Landing said "AES-256 encryption at rest and TLS 1.3", while the Security page only states HTTPS (changed).
  - `/garments-erp` H1 said "The Only ERP…" (changed), and it claimed "supports standard EDI integrations"; no EDI code exists (changed).
  - "Join garment manufacturers who run…" implies a customer base (changed).
  - "machine learning trained on garment industry data" (changed).
- The HTML site map used raw paths as link text. Landing article links pointed to `/features`.
- Read times overstated (for example "11 min read" on a 35-word stub).
- `og:image` alt and sizes were fine, but the header logo (34 KB PNG, 1024 px wide) is shown at about 160 px.
- `/blog` links in the footer went through a client-side redirect.

## 5. Baseline performance (local production build, Lighthouse 13, mobile, simulated throttling)

| Page | Perf | SEO | A11y | FCP | LCP | TBT | CLS |
|------|------|-----|------|-----|-----|-----|-----|
| `/` | 62 | 100 | 96 | 1.0 s | 5.7 s | 690 ms | 0.03 |
| `/garments-erp` | 82 | 92 | 96 | 1.0 s | 4.5 s | 150 ms | 0 |

First load: about 390 KB of JavaScript before any text (raw; about 130 KB gzip) plus a 137 KB CSS file.
Main-thread script time about 1.7 s. See `PERFORMANCE-REPORT.md`.

## 6. Items for the owner (not changed, need a business decision)

1. **Pricing mismatch**: Landing shows Starter "BDT 15,000 / Up to 10 users" and Growth "BDT 35,000 / Up to 50 users";
   `/pricing` shows Starter "Up to 5 users" and Growth "Up to 25 users". Pick one and align both.
2. **Implementation time**: Landing FAQ "2–4 weeks", Landing CTA "Setup in minutes", `/erp-comparison` "days, not months".
3. **About page**: "50+ garment factories", "20+ years", "ROI within 90 days" — confirm or soften.
4. **Article authors** (Kamal Rahman, Md. Faisal Ahmed, Sarah Chen, Priya Sharma) came from the legacy PrimeX code.
   If they are not real people, change them to "Prime7 ERP Team" (Google values real, verifiable authorship).
5. **Uncited statistics** in the four older full articles (for example "60–70% of the total cost").
6. **Features page**: "Module 1 of 9" badges, but its FAQ lists 8 modules; "Bank statement import (CSV/Excel/MT940)" was not verified.
7. **Landing pricing teaser**: "No credit card required", "Includes Free Data Migration from Excel" — confirm.

## 7. Security check of the public surface

- `/app/*`, `/portal/*`, `/verify/*` and auth helpers are `noindex` (now also in the raw HTML through
  `spa-fallback.html`) and are not in the sitemap.
- Pre-rendering runs at build time with no login and no API calls; it renders only public routes.
  Private routes need a token in `localStorage`, which does not exist at build time.
- No API keys or tenant data are in the generated HTML (checked by `scripts/verify-seo-build.mjs`: no
  inline scripts in bodies, only public routes in the sitemap).
