/**
 * Validates frontend/public/sitemap.xml: well-formed locs, no /app/ URLs.
 * Usage: node scripts/validate-sitemap.mjs
 * Optional: SITEMAP_SITE_URL=https://prime7erp.com node scripts/validate-sitemap.mjs --fetch
 *   (checks live deployment; requires network)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITEMAP_PATH = path.join(__dirname, "..", "public", "sitemap.xml");

function readLocalSitemap() {
  if (!fs.existsSync(SITEMAP_PATH)) {
    console.error("Missing public/sitemap.xml — run: npm run prebuild or npx tsx scripts/generate-sitemap.ts");
    process.exit(1);
  }
  return fs.readFileSync(SITEMAP_PATH, "utf8");
}

function parseLocs(xml) {
  const locs = [];
  const re = /<loc>([^<]*)<\/loc>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    locs.push(m[1].trim().replace(/&amp;/g, "&"));
  }
  return locs;
}

async function main() {
  const xml = readLocalSitemap();
  const locs = parseLocs(xml);
  if (locs.length === 0) {
    console.error("No <loc> entries found in sitemap.");
    process.exit(1);
  }

  const appUrls = locs.filter((u) => u.includes("/app"));
  if (appUrls.length > 0) {
    console.error("FAIL: /app/ URLs must not appear in sitemap:");
    appUrls.forEach((u) => console.error(`  ${u}`));
    process.exit(1);
  }

  const forbidden = ["/portal/", "/verify/proforma", "/forgot-password", "/reset-password", "/accept-invite"];
  const bad = locs.filter((u) => forbidden.some((f) => u.includes(f)));
  if (bad.length > 0) {
    console.error("FAIL: noindex / private URLs must not appear in sitemap:");
    bad.forEach((u) => console.error(`  ${u}`));
    process.exit(1);
  }

  console.log(`OK: ${locs.length} URLs, no /app/ or private URLs.`);

  if (process.argv.includes("--fetch")) {
    const base = (process.env.SITEMAP_SITE_URL || "https://prime7erp.com").replace(/\/$/, "");
    const sample = locs.slice(0, 15);
    console.log(`Fetching sample (${sample.length} URLs) from ${base}...`);
    for (const url of sample) {
      try {
        const res = await fetch(url, { method: "HEAD", redirect: "follow" });
        const ok = res.ok || res.status === 405;
        if (!ok) console.warn(`  WARN ${res.status} ${url}`);
      } catch (e) {
        console.warn(`  WARN ${url}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }
}

main();
