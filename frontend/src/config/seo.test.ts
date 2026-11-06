import { describe, expect, it } from "vitest";
import { PUBLIC_MARKETING_PATHS } from "./publicMarketingPaths";
import { getSeoForPath, NOT_FOUND_SEO, SEO_BY_PATH } from "./seo";

describe("getSeoForPath", () => {
  it("gives every public auth route its own title instead of 'Page not found'", () => {
    for (const path of ["/login", "/signup", "/forgot-password", "/reset-password", "/accept-invite", "/verify/proforma"]) {
      const meta = getSeoForPath(path);
      expect(meta).not.toEqual(NOT_FOUND_SEO);
      expect(meta.title).toMatch(/Prime7 ERP$/);
    }
  });

  it("still returns the not-found meta for unknown paths", () => {
    expect(getSeoForPath("/definitely-not-a-page")).toEqual(NOT_FOUND_SEO);
  });
});

describe("public marketing page SEO", () => {
  it("defines explicit meta for every page in the sitemap", () => {
    expect(PUBLIC_MARKETING_PATHS.filter((path) => !SEO_BY_PATH[path])).toEqual([]);
  });

  const pages = PUBLIC_MARKETING_PATHS.flatMap((path) => (SEO_BY_PATH[path] ? [{ path, meta: SEO_BY_PATH[path] }] : []));

  it("keeps titles short enough to show in full in search results", () => {
    expect(pages.filter((p) => p.meta.title.length > 65).map((p) => `${p.path} (${p.meta.title.length})`)).toEqual([]);
  });

  it("keeps descriptions between 70 and 165 characters", () => {
    const bad = pages.filter((p) => p.meta.description.length < 70 || p.meta.description.length > 165);
    expect(bad.map((p) => `${p.path} (${p.meta.description.length})`)).toEqual([]);
  });

  it("gives every page a unique title and description", () => {
    const titles = pages.map((p) => p.meta.title);
    const descriptions = pages.map((p) => p.meta.description);
    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });
});
