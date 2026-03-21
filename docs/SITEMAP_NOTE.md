# Sitemap for production

The frontend generates **`frontend/public/sitemap.xml`** at build time.

## How it works

- **Script:** [`frontend/scripts/generate-sitemap.mjs`](../frontend/scripts/generate-sitemap.mjs) lists public routes (aligned with [`frontend/src/app/router.tsx`](../frontend/src/app/router.tsx)) and every `/resources/{slug}` from [`frontend/src/data/resourcesArticles.ts`](../frontend/src/data/resourcesArticles.ts).
- **When:** `npm run build` runs `prebuild`, which executes the generator before `vite build`.
- **Override base URL:** set `SITEMAP_SITE_URL` (default `https://prime7erp.com`) if you need a different absolute host for staging builds.

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
