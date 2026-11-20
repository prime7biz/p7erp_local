// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PostDatedRegisterPage } from "./PostDatedRegisterPage";

afterEach(() => cleanup());

const h = vi.hoisted(() => ({
  api: {
    listPostDatedRegister: vi.fn(async () => ({
      rows: [{ id: 4, voucher_number: "PD-4", voucher_date: "2026-12-01", amount: "5", days_until_active: 3, voucher_type: "PAYMENT", status: "DRAFT" }],
    })),
    activateDuePostDated: vi.fn(),
  },
}));
vi.mock("@/api/client", async (orig) => ({ ...(await orig<typeof import("@/api/client")>()), api: h.api }));

describe("PostDatedRegisterPage", () => {
  it("offers Edit voucher in the Actions menu and keeps Activate due", async () => {
    render(
      <MemoryRouter>
        <PostDatedRegisterPage />
      </MemoryRouter>,
    );
    await screen.findByText("PD-4");
    expect(screen.getByRole("button", { name: "Activate due" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    expect(screen.getByRole("menuitem", { name: "Edit voucher" })).toBeTruthy();
  });
});
