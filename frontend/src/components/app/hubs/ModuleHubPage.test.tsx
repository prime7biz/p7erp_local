// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { Banknote } from "lucide-react";
import { useEmbeddedPage } from "@/components/app/embeddedPage";
import { HubLegacyRedirect } from "./HubLegacyRedirect";
import { ModuleHubPage } from "./ModuleHubPage";
import type { Hub, HubFeatureFlags } from "./types";

/** A tab page like the real ones: it shows its own title only when it is not embedded. */
function makePage(title: string) {
  return function Page() {
    const embedded = useEmbeddedPage();
    return (
      <div>
        {!embedded ? <h1>{title} own title</h1> : null}
        <p>{title} content</p>
      </div>
    );
  };
}

const hub: Hub = {
  id: "demo",
  path: "demo/hub",
  label: "Demo hub",
  description: "A demo hub.",
  icon: Banknote,
  tabs: [
    { id: "one", label: "One", legacyPath: "demo/one", load: () => Promise.resolve({ default: makePage("One") }) },
    {
      id: "two",
      label: "Two",
      legacyPath: "demo/two",
      load: () => Promise.resolve({ default: makePage("Two") }),
      requiresFeatureFlag: "two_flag",
    },
    {
      id: "three",
      label: "Three",
      legacyPath: "demo/three",
      load: () => Promise.resolve({ default: makePage("Three") }),
      permissionKey: "demo.three",
    },
  ],
};

const LAZY_WAIT = { timeout: 5000 };

function ShowLocation() {
  const loc = useLocation();
  return <output data-testid="location">{`${loc.pathname}${loc.search}${loc.hash}`}</output>;
}

function renderHub(url: string, flags: HubFeatureFlags = {}, canAccess?: (k: string) => boolean) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path="/app/demo/hub"
          element={<ModuleHubPage hub={hub} featureFlags={flags} canAccess={canAccess} />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => cleanup());

describe("ModuleHubPage", { timeout: 15000 }, () => {
  it("shows one hub heading and the open tab without the page's own title", async () => {
    renderHub("/app/demo/hub?tab=three");
    expect(await screen.findByText("Three content", {}, LAZY_WAIT)).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual(["Demo hub"]);
    expect(screen.queryByText("Three own title")).toBeNull();
    expect(screen.getByRole("link", { name: "Three" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Three" }).getAttribute("href")).toBe("/app/demo/hub?tab=three");
  });

  it("opens the first tab for a missing or unknown tab", async () => {
    renderHub("/app/demo/hub?tab=nope");
    expect(await screen.findByText("One content", {}, LAZY_WAIT)).toBeTruthy();
    expect(screen.getByRole("link", { name: "One" }).getAttribute("aria-current")).toBe("page");
  });

  it("hides a strict-flag tab and does not open it from the URL", async () => {
    renderHub("/app/demo/hub?tab=two");
    expect(screen.queryByRole("link", { name: "Two" })).toBeNull();
    expect(await screen.findByText("One content", {}, LAZY_WAIT)).toBeTruthy();
    expect(screen.queryByText("Two content")).toBeNull();
  });

  it("shows the flagged tab when its flag is true", async () => {
    renderHub("/app/demo/hub?tab=two", { two_flag: true });
    expect(await screen.findByText("Two content", {}, LAZY_WAIT)).toBeTruthy();
  });

  it("does not expose a tab the user may not open", async () => {
    renderHub("/app/demo/hub?tab=three", {}, (k) => k !== "demo.three");
    expect(screen.queryByRole("link", { name: "Three" })).toBeNull();
    expect(await screen.findByText("One content", {}, LAZY_WAIT)).toBeTruthy();
    expect(screen.queryByText("Three content")).toBeNull();
  });

  it("shows the fallback when no tab is visible", () => {
    const onlyFlagged: Hub = { ...hub, tabs: [hub.tabs[1]!] };
    render(
      <MemoryRouter initialEntries={["/app/demo/hub"]}>
        <Routes>
          <Route path="/app/demo/hub" element={<ModuleHubPage hub={onlyFlagged} featureFlags={{}} />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("Nothing to show here for your company yet.")).toBeTruthy();
  });

  it("renders header quick actions for the open tab", async () => {
    render(
      <MemoryRouter initialEntries={["/app/demo/hub?tab=one"]}>
        <Routes>
          <Route
            path="/app/demo/hub"
            element={
              <ModuleHubPage
                hub={hub}
                featureFlags={{}}
                headerActions={(id) => <span>actions for {id}</span>}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText("actions for one", {}, LAZY_WAIT)).toBeTruthy();
  });
});

describe("HubLegacyRedirect", () => {
  function renderRedirect(url: string, from: string) {
    return render(
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path={`/app/${from}`} element={<HubLegacyRedirect hubs={[hub]} from={from} fallback="/app/demo/home" />} />
          <Route path="*" element={<ShowLocation />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("opens the hub tab and keeps the query string and #hash", () => {
    renderRedirect("/app/demo/one?party=4#list", "demo/one");
    expect(screen.getByTestId("location").textContent).toBe("/app/demo/hub?party=4&tab=one#list");
  });

  it("replaces an existing tab parameter with the page's own tab", () => {
    renderRedirect("/app/demo/two?tab=old", "demo/two");
    expect(screen.getByTestId("location").textContent).toBe("/app/demo/hub?tab=two");
  });

  it("sends an unknown old path to the fallback", () => {
    renderRedirect("/app/demo/zzz", "demo/zzz");
    expect(screen.getByTestId("location").textContent).toBe("/app/demo/home");
  });
});
