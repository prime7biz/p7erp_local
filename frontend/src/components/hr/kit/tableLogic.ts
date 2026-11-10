import type { ReactNode } from "react";

export type CellValue = string | number | boolean | null | undefined;

export interface HrTableColumn<T> {
  key: string;
  header: string;
  /** What the cell shows. */
  render: (row: T) => ReactNode;
  /** Plain value used for search, sorting and CSV export. Columns without it are display-only. */
  value?: (row: T) => CellValue;
  sortable?: boolean;
  align?: "left" | "right" | "center";
  /** Leave out of the phone card view (keep cards short). */
  hideOnMobile?: boolean;
  /** Leave out of CSV export (e.g. avatars, buttons). */
  noExport?: boolean;
}

export type SortState = { key: string; dir: "asc" | "desc" } | null;

const text = (v: CellValue) => (v == null ? "" : String(v));

/** Keep rows where any searchable column contains every typed word (case-insensitive). */
export function filterRows<T>(rows: T[], columns: HrTableColumn<T>[], query: string): T[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return rows;
  const searchable = columns.filter((c) => c.value);
  return rows.filter((row) => {
    const hay = searchable.map((c) => text(c.value!(row)).toLowerCase()).join(" \u0001 ");
    return words.every((w) => hay.includes(w));
  });
}

function compare(a: CellValue, b: CellValue): number {
  if (a == null || a === "") return b == null || b === "" ? 0 : 1;
  if (b == null || b === "") return -1;
  const na = typeof a === "number" ? a : Number(a);
  const nb = typeof b === "number" ? b : Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && String(a).trim() !== "" && String(b).trim() !== "") return na - nb;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

/** Stable sort by one column; empty values always go last. */
export function sortRows<T>(rows: T[], columns: HrTableColumn<T>[], sort: SortState): T[] {
  if (!sort) return rows;
  const col = columns.find((c) => c.key === sort.key);
  if (!col?.value) return rows;
  const get = col.value;
  const sign = sort.dir === "asc" ? 1 : -1;
  return rows
    .map((row, i) => ({ row, i }))
    .sort((x, y) => {
      const a = get(x.row);
      const b = get(y.row);
      const emptyA = a == null || a === "";
      const emptyB = b == null || b === "";
      if (emptyA || emptyB) return emptyA === emptyB ? x.i - y.i : emptyA ? 1 : -1;
      return compare(a, b) * sign || x.i - y.i;
    })
    .map((x) => x.row);
}

export function nextSort(current: SortState, key: string): SortState {
  if (!current || current.key !== key) return { key, dir: "asc" };
  return current.dir === "asc" ? { key, dir: "desc" } : null;
}

function csvCell(v: CellValue): string {
  const s = text(v);
  // Formula-looking text is prefixed so Excel does not run it; plain negative numbers stay as they are.
  const isNumber = typeof v === "number" || /^-?\d+(\.\d+)?$/.test(s);
  // Some spreadsheet apps trim leading spaces before evaluating, so check the trimmed text.
  const safe = !isNumber && /^[=+\-@]/.test(s.trimStart()) ? `'${s}` : !isNumber && /^[\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** CSV with a UTF-8 BOM so Excel shows Bangla text correctly. */
export function toCsv<T>(columns: HrTableColumn<T>[], rows: T[]): string {
  const cols = columns.filter((c) => c.value && !c.noExport);
  const lines = [cols.map((c) => csvCell(c.header)).join(",")];
  for (const row of rows) lines.push(cols.map((c) => csvCell(c.value!(row))).join(","));
  return `\uFEFF${lines.join("\r\n")}`;
}
