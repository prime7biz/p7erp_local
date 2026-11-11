// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { captureInstallPrompt, detectInstallPlatform, isIosOtherBrowser, promptInstall } from "./installPrompt";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const WINDOWS_EDGE = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Edg/130.0";

describe("install platform", () => {
  it("tells iPhone, iPad, Android and desktop apart", () => {
    expect(detectInstallPlatform({ userAgent: IPHONE_SAFARI, platform: "iPhone", maxTouchPoints: 5 })).toBe("ios");
    expect(detectInstallPlatform({ userAgent: "Mozilla/5.0 (Macintosh)", platform: "MacIntel", maxTouchPoints: 5 })).toBe("ios");
    expect(detectInstallPlatform({ userAgent: ANDROID_CHROME, platform: "Linux armv8l", maxTouchPoints: 5 })).toBe("android");
    expect(detectInstallPlatform({ userAgent: WINDOWS_EDGE, platform: "Win32", maxTouchPoints: 0 })).toBe("desktop");
  });

  it("spots other browsers on iPhone so we can suggest Safari", () => {
    expect(isIosOtherBrowser(IPHONE_CHROME)).toBe(true);
    expect(isIosOtherBrowser(IPHONE_SAFARI)).toBe(false);
  });
});

describe("install prompt", () => {
  it("keeps Chrome's install offer and shows it only once after a tap", async () => {
    const target = new EventTarget();
    captureInstallPrompt(target as unknown as Window);
    expect(await promptInstall()).toBe("unavailable");

    const prompt = vi.fn().mockResolvedValue(undefined);
    const offer = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: "accepted" as const }),
    });
    target.dispatchEvent(offer);
    expect(offer.defaultPrevented).toBe(true);

    expect(await promptInstall()).toBe("accepted");
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(await promptInstall()).toBe("unavailable");
  });
});
