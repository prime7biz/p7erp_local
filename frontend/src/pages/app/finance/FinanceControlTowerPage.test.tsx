// @vitest-environment jsdom
import "@/components/finance/statements/domMatchers";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { card, CT_ME, exceptionList, tower } from "@/components/finance/control/controlTestFixtures";

const h = vi.hoisted(() => ({
  me: {} as Record<string, unknown>,
  api: { getControlTower: vi.fn(), getExceptions: vi.fn(), listOrderProfit: vi.fn(), getProfitability: vi.fn() },
}));

vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ me: h.me }) }));
vi.mock("@/api/financeControl", () => ({ financeControlApi: h.api }));

import { FinanceControlTowerPage } from "./FinanceControlTowerPage";

const GRN = card("GRN_NOT_BILLED", { label: "GRNs not billed", severity: "medium", count: 3, amount: "1813863870.2600", oldest_date: "2026-10-01" });
const CASH = card("NEGATIVE_CASH", { label: "Cash ledgers with a credit balance", severity: "high", count: 0 });
const VOUCHERS = card("VOUCHERS_PENDING_APPROVAL", { label: "Vouchers waiting for approval", severity: "medium", count: 2, amount: "500.0000", oldest_date: "2026-11-01" });

function renderPage(initial = "/app/finance/home") {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <FinanceControlTowerPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  h.me = { ...CT_ME };
  for (const fn of Object.values(h.api)) fn.mockReset();
  h.api.getControlTower.mockResolvedValue(tower([GRN, CASH, VOUCHERS]));
});
afterEach(cleanup);

describe("Finance Control Tower page", () => {
  it("renders a card for each check with severity, count, lakh/crore amount and oldest date", async () => {
    renderPage();
    const grn = await screen.findByTestId("card-GRN_NOT_BILLED");
    expect(grn).toHaveTextContent("GRNs not billed");
    expect(grn).toHaveTextContent("Medium");
    expect(screen.getByTestId("count-GRN_NOT_BILLED")).toHaveTextContent("3");
    expect(screen.getByTestId("amount-GRN_NOT_BILLED")).toHaveTextContent("BDT 1,81,38,63,870.26");
    expect(grn).toHaveTextContent("Oldest 2026-10-01");
    expect(screen.getByTestId("card-NEGATIVE_CASH")).toHaveTextContent("High");
  });

  it("shows cards with count 0 muted", async () => {
    renderPage();
    await screen.findByTestId("card-GRN_NOT_BILLED");
    expect(screen.getByTestId("card-NEGATIVE_CASH")).toHaveAttribute("data-muted", "true");
    expect(screen.getByTestId("card-NEGATIVE_CASH")).toHaveTextContent("All clear");
    expect(screen.getByTestId("card-GRN_NOT_BILLED")).toHaveAttribute("data-muted", "false");
  });

  it("asks the API for the chosen severity", async () => {
    renderPage();
    await screen.findByTestId("card-GRN_NOT_BILLED");
    expect(h.api.getControlTower).toHaveBeenLastCalledWith(expect.objectContaining({ severity: "all" }));
    h.api.getControlTower.mockResolvedValue(tower([CASH], { severity: "high" }));
    fireEvent.change(screen.getByLabelText("Severity"), { target: { value: "high" } });
    await waitFor(() => expect(h.api.getControlTower).toHaveBeenLastCalledWith(expect.objectContaining({ severity: "high" })));
    await waitFor(() => expect(screen.queryByTestId("card-GRN_NOT_BILLED")).toBeNull());
    expect(screen.getByTestId("card-NEGATIVE_CASH")).toBeInTheDocument();
  });

  it("opens the list behind a card; the list total and amount equal the card", async () => {
    h.api.getExceptions.mockResolvedValue(
      exceptionList(VOUCHERS, [
        { id: 41, reference: "JV-0041", date: "2026-11-01", party: "Rent", amount: "300.0000", details: { status: "SUBMITTED", age_days: 11 } },
        { id: 42, reference: "JV-0042", date: "2026-11-02", party: "Fuel", amount: "200.0000", details: {} },
      ]),
    );
    renderPage();
    fireEvent.click(await screen.findByTestId("card-VOUCHERS_PENDING_APPROVAL"));
    const dialog = await screen.findByRole("dialog", { name: /Exceptions: Vouchers waiting for approval/ });
    await within(dialog).findByText("JV-0041");
    expect(h.api.getExceptions).toHaveBeenCalledWith("VOUCHERS_PENDING_APPROVAL", expect.objectContaining({ limit: 25, offset: 0 }));
    expect(within(dialog).getByTestId("exception-total")).toHaveTextContent("2");
    expect(within(dialog).getByTestId("exception-amount")).toHaveTextContent("500.00");
    expect(screen.getByTestId("count-VOUCHERS_PENDING_APPROVAL")).toHaveTextContent("2");
    expect(screen.getByTestId("amount-VOUCHERS_PENDING_APPROVAL")).toHaveTextContent("500.00");
    // A voucher row opens the voucher page.
    expect(within(dialog).getByRole("link", { name: "JV-0041" })).toHaveAttribute("href", "/app/accounts/vouchers/41");
    expect(within(dialog).queryByRole("alert")).toBeNull();
  });

  it("leaves a GRN row as plain text because the app has no GRN page", async () => {
    h.api.getExceptions.mockResolvedValue(
      exceptionList(GRN, [{ id: 9, reference: "GRN-009", date: "2026-10-01", party: "Fabric Ltd", amount: "100.0000", details: {} }], { total: 3, amount: "1813863870.2600" }),
    );
    renderPage();
    fireEvent.click(await screen.findByTestId("card-GRN_NOT_BILLED"));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("GRN-009");
    expect(within(dialog).queryByRole("link", { name: "GRN-009" })).toBeNull();
  });

  it("pages through a long list 25 rows at a time", async () => {
    const big = card("NEGATIVE_STOCK", { label: "Items with negative stock", severity: "high", count: 30, amount: "10.0000" });
    h.api.getControlTower.mockResolvedValue(tower([big]));
    const rows = (start: number) =>
      Array.from({ length: start === 0 ? 25 : 5 }, (_, i) => ({ id: start + i + 1, reference: `ITM-${start + i + 1}`, amount: "1.0000", details: {} }));
    h.api.getExceptions.mockImplementation((_code: string, q: { offset: number }) => Promise.resolve(exceptionList(big, rows(q.offset), { offset: q.offset })));
    renderPage();
    fireEvent.click(await screen.findByTestId("card-NEGATIVE_STOCK"));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("ITM-1");
    expect(within(dialog).getByRole("button", { name: "Previous" })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }));
    await within(dialog).findByText("ITM-26");
    expect(h.api.getExceptions).toHaveBeenLastCalledWith("NEGATIVE_STOCK", expect.objectContaining({ offset: 25 }));
    expect(within(dialog).getByRole("button", { name: "Next" })).toBeDisabled();
    // A stock item row opens its own page.
    expect(within(dialog).getByRole("link", { name: "ITM-26" })).toHaveAttribute("href", "/app/inventory/stock-items/26");
  });

  it("shows the card note and a row's currency note as warnings, not as a grey detail", async () => {
    const AP = card("AP_OVERDUE", {
      label: "Payables overdue",
      severity: "high",
      count: 1,
      amount: "900.0000",
      note: "1 foreign-currency document(s) have no exchange rate and are counted at rate 1 (see currency_note).",
    });
    h.api.getControlTower.mockResolvedValue(tower([AP, CASH]));
    h.api.getExceptions.mockResolvedValue(
      exceptionList(AP, [
        {
          id: 5,
          reference: "VB-005",
          date: "2026-10-20",
          party: "Zipper Co",
          amount: "900.0000",
          details: { age_days: 23, currency_note: "USD bill without an exchange rate: counted at rate 1." },
        },
      ]),
    );
    renderPage();
    expect(await screen.findByTestId("note-AP_OVERDUE")).toHaveTextContent("counted at rate 1");
    expect(screen.queryByTestId("note-NEGATIVE_CASH")).toBeNull();
    fireEvent.click(screen.getByTestId("card-AP_OVERDUE"));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("VB-005");
    expect(within(dialog).getByTestId("exception-note")).toHaveTextContent("counted at rate 1");
    expect(within(dialog).getByTestId("row-currency-note")).toHaveTextContent("USD bill without an exchange rate: counted at rate 1.");
    expect(within(dialog).getByText("Age (days): 23")).toBeInTheDocument();
    expect(within(dialog).queryByText(/currency note:/)).toBeNull();
  });

  it("labels an automatically chosen bill source on the overdue card and its list, with the Settings hint", async () => {
    const AR = card("AR_OVERDUE", {
      label: "Receivables overdue",
      severity: "high",
      count: 1,
      amount: "700.0000",
      source: "party_ledger",
      source_automatic: true,
      note: "Chosen automatically (no AR/AP source set in Settings): the party ledger when it is switched on, else outstanding bills.",
    });
    h.api.getControlTower.mockResolvedValue(tower([AR, GRN]));
    h.api.getExceptions.mockResolvedValue(
      exceptionList(AR, [{ id: 3, reference: "PLB-003", date: "2026-10-01", party: "Buyer A", amount: "700.0000", details: {} }], {
        source: "party_ledger",
        source_automatic: true,
        note: AR.note,
      }),
    );
    renderPage();
    expect(await screen.findByTestId("source-AR_OVERDUE")).toHaveTextContent("Source: Party ledgers (automatic)");
    expect(screen.getByTestId("source-hint-AR_OVERDUE")).toHaveTextContent("Change the bill source in Settings → Configuration → Finance");
    expect(screen.getByTestId("note-AR_OVERDUE")).toHaveTextContent("Chosen automatically");
    // Cards without a bill source show neither.
    expect(screen.queryByTestId("source-GRN_NOT_BILLED")).toBeNull();
    expect(screen.queryByTestId("source-hint-GRN_NOT_BILLED")).toBeNull();
    expect(screen.queryByText(/Choose the bill source/)).toBeNull();

    fireEvent.click(screen.getByTestId("card-AR_OVERDUE"));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("PLB-003");
    const source = within(dialog).getByTestId("exception-source");
    expect(source).toHaveTextContent("Source: Party ledgers (automatic)");
    expect(source).toHaveTextContent("Change the bill source in Settings → Configuration → Finance");
  });

  it("shows a bill source chosen in Settings without '(automatic)' or the hint", async () => {
    const AP = card("AP_OVERDUE", { label: "Payables overdue", severity: "high", count: 1, amount: "50.0000", source: "bill_references", source_automatic: false });
    h.api.getControlTower.mockResolvedValue(tower([AP]));
    h.api.getExceptions.mockResolvedValue(exceptionList(AP, [], { source: "bill_references", source_automatic: false }));
    renderPage();
    expect((await screen.findByTestId("source-AP_OVERDUE")).textContent).toBe("Source: Bill references");
    expect(screen.queryByTestId("source-hint-AP_OVERDUE")).toBeNull();
    fireEvent.click(screen.getByTestId("card-AP_OVERDUE"));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(h.api.getExceptions).toHaveBeenCalled());
    const source = await within(dialog).findByTestId("exception-source");
    expect(source).toHaveTextContent("Source: Bill references");
    expect(source).not.toHaveTextContent("automatic");
    expect(source).not.toHaveTextContent("Change the bill source");
  });

  it("opens a card straight from the address (?exception=)", async () => {
    h.api.getExceptions.mockResolvedValue(exceptionList(GRN, [], { total: 3 }));
    renderPage("/app/finance/home?tab=control-tower&exception=GRN_NOT_BILLED");
    expect(await screen.findByRole("dialog", { name: /GRNs not billed/ })).toBeInTheDocument();
  });

  it("shows an error with a Retry button, then recovers", async () => {
    h.api.getControlTower.mockRejectedValueOnce(Object.assign(new Error("Server exploded"), { status: 500 }));
    renderPage();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Server exploded");
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("card-GRN_NOT_BILLED")).toBeInTheDocument();
  });

  it("explains a missing permission and offers no retry", async () => {
    h.api.getControlTower.mockRejectedValue(Object.assign(new Error("Forbidden"), { status: 403 }));
    renderPage();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("You do not have permission to view the Control Tower.");
    expect(within(alert).queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("Refresh reads the books again", async () => {
    renderPage();
    await screen.findByTestId("card-GRN_NOT_BILLED");
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(h.api.getControlTower).toHaveBeenCalledTimes(2));
  });

  it("says it is switched off, and calls no API, without the flag", async () => {
    h.me = { ...CT_ME, feature_flags: { finance_control_tower_v2: "true" } };
    renderPage();
    expect(await screen.findByText("The Finance Control Tower is switched off")).toBeInTheDocument();
    expect(h.api.getControlTower).not.toHaveBeenCalled();
  });
});
