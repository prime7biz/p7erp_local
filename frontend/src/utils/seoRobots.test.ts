import { describe, expect, it } from "vitest";
import { getRobotsMetaContent, ROBOTS_INDEX, ROBOTS_NOINDEX } from "./seoRobots";

describe("getRobotsMetaContent", () => {
  it("uses noindex for app and portal", () => {
    expect(getRobotsMetaContent("/app/inventory")).toBe(ROBOTS_NOINDEX);
    expect(getRobotsMetaContent("/portal/customer")).toBe(ROBOTS_NOINDEX);
  });

  it("uses noindex for auth utilities and verify", () => {
    expect(getRobotsMetaContent("/forgot-password")).toBe(ROBOTS_NOINDEX);
    expect(getRobotsMetaContent("/reset-password")).toBe(ROBOTS_NOINDEX);
    expect(getRobotsMetaContent("/accept-invite")).toBe(ROBOTS_NOINDEX);
    expect(getRobotsMetaContent("/verify/proforma")).toBe(ROBOTS_NOINDEX);
  });

  it("uses index for marketing and resources index", () => {
    expect(getRobotsMetaContent("/features")).toBe(ROBOTS_INDEX);
    expect(getRobotsMetaContent("/resources")).toBe(ROBOTS_INDEX);
    expect(getRobotsMetaContent("/login")).toBe(ROBOTS_INDEX);
  });

  it("uses index for known resource articles", () => {
    expect(getRobotsMetaContent("/resources/consumption-control-garments")).toBe(ROBOTS_INDEX);
  });

  it("uses noindex for unknown resource slugs", () => {
    expect(getRobotsMetaContent("/resources/not-a-real-slug-xyz")).toBe(ROBOTS_NOINDEX);
  });

  it("uses noindex for unknown paths (404)", () => {
    expect(getRobotsMetaContent("/this-route-does-not-exist")).toBe(ROBOTS_NOINDEX);
  });
});
