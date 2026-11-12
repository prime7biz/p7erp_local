import { describe, expect, it } from "vitest";
import { findHelpEntries, toHelpEntries } from "./helpIndex";
import { tutorialHelpIndex } from "./helpIndex.generated";
import { flattenArticles, getArticlesForAppPath, normalizeAppPath } from "./tutorialRegistry";
import { tutorialSections } from "./tutorialSections";

/** The matching rule the Help button used before the index existed (full library). */
function legacyFind(pathname: string): string[] {
  const p = normalizeAppPath(pathname).replace(/(.)\/+$/, "$1");
  return getArticlesForAppPath(tutorialSections, p)
    .filter(
      (article) =>
        p === "/app" ||
        article.relatedAppRoutes.some((route) => {
          const r = normalizeAppPath(route);
          return r !== "/app" && (p === r || p.startsWith(`${r}/`));
        }),
    )
    .map((a) => a.id);
}

describe("tutorial help index", () => {
  it("is up to date with the tutorial library (run `npm run generate:help-index`)", () => {
    expect(tutorialHelpIndex).toEqual(toHelpEntries(flattenArticles(tutorialSections)));
  });

  it("carries no article bodies, steps or media", () => {
    for (const entry of tutorialHelpIndex) {
      expect(Object.keys(entry).sort()).toEqual(
        entry.summary ? ["id", "relatedAppRoutes", "summary", "title"] : ["id", "relatedAppRoutes", "title"],
      );
    }
  });

  it("matches exactly what the full library matched for every known route", () => {
    const routes = new Set<string>(["/app", "/app/unknown-page", "/app/orders/123?tab=x#y", "/app/orders/"]);
    for (const a of flattenArticles(tutorialSections)) {
      for (const r of a.relatedAppRoutes) {
        routes.add(r);
        routes.add(`${r}/123`);
      }
    }
    for (const route of routes) {
      expect(findHelpEntries(tutorialHelpIndex, route).map((e) => e.id), route).toEqual(legacyFind(route));
    }
  });

  it("does not show generic /app guides on deeper pages", () => {
    const appOnly = tutorialHelpIndex.filter((e) => e.relatedAppRoutes.every((r) => r === "/app"));
    const ids = new Set(findHelpEntries(tutorialHelpIndex, "/app/some/deep/page").map((e) => e.id));
    for (const e of appOnly) expect(ids.has(e.id)).toBe(false);
  });
});
