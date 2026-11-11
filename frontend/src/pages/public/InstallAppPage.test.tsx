// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const links = vi.hoisted(() => ({ apk: "", play: "" }));
vi.mock("@/lib/pwa/appUpdate", () => ({ PWA_ENABLED: true }));
vi.mock("@/lib/pwa/androidApp", () => ({
  get ANDROID_APK_URL() {
    return links.apk;
  },
  get PLAY_STORE_URL() {
    return links.play;
  },
}));

import { AndroidApkLink, InstallAppLink } from "@/components/public/InstallAppLink";
import { captureInstallPrompt } from "@/lib/pwa/installPrompt";
import { InstallAppPage } from "./InstallAppPage";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const APK = "/downloads/prime7erp-android.apk";
const PLAY = "https://play.google.com/store/apps/details?id=com.prime7erp.app";

function setUserAgent(ua: string) {
  vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(ua);
  vi.spyOn(window.navigator, "platform", "get").mockReturnValue(ua.includes("iPhone") ? "iPhone" : "Linux armv8l");
}

function setStandalone(on: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: on }) as unknown as typeof window.matchMedia;
}

function renderPage() {
  return render(
    <MemoryRouter>
      <InstallAppPage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  links.apk = "";
  links.play = "";
});

describe("install links", () => {
  it("show on Android, hide on iPhone and inside the installed app", () => {
    setStandalone(false);
    setUserAgent(ANDROID);
    links.apk = APK;
    const { unmount } = render(
      <MemoryRouter>
        <InstallAppLink from="test" className="x" />
        <AndroidApkLink from="test" className="x" />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: /get the mobile app/i }).getAttribute("href")).toBe("/install");
    const apk = screen.getByRole("link", { name: /download android app/i });
    expect(apk.getAttribute("href")).toBe(APK);
    expect(apk.hasAttribute("download")).toBe(true);
    unmount();

    setUserAgent(IPHONE);
    const iphone = render(
      <MemoryRouter>
        <InstallAppLink from="test" className="x" />
        <AndroidApkLink from="test" className="x" />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("link")).toBeNull();
    iphone.unmount();

    setUserAgent(ANDROID);
    setStandalone(true);
    render(
      <MemoryRouter>
        <InstallAppLink from="test" className="x" />
        <AndroidApkLink from="test" className="x" />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("hides the APK link until a download address is configured", () => {
    setStandalone(false);
    setUserAgent(ANDROID);
    render(
      <MemoryRouter>
        <AndroidApkLink from="test" className="x" />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("link", { name: /download android app/i })).toBeNull();
  });
});

describe("InstallAppPage (Android only)", () => {
  it("on iPhone shows only a short note, no install steps or downloads", () => {
    setStandalone(false);
    setUserAgent(IPHONE);
    links.apk = APK;
    renderPage();
    expect(screen.getByRole("note").textContent).toMatch(/available for Android/);
    expect(screen.queryAllByRole("heading", { level: 2 })).toHaveLength(0);
    expect(screen.queryByRole("link", { name: /download android app/i })).toBeNull();
  });

  it("offers Google Play, the APK and Chrome when both addresses are set", () => {
    setStandalone(false);
    setUserAgent(ANDROID);
    links.apk = APK;
    links.play = PLAY;
    renderPage();
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["Google Play", "Download the app file (APK)", "Or install from Chrome"]);
    expect(screen.getByRole("link", { name: /get it on google play/i }).getAttribute("href")).toBe(PLAY);
    expect(screen.getByRole("link", { name: /download android app/i }).getAttribute("href")).toBe(APK);
  });

  it("shows only the Chrome install before any download exists, with the real install dialog when allowed", async () => {
    setStandalone(false);
    setUserAgent(ANDROID);
    const target = new EventTarget();
    captureInstallPrompt(target as unknown as Window);
    renderPage();
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Install from Chrome"]);

    const prompt = vi.fn().mockResolvedValue(undefined);
    target.dispatchEvent(
      Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
        prompt,
        userChoice: Promise.resolve({ outcome: "dismissed" as const }),
      }),
    );
    const button = await screen.findByRole("button", { name: /install prime7 erp/i });
    button.click();
    await vi.waitFor(() => expect(prompt).toHaveBeenCalledTimes(1));
  });

  it("says so when it already runs as the installed app", () => {
    setStandalone(true);
    setUserAgent(ANDROID);
    renderPage();
    expect(screen.getByRole("status").textContent).toMatch(/using the Prime7 ERP app/);
  });
});
