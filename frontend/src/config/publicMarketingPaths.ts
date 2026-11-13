import { SOLUTION_PAGE_PATHS } from "@/config/solutionPages";

/**
 * Public marketing URLs included in the sitemap and post-build static HTML shells.
 * Keep in sync with `src/app/router.tsx` (exclude /app, /portal, redirects-only, and noindex utilities).
 * Solution pages (/erp-bangladesh, /garment-costing-software, ...) come from src/config/solutionPages.ts.
 */
export const PUBLIC_MARKETING_PATHS: readonly string[] = [
  "/",
  "/features",
  "/pricing",
  "/about",
  "/contact",
  "/book-demo",
  "/roi-calculator",
  "/garments-erp",
  "/buying-house-erp",
  "/legal/terms",
  "/legal/privacy",
  "/legal/dpa",
  "/legal/ai-disclaimer",
  "/legal/sla",
  "/legal/security-compliance",
  "/trust-center",
  "/how-it-works",
  "/security",
  "/erp-comparison",
  "/resources",
  "/support",
  "/login",
  "/signup",
  "/sitemap",
  ...SOLUTION_PAGE_PATHS,
];

/**
 * Indexable pages that get head tags only, no pre-rendered body (scripts/inject-static-route-html.ts):
 * pages outside the public layout, and pages with forms (text typed before the app takes over would be lost).
 * Keep in sync with HEAD_ONLY in scripts/verify-seo-build.mjs.
 */
export const PRERENDER_HEAD_ONLY_PATHS: ReadonlySet<string> = new Set([
  "/login",
  "/signup",
  "/contact",
  "/book-demo",
  "/roi-calculator",
]);

/** Valid single-segment paths under /legal/... */
export const LEGAL_DOC_SEGMENTS: ReadonlySet<string> = new Set([
  "terms",
  "privacy",
  "dpa",
  "ai-disclaimer",
  "sla",
  "security-compliance",
]);
