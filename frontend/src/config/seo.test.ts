import { describe, expect, it } from "vitest";
import { getSeoForPath, NOT_FOUND_SEO } from "./seo";

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
