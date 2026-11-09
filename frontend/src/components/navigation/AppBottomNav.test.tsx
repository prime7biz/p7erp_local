// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/app/prefetchRoutes", () => ({ prefetchSidebarRoute: () => {} }));

import { AppBottomNav } from "./AppBottomNav";

afterEach(() => cleanup());

function renderNav(hasPermission: (key: string) => boolean, featureFlags: Record<string, string> = {}) {
  return render(
    <MemoryRouter initialEntries={["/app"]}>
      <AppBottomNav tenantType="both" featureFlags={featureFlags} hasPermission={hasPermission} />
    </MemoryRouter>,
  );
}

describe("AppBottomNav", () => {
  it("closes the More drawer with Escape and returns focus to More", async () => {
    renderNav(() => true);
    const more = screen.getByRole("button", { name: "More" });
    await userEvent.click(more);
    expect(screen.getByRole("dialog", { name: "All modules" })).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "All modules" })).toBeNull();
    await vi.waitFor(() => expect(document.activeElement).toBe(more));
  });

  it("keeps Tab focus inside the open drawer", async () => {
    renderNav(() => true);
    await userEvent.click(screen.getByRole("button", { name: "More" }));
    const drawer = screen.getByRole("dialog", { name: "All modules" });
    const focusable = drawer.querySelectorAll<HTMLElement>("a[href], button, input");
    focusable[focusable.length - 1]!.focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(focusable[0]);
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(focusable[focusable.length - 1]);
  });

  it("hides the Finance tab, Finance section and Settings link when denied under RBAC enforcement", async () => {
    renderNav((key) => key !== "finance.access" && key !== "settings.access", { rbac_enforcement: "enforce" });
    const nav = screen.getByRole("navigation", { name: "Main menu" });
    expect(within(nav).queryByText("Finance")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "More" }));
    const drawer = screen.getByRole("dialog", { name: "All modules" });
    expect(within(drawer).queryByRole("heading", { name: "Finance" })).toBeNull();
    expect(within(drawer).queryByText("Manage external access")).toBeNull();
    expect(within(drawer).getByRole("heading", { name: "Inventory" })).toBeTruthy();
  });

  it("filters to matching pages only", async () => {
    renderNav(() => true);
    await userEvent.click(screen.getByRole("button", { name: "More" }));
    await userEvent.type(screen.getByLabelText("Filter modules and pages"), "trial balance");
    const drawer = screen.getByRole("dialog", { name: "All modules" });
    expect(within(drawer).getByText("Trial Balance")).toBeTruthy();
    expect(within(drawer).queryByText("Mobile shortcuts")).toBeNull();
    expect(within(drawer).queryByRole("heading", { name: "Inventory" })).toBeNull();
  });
});
