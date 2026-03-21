/**
 * Writes frontend/public/sitemap.xml from public routes + resource article slugs.
 * Run via: npm run prebuild (before vite build) or: node scripts/generate-sitemap.mjs
 *
 * Env: SITEMAP_SITE_URL (default https://prime7erp.com)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.join(__dirname, "..");
const ARTICLES_FILE = path.join(FRONTEND_ROOT, "src", "data", "resourcesArticles.ts");
const OUT_FILE = path.join(FRONTEND_ROOT, "public", "sitemap.xml");

const SITE_URL = (process.env.SITEMAP_SITE_URL || "https://prime7erp.com").replace(/\/$/, "");

/** Must match public routes in src/app/router.tsx (exclude redirects and /app). */
const STATIC_PATHS = [
  "/",
  "/features",
  "/pricing",
  "/about",
  "/contact",
  "/garments-erp",
  "/buying-house-erp",
  "/privacy",
  "/terms",
  "/how-it-works",
  "/security",
  "/erp-bangladesh",
  "/erp-comparison",
  "/resources",
  "/support",
  "/login",
  "/signup",
  "/verify/proforma",
];

function extractSlugs(tsSource) {
  const slugs = [];
  const re = /slug:\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(tsSource)) !== null) {
    slugs.push(m[1]);
  }
  return [...new Set(slugs)];
}

function xmlEscapeUrl(url) {
  return url.replace(/&/g, "&amp;");
}

function main() {
  const articlesSrc = fs.readFileSync(ARTICLES_FILE, "utf8");
  const slugs = extractSlugs(articlesSrc);
  const paths = [...STATIC_PATHS, ...slugs.map((s) => `/resources/${s}`)];
  const today = new Date().toISOString().slice(0, 10);

  const locs = paths
    .map((p) => {
      const loc = p === "/" ? SITE_URL : `${SITE_URL}${p}`;
      return `  <url>\n    <loc>${xmlEscapeUrl(loc)}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${p === "/" ? "1.0" : "0.8"}</priority>\n  </url>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${locs}
</urlset>
`;

  fs.writeFileSync(OUT_FILE, xml, "utf8");
  console.log(`Wrote ${paths.length} URLs to ${path.relative(FRONTEND_ROOT, OUT_FILE)}`);
}

main();
