# Performance report (2026-11-13)

## How it was measured

- Lighthouse 13 (`npx lighthouse@13`), Chrome headless, mobile form factor, on this Windows workstation.
- Local production builds only. **No field data** (Chrome UX Report / Search Console Core Web Vitals) was
  available, and **INP cannot be measured in a lab run**; TBT is shown as its lab proxy.
- Two servers:
  - `vite preview` (port 4173), used for the baseline because the baseline build had no Nginx test setup;
  - Docker `nginx:1.27-alpine` with `frontend/nginx.prod.conf` (port 8089), which is like production minus Cloudflare and the host Nginx.
- Two throttling modes:
  - *simulated* (Lighthouse default; a model, sensitive on localhost);
  - *applied* (`--throttling-method=devtools`; really throttled loads), which is closer to a phone on 4G.
- Single runs; repeat runs of the same build varied by up to ±300 ms TBT and ±10 performance points.
  Treat differences smaller than that as noise.
- Summary tool: `node scripts/lighthouse-summary.mjs <report.json>...`

## 1. Baseline (before any change, vite preview, simulated)

| Page | Perf | SEO | FCP | LCP | TBT | CLS |
|------|------|-----|-----|-----|-----|-----|
| `/` | 62 | 100 | 1.0 s | 5.7 s | 690 ms | 0.03 |
| `/garments-erp` | 82 | **92** (invalid canonical) | 1.0 s | 4.5 s | 150 ms | 0 |

## 2. A/B with applied throttling (same JavaScript, Nginx, only the HTML differs)

"Off" is the new build with `PRERENDER_PUBLIC_HTML=false`, which reproduces the old empty-body HTML.

| Page | Off: Perf / FCP / LCP / TBT / Speed Index | On (pre-rendered) |
|------|------|------|
| `/garment-costing-software` | 42 / 3.1 s / 6.6 s / 1,130 ms / 6.7 s | **76 / 3.2 s / 3.2 s / 440 ms / 3.3 s** |
| `/garments-erp` | 42 / 3.2 s / 6.9 s / 1,090 ms / 6.9 s | 51 / 3.1 s / 6.6 s / 840 ms / **3.1 s** |
| `/` | 32 / 3.0 s / 10.1 s / 2,510 ms / 9.5 s | 34 / 4.7 s / 11.6 s / 1,700 ms / **6.3 s** |

## 3. Final build, Nginx, simulated throttling

| Page | Perf | A11y | SEO | FCP | LCP | TBT | CLS |
|------|------|------|-----|-----|-----|-----|-----|
| `/garment-costing-software` | **100** | 100 | 100 | 1.0 s | **1.0 s** | 50 ms | 0.03 |
| `/resources/lc-management-guide-garment-export` | **99** | 100 | 100 | 1.0 s | **1.0 s** | 110 ms | 0 |
| `/garments-erp` | 80 | 96 | **100** | 1.0 s | 4.9 s | 160 ms | 0 |
| `/` | 74 | 96 | 100 | 1.3 s | 6.2 s | 220 ms | 0.03 |

With JavaScript blocked entirely, `/garments-erp` renders completely from HTML (final screenshot checked)
with simulated FCP = LCP = 1.2 s.

## 3a. Font preload A/B (applied throttling, two runs each, same build)

| Page | LCP with Inter preload | LCP without |
|------|------------------------|-------------|
| `/garments-erp` | 4.3 s, 3.3 s | 7.6 s, 6.8 s |
| `/garment-costing-software` | 6.6 s, 6.0 s | 6.3 s, 6.6 s |
| `/` | 11.5 s, 12.7 s | 11.5 s, 11.7 s |

The preload removes the late LCP on pages with a large text heading and is neutral elsewhere, so it is kept
(`withFontPreload` in `scripts/inject-static-route-html.ts`).

## 3b. Hydration mode (`PRERENDER_HYDRATE=true`, Nginx, applied throttling, two runs each)

| Page | Swap mode (default) LCP | Hydrate mode LCP | Hydrate console errors |
|------|-------------------------|------------------|------------------------|
| `/garments-erp` | 3.3–4.3 s | 3.1–3.7 s (= FCP) | 0 |
| `/garment-costing-software` | 3.2–6.6 s | 3.1–3.6 s (= FCP) | 0 |
| `/` | 11.5–12.7 s | 9.0–9.6 s | 0 |

Simulated runs in hydrate mode: `/garments-erp` 99 (LCP 1.0 s), `/garment-costing-software` 99 (LCP 1.0 s), `/` 56 (LCP 6.2 s).
A first version without chunk preloading hit React error #421 under throttling (a context update arrived while the page
was still waiting for its chunks) and fell back to client rendering; preloading the recorded chunks fixed it.
The homepage LCP is now the real download time of the dashboard screenshot; a lighter hero image is the next step.
TBT is similar in both modes (hydration still runs the page's JavaScript).

## 4. What improved

- **Visible content without JavaScript** on 34 public pages (the 5 form and auth pages get head tags only). Speed Index is roughly halved in throttled runs.
- **LCP on text-led pages** (module pages, guides) dropped from about 6.6 s to about 3.2 s (applied throttling)
  and to 1.0 s (simulated), meeting the ≤ 2.5 s target in the simulated run. Field results will differ.
- **TBT** is lower on every page measured, because the browser no longer waits for React to build the page from nothing.
- **CLS** is ≤ 0.03 everywhere (target ≤ 0.1). Width and height on the logos keep the header stable.
- **SEO score** is 100 on all pages measured (the canonical conflict is gone).
- Share image: 1.1 MB → 58 KB. Header logo: 34 KB → 25 KB.

## 5. What did not improve yet (honest gaps)

- On `/`, LCP is still recorded when React swaps in its own copy of the hero dashboard image
  (`/garments-erp` was fixed by the font preload, see §3a). Chrome treats the new element as a
  fresh, slightly larger LCP candidate. Fix: hydrate the pre-rendered markup instead of swapping it
  (roadmap item P1-1).
- The homepage still downloads about 850 KB in total (framer-motion 42 KB gzip, two web fonts, the dashboard image).
- `tutorialUi` (917 KB raw) and `ControlTowerPage` are large, but they load only inside the app, not on public pages.
- The 137 KB CSS file is shared by the app and the marketing site and is render-blocking.

## 6. Bundle notes (from `vite build`)

Public first load:
- Entry `index` about 131 KB raw / 39 KB gzip
- `vendor-react` 167 / 55
- `vendor-react-router` 40 / 14
- `vendor-query` 38 / 12
- `vendor-helmet` 15 / 6
- Then `PublicLayout`, the page chunk and `vendor-motion` (128 / 42)

The new `SolutionPage` chunk and its content are loaded only on module pages.
