import { describe, expect, it } from "vitest";
import { isGuardedNavigation } from "./useUnsavedChangesGuard";

const here = "https://erp.test/app/hr/employees/new";
const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };

describe("isGuardedNavigation", () => {
  it("asks before in-app links that leave the page (e.g. the sidebar)", () => {
    expect(isGuardedNavigation({ href: "/app/hr/employees" }, click, here)).toBe(true);
    expect(isGuardedNavigation({ href: "/app/hr/employees/new?x=1" }, click, here)).toBe(true);
  });

  it("does not ask for same-page, new-tab, download or external links", () => {
    expect(isGuardedNavigation({ href: "/app/hr/employees/new" }, click, here)).toBe(false);
    expect(isGuardedNavigation({ href: "#section" }, click, here)).toBe(false);
    expect(isGuardedNavigation({ href: "/app/hr", target: "_blank" }, click, here)).toBe(false);
    expect(isGuardedNavigation({ href: "/files/x.pdf", download: true }, click, here)).toBe(false);
    expect(isGuardedNavigation({ href: "https://example.com/" }, click, here)).toBe(false);
    expect(isGuardedNavigation({ href: "/app/hr" }, { ...click, ctrlKey: true }, here)).toBe(false);
    expect(isGuardedNavigation({ href: "/app/hr" }, { ...click, button: 1 }, here)).toBe(false);
  });
});
