// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findHelpEntries } from "@/data/tutorials/helpIndex";
import { tutorialHelpIndex } from "@/data/tutorials/helpIndex.generated";
import { resolveHrHelpPath } from "@/components/hr/kit/hrHubs";

const flags: { value: Record<string, unknown> } = { value: {} };
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ me: { feature_flags: flags.value } }) }));

const fullLibraryLoaded = vi.fn();
vi.mock("@/data/tutorials", () => {
  fullLibraryLoaded();
  return {};
});

async function renderAt(url: string) {
  vi.useFakeTimers();
  const { PageHelpButton } = await import("./PageHelpButton");
  const utils = render(
    <MemoryRouter initialEntries={[url]}>
      <PageHelpButton />
    </MemoryRouter>,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  vi.useRealTimers();
  return utils;
}

function expectedIds(path: string, search = ""): string[] {
  return findHelpEntries(tutorialHelpIndex, resolveHrHelpPath(path, search, flags.value as never))
    .slice(0, 5)
    .map((e) => e.id);
}

describe("PageHelpButton", () => {
  beforeEach(() => {
    flags.value = {};
    fullLibraryLoaded.mockClear();
  });
  afterEach(() => cleanup());

  it("shows at most five guides for the page and never loads the full tutorial library", async () => {
    const route = tutorialHelpIndex.find((e) => findHelpEntries(tutorialHelpIndex, e.relatedAppRoutes[0] ?? "").length > 5)
      ?.relatedAppRoutes[0] ?? "/app";
    await renderAt(route);
    fireEvent.click(screen.getByRole("button", { name: "Help for this page" }));
    const links = screen.getAllByRole("link").filter((a) => a.getAttribute("href")?.startsWith("/app/tutorials/"));
    expect(links.map((a) => a.getAttribute("href"))).toEqual(expectedIds(route).map((id) => `/app/tutorials/${id}`));
    expect(links.length).toBeLessThanOrEqual(5);
    expect(fullLibraryLoaded).not.toHaveBeenCalled();
  });

  it("uses the HR hub tab (and feature flags) to pick guides", async () => {
    flags.value = { compliance_tracking_enabled: true };
    await renderAt("/app/hr/insights?tab=compliance");
    const ids = expectedIds("/app/hr/insights", "?tab=compliance");
    if (ids.length === 0) {
      expect(screen.queryByRole("button", { name: "Help for this page" })).toBeNull();
      return;
    }
    fireEvent.click(screen.getByRole("button", { name: "Help for this page" }));
    const hrefs = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"))
      .filter((h) => h?.startsWith("/app/tutorials/"));
    expect(hrefs).toEqual(ids.map((id) => `/app/tutorials/${id}`));
  });

  it("is hidden on the Help pages themselves", async () => {
    await renderAt("/app/tutorials");
    expect(screen.queryByRole("button", { name: "Help for this page" })).toBeNull();
  });

  it("is hidden when no guide matches the page", async () => {
    await renderAt("/app/zz-no-guide-here");
    expect(screen.queryByRole("button", { name: "Help for this page" })).toBeNull();
  });
});
