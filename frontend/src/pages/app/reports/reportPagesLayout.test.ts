import { describe, expect, it } from "vitest";

/** Source of every report page (RC-11 / RC-20 layout guard). */
const pages = import.meta.glob("./*Page.tsx", { query: "?raw", import: "default", eager: true }) as Record<
  string,
  string
>;

describe("report pages layout", () => {
  it("found the report pages", () => {
    expect(Object.keys(pages).length).toBeGreaterThanOrEqual(15);
  });

  it.each(Object.entries(pages))("%s uses the shared page header", (_name, src) => {
    expect(src).toContain("<AppPageHeader");
    expect(src).not.toMatch(/<h1[\s>]/);
  });

  it.each(Object.entries(pages))("%s lets wide tables scroll on phones", (_name, src) => {
    // A table inside an overflow-hidden box is cut off on narrow screens.
    const clipped = /className="[^"]*\boverflow-hidden\b[^"]*">\s*(\{[\s\S]{0,600}?)?<table/.test(src);
    expect(clipped).toBe(false);
  });
});
