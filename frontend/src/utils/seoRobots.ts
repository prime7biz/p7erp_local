import { LEGAL_DOC_SEGMENTS, PUBLIC_MARKETING_PATHS } from "@/config/publicMarketingPaths";
import { getArticleBySlug } from "@/data/resourcesArticles";

/** Shown in <meta name="robots"> for every route so crawlers get a clear signal after JS runs. */
export const ROBOTS_INDEX =
  "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";
export const ROBOTS_NOINDEX = "noindex, nofollow";

const PUBLIC_MARKETING_SET = new Set(PUBLIC_MARKETING_PATHS);

const NOINDEX_EXACT = new Set([
  "/forgot-password",
  "/reset-password",
  "/accept-invite",
  "/verify/proforma",
]);

/**
 * Private or low-value URLs: keep out of the index so crawl budget focuses on marketing/content.
 * Unknown paths (true 404) are noindex. Public marketing, resources articles, /login, and /signup stay indexable.
 */
export function getRobotsMetaContent(pathname: string): string {
  if (pathname.startsWith("/app")) return ROBOTS_NOINDEX;
  if (pathname.startsWith("/portal")) return ROBOTS_NOINDEX;
  if (NOINDEX_EXACT.has(pathname)) return ROBOTS_NOINDEX;

  const resourceMatch = pathname.match(/^\/resources\/([^/]+)$/);
  if (resourceMatch?.[1]) {
    const article = getArticleBySlug(resourceMatch[1]);
    return article ? ROBOTS_INDEX : ROBOTS_NOINDEX;
  }

  if (pathname === "/resources") return ROBOTS_INDEX;

  if (pathname.startsWith("/legal/")) {
    const seg = pathname.slice("/legal/".length);
    return LEGAL_DOC_SEGMENTS.has(seg) ? ROBOTS_INDEX : ROBOTS_NOINDEX;
  }

  if (PUBLIC_MARKETING_SET.has(pathname)) return ROBOTS_INDEX;

  return ROBOTS_NOINDEX;
}
