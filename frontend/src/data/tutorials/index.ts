export type { TutorialArticle, TutorialImageAsset, TutorialInfographic, TutorialSection } from "./types";
export { tutorialSections } from "./tutorialSections";
export {
  flattenArticles,
  getArticleById,
  getArticlesForAppPath,
  getFeaturedArticles,
  normalizeAppPath,
  routeToArticleIds,
} from "./tutorialRegistry";
export { getSectionForArticle } from "./tutorialArticleEnrich";

import { tutorialSections } from "./tutorialSections";
import { flattenArticles } from "./tutorialRegistry";

export function searchTutorialArticles(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return flattenArticles(tutorialSections);
  return flattenArticles(tutorialSections).filter((a) => {
    if (a.title.toLowerCase().includes(q)) return true;
    if (a.summary?.toLowerCase().includes(q)) return true;
    if (a.tags.some((t) => t.toLowerCase().includes(q))) return true;
    if (a.keywords?.some((k) => k.toLowerCase().includes(q))) return true;
    if (a.content.toLowerCase().includes(q)) return true;
    return false;
  });
}
