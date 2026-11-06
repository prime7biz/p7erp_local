import { describe, expect, it } from "vitest";
import { safeHref, safeInternalPath } from "./safeUrl";

describe("safeHref", () => {
  it("keeps normal links", () => {
    expect(safeHref("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(safeHref("http://example.com")).toBe("http://example.com");
    expect(safeHref("mailto:a@b.com")).toBe("mailto:a@b.com");
    expect(safeHref("tel:+8801700000000")).toBe("tel:+8801700000000");
    expect(safeHref("/app/orders")).toBe("/app/orders");
    expect(safeHref("#section")).toBe("#section");
  });

  it("blocks script and unknown schemes", () => {
    expect(safeHref("javascript:alert(1)")).toBeUndefined();
    expect(safeHref("  JavaScript:alert(1)")).toBeUndefined();
    expect(safeHref("java\tscript:alert(1)")).toBeUndefined();
    expect(safeHref("data:text/html,<script>")).toBeUndefined();
    expect(safeHref("vbscript:x")).toBeUndefined();
    expect(safeHref("//evil.com")).toBeUndefined();
    expect(safeHref("")).toBeUndefined();
    expect(safeHref(null)).toBeUndefined();
  });

  it("optionally upgrades bare domains", () => {
    expect(safeHref("example.com")).toBeUndefined();
    expect(safeHref("example.com", { assumeHttps: true })).toBe("https://example.com");
    expect(safeHref("www.example.co.uk/about", { assumeHttps: true })).toBe("https://www.example.co.uk/about");
    expect(safeHref("not a url", { assumeHttps: true })).toBeUndefined();
  });
});

describe("safeInternalPath", () => {
  it("allows only same-site paths", () => {
    expect(safeInternalPath("/app/orders?x=1")).toBe("/app/orders?x=1");
    expect(safeInternalPath("//evil.com")).toBeNull();
    expect(safeInternalPath("/\\evil.com")).toBeNull();
    expect(safeInternalPath("https://evil.com")).toBeNull();
    expect(safeInternalPath(null)).toBeNull();
  });
});
