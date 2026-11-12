/**
 * Small route -> article index for the header "Help for this page" button.
 *
 * The full tutorial library is large (article bodies, steps, media lists), so the header loads only
 * `helpIndex.generated.ts` (built from the library by `scripts/generate-tutorial-help-index.ts`).
 * The full library loads only on the Help pages.
 */
import type { TutorialArticle } from "./types";

export type TutorialHelpEntry = Pick<TutorialArticle, "id" | "title" | "summary" | "relatedAppRoutes">;

export function toHelpEntries(articles: TutorialArticle[]): TutorialHelpEntry[] {
  return articles.map((a) => ({
    id: a.id,
    title: a.title,
    ...(a.summary ? { summary: a.summary } : {}),
    relatedAppRoutes: [...a.relatedAppRoutes],
  }));
}

/** Strip query/hash and ensure a leading slash (same rule as `normalizeAppPath` in the registry). */
function normalize(path: string): string {
  const base = path.split("?")[0]?.split("#")[0] ?? path;
  return base.startsWith("/") ? base : `/${base}`;
}

/**
 * Guides for the current page, best match first. `/app` itself only matches articles that list
 * `/app`; deeper pages ignore the generic `/app` route so every page does not show the same guides.
 */
export function findHelpEntries(entries: TutorialHelpEntry[], pathname: string): TutorialHelpEntry[] {
  const path = normalize(pathname).replace(/(.)\/+$/, "$1");
  return entries
    .map((entry) => {
      let best = 0;
      let specific = false;
      for (const route of entry.relatedAppRoutes) {
        const r = normalize(route);
        if (path === r || path.startsWith(`${r}/`)) {
          best = Math.max(best, r.length);
          if (r !== "/app") specific = true;
        }
      }
      return { entry, score: best, specific };
    })
    .filter((x) => x.score > 0 && (path === "/app" || x.specific))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.entry);
}
