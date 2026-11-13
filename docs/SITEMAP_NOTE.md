# Sitemap for production

The frontend generates **`frontend/public/sitemap.xml`** at build time.

## How it works

- **Sitemap script:** [`frontend/scripts/generate-sitemap.ts`](../frontend/scripts/generate-sitemap.ts) lists paths from [`frontend/src/config/publicMarketingPaths.ts`](../frontend/src/config/publicMarketingPaths.ts) (keep aligned with [`frontend/src/app/router.tsx`](../frontend/src/app/router.tsx)) plus every `/resources/{slug}` from [`frontend/src/data/resourcesArticles.ts`](../frontend/src/data/resourcesArticles.ts). It sets **per-URL `lastmod`**, **`changefreq`**, and **`priority`** (articles use parsed publish dates; static pages use `SITEMAP_STATIC_LASTMOD` or the build date).
- **Pre-rendered page files:** after `vite build` and `vite build --ssr src/prerender/entryServer.tsx`, [`frontend/scripts/inject-static-route-html.ts`](../frontend/scripts/inject-static-route-html.ts) writes `dist/<path>/index.html` for each **indexable** URL with the full head tags from `Seo.tsx` and the page body, plus `dist/spa-fallback.html` (noindex) for everything else. Nginx serves them with `try_files $uri $uri/index.html /spa-fallback.html`. Details: [`docs/seo-optimization/SEO-IMPLEMENTATION.md`](./seo-optimization/SEO-IMPLEMENTATION.md).
- **Articles:** only full guides (300+ words, `isIndexableArticle`) are in the sitemap; short summaries are noindex.
- **When:** `npm run build` runs `prebuild` (`tsx scripts/generate-sitemap.ts`), then `vite build`, the SSR build and the inject script. Check the output with `npm run verify:seo`.
- **Override base URL:** set `SITEMAP_SITE_URL` (default `https://prime7erp.com`) for sitemap locs and inject canonicals; match `VITE_SITE_URL` in production builds when possible.

## robots.txt

[`frontend/public/robots.txt`](../frontend/public/robots.txt) includes:

```text
Sitemap: https://prime7erp.com/sitemap.xml
```

## Validation

After generating or changing the sitemap:

```bash
cd frontend
node scripts/validate-sitemap.mjs
```

Optional: `node scripts/validate-sitemap.mjs --fetch` sends HEAD requests to a sample of URLs (requires network).

See also: [`docs/SEO_SEARCH_CONSOLE.md`](./SEO_SEARCH_CONSOLE.md) for Google Search Console submission.
