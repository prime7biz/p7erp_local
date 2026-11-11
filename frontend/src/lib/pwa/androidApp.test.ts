import { describe, expect, it } from "vitest";
import { safeDownloadUrl, safePlayStoreUrl } from "./androidApp";

describe("Android download addresses", () => {
  it("accepts our own paths and https addresses only", () => {
    expect(safeDownloadUrl("/downloads/prime7erp-android.apk")).toBe("/downloads/prime7erp-android.apk");
    expect(safeDownloadUrl(" https://prime7erp.com/downloads/a.apk ")).toBe("https://prime7erp.com/downloads/a.apk");
    expect(safeDownloadUrl("//evil.example/a.apk")).toBe("");
    expect(safeDownloadUrl("http://prime7erp.com/a.apk")).toBe("");
    expect(safeDownloadUrl("javascript:alert(1)")).toBe("");
    expect(safeDownloadUrl(undefined)).toBe("");
  });

  it("accepts only Google Play for the Play button", () => {
    expect(safePlayStoreUrl("https://play.google.com/store/apps/details?id=com.prime7erp.app")).toBe(
      "https://play.google.com/store/apps/details?id=com.prime7erp.app",
    );
    expect(safePlayStoreUrl("https://play.google.com.evil.example/x")).toBe("");
    expect(safePlayStoreUrl("https://example.com/")).toBe("");
    expect(safePlayStoreUrl("")).toBe("");
  });
});
