// @vitest-environment jsdom
import { Suspense } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { lazyRoute, preloadRoutes, renderedRouteIds, resetRenderedRouteIds } from "@/app/lazyRoute";
import { readRouteChunkIds } from "@/lib/prerenderSnapshot";

function Greeting({ name }: { name: string }) {
  return <h1>Hello {name}</h1>;
}

describe("lazyRoute", () => {
  it("behaves like React.lazy when not preloaded (fallback first, then the page)", async () => {
    const Page = lazyRoute("TestPageA", () => Promise.resolve(Greeting));
    render(
      <Suspense fallback={<p>Loading…</p>}>
        <Page name="A" />
      </Suspense>,
    );
    expect(screen.getByText("Loading…")).toBeTruthy();
    expect(await screen.findByText("Hello A")).toBeTruthy();
  });

  it("renders in one pass after preloadRoutes (what hydration needs)", async () => {
    const Page = lazyRoute("TestPageB", () => Promise.resolve(Greeting));
    await preloadRoutes(["TestPageB", "UnknownId"]);
    render(
      <Suspense fallback={<p>Loading…</p>}>
        <Page name="B" />
      </Suspense>,
    );
    expect(screen.queryByText("Loading…")).toBeNull();
    expect(screen.getByText("Hello B")).toBeTruthy();
  });

  it("records which routes a render used (build time)", async () => {
    const Page = lazyRoute("TestPageC", () => Promise.resolve(Greeting));
    await preloadRoutes(["TestPageC"]);
    resetRenderedRouteIds();
    render(<Page name="C" />);
    expect(renderedRouteIds()).toEqual(["TestPageC"]);
  });

  it("a failed preload does not throw; React.lazy reports the error later", async () => {
    lazyRoute("TestPageD", () => Promise.reject(new Error("chunk missing")));
    await expect(preloadRoutes(["TestPageD"])).resolves.toBeUndefined();
  });
});

describe("readRouteChunkIds", () => {
  it("reads the ids written by the build and ignores bad data", () => {
    document.head.innerHTML = '<script type="application/json" id="p7-route-chunks">["Landing","PublicLayout",3]</script>';
    expect(readRouteChunkIds()).toEqual(["Landing", "PublicLayout"]);
    document.head.innerHTML = '<script type="application/json" id="p7-route-chunks">not json</script>';
    expect(readRouteChunkIds()).toEqual([]);
    document.head.innerHTML = "";
    expect(readRouteChunkIds()).toEqual([]);
  });
});
