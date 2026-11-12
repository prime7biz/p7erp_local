// @vitest-environment jsdom
import "./domMatchers";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  me: { role_name: "manager" } as Record<string, unknown>,
  getStatementClass: vi.fn(),
  setStatementClass: vi.fn(),
  getStockNature: vi.fn(),
  setStockNature: vi.fn(),
}));

vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ me: h.me }) }));
vi.mock("@/api/financeStatements", () => ({
  financeStatementsApi: {
    getStatementClass: h.getStatementClass,
    setStatementClass: h.setStatementClass,
    getStockNature: h.getStockNature,
    setStockNature: h.setStockNature,
  },
}));

import { StatementClassField } from "./StatementClassField";
import { StockNatureField } from "./StockNatureField";
import { classLabel } from "./statementClassLogic";

const state = (extra: Record<string, unknown> = {}) => ({
  group_id: 5, name: "Sales Accounts", parent_group_id: null, statement_class: null, effective_class: null,
  inherited_from_group_id: null, allowed_classes: ["SALES", "PURCHASE"], proposed_class: null,
  affected_group_count: 0, affected_ledger_count: 0, affected_groups: [], reports: [], ...extra,
});

beforeEach(() => {
  h.me = { role_name: "manager" };
  for (const fn of [h.getStatementClass, h.setStatementClass, h.getStockNature, h.setStockNature]) fn.mockReset();
});
afterEach(cleanup);

describe("StatementClassField", () => {
  it("previews the change, then saves it", async () => {
    h.getStatementClass
      .mockResolvedValueOnce(state())
      .mockResolvedValueOnce(state({ proposed_class: "SALES", affected_group_count: 3, affected_ledger_count: 9, reports: ["pl", "tb"] }));
    h.setStatementClass.mockResolvedValue(state({ statement_class: "SALES", effective_class: "SALES" }));
    const onSaved = vi.fn();
    render(<StatementClassField groupId={5} onSaved={onSaved} />);

    const select = (await screen.findByRole("combobox")) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "SALES" } });
    expect(await screen.findByTestId("class-preview")).toHaveTextContent("Affects 3 group(s) and 9 ledger(s)");
    expect(h.getStatementClass).toHaveBeenLastCalledWith(5, "SALES");

    fireEvent.click(screen.getByRole("button", { name: "Save statement class" }));
    expect(await screen.findByText("Statement class saved.")).toBeInTheDocument();
    expect(h.setStatementClass).toHaveBeenCalledWith(5, "SALES");
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("effective-class")).toHaveTextContent(classLabel("SALES"));
  });

  it("shows the permission message and reverts the choice on a 403", async () => {
    h.getStatementClass.mockResolvedValue(state());
    h.setStatementClass.mockRejectedValue(Object.assign(new Error("Forbidden"), { status: 403 }));
    render(<StatementClassField groupId={5} />);
    const select = (await screen.findByRole("combobox")) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "PURCHASE" } });
    fireEvent.click(await screen.findByRole("button", { name: "Save statement class" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Only a manager or admin can change the statement class.");
    await waitFor(() => expect(select.value).toBe(""));
  });

  it("is read only for a normal user", async () => {
    h.me = { role_name: "accountant" };
    h.getStatementClass.mockResolvedValue(state({ statement_class: "SALES", effective_class: "SALES" }));
    render(<StatementClassField groupId={5} />);
    const select = (await screen.findByRole("combobox")) as HTMLSelectElement;
    expect(select).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save statement class" })).toBeNull();
    expect(screen.getByText(/Read only/)).toBeInTheDocument();
  });
});

describe("StockNatureField", () => {
  const nature = (extra: Record<string, unknown> = {}) => ({
    group_id: 8, name: "Fabric", parent_id: null, stock_nature: null, effective_nature: null,
    inherited_from_group_id: null, allowed_natures: ["RAW_MATERIAL", "FINISHED_GOODS"], ...extra,
  });

  it("saves a stock nature", async () => {
    h.getStockNature.mockResolvedValue(nature());
    h.setStockNature.mockResolvedValue(nature({ stock_nature: "RAW_MATERIAL", effective_nature: "RAW_MATERIAL" }));
    render(<StockNatureField groupId={8} />);
    const select = (await screen.findByRole("combobox")) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "RAW_MATERIAL" } });
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));
    await waitFor(() => expect(h.setStockNature).toHaveBeenCalledWith(8, "RAW_MATERIAL"));
  });

  it("explains a 403 and keeps the old value", async () => {
    h.getStockNature.mockResolvedValue(nature());
    h.setStockNature.mockRejectedValue(Object.assign(new Error("Forbidden"), { status: 403 }));
    render(<StockNatureField groupId={8} />);
    const select = (await screen.findByRole("combobox")) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "FINISHED_GOODS" } });
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/manager or admin/);
    await waitFor(() => expect(select.value).toBe(""));
  });
});
