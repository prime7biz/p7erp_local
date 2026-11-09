import { saveBlob } from "@/lib/fileSave";

function timestampForFilename(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}${mm}${dd}_${hh}${mi}`;
}

export function datedFilename(baseName: string, extension: "csv" | "txt" = "csv"): string {
  return `${baseName}_${timestampForFilename(new Date())}.${extension}`;
}

export function downloadCsv(csvContent: string, baseName: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  void saveBlob(blob, datedFilename(baseName, "csv"));
}

/** Save a file the API returned (fetched with auth headers via `requestBlob`). */
export function downloadBlob(blob: Blob, baseName: string, extension: "csv" | "txt" = "csv"): void {
  void saveBlob(blob, datedFilename(baseName, extension));
}

type XlsxCell = string | number | null | undefined;

/**
 * Native Excel export for report pages (numbers stay numeric). The writer library is
 * loaded only when someone exports, so it does not grow the main bundle.
 */
export async function downloadXlsx(headers: string[], rows: XlsxCell[][], baseName: string): Promise<void> {
  const { default: writeXlsxFile } = await import("write-excel-file");
  const data = [
    headers.map((h) => ({ value: h, fontWeight: "bold" as const })),
    ...rows.map((line) =>
      line.map((v) =>
        v == null || v === "" ? null : typeof v === "number" ? { value: v, type: Number } : { value: String(v), type: String },
      ),
    ),
  ];
  const blob = await writeXlsxFile(data, {});
  await saveBlob(blob, `${baseName}_${timestampForFilename(new Date())}.xlsx`);
}

export function printCurrentPage(): void {
  window.print();
}
