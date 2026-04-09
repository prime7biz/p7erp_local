# SEO: Google Search Console and sitemap

This page describes how to submit the marketing site sitemap and validate it after deploy.

## Production URLs

| Asset | URL |
|--------|-----|
| Sitemap | `https://prime7erp.com/sitemap.xml` |
| robots.txt | `https://prime7erp.com/robots.txt` |

The app must serve `sitemap.xml` and `robots.txt` from the **static frontend** (Nginx `root`/`try_files` for the SPA). They live under `frontend/public/` and are copied into the Vite build output.

## Submit the sitemap in Google Search Console

1. Open [Google Search Console](https://search.google.com/search-console) and select the **prime7erp.com** property (Domain or URL-prefix).
2. Go to **Sitemaps** (left menu).
3. Under **Add a new sitemap**, enter: `sitemap.xml` (GSC prepends your property URL).
4. Submit and wait for **Success** or fix any reported errors (404, wrong host, etc.).

## Verify after deploy

1. In a browser, open `https://prime7erp.com/sitemap.xml` — you should see XML with `<loc>` entries for public pages and resource articles (no `/app/` URLs).
2. Locally, after `npm run build` (or `npm run prebuild`) in `frontend/`:

   ```bash
   cd frontend
   node scripts/validate-sitemap.mjs
   ```

   Expect: `OK: N URLs, no /app/ or private URLs.`

3. Optional live check:

   ```bash
   cd frontend
   node scripts/validate-sitemap.mjs --fetch
   ```

## Notes

- **Authenticated app:** `/app/*` routes use `noindex` in [`frontend/src/components/Seo.tsx`](../frontend/src/components/Seo.tsx); they are **not** listed in the sitemap.
- **New public pages:** add the path to `PUBLIC_MARKETING_PATHS` in [`frontend/src/config/publicMarketingPaths.ts`](../frontend/src/config/publicMarketingPaths.ts) when you add a route in `router.tsx`, and add SEO copy in [`frontend/src/config/seo.ts`](../frontend/src/config/seo.ts) if needed.
- **New resource articles:** add the article to `resourcesArticles.ts`; the next build will include the new slug automatically.
