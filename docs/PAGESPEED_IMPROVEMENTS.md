# PageSpeed Insights – Improvements Applied

This document summarizes changes made to align with Google PageSpeed Insights and Core Web Vitals.

## Done

### Performance
- **Minify JavaScript / CSS:** Production build uses Vite’s default `esbuild` minify and `cssCodeSplit: true`.
- **Reduce unused JavaScript:** 
  - `manualChunks` in `vite.config.ts` splits React, react-router, framer-motion, lucide-react, qrcode.react, react-helmet-async, and @radix-ui into separate chunks so the initial payload is smaller and caching is better.
  - App routes under `/app/*` are lazy-loaded; public routes are statically imported (can be lazy-loaded later to reduce initial JS if needed).
- **Reduce unused CSS:** Tailwind `content` in `tailwind.config.js` includes `./index.html` and `./src/**/*.{js,ts,jsx,tsx}` so unused utilities are purged in production.
- **Avoid enormous network payload:** Chunk splitting and lazy loading help keep initial transfer smaller. Run `npm run analyze` (frontend) to generate `dist/stats.html` and inspect bundle sizes.

### Accessibility
- **Contrast:** Replaced `text-gray-400` / `text-gray-500` with `text-gray-600` (or `text-gray-300` on dark backgrounds) across public pages and footer so text meets WCAG AA where required.
- **Heading order:** 
  - Landing: Security section card titles changed from `h4` to `h3` (no skip after `h2`).
  - Pricing: Added a visually hidden `h2` (“Choose your plan”) before plan cards so order is h1 → h2 → h3.
  - Support: Card titles “Contact us” / “Technical support” changed from `h3` to `h2`.
  - Resources (article): CTA block heading changed from `h3` to `h2`.

### SEO
- **Meta description:** `index.html` has a default meta description (Prime7 ERP). The `Seo` component sets per-route meta description via `getSeoForPath` (including `/resources/:slug`). No route is left without a description.
- **robots.txt:** `frontend/public/robots.txt` allows all user-agents and documents the Sitemap URL for production.
- **Sitemap:** Generated at build time (`npm run prebuild` → `frontend/public/sitemap.xml`). See `docs/SITEMAP_NOTE.md`.

### Landing / visuals
- **Dashboard section:** Uses your Prime7 ERP Dashboard image with scroll-triggered animation (fade + scale). Image path: `/images/prime7-dashboard.png`.
- **Before/After section:** Updated with icons (XCircle / CheckCircle2), bullet lists, and motion; labels use “Prime7 ERP”.

## How to check (PageSpeed-style)

1. **Production build:** From repo root: `cd frontend && npm run build && npm run preview`. Open the preview URL (e.g. http://localhost:4173).
2. **PageSpeed Insights:** Use https://pagespeed.web.dev/ and enter your deployed URL or the preview URL (preview may show different results than production).
3. **Bundle analysis:** In `frontend`, run `npm run analyze`, then open `frontend/dist/stats.html` in a browser to see chunk sizes and find large dependencies.

## Optional next steps

- Lazy-load public routes (Features, Pricing, About, etc.) in `app/router.tsx` to reduce initial JS further.
- Submit the sitemap in Google Search Console after deploy (`docs/SEO_SEARCH_CONSOLE.md`).
- Ensure images used on the site have appropriate `width`/`height` or `aspect-ratio` to avoid layout shift (CLS).
