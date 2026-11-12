// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("./SavedViewsMenu", () => ({ SavedViewsMenu: () => null }));

import { DataGrid } from "./DataGrid";
import { splitCardColumns } from "./cardColumns";
import type { GridColumn } from "./types";

type Row = { id: number; code: string; customer: string; qty: number; status: string; note: string };

const rows: Row[] = [
  { id: 1, code: "ORD-B", customer: "Beta", qty: 20, status: "DRAFT", note: "n1" },
  { id: 2, code: "ORD-A", customer: "Alpha", qty: 50, status: "ACTIVE", note: "n2" },
];

const columns: GridColumn<Row>[] = [
  { id: "code", header: "Code", cell: (r) => <a href={`/app/orders/${r.id}`}>{r.code}</a>, value: (r) => r.code, alwaysVisible: true, mobile: "title" },
  { id: "customer", header: "Customer", cell: (r) => r.customer, value: (r) => r.customer, mobile: "subtitle" },
  { id: "status", header: "Status", cell: (r) => r.status, value: (r) => r.status, mobile: "status" },
  { id: "qty", header: "Qty", cell: (r) => r.qty, value: (r) => r.qty, mobile: "detail" },
  { id: "note", header: "Note", cell: (r) => r.note, value: (r) => r.note },
  { id: "actions", header: "Actions", cell: (r) => <button type="button">Actions {r.code}</button>, alwaysVisible: true, noExport: true, mobile: "actions" },
];

let phone = true;
let listeners: Array<() => void> = [];

function setPhone(next: boolean) {
  phone = next;
  act(() => listeners.forEach((fn) => fn()));
}

beforeEach(() => {
  phone = true;
  listeners = [];
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    get matches() {
      return query.includes("767px") ? phone : false;
    },
    media: query,
    addEventListener: (_: string, fn: () => void) => listeners.push(fn),
    removeEventListener: (_: string, fn: () => void) => {
      listeners = listeners.filter((l) => l !== fn);
    },
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function renderGrid(props: Partial<Parameters<typeof DataGrid<Row>>[0]> = {}) {
  return render(
    <DataGrid<Row> tableKey="test.orders" columns={columns} rows={rows} getRowId={(r) => r.id} mobileCards {...props} />,
  );
}

describe("DataGrid phone cards", () => {
  it("keeps the table when mobileCards is off, even on a phone", () => {
    renderGrid({ mobileCards: false });
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "List layout" })).toBeNull();
  });

  it("starts on cards on a phone and shows title, subtitle, status, details, more details and actions", () => {
    renderGrid();
    expect(screen.queryByRole("table")).toBeNull();
    const cards = screen.getAllByRole("listitem");
    expect(cards).toHaveLength(2);
    const first = within(cards[0]!);
    expect(first.getByRole("link", { name: "ORD-B" }).getAttribute("href")).toBe("/app/orders/1");
    expect(first.getByText("Beta")).toBeTruthy();
    expect(first.getByText("DRAFT")).toBeTruthy();
    expect(first.getByText("Qty")).toBeTruthy();
    expect(first.getByText("More details")).toBeTruthy();
    expect(first.getByRole("button", { name: "Actions ORD-B" })).toBeTruthy();
  });

  it("switches to the table, remembers the choice for this list only", async () => {
    renderGrid();
    await userEvent.click(screen.getByRole("button", { name: "Table" }));
    expect(screen.getByRole("table")).toBeTruthy();
    expect(localStorage.getItem("p7_list_view:test.orders")).toBe("table");
    cleanup();
    renderGrid();
    expect(screen.getByRole("table")).toBeTruthy();
    cleanup();
    render(<DataGrid<Row> tableKey="other.list" columns={columns} rows={rows} getRowId={(r) => r.id} mobileCards />);
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("does not save a preference just by opening the page (desktop visits never change the phone default)", () => {
    phone = false;
    renderGrid();
    expect(screen.getByRole("table")).toBeTruthy();
    expect(localStorage.getItem("p7_list_view:test.orders")).toBeNull();
  });

  it("follows rotation / resizing without reloading", () => {
    renderGrid();
    expect(screen.queryByRole("table")).toBeNull();
    setPhone(false);
    expect(screen.getByRole("table")).toBeTruthy();
    setPhone(true);
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("sorts cards with the sort picker", async () => {
    renderGrid();
    await userEvent.selectOptions(screen.getByLabelText("Sort cards by"), "code:asc");
    const titles = screen.getAllByRole("listitem").map((li) => within(li).getByRole("link").textContent);
    expect(titles).toEqual(["ORD-A", "ORD-B"]);
  });

  it("selects cards one by one or all visible, and runs bulk actions on them", async () => {
    const bulk = vi.fn();
    renderGrid({
      bulkActions: (selected) => (
        <button type="button" onClick={() => bulk(selected.map((r) => r.code))}>
          Approve selected
        </button>
      ),
    });
    await userEvent.click(within(screen.getAllByRole("listitem")[0]!).getByRole("checkbox", { name: "Select row" }));
    expect(screen.getByText("1 selected")).toBeTruthy();
    await userEvent.click(screen.getByRole("checkbox", { name: "Select all visible" }));
    expect(screen.getByText("2 selected")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Approve selected" }));
    expect(bulk).toHaveBeenCalledWith(["ORD-B", "ORD-A"]);
  });

  it("shows the empty state and loading state in card mode", () => {
    renderGrid({ rows: [], emptyState: <p>No orders yet</p> });
    expect(screen.getByText("No orders yet")).toBeTruthy();
    cleanup();
    renderGrid({ loading: true });
    expect(screen.getByLabelText("Loading")).toBeTruthy();
  });
});

describe("splitCardColumns", () => {
  it("keeps title and actions even when the user hid them, and respects hidden other columns", () => {
    const out = splitCardColumns(columns, { code: false, actions: false, qty: false, note: false });
    expect(out.title.map((c) => c.id)).toEqual(["code"]);
    expect(out.actions.map((c) => c.id)).toEqual(["actions"]);
    expect(out.detail).toHaveLength(0);
    expect(out.more).toHaveLength(0);
  });

  it("uses the first column as the title when none is marked", () => {
    const plain: GridColumn<Row>[] = [
      { id: "a", header: "A", cell: (r) => r.code },
      { id: "b", header: "B", cell: (r) => r.customer },
    ];
    const out = splitCardColumns(plain, {});
    expect(out.title.map((c) => c.id)).toEqual(["a"]);
    expect(out.more.map((c) => c.id)).toEqual(["b"]);
  });
});
