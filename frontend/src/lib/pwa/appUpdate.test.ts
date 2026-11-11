// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearFormDirty, markFormDirty } from "@/lib/unsavedChanges";
import {
  APPLY_ON_RESUME_AFTER_MS,
  applyUpdate,
  fetchServedVersion,
  isDifferentRelease,
  resetAppUpdateForTests,
  shouldApplyOnResume,
} from "./appUpdate";

function fakeLocation() {
  return { assign: vi.fn(), reload: vi.fn() };
}

describe("release detection", () => {
  it("switches for a newer release and for a rollback, never for dev builds or empty answers", () => {
    expect(isDifferentRelease("v1.8.0", "v1.9.0")).toBe(true);
    expect(isDifferentRelease("v1.9.0", "v1.8.0")).toBe(true);
    expect(isDifferentRelease("v1.9.0", "v1.9.0")).toBe(false);
    expect(isDifferentRelease("dev", "v1.9.0")).toBe(false);
    expect(isDifferentRelease("v1.9.0", null)).toBe(false);
    expect(isDifferentRelease("v1.9.0", "  ")).toBe(false);
  });

  it("reads version.json without the browser cache and ignores network problems", async () => {
    const ok = vi.fn().mockResolvedValue(new Response(JSON.stringify({ version: "v2.0.0" }), { status: 200 }));
    expect(await fetchServedVersion(ok as unknown as typeof fetch)).toBe("v2.0.0");
    expect(ok).toHaveBeenCalledWith("/version.json", { cache: "no-store" });

    const missing = vi.fn().mockResolvedValue(new Response("not found", { status: 404 }));
    expect(await fetchServedVersion(missing as unknown as typeof fetch)).toBeNull();
    const offline = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await fetchServedVersion(offline as unknown as typeof fetch)).toBeNull();
    const html = vi.fn().mockResolvedValue(new Response("<html>", { status: 200 }));
    expect(await fetchServedVersion(html as unknown as typeof fetch)).toBeNull();
  });

  it("applies on resume only after a long enough break and only with clean forms", () => {
    expect(shouldApplyOnResume(APPLY_ON_RESUME_AFTER_MS, true, false)).toBe(true);
    expect(shouldApplyOnResume(APPLY_ON_RESUME_AFTER_MS - 1, true, false)).toBe(false);
    expect(shouldApplyOnResume(APPLY_ON_RESUME_AFTER_MS, true, true)).toBe(false);
    expect(shouldApplyOnResume(APPLY_ON_RESUME_AFTER_MS, false, false)).toBe(false);
  });
});

describe("applyUpdate", () => {
  const form = Symbol("form");
  afterEach(() => {
    clearFormDirty(form);
    resetAppUpdateForTests();
  });

  it("never reloads while a form has unsaved changes", () => {
    const loc = fakeLocation();
    markFormDirty(form);
    expect(applyUpdate(undefined, { location: loc, waitingWorker: null, serviceWorker: null })).toBe(false);
    expect(loc.reload).not.toHaveBeenCalled();
    expect(loc.assign).not.toHaveBeenCalled();
  });

  it("reloads once, or opens the link the user clicked, when no worker is waiting", () => {
    const loc = fakeLocation();
    expect(applyUpdate(undefined, { location: loc, waitingWorker: null, serviceWorker: null })).toBe(true);
    expect(loc.reload).toHaveBeenCalledTimes(1);
    expect(applyUpdate(undefined, { location: loc, waitingWorker: null, serviceWorker: null })).toBe(false);
    expect(loc.reload).toHaveBeenCalledTimes(1);

    resetAppUpdateForTests();
    const loc2 = fakeLocation();
    applyUpdate("http://localhost/app/orders", { location: loc2, waitingWorker: null, serviceWorker: null });
    expect(loc2.assign).toHaveBeenCalledWith("http://localhost/app/orders");
  });

  it("asks a waiting worker to take over and reloads exactly once", () => {
    const loc = fakeLocation();
    const container = new EventTarget();
    const postMessage = vi.fn();
    let timer: (() => void) | null = null;
    applyUpdate(undefined, {
      location: loc,
      waitingWorker: { postMessage } as unknown as ServiceWorker,
      serviceWorker: container as unknown as ServiceWorkerContainer,
      setTimer: (fn) => {
        timer = fn;
      },
    });
    expect(postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    expect(loc.reload).not.toHaveBeenCalled();
    container.dispatchEvent(new Event("controllerchange"));
    expect(loc.reload).toHaveBeenCalledTimes(1);
    timer!();
    expect(loc.reload).toHaveBeenCalledTimes(1);
  });

  it("still reloads if the worker never reports the change", () => {
    const loc = fakeLocation();
    let timer: (() => void) | null = null;
    applyUpdate(undefined, {
      location: loc,
      waitingWorker: { postMessage: vi.fn() } as unknown as ServiceWorker,
      serviceWorker: new EventTarget() as unknown as ServiceWorkerContainer,
      setTimer: (fn) => {
        timer = fn;
      },
    });
    timer!();
    expect(loc.reload).toHaveBeenCalledTimes(1);
  });
});
