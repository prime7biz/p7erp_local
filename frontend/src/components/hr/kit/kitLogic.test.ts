import { describe, expect, it } from "vitest";
import { splitRowActions } from "./rowActions";
import { filterRows, nextSort, sortRows, toCsv, type HrTableColumn } from "./tableLogic";

type Row = { name: string; amount: string | null; status: string };
const rows: Row[] = [
  { name: "Rahima Akter", amount: "1200.50", status: "PENDING" },
  { name: "Karim Mia", amount: "-50", status: "APPROVED" },
  { name: "=HYPERLINK(evil)", amount: null, status: "PENDING" },
  { name: "Sumi, Begum", amount: "900", status: "APPROVED" },
];
const columns: HrTableColumn<Row>[] = [
  { key: "name", header: "Name", render: (r) => r.name, value: (r) => r.name },
  { key: "amount", header: "Amount", render: (r) => r.amount, value: (r) => r.amount },
  { key: "status", header: "Status", render: (r) => r.status, value: (r) => r.status },
  { key: "avatar", header: "Pic", render: () => null },
];

describe("tableLogic", () => {
  it("searches every word across searchable columns, case-insensitive", () => {
    expect(filterRows(rows, columns, "rahima pending").map((r) => r.name)).toEqual(["Rahima Akter"]);
    expect(filterRows(rows, columns, "approved").length).toBe(2);
    expect(filterRows(rows, columns, "  ")).toBe(rows);
  });

  it("sorts numbers numerically, keeps empty values last in both directions", () => {
    const asc = sortRows(rows, columns, { key: "amount", dir: "asc" }).map((r) => r.amount);
    expect(asc).toEqual(["-50", "900", "1200.50", null]);
    const desc = sortRows(rows, columns, { key: "amount", dir: "desc" }).map((r) => r.amount);
    expect(desc).toEqual(["1200.50", "900", "-50", null]);
  });

  it("cycles sort: asc → desc → off", () => {
    expect(nextSort(null, "name")).toEqual({ key: "name", dir: "asc" });
    expect(nextSort({ key: "name", dir: "asc" }, "name")).toEqual({ key: "name", dir: "desc" });
    expect(nextSort({ key: "name", dir: "desc" }, "name")).toBeNull();
    expect(nextSort({ key: "name", dir: "desc" }, "amount")).toEqual({ key: "amount", dir: "asc" });
  });

  it("exports CSV with BOM, quotes commas, neutralises formulas and keeps negative amounts", () => {
    const csv = toCsv(columns, rows);
    expect(csv.startsWith("\uFEFFName,Amount,Status\r\n")).toBe(true);
    expect(csv).toContain("Karim Mia,-50,APPROVED");
    expect(csv).toContain("'=HYPERLINK(evil),,PENDING");
    expect(csv).toContain('"Sumi, Begum",900,APPROVED');
    expect(csv).not.toContain("Pic");
    const spaced = toCsv(columns, [{ name: "  =cmd()", amount: "1", status: "x" }]);
    expect(spaced).toContain("'  =cmd()");
  });
});

describe("splitRowActions (hybrid: max two visible, destructive always in the menu)", () => {
  it("shows at most two primary actions and moves the rest to the menu", () => {
    const { visible, menu } = splitRowActions([
      { key: "approve", label: "Approve", primary: true },
      { key: "reject", label: "Reject", primary: true },
      { key: "view", label: "View", primary: true },
      { key: "edit", label: "Edit" },
    ]);
    expect(visible.map((a) => a.key)).toEqual(["approve", "reject"]);
    expect(menu.map((a) => a.key)).toEqual(["view", "edit"]);
  });

  it("never shows a danger action as a visible button", () => {
    const { visible, menu } = splitRowActions([
      { key: "delete", label: "Delete", primary: true, danger: true },
      { key: "edit", label: "Edit", primary: true },
    ]);
    expect(visible.map((a) => a.key)).toEqual(["edit"]);
    expect(menu.map((a) => a.key)).toEqual(["delete"]);
  });
});
