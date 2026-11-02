import { describe, expect, it } from "vitest";
import { buildCsv } from "./exportRows";
import type { GridColumn } from "./types";

type Row = { name: string; qty: number | null };

const columns: GridColumn<Row>[] = [
  { id: "name", header: "Name", cell: (r) => r.name, value: (r) => r.name },
  { id: "qty", header: "Qty", cell: (r) => r.qty, value: (r) => r.qty },
  { id: "actions", header: "Actions", cell: () => null, noExport: true },
];

describe("buildCsv", () => {
  it("starts with a BOM, escapes quotes/commas/newlines and skips noExport columns", () => {
    const csv = buildCsv(columns, [
      { name: 'Rahim "RMG", Ltd\nDhaka', qty: 12 },
      { name: "ঢাকা", qty: null },
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe('Name,Qty\r\n"Rahim ""RMG"", Ltd\nDhaka",12\r\nঢাকা,');
  });
});
