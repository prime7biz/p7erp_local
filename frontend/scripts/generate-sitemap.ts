/**
 * Writes frontend/public/sitemap.xml from public routes + resource articles.
 * Run: tsx scripts/generate-sitemap.ts (via npm prebuild)
 *
 * Env: SITEMAP_SITE_URL (default https://prime7erp.com)
 *      SITEMAP_STATIC_LASTMOD (optional YYYY-MM-DD for marketing/legal static URLs)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PUBLIC_MARKETING_PATHS } from "../src/config/publicMarketingPaths.ts";
import { resourceArticles, type ResourceArticle } from "../src/data/resourcesArticles.ts";
import { resourceArticleDateToIsoDate } from "../src/utils/resourceArticleDates.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.join(__dirname, "..");
const OUT_FILE = path.join(FRONTEND_ROOT, "public", "sitemap.xml");
const SITE_URL = (process.env.SITEMAP_SITE_URL || "https://prime7erp.com").replace(/\/$/, "");

const STATIC_LASTMOD =
  process.env.SITEMAP_STATIC_LASTMOD?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);

function xmlEscapeUrl(url: string) {
  return url.replace(/&/g, "&amp;");
}

function urlSeoMeta(path: string, article: ResourceArticle | null) {
  let lastmod: string;
  if (path.startsWith("/resources/") && article) {
    lastmod = resourceArticleDateToIsoDate(article.date);
  } else {
    lastmod = STATIC_LASTMOD;
  }

  let priority: string;
  let changefreq: string;
  if (path === "/") {
    priority = "1.0";
    changefreq = "weekly";
  } else if (path === "/resources") {
    priority = "0.85";
    changefreq = "weekly";
  } else if (path.startsWith("/resources/")) {
    priority = "0.75";
    changefreq = "monthly";
  } else if (path.startsWith("/legal/")) {
    priority = "0.55";
    changefreq = "yearly";
  } else if (path === "/login" || path === "/signup") {
    priority = "0.5";
    changefreq = "monthly";
  } else {
    priority = "0.7";
    changefreq = "monthly";
  }

  return { lastmod, priority, changefreq };
}

function main() {
  const articleEntries = resourceArticles.map((a) => ({
    path: `/resources/${a.slug}`,
    article: a,
  }));
  const staticEntries = [...PUBLIC_MARKETING_PATHS].map((p) => ({
    path: p,
    article: null as ResourceArticle | null,
  }));

  const seen = new Set<string>();
  const entries: { path: string; article: ResourceArticle | null }[] = [];
  for (const x of staticEntries) {
    if (seen.has(x.path)) continue;
    seen.add(x.path);
    entries.push(x);
  }
  for (const x of articleEntries) {
    if (seen.has(x.path)) continue;
    seen.add(x.path);
    entries.push(x);
  }

  const locs = entries
    .map(({ path: p, article }) => {
      const loc = p === "/" ? SITE_URL : `${SITE_URL}${p}`;
      const { lastmod, priority, changefreq } = urlSeoMeta(p, article);
      return `  <url>\n    <loc>${xmlEscapeUrl(loc)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${locs}
</urlset>
`;

  fs.writeFileSync(OUT_FILE, xml, "utf8");
  console.log(`Wrote ${entries.length} URLs to ${path.relative(FRONTEND_ROOT, OUT_FILE)}`);
}

main();
