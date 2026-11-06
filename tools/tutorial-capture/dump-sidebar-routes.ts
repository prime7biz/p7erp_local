/**
 * Writes `manifests/_sidebar.json`: one screenshot entry per sidebar link.
 * Run: `npm run routes` (from this folder).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { menuSections } from "../../frontend/src/app/sidebarConfig";

const here = path.dirname(fileURLToPath(import.meta.url));

export function routeToShotName(route: string): string {
  const slug = route.replace(/^\/app\/?/, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug || "dashboard";
}

const seen = new Set<string>();
const screenshots: { name: string; route: string; section: string; label: string }[] = [];

for (const sec of menuSections) {
  const items = [...sec.items, ...(sec.subsections ?? []).flatMap((s) => s.items)];
  if (sec.directLink) items.unshift({ href: sec.directLink, label: sec.section } as (typeof items)[number]);
  for (const item of items) {
    const route = item.href.split("?")[0];
    if (seen.has(route)) continue;
    seen.add(route);
    screenshots.push({ name: routeToShotName(route), route, section: sec.section, label: item.label });
  }
}

fs.mkdirSync(path.join(here, "manifests"), { recursive: true });
fs.writeFileSync(
  path.join(here, "manifests", "_sidebar.json"),
  `${JSON.stringify({ screenshots }, null, 2)}\n`,
);
console.log(`Wrote ${screenshots.length} sidebar routes to manifests/_sidebar.json`);
