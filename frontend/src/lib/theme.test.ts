// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyTheme, resolveTheme, setTheme, THEME_STORAGE_KEY, toggleTheme } from "./theme";

describe("light-only theme", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
    localStorage.clear();
  });

  it("ignores a stale saved dark preference", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    expect(resolveTheme()).toBe("light");
    setTheme();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it("ignores a dark system preference", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("dark"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    expect(resolveTheme()).toBe("light");
    vi.unstubAllGlobals();
  });

  it("never adds the dark class", () => {
    document.documentElement.classList.add("dark");
    applyTheme();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(toggleTheme()).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
