import { describe, expect, it } from "vitest";
import { resourceArticleDateToIsoDate, resourceArticleDateToIsoDateTime } from "./resourceArticleDates";

describe("resourceArticleDateToIsoDate", () => {
  it("parses long-form English month dates", () => {
    const iso = resourceArticleDateToIsoDate("January 15, 2026");
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(iso.endsWith("-15")).toBe(true);
  });
});

describe("resourceArticleDateToIsoDateTime", () => {
  it("uses noon UTC on the same calendar day as iso date", () => {
    const s = resourceArticleDateToIsoDateTime("January 15, 2026");
    expect(s).toMatch(/^2026-01-15T12:00:00\.000Z$/);
  });
});
