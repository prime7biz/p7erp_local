// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useNavigate } from "react-router-dom";

vi.mock("@/app/prefetchRoutes", () => ({ prefetchSidebarRoute: () => {} }));

import { Sidebar } from "./Sidebar";
import { saveOpenMenuSection } from "./menuOpenSection";

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

let goTo: (path: string) => void = () => {};
function NavigateProbe() {
  goTo = useNavigate();
  return null;
}

function renderSidebar(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <NavigateProbe />
      <Sidebar
        tenantType="both"
        tenantName="Test Co"
        companyCode="TEST"
        userName="Test User"
        userId={1}
        isCollapsed={false}
        onToggleCollapse={() => {}}
        enabledOptionalProductionUnits={[]}
        featureFlags={{}}
        hasPermission={() => true}
      />
    </MemoryRouter>,
  );
}

const sectionButton = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) });
const expanded = () => screen.queryAllByRole("button", { expanded: true });

describe("Sidebar modules", () => {
  it("starts with every module closed after sign-in, even on a module page", () => {
    renderSidebar("/app/accounts/vouchers");
    expect(expanded()).toHaveLength(0);
  });

  it("opens one module at a time and remembers it", async () => {
    renderSidebar("/app");
    await userEvent.click(sectionButton("Finance"));
    expect(sectionButton("Finance").getAttribute("aria-expanded")).toBe("true");
    await userEvent.click(sectionButton("Inventory"));
    expect(sectionButton("Inventory").getAttribute("aria-expanded")).toBe("true");
    expect(sectionButton("Finance").getAttribute("aria-expanded")).toBe("false");
    expect(localStorage.getItem("p7_sidebar_open_section")).toBe("Inventory");
  });

  it("keeps the opened module open when the user goes to a page in another module", async () => {
    renderSidebar("/app");
    await userEvent.click(sectionButton("Inventory"));
    goTo("/app/accounts/vouchers");
    await vi.waitFor(() => expect(sectionButton("Inventory").getAttribute("aria-expanded")).toBe("true"));
    expect(sectionButton("Finance").getAttribute("aria-expanded")).toBe("false");
  });

  it("restores the remembered module after a page reload", () => {
    saveOpenMenuSection("Finance");
    renderSidebar("/app");
    expect(sectionButton("Finance").getAttribute("aria-expanded")).toBe("true");
  });
});
