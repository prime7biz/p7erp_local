// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function loadAnalytics(domain: string) {
  vi.resetModules();
  vi.stubEnv("VITE_PLAUSIBLE_DOMAIN", domain);
  return import("@/lib/analytics");
}

function plausibleScripts() {
  return document.head.querySelectorAll('script[data-domain]');
}

beforeEach(() => {
  document.head.innerHTML = "";
  delete window.plausible;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Plausible analytics", () => {
  it("is off and loads nothing when VITE_PLAUSIBLE_DOMAIN is empty", async () => {
    const analytics = await loadAnalytics("");
    analytics.trackPageview("/pricing");
    analytics.trackEvent("cta_click", { cta: "book_demo" });
    expect(analytics.isAnalyticsEnabled()).toBe(false);
    expect(plausibleScripts()).toHaveLength(0);
    expect(window.plausible).toBeUndefined();
  });

  it("loads the script once and counts public pages without the query string", async () => {
    const analytics = await loadAnalytics("prime7erp.com");
    analytics.trackPageview("/pricing");
    analytics.trackPageview("/garment-costing-software");
    expect(plausibleScripts()).toHaveLength(1);
    expect(plausibleScripts()[0]?.getAttribute("data-domain")).toBe("prime7erp.com");
    const queued = window.plausible?.q ?? [];
    expect(queued).toHaveLength(2);
    expect(queued[0]).toEqual(["pageview", { u: `${window.location.origin}/pricing` }]);
  });

  it("never counts the ERP app, portals, verification links or account pages", async () => {
    const analytics = await loadAnalytics("prime7erp.com");
    for (const path of ["/app", "/app/accounts/vouchers", "/portal/customer", "/verify/document/abc", "/reset-password", "/accept-invite"]) {
      expect(analytics.isTrackedPath(path), path).toBe(false);
      analytics.trackPageview(path);
    }
    expect(plausibleScripts()).toHaveLength(0);
  });
});
