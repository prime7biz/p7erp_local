/**
 * Registry helpers — tie tutorials to real routes so we can:
 * - Show “related screens” on an article
 * - Find articles to update when a route’s UI or workflow changes (see maintenance rule)
 */

import type { TutorialArticle, TutorialSection } from "./types";

export function flattenArticles(sections: TutorialSection[]): TutorialArticle[] {
  return sections.flatMap((s) => s.articles);
}

export function getArticleById(sections: TutorialSection[], id: string): TutorialArticle | undefined {
  return flattenArticles(sections).find((a) => a.id === id);
}

/** Normalized path: strip query/hash, ensure leading slash. */
export function normalizeAppPath(path: string): string {
  const base = path.split("?")[0]?.split("#")[0] ?? path;
  if (!base.startsWith("/")) return `/${base}`;
  return base;
}

/**
 * Returns articles whose `relatedAppRoutes` best match the current path
 * (longest prefix wins per article, then sort by match length).
 */
export function getArticlesForAppPath(sections: TutorialSection[], pathname: string): TutorialArticle[] {
  const path = normalizeAppPath(pathname);
  const all = flattenArticles(sections);
  const scored = all
    .map((article) => {
      let best = 0;
      for (const route of article.relatedAppRoutes) {
        const r = normalizeAppPath(route);
        if (path === r || path.startsWith(`${r}/`)) {
          best = Math.max(best, r.length);
        }
      }
      return { article, score: best };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.map((x) => x.article);
}

/** Build a map route prefix → article ids (for audits / future tooling). */
export function routeToArticleIds(sections: TutorialSection[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const a of flattenArticles(sections)) {
    for (const route of a.relatedAppRoutes) {
      const r = normalizeAppPath(route);
      const list = map.get(r) ?? [];
      list.push(a.id);
      map.set(r, list);
    }
  }
  return map;
}

/** Articles with `featured: true` (Help hub “Featured workflows”). */
export function getFeaturedArticles(sections: TutorialSection[]): TutorialArticle[] {
  return flattenArticles(sections).filter((a) => a.featured);
}
