// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isAppleMobileDevice, openOrSaveBlob, saveBlob } from "./fileSave";

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36";

function stubNavigator(overrides: Record<string, unknown>) {
  vi.stubGlobal("navigator", { userAgent: ANDROID_UA, platform: "Linux", maxTouchPoints: 5, ...overrides });
}

describe("saveBlob", () => {
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    URL.createObjectURL = vi.fn(() => "blob:test");
    URL.revokeObjectURL = vi.fn();
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    clickSpy.mockRestore();
  });

  it("downloads with the given filename and revokes the URL later, not immediately", async () => {
    stubNavigator({});
    let downloadName = "";
    clickSpy.mockImplementation(function (this: HTMLAnchorElement) {
      downloadName = this.download;
    });
    const result = await saveBlob(new Blob(["a,b"], { type: "text/csv" }), "report_2026.csv");
    expect(result).toBe("downloaded");
    expect(downloadName).toBe("report_2026.csv");
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
  });

  it("uses the share sheet on iPhone when files can be shared", async () => {
    const share = vi.fn(() => Promise.resolve());
    stubNavigator({ userAgent: IPHONE_UA, platform: "iPhone", canShare: () => true, share });
    const result = await saveBlob(new Blob(["x"], { type: "application/pdf" }), "slip.pdf");
    expect(result).toBe("shared");
    expect(share).toHaveBeenCalledTimes(1);
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it("reports cancelled when the user closes the share sheet", async () => {
    const share = vi.fn(() => Promise.reject(Object.assign(new Error("cancel"), { name: "AbortError" })));
    stubNavigator({ userAgent: IPHONE_UA, platform: "iPhone", canShare: () => true, share });
    expect(await saveBlob(new Blob(["x"]), "a.csv")).toBe("cancelled");
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it("falls back to a download when sharing is not allowed", async () => {
    const share = vi.fn(() => Promise.reject(Object.assign(new Error("no gesture"), { name: "NotAllowedError" })));
    stubNavigator({ userAgent: IPHONE_UA, platform: "iPhone", canShare: () => true, share });
    expect(await saveBlob(new Blob(["x"]), "a.csv")).toBe("downloaded");
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("falls back to a download on iPhone without file sharing", async () => {
    stubNavigator({ userAgent: IPHONE_UA, platform: "iPhone", canShare: () => false, share: vi.fn() });
    expect(await saveBlob(new Blob(["x"]), "a.xlsx")).toBe("downloaded");
  });

  it("does not use the share sheet on Android", async () => {
    const share = vi.fn(() => Promise.resolve());
    stubNavigator({ canShare: () => true, share });
    expect(await saveBlob(new Blob(["x"]), "a.csv")).toBe("downloaded");
    expect(share).not.toHaveBeenCalled();
  });
});

describe("openOrSaveBlob", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("opens a PDF in a new tab and revokes the link later", async () => {
    vi.useFakeTimers();
    stubNavigator({});
    URL.createObjectURL = vi.fn(() => "blob:pdf");
    URL.revokeObjectURL = vi.fn();
    const win = { opener: {} as unknown };
    const open = vi.fn(() => win);
    vi.stubGlobal("open", open);
    expect(await openOrSaveBlob(new Blob(["%PDF"], { type: "application/pdf" }), "slip.pdf")).toBe("opened");
    expect(open).toHaveBeenCalledWith("blob:pdf", "_blank");
    expect(win.opener).toBeNull();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:pdf");
  });

  it("uses the share sheet for PDFs on iPhone instead of a pop-up", async () => {
    const share = vi.fn(() => Promise.resolve());
    stubNavigator({ userAgent: IPHONE_UA, platform: "iPhone", canShare: () => true, share });
    const open = vi.fn();
    vi.stubGlobal("open", open);
    expect(await openOrSaveBlob(new Blob(["%PDF"], { type: "application/pdf" }), "slip.pdf")).toBe("shared");
    expect(open).not.toHaveBeenCalled();
  });

  it("saves the PDF when the pop-up is blocked", async () => {
    stubNavigator({});
    URL.createObjectURL = vi.fn(() => "blob:pdf");
    URL.revokeObjectURL = vi.fn();
    vi.stubGlobal("open", vi.fn(() => null));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    expect(await openOrSaveBlob(new Blob(["%PDF"], { type: "application/pdf" }), "slip.pdf")).toBe("downloaded");
    click.mockRestore();
  });
});

describe("isAppleMobileDevice", () => {
  it("detects iPhone and touch iPads, not Android or desktop Macs", () => {
    expect(isAppleMobileDevice({ userAgent: IPHONE_UA, platform: "iPhone", maxTouchPoints: 5 })).toBe(true);
    expect(isAppleMobileDevice({ userAgent: "Mozilla/5.0 (Macintosh)", platform: "MacIntel", maxTouchPoints: 5 })).toBe(true);
    expect(isAppleMobileDevice({ userAgent: "Mozilla/5.0 (Macintosh)", platform: "MacIntel", maxTouchPoints: 0 })).toBe(false);
    expect(isAppleMobileDevice({ userAgent: ANDROID_UA, platform: "Linux", maxTouchPoints: 5 })).toBe(false);
  });
});
