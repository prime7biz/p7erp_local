import type { GridColumn } from "./types";

type Cell = string | number | null | undefined;

function exportMatrix<T>(columns: GridColumn<T>[], rows: T[]): { headers: string[]; body: Cell[][] } {
  const cols = columns.filter((c) => !c.noExport && c.value);
  return {
    headers: cols.map((c) => c.header),
    body: rows.map((r) => cols.map((c) => c.value!(r))),
  };
}

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function csvCell(v: Cell): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV text with a UTF-8 BOM so Excel opens Bangla and other non-Latin text correctly. */
export function buildCsv<T>(columns: GridColumn<T>[], rows: T[]): string {
  const { headers, body } = exportMatrix(columns, rows);
  return "\uFEFF" + [headers, ...body].map((line) => line.map(csvCell).join(",")).join("\r\n");
}

export function exportCsv<T>(columns: GridColumn<T>[], rows: T[], baseName: string) {
  download(new Blob([buildCsv(columns, rows)], { type: "text/csv;charset=utf-8" }), `${baseName}.csv`);
}

/** Native .xlsx (numbers stay numeric); the writer is loaded only when someone exports. */
export async function exportXlsx<T>(columns: GridColumn<T>[], rows: T[], baseName: string) {
  const { headers, body } = exportMatrix(columns, rows);
  const { default: writeXlsxFile } = await import("write-excel-file");
  const data = [
    headers.map((h) => ({ value: h, fontWeight: "bold" as const })),
    ...body.map((line) =>
      line.map((v) =>
        v == null || v === "" ? null : typeof v === "number" ? { value: v, type: Number } : { value: String(v), type: String },
      ),
    ),
  ];
  await writeXlsxFile(data, { fileName: `${baseName}.xlsx` });
}
