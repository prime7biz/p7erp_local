// @vitest-environment jsdom
import "./domMatchers";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { envelope } from "./statementTestFixtures";

const api = vi.hoisted(() => ({ drillGroup: vi.fn(), drillLedger: vi.fn(), drillCashFlow: vi.fn() }));
vi.mock("@/api/financeStatements", () => ({ financeStatementsApi: api }));

import { DrillPanel, VOUCHER_PAGE_SIZE, voucherHref } from "./DrillPanel";

const amounts = (o: Partial<Record<string, string>> = {}) => ({
  opening: "0.0000", debit: "0.0000", credit: "0.0000", closing: "0.0000", opening_dr_cr: "", closing_dr_cr: "", ...o,
});

function voucherRows(count: number, start = 0) {
  return Array.from({ length: count }, (_, i) => ({
    voucher_id: 100 + start + i, voucher_number: `JV-${start + i + 1}`, voucher_type: "Journal",
    voucher_date: "2026-08-01", description: "Test", debit: "10.0000", credit: "0.0000", running_balance: "10.0000",
  }));
}

function ledgerPage(offset: number, rows: number, total: number) {
  return {
    ...envelope("drill_ledger"), account_id: 7, account_name: "Cash in hand", group_id: 1,
    opening: "0.0000", period_debit: "10.0000", period_credit: "0.0000", closing: "10.0000",
    total_vouchers: total, limit: VOUCHER_PAGE_SIZE, offset, rows: voucherRows(rows, offset),
  };
}

beforeEach(() => {
  api.drillGroup.mockReset();
  api.drillLedger.mockReset();
  api.drillCashFlow.mockReset();
});
afterEach(cleanup);

function open(target: Parameters<typeof DrillPanel>[0]["target"], onClose = vi.fn()) {
  render(
    <MemoryRouter>
      <DrillPanel target={target} from="2026-07-01" to="2027-06-30" fiscalYear={2026} onClose={onClose} />
    </MemoryRouter>,
  );
  return onClose;
}

describe("DrillPanel", () => {
  it("renders nothing without a target", () => {
    open(null);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("goes group -> ledger -> vouchers and back", async () => {
    api.drillGroup.mockResolvedValue({
      ...envelope("drill_group"), group_id: 1, group_name: "Cash-in-hand",
      rows: [{ row_type: "ledger", id: 7, name: "Cash in hand", statement_class: "CASH_IN_HAND", ...amounts({ debit: "10.0000", closing: "10.0000" }) }],
      total: amounts({ debit: "10.0000", closing: "10.0000" }),
    });
    api.drillLedger.mockResolvedValue(ledgerPage(0, 2, 2));
    open({ kind: "group", id: 1, name: "Cash-in-hand" });

    fireEvent.click(await screen.findByRole("button", { name: "Cash in hand" }));
    expect(await screen.findByText("JV-1")).toBeInTheDocument();
    expect(api.drillLedger).toHaveBeenCalledWith(7, expect.objectContaining({ from_date: "2026-07-01", to_date: "2027-06-30", offset: 0, limit: VOUCHER_PAGE_SIZE }));

    fireEvent.click(screen.getByRole("button", { name: "Back one level" }));
    expect(await screen.findByText("Total")).toBeInTheDocument();
  });

  it("links each voucher to the voucher detail page", async () => {
    api.drillLedger.mockResolvedValue(ledgerPage(0, 2, 2));
    open({ kind: "ledger", id: 7, name: "Cash in hand" });
    const link = await screen.findByRole("link", { name: "JV-1" });
    expect(link).toHaveAttribute("href", "/app/accounts/vouchers/100");
    expect(voucherHref(5)).toBe("/app/accounts/vouchers/5");
  });

  it("pages through vouchers with Next and Previous", async () => {
    api.drillLedger.mockImplementation((_id: number, q: { offset: number }) =>
      Promise.resolve(q.offset === 0 ? ledgerPage(0, VOUCHER_PAGE_SIZE, 60) : ledgerPage(VOUCHER_PAGE_SIZE, 10, 60)),
    );
    open({ kind: "ledger", id: 7, name: "Cash in hand" });
    expect(await screen.findByText(`1–${VOUCHER_PAGE_SIZE} of 60`)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText(`${VOUCHER_PAGE_SIZE + 1}–60 of 60`)).toBeInTheDocument();
    expect(api.drillLedger).toHaveBeenLastCalledWith(7, expect.objectContaining({ offset: VOUCHER_PAGE_SIZE }));
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    await waitFor(() => expect(api.drillLedger).toHaveBeenLastCalledWith(7, expect.objectContaining({ offset: 0 })));
  });

  it("starts a cash-flow month at its cash and bank ledgers and uses the month's dates for a ledger", async () => {
    api.drillCashFlow.mockResolvedValue({
      ...envelope("drill_cash"), month: "2026-07", inflow: "50.0000", outflow: "25.0000", nett_flow: "25.0000",
      contra_excluded: "5.0000", ledgers: [{ account_id: 9, name: "City Bank", debit: "50.0000", credit: "25.0000" }],
      total_debit: "55.0000", total_credit: "30.0000",
    });
    api.drillLedger.mockResolvedValue(ledgerPage(0, 1, 1));
    open({ kind: "cash-month", month: "2026-07", label: "Jul 2026" });
    expect(api.drillCashFlow).toBeDefined();
    fireEvent.click(await screen.findByRole("button", { name: "City Bank" }));
    await screen.findByText("JV-1");
    expect(api.drillCashFlow).toHaveBeenCalledWith("2026-07", 2026);
    expect(api.drillLedger).toHaveBeenCalledWith(9, expect.objectContaining({ from_date: "2026-07-01", to_date: "2026-07-31" }));
  });

  it("closes with the button and with Escape", async () => {
    api.drillLedger.mockResolvedValue(ledgerPage(0, 1, 1));
    const onClose = open({ kind: "ledger", id: 7, name: "Cash in hand" });
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Close drill-down" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("shows an error message when a level fails", async () => {
    api.drillGroup.mockRejectedValue(new Error("Group not found"));
    open({ kind: "group", id: 1, name: "Gone" });
    expect(await screen.findByRole("alert")).toHaveTextContent("Group not found");
  });
});
