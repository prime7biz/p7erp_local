/**
 * Checks the SEO output of `npm run build` (run after the build): node scripts/verify-seo-build.mjs
 *
 * For every URL in dist/sitemap.xml:
 *   - dist/<path>/index.html exists with one <title>, a meta description, "index" robots,
 *     exactly one canonical equal to the sitemap URL, Open Graph + Twitter tags and valid JSON-LD
 *   - public pages (all except /login and /signup) contain the pre-rendered body with exactly one <h1>
 * Across pages: titles and descriptions are unique.
 * Internal links inside pre-rendered bodies point to an existing page file, a known app route or a static file.
 * dist/spa-fallback.html is noindex with an empty #root; robots.txt names the sitemap.
 *
 * Exit code 1 when anything fails (warnings do not fail).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, "..", "dist");
const SITE = (process.env.SITEMAP_SITE_URL || "https://prime7erp.com").replace(/\/$/, "");
/** Same list as PRERENDER_HEAD_ONLY_PATHS in src/config/publicMarketingPaths.ts. */
const HEAD_ONLY = new Set(["/login", "/signup", "/contact", "/book-demo", "/roi-calculator"]);
/** Routes that exist in the app but have no page file on purpose (noindex or behind login). */
const KNOWN_ROUTE_PREFIXES = ["/app", "/portal", "/verify/", "/install", "/account-deletion", "/forgot-password", "/resources/"];

const failures = [];
const warnings = [];
const fail = (msg) => failures.push(msg);

function read(rel) {
  const full = path.join(DIST, rel);
  return fs.existsSync(full) ? fs.readFileSync(full, "utf8") : null;
}

function fileForPath(p) {
  return p === "/" ? "index.html" : path.join(...p.slice(1).split("/"), "index.html");
}

function attr(tag, name) {
  return tag.match(new RegExp(`${name}="([^"]*)"`, "i"))?.[1] ?? null;
}

function metaContent(html, key, value) {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  const tag = tags.find((t) => attr(t, key) === value);
  return tag ? attr(tag, "content") : null;
}

function decode(s) {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

const sitemap = read("sitemap.xml");
if (!sitemap) {
  console.error("FAIL: dist/sitemap.xml missing — run npm run build first.");
  process.exit(1);
}
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decode(m[1].trim()));
if (new Set(locs).size !== locs.length) fail("sitemap.xml has duplicate URLs");

const titles = new Map();
const descriptions = new Map();
const internalLinks = new Map();

for (const loc of locs) {
  if (!loc.startsWith(SITE)) fail(`sitemap URL not on ${SITE}: ${loc}`);
  const p = loc.slice(SITE.length) || "/";
  if (/^\/(app|portal|api)(\/|$)/.test(p)) fail(`private URL in sitemap: ${loc}`);
  const html = read(fileForPath(p));
  if (!html) {
    fail(`${p}: page file ${fileForPath(p)} missing`);
    continue;
  }
  const head = html.slice(0, html.indexOf("</head>"));

  const titleTags = head.match(/<title[^>]*>([^<]*)<\/title>/gi) ?? [];
  if (titleTags.length !== 1) fail(`${p}: expected 1 <title>, found ${titleTags.length}`);
  const title = decode(titleTags[0]?.replace(/<[^>]+>/g, "") ?? "");
  if (title.length > 65) warnings.push(`${p}: title is ${title.length} characters (aim for 60 or fewer)`);
  titles.set(title, [...(titles.get(title) ?? []), p]);

  const description = metaContent(head, "name", "description");
  if (!description) fail(`${p}: meta description missing`);
  else {
    if (description.length < 70 || description.length > 170) warnings.push(`${p}: description is ${description.length} characters`);
    descriptions.set(description, [...(descriptions.get(description) ?? []), p]);
  }

  const robots = metaContent(head, "name", "robots") ?? "";
  if (!robots.startsWith("index")) fail(`${p}: robots is "${robots}", expected index`);

  const canonicals = (head.match(/<link\b[^>]*rel="canonical"[^>]*>/gi) ?? []).map((t) => attr(t, "href"));
  if (canonicals.length !== 1 || canonicals[0] !== loc) fail(`${p}: canonical ${JSON.stringify(canonicals)} should be exactly ["${loc}"]`);

  for (const key of ["og:title", "og:description", "og:image", "og:url", "og:type"]) {
    if (!metaContent(head, "property", key)) fail(`${p}: ${key} missing`);
  }
  if (metaContent(head, "property", "og:url") !== loc) fail(`${p}: og:url does not match canonical`);
  if (!metaContent(head, "name", "twitter:card")) fail(`${p}: twitter:card missing`);

  for (const m of head.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1]);
      if (!data["@context"]) fail(`${p}: JSON-LD without @context`);
    } catch (error) {
      fail(`${p}: JSON-LD does not parse (${error.message})`);
    }
  }

  if (HEAD_ONLY.has(p)) continue;
  // Swap mode (default) or hydrate mode (PRERENDER_HYDRATE=true).
  const swapStart = html.indexOf('<div data-prerendered="true"');
  const bodyStart = swapStart >= 0 ? swapStart : html.indexOf('<div id="root" data-hydrate="true">');
  if (bodyStart < 0) {
    fail(`${p}: no pre-rendered body`);
    continue;
  }
  const body = html.slice(bodyStart);
  const h1Count = (body.match(/<h1[\s>]/gi) ?? []).length;
  if (h1Count !== 1) fail(`${p}: expected 1 <h1> in the page body, found ${h1Count}`);
  if (/<script(?![^>]*application\/ld\+json)[^>]*>/i.test(body.replace(/<\/body>[\s\S]*$/, ""))) {
    fail(`${p}: pre-rendered body contains a <script> tag`);
  }
  for (const m of body.matchAll(/<a\b[^>]*href="(\/[^"#?]*)/gi)) {
    const href = m[1];
    if (!internalLinks.has(href)) internalLinks.set(href, p);
  }
}

for (const [title, pages] of titles) if (pages.length > 1) fail(`duplicate title "${title}" on ${pages.join(", ")}`);
for (const [d, pages] of descriptions) if (pages.length > 1) fail(`duplicate description on ${pages.join(", ")}: "${d.slice(0, 60)}…"`);

const redirects = new Set(["/blog", "/privacy", "/terms", "/legal"]);
for (const [href, from] of internalLinks) {
  const clean = href.length > 1 ? href.replace(/\/$/, "") : href;
  if (redirects.has(clean) || clean.startsWith("/blog/")) {
    warnings.push(`link to redirect ${clean} (from ${from}); link to the final URL instead`);
    continue;
  }
  if (read(fileForPath(clean)) || fs.existsSync(path.join(DIST, clean))) continue;
  if (KNOWN_ROUTE_PREFIXES.some((prefix) => clean.startsWith(prefix))) continue;
  fail(`broken internal link ${clean} (first seen on ${from})`);
}

const fallback = read("spa-fallback.html");
if (!fallback) fail("dist/spa-fallback.html missing");
else {
  if (!/name="robots" content="noindex/.test(fallback)) fail("spa-fallback.html is not noindex");
  if (/rel="canonical"/.test(fallback)) fail("spa-fallback.html must not have a canonical");
  if (!fallback.includes('<div id="root"></div>')) fail("spa-fallback.html #root is not empty");
}

const robotsTxt = read("robots.txt") ?? "";
if (!robotsTxt.includes(`Sitemap: ${SITE}/sitemap.xml`)) fail("robots.txt does not name the sitemap");

for (const w of warnings) console.warn(`WARN ${w}`);
if (failures.length) {
  for (const f of failures) console.error(`FAIL ${f}`);
  console.error(`verify-seo-build: ${failures.length} failure(s), ${warnings.length} warning(s) across ${locs.length} URLs`);
  process.exit(1);
}
console.log(
  `verify-seo-build: OK — ${locs.length} URLs, ${internalLinks.size} internal link targets checked, ${warnings.length} warning(s)`,
);
