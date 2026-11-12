import { beforeEach, describe, expect, it, vi } from "vitest";

const saveBlob = vi.fn<(blob: Blob, name: string) => Promise<void>>(async () => undefined);
vi.mock("@/lib/fileSave", () => ({ saveBlob: (blob: Blob, name: string) => saveBlob(blob, name) }));

import { buildCsv, exportXlsx } from "./exportRows";
import type { GridColumn } from "./types";

type Row = { code: string; qty: number; note: string | null };

const columns = [
  { key: "code", header: "Code", value: (r: Row) => r.code },
  { key: "qty", header: "Qty", value: (r: Row) => r.qty },
  { key: "note", header: "Note", value: (r: Row) => r.note },
] as unknown as GridColumn<Row>[];

const rows: Row[] = [
  { code: "A-1", qty: 12.5, note: "first" },
  { code: "B-2", qty: 3, note: null },
];

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await new Response(blob).arrayBuffer());
}

describe("data grid export", () => {
  beforeEach(() => saveBlob.mockClear());

  it("builds CSV with a BOM and quoted cells", () => {
    const csv = buildCsv(columns, [{ code: 'Say "hi"', qty: 1, note: "a,b" }]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"Say ""hi""",1,"a,b"');
  });

  it("writes a real .xlsx file through the browser writer", async () => {
    await exportXlsx(columns, rows, "items");
    expect(saveBlob).toHaveBeenCalledTimes(1);
    const call = saveBlob.mock.calls[0];
    expect(call).toBeDefined();
    const [blob, name] = call!;
    expect(name).toBe("items.xlsx");
    const bytes = await blobBytes(blob);
    expect(bytes.length).toBeGreaterThan(100);
    // .xlsx is a zip archive: it starts with the "PK" signature.
    expect(String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0)).toBe("PK");
  });
});
