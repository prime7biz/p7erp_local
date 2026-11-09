// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RowActionsMenu } from "./RowActionsMenu";

function stubScreenWidth(narrow: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: narrow && query.includes("max-width"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

function Harness() {
  const [openId, setOpenId] = useState<string | number | null>(null);
  return (
    <div data-testid="table-wrapper" style={{ overflowX: "auto" }}>
      <RowActionsMenu rowId={1} openId={openId} onOpenChange={setOpenId} items={[{ key: "view", label: "View", onClick: () => {} }]} />
    </div>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("RowActionsMenu", () => {
  it("floats the menu on <body> on narrow screens so scrolling tables cannot cut it off", async () => {
    stubScreenWidth(true);
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Actions" }));
    const menu = screen.getByRole("menu");
    expect(screen.getByTestId("table-wrapper").contains(menu)).toBe(false);
    expect(menu.parentElement).toBe(document.body);
  });

  it("keeps the menu inline on desktop", async () => {
    stubScreenWidth(false);
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Actions" }));
    expect(screen.getByTestId("table-wrapper").contains(screen.getByRole("menu"))).toBe(true);
  });

  it("closes on an outside click", async () => {
    stubScreenWidth(true);
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Actions" }));
    await userEvent.click(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
