/**
 * Warn if Landing / Login pages reference public assets that are missing.
 * Usage: npx tsx scripts/verify-public-assets.ts
 *        npm run check:public-assets
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "..");
const publicRoot = path.join(frontendRoot, "public");

const PAGES = [
  "src/pages/Landing.tsx",
  "src/pages/Login.tsx",
  "src/pages/UnifiedLoginPage.tsx",
] as const;

/** Match src="/images/..." and src="/demo-..." string literals. */
const ASSET_RE = /src=["'](\/(?:images\/[^"']+|demo-[^"']+))["']/g;

const missing: { page: string; asset: string }[] = [];
const checked = new Set<string>();

for (const rel of PAGES) {
  const filePath = path.join(frontendRoot, rel);
  if (!fs.existsSync(filePath)) {
    console.warn(`[verify-public-assets] skip missing page: ${rel}`);
    continue;
  }
  const source = fs.readFileSync(filePath, "utf8");
  let match: RegExpExecArray | null;
  while ((match = ASSET_RE.exec(source)) !== null) {
    const assetPath = match[1];
    if (checked.has(assetPath)) continue;
    checked.add(assetPath);
    const onDisk = path.join(publicRoot, assetPath.replace(/^\//, ""));
    if (!fs.existsSync(onDisk)) {
      missing.push({ page: rel, asset: assetPath });
    }
  }
}

if (missing.length === 0) {
  console.log(`[verify-public-assets] OK — ${checked.size} asset(s) found under public/`);
} else {
  console.warn(`[verify-public-assets] ${missing.length} missing public asset(s):`);
  for (const row of missing) {
    console.warn(`  - ${row.asset} (referenced from ${row.page})`);
  }
}
