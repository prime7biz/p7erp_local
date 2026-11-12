import { describe, expect, it } from "vitest";

/**
 * RC-20 ratchet: pages that still use old UI patterns. The ceilings only go down; lower them when a
 * module batch is modernised (shared page header, ConfirmDialog instead of browser popups, no dark:).
 */
const pages = import.meta.glob("./**/*Page.tsx", { query: "?raw", import: "default", eager: true }) as Record<
  string,
  string
>;

const entries = Object.entries(pages).filter(([path]) => !path.includes(".test."));

function count(pred: (src: string, path: string) => boolean): string[] {
  return entries.filter(([path, src]) => pred(src, path)).map(([path]) => path);
}

describe("UI convention budget", () => {
  it("raw <h1> titles instead of the shared page header do not grow", () => {
    const raw = count((src) => /<h1[\s>]/.test(src) && !/<(AppPageHeader|HrPageHeader|PageHeader)\b/.test(src));
    expect(raw.length).toBeLessThanOrEqual(113);
  });

  it("no browser alert/confirm popups in app pages outside HR", () => {
    const popups = count(
      (src, path) => !path.includes("/hr/") && /window\.(confirm|alert)\(|(?<![\w.])(alert|confirm)\(\s*["'`]/.test(src),
    );
    expect(popups).toEqual([]);
  });

  it("no dark-mode classes on the light-only app pages", () => {
    expect(count((src) => /\bdark:/.test(src))).toEqual([]);
  });
});
