// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { clearFormDirty, markFormDirty } from "@/lib/unsavedChanges";

const state = vi.hoisted(() => ({ available: true, formDirty: false }));
const applyUpdate = vi.hoisted(() => vi.fn(() => true));
vi.mock("@/lib/pwa/appUpdate", () => ({
  PWA_ENABLED: true,
  applyUpdate,
  useAppUpdate: () => ({ available: state.available, version: "v2", formDirty: state.formDirty }),
}));

import { AppUpdateBanner } from "./AppUpdateBanner";

function renderApp() {
  return render(
    <MemoryRouter initialEntries={["/app"]}>
      <AppUpdateBanner />
      <Routes>
        <Route path="/app" element={<Link to="/app/orders">Orders</Link>} />
        <Route path="/app/orders" element={<p>Orders page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const form = Symbol("form");
afterEach(() => {
  cleanup();
  clearFormDirty(form);
  applyUpdate.mockClear();
  state.available = true;
  state.formDirty = false;
});

describe("AppUpdateBanner", () => {
  it("does not reload on first show, then loads the new release after the next page change", async () => {
    renderApp();
    expect(screen.getByRole("status").textContent).toMatch(/new version/);
    expect(applyUpdate).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("link", { name: "Orders" }));
    expect(screen.getByText("Orders page")).toBeTruthy();
    expect(applyUpdate).toHaveBeenCalledTimes(1);
  });

  it("never switches after a page change while a form is still dirty, and disables Reload now", async () => {
    state.formDirty = true;
    markFormDirty(form);
    renderApp();
    expect(screen.getByRole("status").textContent).toMatch(/Save your work first/);
    expect((screen.getByRole("button", { name: /reload now/i }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(screen.getByRole("link", { name: "Orders" }));
    expect(applyUpdate).not.toHaveBeenCalled();
  });

  it("does nothing on page changes when no release is waiting", async () => {
    state.available = false;
    renderApp();
    expect(screen.queryByRole("status")).toBeNull();
    await userEvent.click(screen.getByRole("link", { name: "Orders" }));
    expect(applyUpdate).not.toHaveBeenCalled();
  });
});
