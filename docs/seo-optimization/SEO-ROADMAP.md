# SEO roadmap (prioritised by impact and effort)

Impact: H high, M medium, L low. Effort: S under 1 day, M 1–3 days, L more than 3 days.

## P0 – do before or at the next release

| # | Action | Impact | Effort | Owner |
|---|--------|--------|--------|-------|
| P0-1 | Deploy this change (frontend image only), then run the live checks in `GOOGLE-SEARCH-CONSOLE-SETUP.md` §3. | H | S | Dev |
| P0-2 | ~~www → apex redirect.~~ **Done in the frontend Nginx** (`map $host $p7_apex_host`, pages only; `/api`, `/iclock`, `/media` untouched; tested by `verify:nginx`). Live check after deploy: `curl -sI https://www.prime7erp.com/pricing`. If it still answers 200, the host Nginx is not passing `Host` — add a Cloudflare Redirect Rule (`www.prime7erp.com/*` → `https://prime7erp.com/${1}`, 301) instead. | H | S | Dev (done) |
| P0-3 | ~~Verify Search Console~~ (verified by owner). Submit `sitemap.xml` and request indexing for the module pages. | H | S | Owner |
| P0-4 | ~~Align pricing.~~ **Done**: one source `frontend/src/data/marketing/pricingPlans.ts` (owner confirmed 5 / 25 / unlimited users). | H | S | Dev (done) |

## P1 – next 2–6 weeks

| # | Action | Impact | Effort |
|---|--------|--------|--------|
| P1-1 | ~~Hydrate pre-rendered pages.~~ **Built 2026-11-13 behind `PRERENDER_HYDRATE` (default off).** Next: build one staging image with `--build-arg PRERENDER_HYDRATE=true`, check a few pages for `[P7]` console errors, then switch it on in the release workflow. | M–H | S |
| P1-8 | Lighter homepage hero image (the dashboard screenshot is now the homepage LCP): smaller WebP/AVIF at 1x/2x with `srcset`. | M | S |
| P1-2 | ~~Write the 11 remaining summary articles as full guides.~~ **Done 2026-11-13**: all 18 articles are full guides (700–1,100 words, team author, internal links checked by `solutionPages.test.ts`). Next: new topics from the editorial calendar below. | H | – |
| P1-3 | ~~Legacy article authors~~ **Done**: owner confirmed they were not real people; all articles are by "Prime7 ERP Team" and the uncited statistics were removed. | M | – |
| P1-4 | Resolve the content items in `SEO-AUDIT.md` §6 (implementation time, About page numbers, uncited statistics, Features module count). | M | S |
| P1-5 | ~~Rewrite `/erp-comparison` and `/how-it-works`.~~ **Done 2026-11-13** (three-way comparison table with fair generic-ERP strengths; go-live preparation and rollout steps; unverified "Tally-compatible chart import" removed). `/support` is still short (utility page, low priority). | M | – |
| P1-6 | Real product screenshots (WebP, with width and height) on each module page; descriptive alt text. Generate them with `tools/tutorial-capture/` and the masked demo tenant. | M | M |
| P1-7 | ~~Analytics~~ **Built (Plausible, public pages only, CSP updated).** Owner: add the site in Plausible and the GitHub variable `VITE_PLAUSIBLE_DOMAIN=prime7erp.com` (see `GOOGLE-SEARCH-CONSOLE-SETUP.md` §5). | M | S |

## P2 – later

| # | Action | Impact | Effort |
|---|--------|--------|--------|
| P2-1 | Lighter homepage: replace framer-motion entrance effects with CSS, lazy-load below-the-fold sections, WebP/AVIF hero at 1x/2x. | M | M |
| P2-2 | Split marketing CSS from app CSS (137 KB render-blocking today). | M | M |
| P2-3 | Per-page `lastmod` in the sitemap (today all static pages share the build date). | L | S |
| P2-4 | Textile page (knitting, dyeing, printing, washing units) once the product owner confirms the scope. | M | S |
| P2-5 | Bangla landing page (`/bn/...`) with `hreflang` only after a native speaker writes it. | M | M |
| P2-6 | Case studies, only with written customer permission and real numbers. | H | M |
| P2-7 | Real 404 status for unknown URLs (needs an Nginx route allowlist; today they are `noindex` soft 404s). | L | M |
| P2-8 | Comparison content ("Prime7 vs Odoo/ERPNext for garments") with fair, sourced statements. | M | M |

## Editorial calendar (guides)

| Priority | Topic | Target page | Links to |
|----------|-------|-------------|----------|
| 1 | Garment ERP implementation: a 90-day plan | new article | `/how-it-works`, `/book-demo` |
| 2 | Improving sewing line efficiency with SMV and line balancing | new article | `/garment-production-management-software` |
| 3 | Factory inventory control: from GRN to issue | new article | `/garment-inventory-management-software` |
| 4 | AI in garment manufacturing: practical uses and limits | refresh `ai-transforming-apparel-industry` (uncited statistics) | `/ai-garment-erp` |
| 5 | Refresh the four older guides (uncited statistics, legacy authors) | existing slugs | matching module pages |

Rewritten on 2026-11-13 (done): Excel vs ERP planning, buying house T&A, PO and sample tracking, LC deadline misses,
TNA calendar, stock valuation methods, stock-to-ledger integration, WIP costing, multi-currency, choosing buying house ERP,
digital transformation, consumption approvals (plus the earlier LC guide, costing guide and buyer's checklist).

Rules for every article: real expertise, no invented statistics (cite a source or remove), 800+ words,
one clear search intent, links to one module page and `/book-demo`, `updated` date when rewritten.
