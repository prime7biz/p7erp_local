/**
 * After `vite build`, writes route-specific index.html copies under dist/<path>/index.html
 * so Nginx `try_files $uri $uri/ /index.html` serves correct <title> and meta in the first response.
 *
 * Only paths with indexable robots are written (see getRobotsMetaContent).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PUBLIC_MARKETING_PATHS } from "../src/config/publicMarketingPaths.ts";
import { getSeoForPath } from "../src/config/seo.ts";
import { resourceArticles } from "../src/data/resourcesArticles.ts";
import { getRobotsMetaContent, ROBOTS_NOINDEX } from "../src/utils/seoRobots.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.join(__dirname, "..");

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildShell(template: string, pathname: string): string {
  const meta = getSeoForPath(pathname);
  const robots = getRobotsMetaContent(pathname);
  const rawSite = process.env.SITEMAP_SITE_URL || process.env.VITE_SITE_URL || "https://prime7erp.com";
  const siteUrl = rawSite.replace(/\/$/, "");
  const canonicalUrl = `${siteUrl}${pathname === "/" ? "" : pathname}`;

  let html = template;
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(meta.title)}</title>`);
  html = html.replace(
    /<meta name="description" content="[^"]*" \/>/,
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
  );
  html = html.replace(
    /<meta name="robots" content="[^"]*" \/>/,
    `<meta name="robots" content="${escapeHtml(robots)}" />`,
  );
  const canonTag = `    <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />`;
  if (/<link rel="canonical"[^>]*>/i.test(html)) {
    html = html.replace(/<link rel="canonical"[^>]*>\s*/i, `${canonTag}\n`);
  } else {
    html = html.replace("</head>", `${canonTag}\n  </head>`);
  }
  return html;
}

function writeShell(distRoot: string, urlPath: string, html: string) {
  const rel =
    urlPath === "/"
      ? "index.html"
      : `${urlPath.slice(1).split("/").join(path.sep)}${path.sep}index.html`;
  const full = path.join(distRoot, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, html, "utf8");
}

function main() {
  const distRoot = path.join(FRONTEND_ROOT, "dist");
  const templatePath = path.join(distRoot, "index.html");
  if (!fs.existsSync(templatePath)) {
    console.error("inject-static-route-html: dist/index.html missing — run vite build first.");
    process.exit(1);
  }
  const template = fs.readFileSync(templatePath, "utf8");

  const articlePaths = resourceArticles.map((a) => `/resources/${a.slug}`);
  const allPaths = [...new Set([...PUBLIC_MARKETING_PATHS, ...articlePaths])];

  let n = 0;
  for (const p of allPaths) {
    if (getRobotsMetaContent(p) === ROBOTS_NOINDEX) continue;
    const html = buildShell(template, p);
    writeShell(distRoot, p, html);
    n++;
  }
  console.log(`inject-static-route-html: wrote ${n} static HTML shells under dist/`);
}

main();
