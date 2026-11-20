// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PartyLedgersPage } from "./PartyLedgersPage";

afterEach(() => cleanup());

const h = vi.hoisted(() => ({
  api: {
    listPartyLedgers: vi.fn(async () => ({
      total: 1,
      items: [
        {
          id: 9, party_name: "Acme Ltd", party_type: "CUSTOMER", ledger_account_number: "1", ledger_account_name: "AR",
          current_balance: "10", current_balance_type: "DR", credit_limit: null, available_credit: null, overdue_amount: "0",
        },
      ],
    })),
  },
}));
vi.mock("@/api/client", async (orig) => ({ ...(await orig<typeof import("@/api/client")>()), api: h.api }));

describe("PartyLedgersPage", () => {
  it("shows View and Statement in the row Actions menu", async () => {
    render(
      <MemoryRouter>
        <PartyLedgersPage />
      </MemoryRouter>,
    );
    await screen.findByText("Acme Ltd");
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    expect(screen.getByRole("menuitem", { name: "View" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Statement" })).toBeTruthy();
  });
});
