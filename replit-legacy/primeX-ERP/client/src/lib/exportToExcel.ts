import * as XLSX from "xlsx";

export interface ExportColumn {
  key: string;
  header: string;
}

export function exportToExcel(
  data: any[],
  columns: ExportColumn[],
  filename: string,
  format: "xlsx" | "csv" = "xlsx"
) {
  const headers = columns.map((c) => c.header);
  const rows = data.map((row) =>
    columns.map((col) => {
      const keys = col.key.split(".");
      let value: any = row;
      for (const k of keys) {
        value = value?.[k];
      }
      if (value === null || value === undefined) return "";
      return value;
    })
  );

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  const colWidths = columns.map((col, i) => {
    const maxLen = Math.max(
      col.header.length,
      ...rows.map((r) => String(r[i] ?? "").length)
    );
    return { wch: Math.min(maxLen + 2, 50) };
  });
  ws["!cols"] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Data");

  const ext = format === "csv" ? "csv" : "xlsx";
  const bookType = format === "csv" ? "csv" : "xlsx";
  XLSX.writeFile(wb, `${filename}.${ext}`, { bookType });
}
