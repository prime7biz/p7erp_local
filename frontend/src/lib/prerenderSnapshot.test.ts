// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  isPrerenderedPagePending,
  prepareAppContainer,
  revealApp,
  shouldHydrate,
  startedFromPrerenderedHtml,
} from "@/lib/prerenderSnapshot";

function root(html: string): HTMLElement {
  const el = document.createElement("div");
  el.id = "root";
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  revealApp();
  document.body.innerHTML = "";
});

describe("prepareAppContainer", () => {
  it("renders into #root itself when there is no pre-rendered page (app, portal, auth)", () => {
    const el = root("");
    expect(prepareAppContainer(el)).toBe(el);
    expect(isPrerenderedPagePending()).toBe(false);
  });

  it("keeps the pre-rendered page visible and gives React a hidden container", () => {
    const el = root('<div data-prerendered="true"><main><h1>Pricing</h1></main></div>');
    const container = prepareAppContainer(el);
    expect(container).not.toBe(el);
    expect(container.style.display).toBe("none");
    expect(el.querySelector("h1")?.textContent).toBe("Pricing");
    expect(isPrerenderedPagePending()).toBe(true);
  });

  it("revealApp shows the app and removes the pre-rendered copy", () => {
    const el = root('<div data-prerendered="true"><h1>Pricing</h1></div>');
    const container = prepareAppContainer(el);
    container.innerHTML = "<h1>Pricing (React)</h1>";
    revealApp();
    expect(container.style.display).toBe("contents");
    expect(el.querySelector("[data-prerendered]")).toBeNull();
    expect(el.querySelectorAll("h1")).toHaveLength(1);
    expect(isPrerenderedPagePending()).toBe(false);
  });

  it("swap mode counts as a page that started from pre-rendered HTML", () => {
    prepareAppContainer(root('<div data-prerendered="true"><h1>Pricing</h1></div>'));
    expect(startedFromPrerenderedHtml()).toBe(true);
  });

  it("ignores markup that was not written by the build", () => {
    const el = root("<div><h1>Other</h1></div>");
    expect(prepareAppContainer(el)).toBe(el);
    const blank = root('<div data-prerendered="true">  </div>');
    expect(prepareAppContainer(blank)).toBe(blank);
    expect(isPrerenderedPagePending()).toBe(false);
  });
});

describe("shouldHydrate (PRERENDER_HYDRATE mode)", () => {
  it("is false for app pages and for swap-mode pages", () => {
    expect(shouldHydrate(root(""))).toBe(false);
    expect(shouldHydrate(root('<div data-prerendered="true"><h1>x</h1></div>'))).toBe(false);
  });

  it("is false when the marker is there but #root is empty", () => {
    const el = root("");
    el.setAttribute("data-hydrate", "true");
    expect(shouldHydrate(el)).toBe(false);
  });

  it("is true for a full pre-rendered tree and marks the load as pre-rendered", () => {
    const el = root('<div class="public-site"><h1>Pricing</h1></div>');
    el.setAttribute("data-hydrate", "true");
    expect(shouldHydrate(el)).toBe(true);
    expect(startedFromPrerenderedHtml()).toBe(true);
  });
});
