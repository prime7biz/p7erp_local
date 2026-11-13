# SEO implementation (2026-11-13)

All changes are in `frontend/` plus the repo `.gitignore`. No backend, database, authentication, RBAC
or tenant code was changed. Nothing was committed, pushed or deployed.

## 1. How public pages are built now

```
npm run build
  prebuild        scripts/generate-sitemap.ts        -> public/sitemap.xml (indexable URLs only)
  tsc -b          type check
  vite build      browser bundle -> dist/
  vite build --ssr src/prerender/entryServer.tsx -> dist-ssr/ (Node bundle, never served)
  tsx scripts/inject-static-route-html.ts
                  -> dist/<path>/index.html for every indexable URL (head + pre-rendered body)
                  -> dist/spa-fallback.html (noindex) for app, portal, auth and unknown URLs
npm run verify:seo   scripts/verify-seo-build.mjs (checks the output; run after the build)
```

- **Head tags**: the build renders the real `<Seo />` component (and any page-level `<Helmet>`) in Node and
  copies Helmet's output (`data-rh="true"`) into the HTML. In the browser, Helmet takes those tags over,
  so there is exactly one title, description, robots tag and canonical per page.
- **Body**: the build renders the real route tree (`<AppRouter />` inside `StaticRouter`) for public pages and
  writes it inside `<div id="root"><div data-prerendered="true" style="display:contents">…</div></div>`.
  Head tags only (`PRERENDER_HEAD_ONLY_PATHS` in `src/config/publicMarketingPaths.ts`): `/login`, `/signup`, and the
  form pages `/contact`, `/book-demo`, `/roi-calculator` (text typed before the app takes over would be lost).
- **Errors**: both error boundaries call `revealApp()`, so an error screen is never hidden behind the static copy.
- **Browser start-up** (`src/lib/prerenderSnapshot.ts`, `src/main.tsx`, `src/App.tsx`): on a pre-rendered
  page, React renders into a hidden container next to the pre-rendered copy, after the browser has painted
  once. When the routed page has rendered, `revealApp()` removes the copy and shows the app in the same
  frame. There is no hydration, so markup differences can never break the page. App, portal and auth pages
  have an empty `#root`, and React starts exactly as before.
- **Optional hydration mode (build switch `PRERENDER_HYDRATE=true`, default off)**: the build renders the whole
  browser tree (`src/AppRoot.tsx`, shared by `main.tsx` and `src/prerender/entryServer.tsx`) into
  `<div id="root" data-hydrate="true">`, plus a data block `<script type="application/json" id="p7-route-chunks">`
  listing the page's lazy chunks (recorded by `src/app/lazyRoute.tsx`). The browser preloads those chunks, then calls
  `hydrateRoot`, so React reuses the HTML instead of replacing it (no re-painted hero). A mismatch is logged with
  `console.error("[P7] pre-rendered page could not be hydrated…")` and React re-renders that part itself.
  `useMarketingCurrency` starts with BDT and applies the saved choice before the first paint, so the header matches.
  Turn it on: `docker build --build-arg PRERENDER_HYDRATE=true …` (ARG in `frontend/Dockerfile.prod`), or set the
  variable before `npm run build`. Check: `npm run verify:seo`, then open a page and confirm no `[P7]` error in the console.
- **Fail-safe**: if one page cannot be rendered, it gets the old head-only HTML and the build continues.
  Kill switch: build with `PRERENDER_PUBLIC_HTML=false` to get head-only HTML for every page.
- **Font**: the Latin Inter font is preloaded in the generated HTML so pre-rendered text is drawn once.

## 2. Nginx (`frontend/nginx.prod.conf`)

| Request | Before | Now |
|---------|--------|-----|
| `/pricing` | homepage HTML | `/pricing/index.html` (own head + body), `no-cache` |
| `/pricing/` | 200 duplicate | 301 → `/pricing` (query string kept) |
| `/blog`, `/blog/<slug>` | 200 + JavaScript redirect | 301 → `/resources`, `/resources/<slug>` |
| `/privacy`, `/terms`, `/legal` | JavaScript redirect | 301 → `/legal/privacy`, `/legal/terms`, `/legal/terms` |
| `/app/...`, `/portal/...`, unknown | homepage HTML (index, home canonical) | `spa-fallback.html` (noindex, no canonical) |
| `/assets/missing.js` | 404 | 404 (unchanged) |

`absolute_redirect off` makes every redirect relative (`Location: /pricing`), so the container never sends
`http://…:80` URLs behind the host Nginx. The trailing-slash rewrite only matches plain path characters
(`^(/[A-Za-z0-9_-][A-Za-z0-9._~/-]*)/$`). An earlier draft (`^(/.+)/$`) turned `/%5Cevil.com/` into
`Location: /\evil.com`, an open redirect found by the independent QA review and fixed before release.
`npm run verify:nginx -- <baseUrl>` checks 21 cases, including these attack URLs. Security headers (CSP report-only, X-Frame-Options, and so on)
are repeated in the new `@page_html` block, because Nginx drops server-level `add_header` lines in blocks
that set their own. Tested with `nginx:1.27-alpine` and the real build (see `PERFORMANCE-REPORT.md`).

### www → apex (2026-11-13)

`map $host $p7_apex_host { www.prime7erp.com prime7erp.com; }` plus a `return 301 https://$p7_apex_host$request_uri`
at the top of `location /`. Only listed hosts redirect (a forged `Host` header cannot produce a redirect elsewhere);
`/api/`, `/iclock/` (attendance devices), `/media/`, `/health` and `/assets/` are never redirected. Visitors who used
`www` sign in once more on `prime7erp.com` (different browser storage).

## 3. Content and metadata

- **Pricing**: one data file `src/data/marketing/pricingPlans.ts` feeds `/pricing` and the homepage teaser
  (Starter 5 users, Growth 25 users, Enterprise unlimited; confirmed by the owner).
- **Authors**: every article is credited to "Prime7 ERP Team" (Organization in Article JSON-LD); the legacy persona
  names and the uncited statistics in the four older articles were removed.
- **Analytics**: Plausible via `src/lib/analytics.ts` + `src/components/AnalyticsPageviews.tsx` (build variable
  `VITE_PLAUSIBLE_DOMAIN`, ARG in `Dockerfile.prod`, GitHub variable in `deploy.yml` / `docker-build.yml`; CSP allows
  `plausible.io`). Public indexable pages only, path without query string, no cookies. Test `src/lib/analytics.test.ts`.


| Change | Files |
|--------|-------|
| 7 new module pages + rebuilt `/erp-bangladesh` on one template (breadcrumb, intro, challenges, features, workflow, FAQ with native `<details>`, related links, CTA) | `src/config/solutionPages.ts`, `src/data/marketing/solutionPageContent.ts`, `src/pages/public/SolutionPage.tsx`, router; deleted `ErpBangladeshPage.tsx` |
| New titles and descriptions per the keyword map | `src/config/seo.ts` |
| All 18 articles are full guides: one new buyer's checklist and 13 former stubs rewritten (excerpts corrected where they promised unverified features, author "Prime7 ERP Team", `updated` date) | `src/data/resourcesArticles.ts` |
| `/erp-comparison` rebuilt as a fair three-way comparison table with FAQ; `/how-it-works` gained preparation and rollout sections | `ErpComparisonPage.tsx`, `HowItWorksPage.tsx` |
| Articles under 300 words: noindex and out of the sitemap; honest "short summary" note; real read times | `resourcesArticles.ts`, `utils/seoRobots.ts`, `scripts/generate-sitemap.ts`, `ResourcesPage.tsx` |
| Internal links: footer modules, Landing cards and article links, Features sections, Garments ERP module grid, Buying House links, HTML site map labels | `PublicLayout.tsx`, `Landing.tsx`, `FeaturesPage.tsx`, `GarmentsErpPage.tsx`, `BuyingHouseErpPage.tsx`, `SitemapPage.tsx` |
| FAQ answers always in the DOM (hidden until opened) and `aria-expanded` | `Landing.tsx`, `GarmentsErpPage.tsx`, `BuyingHouseErpPage.tsx` |
| Removed or softened unverifiable claims (EDI, "The Only ERP", AES-256/TLS 1.3, "machine learning trained on…", implied customer base, "P7") | same pages |
| Structured data: removed `offers.price 0`; Article author = Organization for team articles; `dateModified`; JSON-LD `<` escaped; breadcrumbs Home › Features › module | `components/Seo.tsx`, `utils/seoBreadcrumbs.ts` |
| Share image 1200×630 JPEG (58 KB, was a 1.1 MB PNG declared with the wrong size) | `public/images/og-default.jpg` |
| Header logo 324×80 (25 KB, was 1024 px / 34 KB) with width and height | `public/images/logo-header.png`, `PublicLayout.tsx` |
| robots.txt: `Disallow` `/api/`, `/media/`, `/iclock/` | `public/robots.txt` |

FAQPage JSON-LD was **not** added to the new pages: Google shows FAQ rich results only for authoritative
government and health sites (since August 2023). The existing Landing FAQ markup was kept; its answers
are now in the HTML.

## 4. Tests and checks added

- `src/config/solutionPages.test.ts`: registry ↔ content, public and indexable, related links resolve,
  breadcrumbs, unique titles and descriptions across all indexable pages, length limits, article robots,
  private areas stay noindex.
- `src/lib/prerenderSnapshot.test.ts`: app pages render into `#root`; pre-rendered pages use a hidden
  container; the reveal removes the copy and leaves one `<h1>`.
- `scripts/verify-seo-build.mjs` (`npm run verify:seo`): per sitemap URL it checks one title, a description,
  `index` robots, exactly one canonical equal to the URL, OG and Twitter tags, JSON-LD that parses, a
  pre-rendered body with exactly one `<h1>` and no `<script>`; unique titles and descriptions; internal
  links resolve; the fallback is noindex; robots.txt names the sitemap.
- `src/components/AppErrorBoundary.prerender.test.tsx`: a failing pre-rendered page shows the error screen.
- `scripts/verify-nginx-routes.mjs` (`npm run verify:nginx -- http://localhost:8089` or the live URL): status codes,
  redirect targets, robots tags and security headers for 21 URLs, and no unsafe `Location` for open-redirect payloads.
- `scripts/lighthouse-summary.mjs`: prints scores and lab metrics from Lighthouse JSON files.

- `src/app/lazyRoute.test.tsx`: lazy routes behave like `React.lazy`, render in one pass after preloading, record
  what a render used, and ignore failed preloads; `readRouteChunkIds` ignores bad data.
- `src/lib/prerenderSnapshot.test.ts` also covers `shouldHydrate`.
- `src/app/ScrollToTop.test.tsx`: app pages scroll to the top as before; a pre-rendered page keeps the visitor's
  scroll position on first render and scrolls on the next navigation.

Not covered by an automated test: an App-level test of the reveal during a suspended lazy route (checked by
hand in headless Chrome: one `<h1>`, copy removed).

## 5. Operational impact and rollback

- **No new environment variables are required.** Optional build switches (ARGs in `frontend/Dockerfile.prod`):
  `PRERENDER_PUBLIC_HTML` (default `true`) and `PRERENDER_HYDRATE` (default `false`).
- **No migration, no backend change, no new npm dependency.**
- Build time is about 30–40 s longer (the extra `vite build --ssr` plus rendering about 40 pages).
- The frontend image now serves different HTML per URL, and Nginx answers 301 for trailing slashes and old URLs.
- Rollback: `git revert` the commit (frontend only). For a quick partial rollback, rebuild with
  `PRERENDER_PUBLIC_HTML=false` (keeps correct head tags and Nginx fixes, empty body as before).
