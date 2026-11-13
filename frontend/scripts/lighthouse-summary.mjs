/**
 * Prints a short summary of Lighthouse JSON reports (scores + lab metrics).
 * Usage: node scripts/lighthouse-summary.mjs report1.json [report2.json ...]
 * Reports come from: npx lighthouse <url> --output=json --output-path=<file>
 */
import fs from "node:fs";
import path from "node:path";

const METRICS = [
  ["first-contentful-paint", "FCP"],
  ["largest-contentful-paint", "LCP"],
  ["total-blocking-time", "TBT"],
  ["cumulative-layout-shift", "CLS"],
  ["speed-index", "Speed Index"],
];

for (const file of process.argv.slice(2)) {
  const report = JSON.parse(fs.readFileSync(file, "utf8"));
  const cats = Object.values(report.categories)
    .map((c) => `${c.title}: ${Math.round((c.score ?? 0) * 100)}`)
    .join(" | ");
  const metrics = METRICS.map(([id, label]) => `${label} ${report.audits[id]?.displayValue ?? "n/a"}`).join(" | ");
  const lcpEl = report.audits["largest-contentful-paint-element"]?.details?.items?.[0]?.items?.[0]?.node?.snippet;
  const bytes = report.audits["total-byte-weight"]?.displayValue ?? "n/a";
  console.log(`${path.basename(file)}\n  ${cats}\n  ${metrics}\n  Total bytes: ${bytes}\n  LCP element: ${lcpEl ?? "n/a"}`);
  const failedSeo = Object.values(report.categories.seo?.auditRefs ?? [])
    .map((r) => report.audits[r.id])
    .filter((a) => a && a.score !== null && a.score < 1 && a.scoreDisplayMode !== "notApplicable")
    .map((a) => a.title);
  if (failedSeo.length) console.log(`  SEO audits not passed: ${failedSeo.join("; ")}`);
}
