/**
 * Public marketing URLs included in the sitemap and post-build static HTML shells.
 * Keep in sync with `src/app/router.tsx` (exclude /app, /portal, redirects-only, and noindex utilities).
 */
export const PUBLIC_MARKETING_PATHS: readonly string[] = [
  "/",
  "/features",
  "/pricing",
  "/about",
  "/contact",
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
  "/erp-bangladesh",
  "/erp-comparison",
  "/resources",
  "/support",
  "/login",
  "/signup",
  "/sitemap",
];

/** Valid single-segment paths under /legal/... */
export const LEGAL_DOC_SEGMENTS: ReadonlySet<string> = new Set([
  "terms",
  "privacy",
  "dpa",
  "ai-disclaimer",
  "sla",
  "security-compliance",
]);
