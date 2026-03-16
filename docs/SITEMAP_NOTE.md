# Sitemap for production

The frontend does **not** currently include a `sitemap.xml` or build-time sitemap generation.

**Recommendation:**

- **Option A – Static sitemap:** Add a `frontend/public/sitemap.xml` that lists the main public URLs (e.g. `/`, `/features`, `/pricing`, `/about`, `/contact`, `/garments-erp`, `/buying-house-erp`, `/privacy`, `/terms`, `/how-it-works`, `/security`, `/erp-bangladesh`, `/erp-comparison`, `/resources`, `/support`, `/login`, `/signup`). Update it when you add or remove public pages.

- **Option B – Build-time generation:** Use a Vite plugin (e.g. `vite-plugin-sitemap`) or a small Node script run at build time that reads public routes (e.g. from `src/app/router.tsx` or a routes config) and outputs `public/sitemap.xml`. This keeps the sitemap in sync with the app.

After adding a sitemap, set your production URL in `frontend/public/robots.txt`:

```text
Sitemap: https://prime7erp.com/sitemap.xml
```

(Uncomment the existing line there when the sitemap is in place.)
