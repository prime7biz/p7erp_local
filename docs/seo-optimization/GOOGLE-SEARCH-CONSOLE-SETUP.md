# Google Search Console, analytics and monitoring

Status on 2026-11-13: **Search Console ownership is verified** (confirmed by the owner). Analytics: **Plausible**
support is built in and switched off until the build variable `VITE_PLAUSIBLE_DOMAIN` is set (§5).

## 1. Verify ownership (recommended: Domain property)

1. Open [Google Search Console](https://search.google.com/search-console) → **Add property** → **Domain** → `prime7erp.com`.
2. Google shows a TXT record (`google-site-verification=...`). Add it at your DNS provider (Cloudflare → DNS → Add record → Type TXT, Name `@`).
3. Click **Verify** (DNS can take a few minutes).

A Domain property covers `https://`, `http://`, `www` and every subdomain, so no code change is needed. Use an HTML-tag
verification only if DNS access is impossible; send the token to a developer to add to `index.html`.

## 2. Submit the sitemap

1. Search Console → **Sitemaps** → enter `https://prime7erp.com/sitemap.xml` → **Submit**.
2. Expect **Success** with 51 discovered URLs: 24 core pages (including the 6 legal pages, `/login`, `/signup` and `/sitemap`), 8 module pages and 18 guides plus `/resources`. The number grows as new guides are published.
3. Do not submit `/app` or `/portal` URLs; they are `noindex` by design.

## 3. Live checks right after deploying

Run from any terminal (Windows: use `curl.exe`):

```bash
curl -s https://prime7erp.com/garment-costing-software | grep -E "<title|canonical|og:title|data-prerendered"
curl -sI https://prime7erp.com/pricing/      # expect 301, Location: /pricing
curl -sI https://prime7erp.com/blog          # expect 301, Location: /resources
curl -s  https://prime7erp.com/app | grep robots   # expect noindex
curl -sI https://www.prime7erp.com/pricing   # expect 301, Location: https://prime7erp.com/pricing
curl -sI "https://www.prime7erp.com/iclock/getrequest?SN=x"   # expect no 301 (attendance devices keep working)
```

Then:

- In Search Console, use **URL Inspection** → **Test live URL** on `/`, `/erp-bangladesh` and one guide. Check that the
  "HTML" tab shows the page text and the canonical matches the URL. Click **Request indexing** for the new module pages.
- Paste a URL into the [Rich Results Test](https://search.google.com/test/rich-results) (Breadcrumbs, Article,
  Organization) and the [Schema Markup Validator](https://validator.schema.org/).
- Share a module page link in WhatsApp or LinkedIn and check that the preview shows the right title and image (LinkedIn
  [Post Inspector](https://www.linkedin.com/post-inspector/) refreshes its cache).

## 4. What to monitor (weekly for the first 8 weeks)

| Report | Look for |
|--------|----------|
| Pages (Indexing) | New module pages and guides move to "Indexed". "Alternate page with proper canonical" should only list trailing-slash or `www` variants. |
| Performance → Queries | Impressions for "garments erp software bangladesh", "buying house erp software", "back to back lc management software", "garment costing software". |
| Performance → Pages | Which module pages get impressions; low CTR → improve title and description in `src/config/solutionPages.ts`. |
| Core Web Vitals | Field LCP, INP and CLS for mobile once there is enough traffic. |
| Enhancements | Breadcrumbs, with no errors. |

Replace the assumptions in `KEYWORD-STRATEGY.md` with real query data after 4–8 weeks.

## 5. Analytics (Plausible, built in)

`frontend/src/lib/analytics.ts` loads Plausible's manual-pageview script only when the build has `VITE_PLAUSIBLE_DOMAIN`,
and only on public, indexable marketing pages. The ERP app, portals, verification links and account pages are never
sent, and page views are sent without the query string. No cookies are set. Events: `cta_click`, `demo_request_submitted`,
`contact_submitted`, `roi_calculated`, `signup_started`. The CSP in `frontend/nginx.prod.conf` already allows `plausible.io`.

To switch it on:

1. In [Plausible](https://plausible.io), add the site `prime7erp.com`.
2. In Plausible → Site settings → Goals, add custom-event goals `demo_request_submitted`, `contact_submitted`,
   `signup_started` and `cta_click` (property `cta` shows which button).
3. In GitHub → repository → Settings → Secrets and variables → Actions → **Variables**, add
   `VITE_PLAUSIBLE_DOMAIN` = `prime7erp.com`. The release workflows pass it to `frontend/Dockerfile.prod`.
4. Release as usual. Open `https://prime7erp.com/pricing` and check Plausible's realtime view shows the visit.
5. Optional: Plausible → Site settings → Integrations → Google Search Console, to see search queries in Plausible.

Self-hosted Plausible or a first-party proxy: also set `VITE_PLAUSIBLE_SCRIPT_URL` at build time and add that host to
`script-src` and `connect-src` in the CSP.

## 6. Bing Webmaster Tools (optional, 5 minutes)

[Bing Webmaster Tools](https://www.bing.com/webmasters) → **Import from Google Search Console**. This also feeds
ChatGPT search and Copilot, which use Bing's index.
