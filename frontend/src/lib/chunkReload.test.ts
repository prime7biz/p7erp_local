// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { isChunkLoadError, reloadOnceForNewVersion } from "./chunkReload";
import { clearFormDirty, isAnyFormDirty, markFormDirty } from "./unsavedChanges";

describe("reloadOnceForNewVersion", () => {
  const form = Symbol("form");
  afterEach(() => {
    clearFormDirty(form);
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("does not reload while a form has unsaved changes, and keeps the one-time reload for later", () => {
    const reload = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, reload } as Location);
    markFormDirty(form);
    expect(isAnyFormDirty()).toBe(true);
    expect(reloadOnceForNewVersion()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("p7_chunk_reload_done")).toBeNull();

    clearFormDirty(form);
    expect(reloadOnceForNewVersion()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(reloadOnceForNewVersion()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe("isChunkLoadError", () => {
  it("recognises stale-chunk errors from Chrome, Firefox and Safari", () => {
    expect(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: https://x/assets/A-1.js"))).toBe(true);
    expect(isChunkLoadError(new TypeError("error loading dynamically imported module"))).toBe(true);
    expect(isChunkLoadError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isChunkLoadError(new Error("Unable to preload CSS for /assets/x.css"))).toBe(true);
  });

  it("ignores normal errors", () => {
    expect(isChunkLoadError(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });
});
