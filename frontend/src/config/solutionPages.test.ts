import { describe, expect, it } from "vitest";
import { LEGAL_DOC_SEGMENTS, PUBLIC_MARKETING_PATHS } from "@/config/publicMarketingPaths";
import { getSeoForPath } from "@/config/seo";
import { SOLUTION_PAGES, SOLUTION_PAGE_PATHS } from "@/config/solutionPages";
import { SOLUTION_PAGE_CONTENT } from "@/data/marketing/solutionPageContent";
import { getArticleBySlug, isIndexableArticle, resourceArticles } from "@/data/resourcesArticles";
import { getBreadcrumbItems } from "@/utils/seoBreadcrumbs";
import { getRobotsMetaContent, ROBOTS_INDEX, ROBOTS_NOINDEX } from "@/utils/seoRobots";

const indexablePaths = [
  ...PUBLIC_MARKETING_PATHS,
  ...resourceArticles.filter(isIndexableArticle).map((a) => `/resources/${a.slug}`),
];

describe("solution pages", () => {
  it("every registered page has content and every content entry is registered", () => {
    const contentPaths = SOLUTION_PAGE_CONTENT.map((c) => c.path).sort();
    expect(contentPaths).toEqual([...SOLUTION_PAGE_PATHS].sort());
  });

  it("are public, indexable and in the sitemap list", () => {
    for (const path of SOLUTION_PAGE_PATHS) {
      expect(PUBLIC_MARKETING_PATHS).toContain(path);
      expect(getRobotsMetaContent(path)).toBe(ROBOTS_INDEX);
      expect(getSeoForPath(path).title).toBe(SOLUTION_PAGES.find((p) => p.path === path)?.title);
    }
  });

  it("related links point to real public pages", () => {
    for (const page of SOLUTION_PAGE_CONTENT) {
      for (const link of page.related) {
        const article = link.to.match(/^\/resources\/(.+)$/)?.[1];
        const legal = link.to.match(/^\/legal\/(.+)$/)?.[1];
        const ok = article ? Boolean(getArticleBySlug(article)) : legal ? LEGAL_DOC_SEGMENTS.has(legal) : PUBLIC_MARKETING_PATHS.includes(link.to);
        expect(ok, `${page.path} -> ${link.to}`).toBe(true);
      }
    }
  });

  it("breadcrumbs go Home > Features > page", () => {
    const items = getBreadcrumbItems("/garment-costing-software", "https://prime7erp.com");
    expect(items?.map((i) => i.name)).toEqual(["Home", "Features", "Costing & Consumption"]);
  });
});

describe("page titles and descriptions", () => {
  it("are unique and within search result length", () => {
    const titles = new Map<string, string>();
    const descriptions = new Map<string, string>();
    for (const path of indexablePaths) {
      const { title, description } = getSeoForPath(path);
      expect(titles.get(title), `duplicate title on ${path}`).toBeUndefined();
      expect(descriptions.get(description), `duplicate description on ${path}`).toBeUndefined();
      titles.set(title, path);
      descriptions.set(description, path);
    }
    for (const page of SOLUTION_PAGES) {
      expect(page.title.length, page.path).toBeLessThanOrEqual(60);
      expect(page.description.length, page.path).toBeLessThanOrEqual(160);
    }
  });
});

describe("robots for resource articles", () => {
  it("full guides are indexable and short summaries are not", () => {
    expect(getRobotsMetaContent("/resources/how-to-choose-garments-erp-software-bangladesh")).toBe(ROBOTS_INDEX);
    expect(getRobotsMetaContent("/resources/lc-management-guide-garment-export")).toBe(ROBOTS_INDEX);
    expect(getRobotsMetaContent("/resources/wip-costing-rmg")).toBe(ROBOTS_INDEX);
    expect(getRobotsMetaContent("/resources/does-not-exist")).toBe(ROBOTS_NOINDEX);
    const summary = { ...resourceArticles[0]!, content: "A short summary of a topic." };
    expect(isIndexableArticle(summary)).toBe(false);
  });

  it("every published article is a full guide with an internal link to a public page", () => {
    for (const article of resourceArticles) {
      expect(isIndexableArticle(article), article.slug).toBe(true);
      const links = [...article.content.matchAll(/^\[[^\]]+\]\((\/[^)]*)\)$/gm)].map((m) => m[1]!);
      for (const to of links) {
        const slug = to.match(/^\/resources\/(.+)$/)?.[1];
        const ok = slug ? Boolean(getArticleBySlug(slug)) : PUBLIC_MARKETING_PATHS.includes(to);
        expect(ok, `${article.slug} -> ${to}`).toBe(true);
      }
    }
  });

  it("private areas stay noindex", () => {
    for (const path of ["/app", "/app/accounts", "/portal/customer", "/verify/document/abc", "/forgot-password"]) {
      expect(getRobotsMetaContent(path)).toBe(ROBOTS_NOINDEX);
    }
  });
});
