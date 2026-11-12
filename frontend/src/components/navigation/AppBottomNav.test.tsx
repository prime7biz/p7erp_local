// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/app/prefetchRoutes", () => ({ prefetchSidebarRoute: () => {} }));

import { AppBottomNav } from "./AppBottomNav";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function renderNav(
  hasPermission: (key: string) => boolean,
  featureFlags: Record<string, string | boolean> = {},
  path = "/app",
  tenantType: "manufacturer" | "buying_house" | "both" = "both",
) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppBottomNav tenantType={tenantType} featureFlags={featureFlags} hasPermission={hasPermission} />
    </MemoryRouter>,
  );
}

function tabLabels(): string[] {
  const nav = screen.getByRole("navigation", { name: "Main menu" });
  return Array.from(nav.querySelectorAll("a, button")).map((el) => el.textContent ?? "");
}

const V2 = { mobile_ui_v2: true } as const;

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

  it("starts with every module closed and opens one module at a time", async () => {
    renderNav(() => true);
    await userEvent.click(screen.getByRole("button", { name: "More" }));
    const drawer = screen.getByRole("dialog", { name: "All modules" });
    const toggles = within(drawer).getAllByRole("button", { expanded: false });
    expect(toggles.length).toBeGreaterThan(3);
    expect(within(drawer).queryByRole("button", { expanded: true })).toBeNull();
    expect(within(drawer).queryByText("Trial Balance")).toBeNull();

    await userEvent.click(within(drawer).getByRole("button", { name: "Finance" }));
    expect(within(drawer).getByRole("button", { name: "Finance" }).getAttribute("aria-expanded")).toBe("true");
    expect(within(drawer).getByText("Trial Balance")).toBeTruthy();

    await userEvent.click(within(drawer).getByRole("button", { name: "Inventory" }));
    expect(within(drawer).getByRole("button", { name: "Finance" }).getAttribute("aria-expanded")).toBe("false");
    expect(within(drawer).queryByText("Trial Balance")).toBeNull();

    await userEvent.click(within(drawer).getByRole("button", { name: "Inventory" }));
    expect(within(drawer).queryByRole("button", { expanded: true })).toBeNull();
  });

  it("keeps the opened module open after the menu is closed and reopened", async () => {
    renderNav(() => true);
    const more = screen.getByRole("button", { name: "More" });
    await userEvent.click(more);
    await userEvent.click(within(screen.getByRole("dialog", { name: "All modules" })).getByRole("button", { name: "Finance" }));
    await userEvent.keyboard("{Escape}");
    await userEvent.click(more);
    const drawer = screen.getByRole("dialog", { name: "All modules" });
    expect(within(drawer).getByRole("button", { name: "Finance" }).getAttribute("aria-expanded")).toBe("true");
    expect(localStorage.getItem("p7_sidebar_open_section")).toBe("Finance");
  });

  it("marks the module of the current page, not Dashboard", async () => {
    renderNav(() => true, {}, "/app/accounts/vouchers");
    await userEvent.click(screen.getByRole("button", { name: "More" }));
    const drawer = screen.getByRole("dialog", { name: "All modules" });
    const finance = within(drawer).getByRole("button", { name: "Finance" });
    expect(within(finance).getByText("You are here")).toBeTruthy();
    expect(within(drawer).getAllByText("You are here")).toHaveLength(1);
  });

  it("opens a one-page module directly", async () => {
    renderNav(() => true);
    await userEvent.click(screen.getByRole("button", { name: "More" }));
    const drawer = screen.getByRole("dialog", { name: "All modules" });
    expect(within(drawer).getByRole("link", { name: "Dashboard" }).getAttribute("href")).toBe("/app");
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

describe("AppBottomNav with mobile_ui_v2", () => {
  it("keeps today's tabs and modules while the switch is off or not exactly true", async () => {
    const cases: Record<string, string | boolean>[] = [{}, { mobile_ui_v2: false }, { mobile_ui_v2: "true" }];
    for (const flags of cases) {
      renderNav(() => true, flags);
      expect(tabLabels()).toEqual(["Home", "Sales", "Stock", "Finance", "More"]);
      await userEvent.click(screen.getByRole("button", { name: "More" }));
      const drawer = screen.getByRole("dialog", { name: "All modules" });
      expect(within(drawer).getByRole("heading", { name: "Settings" })).toBeTruthy();
      expect(within(drawer).getByRole("heading", { name: "Reports" })).toBeTruthy();
      expect(within(drawer).queryByText("Current module")).toBeNull();
      cleanup();
    }
  });

  it("leaves Reports, AI Tools, Settings and Manage external access out of the More menu", async () => {
    renderNav(() => true, V2);
    await userEvent.click(screen.getByRole("button", { name: "More" }));
    const drawer = screen.getByRole("dialog", { name: "All modules" });
    for (const name of ["Reports", "AI Tools", "Settings"]) {
      expect(within(drawer).queryByRole("heading", { name })).toBeNull();
    }
    await userEvent.click(within(drawer).getByRole("button", { name: "Stakeholder portals" }));
    expect(within(drawer).getByText("Customer portal login")).toBeTruthy();
    expect(within(drawer).queryByText("Manage external access")).toBeNull();
    expect(within(drawer).getByRole("heading", { name: "Finance" })).toBeTruthy();
  });

  it("does not search hidden modules in the More menu filter", async () => {
    renderNav(() => true, V2);
    await userEvent.click(screen.getByRole("button", { name: "More" }));
    await userEvent.type(screen.getByLabelText("Filter modules and pages"), "user mgmt");
    const drawer = screen.getByRole("dialog", { name: "All modules" });
    expect(within(drawer).queryByText("User Mgmt")).toBeNull();
    expect(within(drawer).getByText(/No pages match/)).toBeTruthy();
  });

  it("shows Home, the first three allowed modules in a fixed order, then More", () => {
    renderNav(() => true, V2);
    expect(tabLabels()).toEqual(["Home", "Sales", "Stock", "Finance", "More"]);
  });

  it("moves Production and HR up when Sales and Finance are denied under RBAC enforcement", () => {
    renderNav((key) => key !== "merch.access" && key !== "finance.access", { ...V2, rbac_enforcement: "enforce" });
    expect(tabLabels()).toEqual(["Home", "Stock", "Production", "HR", "More"]);
  });

  it("ignores permission keys while RBAC is in shadow or off mode, like the desktop sidebar", () => {
    for (const mode of ["shadow", "off"]) {
      renderNav(() => false, { ...V2, rbac_enforcement: mode });
      expect(tabLabels()).toEqual(["Home", "Sales", "Stock", "Finance", "More"]);
      cleanup();
    }
  });

  it("shows fewer module tabs when fewer modules are allowed", () => {
    const allowOnlyHr = (key: string) => !["merch.access", "inventory.access", "finance.access", "production.access"].includes(key);
    renderNav(allowOnlyHr, { ...V2, rbac_enforcement: "enforce" });
    expect(tabLabels()).toEqual(["Home", "HR", "More"]);
  });

  it("skips Production for a buying house (tenant type), never by role name", () => {
    renderNav((key) => key !== "merch.access" && key !== "finance.access", { ...V2, rbac_enforcement: "enforce" }, "/app", "buying_house");
    expect(tabLabels()).toEqual(["Home", "Stock", "HR", "More"]);
  });

  it("puts the current module first and opens it; tapping it closes it", async () => {
    renderNav(() => true, V2, "/app/accounts/vouchers");
    await userEvent.click(screen.getByRole("button", { name: "More" }));
    const drawer = screen.getByRole("dialog", { name: "All modules" });
    expect(within(drawer).getByText("Current module")).toBeTruthy();
    expect(within(drawer).getByText("Other modules")).toBeTruthy();
    const finance = within(drawer).getByRole("button", { name: /Finance/ });
    expect(finance.getAttribute("aria-expanded")).toBe("true");
    expect(within(drawer).getByText("Trial Balance")).toBeTruthy();
    await userEvent.click(finance);
    expect(finance.getAttribute("aria-expanded")).toBe("false");
    expect(within(drawer).queryByText("Trial Balance")).toBeNull();
  });

  it("has no current module on a page whose module is hidden from the More menu", async () => {
    renderNav(() => true, V2, "/app/settings/config");
    await userEvent.click(screen.getByRole("button", { name: "More" }));
    const drawer = screen.getByRole("dialog", { name: "All modules" });
    expect(within(drawer).queryByText("Current module")).toBeNull();
    expect(within(drawer).getByText("Modules")).toBeTruthy();
    expect(within(drawer).queryByRole("button", { expanded: true })).toBeNull();
  });
});
