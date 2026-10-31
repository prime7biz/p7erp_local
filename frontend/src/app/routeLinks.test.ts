/**
 * Dead-link guard: every hard-coded "/app/..." link in src must match a <Route path>
 * declared in AppProtectedRouter (including one level of nesting, e.g. settings/config).
 */
import { describe, expect, it } from "vitest";

const sources = import.meta.glob<string>(["/src/**/*.{ts,tsx}", "!/src/**/*.test.{ts,tsx}"], {
  query: "?raw",
  import: "default",
  eager: true,
});

function routePatterns(): string[] {
  const router = sources["/src/app/AppProtectedRouter.tsx"] ?? "";
  const paths = Array.from(router.matchAll(/<Route\s+path="([^"]+)"/g), (m) => (m[1] ?? "").replace(/^\/+|\/+$/g, ""));
  const composed = new Set<string>(paths);
  // One level of nesting (parent route with child routes, e.g. settings → config).
  for (const parent of paths) for (const child of paths) composed.add(`${parent}/${child}`);
  // A catch-all ("*" / ":x" at the root) would match every link and hide dead ones.
  return Array.from(composed).filter((p) => p && !p.startsWith("*") && !p.startsWith(":"));
}

function matches(pattern: string, target: string): boolean {
  const p = pattern.split("/");
  const t = target.split("/");
  for (let i = 0; i < p.length; i += 1) {
    const seg = p[i] ?? "";
    if (seg === "*") return true;
    if (i >= t.length) return false;
    if (seg.startsWith(":")) continue;
    if (t[i] === "__param__") return false;
    if (seg !== t[i]) return false;
  }
  return p.length === t.length;
}

function linkTargets(): { file: string; link: string }[] {
  const out: { file: string; link: string }[] = [];
  for (const [file, raw] of Object.entries(sources)) {
    // Pages build links from a file-local PREFIX (e.g. "/app/hr"); resolve it per file.
    const prefix = raw.match(/const\s+PREFIX\s*=\s*["'`]([^"'`]+)["'`]/)?.[1];
    const text = prefix ? raw.replace(/\$\{PREFIX\}/g, prefix) : raw;
    for (const m of text.matchAll(/["'`](\/app\/[^"'`\s]*)["'`]/g)) {
      const clean = (m[1] ?? "")
        .replace(/\\+$/, "") // tutorial markdown escapes the closing backtick
        .replace(/\$\{[^}]*\}/g, "__param__")
        .split(/[?#]/)[0]!
        .replace(/^\/app\/?/, "")
        .replace(/\/+$/, "");
      if (!clean || clean.startsWith("__param__") || clean.includes("*") || clean.includes("...")) continue;
      out.push({ file, link: clean });
    }
  }
  return out;
}

describe("app route links", () => {
  it("every /app/... link points at a declared route", () => {
    const patterns = routePatterns();
    // Section prefixes (sidebar highlighting, prefetch groups) are valid when some route starts with them.
    const isPrefixOfRoute = (link: string) => patterns.some((p) => p.startsWith(`${link}/`));
    const dead = linkTargets().filter(
      ({ link }) => !patterns.some((p) => matches(p, link)) && !isPrefixOfRoute(link),
    );
    const report = dead.map((d) => `${d.file}: /app/${d.link}`);
    expect(report).toEqual([]);
  });

  it("detects the dead links fixed in the wiring pass", () => {
    const patterns = routePatterns();
    // settings/* and reports/* are catch-alls inside those sections, so only top-level dead links apply here.
    for (const old of ["purchase-orders", "vendors", "vouchers", "manufacturing/production-planning"]) {
      expect(patterns.filter((p) => matches(p, old))).toEqual([]);
    }
    expect(patterns.some((p) => matches(p, "inventory/purchase-orders/x/print"))).toBe(true);
    expect(patterns.some((p) => matches(p, "settings/config"))).toBe(true);
  });
});
